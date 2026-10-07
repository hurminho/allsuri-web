import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseAdmin,
  normalizePhone,
  fetchBusinessUsersByIds,
  fetchBusinessRatingsByIds,
  type BusinessUserProfile,
} from '@/lib/supabase-server'
import { resolvePersonName } from '@/lib/business-profile'
import { customerCanConfirmCompletion } from '@/lib/web-order-rules'

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

// 전화번호·비밀번호는 본문으로 받습니다. 예전에는 GET 쿼리 문자열(?phone=&pwd=)로 보내
// 서버·프록시 접속 로그와 브라우저 기록에 그대로 남았습니다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params
  const body = (await req.json().catch(() => ({}))) as { phone?: string; password?: string }
  const phone = normalizePhone(String(body.phone || ''))
  const password = String(body.password || '')

  if (!phone || !password) return NextResponse.json({ error: '인증 정보가 필요합니다.' }, { status: 401 })

  const order = await verifyOrder(orderId, phone, password)
  if (!order) return NextResponse.json({ error: '인증 실패 또는 주문을 찾을 수 없습니다.' }, { status: 401 })

  // 연결된 marketplace_listing
  const { data: listing } = await supabaseAdmin
    .from('marketplace_listings')
    .select('id, status, selected_bidder_id, claimed_by')
    .eq('web_order_id', orderId)
    .maybeSingle()
  const listingId: string | null = listing?.id || null
  const listingStatus: string | null = listing?.status || null
  const selectedBidderId: string | null = listing?.selected_bidder_id || listing?.claimed_by || null

  // 낙찰 뒤 앱 공사 상태 (사업자가 '공사 완료'를 알렸는지)
  let jobStatus: string | null = null
  if (order.matchedJobId) {
    const { data: job } = await supabaseAdmin.from('jobs').select('status').eq('id', order.matchedJobId).maybeSingle()
    jobStatus = job?.status || null
  }

  // 낙찰 여부: orders.isAwarded OR listing.status가 진행 단계 OR 선택된 입찰자 존재
  const orderAwardedFlag = !!order.isAwarded
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
      .select('id, bidder_id, message, status, bid_amount, estimated_days, created_at')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: true })
    const { data: bidsData } = isOrderAwarded
      ? await query.eq('status', 'selected')
      : await query
    bids = ((bidsData || []) as BidRow[]).filter((b) => b.id && b.bidder_id)
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
      canAct: false,
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
      // 승인·사업자번호 확인이 끝난 업체만 낙찰할 수 있습니다(B2B 낙찰과 같은 기준).
      canAward: biz.canAct,
    }
  })

  // 낙찰 사업자: orders.technicianId 우선, 없으면 listing.selected_bidder_id, 그것도 없으면 selected 입찰자
  let awardedBusiness = null
  const techId = order.technicianId || selectedBidderId ||
    (bids.find(b => b.status === 'selected')?.bidder_id ?? null)
  if (techId) {
    const bidders = await fetchBusinessUsersByIds([techId])
    awardedBusiness = bidders[techId] || null
  }

  return NextResponse.json({
    order: {
      id: order.id, title: order.title, description: order.description,
      status: order.status, category: order.category, address: order.address,
      visitDate: order.visitDate,
      createdAt: order.createdAt,
      isAwarded: isOrderAwarded,
      awardedEstimateId: order.awardedEstimateId,
      images: order.images || [],
      adminRating: order.adminRating,
      adminRatingComment: order.adminRatingComment,
      matchedJobId: order.matchedJobId,
      listingId,
      // 사업자가 앱에서 '공사 완료'를 알렸는지, 고객이 지금 완료 확인을 할 수 있는지
      workDoneReported: jobStatus === 'awaiting_confirmation' || jobStatus === 'completed',
      canConfirmCompletion: customerCanConfirmCompletion(
        { status: order.status, isAwarded: isOrderAwarded, visitDate: order.visitDate },
        jobStatus,
      ),
    },
    estimates,
    awardedBusiness,
  })
}
