import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { supabase, CATEGORIES, CATEGORY_ICONS } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-server'
import { SERVICE_GUIDES } from '@/lib/service-guides'
import { SITE_NAME, absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  alternates: { canonical: absoluteUrl('/') },
}

const steps = [
  { num: '01', title: '견적 요청', desc: '어떤 수리가 필요한지\n간단히 입력하세요', icon: '📝' },
  { num: '02', title: '업체 매칭', desc: '작업이 가능한 전문 업체가\n직접 견적서를 보내드립니다', icon: '🔔' },
  { num: '03', title: '비교 선택', desc: '받은 견적을 비교해\n마음에 드는 업체를 선택하세요', icon: '✅' },
]

type WebAd = { id: string; title: string; image_url: string | null; link_url: string | null; position: string }
type FeaturedBusiness = {
  id: string; userId: string; businessName: string
  phonenumber: string; category: string; region: string
  avatarUrl: string | null; jobsCount: number
  avgRating: number | null; reviewCount: number
}

async function getWebContent(): Promise<{ settings: Record<string, string>; ads: WebAd[]; featured: FeaturedBusiness[] }> {
  // ── 사이트 설정 + 광고 (anon key – public 테이블)
  const [settingsResult, adsResult] = await Promise.all([
    supabase.from('web_settings').select('key, value'),
    supabase.from('web_ads').select('id, title, image_url, link_url, position').eq('is_active', true).order('sort_order', { ascending: true }),
  ])
  const settingsData = settingsResult.data ?? null
  const adsData = adsResult.data ?? null
  const settings: Record<string, string> = {}
  ;(settingsData || []).forEach((s: { key: string; value: string }) => { settings[s.key] = s.value })

  // ── 추천 업체: supabaseAdmin (service_role) 사용 → users RLS bypass
  let featured: FeaturedBusiness[] = []
  try {
    const { data: featData } = await supabaseAdmin
      .from('web_featured_businesses')
      .select('id, user_id')
      .order('sort_order', { ascending: true })

    const featList = (featData || []) as { id: string; user_id: string }[]
    const featIds = featList.map(f => f.user_id).filter(Boolean)

    if (featIds.length > 0) {
      const [{ data: usersData }, { data: reviewsData }] = await Promise.all([
        supabaseAdmin.from('users').select('id, name, businessname, phonenumber, category, region, avatar_url, jobs_accepted_count').in('id', featIds),
        supabaseAdmin.from('business_reviews').select('business_id, rating').in('business_id', featIds),
      ])

      const usersMap: Record<string, { id: string; name: string; businessname: string | null; phonenumber: string | null; category: string | null; region: string | null; avatar_url: string | null; jobs_accepted_count: number | null }> = {}
      ;(usersData || []).forEach((u: typeof usersMap[string]) => { usersMap[u.id] = u })

      const ratingMap: Record<string, { sum: number; count: number }> = {}
      ;(reviewsData || []).forEach((r: { business_id: string; rating: number }) => {
        if (!ratingMap[r.business_id]) ratingMap[r.business_id] = { sum: 0, count: 0 }
        ratingMap[r.business_id].sum += r.rating
        ratingMap[r.business_id].count += 1
      })

      featured = featList.map(f => {
        const u = usersMap[f.user_id]
        if (!u) return null
        const rm = ratingMap[f.user_id]
        return {
          id: f.id, userId: f.user_id,
          businessName: u.businessname || u.name || '',
          phonenumber: u.phonenumber || '',
          category: u.category || '',
          region: u.region || '',
          avatarUrl: u.avatar_url || null,
          jobsCount: u.jobs_accepted_count || 0,
          avgRating: rm ? Math.round((rm.sum / rm.count) * 10) / 10 : null,
          reviewCount: rm?.count || 0,
        }
      }).filter((x): x is FeaturedBusiness => x !== null)
    }
  } catch (e) {
    console.warn('[getWebContent] featured 로드 실패:', e)
  }

  return { settings, ads: (adsData || []) as WebAd[], featured }
}

