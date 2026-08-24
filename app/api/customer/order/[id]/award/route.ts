import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, normalizePhone } from '@/lib/supabase-server'
import { customerOrderUrl, formatPhoneDisplay, sendSms, smsBidAwarded } from '@/lib/solapi-sms'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params
  const { phone, password, estimateId, businessId, listingId, isBid } = await req.json()

  if (!phone || !password) return NextResponse.json({ error: '인증 정보가 필요합니다.' }, { status: 401 })
  if (!estimateId || !businessId) return NextResponse.json({ error: '견적 ID와 사업자 ID가 필요합니다.' }, { status: 400 })

  // 주문 인증
  const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single()
  if (!order) return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 })
  const storedPhone = normalizePhone(String(order.customerPhone || order.customerphone || ''))
  const storedPwd = String(order.webPassword || order.webpassword || '')
  if (storedPhone !== normalizePhone(phone) || storedPwd !== String(password).trim()) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }
  if (order.isAwarded || order.isawarded) return NextResponse.json({ error: '이미 낙찰된 요청입니다.' }, { status: 400 })

  const now = new Date().toISOString()

  // 사업자 정보
  const { data: biz } = await supabaseAdmin
    .from('users').select('id, name, businessname, phonenumber').eq('id', businessId).single()
  const bizName = biz?.businessname || biz?.name || '사업자'
  const customerPhone = order.customerPhone || order.customerphone || ''
  const customerName = order.customerName || order.customername || '고객'

  // ── 낙찰 처리: order_bid 방식 (B2B와 동일) ──────────────────────
  // estimateId = order_bid.id (isBid:true인 경우) 또는 estimates.id
  // listingId = marketplace_listing.id (있으면)

  let jobId: string | null = null

  if (isBid && listingId) {
    // 1) 선택된 bid → 'selected'
    const { error: selErr } = await supabaseAdmin
      .from('order_bids')
      .update({ status: 'selected', updated_at: now })
      .eq('id', estimateId)
    if (selErr) console.warn('[award] order_bids selected update error:', selErr)

    // 2) 같은 listing의 다른 입찰들 명시적으로 'rejected' (트리거 미동작 대비)
    const { error: rejErr } = await supabaseAdmin
      .from('order_bids')
      .update({ status: 'rejected', updated_at: now })
      .eq('listing_id', listingId)
      .neq('id', estimateId)
      .neq('status', 'selected')
    if (rejErr) console.warn('[award] order_bids rejected bulk update error:', rejErr)

    // 3) job 생성
    const { data: jobData, error: jobErr } = await supabaseAdmin.from('jobs').insert({
      title: order.title || '웹 견적 요청',
      description: `[웹 고객 낙찰]\n요청: ${order.description || ''}\n\n📞 고객: ${customerName} / ${customerPhone}\n📍 주소: ${order.address || ''}`,
      owner_business_id: businessId,
      assigned_business_id: businessId,
      status: 'assigned',
      location: order.address || '',
      category: order.category || '',
      urgency: 'normal',
      budget_amount: 0, awarded_amount: 0, commission_rate: 5,
      created_at: now, updated_at: now,
    }).select('id').maybeSingle()
    if (jobErr) console.warn('[award] jobs insert error:', jobErr)
    jobId = jobData?.id || null

    // 4) marketplace_listing 상태/연결 직접 갱신 (트리거 미동작 대비)
    const { error: lstErr } = await supabaseAdmin
      .from('marketplace_listings')
      .update({
        status: 'assigned',
        selected_bidder_id: businessId,
        claimed_by: businessId,
        ...(jobId ? { jobid: jobId } : {}),
        updatedat: now,
      })
      .eq('id', listingId)
    if (lstErr) console.warn('[award] marketplace_listings update error:', lstErr)
  } else {
    // 기존 estimates 방식 폴백
    await supabaseAdmin.from('estimates').update({ status: 'awarded', awardedAt: now }).eq('id', estimateId)

    const { data: jobData } = await supabaseAdmin.from('jobs').insert({
      title: order.title || '웹 견적 요청',
      description: `[웹 고객 낙찰]\n요청: ${order.description || ''}\n\n📞 고객: ${customerName} / ${customerPhone}\n📍 주소: ${order.address || ''}`,
      owner_business_id: businessId, assigned_business_id: businessId,
      status: 'assigned', location: order.address || '', category: order.category || '',
      urgency: 'normal', budget_amount: 0, awarded_amount: 0, commission_rate: 5,
      created_at: now, updated_at: now,
    }).select('id').maybeSingle()
    jobId = jobData?.id || null
  }

  // order 낙찰 처리 (camelCase 컬럼이 정상; 실패 시 lowercase 폴백)
  const { error: ordErr } = await supabaseAdmin.from('orders').update({
    isAwarded: true, awardedAt: now,
    awardedEstimateId: estimateId,
    technicianId: businessId,
    status: 'in_progress',
    ...(jobId ? { matchedJobId: jobId } : {}),
  }).eq('id', orderId)
  if (ordErr) {
    console.warn('[award] orders camelCase update error → trying lowercase fallback:', ordErr)
    const { error: ordErr2 } = await supabaseAdmin.from('orders').update({
      isawarded: true, awardedat: now,
      awardedestimateid: estimateId,
      technicianid: businessId,
      status: 'in_progress',
      ...(jobId ? { matchedjobid: jobId } : {}),
    }).eq('id', orderId)
    if (ordErr2) console.error('[award] orders lowercase update also failed:', ordErr2)
  }

  // ── 낙찰 사업자 알림 (DB INSERT → Supabase webhook → FCM push) ──
  await supabaseAdmin.from('notifications').insert({
    userid: businessId,
    title: `🎉 낙찰되었습니다 - ${order.title || '견적 요청'}`,
    body: `📞 고객: ${customerName} / ${customerPhone}\n📍 주소: ${order.address || ''}`,
    type: 'web_order_awarded',
    jobid: jobId,
    isread: false,
    createdat: now,
  })

  // ── 거절된 입찰자들에게 알림 ────────────────────────────────────
  if (listingId) {
    try {
      const { data: rejectedBids } = await supabaseAdmin
        .from('order_bids')
        .select('bidder_id')
        .eq('listing_id', listingId)
        .eq('status', 'rejected')
      if (rejectedBids && rejectedBids.length > 0) {
        const rejectedNotifications = rejectedBids
          .filter((b: { bidder_id: string }) => b.bidder_id !== businessId)
          .map((b: { bidder_id: string }) => ({
            userid: b.bidder_id,
            title: '입찰 결과 안내',
            body: '입찰하신 견적이 다른 사업자께 낙찰 되었어요.. 다른 견적에 입찰을 시도해 보세요!',
            type: 'bid_rejected',
            jobid: jobId,
            isread: false,
            createdat: now,
          }))
        if (rejectedNotifications.length > 0) {
          await supabaseAdmin.from('notifications').insert(rejectedNotifications)
        }
      }
    } catch (e) {
      console.warn('[award] 거절 알림 전송 실패 (무시):', e)
    }
  }

  try {
    const bizPhone = formatPhoneDisplay(String(biz?.phonenumber || ''))
    const smsResult = await sendSms(
      String(customerPhone),
      smsBidAwarded({
        orderTitle: order.title || '견적 요청',
        businessName: bizName,
        phoneLabel: bizPhone || '웹에서 확인',
        link: customerOrderUrl(String(customerPhone)),
      })
    )
    if (!smsResult.ok) {
      console.warn('[award] 고객 문자 미발송:', smsResult.error)
    }
  } catch (e) {
    console.warn('[award] 고객 문자 발송 실패 (무시):', e)
  }

  return NextResponse.json({ success: true, jobId, message: `${bizName}에게 낙찰되었습니다.` })
}
