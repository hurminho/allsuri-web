import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ── 서버 전용 클라이언트 (RLS bypass, API routes 전용) ────────────
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── 세션 기반 서버 클라이언트 (Server Components / admin 페이지용) ─
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server Component에서는 쿠키 쓰기 불가 (read-only)
        }
      },
    },
  })
}

// ── 현재 로그인한 관리자 정보 반환 ───────────────────────────────
export async function getAdminUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('id, name, email, role, is_admin')
    .eq('id', user.id)
    .maybeSingle()

  return {
    id: user.id,
    email: user.email ?? '',
    name: profile?.name ?? '',
    role: profile?.role ?? '',
    is_admin: profile?.is_admin ?? false,
  }
}

export function normalizePhone(p: string) {
  return p.replace(/[^0-9]/g, '')
}

export type BusinessUserProfile = {
  id: string
  name: string | null
  businessname: string | null
  category: string | null
  region: string | null
  address: string | null
  bio: string | null
  avatar_url: string | null
  businessnumber: string | null
  jobs_accepted_count: number | null
  serviceareas: string[] | null
  specialties: string[] | null
}

function normalizeBusinessUserRow(row: Record<string, unknown>): BusinessUserProfile {
  return {
    id: String(row.id),
    name: (row.name as string | null | undefined) ?? null,
    businessname: (row.businessname ?? row.business_name ?? row.businessName) as string | null ?? null,
    category: (row.category as string | null | undefined) ?? null,
    region: (row.region as string | null | undefined) ?? null,
    address: (row.address as string | null | undefined) ?? null,
    bio: ((row.bio ?? row.description) as string | null | undefined) ?? null,
    avatar_url: ((row.avatar_url ?? row.profile_image_url) as string | null | undefined) ?? null,
    businessnumber: ((row.businessnumber ?? row.business_number ?? row.businessNumber) as string | null | undefined) ?? null,
    jobs_accepted_count: ((row.jobs_accepted_count ?? row.projects_awarded_count) as number | null | undefined) ?? null,
    serviceareas: (row.serviceareas as string[] | null | undefined) ?? null,
    specialties: (row.specialties as string[] | null | undefined) ?? null,
  }
}

/** users 테이블 컬럼 불일치 시에도 사업자 프로필을 조회 (존재하는 컬럼만 순차 시도) */
export async function fetchBusinessUsersByIds(ids: string[]): Promise<Record<string, BusinessUserProfile>> {
  if (ids.length === 0) return {}

  const selects = [
    'id, name, businessname, avatar_url, address, serviceareas, specialties, jobs_accepted_count, category, bio, region, description, profile_image_url',
    'id, name, businessname, phonenumber, category, region, description, profile_image_url, projects_awarded_count',
    'id, name, businessname, category, region',
    'id, name, businessname',
  ]

  for (const select of selects) {
    const { data, error } = await supabaseAdmin.from('users').select(select).in('id', ids)
    if (error) {
      console.warn('[fetchBusinessUsersByIds] query failed:', select, error.message)
      continue
    }
    const map: Record<string, BusinessUserProfile> = {}
    for (const row of data || []) {
      const profile = normalizeBusinessUserRow(row as unknown as Record<string, unknown>)
      map[profile.id] = profile
    }
    return map
  }

  return {}
}

/** business_reviews 컬럼명(business_id / businessid) 차이를 흡수 */
export async function fetchBusinessRatingsByIds(
  ids: string[],
): Promise<Record<string, { avg: number | null; count: number }>> {
  const ratingMap: Record<string, { avg: number | null; count: number }> = {}
  ids.forEach((id) => { ratingMap[id] = { avg: null, count: 0 } })
  if (ids.length === 0) return ratingMap

  for (const businessIdColumn of ['business_id', 'businessid'] as const) {
    const { data, error } = await supabaseAdmin
      .from('business_reviews')
      .select(`${businessIdColumn}, rating`)
      .in(businessIdColumn, ids)
    if (error) {
      console.warn('[fetchBusinessRatingsByIds] query failed:', businessIdColumn, error.message)
      continue
    }

    const buckets: Record<string, number[]> = {}
    for (const row of data || []) {
      const bizId = (row as Record<string, unknown>)[businessIdColumn] as string | undefined
      const rating = (row as Record<string, unknown>).rating
      if (!bizId || typeof rating !== 'number') continue
      if (!buckets[bizId]) buckets[bizId] = []
      buckets[bizId].push(rating)
    }

    ids.forEach((id) => {
      const arr = buckets[id] || []
      ratingMap[id] = arr.length === 0
        ? { avg: null, count: 0 }
        : { avg: Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10, count: arr.length }
    })
    return ratingMap
  }

  return ratingMap
}

export function pickRowField<T>(row: Record<string, unknown>, ...keys: string[]): T | null {
  for (const key of keys) {
    const value = row[key]
    if (value != null && value !== '') return value as T
  }
  return null
}
