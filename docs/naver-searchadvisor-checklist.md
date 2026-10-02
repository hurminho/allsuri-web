# 네이버 서치어드바이저 운영 체크리스트

대상 사이트: `https://allsuricommerce.netlify.app`
작성일: 2026-10-02

> 서치어드바이저에 사이트를 등록하고 사이트맵을 제출하는 것은 **네이버가 사이트를 수집할 수 있게
> 하는 절차**입니다. 등록 자체가 검색 노출이나 순위 상승을 뜻하지는 않습니다. 수집과 색인 여부,
> 노출 여부는 네이버가 판단하며 시간이 걸립니다.

이 문서의 작업은 **코드로 대신할 수 없고 계정에 로그인한 운영자가 직접** 해야 합니다.
(작업자에게 서치어드바이저 계정 접근 권한이 없어 아래 항목은 수행하지 못했습니다.)

접속 주소: https://searchadvisor.naver.com/

---

## 0. 미리 알아둘 값

| 항목 | 값 |
| --- | --- |
| 사이트 URL | `https://allsuricommerce.netlify.app` |
| robots.txt | `https://allsuricommerce.netlify.app/robots.txt` |
| 사이트맵 | `https://allsuricommerce.netlify.app/sitemap.xml` |
| 소유확인 메타태그 | `app/layout.tsx` 의 `naver-site-verification` = `3d6603043a98df369e669973ff157eeaffa91877` |

**소유확인 값에 대하여**: 위 값은 기존 코드에 이미 들어 있던 값이며, 임의로 만들어 넣은 것이
아닙니다. 서치어드바이저에서 발급한 값과 **다를 경우** 소유확인이 실패합니다. 그때는
운영자가 콘솔에서 발급받은 값을 알려 주셔야 코드를 교체할 수 있습니다.
(소유확인 토큰은 추측해서 만들 수 없습니다.)

---

## 1. 사이트 등록

1. 서치어드바이저 로그인 → **웹마스터 도구** 진입
2. 사이트 목록에 `https://allsuricommerce.netlify.app` 가 이미 있는지 확인
   - **있으면** 3번으로 건너뜁니다.
   - **없으면** 입력창에 `https://allsuricommerce.netlify.app` 를 넣고 등록합니다.
3. `https://` 와 `http://`, `www.` 유무 중 **지금 운영 중인 형태 하나만** 등록합니다.
   현재 대표 주소는 `https://allsuricommerce.netlify.app` 입니다.

## 2. 사이트 소유확인

1. 등록 과정에서 **HTML 태그** 방식을 선택합니다.
2. 화면에 표시된 `<meta name="naver-site-verification" content="..." />` 의 content 값을 확인합니다.
3. 그 값이 위 표의 값과 **같으면** 그대로 `소유확인` 버튼을 누르면 됩니다.
4. **다르면** 해당 값을 개발자에게 전달해 주세요. `app/layout.tsx` 의
   `other['naver-site-verification']` 을 교체하고 재배포한 뒤 다시 확인해야 합니다.
5. HTML 파일 업로드 방식을 쓰고 싶다면, 내려받은 파일을 `public/` 에 두면
   `https://allsuricommerce.netlify.app/<파일명>` 으로 제공됩니다. 이 역시 재배포가 필요합니다.

## 3. robots.txt 확인

1. **검증 → robots.txt** 메뉴로 이동
2. `robots.txt 수집` 또는 `가져오기` 를 눌러 최신 내용을 불러옵니다.
3. 내용이 아래와 같은지 확인합니다.
   ```
   User-Agent: *
   Allow: /
   Disallow: /admin
   Disallow: /admin/
   Disallow: /api/

   User-Agent: Mediapartners-Google
   Allow: /

   Host: https://allsuricommerce.netlify.app
   Sitemap: https://allsuricommerce.netlify.app/sitemap.xml
   ```
4. 같은 화면의 테스트 입력란에 아래 URL 을 넣어 **허용(Allowed)** 으로 나오는지 확인합니다.
   - `https://allsuricommerce.netlify.app/`
   - `https://allsuricommerce.netlify.app/services/leak`
   - `https://allsuricommerce.netlify.app/requests`
5. 아래는 **차단(Disallowed)** 으로 나와야 정상입니다.
   - `https://allsuricommerce.netlify.app/admin`

## 4. 사이트맵 제출

1. **요청 → 사이트맵 제출** 메뉴로 이동
2. 입력란에 `sitemap.xml` 을 넣고 확인을 누릅니다.
3. 제출 후 상태가 `성공` 으로 바뀌고, 처리된 URL 수가 **9개**로 표시되는지 확인합니다.
   (홈, `/services`, `/services/leak`, `/services/plumbing`, `/services/bathroom`,
   `/services/waterproofing`, `/requests`, `/requests/ai`, `/business`)
4. 오류가 나면 메시지를 그대로 기록해 개발자에게 전달해 주세요.
5. 안내 페이지를 추가·삭제하면 사이트맵이 빌드 때 자동으로 갱신됩니다. 재제출은 필요 없지만,
   큰 변경 뒤에는 한 번 더 제출해 두는 편이 확실합니다.

## 5. URL 검사 (가장 중요)

**검증 → URL 검사** 에서 아래 URL 을 하나씩 넣고 결과를 기록해 주세요.

