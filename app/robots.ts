import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

/**
 * `/robots.txt` 를 빌드 시 생성합니다. (이전의 정적 public/robots.txt 대체)
 *
 * 개인 조회 화면(`/my-order`)과 개인 오더 링크(`/allsuri/*`)는 여기서 막지 않습니다.
 * 크롤러가 페이지를 읽고 `noindex` 를 보게 해야 색인에서 빠지기 때문입니다.
 * 두 화면의 실제 보호는 기존 접근 제어(전화번호+비밀번호 조회, 관리자 로그인)가 담당합니다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 관리자 화면과 내부 API 는 검색 대상이 아닙니다.
        disallow: ['/admin', '/admin/', '/api/'],
      },
      {
        userAgent: 'Mediapartners-Google',
        allow: '/',
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  }
}
