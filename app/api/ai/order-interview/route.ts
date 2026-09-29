import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import {
  CATEGORIES,
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseInterviewResult,
  composeLocalFinalOrder,
  type InterviewAnswer,
  type InterviewResult,
} from '@/lib/ai-order'
import {
  STRUCTURE_SYSTEM_PROMPT,
  buildStructurePrompt,
  parseStructuredIntake,
  type StructuredIntake,
} from '@/lib/ai-structure'
import {
  estimatePrice,
  fetchPriceCatalog,
  type PriceCatalog,
  type PriceEstimateResponse,
} from '@/lib/price-engine'
import {
  inferCategory,
  nextScriptQuestion,
  shouldFinalizeInterview,
} from '@/lib/ai-interview-script'
import { openaiConfig } from '@/lib/openai-config'

export const runtime = 'nodejs'

type Body = {
  sessionId?: string
  initialText?: string
  answers?: InterviewAnswer[]
  photoUrls?: string[]
  address?: string
}

/** 클라이언트가 확인 화면에서 바로 쓰는 카탈로그 조각(추가 왕복 없이 select 를 그리기 위함). */
type CatalogPayload = Pick<PriceCatalog, 'trades' | 'questions' | 'enums'>

export async function POST(req: NextRequest) {
  const started = Date.now()
  const body = (await req.json().catch(() => ({}))) as Body
  const initialText = String(body.initialText || '').trim()
  const answers = Array.isArray(body.answers) ? body.answers : []
  const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls.filter((u) => typeof u === 'string') : []
  const sessionId = body.sessionId || crypto.randomUUID()
  const address = String(body.address || '').trim()

  if (initialText.length < 5 || initialText.length > 500) {
    return NextResponse.json({ error: '한 줄 설명은 5~500자로 입력해 주세요.' }, { status: 400 })
  }

  const category = inferCategory(initialText)

  if (!shouldFinalizeInterview(initialText, answers)) {
    const nextQuestion = nextScriptQuestion(initialText, answers)
    const analysis: InterviewResult = {
      readyToFinalize: false,
      summary: initialText,
      categoryCandidates: [{ category, confidence: 0.7 }],
      knownFacts: answers.map((a) => `${a.question} ${a.answer}`),
      missingInformation: nextQuestion ? [nextQuestion.question] : [],
      nextQuestion: nextQuestion || undefined,
    }
    void persistSession(sessionId, initialText, answers, analysis)
    console.log('[ai-order]', {
      session_id: sessionId,
      latency: Date.now() - started,
      question_count: answers.length,
      ready_to_finalize: false,
      source: 'script',
    })
    return NextResponse.json({
      sessionId,
      readyToFinalize: false,
      analysis,
      nextQuestion: nextQuestion || null,
    })
  }

  // ── 마무리 단계 ──────────────────────────────────────────────────────
  // 가격 카탈로그는 5분 캐시라 대부분 즉시 반환됩니다. 실패해도 null 로 흘러갑니다.
  const catalog = await fetchPriceCatalog()

  const fallback = composeLocalFinalOrder(initialText, answers, category)
  const { apiKey: openaiKey, model, configured } = openaiConfig()
  if (!configured) {
    return finalizeResponse(sessionId, initialText, started, answers, {
      readyToFinalize: true,
      summary: fallback.title,
      categoryCandidates: [{ category, confidence: 0.5 }],
      knownFacts: answers.map((a) => a.answer),
      missingInformation: fallback.unknownItems,
      finalOrder: fallback,
    }, 'local_no_key', { catalog, structured: null, address })
  }

  const userPrompt = [
    buildUserPrompt({
      initialText,
      answers: answers.slice(0, 5),
      photoNotes: photoUrls.length ? `사진 ${photoUrls.length}장 첨부됨` : undefined,
    }),
    '',
    buildStructurePrompt({
      initialText,
      answers: answers.slice(0, 5),
      photoCount: photoUrls.length,
      allowedCategories: catalog?.categories ?? [...CATEGORIES],
      allowedSubcategories: Array.from(new Set((catalog?.trades ?? []).map((t) => t.subcategory))),
    }),
    '위 두 요구사항을 하나의 JSON 객체로 합쳐서 반환하라. 금액·가격·견적가는 어떤 키에도 넣지 마라.',
  ].join('\n')

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n${STRUCTURE_SYSTEM_PROMPT}` },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
    if (!resp.ok) {
      const detail = await resp.text()
      console.warn('[ai-order] openai error', {
        session_id: sessionId,
        model,
        status: resp.status,
        latency: Date.now() - started,
        detail: detail.slice(0, 200),
      })
      return finalizeResponse(sessionId, initialText, started, answers, {
        readyToFinalize: true,
        summary: fallback.title,
        categoryCandidates: [{ category, confidence: 0.5 }],
        knownFacts: answers.map((a) => a.answer),
        missingInformation: fallback.unknownItems,
        finalOrder: fallback,
      }, 'local_openai_error', { catalog, structured: null, address })
    }
    const json = await resp.json() as { choices?: { message?: { content?: string } }[] }
    const rawText = json.choices?.[0]?.message?.content || '{}'
    let parsed: unknown = {}
    try { parsed = JSON.parse(rawText) } catch { parsed = {} }
    const analysis = parseInterviewResult({ ...(parsed as object), readyToFinalize: true })
    // 같은 JSON 객체에서 구조화 정보를 뽑습니다(추가 OpenAI 호출 없음).
    let structured: StructuredIntake | null = null
    try {
      structured = parseStructuredIntake(parsed, catalog)
    } catch (e: unknown) {
      console.warn('[ai-order] structure parse 실패', { session_id: sessionId, error: e instanceof Error ? e.message : String(e) })
      structured = null
    }
    const aiDesc = analysis.finalOrder?.description?.trim() || ''
    const tooThin = !aiDesc || aiDesc === initialText.trim() || aiDesc.length < Math.max(80, initialText.length + 50)
    if (tooThin) {
      analysis.finalOrder = {
        ...fallback,
        ...analysis.finalOrder,
        description: fallback.description,
        contractorCheckpoints: analysis.finalOrder?.contractorCheckpoints?.length
          ? analysis.finalOrder.contractorCheckpoints
          : fallback.contractorCheckpoints,
      }
    }
    analysis.readyToFinalize = true
    analysis.finalOrder = analysis.finalOrder || fallback
    return finalizeResponse(sessionId, initialText, started, answers, analysis, model, {
      catalog,
      structured,
      address,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[ai-order] exception', { session_id: sessionId, error: msg, latency: Date.now() - started })
    return finalizeResponse(sessionId, initialText, started, answers, {
      readyToFinalize: true,
      summary: fallback.title,
      categoryCandidates: [{ category, confidence: 0.5 }],
      knownFacts: answers.map((a) => a.answer),
      missingInformation: fallback.unknownItems,
      finalOrder: fallback,
    }, 'local_exception', { catalog, structured: null, address })
  }
}

/** 접수서의 긴급도를 가격 엔진 urgency 로 옮깁니다. */
function toEngineUrgency(urgency: string | undefined): 'today' | 'normal' {
  if (urgency === 'high') return 'today'
  return 'normal'
}

/**
 * 가격은 전적으로 가격 엔진이 계산합니다. 여기서는 입력만 전달합니다.
 * 실패하면 null 이며, 접수 흐름은 그대로 진행됩니다.
 */
async function priceForFinalize(
  sessionId: string,
  initialText: string,
  answers: InterviewAnswer[],
  analysis: InterviewResult,
  structured: StructuredIntake | null,
  address: string,
): Promise<PriceEstimateResponse | null> {
  const tradeId = structured?.tradeId || null
  const category = structured?.category || analysis.finalOrder?.category || null
  if (!tradeId && !category) return null

  const answerMap: Record<string, string> = {}
  for (const a of answers) {
    if (a?.questionId && a?.answer) answerMap[String(a.questionId)] = String(a.answer)
  }
  const urgency = toEngineUrgency(analysis.finalOrder?.urgency)
  answerMap.urgency = answerMap.urgency || urgency

  return estimatePrice({
    tradeId,
    category,
    subcategory: structured?.subcategory || analysis.finalOrder?.subcategory || null,
    text: [initialText, analysis.finalOrder?.description || ''].filter(Boolean).join('\n').slice(0, 2000),
    address: address || null,
    urgency,
    answers: answerMap,
    sessionId,
  })
}

async function finalizeResponse(
  sessionId: string,
  initialText: string,
  started: number,
  answers: InterviewAnswer[],
  analysis: InterviewResult,
  source: string,
  extra?: { catalog: PriceCatalog | null; structured: StructuredIntake | null; address?: string },
) {
  const catalog = extra?.catalog ?? null
  const structured = extra?.structured ?? null

  let price: PriceEstimateResponse | null = null
  try {
    price = await priceForFinalize(
      sessionId,
      initialText,
      answers,
      analysis,
      structured,
      extra?.address || '',
    )
  } catch (e: unknown) {
    console.warn('[ai-order] price 조회 실패', {
      session_id: sessionId,
      error: e instanceof Error ? e.message : String(e),
    })
    price = null
  }

  void persistSession(sessionId, initialText, answers, analysis)
  console.log('[ai-order]', {
    session_id: sessionId,
    latency: Date.now() - started,
    question_count: answers.length,
    ready_to_finalize: true,
    source,
    price_state: price?.priceState ?? null,
    trade_id: structured?.tradeId ?? price?.trade?.id ?? null,
  })

  const catalogPayload: CatalogPayload | null = catalog
    ? { trades: catalog.trades, questions: catalog.questions, enums: catalog.enums }
    : null

  return NextResponse.json({
    sessionId,
    readyToFinalize: true,
    analysis,
    nextQuestion: null,
    structured,
    price,
    catalog: catalogPayload,
  })
}

async function persistSession(
  id: string,
  initialText: string,
  answers: InterviewAnswer[],
  analysis: unknown,
) {
  const now = new Date().toISOString()
  const row = {
    id,
    initial_text: initialText,
    conversation_data: answers,
    analysis_data: analysis,
    status: (analysis as { readyToFinalize?: boolean }).readyToFinalize ? 'ready' : 'interviewing',
    updated_at: now,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }
  const { error } = await supabaseAdmin.from('ai_order_sessions').upsert(row, { onConflict: 'id' })
  if (error) console.warn('[ai-order] session persist skipped:', error.message)
}
