import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, normalizePhone } from '@/lib/supabase-server'

async function verifyOrder(orderId: string, phone: string, password: string) {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()
  if (!data) return null
  const storedPhone = normalizePhone(String(data.customerPhone || data.customerphone || ''))
  const storedPwd = String(data.webPassword || data.webpassword || '')
  if (storedPhone !== normalizePhone(phone)) return null
  if (storedPwd !== String(password).trim()) return null
  return data
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params
  const phone = normalizePhone(req.nextUrl.searchParams.get('phone') || '')
  const password = req.nextUrl.searchParams.get('pwd') || ''

  if (!phone || !password) return NextResponse.json({ error: '인증 정보가 필요합니다.' }, { status: 401 })

  const order = await verifyOrder(orderId, phone, password)
  if (!order) return NextResponse.json({ error: '인증 실패 또는 주문을 찾을 수 없습니다.' }, { status: 401 })

  // 연결된 marketplace_listing 조회 (web_order_id 컬럼이 있는 경우)
  let listingId: string | null = null
  let listingStatus: string | null = null
  let selectedBidderId: string | null = null
  try {
    const { data: listing } = await supabaseAdmin
      .from('marketplace_listings')
      .select('id, status, bid_count, selected_bidder_id, claimed_by')
      .eq('web_order_id', orderId)
      .maybeSingle()
    listingId = listing?.id || null
    listingStatus = listing?.status || null
    selectedBidderId = listing?.selected_bidder_id || listing?.claimed_by || null
  } catch { /* web_order_id 컬럼 없으면 무시 */ }

  // 낙찰 여부 판단 강화: orders.isAwarded(camelCase/lowercase) OR listing.status가 진행 단계 OR 선택된 입찰자 존재
  const orderAwardedFlag = !!(order.isAwarded ?? order.isawarded)
  const listingAwarded = !!(listingStatus && ['assigned', 'in_progress', 'awaiting_confirmation', 'completed'].includes(listingStatus))
  const isOrderAwarded = orderAwardedFlag || listingAwarded || !!selectedBidderId

  // 입찰 목록: marketplace_listing의 order_bids 우선 사용 (B2B와 동일 흐름)
  type BidRow = {
    id: string; bidder_id: string; message: string | null
    status: string; bid_amount: number | null; estimated_days: number | null; created_at: string
  }
  let bids: BidRow[] = []
  if (listingId) {
    const query = supabaseAdmin
      .from('order_bids')
      .select('id, bidder_id, message, status, bid_amount, estimated_days, created_at')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: true })
    // 낙찰 후에는 선택된 입찰만 조회 (rejected/pending 숨김)
    const { data: bidsData } = isOrderAwarded
      ? await query.eq('status', 'selected')
      : await query
    bids = (bidsData || []) as BidRow[]
  }

  // 입찰자 사업자 정보 조회 (실제 존재하는 컬럼만 select)
  const bidderIds = [...new Set(bids.map(b => b.bidder_id).filter(Boolean))]
  type UserRow = {
    id: string; name: string | null; businessname: string | null; category: string | null
    address: string | null; bio: string | null; avatar_url: string | null
    businessnumber: string | null; jobs_accepted_count: number | null
    serviceareas: string[] | null; specialties: string[] | null
  }
  const biddersMap: Record<string, UserRow> = {}
  if (bidderIds.length > 0) {
    const { data: bidders, error: biddersErr } = await supabaseAdmin
      .from('users')
      .select('id, name, businessname, category, address, bio, avatar_url, businessnumber, jobs_accepted_count, serviceareas, specialties')
      .in('id', bidderIds)
    if (biddersErr) console.warn('[my-order] bidders query error:', biddersErr)
    ;(bidders || []).forEach((b: UserRow) => { biddersMap[b.id] = b })
  }

  // 입찰자 평점 일괄 조회 (business_reviews 우선, 실패 시 무시)
  const ratingMap: Record<string, { avg: number | null; count: number }> = {}
  if (bidderIds.length > 0) {
    try {
      const { data: reviews } = await supabaseAdmin
        .from('business_reviews')
        .select('business_id, rating')
        .in('business_id', bidderIds)
      const buckets: Record<string, number[]> = {}
      ;(reviews || []).forEach((r: { business_id: string; rating: number | null }) => {
        if (!r.business_id) return
        if (!buckets[r.business_id]) buckets[r.business_id] = []
        if (typeof r.rating === 'number') buckets[r.business_id].push(r.rating)
      })
      bidderIds.forEach((bid) => {
        const arr = buckets[bid] || []
        if (arr.length === 0) {
          ratingMap[bid] = { avg: null, count: 0 }
        } else {
          const avg = Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10
          ratingMap[bid] = { avg, count: arr.length }
        }
      })
    } catch (e) {
      console.warn('[my-order] bidder ratings query failed (ignored):', e)
    }
  }

  const estimates = bids.map(b => {
    const biz = biddersMap[b.bidder_id] || ({} as UserRow)
    const rawBiz = (biz.businessname || '').trim()
    const rawName = (biz.name || '').trim()
    // 상호명 → 사장님 성함 → '사업자' 순으로 폴백 (익명 표시 방지)
    const businessName = rawBiz || rawName || '사업자'
    const region = biz.address || (Array.isArray(biz.serviceareas) ? biz.serviceareas.join(', ') : '') || ''
    const rating = ratingMap[b.bidder_id] || { avg: null, count: 0 }
    return {
      id: b.id,
      businessId: b.bidder_id,
      businessName,
      personName: rawName,
      equipmentType: biz.category || '',
      region,
      bizDescription: biz.bio || '',
      avatarUrl: biz.avatar_url || null,
      hasBusinessReg: !!(biz.businessnumber && biz.businessnumber.trim()),
      jobsCount: biz.jobs_accepted_count || 0,
      avgRating: rating.avg,
      reviewCount: rating.count,
      amount: b.bid_amount || 0,
      description: b.message || '',
      estimatedDays: b.estimated_days || 0,
      createdAt: b.created_at,
      status: b.status,
      isAwarded: b.status === 'selected',
      isBid: true,
    }
  })

  // 낙찰 사업자: orders.technicianId 우선, 없으면 listing.selected_bidder_id, 그것도 없으면 selected 입찰자
  let awardedBusiness = null
  const techId = order.technicianId || order.technicianid || selectedBidderId ||
    (bids.find(b => b.status === 'selected')?.bidder_id ?? null)
  if (techId) {
    const { data: biz, error: bizErr } = await supabaseAdmin
      .from('users')
      .select('id, name, businessname, phonenumber, category, address, bio, avatar_url, businessnumber, jobs_accepted_count, serviceareas, specialties')
      .eq('id', techId)
      .maybeSingle()
    if (bizErr) console.warn('[my-order] awarded biz query error:', bizErr)
    awardedBusiness = biz || null
  }

  return NextResponse.json({
    order: {
      id: order.id, title: order.title, description: order.description,
      status: order.status, category: order.category, address: order.address,
      visitDate: order.visitDate || order.visitdate,
      createdAt: order.createdAt || order.createdat,
      isAwarded: isOrderAwarded,
      awardedEstimateId: order.awardedEstimateId || order.awardedestimatedid,
      images: order.images || [],
      adminRating: order.adminRating || order.adminrating,
      adminRatingComment: order.adminRatingComment || order.adminratingcomment,
      matchedJobId: order.matchedJobId || order.matchedjobid,
      listingId,
    },
    estimates,
    awardedBusiness,
  })
}
