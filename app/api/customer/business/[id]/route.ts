import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: bizId } = await params
  if (!bizId || bizId === 'undefined') {
    return NextResponse.json({ error: '사업자 ID가 필요합니다.' }, { status: 400 })
  }

  // 사업자 기본 정보. users 에는 category/region/description/profile_image_url 컬럼이 없어
  // 예전 쿼리는 항상 실패(→ 404)했습니다. 실제 컬럼을 읽어 화면이 쓰는 이름으로 맞춥니다.
  const { data: row } = await supabaseAdmin
    .from('users')
    .select('id, name, businessname, phonenumber, specialties, serviceareas, avatar_url, profile_image, projects_awarded_count')
    .eq('id', bizId)
    .eq('role', 'business')
    .maybeSingle()

  if (!row) return NextResponse.json({ error: '사업자를 찾을 수 없습니다.' }, { status: 404 })

  const joinList = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : '')
  const biz = {
    id: row.id,
    name: row.name,
    businessname: row.businessname,
    phonenumber: row.phonenumber,
    category: joinList(row.specialties),
    region: joinList(row.serviceareas),
    description: null,
    profile_image_url: row.avatar_url || row.profile_image || null,
    projects_awarded_count: row.projects_awarded_count,
  }

  // 리뷰 (없어도 진행)
  let reviewList: { id: string; rating: number | null; comment: string | null; is_admin_review: boolean | null; created_at: string }[] = []
  try {
    const { data: reviews } = await supabaseAdmin
      .from('business_reviews')
      .select('id, rating, comment, is_admin_review, created_at')
      .eq('business_id', bizId)
      .order('created_at', { ascending: false })
      .limit(20)
    reviewList = reviews || []
  } catch { /* business_reviews 테이블 없거나 접근 불가 → 빈 배열 */ }

  const avgRating = reviewList.length
    ? Math.round((reviewList.reduce((s, r) => s + (r.rating || 0), 0) / reviewList.length) * 10) / 10
    : null

  return NextResponse.json({ business: biz, reviews: reviewList, avgRating })
}
