'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase, CATEGORIES } from '@/lib/supabase'
import type { FinalOrderDraft, InterviewAnswer, NextQuestion } from '@/lib/ai-order'
import type { StructuredIntake } from '@/lib/ai-structure'
import type {
  PriceEnums,
  PriceEstimateResponse,
  PriceQuestion,
  TradeSummary,
} from '@/lib/price-engine'
import PriceEstimateCard from '@/components/PriceEstimateCard'

type Phase = 'input' | 'question' | 'confirm' | 'done' | 'fallback'

type CatalogPayload = {
  trades: TradeSummary[]
  questions: PriceQuestion[]
  enums: PriceEnums
}

// 가격 엔진이 카탈로그를 못 줄 때만 쓰는 한국어 기본 라벨.
const URGENCY_FALLBACK_LABELS: Record<string, string> = {
  emergency: '지금 당장(긴급)',
  today: '오늘 안에',
  soon: '2~3일 안',
  normal: '급하지 않아요',
}
const PROPERTY_FALLBACK_LABELS: Record<string, string> = {
  apartment: '아파트',
  villa: '빌라·다세대',
  house: '단독주택',
  officetel: '오피스텔',
  commercial: '상가·매장',
  office: '사무실',
  other: '그 외',
}

function track(event: string, extra?: Record<string, unknown>) {
  console.log('[ai_order_event]', event, extra || {})
}

