'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const PAGE_SIZE = 20

type Business = {
  id: string
  name: string
  businessname: string | null
  avatar_url: string | null
  address: string | null
  serviceareas: string[] | null
  specialties: string[] | null
  estimates_created_count: number | null
  jobs_accepted_count: number | null
  avgRating: number
  reviewCount: number
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <div className="flex items-center gap-1">
      <div className="flex text-yellow-400 text-sm">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i}>
            {i <= full ? '★' : i === full + 1 && half ? '½' : '☆'}
          </span>
        ))}
      </div>
      <span className="text-sm font-semibold text-gray-700">{rating.toFixed(1)}</span>
      <span className="text-xs text-gray-400">({count})</span>
    </div>
  )
}

function BusinessCard({ b }: { b: Business }) {
  // 상호명 우선 표시
  const displayName = (b.businessname && b.businessname.trim()) ? b.businessname : b.name
  const initial = displayName[0] || '?'
  // 대표자명: 상호명과 다를 때만 표시
  const showPersonName = b.name && b.name !== displayName

  return (
    <Link
      href={`/business/${b.id}`}
      className="bg-white rounded-2xl border border-gray-100 hover:border-blue-300 hover:shadow-md p-5 transition-all block"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg overflow-hidden flex-shrink-0">
          {b.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.avatar_url} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            initial
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900 truncate">{displayName}</div>
          {showPersonName && (
            <div className="text-xs text-gray-400 truncate mt-0.5">사장님 성함: {b.name}</div>
          )}
          {b.address && (
            <div className="text-xs text-gray-400 truncate mt-0.5">📍 {b.address}</div>
          )}
        </div>
      </div>

      {/* 전문 분야 */}
      {b.specialties && b.specialties.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {b.specialties.slice(0, 4).map((s) => (
            <span
              key={s}
              className="text-xs bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full font-medium"
            >
              {s}
            </span>
          ))}
          {b.specialties.length > 4 && (
            <span className="text-xs text-gray-400 px-1">+{b.specialties.length - 4}</span>
          )}
        </div>
      )}

      {/* 평점 + 통계 */}
      <div className="flex items-center justify-between mt-2">
        {b.reviewCount > 0 ? (
          <StarRating rating={b.avgRating} count={b.reviewCount} />
        ) : (
          <span className="text-xs text-gray-300">후기 없음</span>
        )}
        {(b.jobs_accepted_count ?? 0) > 0 && (
          <span className="text-xs text-gray-400">
            완료 <span className="font-semibold text-gray-600">{b.jobs_accepted_count}</span>건
          </span>
        )}
      </div>
    </Link>
  )
}

export default function BusinessList({ initialCount }: { initialCount: number }) {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(initialCount)

  async function fetchPage(pageNum: number): Promise<{ items: Business[]; total: number }> {
    // users 테이블은 브라우저에서 직접 읽지 않습니다(민감 컬럼 보호). 서버가 공개 컬럼만 내려줍니다.
    try {
      const res = await fetch(`/api/businesses?page=${pageNum}&size=${PAGE_SIZE}`)
      if (!res.ok) return { items: [], total: 0 }
      return (await res.json()) as { items: Business[]; total: number }
    } catch {
      return { items: [], total: 0 }
    }
  }

  useEffect(() => {
    fetchPage(0).then(({ items, total: t }) => {
      setBusinesses(items)
      setTotal(t)
      setHasMore(items.length === PAGE_SIZE)
      setLoading(false)
    })
  }, [])

  async function loadMore() {
    setLoadingMore(true)
    const next = page + 1
    const { items, total: t } = await fetchPage(next)
    setBusinesses((prev) => [...prev, ...items])
    setTotal(t)
    setPage(next)
    setHasMore(items.length === PAGE_SIZE)
    setLoadingMore(false)
  }

  if (loading) {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-gray-200" />
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-1" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
            <div className="flex gap-1 mb-3">
              <div className="h-5 bg-gray-100 rounded-full w-14" />
              <div className="h-5 bg-gray-100 rounded-full w-14" />
            </div>
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    )
  }

  if (businesses.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-5xl mb-4">🏪</div>
        <p className="text-lg font-medium">등록된 사업자가 없습니다</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {businesses.map((b) => (
          <BusinessCard key={b.id} b={b} />
        ))}
      </div>

      {/* 더 보기 */}
      {hasMore && (
        <div className="mt-8 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-8 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <span className="flex items-center gap-2 justify-center">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                불러오는 중...
              </span>
            ) : (
              `더 보기 (${businesses.length} / ${total})`
            )}
          </button>
        </div>
      )}

      {!hasMore && businesses.length > 0 && (
        <p className="mt-8 text-center text-sm text-gray-400">
          전체 {total}개 업체를 모두 불러왔습니다
        </p>
      )}
    </>
  )
}
