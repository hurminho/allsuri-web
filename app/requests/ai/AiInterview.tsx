'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase, CATEGORIES } from '@/lib/supabase'
import type { FinalOrderDraft, InterviewAnswer, NextQuestion } from '@/lib/ai-order'

type Phase = 'input' | 'question' | 'confirm' | 'done' | 'fallback'

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

  const progress = useMemo(() => Math.min(answers.length / 4, 0.95), [answers.length])

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
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error === 'ai_unavailable') {
        setPhase('fallback')
        return
      }
      if (json.readyToFinalize && json.analysis?.finalOrder) {
        const fo = json.analysis.finalOrder as FinalOrderDraft
        setDraft(fo)
        setTitle(fo.title)
        setCategory(fo.category || '기타')
        setSubcategory(fo.subcategory || '')
        setDescription(
          [fo.description, fo.workLocation ? `현장: ${fo.workLocation}` : '', fo.contractorCheckpoints?.length ? `사업자 확인: ${fo.contractorCheckpoints.join(', ')}` : '']
            .filter(Boolean)
            .join('\n'),
        )
        setPhase('confirm')
        track('ai_order_ready', { sessionId })
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
          <p className="text-xs text-gray-400 mt-2">AI가 현장 내용을 확인하고 있어요</p>
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
            {loading ? '분석 중...' : 'AI에게 알려주기'}
          </button>
        </>
      )}

      {phase === 'question' && question && (
        <>
          <h2 className="text-xl font-bold text-gray-900 mb-4">{question.question}</h2>
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
          <label className="block text-sm font-semibold mb-1">요청 제목</label>
          <input value={title} onChange={(e) => { setTitle(e.target.value); track('ai_order_edited') }} className="w-full border rounded-xl px-3 py-2 mb-3" />
          <label className="block text-sm font-semibold mb-1">공종</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-3">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="block text-sm font-semibold mb-1">세부 공종</label>
          <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-3" />
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

function ShortAnswer({ disabled, onSubmit }: { disabled: boolean; onSubmit: (v: string) => void }) {
  const [v, setV] = useState('')
  return (
    <div className="mt-3 flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} className="flex-1 border rounded-xl px-3 py-2" placeholder="직접 입력" />
      <button type="button" disabled={disabled || v.trim().length < 1} onClick={() => onSubmit(v.trim())} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold">보내기</button>
    </div>
  )
}
