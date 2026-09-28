'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, CATEGORIES } from '@/lib/supabase'

type Step = 1 | 2 | 3

const URGENCY_OPTIONS = [
  { value: 'emergency', label: '지금 당장(긴급)' },
  { value: 'today', label: '오늘 안에' },
  { value: 'soon', label: '2~3일 안' },
  { value: 'normal', label: '급하지 않아요' },
]

const PROPERTY_OPTIONS = [
  { value: 'apartment', label: '아파트' },
  { value: 'villa', label: '빌라·다세대' },
  { value: 'house', label: '단독주택' },
  { value: 'officetel', label: '오피스텔' },
  { value: 'commercial', label: '상가·매장' },
  { value: 'office', label: '사무실' },
  { value: 'other', label: '그 외' },
]

const MAX_IMAGES = 5

type Props = {
  slug: string
  contractorName: string
  categories: string[]
}

export default function PersonalLinkRequestForm({ slug, contractorName, categories }: Props) {
  const options = categories.length > 0 ? categories : [...CATEGORIES]

  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploadWarning, setUploadWarning] = useState('')
  const [doneOrderId, setDoneOrderId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const startedRef = useRef(false)

  const [category, setCategory] = useState(options[0] ?? '기타')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [addressDetail, setAddressDetail] = useState('')
  const [visitDate, setVisitDate] = useState('')
  const [urgency, setUrgency] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [consent, setConsent] = useState(false)
  const [images, setImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])

  // 분석 이벤트: 페이지 진입 1회
  useEffect(() => {
    const payload = analyticsPayload(slug)
    void fetch('/api/personal-link/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, eventType: 'page_view' }),
    }).catch(() => {})
  }, [slug])

  function markStarted() {
    if (startedRef.current) return
    startedRef.current = true
    void fetch('/api/personal-link/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...analyticsPayload(slug), eventType: 'quote_start' }),
    }).catch(() => {})
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length === 0) return
    const next = [...images, ...picked].slice(0, MAX_IMAGES)
    setImages(next)
    setPreviews(next.map((f) => URL.createObjectURL(f)))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeImage(index: number) {
    const next = images.filter((_, i) => i !== index)
    setImages(next)
    setPreviews(next.map((f) => URL.createObjectURL(f)))
  }

  async function uploadImages(): Promise<{ urls: string[]; failed: number }> {
    const urls: string[] = []
    let failed = 0
    for (const file of images) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `personal-link/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      try {
        const { error: uploadError } = await supabase.storage
          .from('attachments_estimates')
          .upload(path, file, { upsert: true, contentType: file.type })
        if (uploadError) {
          failed += 1
          continue
        }
        const { data } = supabase.storage.from('attachments_estimates').getPublicUrl(path)
        urls.push(data.publicUrl)
      } catch {
        failed += 1
      }
    }
    return { urls, failed }
  }

  function validateStep1(): string {
    if (!category) return '수리 종류를 선택해 주세요.'
    if (title.trim().length < 2) return '어떤 수리가 필요한지 제목을 입력해 주세요.'
    return ''
  }

  function validateStep2(): string {
    if (address.trim().length < 5) return '방문 주소를 입력해 주세요.'
    if (!visitDate) return '방문 희망일을 선택해 주세요.'
    return ''
  }

  function validateStep3(): string {
    if (name.trim().length < 2) return '이름을 입력해 주세요.'
    const p = phone.replace(/[-\s]/g, '')
    if (!/^01[0-9]{8,9}$/.test(p)) return '휴대폰 번호를 정확히 입력해 주세요.'
    if (!/^\d{4}$/.test(pin)) return '조회용 비밀번호 4자리를 입력해 주세요.'
    if (!consent) return '개인정보 제공에 동의해 주세요.'
    return ''
  }

  function goNext() {
    const err = step === 1 ? validateStep1() : validateStep2()
    if (err) { setError(err); return }
    setError('')
    markStarted()
    setStep((s) => (s === 1 ? 2 : 3))
  }

  async function handleSubmit() {
    const err = validateStep3()
    if (err) { setError(err); return }
    setError('')
    setUploadWarning('')
    setLoading(true)

    try {
      const upload = images.length > 0 ? await uploadImages() : { urls: [], failed: 0 }
      if (upload.failed > 0) {
        setUploadWarning(
          `사진 ${upload.failed}장을 올리지 못했습니다. 요청은 그대로 접수됩니다.`,
        )
      }

      const res = await fetch('/api/personal-link/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...analyticsPayload(slug),
          title: title.trim(),
          description: description.trim(),
          address: address.trim(),
          addressDetail: addressDetail.trim(),
          visitDate,
          category,
          customerName: name.trim(),
          customerPhone: phone.replace(/[-\s]/g, ''),
          pin,
          imageUrls: upload.urls,
          urgency: urgency || null,
          propertyType: propertyType || null,
          privacyConsent: true,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || '접수에 실패했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
      setDoneOrderId(data.orderId)
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  // ── 완료 화면 ──────────────────────────────────────────────────
  if (doneOrderId) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-900">견적 요청이 접수되었습니다</h2>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed">
          <span className="font-semibold text-blue-600">{contractorName}</span> 사장님에게만
          전달되었습니다.
          <br />
          확인 후 입력하신 번호로 연락드릴 예정입니다.
        </p>
        <div className="mt-5 bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
          <p>
            접수번호 <span className="font-mono font-semibold">{doneOrderId.slice(0, 8)}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            휴대폰 번호와 비밀번호 4자리로 진행 상황을 확인할 수 있습니다.
          </p>
        </div>
        {uploadWarning && (
          <p className="mt-4 text-xs text-amber-600">{uploadWarning}</p>
        )}
        <a
          href="/my-order"
          className="inline-block mt-6 bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm"
        >
          접수 내역 확인하기
        </a>
      </div>
    )
  }

  // ── 입력 폼 ────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <StepIndicator current={step} />

      {step === 1 && (
        <div className="space-y-4">
          <Field label="어떤 수리가 필요하신가요?" required>
            <div className="flex flex-wrap gap-2">
              {options.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    category === c
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>

          <Field label="제목" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 화장실 샤워기 교체"
              className={inputClass}
              maxLength={60}
            />
          </Field>

          <Field label="증상을 자세히 알려주세요">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="언제부터 어떤 문제가 있는지 적어주시면 견적이 더 정확해집니다."
              rows={4}
              className={inputClass}
              maxLength={1000}
            />
          </Field>

          <Field label={`사진 (최대 ${MAX_IMAGES}장)`}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFiles}
              className="hidden"
            />
            <div className="flex flex-wrap gap-2">
              {previews.map((src, i) => (
                <div key={src} className="relative w-20 h-20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="w-full h-full object-cover rounded-xl border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 text-white text-xs leading-none"
                    aria-label="사진 삭제"
                  >
                    ×
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                >
                  + 사진
                </button>
              )}
            </div>
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Field label="방문 주소" required>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="예) 서울시 강남구 테헤란로 123"
              className={inputClass}
            />
          </Field>

          <Field label="상세 주소">
            <input
              value={addressDetail}
              onChange={(e) => setAddressDetail(e.target.value)}
              placeholder="동·호수 등"
              className={inputClass}
            />
          </Field>

          <Field label="방문 희망일" required>
            <input
              type="date"
              value={visitDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setVisitDate(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="얼마나 급하신가요?">
            <div className="flex flex-wrap gap-2">
              {URGENCY_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  active={urgency === o.value}
                  onClick={() => setUrgency(urgency === o.value ? '' : o.value)}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="건물 형태">
            <div className="flex flex-wrap gap-2">
              {PROPERTY_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  active={propertyType === o.value}
                  onClick={() => setPropertyType(propertyType === o.value ? '' : o.value)}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Field label="이름" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              className={inputClass}
              maxLength={20}
            />
          </Field>

          <Field label="연락받을 휴대폰 번호" required>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01012345678"
              inputMode="numeric"
              className={inputClass}
              maxLength={13}
            />
          </Field>

          <Field label="조회용 비밀번호 4자리" required>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              inputMode="numeric"
              className={inputClass}
            />
            <p className="text-xs text-gray-400 mt-1">
              나중에 접수 내역을 확인할 때 사용합니다.
            </p>
          </Field>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-900">
              이 요청은 {contractorName} 사장님에게만 전달됩니다
            </p>
            <label className="flex items-start gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-600 leading-relaxed">
                견적 상담을 위해 이름·연락처·주소·사진을 {contractorName} 사장님에게 제공하는 데
                동의합니다. (필수)
              </span>
            </label>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {error}
        </p>
      )}
      {uploadWarning && (
        <p className="mt-3 text-xs text-amber-600">{uploadWarning}</p>
      )}

      <div className="flex gap-2 mt-6">
        {step > 1 && (
          <button
            type="button"
            onClick={() => { setError(''); setStep((s) => (s === 3 ? 2 : 1)) }}
            className="px-5 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            이전
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            onClick={goNext}
            className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors"
          >
            다음
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? '접수 중...' : '무료로 견적 요청하기'}
          </button>
        )}
      </div>
    </div>
  )
}

const inputClass =
  'w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
      }`}
    >
      {children}
    </button>
  )
}

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { num: 1, label: '수리 내용' },
    { num: 2, label: '방문 정보' },
    { num: 3, label: '연락처' },
  ]
  return (
    <div className="flex items-center justify-center mb-6">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                s.num < current
                  ? 'bg-green-500 text-white'
                  : s.num === current
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-gray-200 text-gray-400'
              }`}
            >
              {s.num < current ? '✓' : s.num}
            </div>
            <span
              className={`text-xs mt-1 ${
                s.num === current ? 'text-blue-600 font-semibold' : 'text-gray-400'
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 h-0.5 mx-2 mb-4 ${s.num < current ? 'bg-green-400' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

/** 유입 경로 정보만 모읍니다(개인정보 없음). */
function analyticsPayload(slug: string) {
  if (typeof window === 'undefined') return { slug }
  const params = new URLSearchParams(window.location.search)
  let referrerDomain: string | null = null
  try {
    referrerDomain = document.referrer ? new URL(document.referrer).hostname : null
  } catch {
    referrerDomain = null
  }
  return {
    slug,
    sessionId: sessionKey(),
    utmSource: params.get('utm_source'),
    utmMedium: params.get('utm_medium'),
    utmCampaign: params.get('utm_campaign'),
    referrerDomain,
  }
}

function sessionKey(): string {
  const KEY = 'allsuri_pl_session'
  try {
    const existing = window.sessionStorage.getItem(KEY)
    if (existing) return existing
    const generated = Math.random().toString(36).slice(2) + Date.now().toString(36)
    window.sessionStorage.setItem(KEY, generated)
    return generated
  } catch {
    return 'anonymous'
  }
}
