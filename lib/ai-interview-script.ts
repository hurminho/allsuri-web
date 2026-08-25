import type { InterviewAnswer, NextQuestion } from './ai-order'
import { CATEGORIES } from './ai-order'

export const MIN_ANSWERS_BEFORE_FINALIZE = 3
export const MAX_INTERVIEW_QUESTIONS = 5

const UNKNOWN = { value: 'unknown', label: '잘 모르겠어요' }

function choice(id: string, question: string, options: { value: string; label: string }[]): NextQuestion {
  return { id, question, type: 'single_choice', options: [...options, UNKNOWN] }
}

export function inferCategory(text: string): (typeof CATEGORIES)[number] {
  if (/옥상|외벽|방수|누름|우레탄/.test(text)) return '방수'
  if (/변기|세면대|샤워|화장실/.test(text)) return '화장실'
  if (/싱크|주방|가스레인지|후드/.test(text)) return '주방'
  if (/수전|수도꼭지/.test(text)) return /화장실|욕실/.test(text) ? '화장실' : '주방'
  if (/누수|물\s*새|물이 새|천장|곰팡이|젖어/.test(text)) return '누수'
  if (/배관|막힘|악취|하수|배수/.test(text)) return '배관'
  if (/리모델링|인테리어/.test(text)) return '리모델링'
  return '기타'
}

function scriptFor(category: string): NextQuestion[] {
  const when = choice('when', '언제부터 증상이 있었나요?', [
    { value: 'today', label: '오늘부터' },
    { value: 'few_days', label: '2~3일 전' },
    { value: 'week_plus', label: '일주일 이상' },
  ])
  const usage = choice('usage', '지금 사용은 어떤가요?', [
    { value: 'unusable', label: '지금은 쓰기 어려워요' },
    { value: 'inconvenient', label: '불편하지만 쓸 수는 있어요' },
    { value: 'not_urgent', label: '급하지는 않아요' },
  ])

  if (category === '누수') {
    return [
      choice('where', '물이 새거나 젖은 곳은 어디인가요?', [
        { value: 'ceiling', label: '천장' },
        { value: 'wall', label: '벽' },
        { value: 'floor', label: '바닥' },
        { value: 'veranda', label: '베란다' },
        { value: 'under_sink', label: '싱크대 아래' },
      ]),
      choice('how', '지금은 어떤 상태인가요?', [
        { value: 'drip', label: '똑똑 떨어져요' },
        { value: 'wet', label: '벽·천장·장이 젖어 있어요' },
        { value: 'puddle', label: '바닥에 물이 고여요' },
        { value: 'mold', label: '곰팡이·얼룩이 보여요' },
      ]),
      when,
      choice('stop_valve', '수도를 잠그면 물이 멈추나요?', [
        { value: 'stops', label: '멈추는 것 같아요' },
        { value: 'continues', label: '잠가도 계속 나와요' },
        { value: 'not_tried', label: '아직 안 해봤어요' },
      ]),
    ]
  }

  if (category === '화장실') {
    return [
      choice('fixture', '어떤 부분이 문제인가요?', [
        { value: 'toilet', label: '변기' },
        { value: 'sink', label: '세면대' },
        { value: 'shower', label: '샤워기·수전' },
        { value: 'drain', label: '배수구·바닥' },
      ]),
      choice('symptom', '증상은 어떤가요?', [
        { value: 'clog', label: '물이 안 내려가거나 막혀요' },
        { value: 'leak', label: '물이 새요' },
        { value: 'odor', label: '냄새가 나요' },
        { value: 'replace', label: '교체·수리가 필요해 보여요' },
      ]),
      when,
      usage,
    ]
  }

  if (category === '배관') {
    return [
      choice('symptom', '배관에서 어떤 증상이 있나요?', [
        { value: 'clog', label: '막혀서 물이 안 내려가요' },
        { value: 'odor', label: '하수 냄새가 나요' },
        { value: 'leak', label: '물이 새요' },
        { value: 'noise', label: '이상한 소리가 나요' },
      ]),
      choice('where', '어느 쪽 배관인가요?', [
        { value: 'kitchen', label: '주방' },
        { value: 'bath', label: '화장실' },
        { value: 'veranda', label: '베란다·세탁기' },
        { value: 'unknown_place', label: '잘 모르겠어요' },
      ]),
      when,
      usage,
    ]
  }

  if (category === '방수') {
    return [
      choice('where', '방수가 필요한 곳은 어디인가요?', [
        { value: 'rooftop', label: '옥상' },
        { value: 'exterior', label: '외벽' },
        { value: 'veranda', label: '베란다' },
        { value: 'bath', label: '욕실' },
      ]),
      choice('how', '어떤 증상인가요?', [
        { value: 'rain', label: '비가 오면 물이 들어와요' },
        { value: 'wet', label: '바닥·벽이 젖어요' },
        { value: 'crack', label: '갈라지거나 벗겨졌어요' },
      ]),
      when,
      usage,
    ]
  }

  if (category === '주방') {
    return [
      choice('fixture', '주방 어느 부분인가요?', [
        { value: 'sink_drain', label: '싱크 배수' },
        { value: 'faucet', label: '수전' },
        { value: 'under_cabinet', label: '싱크 아래 장' },
      ]),
      choice('symptom', '증상은 어떤가요?', [
        { value: 'clog', label: '물이 안 내려가요' },
        { value: 'leak', label: '물이 새요' },
        { value: 'odor', label: '냄새가 나요' },
        { value: 'replace', label: '교체가 필요해 보여요' },
      ]),
      when,
      usage,
    ]
  }

  return [
    choice('kind', '어떤 수리가 필요하신가요?', [
      { value: 'leak', label: '물이 새요' },
      { value: 'clog', label: '막혔어요' },
      { value: 'replace', label: '교체·설치가 필요해요' },
      { value: 'other', label: '그 외 점검이 필요해요' },
    ]),
    choice('where', '어느 공간인가요?', [
      { value: 'bath', label: '화장실' },
      { value: 'kitchen', label: '주방' },
      { value: 'room', label: '방·거실' },
      { value: 'outdoor', label: '베란다·옥상' },
    ]),
    when,
    usage,
  ]
}

