/**
 * 웹 고객 주문의 공사 완료 확인 규칙.
 *
 * 낙찰 직후 실수로 완료 처리되지 않도록, 사업자가 앱에서 '공사 완료'를 알렸거나
 * (공사 상태 awaiting_confirmation) 방문 희망일이 지난 뒤에만 고객이 최종 확인할 수 있습니다.
 * 사업자가 완료를 알리지 않아도 방문일이 지나면 고객이 직접 마무리할 수 있습니다.
 * 앱 API(netlify/functions/customer.ts)의 /order/:id/complete 와 같은 기준입니다.
 */
export function customerCanConfirmCompletion(
  order: { status?: string | null; isAwarded?: boolean | null; visitDate?: string | null },
  jobStatus: string | null,
  now: number = Date.now(),
): boolean {
  if (!order.isAwarded) return false
  if (order.status !== 'in_progress') return false
  if (jobStatus === 'awaiting_confirmation' || jobStatus === 'completed') return true
  const visitAt = Date.parse(String(order.visitDate || ''))
  return Number.isFinite(visitAt) && visitAt <= now
}

export const COMPLETION_NOT_READY_MESSAGE =
  '사업자가 공사 완료를 알리거나 방문 희망일이 지나면 확인할 수 있습니다.'
