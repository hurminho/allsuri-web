'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, CATEGORIES, CATEGORY_ICONS, isCategory } from '@/lib/supabase'
import type { PriceEstimateResponse } from '@/lib/price-engine'
import PriceEstimateCard from '@/components/PriceEstimateCard'

type Step = 1 | 2 | 3

// 가격 엔진 enum 과 같은 값. 라벨만 한국어로 붙입니다(금액과 무관).
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

interface FormData {
  category: string
  title: string
  description: string
  address: string
  addressDetail: string
  visitDate: string
  name: string
  phone: string
  email: string
  pin: string
  urgency: string
  propertyType: string
  images: File[]
  imagePreviewUrls: string[]
}

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { num: 1, label: '수리 내용' },
    { num: 2, label: '방문 정보' },
    { num: 3, label: '연락처' },
  ]
  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                s.num < current
                  ? 'bg-green-500 text-white'
                  : s.num === current
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-gray-200 text-gray-400'
              }`}
            >
              {s.num < current ? '✓' : s.num}
            </div>
            <span className={`text-xs mt-1 ${s.num === current ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-16 h-0.5 mx-2 mb-4 ${s.num < current ? 'bg-green-400' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function RequestForm() {
  const searchParams = useSearchParams()
  const initialCategory = searchParams.get('category') || '기타'

  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [uploadWarning, setUploadWarning] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 가격은 전부 가격 엔진(/api/price/estimate)에서 옵니다. 이 화면은 표시만 합니다.
  const [price, setPrice] = useState<PriceEstimateResponse | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [tradeId, setTradeId] = useState('')
  const estimateSeq = useRef(0)

  const [form, setForm] = useState<FormData>({
    category: isCategory(initialCategory) ? initialCategory : '기타',
    title: '',
    description: '',
    address: '',
    addressDetail: '',
    visitDate: '',
    name: '',
    phone: '',
    email: '',
    pin: '',
    urgency: '',
    propertyType: '',
    images: [],
    imagePreviewUrls: [],
  })

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // 3단계에서만, 공종이 정해져 있을 때 500ms 디바운스로 예상 범위를 조회합니다.
  // 실패해도 제출을 막지 않습니다.
  useEffect(() => {
    if (step !== 3 || !form.category) return
    const seq = ++estimateSeq.current
    setPriceLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/price/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tradeId: tradeId || undefined,
            category: form.category,
            text: [form.title, form.description].filter(Boolean).join('\n').slice(0, 2000),
            address: form.address || undefined,
            urgency: form.urgency || undefined,
            propertyType: form.propertyType || undefined,
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
  }, [
    step,
    tradeId,
    form.category,
    form.title,
    form.description,
    form.address,
    form.urgency,
    form.propertyType,
  ])

  function handleImageAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const newFiles = [...form.images, ...files].slice(0, 5)
    const newUrls = newFiles.map((f) => URL.createObjectURL(f))
    update('images', newFiles)
    update('imagePreviewUrls', newUrls)
  }

  function removeImage(idx: number) {
    const newFiles = form.images.filter((_, i) => i !== idx)
    const newUrls = newFiles.map((f) => URL.createObjectURL(f))
    update('images', newFiles)
    update('imagePreviewUrls', newUrls)
  }

  // Step 1 validation
  function validateStep1() {
    if (!form.category) return '카테고리를 선택해주세요'
    if (!form.title.trim()) return '제목을 입력해주세요'
    if (!form.description.trim()) return '상세 설명을 입력해주세요'
    return ''
  }

  // Step 2 validation
  function validateStep2() {
    if (!form.address.trim()) return '주소를 입력해주세요'
    if (!form.visitDate) return '방문 희망일을 선택해주세요'
    return ''
  }

  // Step 3 validation
  function validateStep3() {
    if (!form.name.trim()) return '이름을 입력해주세요'
    if (!form.phone.trim()) return '전화번호를 입력해주세요'
    const phoneRegex = /^01[0-9]{8,9}$/
    const normalizedPhone = form.phone.replace(/[-\s]/g, '')
    if (!phoneRegex.test(normalizedPhone)) return '올바른 전화번호를 입력해주세요 (예: 010-1234-5678)'
    if (!form.pin || form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) return '4자리 숫자 비밀번호를 입력해주세요 (내 견적 조회에 사용됩니다)'
    return ''
  }

  function goNext() {
    let err = ''
    if (step === 1) err = validateStep1()
    else if (step === 2) err = validateStep2()
    if (err) { setError(err); return }
    setError('')
    setStep((s) => Math.min(s + 1, 3) as Step)
  }

  async function uploadImages(): Promise<{ urls: string[]; failed: number }> {
    const urls: string[] = []
    let failed = 0
    for (const file of form.images) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `web/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      try {
        const { error: uploadError } = await supabase.storage
          .from('attachments_estimates')
          .upload(path, file, { upsert: true, contentType: file.type })
        if (uploadError) {
          failed += 1
          console.warn('[submit] 사진 업로드 실패:', uploadError.message)
          continue
        }
        const { data } = supabase.storage.from('attachments_estimates').getPublicUrl(path)
        urls.push(data.publicUrl)
      } catch (e: unknown) {
        failed += 1
        console.warn('[submit] 사진 업로드 예외:', e instanceof Error ? e.message : String(e))
      }
    }
    return { urls, failed }
  }

  async function handleSubmit() {
    const err = validateStep3()
    if (err) { setError(err); return }
    setError('')
    setUploadWarning('')
    setLoading(true)

    try {
      // 1. 이미지 먼저 업로드 (클라이언트 측 Supabase Storage)
      const upload = form.images.length > 0 ? await uploadImages() : { urls: [], failed: 0 }
      const imageUrls = upload.urls
      if (upload.failed > 0) {
        setUploadWarning(
          `사진 ${upload.failed}장을 올리지 못했습니다. 견적 요청은 그대로 접수되며, 필요하면 나중에 사업자에게 사진을 보내주세요.`,
        )
      }

      // 2. 서버 API 호출 → orders + marketplace_listings 동시 생성
      const res = await fetch('/api/customer/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          address: form.address.trim(),
          addressDetail: form.addressDetail.trim(),
          visitDate: form.visitDate,
          category: form.category,
          customerName: form.name.trim(),
          customerPhone: form.phone.replace(/[-\s]/g, ''),
          customerEmail: form.email.trim() || null,
          pin: form.pin,
          imageUrls,
          // 구조화 정보 + 가격 스냅샷 (금액은 전부 가격 엔진 값)
          tradeId: tradeId || price?.trade?.id || null,
          subcategory: price?.trade?.subcategory || null,
          urgency: form.urgency || null,
          propertyType: form.propertyType || null,
          priceEngineVersion: price?.engineVersion || null,
          priceState: price?.priceState || null,
          estimatedMin: price?.estimatedMin ?? null,
          estimatedMax: price?.estimatedMax ?? null,
          priceConfidenceLevel: price?.confidenceLevel || null,
          priceEvidenceCount: price?.evidenceCount ?? null,
          priceFactors: price?.factors || [],
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '요청 실패')
      if (data.warning) {
        // listing 등록 실패 (DB SQL 미실행) → 콘솔에 표시, 접수는 완료
        console.warn('[submit] 앱 오더 등록 경고:', data.warning)
      }

      setSubmitted(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('견적 요청 중 오류가 발생했습니다: ' + msg)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">견적 요청이 완료되었습니다!</h2>
        <p className="text-gray-500 leading-relaxed mb-5">
          전문 업체들이 <strong className="text-blue-600">{form.phone}</strong>으로<br />
          견적서를 보내드릴 예정입니다.<br />
          평균 응답 시간은 <strong>2시간 이내</strong>입니다.
        </p>

        {/* 사진 업로드가 일부 실패해도 접수는 완료됩니다. 숨기지 않고 알려줍니다. */}
        {uploadWarning && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-4 mb-5 text-left text-sm">
            {uploadWarning}
          </div>
        )}

        {/* 내 견적 조회 안내 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-left">
          <div className="font-bold text-blue-700 mb-2 flex items-center gap-1.5">
            <span>🔑</span> 내 견적 조회 정보
          </div>
          <div className="text-sm text-blue-600 space-y-1">
            <div>전화번호: <strong>{form.phone}</strong></div>
            <div>비밀번호: <strong className="text-2xl tracking-widest">{form.pin}</strong></div>
          </div>
          <p className="text-xs text-blue-500 mt-2">이 정보로 &apos;내 견적&apos; 메뉴에서 공사 현황을 확인하고 사업자를 선택할 수 있습니다.</p>
        </div>

        <a
          href="/my-order"
          className="block w-full bg-blue-600 text-white py-3 rounded-xl font-bold mb-3 hover:bg-blue-700 transition-colors text-center"
        >
          내 견적 현황 확인하기 →
        </a>

        <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm text-gray-600 text-left">
          <div className="font-semibold text-gray-700 mb-2">접수 내용 요약</div>
          <div>카테고리: {form.category}</div>
          <div>제목: {form.title}</div>
          <div>주소: {form.address}</div>
          <div>방문 희망일: {form.visitDate}</div>
        </div>
        <button
          onClick={() => {
            setSubmitted(false)
            setStep(1)
            setForm({
              category: '기타', title: '', description: '', address: '',
              addressDetail: '', visitDate: '', name: '', phone: '', email: '',
              pin: '', urgency: '', propertyType: '', images: [], imagePreviewUrls: [],
            })
            setPrice(null)
            setTradeId('')
            setUploadWarning('')
          }}
          className="text-blue-600 hover:underline text-sm"
        >
          다른 견적 요청하기
        </button>
      </div>
    )
  }

  const minDate = new Date()
  minDate.setDate(minDate.getDate() + 1)
  const minDateStr = minDate.toISOString().split('T')[0]

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
      <StepIndicator current={step} />

      {/* Step 1: 수리 내용 */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              수리 종류 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => update('category', cat)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    form.category === cat
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-blue-300'
                  }`}
                >
                  <span className="text-2xl">{CATEGORY_ICONS[cat as keyof typeof CATEGORY_ICONS]}</span>
                  <span className="text-xs">{cat}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder={`예: ${form.category} 수리 요청합니다`}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              상세 설명 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="문제 상황을 자세히 설명해주세요. (예: 주방 싱크대 아래 물이 새고 있습니다. 2일 전부터 시작됐고...)"
              rows={4}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* 이미지 첨부 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              사진 첨부 <span className="text-gray-400 font-normal">(선택, 최대 5장)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {form.imagePreviewUrls.map((url, i) => (
                <div key={i} className="relative w-20 h-20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`첨부 이미지 ${i + 1}`} className="w-full h-full object-cover rounded-xl" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {form.images.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-xs mt-1">사진 추가</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageAdd}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Step 2: 방문 정보 */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              주소 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="시/도 + 구/군 + 동/읍 (예: 서울특별시 강남구 역삼동)"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              상세 주소 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input
              type="text"
              value={form.addressDetail}
              onChange={(e) => update('addressDetail', e.target.value)}
              placeholder="예: 역삼푸르지오 101동 1203호"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              방문 희망일 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.visitDate}
              min={minDateStr}
              onChange={(e) => update('visitDate', e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">내일 이후 날짜를 선택해주세요</p>
          </div>

          {/* 긴급 여부 / 건물 유형 (선택) — 예상 범위 정확도를 높이는 데만 쓰입니다 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                긴급 여부 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <select
                value={form.urgency}
                onChange={(e) => update('urgency', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">선택 안 함</option>
                {URGENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                주택/상가 유형 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <select
                value={form.propertyType}
                onChange={(e) => update('propertyType', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">선택 안 함</option>
                {PROPERTY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 입력 내용 요약 */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-1">
            <div className="font-semibold text-gray-700 mb-2">입력 내용 확인</div>
            <div>카테고리: <span className="text-gray-800">{form.category} {CATEGORY_ICONS[form.category as keyof typeof CATEGORY_ICONS]}</span></div>
            <div>제목: <span className="text-gray-800">{form.title}</span></div>
            <div className="truncate">설명: <span className="text-gray-800">{form.description.slice(0, 40)}{form.description.length > 40 ? '...' : ''}</span></div>
          </div>
        </div>
      )}

      {/* Step 3: 연락처 */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
            <div className="font-semibold mb-1">📞 연락처는 이렇게 사용됩니다</div>
            <ul className="space-y-1 text-blue-600">
              <li>• 전문 업체가 견적서 전달 시 연락</li>
              <li>• 개인정보는 견적 목적으로만 사용</li>
              <li>• 로그인·회원가입 불필요</li>
            </ul>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="홍길동"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              전화번호 <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="010-1234-5678"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              이메일 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="example@email.com"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              내 견적 조회 비밀번호 <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(4자리 숫자)</span>
            </label>
            <input
              type="tel"
              value={form.pin}
              onChange={(e) => update('pin', e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="0000"
              maxLength={4}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-2xl font-bold tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">
              🔑 &apos;내 견적&apos; 메뉴에서 공사 현황 조회·사업자 선택 시 사용됩니다. 꼭 기억해 두세요!
            </p>
          </div>

          {/* Final summary */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-1.5">
            <div className="font-semibold text-gray-700 mb-2">최종 확인</div>
            <div>카테고리: {form.category}</div>
            <div>주소: {form.address} {form.addressDetail}</div>
            <div>방문 희망일: {form.visitDate}</div>
            {form.images.length > 0 && <div>첨부 사진: {form.images.length}장</div>}
          </div>

          {/* 예상 범위. 금액과 문구는 전부 가격 엔진 응답이며, 데이터가 부족하면 숫자를 감춥니다. */}
          <PriceEstimateCard price={price} loading={priceLoading} onSelectTrade={setTradeId} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-200">
          {error}
        </div>
      )}

      {/* Buttons */}
      <div className="mt-6 flex gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={() => { setStep((s) => Math.max(s - 1, 1) as Step); setError('') }}
            className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            이전
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            onClick={goNext}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            다음 단계 →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                요청 중...
              </>
            ) : '견적 요청 완료하기 🎉'}
          </button>
        )}
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        요청하시면 <a href="/privacy" className="underline">개인정보처리방침</a>에 동의한 것으로 간주합니다
      </p>
    </div>
  )
}
