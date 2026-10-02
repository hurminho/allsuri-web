# 네이버 검색 노출 진단 (allsuricommerce.netlify.app)

조사일: 2026-10-02
대상: 올수리 소비자용 웹 `https://allsuricommerce.netlify.app`
방법: 저장소 코드 확인 + 배포된 URL 의 실제 HTTP 응답/원본 HTML 확인

> 이 문서는 검색 노출이나 순위를 보장하지 않습니다. 아래는 "네이버가 사이트를 수집·색인할 수 있는 상태인가"를
> 확인한 결과와, 수집·색인을 막거나 품질을 떨어뜨리는 요소를 정리한 것입니다.

## 0. 기반 환경

| 항목 | 확인 결과 | 근거 |
| --- | --- | --- |
| 프레임워크 | Next.js 16.2.3 App Router, React 19 | `package.json` |
| 렌더링 | 서버 렌더링(RSC). **SPA 가 아님** | 아래 1-A 참조 |
| 빌드 | `npm run build` → `next build` | `package.json`, `netlify.toml` |
| 배포 | Netlify + `@netlify/plugin-nextjs`, publish `.next` | `netlify.toml` |
| 대표 도메인 | `allsuricommerce.netlify.app` (Netlify 기본 도메인). 별도 연결 도메인 없음 | `netlify.toml`, 기존 코드의 OG url |
| 다른 도메인 | `api.allsuri.app` 은 **별개 사이트**(Flutter 저장소의 Netlify Functions + 관리자). 소비자 웹과 콘텐츠 중복 없음 | `allsuriapp/netlify.toml` |
| 언어 | `<html lang="ko">` 정상 | `app/layout.tsx` |

### 1-A. 자바스크립트 실행 전 HTML 에 본문이 있는가 — 있음

`curl` 로 받은 원본 HTML(자바스크립트 미실행)에 페이지별 고유 `title`, `description`, `H1`, 본문이 존재합니다.
즉 **"빈 root div 만 내려주는 SPA 수집 불가" 문제는 해당하지 않습니다.** 프리렌더링/SSR 추가 도입이 불필요합니다.

| URL | HTTP | title | H1 | 본문 길이(태그 제거) |
| --- | --- | --- | --- | --- |
| `/` | 200 | 올수리 - 집수리 전문 견적 서비스 | 집수리, 이제 올수리에서 해결하세요 | 약 24,900자 |
| `/requests` | 200 | 무료 견적 요청 \| 올수리 | 견적 요청 | 약 11,900자 |
| `/requests/ai` | 200 | 한 줄 견적 요청 AI \| 올수리 | 무슨 공사인지 몰라도 괜찮아요 | 약 11,700자 |
| `/my-order` | 200 | 내 견적 현황 \| 올수리 | **없음** | 약 10,100자 |
| `/business` | 200 | 전문 사업자 찾기 \| 올수리 | 전문 사업자 찾기 | 약 12,000자 |
| `/community` | 200 | 시공 후기 \| 올수리 | 시공 후기 | 약 10,600자 |

### 1-B. 그 외 응답 확인

| URL | HTTP | 비고 |
| --- | --- | --- |
| `/robots.txt` | 200 `text/plain` | 규칙 자체는 정상(Allow: /) |
| `/sitemap.xml` | **404** | robots.txt 가 가리키는데 실존하지 않음 |
| `/this-page-does-not-exist-12345` | 404 | 존재하지 않는 URL 의 404 처리는 정상 |
| `/admin` | 307 → `/admin/login` | 관리자 접근 제어 정상 |
| `/allsuri/{slug}` | 200, `robots: noindex,nofollow` | 개인 오더 링크. 색인 제외가 의도대로 적용됨 |

---

## 1. 문제 / 근거 / 영향 / 우선순위 / 수정 결과

### P1-1. robots.txt 가 존재하지 않는 sitemap.xml 을 가리킴

