import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const CATEGORIES = [
  '누수',
  '화장실',
  '배관',
  '방수',
  '주방',
  '리모델링',
  '기타',
] as const

export type Category = (typeof CATEGORIES)[number]

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value)
}

export const CATEGORY_ICONS: Record<Category, string> = {
  '누수': '💧',
  '화장실': '🚿',
  '배관': '🔩',
  '방수': '💧',
  '주방': '🍳',
  '리모델링': '🏠',
  '기타': '🛠️',
}

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
