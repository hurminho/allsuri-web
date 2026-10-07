import type { Metadata } from 'next'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase-server'
import { getPublicBusiness } from '@/lib/public-business'
import { notFound } from 'next/navigation'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 300

type Props = { params: Promise<{ id: string }> }

type Review = {
  id: string
  reviewer_name: string | null
  rating: number
  content: string | null
  created_at: string
}

async function getBusiness(id: string) {
  return getPublicBusiness(id)
}

async function getReviews(businessId: string): Promise<Review[]> {
  const { data } = await supabaseAdmin
    .from('business_reviews')
    .select('id, reviewer_name, rating, content, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data || []) as Review[]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const b = await getBusiness(id)
  return {
    title: b ? `${b.businessname || b.name} | 올수리 사업자` : '사업자 프로필 | 올수리',
    description: b?.bio || `${b?.businessname || b?.name}의 올수리 사업자 프로필`,
    alternates: { canonical: absoluteUrl(`/business/${id}`) },
  }
}

function StarRow({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg'
  return (
    <span className={`${sizeClass} leading-none`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-200'}>★</span>
      ))}
    </span>
  )
}

function RatingBar({ value, max, count }: { value: number; max: number; count: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-3 text-gray-500 text-right">{value}</span>
      <span className="text-yellow-400 text-xs">★</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-yellow-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-gray-400 text-xs text-right">{count}</span>
    </div>
  )
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 86400) return `${Math.floor(diff / 3600) || 1}시간 전`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}일 전`
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}개월 전`
  return new Date(dateStr).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })
}

