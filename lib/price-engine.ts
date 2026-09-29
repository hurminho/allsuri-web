// 가격 엔진(별도 저장소, https://api.allsuri.app) HTTP 클라이언트.
//
// 서버 전용 모듈입니다. 클라이언트 컴포넌트에서 값(함수)을 import 하지 마세요.
// 타입만 필요한 경우에는 `import type` 으로 가져오면 됩니다(런타임 코드가 포함되지 않음).
//
// 이 파일은 절대로 금액을 계산하지 않습니다. 모든 금액은 가격 엔진 응답을 그대로 전달합니다.

export type PriceState = 'sufficient' | 'preliminary' | 'insufficient'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type Urgency = 'normal' | 'soon' | 'today' | 'emergency'
export type PropertyType =
  | 'apartment'
  | 'villa'
  | 'house'
  | 'officetel'
  | 'commercial'
  | 'office'
  | 'other'
export type AccessDifficulty = 'easy' | 'tight' | 'hard' | 'unknown'

export type QuestionInputType = 'single' | 'multi' | 'bool' | 'text' | 'number' | 'photo'

export type QuestionMapsTo =
  | 'urgency'
  | 'propertyType'
  | 'workScopeTags'
  | 'symptomTags'
  | 'accessDifficulty'
  | 'materialIncluded'
  | null

export type PriceQuestionOption = { value: string; label: string }

export type PriceQuestion = {
  id: string
  label: string
  inputType: QuestionInputType
  options: PriceQuestionOption[]
  mapsTo?: QuestionMapsTo
  affectsPrice?: boolean
  sortOrder?: number
}

export type TradeSummary = {
  id: string
  category: string
  subcategory: string
  priceFactors: string[]
  symptomTags: string[]
  workScopeTags: string[]
  materialIncludedByDefault: boolean
  visitFeeApplies: boolean
  aliases?: string[]
  requiredQuestions?: string[]
  optionalQuestions?: string[]
}

export type PriceEnums = {
  urgency: string[]
  propertyType: string[]
  priceState: string[]
  confidenceLevel: string[]
}

export type PriceCatalog = {
  engineVersion: string
  source: 'database' | 'defaults'
  enums: PriceEnums
  categories: string[]
  trades: TradeSummary[]
  questions: PriceQuestion[]
}

export type PriceAdjustment = {
  label: string
  kind: string
  value: number
  reason?: string
}

export type PriceBasisSource = 'completed_job' | 'contractor_bid' | 'rate_card' | 'baseline'

export type PriceBasis = {
  source: PriceBasisSource
  sampleCount: number
  weightShare: number
  newestAt?: string | null
  oldestAt?: string | null
}

export type PriceUiCopy = {
  headline: string
  body: string
  showAmount: boolean
  cta: string
}

export type PriceEstimateResponse = {
  priceState: PriceState
  estimatedMin: number | null
  estimatedTypical: number | null
  estimatedMax: number | null
  confidenceLevel: ConfidenceLevel
  confidenceScore: number
  evidenceCount: number
  completedJobCount: number
  weightedEvidence: number
  factors: string[]
  adjustments: PriceAdjustment[]
  basis: PriceBasis[]
  droppedOutlierCount: number
  disclaimer: string
  engineVersion: string
  insufficientReason: string | null
  trade: TradeSummary | null
  candidates: TradeSummary[]
  needsTradeSelection: boolean
  normalizedRequest: Record<string, unknown> | null
  questions: { required: PriceQuestion[]; optional: PriceQuestion[] } | null
  missingRequiredQuestions: PriceQuestion[]
  uiCopy: PriceUiCopy
}

export type PriceEstimateInput = {
  tradeId?: string | null
  category?: string | null
  subcategory?: string | null
  text?: string | null
  address?: string | null
  locationLevel1?: string | null
  locationLevel2?: string | null
  propertyType?: string | null
  urgency?: string | null
  accessDifficulty?: string | null
  workScopeTags?: string[]
  materialIncluded?: boolean | null
  visitRequired?: boolean | null
  answers?: Record<string, string | string[] | boolean | number | null>
  sessionId?: string | null
  orderId?: string | null
}

const CATALOG_TTL_MS = 5 * 60 * 1000
const CATALOG_TIMEOUT_MS = 3000
const ESTIMATE_TIMEOUT_MS = 4000

export function priceEngineBaseUrl(): string {
  const raw = String(process.env.ALLSURI_API_URL || '').trim()
  return (raw || 'https://api.allsuri.app').replace(/\/+$/, '')
}

