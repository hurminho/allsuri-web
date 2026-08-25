import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseInterviewResult,
  composeLocalFinalOrder,
  type InterviewAnswer,
  type InterviewResult,
} from '@/lib/ai-order'
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
}

export async function POST(req: NextRequest) {
  const started = Date.now()
  const body = (await req.json().catch(() => ({}))) as Body
  const initialText = String(body.initialText || '').trim()
  const answers = Array.isArray(body.answers) ? body.answers : []
  const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls.filter((u) => typeof u === 'string') : []
  const sessionId = body.sessionId || crypto.randomUUID()

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
    }, 'local_no_key')
  }

  const userPrompt = buildUserPrompt({
    initialText,
    answers: answers.slice(0, 5),
    photoNotes: photoUrls.length ? `사진 ${photoUrls.length}장 첨부됨` : undefined,
  })

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
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
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
      }, 'local_openai_error')
    }
    const json = await resp.json() as { choices?: { message?: { content?: string } }[] }
    const rawText = json.choices?.[0]?.message?.content || '{}'
    let parsed: unknown = {}
    try { parsed = JSON.parse(rawText) } catch { parsed = {} }
    const analysis = parseInterviewResult({ ...(parsed as object), readyToFinalize: true })
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
    return finalizeResponse(sessionId, initialText, started, answers, analysis, model)
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
    }, 'local_exception')
  }
}

function finalizeResponse(
  sessionId: string,
  initialText: string,
  started: number,
  answers: InterviewAnswer[],
  analysis: InterviewResult,
  source: string,
) {
  void persistSession(sessionId, initialText, answers, analysis)
  console.log('[ai-order]', {
    session_id: sessionId,
    latency: Date.now() - started,
    question_count: answers.length,
    ready_to_finalize: true,
    source,
  })
  return NextResponse.json({
    sessionId,
    readyToFinalize: true,
    analysis,
    nextQuestion: null,
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