| 확인할 URL | 기록할 내용 |
| --- | --- |
| `https://allsuricommerce.netlify.app/` | 수집 가능 여부 / 색인 상태 / 오류 메시지 |
| `https://allsuricommerce.netlify.app/services/leak` | 수집 가능 여부 / 색인 상태 / 오류 메시지 |
| `https://allsuricommerce.netlify.app/services/plumbing` | 같음 |
| `https://allsuricommerce.netlify.app/services/bathroom` | 같음 |
| `https://allsuricommerce.netlify.app/services/waterproofing` | 같음 |
| `https://allsuricommerce.netlify.app/requests` | 같음 |

확인 포인트:

- **웹페이지 수집**: `가능` 으로 나와야 합니다. `불가` 면 사유를 기록해 주세요.
- **robots.txt 차단 여부**: 차단으로 나오면 안 됩니다.
- **마지막 수집 일시**: 비어 있으면 아직 수집되지 않은 상태입니다.
- 검사 결과 화면에 `색인 제외` 사유가 뜨면 그 문구를 그대로 적어 주세요.

> 검색 결과 화면에서 안 보이는 것만으로 "색인되지 않았다" 고 단정하지 마세요.
> 색인 여부는 이 URL 검사 결과로 판단해야 합니다.

## 6. 수집 요청

1. **요청 → 웹페이지 수집** 메뉴로 이동
2. 아래 URL 을 하나씩 넣어 수집을 요청합니다. (하루 요청 수에 제한이 있습니다)
   - `https://allsuricommerce.netlify.app/`
   - `https://allsuricommerce.netlify.app/services`
   - `https://allsuricommerce.netlify.app/services/leak`
   - `https://allsuricommerce.netlify.app/services/plumbing`
   - `https://allsuricommerce.netlify.app/services/bathroom`
   - `https://allsuricommerce.netlify.app/services/waterproofing`
3. 수집 요청은 "빨리 봐 달라" 는 요청일 뿐이고, 수집·색인을 보장하지 않습니다.

## 7. 수집 오류 점검

1. **진단 → 수집 오류** 에서 오류 목록이 있는지 확인
2. 오류가 있으면 URL 과 오류 유형을 기록해 주세요.
3. **진단 → 사이트 최적화** 에서 지적 사항이 있으면 함께 기록해 주세요.

## 8. 색인 현황과 리포트 (등록 후 수 주간)

| 메뉴 | 볼 것 | 주기 |
| --- | --- | --- |
| 진단 → 사이트 최적화 | 미충족 항목 | 수정 직후 1회 |
| 요청 → 사이트맵 제출 | 처리된 URL 수 | 제출 후 1회, 이후 월 1회 |
| 검증 → URL 검사 | 홈·누수 페이지 색인 상태 | 1주 뒤, 1개월 뒤 |
| 리포트 → 사이트 현황 | 수집된 페이지 수 추이 | 주 1회 |
| 리포트 → 검색 노출/클릭 현황 | 어떤 검색어로 노출·클릭됐는지 | 주 1회 |

### 주의

- 검색 노출 리포트에 데이터가 쌓이기까지 보통 며칠에서 몇 주가 걸립니다.
- "누수 설비" 같은 경쟁 검색어에서 바로 보이기를 기대하기 어렵습니다. 먼저
  `site:allsuricommerce.netlify.app` 결과와 `올수리` 같은 고유 브랜드명 검색부터
  확인하는 편이 현실적입니다.
- 노출 리포트의 검색어를 보면 사람들이 실제로 어떤 표현을 쓰는지 알 수 있습니다.
  그 표현이 안내 페이지에 없다면, 내용을 보완할 근거로 쓰시면 됩니다.

---

## 9. 운영자 결정이 필요한 항목

아래는 개발 쪽에서 판단할 수 없어 보류한 것들입니다.

1. **사업자 프로필 페이지(`/business/{id}`) 색인 여부**
   현재 사이트맵에 넣지 않았습니다. 넣으려면
   (가) 사업자에게 공개 노출 동의를 받았는지,
   (나) 프로필에 고유한 내용이 충분한지
   두 가지가 먼저 정리돼야 합니다. 빈 프로필이 대량 색인되면 사이트 품질에 불리합니다.

2. **별도 도메인 연결 여부**
   지금 대표 주소는 Netlify 기본 도메인입니다. `allsuri.app` 계열 도메인을 소비자 웹에
   연결할 계획이 있다면, 연결 시점에 `NEXT_PUBLIC_SITE_URL` 환경변수만 바꾸면
   canonical·사이트맵·OG 가 모두 따라갑니다. 그 뒤 서치어드바이저에 새 도메인을 등록하고
   기존 주소에서 301 리다이렉트를 설정해야 합니다. **연결 전에는 코드에 넣지 않았습니다.**

3. **시공 후기(`/community`) 공개 시점**
   현재 "준비 중" 이라 `noindex` 로 두고 사이트맵에서 제외했습니다. 실제 후기가 공개되면
   `app/community/page.tsx` 와 `app/community/[id]/page.tsx` 의 `robots` 설정을 풀고
   사이트맵에 추가해야 합니다.

4. **응답 시간·업체 수 같은 수치 표기**
   근거를 확인할 수 없어 홈에서 제거했습니다. 집계 기준을 정하고 실제 데이터로 계산할 수
   있게 되면 그때 다시 표기하면 됩니다.
