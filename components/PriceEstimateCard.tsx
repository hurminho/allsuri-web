'use client'

import type { PriceEstimateResponse } from '@/lib/price-engine'
import { confidenceLabel, formatWon, resolvePriceDisplay } from '@/lib/price-display'

// 이 컴포넌트는 금액을 계산하지 않습니다. 가격 엔진이 내려준 값과 문구만 그립니다.

type Props = {
  price: PriceEstimateResponse | null
  loading?: boolean
  onSelectTrade?: (tradeId: string) => void
}

export default function PriceEstimateCard({ price, loading, onSelectTrade }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-24 rounded bg-gray-200" />
          <div className="h-7 w-56 rounded bg-gray-200" />
          <div className="h-3 w-40 rounded bg-gray-100" />
          <div className="h-3 w-full rounded bg-gray-100" />
          <div className="h-3 w-2/3 rounded bg-gray-100" />
        </div>
        <p className="mt-3 text-xs text-gray-400">입력하신 조건으로 예상 범위를 확인하고 있어요…</p>
      </div>
    )
  }

  const display = resolvePriceDisplay(price)
  const candidates = price?.candidates ?? []
  const candidatePicker =
    price?.needsTradeSelection && candidates.length > 0 && onSelectTrade ? (
      <TradePicker candidates={candidates} onSelectTrade={onSelectTrade} />
    ) : null

  if (!price || display.kind === 'insufficient') {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-xs font-semibold text-gray-400">AI 예상 가격 범위</p>
        <p className="mt-1 text-base font-bold text-gray-900">{display.headline}</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">
          {display.body}
        </p>
        <div className="mt-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
          지금 견적을 요청하시면 여러 업체의 실제 금액을 받아 비교할 수 있어요.
        </div>
        {candidatePicker}
        <p className="mt-3 text-xs text-gray-400">{display.disclaimer}</p>
      </div>
    )
  }

  const preliminary = display.preliminary

  return (
    <div
      className={`rounded-2xl border bg-white p-5 ${
        preliminary ? 'border-gray-200' : 'border-blue-200'
      }`}
    >
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-400">AI 예상 가격 범위</p>
        {preliminary && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
            참고
          </span>
        )}
      </div>

      <p
        className={`mt-1 text-2xl font-bold tracking-tight ${
          preliminary ? 'text-gray-500' : 'text-gray-900'
        }`}
      >
        {formatWon(display.min)} ~ {formatWon(display.max)}
      </p>

      <p className="mt-2 text-sm font-semibold text-gray-800">{display.headline}</p>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-600">
        {display.body}
      </p>

      {price.factors.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500">가격 변동 요인</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {price.factors.map((f) => (
              <span
                key={f}
                className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        유사 완료 사례 {price.completedJobCount}건 · 전체 표본 {price.evidenceCount}건 · 신뢰도{' '}
        {confidenceLabel(price.confidenceLevel)}
      </p>

      {candidatePicker}

      <p className="mt-2 text-xs text-gray-400">{display.disclaimer}</p>
    </div>
  )
}

function TradePicker({
  candidates,
  onSelectTrade,
}: {
  candidates: { id: string; category: string; subcategory: string }[]
  onSelectTrade: (tradeId: string) => void
}) {
  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <p className="text-sm font-semibold text-gray-700">어떤 작업에 더 가까운가요?</p>
      <p className="mt-0.5 text-xs text-gray-400">
        고르지 않으셔도 견적 요청은 그대로 가능합니다.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {candidates.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectTrade(c.id)}
            className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          >
            {c.subcategory || c.category}
          </button>
        ))}
      </div>
    </div>
  )
}
