import { NextRequest, NextResponse } from 'next/server'
import { findPersonalOrderLinkBySlug, trackLinkEvent } from '@/lib/personal-order-link'

// 개인 오더 링크 분석 이벤트 기록. 개인정보는 받지도, 저장하지도 않습니다.

const ALLOWED = new Set(['page_view', 'quote_start', 'category_selected', 'photo_added'])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const eventType = String(body.eventType ?? '')
    if (!ALLOWED.has(eventType)) {
      return NextResponse.json({ error: 'invalid event' }, { status: 400 })
    }

    const link = await findPersonalOrderLinkBySlug(body.slug)
    if (!link) return NextResponse.json({ ok: true })

    await trackLinkEvent({
      linkId: link.id,
      eventType: eventType as 'page_view' | 'quote_start' | 'category_selected' | 'photo_added',
      anonymousSessionId: body.sessionId ? String(body.sessionId).slice(0, 64) : null,
      utmSource: body.utmSource ? String(body.utmSource).slice(0, 64) : null,
      utmMedium: body.utmMedium ? String(body.utmMedium).slice(0, 64) : null,
      utmCampaign: body.utmCampaign ? String(body.utmCampaign).slice(0, 64) : null,
      referrerDomain: body.referrerDomain ? String(body.referrerDomain).slice(0, 128) : null,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
