import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import AdminSidebar from './AdminSidebar'
import { getAdminUser } from '@/lib/supabase-server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers()
  const pathname = hdrs.get('x-pathname') || ''

  // 로그인 페이지는 사이드바 없이 그대로 렌더링
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  const user = await getAdminUser()
  if (!user) redirect('/admin/login')
  // 로그인만으로는 부족합니다. 관리자 계정이 아니면 들어올 수 없습니다(로그인 화면의 확인은 브라우저 쪽이라 우회 가능).
  if (!(user.is_admin || user.role === 'admin')) redirect('/admin/login?error=forbidden')

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <AdminSidebar userName={user.name || user.email || '관리자'} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
