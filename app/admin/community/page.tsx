import { createSupabaseServerClient } from '@/lib/supabase-server'
import CommunityClient from './CommunityClient'

export const revalidate = 0

export default async function AdminCommunityPage() {
  const supabase = await createSupabaseServerClient()
  const { data: posts } = await supabase
    .from('community_posts')
    .select('id, title, content, authorid, tags, upvotes, commentscount, createdat')
    .order('createdat', { ascending: false })
    .limit(100)

  // community_posts 에는 작성자 이름 컬럼이 없습니다(예전 author_name 요청 때문에 목록이 비었음). users 에서 붙입니다.
  const authorIds = [...new Set((posts || []).map((p) => p.authorid).filter(Boolean))]
  const { data: authors } = authorIds.length
    ? await supabase.from('users').select('id, name, businessname').in('id', authorIds)
    : { data: [] as { id: string; name: string | null; businessname: string | null }[] }
  const nameById = new Map((authors || []).map((u) => [u.id, u.businessname || u.name || null]))
  const data = (posts || []).map((p) => ({ ...p, author_name: nameById.get(p.authorid) ?? null }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">커뮤니티 관리</h1>
        <span className="text-sm text-gray-400">총 {(data || []).length}개 게시글</span>
      </div>
      <CommunityClient initialPosts={(data || []) as Parameters<typeof CommunityClient>[0]['initialPosts']} />
    </div>
  )
}