export default async function BusinessProfilePage({ params }: Props) {
  const { id } = await params
  const b = await getBusiness(id)
  if (!b) notFound()

  const reviews = await getReviews(id)

  const totalReviews = reviews.length
  const avgRating = totalReviews > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
    : null

  // 별점 분포
  const dist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  reviews.forEach((r) => { if (dist[r.rating] !== undefined) dist[r.rating]++ })
  const maxDist = Math.max(...Object.values(dist))

  // 상호명 우선, 없으면 이름
  const displayName = ((b.businessname && b.businessname.trim()) ? b.businessname : b.name) || '사업자'
  const showPersonName = b.name && b.name !== displayName

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Back */}
        <Link href="/business" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mb-5 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          사업자 목록
        </Link>

        {/* ── Profile Hero ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
          {/* 상단 컬러 배너 */}
          <div className="h-24 bg-gradient-to-br from-blue-500 to-blue-700" />

          <div className="px-6 pb-6">
            {/* 아바타 */}
            <div className="relative -mt-12 mb-4">
              <div className="w-20 h-20 rounded-2xl bg-white border-4 border-white shadow-md overflow-hidden flex items-center justify-center text-blue-600 font-bold text-3xl">
                {b.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  displayName[0]
                )}
              </div>
            </div>

            {/* 업체명 + 평점 */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
                {showPersonName && (
                  <p className="text-sm text-gray-500 mt-0.5">사장님 성함: {b.name}</p>
                )}
                {b.address && (
                  <p className="text-sm text-gray-400 mt-0.5">📍 {b.address}</p>
                )}
                {avgRating !== null && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <StarRow rating={avgRating} size="sm" />
                    <span className="text-sm font-bold text-gray-700">{avgRating.toFixed(1)}</span>
                    <span className="text-xs text-gray-400">리뷰 {totalReviews}개</span>
                  </div>
                )}
              </div>

              {/* 통계 배지 */}
              <div className="flex gap-3">
                {(b.jobs_accepted_count ?? 0) > 0 && (
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">{b.jobs_accepted_count}</div>
                    <div className="text-xs text-gray-400">완료</div>
                  </div>
                )}
                {(b.estimates_created_count ?? 0) > 0 && (
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">{b.estimates_created_count}</div>
                    <div className="text-xs text-gray-400">견적</div>
                  </div>
                )}
                {totalReviews > 0 && (
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">{totalReviews}</div>
                    <div className="text-xs text-gray-400">후기</div>
                  </div>
                )}
              </div>
            </div>

            {/* 소개글 / 상세 설명 */}
            {(b.bio || b.description) && (
              <p className="mt-4 text-sm text-gray-600 leading-relaxed border-t border-gray-50 pt-4">
                {b.bio || b.description}
              </p>
            )}

            {/* 업종 / 지역 */}
            {(b.category || b.region) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {b.category && (
                  <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-3 py-1.5 rounded-full border border-blue-100 font-medium">
                    🔧 {b.category}
                  </span>
                )}
                {b.region && (
                  <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-700 text-sm px-3 py-1.5 rounded-full border border-gray-200 font-medium">
                    📍 {b.region}
                  </span>
                )}
              </div>
            )}

            {/* 전문 분야 */}
            {b.specialties && b.specialties.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">전문 분야</p>
                <div className="flex flex-wrap gap-1.5">
                  {b.specialties.map((s: string) => (
                    <span key={s} className="bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-full font-medium border border-blue-100">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 서비스 지역 */}
            {b.serviceareas && b.serviceareas.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">서비스 지역</p>
                <div className="flex flex-wrap gap-1.5">
                  {b.serviceareas.map((area: string) => (
                    <span key={area} className="bg-gray-50 text-gray-600 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                      📍 {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 연락처 (가입일) */}
            <div className="mt-4 pt-4 border-t border-gray-50 flex flex-wrap gap-4 text-xs text-gray-400">
              {b.createdat && (
                <span>가입일: {new Date(b.createdat).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-5 text-white mb-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
          <div>
            <p className="font-bold text-lg leading-tight">이 업체에 견적 요청하기</p>
            <p className="text-blue-100 text-sm mt-0.5">무료 · 로그인 불필요 · 3분이면 완료</p>
          </div>
          <Link
            href="/requests"
            className="shrink-0 bg-white text-blue-600 font-bold px-6 py-2.5 rounded-xl hover:bg-blue-50 transition-colors text-sm shadow"
          >
            무료 견적 받기 →
          </Link>
        </div>

        {/* ── Reviews ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 pt-6 pb-5 border-b border-gray-50">
            <h2 className="text-lg font-bold text-gray-900">고객 후기</h2>
          </div>

          {totalReviews === 0 ? (
            <div className="py-14 text-center">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-gray-500 font-medium">아직 후기가 없습니다</p>
              <p className="text-gray-400 text-sm mt-1">첫 번째 후기를 남겨보세요</p>
            </div>
          ) : (
            <>
              {/* 평점 요약 */}
              <div className="px-6 py-5 bg-gray-50 border-b border-gray-100 grid md:grid-cols-2 gap-6 items-center">
                {/* 왼쪽: 평균 */}
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-5xl font-black text-gray-900">{avgRating!.toFixed(1)}</div>
                    <StarRow rating={avgRating!} size="lg" />
                    <p className="text-xs text-gray-400 mt-1">{totalReviews}개 리뷰</p>
                  </div>
                  {/* 오른쪽: 분포 */}
                  <div className="flex-1 space-y-1.5">
                    {[5, 4, 3, 2, 1].map((v) => (
                      <RatingBar key={v} value={v} max={maxDist} count={dist[v]} />
                    ))}
                  </div>
                </div>

                {/* 오른쪽: 한 줄 요약 */}
                <div className="hidden md:block text-sm text-gray-500 leading-relaxed">
                  {avgRating! >= 4.5 && <p className="text-blue-600 font-semibold">⭐ 고객들이 매우 만족하는 업체입니다</p>}
                  {avgRating! >= 4.0 && avgRating! < 4.5 && <p className="text-green-600 font-semibold">✅ 고객 만족도가 높은 업체입니다</p>}
                  {avgRating! < 4.0 && <p className="text-gray-500 font-semibold">💬 고객들의 다양한 후기가 있습니다</p>}
                  <p className="mt-2 text-gray-400">전문 분야: {(b.specialties || []).slice(0, 3).join(', ') || '-'}</p>
                </div>
              </div>

              {/* 후기 목록 */}
              <div className="divide-y divide-gray-50">
                {reviews.map((r) => (
                  <div key={r.id} className="px-6 py-5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      {/* 작성자 */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                          {(r.reviewer_name || '익')[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{r.reviewer_name || '익명'}</p>
                          <p className="text-xs text-gray-400">{timeAgo(r.created_at)}</p>
                        </div>
                      </div>
                      {/* 별점 */}
                      <div className="flex items-center gap-1 shrink-0">
                        <StarRow rating={r.rating} size="sm" />
                        <span className="text-sm font-semibold text-gray-600 ml-1">{r.rating}.0</span>
                      </div>
                    </div>
                    {r.content && (
                      <p className="mt-3 text-sm text-gray-600 leading-relaxed pl-11">{r.content}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
