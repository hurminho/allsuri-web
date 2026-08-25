import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseInterviewResult,
  type InterviewAnswer,
} from '@/lib/ai-order'

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

  const openaiKey = process.env.OPENAI_API_KEY || ''
  const model = process.env.OPENAI_ORDER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
  if (!openaiKey) {
    console.warn('[ai-order] OPENAI_API_KEY missing', { session_id: sessionId })
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 })
  }

  const userPrompt = buildUserPrompt({
    initialText,
    answers: answers.slice(0, 5),
    photoNotes: photoUrls.length ? `사진 ${photoUrls.length}장 첨부됨` : undefined,
  })

  const content: Array<Record<string, unknown>> = [{ type: 'text', text: userPrompt }]
  for (const url of photoUrls.slice(0, 3)) {
    content.push({ type: 'image_url', image_url: { url } })
  }

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: photoUrls.length ? content : userPrompt },
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
      })
      return NextResponse.json({ error: 'ai_unavailable', detail: detail.slice(0, 200) }, { status: 502 })
    }
    const json = await resp.json() as { choices?: { message?: { content?: string } }[] }
    const rawText = json.choices?.[0]?.message?.content || '{}'
    let parsed: unknown = {}
    try { parsed = JSON.parse(rawText) } catch { parsed = {} }
    const analysis = parseInterviewResult(parsed)
    if (answers.length >= 5 && !analysis.readyToFinalize) {
      analysis.readyToFinalize = true
    }

    await persistSession(sessionId, initialText, answers, analysis).catch(() => {})

    console.log('[ai-order]', {
      session_id: sessionId,
      model,
      latency: Date.now() - started,
      question_count: answers.length,
      ready_to_finalize: analysis.readyToFinalize,
    })

    return NextResponse.json({
      sessionId,
      readyToFinalize: analysis.readyToFinalize,
      analysis,
      nextQuestion: analysis.nextQuestion || null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[ai-order] exception', { session_id: sessionId, error: msg, latency: Date.now() - started })
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 })
  }
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
