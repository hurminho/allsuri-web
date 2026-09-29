// 가격 카드가 "어떤 상태를 그릴지" 결정하는 순수 함수.
// 클라이언트 컴포넌트에서도 안전하게 import 할 수 있도록 price-engine.ts(서버 전용)와 분리했습니다.

import type { PriceEstimateResponse, PriceState, ConfidenceLevel } from './price-engine'

export type PriceDisplayKind = 'amount' | 'insufficient'

export type PriceDisplay = {
  kind: PriceDisplayKind
  /** price 가 없으면 insufficient 로 취급합니다. */
  state: PriceState
  preliminary: boolean
  min: number | null
  max: number | null
  typical: number | null
  headline: string
  body: string
  cta: string
  disclaimer: string
  needsTradeSelection: boolean
}

/** 가격 엔진이 아예 응답하지 못했을 때만 쓰는 한국어 기본 문구. */
export const FALLBACK_INSUFFICIENT_COPY = {
  headline: '현장 조건에 따라 차이가 큰 작업',
  body:
    '아직 확인된 유사 완료 사례가 부족해 예상 금액을 표시하지 않습니다.\n' +
    '실제 업체 견적을 받아 비교하시는 편이 정확합니다.',
  cta: '무료로 업체 견적 받기',
  disclaimer: '현장 확인 전 참고 정보입니다.',
} as const

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
}

export function confidenceLabel(level: ConfidenceLevel | null | undefined): string {
  return level ? CONFIDENCE_LABELS[level] ?? '낮음' : '낮음'
}

/** 한국어 금액 표기. 엔진이 준 숫자만 포맷합니다(계산하지 않습니다). */
export function formatWon(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

/**
 * 금액을 보여줄지 / 데이터 부족 상태를 보여줄지 결정합니다.
 * - price 가 null → 데이터 부족
 * - priceState === 'insufficient' → 데이터 부족
 * - uiCopy.showAmount === false → 데이터 부족
 * - 금액(min/max)이 비어 있으면 → 데이터 부족 (그럴듯한 숫자를 만들지 않기 위해)
 */
export function resolvePriceDisplay(price: PriceEstimateResponse | null | undefined): PriceDisplay {
  if (!price) {
    return {
      kind: 'insufficient',
      state: 'insufficient',
      preliminary: false,
      min: null,
      max: null,
      typical: null,
      headline: FALLBACK_INSUFFICIENT_COPY.headline,
      body: FALLBACK_INSUFFICIENT_COPY.body,
      cta: FALLBACK_INSUFFICIENT_COPY.cta,
      disclaimer: FALLBACK_INSUFFICIENT_COPY.disclaimer,
      needsTradeSelection: false,
    }
  }

  const hasAmount =
    typeof price.estimatedMin === 'number' && typeof price.estimatedMax === 'number'
  const showAmount =
    price.priceState !== 'insufficient' && price.uiCopy?.showAmount === true && hasAmount

  if (!showAmount) {
    return {
      kind: 'insufficient',
      state: price.priceState,
      preliminary: false,
      min: null,
      max: null,
      typical: null,
      headline: price.uiCopy?.headline || FALLBACK_INSUFFICIENT_COPY.headline,
      body: price.uiCopy?.body || FALLBACK_INSUFFICIENT_COPY.body,
      cta: price.uiCopy?.cta || FALLBACK_INSUFFICIENT_COPY.cta,
      disclaimer: price.disclaimer || FALLBACK_INSUFFICIENT_COPY.disclaimer,
      needsTradeSelection: Boolean(price.needsTradeSelection),
    }
  }

  return {
    kind: 'amount',
    state: price.priceState,
    preliminary: price.priceState === 'preliminary',
    min: price.estimatedMin,
    max: price.estimatedMax,
    typical: price.estimatedTypical,
    headline: price.uiCopy.headline,
    body: price.uiCopy.body,
    cta: price.uiCopy.cta,
    disclaimer: price.disclaimer || '현장 확인 전 참고 금액입니다.',
    needsTradeSelection: Boolean(price.needsTradeSelection),
  }
}
