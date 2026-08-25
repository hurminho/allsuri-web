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

const SYSTEM_PROMPT = `너는 설비공사 접수서를 작성하는 도우미다.
사용자는 전문가가 아니다. 확정 진단과 가격을 쓰지 않는다.
고객의 한 줄을 그대로 복사하지 마라. 질문 답변을 반영해 사업자가 현장에 가기 전 읽을 수 있는 접수 메모를 만든다.

현장 상황(description)은 반드시 아래 형식으로 4단락 이상 작성한다:
1) 고객 설명: 원래 한 줄
2) 확인된 내용: 위치·증상·시작 시점·사용 가능 여부 (답변 기반 불릿)
3) 추정(확정 아님): 가능한 원인 2~3가지. 각 줄 앞에 "추정:"
4) 방문 시 확인할 항목: 사업자가 볼 체크리스트 4~6개
5) 고객이 모르는 항목: 답변이 "잘 모르겠어요"인 것

허용 공종(category)은 오직 다음이다: ${CATEGORIES.join(', ')}
readyToFinalize=true 와 finalOrder 만 반환한다. 추가 질문은 하지 않는다.
결과는 반드시 JSON 한 객체만 반환한다.`

export function buildUserPrompt(input: {
  initialText: string
  answers: InterviewAnswer[]
  photoNotes?: string
}): string {
  const lines = [
    '이제 질문을 끝냈다. 오더 초안 JSON만 작성하라. nextQuestion은 넣지 마라.',
    `한줄 설명: ${input.initialText}`,
    `이전 질문 수: ${input.answers.length}`,
    ...input.answers.map((a, i) => `Q${i + 1} (${a.questionId}) ${a.question} → ${a.answer}`),
    'description은 고객 한 줄 복붙이 아니라, 확인된 내용·추정·방문 확인 항목이 드러나게 길게 작성하라.',
  ]
  if (input.photoNotes) lines.push(`사진 관찰(추정, 확정 아님): ${input.photoNotes}`)
  lines.push(`JSON 키: readyToFinalize, summary, categoryCandidates[{category,confidence}], knownFacts, missingInformation, finalOrder{title,category,subcategory,workLocation,description,urgency,symptoms,contractorCheckpoints,unknownItems,confidence}`)
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
  // 초안 필드가 있어도 readyToFinalize가 아니면 질문 단계로 둔다.
  if (ready) {
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

export function composeLocalFinalOrder(
  initialText: string,
  answers: InterviewAnswer[],
  category: string,
): FinalOrderDraft {
  const where = answers.find((a) => a.questionId === 'where' || a.questionId === 'fixture')?.answer || ''
  const usage = answers.find((a) => a.questionId === 'usage')?.answer || ''
  const unknownItems = answers.filter((a) => /모르/.test(a.answer)).map((a) => a.question)
  const checkpoints = defaultCheckpoints(category)
  const hypotheses = defaultHypotheses(category, initialText)
  const facts = answers.map((a) => `- ${a.question} ${a.answer}`)
  const description = [
    '[고객 설명]',
    initialText,
    '',
    '[확인된 내용]',
    ...facts,
    '',
    '[추정 (확정 아님)]',
    ...hypotheses.map((h) => `- 추정: ${h}`),
    '',
    '[방문 시 확인할 항목]',
    ...checkpoints.map((c) => `- ${c}`),
    ...(unknownItems.length
      ? ['', '[고객이 모르는 항목]', ...unknownItems.map((u) => `- ${u}`)]
      : []),
    '',
    'AI 예상은 현장 확인 전 참고입니다. 확정 진단이 아닙니다.',
  ].join('\n')

  return {
    title: `${category} 점검 요청${where ? ` · ${where}` : ''}`.slice(0, 60),
    category,
    subcategory: answers.find((a) => a.questionId === 'symptom' || a.questionId === 'how')?.answer || '',
    workLocation: where,
    description,
    urgency: /쓰기 어려|사용 불가|unusable/.test(usage) ? 'high' : /급하지/.test(usage) ? 'low' : 'normal',
    symptoms: [initialText, ...answers.filter((a) => a.questionId === 'how' || a.questionId === 'symptom').map((a) => a.answer)],
    contractorCheckpoints: checkpoints,
    unknownItems,
    confidence: 0.5,
  }
}

function defaultCheckpoints(category: string): string[] {
  if (category === '누수') {
    return ['누수 지점(급수/배수/연결부)', '상부·이웃집 영향 여부', '마감재·장 손상 범위', '긴급 차단 필요 여부', '사진과 실제 위치 대조']
  }
  if (category === '화장실') {
    return ['해당 기구 작동 상태', '배수 속도·역류 여부', '급수 연결부 누수', '교체 vs 수리 범위', '작업 시 물 사용 가능 여부']
  }
  if (category === '배관') {
    return ['막힘 위치(기구/배관)', '악취 원인(트랩/벤트)', '배관 재질·노후', '관통·철거 필요 여부']
  }
  if (category === '방수') {
    return ['방수층 손상 범위', '균열·박리 위치', '빗물 유입 경로', '재시공 vs 부분 보수']
  }
  return ['현장 위치 확인', '증상 재현 여부', '작업 범위와 마감', 'AS 조건']
}

function defaultHypotheses(category: string, text: string): string[] {
  if (category === '누수' || /새/.test(text)) {
    return ['배수 연결부 또는 트랩 누수', '급수 호스·수전 연결부 누수', '벽체·상부 배관 누수']
  }
  if (category === '화장실' || /막/.test(text)) {
    return ['기구 내부 막힘', '배수관 이물질', '노후 수전·패킹 손상']
  }
  if (category === '방수') {
    return ['방수층 노후·균열', '코너·조인트 시공 불량', '배수 불량으로 인한 고임']
  }
  return ['현장 확인이 필요한 설비 점검', '부분 수리 또는 교체 가능', '연관 배관 추가 확인 필요']
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
