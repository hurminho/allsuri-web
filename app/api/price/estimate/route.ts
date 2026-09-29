import { NextRequest, NextResponse } from 'next/server'
import { estimatePrice, type PriceEstimateInput } from '@/lib/price-engine'
import { splitAddressRegion } from '@/lib/address-region'

export const runtime = 'nodejs'

// 확인 단계에서 고객이 공정/긴급도/건물 유형을 바꾸면 다시 계산하기 위한 프록시.
// 금액은 전부 가격 엔진이 계산하며, 이 라우트는 값을 그대로 전달만 합니다.
// 엔진이 죽어도 UI 가 멈추지 않도록 실패 시 200 + { price: null } 을 돌려줍니다.

function str(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s ? s : null
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 20)
}

function answersMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val === null || val === undefined || typeof val === 'object') continue
    const s = String(val).trim()
    if (s) out[k] = s
  }
  return out
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const address = str(body.address)
  const region = splitAddressRegion(address || '')

  const input: PriceEstimateInput = {
    tradeId: str(body.tradeId),
    category: str(body.category),
    subcategory: str(body.subcategory),
    text: str(body.text),
    address,
    locationLevel1: str(body.locationLevel1) || region.locationLevel1,
    locationLevel2: str(body.locationLevel2) || region.locationLevel2,
    propertyType: str(body.propertyType),
    urgency: str(body.urgency),
    accessDifficulty: str(body.accessDifficulty),
    workScopeTags: strArray(body.workScopeTags),
    answers: answersMap(body.answers),
    sessionId: str(body.sessionId),
    orderId: str(body.orderId),
  }

  if (!input.tradeId && !input.category && !input.text) {
    return NextResponse.json({ price: null })
  }

  const price = await estimatePrice(input)
  return NextResponse.json({ price })
}
