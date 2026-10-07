// 서버 전용 모듈입니다(라우트·서버 컴포넌트에서만 import). DB 보안 정책(RLS)과 무관하게 동작하도록
// service role 로 읽고, 공개해도 되는 컬럼만 고릅니다.
import { supabaseAdmin as supabase } from '@/lib/supabase-server'

// 개인 오더 링크로 들어온 요청은 링크 주인 사업자에게만 배정됩니다.
// 배정 대상은 항상 slug 로 서버에서 다시 조회하며, 클라이언트 입력을 신뢰하지 않습니다.
//
// 조회는 공개 정보만 다루므로 anon 키(RLS 적용)를 씁니다.
// service_role 키는 쓰기(orders insert)에서만 사용합니다.

export type PersonalOrderLink = {
  id: string
  contractor_id: string
  slug: string
  status: 'active' | 'paused' | 'revoked' | 'suspended'
  accepts_direct_orders: boolean
  display_name: string | null
  headline: string | null
  introduction: string | null
  supported_categories: string[] | null
  service_regions: string[] | null
  profile_image_url: string | null
  cover_image_url: string | null
  verification_status: string | null
}

/** 공개 페이지에 내보내도 되는 컬럼만 조회합니다(사업자 연락처 등 개인정보 제외). */
const PUBLIC_COLUMNS =
  'id, contractor_id, slug, status, accepts_direct_orders, display_name, headline, introduction, supported_categories, service_regions, profile_image_url, cover_image_url, verification_status'

/**
 * slug 로 개인 오더 링크를 찾습니다.
 * 일시중지(paused) 링크도 "접수 중단" 안내를 보여줘야 하므로 함께 반환하고,
 * 폐기(revoked)·정지(suspended) 링크는 존재하지 않는 것으로 취급합니다.
 */
export async function findPersonalOrderLinkBySlug(
  rawSlug: string,
): Promise<PersonalOrderLink | null> {
  const slug = decodeURIComponent(String(rawSlug ?? '')).trim()
  if (!slug || slug.length > 120) return null

  const { data, error } = await supabase
    .from('personal_order_links')
    .select(PUBLIC_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.warn('[personal-link] 링크 조회 실패:', error.message)
    return null
  }
  if (!data) return null

  const link = data as unknown as PersonalOrderLink
  if (link.status === 'revoked' || link.status === 'suspended') return null
  return link
}

/** 새 요청을 받을 수 있는 상태인지 판단합니다. */
export function acceptsNewOrders(link: PersonalOrderLink): boolean {
  return link.status === 'active' && link.accepts_direct_orders
}

export type ContractorPublicProfile = {
  id: string
  displayName: string
  specialties: string[]
  serviceAreas: string[]
  bio: string | null
  avatarUrl: string | null
  completedJobs: number | null
}

/**
 * 공개 페이지에 노출할 사업자 정보만 추립니다.
 * 전화번호·주소 등 연락처는 조회하지 않습니다(고객에게 노출 금지).
 */
export async function getContractorPublicProfile(
  contractorId: string,
): Promise<ContractorPublicProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, businessname, avatar_url, profile_image, specialties, serviceareas, jobs_accepted_count')
    .eq('id', contractorId)
    .maybeSingle()

  if (error || !data) return null

  const row = data as Record<string, unknown>
  const businessName = String(row.businessname ?? '').trim()
  const name = String(row.name ?? '').trim()

  return {
    id: String(row.id),
    displayName: businessName || name || '사업자',
    specialties: Array.isArray(row.specialties) ? (row.specialties as string[]) : [],
    serviceAreas: Array.isArray(row.serviceareas) ? (row.serviceareas as string[]) : [],
    bio: null,
    avatarUrl: (row.avatar_url as string | null) || (row.profile_image as string | null) || null,
    completedJobs:
      typeof row.jobs_accepted_count === 'number' ? row.jobs_accepted_count : null,
  }
}

type TrackEventInput = {
  linkId: string
  eventType:
    | 'page_view'
    | 'quote_start'
    | 'category_selected'
    | 'photo_added'
    | 'quote_submitted'
  anonymousSessionId?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  referrerDomain?: string | null
}

/** 분석용 이벤트를 남깁니다. 개인정보는 저장하지 않으며, 실패해도 흐름을 막지 않습니다. */
export async function trackLinkEvent(input: TrackEventInput): Promise<void> {
  try {
    await supabase.from('personal_order_link_events').insert({
      personal_order_link_id: input.linkId,
      event_type: input.eventType,
      anonymous_session_id: input.anonymousSessionId || null,
      utm_source: input.utmSource || null,
      utm_medium: input.utmMedium || null,
      utm_campaign: input.utmCampaign || null,
      referrer_domain: input.referrerDomain || null,
    })
  } catch (e: unknown) {
    console.warn('[personal-link] 이벤트 기록 실패:', e instanceof Error ? e.message : String(e))
  }
}
