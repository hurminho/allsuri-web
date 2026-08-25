export const CATEGORIES = [
  '누수',
  '화장실',
  '배관',
  '방수',
  '주방',
  '리모델링',
  '기타',
] as const

export type QuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'yes_no'
  | 'short_text'
  | 'photo_optional'

export type InterviewAnswer = {
  questionId: string
  question: string
  answer: string
}

export type NextQuestion = {
  id: string
  question: string
  type: QuestionType
  options?: { value: string; label: string }[]
}

export type FinalOrderDraft = {
  title: string
  category: string
  subcategory: string
  workLocation: string
  description: string
  urgency: 'low' | 'normal' | 'high'
  symptoms: string[]
  contractorCheckpoints: string[]
  unknownItems: string[]
  confidence: number
}

export type InterviewResult = {
  readyToFinalize: boolean
  summary: string
  categoryCandidates: { category: string; confidence: number }[]
  knownFacts: string[]
  missingInformation: string[]
  nextQuestion?: NextQuestion
  finalOrder?: FinalOrderDraft
}

const SYSTEM_PROMPT = `너는 설비공사 접수 도우미다.
사용자는 설비 전문가가 아니므로 전문용어를 요구하지 않는다.
사용자의 짧은 설명에서 가능한 문제를 추정하고, 견적 요청을 작성하기 위해 필요한 최소한의 질문만 한다.
한 번에 질문 하나만 한다. 가능하면 선택형 질문을 사용한다.
2~4개의 질문 안에 문제를 명확하게 만드는 것을 목표로 한다. 최대 질문 수는 5개다.
사용자가 모르는 항목은 "잘 모르겠어요"를 허용한다.
AI는 확정 진단을 하지 않는다. 가격을 임의로 생성하지 않는다.
허용 공종(category)은 오직 다음이다: ${CATEGORIES.join(', ')}
정보가 충분하면 readyToFinalize=true 와 finalOrder 를 반환한다.
결과는 반드시 JSON 한 객체만 반환한다.`

export function buildUserPrompt(input: {
  initialText: string
  answers: InterviewAnswer[]
  photoNotes?: string
}): string {
  const lines = [
    `한줄 설명: ${input.initialText}`,
    `이전 질문 수: ${input.answers.length}`,
    ...input.answers.map((a, i) => `Q${i + 1} (${a.questionId}) ${a.question} → ${a.answer}`),
  ]
  if (input.photoNotes) lines.push(`사진 관찰(추정, 확정 아님): ${input.photoNotes}`)
  if (input.answers.length >= 5) {
    lines.push('질문 한도에 도달했다. 더 묻지 말고 readyToFinalize=true 로 오더 초안을 작성하라.')
  }
  lines.push(`JSON 키: readyToFinalize, summary, categoryCandidates[{category,confidence}], knownFacts, missingInformation, nextQuestion{id,question,type,options[{value,label}]}, finalOrder{title,category,subcategory,workLocation,description,urgency,symptoms,contractorCheckpoints,unknownItems,confidence}`)
  return lines.join('\n')
}

export function parseInterviewResult(raw: unknown): InterviewResult {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const ready = Boolean(o.readyToFinalize ?? o.ready_to_finalize)
  const next = o.nextQuestion as Record<string, unknown> | undefined
  const fo = o.finalOrder as Record<string, unknown> | undefined
  const cats = Array.isArray(o.categoryCandidates) ? o.categoryCandidates : []
  const category = normalizeCategory(
    String(fo?.category || cats[0]?.category || '기타'),
  )
  const result: InterviewResult = {
    readyToFinalize: ready,
    summary: String(o.summary || ''),
    categoryCandidates: cats
      .map((c) => {
        const row = c as Record<string, unknown>
        return {
          category: normalizeCategory(String(row.category || '기타')),
          confidence: Number(row.confidence) || 0,
        }
      })
      .filter((c) => c.category),
    knownFacts: asStringArray(o.knownFacts),
    missingInformation: asStringArray(o.missingInformation),
  }
  if (!ready && next?.question) {
    result.nextQuestion = {
      id: String(next.id || 'q'),
      question: String(next.question),
      type: normalizeType(String(next.type || 'single_choice')),
      options: Array.isArray(next.options)
        ? (next.options as Record<string, unknown>[]).map((opt) => ({
            value: String(opt.value || opt.label || ''),
            label: String(opt.label || opt.value || ''),
          }))
        : defaultUnknownOptions(),
    }
  }
  if (ready || fo) {
    result.finalOrder = {
      title: String(fo?.title || result.summary || '현장 점검 요청'),
      category,
      subcategory: String(fo?.subcategory || ''),
      workLocation: String(fo?.workLocation || fo?.work_location || ''),
      description: String(fo?.description || result.summary),
      urgency: normalizeUrgency(String(fo?.urgency || 'normal')),
      symptoms: asStringArray(fo?.symptoms),
      contractorCheckpoints: asStringArray(fo?.contractorCheckpoints ?? fo?.contractor_checkpoints),
      unknownItems: asStringArray(fo?.unknownItems ?? fo?.unknown_items),
      confidence: Number(fo?.confidence ?? fo?.ai_confidence) || 0,
    }
    result.readyToFinalize = true
  }
  return result
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x)).filter(Boolean)
}

function normalizeCategory(value: string): string {
  const hit = CATEGORIES.find((c) => value.includes(c))
  return hit || '기타'
}

function normalizeType(value: string): QuestionType {
  const allowed: QuestionType[] = ['single_choice', 'multi_choice', 'yes_no', 'short_text', 'photo_optional']
  return allowed.includes(value as QuestionType) ? (value as QuestionType) : 'single_choice'
}

function normalizeUrgency(value: string): 'low' | 'normal' | 'high' {
  if (value === 'low' || value === 'high') return value
  return 'normal'
}

function defaultUnknownOptions() {
  return [
    { value: 'unknown', label: '잘 모르겠어요' },
    { value: 'other', label: '기타' },
  ]
}

export { SYSTEM_PROMPT }
