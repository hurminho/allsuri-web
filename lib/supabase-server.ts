import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolvePersonName } from '@/lib/business-profile'

export { resolvePersonName }

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
  representative_name: string | null
  category: string | null
  region: string | null
  address: string | null
  bio: string | null
  avatar_url: string | null
  businessnumber: string | null
  jobs_accepted_count: number | null
  serviceareas: string[] | null
  specialties: string[] | null
  /** 낙찰 가능 여부 (fn_business_can_act 와 같은 기준: 승인 + 사업자번호 또는 관리자 우회) */
  canAct: boolean
}

// users 실제 컬럼만 요청합니다. 예전에는 없는 컬럼(category·region·bio·description·
// profile_image_url·representative_name)을 넣은 select 를 차례로 시도해 매번 쿼리가 실패했습니다.
const BUSINESS_USER_COLS =
  'id, name, role, businessname, business_repname, avatar_url, profile_image, address, serviceareas, specialties, ' +
  'jobs_accepted_count, businessnumber, businessnumber_norm, businessstatus, business_verify_bypass'

type BusinessUserRow = {
  id: string
  name: string | null
  role: string | null
  businessname: string | null
  business_repname: string | null
  avatar_url: string | null
  profile_image: string | null
  address: string | null
  serviceareas: string[] | null
  specialties: string[] | null
  jobs_accepted_count: number | null
  businessnumber: string | null
  businessnumber_norm: string | null
  businessstatus: string | null
  business_verify_bypass: boolean | null
}

function joinList(v: string[] | null | undefined): string | null {
  const s = Array.isArray(v) ? v.filter(Boolean).join(', ') : ''
  return s || null
}

export function businessCanActFromRow(row: Pick<BusinessUserRow, 'role' | 'businessstatus' | 'businessnumber' | 'businessnumber_norm' | 'business_verify_bypass'>): boolean {
  if (row.role !== 'business' || String(row.businessstatus || '') !== 'approved') return false
  if (row.business_verify_bypass === true || row.businessnumber_norm) return true
  return String(row.businessnumber || '').replace(/[^0-9]/g, '').length === 10
}

function toBusinessUserProfile(row: BusinessUserRow): BusinessUserProfile {
  return {
    id: String(row.id),
    name: row.name ?? null,
    businessname: row.businessname ?? null,
    representative_name: row.business_repname ?? null,
    category: joinList(row.specialties),
    region: joinList(row.serviceareas),
    address: row.address ?? null,
    bio: null,
    avatar_url: row.avatar_url || row.profile_image || null,
    businessnumber: row.businessnumber ?? null,
    jobs_accepted_count: row.jobs_accepted_count ?? null,
    serviceareas: row.serviceareas ?? null,
    specialties: row.specialties ?? null,
    canAct: businessCanActFromRow(row),
  }
}

export async function fetchBusinessUsersByIds(ids: string[]): Promise<Record<string, BusinessUserProfile>> {
  if (ids.length === 0) return {}
  const { data, error } = await supabaseAdmin.from('users').select(BUSINESS_USER_COLS).in('id', ids)
  if (error) {
    console.warn('[fetchBusinessUsersByIds] query failed:', error.message)
    return {}
  }
  const map: Record<string, BusinessUserProfile> = {}
  for (const row of (data || []) as unknown as BusinessUserRow[]) {
    const profile = toBusinessUserProfile(row)
    map[profile.id] = profile
  }
  return map
}

/** 사업자별 평점 (business_reviews 뷰 = order_reviews) */
export async function fetchBusinessRatingsByIds(
  ids: string[],
): Promise<Record<string, { avg: number | null; count: number }>> {
  const ratingMap: Record<string, { avg: number | null; count: number }> = {}
  ids.forEach((id) => { ratingMap[id] = { avg: null, count: 0 } })
  if (ids.length === 0) return ratingMap

  const { data, error } = await supabaseAdmin
    .from('business_reviews')
    .select('business_id, rating')
    .in('business_id', ids)
  if (error) {
    console.warn('[fetchBusinessRatingsByIds] query failed:', error.message)
    return ratingMap
  }
  const buckets: Record<string, number[]> = {}
  for (const row of (data || []) as { business_id: string; rating: number | null }[]) {
    if (!row.business_id || typeof row.rating !== 'number') continue
    ;(buckets[row.business_id] ||= []).push(row.rating)
  }
  for (const id of ids) {
    const arr = buckets[id] || []
    if (arr.length === 0) continue
    ratingMap[id] = {
      avg: Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10,
      count: arr.length,
    }
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