export default async function Home() {
  const { settings, ads, featured } = await getWebContent()
  const noticeBannerActive = settings.notice_banner_active === 'true'
  const homeTopAds = ads.filter(a => a.position === 'home_top')
  const homeMiddleAds = ads.filter(a => a.position === 'home_middle')
  const homeBottomAds = ads.filter(a => a.position === 'home_bottom')

  // 실제 후기·평점 데이터가 검증되기 전까지 Review/AggregateRating 은 넣지 않습니다.
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: absoluteUrl('/'),
      inLanguage: 'ko-KR',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: absoluteUrl('/'),
      logo: absoluteUrl('/app-icon.png'),
      description: '집수리 전문가와 고객을 연결하는 견적 매칭 플랫폼',
      areaServed: { '@type': 'Country', name: '대한민국' },
    },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* 알림 배너 (관리자 설정 시 표시) */}
      {noticeBannerActive && settings.notice_banner && (
        <div className="bg-blue-700 text-white text-center text-sm py-2 px-4 font-medium">
          📢 {settings.notice_banner}
        </div>
      )}
      {/* 홈 상단 광고 배너 */}
      {homeTopAds.map(ad => (
        <a key={ad.id} href={ad.link_url || '#'} target="_blank" rel="noopener" className="block">
          {ad.image_url
            ? <Image src={ad.image_url} alt={ad.title} width={1200} height={200} className="w-full max-h-32 object-cover" />
            : <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white text-center py-4 font-bold">{ad.title}</div>
          }
        </a>
      ))}
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Image src="/app-icon.png" alt="올수리" width={52} height={52} className="rounded-2xl shadow-md" />
            <span className="text-3xl font-extrabold tracking-tight">올수리</span>
          </div>
          <p className="text-blue-200 text-sm font-medium mb-3 tracking-wider uppercase">앱 설치 없이 · 회원가입 없이 · 무료로</p>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-5">
            집수리, 이제<br />
            <span className="text-yellow-300">올수리</span>에서 해결하세요
          </h1>
          <p className="text-blue-100 text-lg mb-8 leading-relaxed">
            누수·배관·방수·리모델링 등 등록된 전문 업체가<br className="hidden md:block" />
            직접 견적서를 보내드립니다
          </p>
          <Link
            href="/requests/ai"
            className="inline-block bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold text-lg px-8 py-4 rounded-xl shadow-lg transition-all hover:scale-105"
          >
            한 줄 견적 요청 AI →
          </Link>
          <p className="mt-3 text-blue-100 text-sm">무슨 공사인지 몰라도 괜찮아요. 상황을 한 줄로 알려주세요.</p>
          <p className="mt-4 text-blue-200 text-sm">요청 비용 무료 · 앱 설치 불필요 · <Link href="/requests?mode=manual" className="underline">직접 입력하기</Link></p>
        </div>
      </section>

      {/* Categories */}
      <section className="py-14 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-8">어떤 수리가 필요하신가요?</h2>
          <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat}
                href={`/requests?category=${encodeURIComponent(cat)}`}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
              >
                <span className="text-3xl">{CATEGORY_ICONS[cat]}</span>
                <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600">{cat}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-14 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">어떻게 이용하나요?</h2>
          <p className="text-center text-gray-500 mb-10">3단계로 간편하게</p>
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((step) => (
              <div key={step.num} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
                <div className="text-4xl mb-3">{step.icon}</div>
                <div className="text-blue-600 font-bold text-sm mb-1">STEP {step.num}</div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed whitespace-pre-line">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              href="/requests/ai"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
            >
              한 줄 견적 요청 AI
            </Link>
          </div>
        </div>
      </section>

      {/* 이번 달 우수 업체 */}
      {featured.length > 0 && (
        <section className="py-14 px-4 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <span className="inline-block bg-yellow-100 text-yellow-700 text-xs font-bold px-3 py-1 rounded-full mb-2">⭐ 광고</span>
              <h2 className="text-2xl font-bold text-gray-900">이번 달 우수 업체</h2>
              <p className="text-gray-500 mt-1 text-sm">검증된 전문 업체를 만나보세요</p>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {featured.map((biz, idx) => (
                <Link key={biz.id} href={`/business/${biz.userId}`}
                  className="bg-white rounded-2xl border border-gray-100 hover:border-blue-300 hover:shadow-md p-5 transition-all relative group">
                  {/* 순위 배지 */}
                  <div className="absolute top-4 right-4 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </div>
                  {/* 아바타 */}
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xl mb-3 overflow-hidden">
                    {biz.avatarUrl
                      ? <img src={biz.avatarUrl} alt={biz.businessName} className="w-full h-full object-cover" />
                      : biz.businessName[0]}
                  </div>
                  {/* 업체명 */}
                  <div className="font-bold text-gray-900 text-base mb-0.5 group-hover:text-blue-600 transition-colors">
                    {biz.businessName}
                  </div>
                  {/* 평점 */}
                  {biz.avgRating !== null ? (
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-yellow-400 text-sm">{'★'.repeat(Math.round(biz.avgRating))}{'☆'.repeat(5 - Math.round(biz.avgRating))}</span>
                      <span className="text-sm font-semibold text-gray-700">{biz.avgRating.toFixed(1)}</span>
                      <span className="text-xs text-gray-400">({biz.reviewCount})</span>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-300 mb-1">리뷰 없음</div>
                  )}
                  {/* 카테고리 · 지역 */}
                  <div className="text-xs text-gray-500 mb-2">{biz.category}{biz.region ? ` · ${biz.region}` : ''}</div>
                  {/* 연락처 */}
                  {biz.phonenumber && (
                    <div className="flex items-center gap-1 text-sm text-blue-600 font-semibold mt-2 pt-2 border-t border-gray-100">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {biz.phonenumber}
                    </div>
                  )}
                  {biz.jobsCount > 0 && (
                    <div className="text-xs text-gray-400 mt-1">완료 {biz.jobsCount}건</div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 수리 종류별 안내 */}
      <section className="py-14 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">어떤 작업이 필요한지 모르시겠다면</h2>
          <p className="text-center text-gray-500 mb-10">증상과 확인할 점부터 정리해 두었습니다</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {SERVICE_GUIDES.map((guide) => (
              <Link
                key={guide.slug}
                href={`/services/${guide.slug}`}
                className="bg-white rounded-2xl border border-gray-200 hover:border-blue-400 hover:shadow-sm p-5 transition-all"
              >
                <h3 className="font-bold text-gray-900 mb-1.5">{guide.navLabel} 수리 안내</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{guide.description}</p>
                <span className="inline-block text-sm text-blue-600 font-semibold mt-3">자세히 보기 →</span>
              </Link>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/services" className="text-blue-600 font-semibold hover:underline">
              수리 안내 전체 보기 →
            </Link>
          </div>
        </div>
      </section>

      {/* 이용 조건 — 검증 가능한 사실만 */}
      <section className="py-12 px-4 bg-blue-600 text-white">
        <div className="max-w-4xl mx-auto grid grid-cols-3 text-center gap-4">
          <div>
            <div className="text-2xl md:text-3xl font-bold">무료</div>
            <div className="text-blue-200 text-sm mt-1">견적 요청 비용</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold">앱 없이</div>
            <div className="text-blue-200 text-sm mt-1">웹에서 바로 요청</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold">가입 없이</div>
            <div className="text-blue-200 text-sm mt-1">전화번호로 조회</div>
          </div>
        </div>
      </section>

      {/* 홈 중간 광고 */}
      {homeMiddleAds.length > 0 && (
        <div className="py-4 px-4 bg-gray-50">
          <div className="max-w-4xl mx-auto flex flex-col gap-3">
            {homeMiddleAds.map(ad => (
              <a key={ad.id} href={ad.link_url || '#'} target="_blank" rel="noopener" className="block rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                {ad.image_url
                  ? <Image src={ad.image_url} alt={ad.title} width={1000} height={160} className="w-full object-cover max-h-40" />
                  : <div className="bg-gradient-to-r from-green-500 to-teal-500 text-white text-center py-6 font-bold text-lg">{ad.title}</div>
                }
              </a>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <section className="py-16 px-4 bg-gray-900 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">지금 바로 무료 견적을 받아보세요</h2>
          <p className="text-gray-400 mb-8">앱 설치 · 회원가입 불필요. 3분이면 충분합니다.</p>
          <Link
            href="/requests/ai"
            className="inline-block bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold text-lg px-10 py-4 rounded-xl transition-all hover:scale-105"
          >
            한 줄 견적 요청 AI →
          </Link>
        </div>
      </section>

      {/* 홈 하단 광고 */}
      {homeBottomAds.length > 0 && (
        <div className="py-4 px-4 bg-white border-t border-gray-100">
          <div className="max-w-4xl mx-auto flex flex-col gap-3">
            {homeBottomAds.map(ad => (
              <a key={ad.id} href={ad.link_url || '#'} target="_blank" rel="noopener" className="block rounded-xl overflow-hidden">
                {ad.image_url
                  ? <Image src={ad.image_url} alt={ad.title} width={1000} height={120} className="w-full object-cover max-h-32" />
                  : <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white text-center py-5 font-bold">{ad.title}</div>
                }
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
