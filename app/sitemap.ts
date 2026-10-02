import type { MetadataRoute } from 'next'
import { SERVICE_GUIDES } from '@/lib/service-guides'
import { absoluteUrl } from '@/lib/site'

/**
 * `/sitemap.xml` 을 빌드 시 생성합니다. 안내 페이지를 추가·삭제하면
 * SERVICE_GUIDES 만 수정해도 사이트맵이 함께 갱신됩니다.
 *
 * 포함 기준: 로그인 없이 접근 가능하고, 200 을 반환하며, 검색 노출을 의도하고,
 * canonical 과 일치하며, 고유한 내용이 있는 URL 만 넣습니다.
 *
 * 그래서 아래는 의도적으로 제외했습니다.
 *  - /my-order          개인 견적 조회 화면 (noindex)
 *  - /community, /community/[id]  아직 준비중인 빈 페이지 (noindex)
 *  - /business/[id]     공개 동의·프로필 충실도 기준이 정해지기 전까지 일괄 포함하지 않음
 *  - /allsuri/[slug]    개인 오더 링크 (noindex, 공개 검색 대상 아님)
 *  - /admin/*, /api/*   관리자 화면과 내부 API
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: absoluteUrl('/services'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    ...SERVICE_GUIDES.map((guide) => ({
      url: absoluteUrl(`/services/${guide.slug}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    {
      url: absoluteUrl('/requests'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/requests/ai'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: absoluteUrl('/business'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ]
}
