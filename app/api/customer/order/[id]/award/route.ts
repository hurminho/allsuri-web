import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, normalizePhone, businessCanActFromRow } from '@/lib/supabase-server'
import { customerOrderUrl, formatPhoneDisplay, sendSms, smsBidAwarded } from '@/lib/solapi-sms'
import { COMMISSION_RATE } from '@/lib/commission'

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

  // 사업자 정보 + 낙찰 가능 여부 (B2B 낙찰과 같은 기준: 승인 + 사업자번호 또는 관리자 우회)
  const { data: biz } = await supabaseAdmin
    .from('users')
    .select('id, name, role, businessname, phonenumber, businessnumber, businessnumber_norm, businessstatus, business_verify_bypass')
    .eq('id', businessId)
    .maybeSingle()
  if (!biz || !businessCanActFromRow(biz)) {
    return NextResponse.json(
      { error: '사업자 정보 확인이 끝나지 않은 업체라 선택할 수 없습니다. 다른 업체를 선택해 주세요.' },
      { status: 400 },
    )
  }
  const bizName = biz?.businessname || biz?.name || '사업자'
  const customerPhone = order.customerPhone || order.customerphone || ''
  const customerName = order.customerName || order.customername || '고객'

  // ── 낙찰 처리: order_bid 방식 (B2B와 동일) ──────────────────────
  // estimateId = order_bid.id (isBid:true인 경우) 또는 estimates.id
  // listingId = marketplace_listing.id (있으면)

  let jobId: string | null = null

  if (isBid && listingId) {
    // 낙찰할 입찰이 이 주문의 오더에 달린 것인지, 고른 업체의 입찰인지 확인합니다.
    // (예전에는 입찰 ID·업체 ID를 그대로 믿어 다른 오더의 입찰도 낙찰할 수 있었습니다)
    const { data: bidRow } = await supabaseAdmin
      .from('order_bids')
      .select('id, listing_id, bidder_id, status, bid_amount, marketplace_listings!inner(web_order_id)')
      .eq('id', estimateId)
      .maybeSingle()
    const bidListing = bidRow?.marketplace_listings as { web_order_id?: string | null } | { web_order_id?: string | null }[] | null | undefined
    const bidOrderId = Array.isArray(bidListing) ? bidListing[0]?.web_order_id : bidListing?.web_order_id
    if (!bidRow || bidRow.listing_id !== listingId || bidOrderId !== orderId || bidRow.bidder_id !== businessId) {
      return NextResponse.json({ error: '입찰 정보를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (bidRow.status !== 'pending') {
      return NextResponse.json({ error: '이미 처리된 입찰입니다.' }, { status: 400 })
    }
    // 공사 금액 = 낙찰된 입찰가. 수수료(commission_amount)는 DB 트리거가 이 금액으로 계산합니다.
    const bidAmount = Number(bidRow.bid_amount) > 0 ? Number(bidRow.bid_amount) : 0

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

    // 3) job 생성 — web_order_id 로 고객 주문과 연결해야 앱의 '공사 완료' 문자·담당 확인이 동작합니다.
    const { data: jobData, error: jobErr } = await supabaseAdmin.from('jobs').insert({
      title: order.title || '웹 견적 요청',
      description: `[웹 고객 낙찰]\n요청: ${order.description || ''}\n\n📞 고객: ${customerName} / ${customerPhone}\n📍 주소: ${order.address || ''}`,
      owner_business_id: businessId,
      assigned_business_id: businessId,
      status: 'assigned',
      location: order.address || '',
      category: order.category || '',
      urgency: 'normal',
      budget_amount: bidAmount, awarded_amount: bidAmount, commission_rate: COMMISSION_RATE,
      web_order_id: orderId,
      created_at: now, updated_at: now,
    }).select('id').maybeSingle()
    if (jobErr) console.warn('[award] jobs insert error:', jobErr)
    jobId = jobData?.id || null
    if (jobId) {
      await supabaseAdmin.from('order_bids').update({ job_id: jobId }).eq('id', estimateId)
    }

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
    // 기존 estimates 방식 폴백 (estimates 컬럼은 orderId 외 소문자: businessid, awardedat)
    const { data: est } = await supabaseAdmin
      .from('estimates')
      .select('id, orderId, businessid, amount, status')
      .eq('id', estimateId)
      .maybeSingle()
    if (!est || est.orderId !== orderId || est.businessid !== businessId) {
      return NextResponse.json({ error: '견적 정보를 찾을 수 없습니다.' }, { status: 404 })
    }
    await supabaseAdmin.from('estimates').update({ status: 'awarded', awardedat: now }).eq('id', estimateId)
    const estAmount = Number(est.amount) > 0 ? Number(est.amount) : 0

    const { data: jobData } = await supabaseAdmin.from('jobs').insert({
      title: order.title || '웹 견적 요청',
      description: `[웹 고객 낙찰]\n요청: ${order.description || ''}\n\n📞 고객: ${customerName} / ${customerPhone}\n📍 주소: ${order.address || ''}`,
      owner_business_id: businessId, assigned_business_id: businessId,
      status: 'assigned', location: order.address || '', category: order.category || '',
      urgency: 'normal', budget_amount: estAmount, awarded_amount: estAmount, commission_rate: COMMISSION_RATE,
      web_order_id: orderId,
      created_at: now, updated_at: now,
    }).select('id').maybeSingle()
    jobId = jobData?.id || null
  }

  // order 낙찰 처리 (orders 컬럼은 camelCase 입니다)
  const { error: ordErr } = await supabaseAdmin.from('orders').update({
    isAwarded: true, awardedAt: now,
    ...(isBid ? { awarded_bid_id: estimateId } : { awardedEstimateId: estimateId }),
    technicianId: businessId,
    status: 'in_progress',
    ...(jobId ? { matchedJobId: jobId } : {}),
  }).eq('id', orderId)
  if (ordErr) console.error('[award] orders update failed:', ordErr)

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
