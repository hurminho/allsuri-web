import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  acceptsNewOrders,
  findPersonalOrderLinkBySlug,
  getContractorPublicProfile,
} from '@/lib/personal-order-link'
import PersonalLinkRequestForm from './PersonalLinkRequestForm'

// 공유 직후 바로 열리는 페이지이므로 캐시를 두지 않습니다(일시중지 반영 지연 방지).
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const link = await findPersonalOrderLinkBySlug(slug)
  if (!link) return { title: '올수리' }

  const name = link.display_name || '올수리 사업자'
  // 공유 미리보기에는 상호·전문분야만 노출합니다(연락처 등 개인정보 금지).
  const description =
    link.headline ||
    `${name}에게 바로 견적을 요청하세요. 앱 설치 없이, 무료로 접수됩니다.`

  return {
    title: `${name} | 올수리 견적 요청`,
    description,
    openGraph: {
      title: `${name} | 올수리 견적 요청`,
      description,
      siteName: '올수리',
      locale: 'ko_KR',
      type: 'website',
    },
    robots: { index: false, follow: false },
  }
}

export default async function PersonalOrderLinkPage({ params }: Props) {
  const { slug } = await params
  const link = await findPersonalOrderLinkBySlug(slug)
  if (!link) notFound()

  const contractor = await getContractorPublicProfile(link.contractor_id)
  const displayName = link.display_name || contractor?.displayName || '사업자'
  const open = acceptsNewOrders(link)

  const specialties =
    link.supported_categories && link.supported_categories.length > 0
      ? link.supported_categories
      : contractor?.specialties ?? []
  const regions =
    link.service_regions && link.service_regions.length > 0
      ? link.service_regions
      : contractor?.serviceAreas ?? []
  const avatar = link.profile_image_url || contractor?.avatarUrl || null
  const intro = link.introduction || contractor?.bio || null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* ── 사업자 소개 ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div className="h-20 bg-gradient-to-br from-blue-500 to-blue-700" />
          <div className="px-5 pb-5">
            <div className="relative -mt-10 mb-3">
              <div className="w-20 h-20 rounded-2xl bg-white border-4 border-white shadow-md overflow-hidden flex items-center justify-center text-blue-600 font-bold text-3xl">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  displayName[0]
                )}
              </div>
            </div>

            <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
            {link.headline && (
              <p className="text-sm text-gray-500 mt-1">{link.headline}</p>
            )}

            {link.verification_status === 'verified' && (
              <span className="inline-flex items-center gap-1 mt-2 bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full border border-green-100 font-medium">
                ✓ 확인된 사업자
              </span>
            )}

            {intro && (
              <p className="mt-3 text-sm text-gray-600 leading-relaxed border-t border-gray-50 pt-3">
                {intro}
              </p>
            )}

            {specialties.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-400 mb-1.5">전문 분야</p>
                <div className="flex flex-wrap gap-1.5">
                  {specialties.map((s) => (
                    <span
                      key={s}
                      className="bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-full font-medium border border-blue-100"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {regions.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-400 mb-1.5">서비스 지역</p>
                <div className="flex flex-wrap gap-1.5">
                  {regions.map((r) => (
                    <span
                      key={r}
                      className="bg-gray-50 text-gray-600 text-xs px-2.5 py-1 rounded-full border border-gray-200"
                    >
                      📍 {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 직접 배정 안내 ── */}
        <div className="bg-blue-600 text-white rounded-2xl p-4 mb-4 flex items-start gap-3 shadow-sm">
          <span className="text-xl leading-none mt-0.5">🔒</span>
          <div>
            <p className="font-bold">이 요청은 {displayName} 사장님에게만 전달됩니다</p>
            <p className="text-blue-100 text-sm mt-1 leading-relaxed">
              다른 업체에게 공개되거나 여러 곳에서 연락이 오지 않습니다.
              로그인이나 앱 설치 없이 바로 접수할 수 있어요.
            </p>
          </div>
        </div>

        {/* ── 접수 폼 / 중단 안내 ── */}
        {open ? (
          <PersonalLinkRequestForm
            slug={link.slug}
            contractorName={displayName}
            categories={specialties}
          />
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="text-4xl mb-3">🕐</div>
            <p className="font-bold text-gray-800">지금은 새로운 요청을 받고 있지 않습니다</p>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              {displayName} 사장님이 접수를 잠시 멈춰두었습니다.
              <br />
              급한 공사라면 올수리에서 다른 업체 견적을 받아보실 수 있습니다.
            </p>
            <a
              href="/requests"
              className="inline-block mt-5 bg-gray-100 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-200 transition-colors text-sm"
            >
              다른 업체 견적 비교하기
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
