'use client'

import { useState } from 'react'
import Link from 'next/link'
import { resolvePersonName } from '@/lib/business-profile'

// ── 타입 ────────────────────────────────────────────────────────────
interface OrderSummary {
  id: string; title: string; status: string; category: string
  address: string; createdAt: string; isAwarded: boolean; visitDate: string
}
interface Estimate {
  id: string; businessId: string; businessName: string; personName?: string
  equipmentType: string; amount: number; description: string; estimatedDays: number
  createdAt: string; status: string; isAwarded: boolean; isBid?: boolean
  region?: string; bizDescription?: string; avatarUrl?: string | null
  hasBusinessReg?: boolean; jobsCount?: number
  avgRating?: number | null; reviewCount?: number
}
interface Business {
  id: string; name: string; businessname: string; phonenumber: string
  category: string; region: string; description: string
  profile_image_url: string; projects_awarded_count: number
}
interface Review { id: string; rating: number; comment: string; created_at: string }
interface OrderDetail {
  order: {
    id: string; title: string; description: string; status: string
    category: string; address: string; visitDate: string; createdAt: string
    isAwarded: boolean; awardedEstimateId: string; images: string[]
    adminRating?: number; adminRatingComment?: string; listingId?: string
  }
  estimates: Estimate[]
  awardedBusiness: Business | null
}

// ── 유틸 ────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  pending: '대기중', in_progress: '진행중', completed: '완료', cancelled: '취소',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700', in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500',
}
function maskAddress(addr: string) {
  const parts = addr.split(' ')
  return parts.length <= 3 ? addr : parts.slice(0, 3).join(' ') + ' ***'
}
function fmtAmount(n: number) {
  return n ? n.toLocaleString() + '원' : '협의'
}

// ── 별점 컴포넌트 ────────────────────────────────────────────────────
function Stars({ value, max = 5, size = 'text-lg' }: { value: number; max?: number; size?: string }) {
  return (
    <span className={size}>
      {'★'.repeat(Math.round(value))}{'☆'.repeat(Math.max(0, max - Math.round(value)))}
    </span>
  )
}

