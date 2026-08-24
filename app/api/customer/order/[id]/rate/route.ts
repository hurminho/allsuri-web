import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, normalizePhone } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params
  const { phone, password, rating, comment } = await req.json()
  if (!phone || !password) return NextResponse.json({ error: '인증 정보가 필요합니다.' }, { status: 401 })
  if (!rating || rating < 1 || rating > 5) return NextResponse.json({ error: '평점은 1~5 사이여야 합니다.' }, { status: 400 })

  const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single()
  if (!order) return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 })
  if (normalizePhone(String(order.customerPhone || '')) !== normalizePhone(phone) ||
      String(order.webPassword || '') !== String(password).trim()) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const businessId = order.technicianId || order.technicianid

  await supabaseAdmin.from('orders').update({
    adminRating: rating, adminRatingComment: comment || '', adminRatedAt: now,
  }).eq('id', orderId)

  if (businessId) {
    // 평점은 order_reviews 로 통합 저장한다 (앱 B2B 평점과 같은 원천).
    // order_id 유니크 인덱스 덕분에 중복 평가는 갱신으로 처리된다.
    const { error: reviewError } = await supabaseAdmin
      .from('order_reviews')
      .upsert(
        {
          reviewee_id: businessId, order_id: orderId, rating,
          comment: comment || '', is_admin_review: false,
          created_at: now, updated_at: now,
        },
        { onConflict: 'order_id' },
      )
    if (reviewError) {
      console.warn('[rate] order_reviews 저장 실패:', reviewError.message)
    }
    await supabaseAdmin.from('notifications').insert({
      userid: businessId, title: '⭐ 새로운 평점이 등록되었습니다',
      body: `고객이 ${rating}점을 남겼습니다.`, type: 'new_review',
      isread: false, createdat: now,
    })
  }

  return NextResponse.json({ success: true, message: '평점이 등록되었습니다.' })
}