- **근거**: `public/robots.txt` 에 `Sitemap: https://allsuricommerce.netlify.app/sitemap.xml` 이 있으나 해당 URL 은 404.
- **영향**: 검색엔진에 제출할 사이트맵이 없어, 신규/하위 페이지 발견이 내부 링크에만 의존합니다. 네이버 서치어드바이저 사이트맵 제출도 불가합니다.
- **우선순위**: 최상
- **수정 결과**: `app/sitemap.ts` 추가로 `/sitemap.xml` 을 빌드 시 생성. `public/robots.txt` 를 제거하고 `app/robots.ts` 로 대체해 사이트맵 주소와 규칙을 한 곳에서 관리.

### P1-2. canonical 이 전혀 없음

- **근거**: `/`, `/requests`, `/requests/ai`, `/my-order`, `/business`, `/community` 원본 HTML 에 `<link rel="canonical">` 없음. `app/layout.tsx` 에 `metadataBase` 미설정.
- **영향**: 쿼리 파라미터(`/requests?category=누수`, `/requests?mode=manual`)와 슬래시 유무 차이로 같은 내용이 여러 URL 로 인식될 수 있습니다.
- **우선순위**: 최상
- **수정 결과**: `metadataBase` 설정 + 전 공개 페이지에 고유 canonical 지정.

### P1-3. 홈에 실제 이용 후기처럼 보이는 가짜 후기가 공개됨

- **근거**: `app/page.tsx` 에 `const reviews = [...]` 하드코딩. 화면에는 "고객 후기 / **실제 이용하신 분들의 이야기**" 제목과 `★★★★★`, `김○○ 서울 강남구` 같은 작성자·지역이 함께 노출.
- **영향**: 사실과 다른 후기이며, 검색엔진과 이용자 모두에게 허위 정보입니다. 신뢰도·법적 리스크 문제입니다.
- **우선순위**: 최상
- **수정 결과**: 해당 섹션 전체 삭제. 별점·작성자·후기 문구를 모두 제거하고, 검증된 데이터가 쌓이기 전까지 후기 섹션을 두지 않음.

### P1-4. 근거 없는 수치 주장

- **근거**: 홈과 메타 설명에 `전문 업체 800곳 이상`, `800+ 등록 전문 업체`, `800명 이상의 전문 업체`, `평균 응답시간 2시간 이내`, `2시간 평균 응답 시간`.
  운영 관리자 API(`GET api.allsuri.app/api/admin/dashboard`) 실측값은 **사업자 777명, 승인 551명**, 완료 견적 0건·완료 견적 금액 0원으로 "800곳 이상"과 "평균 2시간"을 뒷받침하지 못합니다.
- **영향**: 과장 표현입니다. 응답 시간 수치는 산출 근거가 없습니다.
- **우선순위**: 최상
- **수정 결과**: 800 관련 문구 전부 제거. 사업자 수는 `/business` 가 이미 DB 에서 실제 집계(`{total}곳`)하므로 그 값만 사용. 응답 시간 수치는 삭제하고 비용·절차 등 사실만 남김.

### P2-1. Open Graph 태그가 모든 페이지에서 동일

- **근거**: 6개 페이지 모두 `og:title=올수리 - 집수리 전문 견적 서비스`, `og:description=무료로 여러 업체의 견적을 비교하세요`, `og:url=https://allsuricommerce.netlify.app`. `app/layout.tsx` 의 값이 그대로 상속됨.
- **영향**: 어떤 페이지를 공유해도 홈으로 보이고, `og:url` 이 실제 URL 과 불일치합니다. `og:image` 는 아예 없습니다.
- **우선순위**: 높음
- **수정 결과**: 레이아웃에 기본값 + `og:image`(`/app-icon.png`) 설정, 공개 페이지마다 고유 `og:title`/`og:description`/`og:url` 지정.

### P2-2. 검색 의도를 받아줄 안내 콘텐츠가 없음

- **근거**: 공개 페이지는 홈 / 견적 폼 / AI 폼 / 사업자 목록 / 후기(준비중) 뿐입니다. "누수 설비", "누수 탐지" 같은 정보 탐색형 검색어에 대응하는 설명 콘텐츠가 전무합니다.
- **영향**: 검색 이용자가 알고 싶은 내용(증상 구분, 탐지와 보수의 차이, 견적에 필요한 정보)이 사이트에 없어 색인될 본문 자체가 부족합니다.
- **우선순위**: 높음
- **수정 결과**: `/services/leak`, `/services/plumbing`, `/services/bathroom`, `/services/waterproofing` 4개 안내 페이지 신설. 가격 금액은 적지 않고 "가격이 달라지는 조건"만 설명.

