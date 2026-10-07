import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, normalizePhone } from '@/lib/supabase-server'
import { COMPLETION_NOT_READY_MESSAGE, customerCanConfirmCompletion } from '@/lib/web-order-rules'

// 고객의 공사 완료 확인 = 최종 완료. 주문·앱 공사(jobs)·앱 오더(listing)를 함께 completed 로 맞춥니다.
// 예전에는 공사를 'awaiting_confirmation' 으로 되돌리고 오더는 그대로 둬, 앱에서 영원히 끝나지 않았습니다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params
  const { phone, password } = await req.json()
  if (!phone || !password) return NextResponse.json({ error: '인증 정보가 필요합니다.' }, { status: 401 })

  const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single()
  if (!order) return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 })
  if (normalizePhone(String(order.customerPhone || '')) !== normalizePhone(phone) ||
      String(order.webPassword || '') !== String(password).trim()) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }
  if (order.status === 'completed') return NextResponse.json({ error: '이미 완료 처리된 요청입니다.' }, { status: 400 })
  if (!order.isAwarded) return NextResponse.json({ error: '낙찰 전에는 완료 처리할 수 없습니다.' }, { status: 400 })

  const jobId: string | null = order.matchedJobId || null
  let jobStatus: string | null = null
  if (jobId) {
    const { data: job } = await supabaseAdmin.from('jobs').select('status').eq('id', jobId).maybeSingle()
    jobStatus = job?.status || null
  }
  if (!customerCanConfirmCompletion(order, jobStatus)) {
    return NextResponse.json({ error: COMPLETION_NOT_READY_MESSAGE }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error: orderErr } = await supabaseAdmin
    .from('orders')
    .update({ status: 'completed', updatedAt: now })
    .eq('id', orderId)
  if (orderErr) {
    console.error('[complete] orders update failed:', orderErr)
    return NextResponse.json({ error: '완료 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }

  if (jobId) {
    const { error } = await supabaseAdmin.from('jobs').update({ status: 'completed', updated_at: now }).eq('id', jobId)
    if (error) console.warn('[complete] jobs update failed:', error)
  }
  const { error: listingErr } = await supabaseAdmin
    .from('marketplace_listings')
    .update({ status: 'completed', completed_at: now, updatedat: now })
    .eq('web_order_id', orderId)
  if (listingErr) console.warn('[complete] marketplace_listings update failed:', listingErr)

  const techId = order.technicianId
  if (techId) {
    await supabaseAdmin.from('notifications').insert({
      userid: techId, title: '공사 완료 확인',
      body: '고객이 공사 완료를 확인했습니다.', type: 'job_complete',
      jobid: jobId, isread: false, createdat: now,
    })
  }

  return NextResponse.json({ success: true, message: '공사 완료가 확인되었습니다.' })
}