// ── 스테퍼 ──────────────────────────────────────────────────────────
function Stepper({ order, estimates }: { order: OrderDetail['order']; estimates: Estimate[] }) {
  const steps = ['견적 요청', '입찰 대기', '업체 선택', '공사 진행', '완료 확인', '평점']
  let current = 0
  if (estimates.length > 0) current = 1
  if (order.isAwarded) current = 2
  if (order.status === 'in_progress') current = 3
  if (order.status === 'completed') current = 4
  if (order.adminRating) current = 5

  return (
    <div className="flex items-start overflow-x-auto py-1">
      {steps.map((label, i) => (
        <div key={i} className="flex items-start">
          <div className="flex flex-col items-center min-w-[56px]">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
              i < current ? 'bg-green-500 border-green-500 text-white'
              : i === current ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white border-gray-200 text-gray-400'
            }`}>
              {i < current ? '✓' : i + 1}
            </div>
            <span className={`text-[10px] mt-1 text-center leading-tight ${
              i < current ? 'text-green-600 font-semibold'
              : i === current ? 'text-blue-600 font-bold'
              : 'text-gray-400'
            }`}>{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-6 mt-4 flex-shrink-0 ${i < current ? 'bg-green-400' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function MyOrderClient() {
  const [screen, setScreen] = useState<'login' | 'list' | 'dashboard'>('login')
  const [phone, setPhone] = useState('')
  const [pwd, setPwd] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [currentOrderId, setCurrentOrderId] = useState('')
  const [bizModal, setBizModal] = useState<{ estimate?: Estimate; biz?: Business; reviews?: Review[]; avgRating?: number | null } | null>(null)
  const [awardPending, setAwardPending] = useState<{ estimateId: string; businessId: string; bizName: string; isBid?: boolean } | null>(null)
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')

  // ── 로그인 ──────────────────────────────────────────────────────────
  async function doLogin() {
    if (!phone.trim()) { setError('전화번호를 입력해 주세요.'); return }
    if (pwd.trim().length !== 4) { setError('4자리 비밀번호를 입력해 주세요.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/customer/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password: pwd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '조회 실패')
      if (data.orders.length === 1) {
        openOrder(data.orders[0].id)
      } else {
        setOrders(data.orders); setScreen('list')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }

  // ── 주문 상세 로드 ────────────────────────────────────────────────
  async function openOrder(orderId: string) {
    setCurrentOrderId(orderId); setLoading(true); setError('')
    try {
      const nPhone = phone.replace(/[^0-9]/g, '')
      const res = await fetch(`/api/customer/order/${orderId}?phone=${encodeURIComponent(nPhone)}&pwd=${encodeURIComponent(pwd)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '조회 실패')
      setDetail(data); setScreen('dashboard'); setRating(0); setRatingComment('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }

  // ── 사업자 상세 모달 ─────────────────────────────────────────────
  async function openBizModal(estimate: Estimate) {
    setBizModal({ estimate })
    try {
      const res = await fetch(`/api/customer/business/${estimate.businessId}`)
      const data = await res.json()
      if (res.ok && data.business) {
        setBizModal({ estimate, biz: data.business, reviews: data.reviews || [], avgRating: data.avgRating })
      } else {
        // API 오류 시 기본 정보만 표시
        setBizModal({
          estimate,
          biz: { id: estimate.businessId, name: estimate.businessName, businessname: estimate.businessName, phonenumber: '', category: estimate.equipmentType, region: '', description: '', profile_image_url: '', projects_awarded_count: 0 },
          reviews: [],
          avgRating: null,
        })
      }
    } catch {
      setBizModal({
        estimate,
        biz: { id: estimate.businessId, name: estimate.businessName, businessname: estimate.businessName, phonenumber: '', category: estimate.equipmentType, region: '', description: '', profile_image_url: '', projects_awarded_count: 0 },
        reviews: [],
        avgRating: null,
      })
    }
  }

  // ── 낙찰 ─────────────────────────────────────────────────────────
  async function doAward() {
    if (!awardPending) return
    setLoading(true)
    try {
      const res = await fetch(`/api/customer/order/${currentOrderId}/award`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.replace(/[^0-9]/g, ''), password: pwd,
          estimateId: awardPending.estimateId,
          businessId: awardPending.businessId,
          listingId: detail?.order.listingId || null,
          isBid: awardPending.isBid ?? false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '실패')
      setAwardPending(null)
      alert(`✅ ${data.message}\n사업자에게 연락처가 전달되었습니다.`)
      openOrder(currentOrderId)
    } catch (e: unknown) {
      alert('❌ ' + (e instanceof Error ? e.message : String(e)))
    } finally { setLoading(false) }
  }

  // ── 완료 확인 ─────────────────────────────────────────────────────
  async function doComplete() {
    if (!confirm('공사가 완료되었음을 확인하시겠습니까?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/customer/order/${currentOrderId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.replace(/[^0-9]/g, ''), password: pwd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '실패')
      alert('✅ ' + data.message)
      openOrder(currentOrderId)
    } catch (e: unknown) {
      alert('❌ ' + (e instanceof Error ? e.message : String(e)))
    } finally { setLoading(false) }
  }

  // ── 평점 ─────────────────────────────────────────────────────────
  async function doRate() {
    if (!rating) { alert('별점을 선택해 주세요.'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/customer/order/${currentOrderId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.replace(/[^0-9]/g, ''), password: pwd, rating, comment: ratingComment }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '실패')
      alert('⭐ ' + data.message)
      openOrder(currentOrderId)
    } catch (e: unknown) {
      alert('❌ ' + (e instanceof Error ? e.message : String(e)))
    } finally { setLoading(false) }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 pb-20">

        {/* ① 로그인 화면 */}
        {screen === 'login' && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900">내 견적 현황 조회</h1>
              <p className="text-gray-500 mt-2 text-sm">견적 요청 시 입력한 전화번호와<br />4자리 비밀번호로 확인하세요</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">전화번호</label>
                <input
                  type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && document.getElementById('pwdInput')?.focus()}
                  placeholder="010-0000-0000"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">비밀번호 (4자리)</label>
                <input
                  id="pwdInput" type="tel" value={pwd}
                  onChange={e => setPwd(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  onKeyDown={e => e.key === 'Enter' && doLogin()}
                  placeholder="0000" maxLength={4}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-2xl font-bold tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-500 text-sm text-center whitespace-pre-line">{error}</p>}
              <button
                onClick={doLogin} disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-xl font-semibold transition-colors"
              >
                {loading ? '조회 중...' : '조회하기'}
              </button>
              <p className="text-center text-xs text-gray-400">
                견적을 아직 요청하지 않으셨나요?{' '}
                <Link href="/requests" className="text-blue-600 underline">무료 견적 요청하기</Link>
              </p>
            </div>
          </>
        )}

        {/* ② 주문 목록 */}
        {screen === 'list' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-2">견적 요청 내역</h2>
            <p className="text-sm text-gray-500 mb-5">확인할 항목을 선택해 주세요</p>
            {orders.map(o => (
              <button key={o.id} onClick={() => openOrder(o.id)}
                className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 hover:border-blue-400 transition-colors">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-gray-900">{o.title}</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[o.status] || 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[o.status] || o.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{o.category} · {(o.createdAt || '').slice(0, 10)}</p>
                <p className="text-sm text-gray-600 mt-1">{o.address}</p>
              </button>
            ))}
            <button onClick={() => setScreen('login')}
              className="w-full mt-2 border border-gray-300 text-gray-600 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50">
              ← 다시 조회
            </button>
          </>
        )}

        {/* ③ 공사 대시보드 */}
        {screen === 'dashboard' && detail && (
          <>
            {/* 요약 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{detail.order.title}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{detail.order.category} · {(detail.order.createdAt || '').slice(0, 10)}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[detail.order.status] || ''}`}>
                  {STATUS_LABEL[detail.order.status] || detail.order.status}
                </span>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <p>📍 {maskAddress(detail.order.address)}</p>
                <p>📅 방문 희망일: {(detail.order.visitDate || '').slice(0, 10)}</p>
                {detail.order.description && <p className="text-gray-500 mt-1">{detail.order.description}</p>}
              </div>
            </div>

            {/* 프로세스 스테퍼 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
              <Stepper order={detail.order} estimates={detail.estimates} />
            </div>

            {/* 낙찰된 사업자 */}
            {detail.order.isAwarded && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-green-600 font-bold text-sm">🏆 낙찰된 사업자</span>
                </div>

                {/* 선택된 입찰 견적가/기간 (estimates[0]에서) */}
                {detail.estimates[0] && detail.estimates[0].amount > 0 && (
                  <div className="flex items-center justify-between bg-gradient-to-r from-green-700 to-green-500 rounded-xl px-4 py-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm">💰</span>
                      <span className="text-white font-bold text-base">{fmtAmount(detail.estimates[0].amount)}</span>
                    </div>
                    {detail.estimates[0].estimatedDays > 0 && (
                      <span className="text-green-100 text-sm">📅 {detail.estimates[0].estimatedDays}일</span>
                    )}
                  </div>
                )}

                {/* 사업자 정보: awardedBusiness 우선, 없으면 estimates[0] 사용 */}
                {(() => {
                  const biz = detail.awardedBusiness
                  const est = detail.estimates[0]
                  const bizName = biz ? (biz.businessname || biz.name) : est?.businessName
                  const bizCategory = biz?.category || est?.equipmentType
                  const bizRegion = biz?.region || est?.region
                  const bizId = biz?.id || est?.businessId
                  const bizPersonName = biz
                    ? resolvePersonName({
                        name: biz.name,
                        businessname: biz.businessname,
                        representative_name: (biz as { representative_name?: string | null }).representative_name,
                      })
                    : est?.personName
                  const bizRating = est?.avgRating
                  const bizReviewCount = est?.reviewCount ?? 0
                  return bizName ? (
                    <button onClick={() => {
                      if (biz) {
                        const fakeEst = { businessId: biz.id } as Estimate
                        openBizModal(fakeEst)
                      } else if (est) {
                        openBizModal(est)
                      }
                    }} className="w-full text-left">
                      <p className="font-bold text-gray-900 text-base">{bizName}</p>
                      {bizPersonName && (
                        <p className="text-xs text-gray-400 mt-0.5">사장님 성함: {bizPersonName}</p>
                      )}
                      {bizReviewCount > 0 && typeof bizRating === 'number' && (
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <span className="text-yellow-400"><Stars value={bizRating} size="text-xs" /></span>
                          <span className="font-semibold text-gray-700">{bizRating.toFixed(1)}</span>
                          <span className="text-gray-400">({bizReviewCount})</span>
                        </p>
                      )}
                      <p className="text-sm text-gray-500 mt-0.5">
                        {bizCategory}{bizRegion ? ' · ' + bizRegion : ''}
                      </p>
                      {est?.bizDescription && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{est.bizDescription}</p>
                      )}
                      <p className="text-xs text-blue-600 mt-2">상세 정보 보기 →</p>
                    </button>
                  ) : (
                    <p className="text-sm text-gray-500">사업자 정보를 불러오는 중...</p>
                  )
                })()}
              </div>
            )}

            {/* 입찰 목록 (낙찰 전) */}
            {!detail.order.isAwarded && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <span className="font-bold text-gray-900">🏢 접수된 견적</span>
                  <span className="text-sm text-gray-500">({detail.estimates.length}건)</span>
                </div>
                {detail.estimates.length === 0 ? (
                  <div className="px-5 py-10 text-center text-gray-400">
                    <p className="text-3xl mb-2">⏳</p>
                    <p className="text-sm">아직 접수된 견적이 없습니다.</p>
                    <p className="text-xs mt-1">사업자들이 견적을 제출하면 여기에 표시됩니다.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {detail.estimates.map(e => (
                      <div key={e.id} className="p-4">

                        {/* 견적가 배너 */}
                        {e.amount > 0 && (
                          <div className="flex items-center justify-between bg-gradient-to-r from-blue-900 to-blue-600 rounded-xl px-4 py-3 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-white text-sm">💰</span>
                              <span className="text-white font-bold text-base">{fmtAmount(e.amount)}</span>
                            </div>
                            {e.estimatedDays > 0 && (
                              <span className="text-blue-200 text-sm">📅 예상 {e.estimatedDays}일</span>
                            )}
                          </div>
                        )}

                        {/* 프로필 헤더 */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className="relative flex-shrink-0">
                            {e.avatarUrl
                              ? <img src={e.avatarUrl} alt={e.businessName} className="w-12 h-12 rounded-full object-cover" />
                              : <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">{(e.businessName || '?')[0]}</div>
                            }
                            {e.hasBusinessReg && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs font-bold">✓</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-gray-900 text-base">{e.businessName}</p>
                              {e.hasBusinessReg && (
                                <span className="text-xs bg-green-50 text-green-700 border border-green-300 rounded-full px-2 py-0.5 font-semibold">사업자등록</span>
                              )}
                            </div>
                            {e.personName && (
                              <p className="text-xs text-gray-400 mt-0.5">사장님 성함: {e.personName}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                              {(e.reviewCount ?? 0) > 0 && typeof e.avgRating === 'number' ? (
                                <span className="flex items-center gap-1">
                                  <span className="text-yellow-400"><Stars value={e.avgRating} size="text-xs" /></span>
                                  <span className="font-semibold text-gray-700">{e.avgRating.toFixed(1)}</span>
                                  <span className="text-gray-400">({e.reviewCount ?? 0})</span>
                                </span>
                              ) : (
                                <span className="text-gray-400">평점 없음</span>
                              )}
                              {e.equipmentType && <span>🔧 {e.equipmentType}</span>}
                              {e.region && <span>📍 {e.region}</span>}
                              {(e.jobsCount ?? 0) > 0 && <span>✅ 완료 {e.jobsCount}건</span>}
                            </div>
                          </div>
                        </div>

                        {/* 사업자 소개 */}
                        {e.bizDescription && (
                          <div className="bg-gray-50 rounded-xl p-3 mb-3">
                            <p className="text-xs font-semibold text-gray-500 mb-1">사업자 소개</p>
                            <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">{e.bizDescription}</p>
                          </div>
                        )}

                        {/* 입찰 메시지 */}
                        {e.description && (
                          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-3">
                            <p className="text-xs font-semibold text-indigo-600 mb-1">입찰 메시지</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{e.description}</p>
                          </div>
                        )}

                        {/* 하단 버튼 */}
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => openBizModal(e)}
                            className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
                            후기 보기
                          </button>
                          <button
                            onClick={() => setAwardPending({ estimateId: e.id, businessId: e.businessId, bizName: e.businessName, isBid: e.isBid })}
                            className="flex-[2] bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors">
                            이 업체 낙찰하기
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 공사 완료 확인 */}
            {detail.order.status === 'in_progress' && detail.order.isAwarded && (
              <div className="mb-4">
                <button onClick={doComplete} disabled={loading}
                  className="w-full bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white py-3.5 rounded-2xl font-bold transition-colors">
                  ✅ 공사 완료 확인
                </button>
                <p className="text-center text-xs text-gray-400 mt-2">공사가 완료되었으면 버튼을 눌러 주세요</p>
              </div>
            )}

            {/* 평점 */}
            {detail.order.status === 'completed' && detail.order.isAwarded && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
                <h3 className="font-bold text-gray-900 mb-3">⭐ 서비스 평점</h3>
                {detail.order.adminRating ? (
                  <div className="text-center py-4">
                    <p className="text-3xl mb-1">🎉</p>
                    <p className="font-bold mb-1">평점을 남겨주셨습니다</p>
                    <p className="text-yellow-500 text-2xl"><Stars value={detail.order.adminRating} /></p>
                    {detail.order.adminRatingComment && (
                      <p className="text-sm text-gray-500 mt-2">{detail.order.adminRatingComment}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">사업자의 서비스는 어떠셨나요?</p>
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map(v => (
                        <button key={v} onClick={() => setRating(v)}
                          className={`text-3xl transition-colors ${v <= rating ? 'text-yellow-400' : 'text-gray-200'}`}>
                          ★
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={ratingComment} onChange={e => setRatingComment(e.target.value)}
                      placeholder="서비스에 대한 의견을 남겨주세요 (선택사항)"
                      rows={3}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <button onClick={doRate} disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-xl font-semibold transition-colors">
                      평점 제출
                    </button>
                  </div>
                )}
              </div>
            )}

            <button onClick={() => orders.length > 1 ? setScreen('list') : setScreen('login')}
              className="w-full border border-gray-300 text-gray-600 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50">
              ← {orders.length > 1 ? '목록으로' : '다시 조회'}
            </button>
          </>
        )}
      </div>

      {/* 사업자 상세 모달 */}
      {bizModal !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={() => setBizModal(null)}>
          <div className="bg-white w-full max-w-2xl rounded-t-3xl max-h-[85vh] overflow-y-auto pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded mx-auto mt-3 mb-1" />
            <div className="px-6 py-4">
              {!bizModal.biz ? (
                <p className="text-center text-gray-400 py-8">로딩 중...</p>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold">{bizModal.biz.businessname || bizModal.biz.name}</h3>
                      {bizModal.biz.name && bizModal.biz.name !== bizModal.biz.businessname && (
                        <p className="text-sm text-gray-500 mt-0.5">사장님 성함: {bizModal.biz.name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {bizModal.avgRating && (
                          <span className="text-yellow-400"><Stars value={bizModal.avgRating} size="text-base" /></span>
                        )}
                        <span className="text-sm text-gray-500">
                          {bizModal.avgRating ? `${bizModal.avgRating}점 · ` : ''}낙찰 {bizModal.biz.projects_awarded_count || 0}건
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setBizModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
                    {bizModal.biz.businessname && <div className="flex justify-between"><span className="text-gray-500">상호명</span><span className="font-medium">{bizModal.biz.businessname}</span></div>}
                    {bizModal.biz.name && <div className="flex justify-between"><span className="text-gray-500">사장님 성함</span><span className="font-medium">{bizModal.biz.name}</span></div>}
                    <div className="flex justify-between"><span className="text-gray-500">카테고리</span><span className="font-medium">{bizModal.biz.category || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">지역</span><span className="font-medium">{bizModal.biz.region || '-'}</span></div>
                    {bizModal.biz.description && (
                      <div className="pt-1 border-t border-gray-200"><p className="text-gray-600 leading-relaxed">{bizModal.biz.description}</p></div>
                    )}
                  </div>
                  {/* 해당 견적 선택 버튼 */}
                  {bizModal.estimate?.id && !detail?.order.isAwarded && (
                    <div className="mb-4">
                      <div className="bg-blue-50 rounded-xl p-4 mb-3">
                        <p className="text-sm font-bold text-blue-600 mb-1">제출한 견적</p>
                        <p className="text-xl font-bold">{fmtAmount(bizModal.estimate.amount)}</p>
                        <p className="text-sm text-gray-500">예상 {bizModal.estimate.estimatedDays || '-'}일 · {bizModal.estimate.equipmentType}</p>
                        {bizModal.estimate.description && <p className="text-sm text-gray-600 mt-2">{bizModal.estimate.description}</p>}
                      </div>
                      <button
                        onClick={() => { setBizModal(null); setAwardPending({ estimateId: bizModal.estimate!.id, businessId: bizModal.estimate!.businessId, bizName: bizModal.estimate!.businessName, isBid: bizModal.estimate!.isBid }) }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-colors">
                        이 사업자 선택하기
                      </button>
                    </div>
                  )}
                  {/* 리뷰 */}
                  {bizModal.reviews && bizModal.reviews.length > 0 && (
                    <>
                      <h4 className="font-bold text-sm text-gray-700 mb-3">고객 후기 ({bizModal.reviews.length}건)</h4>
                      <div className="space-y-3">
                        {bizModal.reviews.map(r => (
                          <div key={r.id} className="border-b border-gray-100 pb-3">
                            <span className="text-yellow-400"><Stars value={r.rating} size="text-sm" /></span>
                            {r.comment && <p className="text-sm text-gray-600 mt-1 leading-relaxed">{r.comment}</p>}
                            <p className="text-xs text-gray-400 mt-1">{(r.created_at || '').slice(0, 10)}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {bizModal.reviews?.length === 0 && <p className="text-sm text-gray-400">아직 후기가 없습니다.</p>}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 낙찰 확인 모달 */}
      {awardPending && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={() => setAwardPending(null)}>
          <div className="bg-white w-full max-w-2xl rounded-t-3xl p-6 pb-10" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded mx-auto mb-5" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">사업자 선택</h3>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              <strong>{awardPending.bizName}</strong> 사업자를 선택하시겠습니까?<br />
              선택 후 해당 사업자에게 연락처와 상세 주소가 전달됩니다.
            </p>
            <div className="bg-yellow-50 rounded-xl p-4 mb-5 text-sm text-yellow-700">
              ⚠️ 선택 후에는 변경이 어렵습니다. 신중하게 선택해 주세요.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setAwardPending(null)}
                className="flex-1 border-2 border-red-200 text-red-500 py-3 rounded-xl font-semibold hover:bg-red-50 transition-colors">
                취소
              </button>
              <button onClick={doAward} disabled={loading}
                className="flex-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 px-6 rounded-xl font-bold transition-colors">
                {loading ? '처리 중...' : '선택 확정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