### P2-3. 비공개·준비중 페이지가 색인 대상으로 열려 있음

- **근거**:
  - `/my-order` 는 전화번호+비밀번호로 고객 본인 견적을 조회하는 화면인데 `noindex` 가 없습니다. H1 도 없습니다.
  - `/community` 는 본문이 "곧 서비스될 예정입니다" 인 빈 페이지인데, 메타 설명은 "올수리 전문 업체의 **실제 시공 후기와 사진을 확인하세요**" 로 실제와 다릅니다.
- **영향**: 내용 없는 페이지와 개인 조회용 화면이 색인되어 사이트 품질 평가에 불리합니다. `/community` 설명은 허위입니다.
- **우선순위**: 높음
- **수정 결과**: 두 페이지에 `robots: noindex, follow` 적용, 사이트맵에서 제외. `/community` 설명을 준비중 사실에 맞게 수정하고 `/my-order` 에 H1 추가.

### P3-1. 사업자 프로필의 색인 범위가 불명확

- **근거**: `/business/[id]` 는 DB 의 실제 프로필·리뷰를 보여주지만, 프로필이 비어 있는 사업자도 같은 틀로 생성됩니다. 공개 노출 동의 여부를 코드에서 확인할 수 없습니다.
- **영향**: 내용이 거의 없는 유사 페이지가 대량 색인될 수 있습니다.
- **우선순위**: 중간
- **수정 결과**: 사이트맵에 일괄 추가하지 않았습니다(개별 프로필 URL 미포함). 동의와 프로필 충실도 기준이 정해지면 그때 선별 포함하도록 남겨 둡니다. → **운영자 확인 필요 항목**

### P3-2. 구조화 데이터 없음

- **근거**: JSON-LD 가 어떤 페이지에도 없습니다.
- **영향**: 사이트/서비스의 성격을 기계가 읽을 수 있는 형태로 제공하지 못합니다. (단, 구조화 데이터가 네이버 검색 결과의 특별한 표시를 보장하지는 않습니다.)
- **우선순위**: 중간
- **수정 결과**: 홈에 `WebSite` + `Organization`, 안내 페이지에 `Service` + `BreadcrumbList` 적용. 실제 후기·평점 데이터가 없으므로 `Review`/`AggregateRating`/FAQ 마크업은 적용하지 않았습니다.

### P3-3. 이미지 용량

- **근거**: `public/app-icon.png` 가 1.0MB 이며 헤더·푸터·홈 히어로에서 로고로 사용됩니다.
- **영향**: 모바일에서 불필요한 전송량이 발생합니다.
- **우선순위**: 중간(이번 작업 범위에서 재인코딩하지 않음)
- **수정 결과**: 미수정. `next/image` 를 통해 리사이즈되어 치명적이지는 않으나, 로고용 경량 PNG/SVG 교체를 권장합니다. → **남은 작업**

---

## 2. 네이버 수집·색인 상태

- `app/layout.tsx` 에 `naver-site-verification` 메타값이 **이미 존재**합니다
  (`3d6603043a98df369e669973ff157eeaffa91877`). 따라서 서치어드바이저에 사이트가 등록된 적이 있습니다.
  이 값은 기존 코드의 값을 그대로 유지했고, 임의로 만들지 않았습니다.
- 서치어드바이저 **계정 접근 권한이 없어** 수집·색인 상태, 수집 오류, 노출/클릭 리포트를 직접 확인하지 못했습니다.
- 검색 결과 화면만으로는 색인 여부를 단정할 수 없으므로, 색인 상태 확인은
  `docs/naver-searchadvisor-checklist.md` 의 절차로 운영자가 직접 수행해야 합니다.

### 아직 확인하지 못한 항목