let catalogCache: { at: number; value: PriceCatalog } | null = null

/** 테스트/운영 점검용. 캐시를 비웁니다. */
export function clearPriceCatalogCache() {
  catalogCache = null
}

/**
 * 공정·질문 카탈로그. 5분 캐시, 3초 타임아웃.
 * 어떤 실패에서도 예외를 던지지 않고 null 을 돌려줍니다.
 */
export async function fetchPriceCatalog(): Promise<PriceCatalog | null> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.value
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS)
  try {
    const res = await fetch(`${priceEngineBaseUrl()}/api/price/catalog`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn('[price-engine] catalog 응답 오류', { status: res.status })
      return null
    }
    const json: unknown = await res.json()
    const catalog = normalizeCatalog(json)
    if (!catalog) {
      console.warn('[price-engine] catalog 응답 형식이 올바르지 않습니다')
      return null
    }
    catalogCache = { at: Date.now(), value: catalog }
    return catalog
  } catch (e: unknown) {
    console.warn('[price-engine] catalog 요청 실패', {
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 가격 추정. 4초 타임아웃. 실패·비정상 응답이면 null.
 * 절대 예외를 던지지 않습니다(견적 접수 흐름을 막지 않기 위해).
 */
export async function estimatePrice(
  input: PriceEstimateInput,
): Promise<PriceEstimateResponse | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ESTIMATE_TIMEOUT_MS)
  try {
    const res = await fetch(`${priceEngineBaseUrl()}/api/price/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(compact(input)),
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn('[price-engine] estimate 응답 오류', { status: res.status })
      return null
    }
    const json: unknown = await res.json()
    const price = normalizeEstimate(json)
    if (!price) {
      console.warn('[price-engine] estimate 응답 형식이 올바르지 않습니다')
      return null
    }
    return price
  } catch (e: unknown) {
    console.warn('[price-engine] estimate 요청 실패', {
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  } finally {
    clearTimeout(timer)
  }
}

// -----------------------------------------------------------------------------
// 정규화 (순수 함수 — 네트워크 없이 테스트 가능)
// -----------------------------------------------------------------------------

const PRICE_STATES: PriceState[] = ['sufficient', 'preliminary', 'insufficient']
const CONFIDENCE_LEVELS: ConfidenceLevel[] = ['high', 'medium', 'low']
const INPUT_TYPES: QuestionInputType[] = ['single', 'multi', 'bool', 'text', 'number', 'photo']

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x ?? '').trim()).filter(Boolean)
}

function intOrNull(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

function numOr(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = v
  }
  return out
}

export function normalizeQuestion(raw: unknown): PriceQuestion | null {
  const o = record(raw)
  const id = String(o.id ?? '').trim()
  const label = String(o.label ?? '').trim()
  if (!id || !label) return null
  const inputType = INPUT_TYPES.includes(o.inputType as QuestionInputType)
    ? (o.inputType as QuestionInputType)
    : 'single'
  const options = Array.isArray(o.options)
    ? o.options
        .map((opt) => {
          const r = record(opt)
          const value = String(r.value ?? r.label ?? '').trim()
          const optLabel = String(r.label ?? r.value ?? '').trim()
          return value && optLabel ? { value, label: optLabel } : null
        })
        .filter((x): x is PriceQuestionOption => x !== null)
    : []
  return {
    id,
    label,
    inputType,
    options,
    mapsTo: (o.mapsTo ?? null) as QuestionMapsTo,
    affectsPrice: Boolean(o.affectsPrice),
    sortOrder: numOr(o.sortOrder, 0),
  }
}

export function normalizeTradeSummary(raw: unknown): TradeSummary | null {
  const o = record(raw)
  const id = String(o.id ?? '').trim()
  const category = String(o.category ?? '').trim()
  const subcategory = String(o.subcategory ?? '').trim()
  if (!id || !category) return null
  return {
    id,
    category,
    subcategory,
    priceFactors: strArray(o.priceFactors),
    symptomTags: strArray(o.symptomTags),
    workScopeTags: strArray(o.workScopeTags),
    materialIncludedByDefault: Boolean(o.materialIncludedByDefault),
    visitFeeApplies: Boolean(o.visitFeeApplies),
    aliases: strArray(o.aliases),
    requiredQuestions: strArray(o.requiredQuestions),
    optionalQuestions: strArray(o.optionalQuestions),
  }
}

export function normalizeCatalog(raw: unknown): PriceCatalog | null {
  const o = record(raw)
  const trades = Array.isArray(o.trades)
    ? o.trades.map(normalizeTradeSummary).filter((t): t is TradeSummary => t !== null)
    : []
  if (trades.length === 0) return null
  const enums = record(o.enums)
  const categories = strArray(o.categories)
  return {
    engineVersion: String(o.engineVersion ?? 'v1'),
    source: o.source === 'database' ? 'database' : 'defaults',
    enums: {
      urgency: strArray(enums.urgency),
      propertyType: strArray(enums.propertyType),
      priceState: strArray(enums.priceState),
      confidenceLevel: strArray(enums.confidenceLevel),
    },
    categories: categories.length
      ? categories
      : Array.from(new Set(trades.map((t) => t.category))),
    questions: Array.isArray(o.questions)
      ? o.questions.map(normalizeQuestion).filter((q): q is PriceQuestion => q !== null)
      : [],
    trades,
  }
}

export function normalizeEstimate(raw: unknown): PriceEstimateResponse | null {
  const o = record(raw)
  if (!PRICE_STATES.includes(o.priceState as PriceState)) return null
  const priceState = o.priceState as PriceState
  const uiCopyRaw = record(o.uiCopy)
  const questionsRaw = record(o.questions)

  const min = intOrNull(o.estimatedMin)
  const max = intOrNull(o.estimatedMax)

  return {
    priceState,
    estimatedMin: min,
    estimatedTypical: intOrNull(o.estimatedTypical),
    estimatedMax: max,
    confidenceLevel: CONFIDENCE_LEVELS.includes(o.confidenceLevel as ConfidenceLevel)
      ? (o.confidenceLevel as ConfidenceLevel)
      : 'low',
    confidenceScore: numOr(o.confidenceScore, 0),
    evidenceCount: numOr(o.evidenceCount, 0),
    completedJobCount: numOr(o.completedJobCount, 0),
    weightedEvidence: numOr(o.weightedEvidence, 0),
    factors: strArray(o.factors),
    adjustments: Array.isArray(o.adjustments)
      ? o.adjustments.map((a) => {
          const r = record(a)
          return {
            label: String(r.label ?? ''),
            kind: String(r.kind ?? ''),
            value: numOr(r.value, 0),
            reason: r.reason ? String(r.reason) : undefined,
          }
        })
      : [],
    basis: Array.isArray(o.basis)
      ? o.basis.map((b) => {
          const r = record(b)
          return {
            source: String(r.source ?? 'baseline') as PriceBasisSource,
            sampleCount: numOr(r.sampleCount, 0),
            weightShare: numOr(r.weightShare, 0),
            newestAt: r.newestAt ? String(r.newestAt) : null,
            oldestAt: r.oldestAt ? String(r.oldestAt) : null,
          }
        })
      : [],
    droppedOutlierCount: numOr(o.droppedOutlierCount, 0),
    disclaimer: String(o.disclaimer ?? '현장 확인 전 참고 금액입니다.'),
    engineVersion: String(o.engineVersion ?? 'v1'),
    insufficientReason: o.insufficientReason ? String(o.insufficientReason) : null,
    trade: normalizeTradeSummary(o.trade),
    candidates: Array.isArray(o.candidates)
      ? o.candidates.map(normalizeTradeSummary).filter((t): t is TradeSummary => t !== null)
      : [],
    needsTradeSelection: Boolean(o.needsTradeSelection),
    normalizedRequest: o.normalizedRequest ? record(o.normalizedRequest) : null,
    questions: o.questions
      ? {
          required: Array.isArray(questionsRaw.required)
            ? questionsRaw.required.map(normalizeQuestion).filter((q): q is PriceQuestion => q !== null)
            : [],
          optional: Array.isArray(questionsRaw.optional)
            ? questionsRaw.optional.map(normalizeQuestion).filter((q): q is PriceQuestion => q !== null)
            : [],
        }
      : null,
    missingRequiredQuestions: Array.isArray(o.missingRequiredQuestions)
      ? o.missingRequiredQuestions
          .map(normalizeQuestion)
          .filter((q): q is PriceQuestion => q !== null)
      : [],
    uiCopy: {
      headline: String(uiCopyRaw.headline ?? ''),
      body: String(uiCopyRaw.body ?? ''),
      showAmount: uiCopyRaw.showAmount === true,
      cta: String(uiCopyRaw.cta ?? ''),
    },
  }
}
