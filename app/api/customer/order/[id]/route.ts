import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseAdmin,
  normalizePhone,
  fetchBusinessUsersByIds,
  fetchBusinessRatingsByIds,
  pickRowField,
  type BusinessUserProfile,
} from '@/lib/supabase-server'
import { resolvePersonName } from '@/lib/business-profile'

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
    id: string
    bidder_id: string
    message: string | null
    status: string
    bid_amount: number | null
    estimated_days: number | null
    created_at: string
  }
  let bids: BidRow[] = []
  if (listingId) {
    const query = supabaseAdmin
      .from('order_bids')
      .select('*')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: true })
    const { data: bidsData } = isOrderAwarded
      ? await query.eq('status', 'selected')
      : await query
    bids = (bidsData || []).map((raw) => {
      const row = raw as Record<string, unknown>
      return {
        id: String(row.id),
        bidder_id: String(pickRowField<string>(row, 'bidder_id', 'bidderId', 'bidderid', 'user_id', 'userid') || ''),
        message: pickRowField<string>(row, 'message'),
        status: String(pickRowField<string>(row, 'status') || ''),
        bid_amount: pickRowField<number>(row, 'bid_amount', 'bidAmount', 'amount'),
        estimated_days: pickRowField<number>(row, 'estimated_days', 'estimatedDays'),
        created_at: String(pickRowField<string>(row, 'created_at', 'createdAt', 'createdat') || ''),
      }
    }).filter((b) => b.id && b.bidder_id)
  }

  const bidderIds = [...new Set(bids.map((b) => b.bidder_id).filter(Boolean))]
  const biddersMap = await fetchBusinessUsersByIds(bidderIds)
  const ratingMap = await fetchBusinessRatingsByIds(bidderIds)

  const estimates = bids.map((b) => {
    const biz: BusinessUserProfile = biddersMap[b.bidder_id] || {
      id: b.bidder_id,
      name: null,
      businessname: null,
      representative_name: null,
      category: null,
      region: null,
      address: null,
      bio: null,
      avatar_url: null,
      businessnumber: null,
      jobs_accepted_count: null,
      serviceareas: null,
      specialties: null,
    }
    const rawBiz = (biz.businessname || '').trim()
    const rawName = resolvePersonName(biz)
    // 상호명 → 사장님 성함 → '사업자' 순으로 폴백 (익명 표시 방지)
    const businessName = rawBiz || rawName || '사업자'
    const personName = rawName || null
    const region = biz.region || biz.address || (Array.isArray(biz.serviceareas) ? biz.serviceareas.join(', ') : '') || ''
    const rating = ratingMap[b.bidder_id] || { avg: null, count: 0 }
    return {
      id: b.id,
      businessId: b.bidder_id,
      businessName,
      personName,
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
    const bidders = await fetchBusinessUsersByIds([techId])
    awardedBusiness = bidders[techId] || null
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
