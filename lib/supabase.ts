import { createClient } from '@supabase/supabase-js'
import { TRADE_GROUPS, TRADE_GROUP_NAMES, groupOf } from '@/lib/trade-categories'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 공종 대분류. 목록은 lib/trade-categories.ts 한 곳에서 정합니다(앱과 같은 목록).
export const CATEGORIES: readonly string[] = TRADE_GROUP_NAMES

export type Category = string

export function isCategory(value: string): value is Category {
  return CATEGORIES.includes(value)
}

/** 예전 분류·세부 공종 값도 대분류로 맞춥니다(예: ?category=누수 → 누수·방수). */
export const normalizeCategory = groupOf

export const CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
  TRADE_GROUPS.map((g) => [g.name, g.icon]),
)

export type Order = {
  id?: string
  customerId?: string
  title: string
  description: string
  address: string
  visit_date: string
  status: string
  created_at?: string
  images?: string[]
  category: string
  customer_name: string
  customer_phone: string
  customer_email?: string
  is_anonymous?: boolean
  source?: string
  session_id?: string
}

export type CommunityPost = {
  id: string
  authorid: string
  author_name?: string
  author_profile_image_url?: string
  title: string
  content: string
  tags?: string[]
  upvotes?: number
  commentscount?: number
  createdat: string
}

export type Business = {
  id: string
  name: string
  business_name?: string
  bio?: string
  avatar_url?: string
  region?: string
  categories?: string[]
  rating?: number
  review_count?: number
}
