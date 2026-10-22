/**
 * Netlify 배포가 끝나면 자동으로 실행됩니다(이벤트 함수: 파일 이름이 deploy-succeeded).
 * 운영(production) 배포일 때 사이트맵의 주소를 IndexNow 로 알려
 * 네이버(서치어드바이저)와 Bing 이 바뀐 페이지를 빨리 다시 수집하게 합니다.
 *
 * 키 파일: public/d6e03ac13743796f4b779c6084bdf4b9.txt (IndexNow 규칙상 공개되는 값이라 비밀이 아닙니다)
 * 실패해도 배포에는 영향이 없습니다.
 */
const SITE = 'https://allsuri.app'
const KEY = 'd6e03ac13743796f4b779c6084bdf4b9'
const ENDPOINTS = ['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow']

type DeployEvent = { body?: string | null }

export const handler = async (event: DeployEvent) => {
  let context = ''
  try {
    context = JSON.parse(event.body || '{}')?.payload?.context ?? ''
  } catch {
    /* 본문 형식이 달라도 무시 */
  }
  if (context !== 'production') {
    return { statusCode: 200, body: `skip (${context || 'unknown'})` }
  }

  const sitemap = await fetch(`${SITE}/sitemap.xml`).then((r) => r.text()).catch(() => '')
  const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => u.startsWith(SITE))
  if (urlList.length === 0) return { statusCode: 200, body: 'no urls' }

  const body = JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList })
  const results = await Promise.all(
    ENDPOINTS.map((url) =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body })
        .then((r) => `${new URL(url).host} ${r.status}`)
        .catch((e) => `${new URL(url).host} error ${e instanceof Error ? e.message : String(e)}`),
    ),
  )
  console.log(`[indexnow] ${urlList.length} urls → ${results.join(', ')}`)
  return { statusCode: 200, body: results.join('\n') }
}
