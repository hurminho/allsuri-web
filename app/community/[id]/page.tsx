import type { Metadata } from 'next'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/site'

export const revalidate = 60

type Props = { params: Promise<{ id: string }> }

async function getPost(id: string) {
  const { data, error } = await supabase
    .from('community_posts')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data
}

async function getComments(postId: string) {
  const { data } = await supabase
    .from('community_comments')
    .select('*')
    .eq('postid', postId)
    .order('createdat', { ascending: true })
  return data || []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const post = await getPost(id)
  return {
    title: post ? `${post.title} | 올수리 커뮤니티` : '게시글 | 올수리',
    // 커뮤니티가 아직 공개 준비 중이라 목록에서 접근할 수 없습니다. 공개 시 함께 켜야 합니다.
    robots: { index: false, follow: true },
  }
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

export default async function PostDetailPage({ params }: Props) {
  const { id } = await params
  const post = await getPost(id)
  if (!post) notFound()

  const comments = await getComments(id)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/community" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
          ← 커뮤니티 목록
        </Link>

        <article className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <div className="flex flex-wrap gap-2 mb-3">
            {post.tags?.map((tag: string) => (
              <span key={tag} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">#{tag}</span>
            ))}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{post.title}</h1>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
            <span>{post.author_name || '익명'}</span>
            <span>·</span>
            <span>{timeAgo(post.createdat)}</span>
            <span>·</span>
            <span>👍 {post.upvotes || 0}</span>
          </div>
          <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">{post.content}</div>
        </article>

        {/* Comments */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">댓글 {comments.length}개</h2>
          {comments.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">댓글이 없습니다</p>
          ) : (
            <div className="space-y-4">
              {comments.map((c: Record<string, unknown>) => (
                <div key={c.id as string} className="border-b border-gray-50 pb-4 last:border-0">
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <span className="font-medium text-gray-700">{(c.author_name as string) || '익명'}</span>
                    <span className="text-gray-400 text-xs">{timeAgo((c.createdat as string) || '')}</span>
                  </div>
                  <p className="text-sm text-gray-600">{c.content as string}</p>
                </div>
              ))}
            </div>
          )}

          {/* Comment prompt */}
          <div className="mt-4 bg-gray-50 rounded-xl p-4 text-sm text-gray-500 text-center">
            댓글 작성은 올수리 앱(<a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">App Store</a> · <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Play</a>)에서 가능합니다
          </div>
        </div>
      </div>
    </div>
  )
}