1. 서치어드바이저의 홈·안내 페이지 **URL 검사** 결과(수집 가능 여부, 색인 상태, 오류 메시지)
2. 사이트맵 제출 결과와 처리된 URL 수
3. 실제 노출/클릭 리포트
4. `site:allsuricommerce.netlify.app`, `올수리`, `올수리 누수`, `누수 설비` 검색 시 현재 노출 상태
   (자동 조회가 차단되어 사람이 직접 확인해야 합니다)
5. 사업자 프로필 공개 노출 동의 여부
6. 별도 소유 도메인(예: `allsuri.app` 계열) 을 소비자 웹의 대표 도메인으로 쓸 계획이 있는지

---

## 3. 배포 후 검증 결과 (2026-10-02, 커밋 `ae3b20e`)

### 응답 코드와 Content-Type

| URL | HTTP | Content-Type |
| --- | --- | --- |
| `/` | 200 | text/html |
| `/services` | 200 | text/html |
| `/services/leak` | 200 | text/html |
| `/services/plumbing` | 200 | text/html |
| `/services/bathroom` | 200 | text/html |
| `/services/waterproofing` | 200 | text/html |
| `/requests` | 200 | text/html |
| `/requests/ai` | 200 | text/html |
| `/business` | 200 | text/html |
| `/my-order` | 200 | text/html (noindex) |
| `/community` | 200 | text/html (noindex) |
| `/robots.txt` | 200 | **text/plain** |
| `/sitemap.xml` | 200 | **application/xml** |
| `/no-such-page-abc123` | **404** | text/html |
| `/admin` | 307 → `/admin/login` | — |

- 응답 헤더에 `X-Robots-Tag` 없음(확인 완료). 색인 제어는 페이지 메타태그만으로 이뤄집니다.
- 존재하지 않는 URL 이 200 으로 홈을 돌려주는 문제는 없습니다.

### 사이트맵

`/sitemap.xml` 의 9개 URL 을 모두 요청해 **전부 200** 을 확인했습니다.
비공개·준비중·프로필 URL 은 포함되지 않았습니다.

### 페이지별 메타

공개 9개 페이지 모두 `title` 이 서로 다르고, `canonical` 과 `og:url` 이 자기 URL 과 일치합니다.
`/my-order` 와 `/community` 는 `robots: noindex, follow` 가 적용됐습니다.

### 신규 안내 페이지 본문 규모

| URL | H1 | H2 | 본문 글자수 |
| --- | --- | --- | --- |
| `/services/leak` | 1 | 9 | 2,961 |
| `/services/plumbing` | 1 | 9 | 2,442 |
| `/services/bathroom` | 1 | 9 | 2,462 |
| `/services/waterproofing` | 1 | 9 | 2,416 |

모두 자바스크립트 실행 전 원본 HTML 에 포함되어 있습니다(SSG 로 사전 생성).

### 허위·과장 콘텐츠 제거 확인

홈 원본 HTML 에서 `고객 후기`, `실제 이용하신`, `김○○`, `평균 응답`, `2시간` 문구가 모두
사라졌습니다. 남아 있는 `800` 문자열 8건은 전부 Tailwind 색상 클래스(`text-gray-800` 등)이며
주장 문구가 아닙니다.

### 기존 기능 유지 확인

- `/requests` 견적 요청 폼 정상, `?category=누수` 쿼리 반영 정상
- `/requests/ai` AI 인터뷰 화면 정상
- `/my-order` 조회 화면 정상 (서버 HTML 에 H1 추가됨)
- `/business` 사업자 목록 정상
- `/api/ai/status`, `/api/web-content`, `/api/featured-businesses` 모두 200
- `/admin` 로그인 리다이렉트 유지
- 390x844 모바일 뷰포트에서 `/services/leak` 레이아웃 정상 렌더링 확인

### 아직 하지 않은 것

- `public/app-icon.png` (1.0MB) 경량화
- `public/` 의 미사용 Next/Vercel 템플릿 SVG(`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) 정리
- 서치어드바이저 콘솔 작업 전부 (계정 권한 없음) → `docs/naver-searchadvisor-checklist.md`
