// OpenAI 출력 → 검증된 구조화 데이터.
//
// AI 가 할 수 있는 일은 공정 분류 / 증상 요약 / 추가 질문 생성 / 사진·문장 기반 정보 추출뿐입니다.
// 금액·가격·견적가는 어떤 경우에도 AI 에서 오지 않습니다. 아래 파서는 금액처럼 보이는 값을
// 읽지도, 통과시키지도 않습니다. 모든 금액은 가격 엔진(/api/price/estimate)에서만 옵니다.

import { CATEGORIES } from './ai-order'
import type { PriceCatalog } from './price-engine'

export type StructuredIntake = {
  category: string | null
  subcategory: string | null
  tradeId: string | null
  symptomTags: string[]
  missingFields: string[]
  suggestedQuestions: string[]
  confidence: number
  ambiguous: boolean
  candidates: { tradeId: string; category: string; subcategory: string }[]
}

export const STRUCTURE_SYSTEM_PROMPT = `너는 설비 수리 접수 내용을 구조화하는 분류기다.
반드시 JSON 객체 하나만 출력한다. 설명 문장, 마크다운, 코드펜스를 쓰지 않는다.

JSON 키는 정확히 다음 5개만 사용한다:
- category: 문자열. 허용된 공종 목록 중 하나만 고른다. 확신이 없으면 null.
- subcategory: 문자열. 허용된 세부 공정 목록 중 하나만 고른다. 확신이 없으면 null.
- symptomTags: 문자열 배열. 고객이 말한 증상만 담는다. 추측한 원인은 담지 않는다.
- missingFields: 문자열 배열. 견적을 위해 아직 확인되지 않은 정보 항목.
- suggestedQuestions: 문자열 배열. 고객에게 물어볼 짧은 한국어 질문 최대 3개.

절대 금지:
- 금액, 가격, 견적가, 비용, 단가, 예상 비용, 숫자 원(예: 100,000원)을 어떤 키에도 쓰지 않는다.
- price/amount/cost 같은 키를 추가하지 않는다. 금액은 별도의 가격 엔진이 계산한다.
- 확정 진단을 쓰지 않는다. 원인은 "가능성"으로만 다루고, 확정된 사실처럼 쓰지 않는다.
- 허용 목록에 없는 공종·세부 공정을 만들어내지 않는다. 없으면 null 을 쓴다.`

export function buildStructurePrompt(input: {
  initialText: string
  answers: { question: string; answer: string }[]
  photoCount?: number
  allowedCategories: string[]
  allowedSubcategories: string[]
}): string {
  const lines = [
    '아래 접수 내용을 구조화하라.',
    `고객 한 줄 설명: ${input.initialText}`,
  ]
  for (const [i, a] of input.answers.entries()) {
    lines.push(`Q${i + 1} ${a.question} → ${a.answer}`)
  }
  if (input.photoCount && input.photoCount > 0) {
    lines.push(`첨부 사진 ${input.photoCount}장 (확정 아님, 참고만)`)
  }
  lines.push(
    `허용 공종(category): ${input.allowedCategories.join(', ') || '없음'}`,
    `허용 세부 공정(subcategory): ${input.allowedSubcategories.join(', ') || '없음'}`,
    '허용 목록에 맞는 값이 없으면 해당 키는 null 로 둔다.',
    'suggestedQuestions 는 금액을 묻는 질문이 아니라, 현장 조건을 확인하는 질문이어야 한다.',
    'JSON 키: category, subcategory, symptomTags, missingFields, suggestedQuestions',
  )
  return lines.join('\n')
}

// -----------------------------------------------------------------------------
// 금액 차단
// -----------------------------------------------------------------------------

/** 이 정규식에 걸리는 "키"는 AI 출력에서 아예 읽지 않습니다. */
export const PRICE_LIKE_PATTERN = /(price|amount|cost|금액|가격|견적가|원)/i

/** 금액 표현으로 보이는 문자열인지 판단합니다. */
export function looksLikePrice(value: unknown): boolean {
  const s = String(value ?? '').trim()
  if (!s) return false
  // 숫자 + 원/만원 (예: "80,000원", "10만원")
  if (/\d[\d,.]*\s*(원|만원|천원|만\s*원)/.test(s)) return true
  // 금액을 직접 가리키는 낱말
  if (/(금액|가격|견적가|단가|비용|price|amount|cost|fee|budget)/i.test(s)) return true
  return false
}

/** 금액처럼 보이는 키를 통째로 제거한 얕은 복사본을 만듭니다. */
export function stripPriceKeys(raw: unknown): Record<string, unknown> {
  const o = asRecord(raw)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (PRICE_LIKE_PATTERN.test(k)) continue
    out[k] = v
  }
  return out
}

// -----------------------------------------------------------------------------
// 파싱
// -----------------------------------------------------------------------------

function asRecord(raw: unknown): Record<string, unknown> {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return {}
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) return o[k]
  }
  return undefined
}

