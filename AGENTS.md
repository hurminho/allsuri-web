<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 올수리 웹 (allsuri-web)

올수리 공개 웹과 관리자(`/admin`)입니다. Flutter 앱 저장소 `allsuriapp`과 같은 Supabase를 씁니다.

- 스택: Next.js 16 App Router, Supabase(`@supabase/ssr`), Tailwind CSS 4, Netlify(`@netlify/plugin-nextjs`)
- 배포: `main`에 push하면 Netlify가 운영(https://allsuricommerce.netlify.app)에 바로 배포합니다. 대표 주소는 `NEXT_PUBLIC_SITE_URL`(`lib/site.ts`)을 따릅니다.
- DB 스키마: 이 저장소에 없습니다. `allsuriapp/database/*.sql`에서 관리합니다(웹 전용은 `web_*.sql`).
- 앱 API: 서버 코드는 `ALLSURIAPP_API_URL`(기본 `https://api.allsuri.app`)의 Netlify Functions를 호출합니다. 함수 코드는 `allsuriapp/netlify/functions`에 있습니다.
- 비밀값: 공개 저장소입니다. 키는 `.env.local`(gitignore)과 Netlify 환경변수에만 둡니다. 서버 전용 키에 `NEXT_PUBLIC_`을 붙이지 않습니다.

## 확인 명령

```bash
npx tsc --noEmit
npm run lint
npx next build
npm run dev -- -p 3002
```