function isRedundant(q: NextQuestion, text: string): boolean {
  if (q.id === 'fixture') {
    const hits = [ /변기/.test(text), /세면/.test(text), /샤워|수전/.test(text), /싱크/.test(text) ]
    return hits.filter(Boolean).length === 1
  }
  if (q.id === 'where') {
    const hits = [ /천장/.test(text), /벽/.test(text), /바닥/.test(text), /베란다/.test(text), /싱크/.test(text), /옥상/.test(text) ]
    return hits.filter(Boolean).length === 1
  }
  return false
}

export function nextScriptQuestion(initialText: string, answers: InterviewAnswer[]): NextQuestion | null {
  const category = inferCategory(initialText)
  const asked = new Set(answers.map((a) => a.questionId))
  const remaining = scriptFor(category)
    .filter((q) => !isRedundant(q, initialText))
    .filter((q) => !asked.has(q.id))
  if (answers.length >= MAX_INTERVIEW_QUESTIONS) return null
  if (remaining[0]) return remaining[0]
  if (answers.length < MIN_ANSWERS_BEFORE_FINALIZE) {
    const extra = scriptFor(category).filter((q) => !asked.has(q.id))
    return extra[0] || null
  }
  return null
}

export function shouldFinalizeInterview(initialText: string, answers: InterviewAnswer[]): boolean {
  if (answers.length >= MAX_INTERVIEW_QUESTIONS) return true
  if (answers.length < MIN_ANSWERS_BEFORE_FINALIZE) return false
  return nextScriptQuestion(initialText, answers) === null
}

export function answerValue(answers: InterviewAnswer[], id: string): string {
  return answers.find((a) => a.questionId === id)?.answer || ''
}