function toStringList(v: unknown): string[] {
  if (v === null || v === undefined) return []
  const arr = Array.isArray(v) ? v : [v]
  const out: string[] = []
  for (const item of arr) {
    if (item === null || item === undefined) continue
    if (typeof item === 'object') continue
    const s = String(item).trim()
    if (!s) continue
    if (!out.includes(s)) out.push(s)
  }
  return out
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export type SubcategoryMatch = {
  tradeId: string | null
  subcategory: string | null
  ambiguous: boolean
  candidates: { tradeId: string; category: string; subcategory: string }[]
}

/** 카탈로그의 subcategory / aliases 에 대해 정확 일치 → 부분 일치 순으로 공정을 찾습니다. */
export function matchTrade(
  catalog: PriceCatalog,
  category: string | null,
  subcategoryRaw: string | null,
): SubcategoryMatch {
  const pool = category
    ? catalog.trades.filter((t) => t.category === category)
    : catalog.trades
  const asCandidate = (t: { id: string; category: string; subcategory: string }) => ({
    tradeId: t.id,
    category: t.category,
    subcategory: t.subcategory,
  })
  const poolCandidates = (category ? pool : []).map(asCandidate)

  const needle = String(subcategoryRaw ?? '').trim()
  if (!needle) {
    return { tradeId: null, subcategory: null, ambiguous: true, candidates: poolCandidates }
  }

  const exact = pool.filter(
    (t) => t.subcategory === needle || (t.aliases || []).some((a) => a === needle),
  )
  if (exact.length === 1) {
    return {
      tradeId: exact[0].id,
      subcategory: exact[0].subcategory,
      ambiguous: false,
      candidates: [],
    }
  }
  if (exact.length > 1) {
    return {
      tradeId: null,
      subcategory: null,
      ambiguous: true,
      candidates: exact.map(asCandidate),
    }
  }

  const loose = pool.filter((t) => {
    const terms = [t.subcategory, ...(t.aliases || [])].filter(Boolean)
    return terms.some((term) => term.includes(needle) || needle.includes(term))
  })
  if (loose.length === 1) {
    return {
      tradeId: loose[0].id,
      subcategory: loose[0].subcategory,
      ambiguous: false,
      candidates: [],
    }
  }
  if (loose.length > 1) {
    return { tradeId: null, subcategory: null, ambiguous: true, candidates: loose.map(asCandidate) }
  }

  return { tradeId: null, subcategory: null, ambiguous: true, candidates: poolCandidates }
}

/**
 * AI 출력(JSON)에서 검증된 구조만 뽑아냅니다.
 * null/undefined/배열/스네이크케이스/이상한 타입 어떤 것이 와도 예외를 던지지 않습니다.
 */
export function parseStructuredIntake(
  raw: unknown,
  catalog: PriceCatalog | null,
): StructuredIntake {
  const o = stripPriceKeys(asRecord(raw))

  const allowedCategories = catalog?.categories?.length
    ? catalog.categories
    : (CATEGORIES as readonly string[]).slice()

  const rawCategory = String(pick(o, 'category', 'trade_category') ?? '').trim()
  const category = allowedCategories.includes(rawCategory) ? rawCategory : null

  const rawSubcategory = String(pick(o, 'subcategory', 'sub_category') ?? '').trim() || null

  let tradeId: string | null = null
  let subcategory: string | null = null
  let ambiguous = true
  let candidates: StructuredIntake['candidates'] = []
  let allowedSymptomTags: string[] = []

  if (catalog) {
    const match = matchTrade(catalog, category, rawSubcategory)
    tradeId = match.tradeId
    subcategory = match.subcategory
    ambiguous = match.ambiguous
    candidates = match.candidates
    const trade = tradeId ? catalog.trades.find((t) => t.id === tradeId) : null
    if (trade) {
      allowedSymptomTags = trade.symptomTags
    } else {
      const pool = category ? catalog.trades.filter((t) => t.category === category) : catalog.trades
      allowedSymptomTags = Array.from(new Set(pool.flatMap((t) => t.symptomTags)))
    }
  } else {
    // 카탈로그가 없으면 공정(tradeId)을 확정할 근거가 없습니다.
    subcategory = rawSubcategory && !looksLikePrice(rawSubcategory) ? rawSubcategory : null
    ambiguous = true
    candidates = []
    allowedSymptomTags = []
  }

  const symptomTags = toStringList(pick(o, 'symptomTags', 'symptom_tags', 'symptoms')).filter(
    (tag) => allowedSymptomTags.includes(tag),
  )

  const missingFields = toStringList(pick(o, 'missingFields', 'missing_fields', 'missingInformation'))
    .filter((s) => !looksLikePrice(s))
    .slice(0, 10)

  const suggestedQuestions = toStringList(
    pick(o, 'suggestedQuestions', 'suggested_questions', 'questions'),
  )
    .filter((s) => !looksLikePrice(s))
    .slice(0, 3)

  const rawConfidence = pick(o, 'confidence', 'ai_confidence')
  const confidence =
    rawConfidence === undefined
      ? tradeId
        ? 0.6
        : category
          ? 0.4
          : 0
      : clamp01(Number(rawConfidence))

  return {
    category,
    subcategory,
    tradeId,
    symptomTags,
    missingFields,
    suggestedQuestions,
    confidence,
    ambiguous,
    candidates,
  }
}