export default function AiInterview() {
  const [phase, setPhase] = useState<Phase>('input')
  const [text, setText] = useState('')
  const [sessionId] = useState(() => crypto.randomUUID())
  const [answers, setAnswers] = useState<InterviewAnswer[]>([])
  const [question, setQuestion] = useState<NextQuestion | null>(null)
  const [draft, setDraft] = useState<FinalOrderDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('기타')
  const [subcategory, setSubcategory] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [addressDetail, setAddressDetail] = useState('')
  const [visitDate, setVisitDate] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [submittedId, setSubmittedId] = useState('')

  // 가격 엔진 관련 상태 (금액은 전부 서버에서 옵니다)
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null)
  const [structured, setStructured] = useState<StructuredIntake | null>(null)
  const [price, setPrice] = useState<PriceEstimateResponse | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [tradeId, setTradeId] = useState('')
  const [urgency, setUrgency] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [extraAnswers, setExtraAnswers] = useState<Record<string, string>>({})
  const skipNextEstimate = useRef(true)
  const estimateSeq = useRef(0)

  const wrappingUp = loading && answers.length >= 3
  const progress = useMemo(
    () => (phase === 'confirm' ? 1 : Math.min((answers.length + (phase === 'question' ? 1 : 0)) / 4, 0.9)),
    [answers.length, phase],
  )

  const categoryOptions = useMemo(() => {
    const fromCatalog = (catalog?.trades || []).map((t) => t.category)
    return Array.from(new Set([...CATEGORIES, ...fromCatalog]))
  }, [catalog])

  const tradesForCategory = useMemo(
    () => (catalog?.trades || []).filter((t) => t.category === category),
    [catalog, category],
  )

  const urgencyOptions = useMemo(
    () => enumOptions(catalog, 'urgency', URGENCY_FALLBACK_LABELS),
    [catalog],
  )
  const propertyOptions = useMemo(
    () => enumOptions(catalog, 'propertyType', PROPERTY_FALLBACK_LABELS),
    [catalog],
  )

  // 최대 3개까지만 추가 질문을 노출합니다.
  const extraQuestions: PriceQuestion[] = useMemo(() => {
    const fromEngine = (price?.missingRequiredQuestions || []).slice(0, 3)
    if (fromEngine.length > 0) return fromEngine
    return (structured?.suggestedQuestions || []).slice(0, 3).map((q, i) => ({
      id: `ai_q${i + 1}`,
      label: q,
      inputType: 'text' as const,
      options: [],
    }))
  }, [price, structured])

  async function callAi(nextAnswers: InterviewAnswer[]) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/order-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          initialText: text.trim(),
          answers: nextAnswers,
          photoUrls,
          address: address.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error === 'ai_unavailable') {
        setPhase('fallback')
        return
      }
      if (json.readyToFinalize && json.analysis?.finalOrder) {
        const fo = json.analysis.finalOrder as FinalOrderDraft
        const st = (json.structured || null) as StructuredIntake | null
        setDraft(fo)
        setTitle(fo.title)
        setCategory(st?.category || fo.category || '기타')
        setSubcategory(st?.subcategory || fo.subcategory || '')
        setDescription(
          fo.description.includes('[방문 시') || fo.description.includes('[확인된 내용]')
            ? fo.description
            : [
                fo.description,
                fo.workLocation ? `현장: ${fo.workLocation}` : '',
                fo.contractorCheckpoints?.length ? `사업자 확인: ${fo.contractorCheckpoints.join(', ')}` : '',
              ].filter(Boolean).join('\n'),
        )
        setStructured(st)
        setCatalog((json.catalog || null) as CatalogPayload | null)
        setPrice((json.price || null) as PriceEstimateResponse | null)
        setTradeId(st?.tradeId || '')
        setUrgency(fo.urgency === 'high' ? 'today' : 'normal')
        // 서버가 이미 계산해 준 값을 그대로 쓰고, 고객이 수정할 때부터 다시 계산합니다.
        skipNextEstimate.current = true
        setPhase('confirm')
        track('ai_order_ready', { sessionId, priceState: json.price?.priceState || null })
        return
      }
      if (json.nextQuestion) {
        setQuestion(json.nextQuestion)
        setPhase('question')
        return
      }
      setPhase('fallback')
    } catch {
      setPhase('fallback')
    } finally {
      setLoading(false)
    }
  }

  // 공정·긴급도·건물 유형·추가 답변이 바뀌면 500ms 뒤 다시 계산합니다.
  useEffect(() => {
    if (phase !== 'confirm') return
    if (skipNextEstimate.current) {
      skipNextEstimate.current = false
      return
    }
    const seq = ++estimateSeq.current
    setPriceLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/price/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            tradeId: tradeId || undefined,
            category,
            subcategory: subcategory || undefined,
            text: [text.trim(), description].filter(Boolean).join('\n').slice(0, 2000),
            address: address.trim() || undefined,
            urgency: urgency || undefined,
            propertyType: propertyType || undefined,
            answers: extraAnswers,
          }),
        })
        const json = await res.json()
        if (seq !== estimateSeq.current) return
        setPrice((json?.price || null) as PriceEstimateResponse | null)
      } catch {
        if (seq === estimateSeq.current) setPrice(null)
      } finally {
        if (seq === estimateSeq.current) setPriceLoading(false)
      }
    }, 500)
    return () => clearTimeout(timer)
    // description/text 는 값이 바뀌어도 재계산 트리거로 쓰지 않습니다(입력 중 과다 호출 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tradeId, category, subcategory, urgency, propertyType, address, extraAnswers, sessionId])

  function selectTrade(id: string) {
    const trade = (catalog?.trades || []).find((t) => t.id === id)
    setTradeId(id)
    if (trade) {
      setCategory(trade.category)
      setSubcategory(trade.subcategory)
    }
    track('ai_order_trade_selected', { sessionId, tradeId: id })
  }

  async function start() {
    if (text.trim().length < 5) {
      setError('상황을 5자 이상 적어 주세요.')
      return
    }
    track('ai_order_started', { sessionId })
    await callAi([])
  }

  async function answer(value: string, label?: string) {
    if (!question) return
    const next = [...answers, { questionId: question.id, question: question.question, answer: label || value }]
    setAnswers(next)
    track('ai_order_question_answered', { sessionId, questionId: question.id })
    await callAi(next)
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return
    const urls: string[] = [...photoUrls]
    for (const file of Array.from(files).slice(0, 5 - urls.length)) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `web/ai/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('attachments_estimates')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (!uploadError) {
        const { data } = supabase.storage.from('attachments_estimates').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
    }
    setPhotoUrls(urls)
    track('ai_order_photo_added', { sessionId, count: urls.length })
  }

  async function submitExistingOrder() {
    if (!title.trim() || !category || !address.trim() || !visitDate || !name.trim() || !phone.trim() || pin.length !== 4) {
      setError('제목, 공종, 주소, 방문일, 이름, 전화번호, 4자리 비밀번호를 모두 입력해 주세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/customer/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          address: address.trim(),
          addressDetail: addressDetail.trim(),
          visitDate,
          category,
          customerName: name.trim(),
          customerPhone: phone.replace(/[-\s]/g, ''),
          customerEmail: null,
          pin,
          imageUrls: photoUrls,
          // 구조화 정보 (AI 는 분류·요약만, 금액은 관여하지 않습니다)
          tradeId: tradeId || price?.trade?.id || null,
          subcategory: subcategory.trim() || null,
          symptomTags: structured?.symptomTags || [],
          propertyType: propertyType || null,
          urgency: urgency || null,
          aiSummary: draft?.title || null,
          aiMissingFields: structured?.missingFields || [],
          aiConfidence: structured?.confidence ?? draft?.confidence ?? null,
          // 가격 스냅샷 (전부 가격 엔진 값)
          priceEngineVersion: price?.engineVersion || null,
          priceState: price?.priceState || null,
          estimatedMin: price?.estimatedMin ?? null,
          estimatedMax: price?.estimatedMax ?? null,
          priceConfidenceLevel: price?.confidenceLevel || null,
          priceEvidenceCount: price?.evidenceCount ?? null,
          priceFactors: price?.factors || [],
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || '요청 저장에 실패했습니다.')
        return
      }
      setSubmittedId(json.orderId)
      setPhase('done')
      track('ai_order_submitted', { sessionId, orderId: json.orderId })
    } catch {
      setError('요청 저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 md:p-8">
      {phase !== 'done' && (
        <div className="mb-6">
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${phase === 'confirm' ? 100 : Math.max(8, progress * 100)}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {wrappingUp ? '답변을 바탕으로 현장 상황을 정리하고 있어요' : '필요한 내용만 이어서 확인해요'}
          </p>
        </div>
      )}

      {phase === 'input' && (
        <>
          <h2 className="text-xl font-bold text-gray-900 mb-2">어떤 문제가 있나요?</h2>
          <p className="text-sm text-gray-500 mb-4">무슨 공사인지 몰라도 괜찮아요. 상황을 한 줄로 알려주세요.</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            rows={4}
            placeholder="예: 싱크대 밑에서 물이 새요."
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{text.length}/500</p>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          <button
            type="button"
            disabled={loading}
            onClick={start}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl disabled:opacity-60"
          >
            {loading ? (wrappingUp ? '현장 상황 정리 중...' : '다음 질문으로...') : 'AI에게 알려주기'}
          </button>
        </>
      )}

      {phase === 'question' && question && (
        <>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{question.question}</h2>
          <p className="text-xs text-gray-400 mb-4">선택만 하시면 됩니다. 모르면 “잘 모르겠어요”를 눌러 주세요.</p>
          <div className="grid gap-2">
            {(question.options && question.options.length > 0
              ? question.options
              : [{ value: 'unknown', label: '잘 모르겠어요' }]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={loading}
                onClick={() => answer(opt.value, opt.label)}
                className="text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50 font-medium text-gray-800 disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
          </div>
          {question.type === 'short_text' && (
            <ShortAnswer disabled={loading} onSubmit={(v) => answer(v)} />
          )}
          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => fileRef.current?.click()} className="text-sm text-blue-600 font-semibold">사진 추가</button>
            <Link href="/requests?mode=manual" className="text-sm text-gray-500" onClick={() => track('ai_order_fallback_manual', { sessionId })}>직접 작성할게요</Link>
          </div>
        </>
      )}

      {phase === 'confirm' && draft && (
        <>
          <h2 className="text-xl font-bold text-gray-900 mb-1">요청 내용을 확인해 주세요</h2>
          <p className="text-sm text-gray-500 mb-5">AI 초안입니다. 원하시면 수정한 뒤 기존 견적 요청으로 등록됩니다.</p>

          <div className="mb-5">
            <PriceEstimateCard price={price} loading={priceLoading} onSelectTrade={selectTrade} />
          </div>

          <label className="block text-sm font-semibold mb-1">요청 제목</label>
          <input value={title} onChange={(e) => { setTitle(e.target.value); track('ai_order_edited') }} className="w-full border rounded-xl px-3 py-2 mb-3" />
          <label className="block text-sm font-semibold mb-1">공종</label>
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setTradeId(''); }}
            className="w-full border rounded-xl px-3 py-2 mb-3"
          >
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="block text-sm font-semibold mb-1">세부 공종</label>
          {tradesForCategory.length > 0 ? (
            <select
              value={tradeId}
              onChange={(e) => {
                if (e.target.value) selectTrade(e.target.value)
                else setTradeId('')
              }}
              className="w-full border rounded-xl px-3 py-2 mb-3"
            >
              <option value="">직접 입력할게요</option>
              {tradesForCategory.map((t) => (
                <option key={t.id} value={t.id}>{t.subcategory}</option>
              ))}
            </select>
          ) : null}
          {(tradesForCategory.length === 0 || !tradeId) && (
            <input
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder="예: 변기 막힘"
              className="w-full border rounded-xl px-3 py-2 mb-3"
            />
          )}

          <label className="block text-sm font-semibold mb-1">긴급 여부</label>
          <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-3">
            <option value="">선택 안 함</option>
            {urgencyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label className="block text-sm font-semibold mb-1">주택/상가 유형</label>
          <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-3">
            <option value="">선택 안 함</option>
            {propertyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {extraQuestions.length > 0 && (
            <div className="mb-4 rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-800 mb-1">몇 가지만 더 알려주시면 범위가 좁혀져요</p>
              <p className="text-xs text-gray-400 mb-3">답하지 않으셔도 견적 요청은 가능합니다.</p>
              {extraQuestions.map((q) => (
                <div key={q.id} className="mb-3 last:mb-0">
                  <label className="block text-sm text-gray-700 mb-1">{q.label}</label>
                  {q.options && q.options.length > 0 ? (
                    <select
                      value={extraAnswers[q.id] || ''}
                      onChange={(e) => setExtraAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2"
                    >
                      <option value="">선택 안 함</option>
                      {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input
                      value={extraAnswers[q.id] || ''}
                      onChange={(e) => setExtraAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2"
                      placeholder="간단히 적어 주세요"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <label className="block text-sm font-semibold mb-1">현장 상황</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="w-full border rounded-xl px-3 py-2 mb-3" />
          {draft.contractorCheckpoints.length > 0 && (
            <div className="mb-4 bg-blue-50 rounded-xl p-3 text-sm text-gray-700">
              <p className="font-semibold mb-1">사업자 확인 요청</p>
              <ul className="list-disc pl-5">{draft.contractorCheckpoints.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
          <label className="block text-sm font-semibold mb-1">주소</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="도로명 주소" className="w-full border rounded-xl px-3 py-2 mb-2" />
          <input value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)} placeholder="상세 주소" className="w-full border rounded-xl px-3 py-2 mb-3" />
          <label className="block text-sm font-semibold mb-1">방문 희망일</label>
          <input type="date" min={tomorrow} value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-3" />
          <label className="block text-sm font-semibold mb-1">이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-3" />
          <label className="block text-sm font-semibold mb-1">휴대폰</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01012345678" className="w-full border rounded-xl px-3 py-2 mb-3" />
          <label className="block text-sm font-semibold mb-1">조회용 4자리 비밀번호</label>
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="w-full border rounded-xl px-3 py-2 mb-3" />
          {photoUrls.length > 0 && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {photoUrls.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="" className="w-16 h-16 object-cover rounded-lg" />
              ))}
            </div>
          )}
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <div className="flex gap-2">
            <Link href="/requests?mode=manual" className="flex-1 text-center border rounded-xl py-3 font-semibold text-gray-700">수정·직접 작성</Link>
            <button type="button" disabled={loading} onClick={submitExistingOrder} className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold rounded-xl py-3 disabled:opacity-60">
              {loading ? '등록 중...' : '이 내용으로 견적 요청하기'}
            </button>
          </div>
        </>
      )}

      {phase === 'fallback' && (
        <div className="text-center py-6">
          <p className="text-gray-800 font-semibold mb-2">AI 분석에 잠시 문제가 발생했어요. 직접 요청서를 작성할 수 있습니다.</p>
          <Link href="/requests?mode=manual" onClick={() => track('ai_order_fallback_manual', { sessionId })} className="inline-block mt-3 bg-blue-600 text-white font-bold px-6 py-3 rounded-xl">직접 작성하기</Link>
        </div>
      )}

      {phase === 'done' && (
        <div className="text-center py-6">
          <p className="text-xl font-bold text-gray-900 mb-2">견적 요청이 접수되었습니다</p>
          <p className="text-sm text-gray-500 mb-4">전화번호와 비밀번호로 내 견적에서 확인할 수 있습니다.</p>
          <Link href={`/my-order?phone=${encodeURIComponent(phone.replace(/[-\s]/g, ''))}`} className="inline-block bg-blue-600 text-white font-bold px-6 py-3 rounded-xl">내 견적 보기</Link>
          {submittedId && <p className="text-xs text-gray-400 mt-3">요청 번호 {submittedId.slice(0, 8)}</p>}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
    </div>
  )
}

/** 카탈로그 enums + questions 라벨로 select 옵션을 만듭니다. 카탈로그가 없으면 기본 라벨. */
function enumOptions(
  catalog: CatalogPayload | null,
  mapsTo: 'urgency' | 'propertyType',
  fallbackLabels: Record<string, string>,
): { value: string; label: string }[] {
  const values =
    (mapsTo === 'urgency' ? catalog?.enums?.urgency : catalog?.enums?.propertyType) ||
    Object.keys(fallbackLabels)
  const question = (catalog?.questions || []).find((q) => q.mapsTo === mapsTo)
  return values.map((value) => {
    const fromCatalog = question?.options?.find((o) => o.value === value)?.label
    return { value, label: fromCatalog || fallbackLabels[value] || value }
  })
}

function ShortAnswer({ disabled, onSubmit }: { disabled: boolean; onSubmit: (v: string) => void }) {
  const [v, setV] = useState('')
  return (
    <div className="mt-3 flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} className="flex-1 border rounded-xl px-3 py-2" placeholder="직접 입력" />
      <button type="button" disabled={disabled || v.trim().length < 1} onClick={() => onSubmit(v.trim())} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold">보내기</button>
    </div>
  )
}
