import { SERVICE_GUIDES } from '@/lib/service-guides'
import { SITE_NAME, absoluteUrl } from '@/lib/site'

/**
 * `/rss.xml` — 설비·청소 안내 페이지 목록.
 * 네이버 서치어드바이저 → 요청 → RSS 제출에 이 주소를 넣으면 새 안내 페이지를 더 빨리 수집합니다.
 */
export const dynamic = 'force-static'

/** 안내 내용을 크게 고친 날. 안내를 추가·수정하면 함께 바꿔 주세요. */
const GUIDES_UPDATED_AT = new Date('2026-10-22T09:00:00+09:00')

function xml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string)
}

export function GET() {
  const items = SERVICE_GUIDES.map((guide) => {
    const url = absoluteUrl(`/services/${guide.slug}`)
    return `    <item>
      <title>${xml(guide.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${xml(guide.description)}</description>
      <category>${xml(guide.kind === '청소' ? '청소' : '집수리·설비')}</category>
      <pubDate>${GUIDES_UPDATED_AT.toUTCString()}</pubDate>
    </item>`
  }).join('\n')

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(`${SITE_NAME} 집수리·설비·청소 견적 안내`)}</title>
    <link>${absoluteUrl('/services')}</link>
    <description>하수구 막힘, 누수 탐지, 보일러, 입주청소, 에어컨 청소 등 견적 전에 확인할 내용</description>
    <language>ko</language>
    <lastBuildDate>${GUIDES_UPDATED_AT.toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`
  return new Response(feed, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
}
