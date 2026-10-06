/**
 * 대표 도메인. canonical·사이트맵·Open Graph 가 모두 이 값을 씁니다.
 *
 * 운영 도메인은 allsuri.app 입니다(Netlify 기본 도메인 allsuricommerce.netlify.app 에서 이전).
 * 도메인을 바꿀 때는 NEXT_PUBLIC_SITE_URL 환경변수만 바꾸면 전체가 따라갑니다.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://allsuri.app'
).replace(/\/+$/, '')

export const SITE_NAME = '올수리'

/** 경로를 대표 도메인 기준 절대 URL 로 바꿉니다. */
export function absoluteUrl(path: string): string {
  if (!path.startsWith('/')) return `${SITE_URL}/${path}`
  return `${SITE_URL}${path === '/' ? '' : path}`
}
