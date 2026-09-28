import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { splitAddressRegion } from '@/lib/address-region'
import {
  acceptsNewOrders,
  findPersonalOrderLinkBySlug,
  trackLinkEvent,
} from '@/lib/personal-order-link'

// 개인 오더 링크 견적 접수.
// 일반 고객 접수(/api/customer/submit)와 다른 점:
//   1. marketplace_listings 에 등록하지 않습니다 → 다른 사업자에게 노출·입찰 불가
//   2. 배정 사업자를 slug 로 서버에서 조회해 고정합니다 → 클라이언트가 바꿀 수 없음
//   3. 알림은 링크 주인 사업자 1명에게만 보냅니다

const ALLSURIAPP_API_URL = process.env.ALLSURIAPP_API_URL || 'https://api.allsuri.app'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function notifyContractor(
  contractorId: string,
  orderId: string,
  title: string,
  category: string,
  address: string,
) {
  const regionShort = address.split(' ').slice(0, 2).join(' ')
  const notifTitle = '[개인 링크] 새 견적 요청'
  const notifBody = `[${category}] ${title} · ${regionShort}`

  const { error } = await supabaseAdmin.from('notifications').insert({
    userid: contractorId,
    title: notifTitle,
    body: notifBody,
    type: 'personal_link_order',
    isread: false,
    createdat: new Date().toISOString(),
  })
  if (error) console.warn('[personal-link] DB 알림 저장 실패:', error.message)

  if (!SERVICE_ROLE_KEY) return

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(
      `${ALLSURIAPP_API_URL}/.netlify/functions/notifications-send-bulk`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          userIds: [contractorId],
          title: notifTitle,
          body: notifBody,
          data: { type: 'personal_link_order', orderId },
          skipDbInsert: true,
        }),
        signal: controller.signal,
      },
    )
    clearTimeout(timer)
    if (!res.ok) console.warn(`[personal-link] FCM 오류 (${res.status})`)
  } catch (e: unknown) {
    clearTimeout(timer)
    console.warn('[personal-link] FCM 실패/타임아웃:', e instanceof Error ? e.message : String(e))
  }
}

function textOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s ? s : null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      slug,
      title,
      description,
      address,
      addressDetail,
      visitDate,
      category,
      customerName,
      customerPhone,
      customerEmail,
      pin,
      imageUrls,
      privacyConsent,
    } = body

    // ── 1. 링크 검증 (배정 대상은 항상 서버에서 결정) ──────────────
    const link = await findPersonalOrderLinkBySlug(slug)
    if (!link) {
      return NextResponse.json({ error: '존재하지 않는 링크입니다.' }, { status: 404 })
    }
    if (!acceptsNewOrders(link)) {
      return NextResponse.json(
        { error: '현재 이 사업자는 새로운 요청을 받고 있지 않습니다.' },
        { status: 409 },
      )
    }

    // ── 2. 입력 검증 ────────────────────────────────────────────────
    if (!title || !category || !address || !visitDate || !customerName || !customerPhone) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
    }
    if (!pin || !/^\d{4}$/.test(String(pin))) {
      return NextResponse.json({ error: '4자리 숫자 비밀번호가 필요합니다.' }, { status: 400 })
    }
    if (!privacyConsent) {
      return NextResponse.json({ error: '개인정보 제공에 동의해 주세요.' }, { status: 400 })
    }

    const normalizedPhone = String(customerPhone).replace(/[-\s]/g, '')
    const fullAddress = addressDetail ? `${address} ${addressDetail}` : address
    const region = splitAddressRegion(fullAddress)
    const now = new Date().toISOString()

    // ── 3. 주문 저장 (직접 배정 필드는 전부 서버가 채웁니다) ────────
    const { data: orderRow, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        title,
        description: description || '',
        address: fullAddress,
        visitDate,
        status: 'pending',
        category,
        customerName,
        customerPhone: normalizedPhone,
        customerEmail: customerEmail || null,
        isAnonymous: true,
        images: imageUrls || [],
        webPassword: String(pin),
        createdAt: now,
        locationLevel1: region.locationLevel1,
        locationLevel2: region.locationLevel2,
        urgency: textOrNull(body.urgency),
        propertyType: textOrNull(body.propertyType),

        // 개인 링크 라우팅 — 클라이언트 입력을 쓰지 않습니다.
        routing_type: 'personal_link',
        personal_order_link_id: link.id,
        source_contractor_id: link.contractor_id,
        assigned_contractor_id: link.contractor_id,
        assignment_locked_at: now,
        attribution_source: 'personal_link',
        utm_source: textOrNull(body.utmSource),
        utm_medium: textOrNull(body.utmMedium),
        utm_campaign: textOrNull(body.utmCampaign),
        referrer_domain: textOrNull(body.referrerDomain),
      })
      .select('id')
      .single()

    if (orderError || !orderRow) {
      console.error('[personal-link] orders 저장 실패:', orderError)
      return NextResponse.json(
        { error: `견적 저장 실패: ${orderError?.message || '알 수 없는 오류'}` },
        { status: 500 },
      )
    }

    const orderId = (orderRow as { id: string }).id

    // ── 4. 링크 주인에게만 알림 (마켓플레이스 등록 없음) ────────────
    try {
      await notifyContractor(link.contractor_id, orderId, title, category, fullAddress)
    } catch (e: unknown) {
      console.warn('[personal-link] 알림 오류 (무시):', e instanceof Error ? e.message : String(e))
    }

    await trackLinkEvent({
      linkId: link.id,
      eventType: 'quote_submitted',
      anonymousSessionId: textOrNull(body.sessionId),
      utmSource: textOrNull(body.utmSource),
      utmMedium: textOrNull(body.utmMedium),
      utmCampaign: textOrNull(body.utmCampaign),
      referrerDomain: textOrNull(body.referrerDomain),
    })

    return NextResponse.json({
      success: true,
      orderId,
      contractorName: link.display_name,
      message: '견적 요청이 접수되었습니다.',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[personal-link] 오류:', msg)
    return NextResponse.json({ error: '서버 오류: ' + msg }, { status: 500 })
  }
}
