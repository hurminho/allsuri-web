import { supabaseAdmin } from '@/lib/supabase-server'

/**
 * 공개 사업자 정보 (서버 전용, service role).
 *
 * users 테이블에는 연락처·푸시 토큰·카카오 ID 같은 민감 정보가 함께 있어서,
 * 브라우저(anon key)가 직접 읽지 않고 서버가 아래 공개 컬럼만 골라 내려줍니다.
 * users 에는 category/region/bio/description/profile_image_url 컬럼이 없습니다
 * (예전 코드가 이 컬럼을 요청해 쿼리가 통째로 실패했음). 화면이 쓰는 이름은 실제 컬럼에서 만듭니다.
 */
const PUBLIC_BUSINESS_COLS =
  'id, name, businessname, avatar_url, profile_image, address, serviceareas, specialties, createdat, estimates_created_count, jobs_accepted_count'

type BusinessRow = {
  id: string
  name: string | null
  businessname: string | null
  avatar_url: string | null
  profile_image: string | null
  address: string | null
  serviceareas: string[] | null
  specialties: string[] | null
  createdat: string | null
  estimates_created_count: number | null
  jobs_accepted_count: number | null
}

export type PublicBusiness = BusinessRow & {
  category: string
  region: string
  bio: string | null
  description: string | null
}

export type RatingSummary = { avg: number; count: number }

export type FeaturedBusiness = {
  id: string
  userId: string
  businessName: string
  phonenumber: string
  category: string
  region: string
  avatarUrl: string | null
  jobsCount: number
  avgRating: number | null
  reviewCount: number
}

function joinList(v: string[] | null | undefined): string {
  return Array.isArray(v) ? v.filter(Boolean).join(', ') : ''
}

function toPublicBusiness(row: BusinessRow): PublicBusiness {
  return {
    ...row,
    avatar_url: row.avatar_url || row.profile_image || null,
    category: joinList(row.specialties),
    region: joinList(row.serviceareas),
    bio: null,
    description: null,
  }
}

/** 공개 목록에서 빼는 내부 계정 */
function approvedBusinesses() {
  return supabaseAdmin
    .from('users')
    .select(PUBLIC_BUSINESS_COLS, { count: 'exact' })
    .eq('role', 'business')
    .eq('businessstatus', 'approved')
    .neq('name', '개발자')
    .not('businessname', 'eq', '개발자')
}

export async function getRatings(businessIds: string[]): Promise<Record<string, RatingSummary>> {
  if (businessIds.length === 0) return {}
  const { data } = await supabaseAdmin
    .from('business_reviews')
    .select('business_id, rating')
    .in('business_id', businessIds)
  const acc: Record<string, { sum: number; count: number }> = {}
  for (const r of (data || []) as { business_id: string; rating: number }[]) {
    if (!acc[r.business_id]) acc[r.business_id] = { sum: 0, count: 0 }
    acc[r.business_id].sum += r.rating
    acc[r.business_id].count += 1
  }
  const out: Record<string, RatingSummary> = {}
  for (const [id, v] of Object.entries(acc)) out[id] = { avg: v.sum / v.count, count: v.count }
  return out
}

export async function countPublicBusinesses(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'business')
    .eq('businessstatus', 'approved')
    .neq('name', '개발자')
    .not('businessname', 'eq', '개발자')
  return count ?? 0
}

export async function listPublicBusinesses(page: number, pageSize: number) {
  const from = Math.max(0, page) * pageSize
  const { data, count, error } = await approvedBusinesses()
    .order('jobs_accepted_count', { ascending: false, nullsFirst: false })
    .range(from, from + pageSize - 1)
  if (error || !data) return { items: [], total: 0 }
  const rows = (data as BusinessRow[]).map(toPublicBusiness)
  const ratings = await getRatings(rows.map((b) => b.id))
  const items = rows.map((b) => ({
    ...b,
    avgRating: ratings[b.id]?.avg ?? 0,
    reviewCount: ratings[b.id]?.count ?? 0,
  }))
  return { items, total: count ?? 0 }
}

export async function getPublicBusiness(id: string): Promise<PublicBusiness | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(PUBLIC_BUSINESS_COLS)
    .eq('id', id)
    .eq('role', 'business')
    .maybeSingle()
  if (error || !data) return null
  return toPublicBusiness(data as BusinessRow)
}

/** 홈·견적 요청 페이지의 추천 업체(⭐ 광고) */
export async function getFeaturedBusinesses(): Promise<FeaturedBusiness[]> {
  try {
    const { data: featData } = await supabaseAdmin
      .from('web_featured_businesses')
      .select('id, user_id')
      .order('sort_order', { ascending: true })
    const featList = (featData || []) as { id: string; user_id: string }[]
    const ids = featList.map((f) => f.user_id).filter(Boolean)
    if (ids.length === 0) return []

    const [{ data: usersData }, ratings] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, name, businessname, phonenumber, avatar_url, profile_image, serviceareas, specialties, jobs_accepted_count')
        .in('id', ids),
      getRatings(ids),
    ])
    type Row = {
      id: string
      name: string | null
      businessname: string | null
      phonenumber: string | null
      avatar_url: string | null
      profile_image: string | null
      serviceareas: string[] | null
      specialties: string[] | null
      jobs_accepted_count: number | null
    }
    const usersMap = new Map(((usersData || []) as Row[]).map((u) => [u.id, u]))

    return featList
      .map((f) => {
        const u = usersMap.get(f.user_id)
        if (!u) return null
        const r = ratings[f.user_id]
        return {
          id: f.id,
          userId: f.user_id,
          businessName: u.businessname || u.name || '',
          phonenumber: u.phonenumber || '',
          category: joinList(u.specialties),
          region: joinList(u.serviceareas),
          avatarUrl: u.avatar_url || u.profile_image || null,
          jobsCount: u.jobs_accepted_count || 0,
          avgRating: r ? Math.round(r.avg * 10) / 10 : null,
          reviewCount: r?.count || 0,
        }
      })
      .filter((x): x is FeaturedBusiness => x !== null)
  } catch (e) {
    console.warn('[getFeaturedBusinesses] 로드 실패:', e)
    return []
  }
}
