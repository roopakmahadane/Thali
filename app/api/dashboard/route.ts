import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const IST_MS = (5 * 60 + 30) * 60 * 1000

function getTodayBoundaryUTC(): { start: string; end: string } {
  const now = new Date()
  const nowIST = new Date(now.getTime() + IST_MS)
  let year = nowIST.getUTCFullYear()
  let month = nowIST.getUTCMonth()
  let day = nowIST.getUTCDate()
  if (nowIST.getUTCHours() < 4) {
    const prev = new Date(Date.UTC(year, month, day - 1))
    year = prev.getUTCFullYear()
    month = prev.getUTCMonth()
    day = prev.getUTCDate()
  }
  const istMidnightUTC = new Date(Date.UTC(year, month, day) - IST_MS)
  const start = new Date(istMidnightUTC.getTime() + 4 * 3600 * 1000)
  const end = new Date(start.getTime() + 24 * 3600 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { start, end } = getTodayBoundaryUTC()

  const [{ data: profile }, { data: meals }] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, daily_fiber_g')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('meals')
      .select('id, meal_type, eaten_at, total_calories, total_protein_g, total_carbs_g, total_fat_g, ai_notes')
      .eq('user_id', user.id)
      .gte('eaten_at', start)
      .lt('eaten_at', end)
      .order('eaten_at', { ascending: true }),
  ])

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const todayMeals = meals ?? []

  // Fetch meal_items separately to avoid PostgREST embedded-select row duplication
  const mealIds = todayMeals.map((m) => m.id)
  const { data: allItems } = mealIds.length > 0
    ? await supabase
        .from('meal_items')
        .select('meal_id, item_name, quantity, unit')
        .in('meal_id', mealIds)
    : { data: [] }

  const itemsByMealId: Record<string, { item_name: string; quantity: number; unit: string }[]> = {}
  for (const item of allItems ?? []) {
    const mid = (item as { meal_id: string; item_name: string; quantity: number; unit: string }).meal_id
    if (!itemsByMealId[mid]) itemsByMealId[mid] = []
    itemsByMealId[mid].push(item as { item_name: string; quantity: number; unit: string })
  }

  // Merge all rows for the same meal_type into one entry — guards against stale duplicate rows
  type MergedMeal = {
    id: string; meal_type: string; eaten_at: string; ai_notes: string | null
    total_calories: number; total_protein_g: number; total_carbs_g: number; total_fat_g: number
    items: { item_name: string; quantity: number; unit: string }[]
  }
  const mergedByType: Record<string, MergedMeal> = {}

  for (const m of todayMeals) {
    const mItems = itemsByMealId[m.id] ?? []
    const entry = mergedByType[m.meal_type]
    if (!entry) {
      mergedByType[m.meal_type] = {
        id:              m.id,
        meal_type:       m.meal_type,
        eaten_at:        m.eaten_at,
        ai_notes:        m.ai_notes,
        total_calories:  m.total_calories  ?? 0,
        total_protein_g: Number(m.total_protein_g ?? 0),
        total_carbs_g:   Number(m.total_carbs_g   ?? 0),
        total_fat_g:     Number(m.total_fat_g      ?? 0),
        items:           mItems,
      }
    } else {
      entry.total_calories  += m.total_calories  ?? 0
      entry.total_protein_g += Number(m.total_protein_g ?? 0)
      entry.total_carbs_g   += Number(m.total_carbs_g   ?? 0)
      entry.total_fat_g     += Number(m.total_fat_g      ?? 0)
      entry.items.push(...mItems)
      // Keep latest id/eaten_at so the card links to the most recent save
      if (m.eaten_at > entry.eaten_at) { entry.id = m.id; entry.eaten_at = m.eaten_at }
    }
  }

  const mergedMeals = Object.values(mergedByType)

  // Totals computed from merged meals — prevents double-counting duplicate slot rows
  const today = {
    calories_consumed: mergedMeals.reduce((s, m) => s + m.total_calories,  0),
    protein_g:         mergedMeals.reduce((s, m) => s + m.total_protein_g, 0),
    carbs_g:           mergedMeals.reduce((s, m) => s + m.total_carbs_g,   0),
    fat_g:             mergedMeals.reduce((s, m) => s + m.total_fat_g,     0),
  }

  // Sunday check-in logic (moved from page so the client component can receive it)
  const nowIST = new Date(Date.now() + IST_MS)
  const isSunday = nowIST.getUTCDay() === 0
  let show_checkin = false
  let week_key = ''

  if (isSunday) {
    week_key = getISOWeekKey(nowIST)
    const cookieStore = await cookies()
    const dismissed = cookieStore.get(`checkin_dismissed_${week_key}`)?.value
    if (!dismissed) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const { data: recentWeight } = await supabase
        .from('weight_logs')
        .select('id')
        .eq('user_id', user.id)
        .gte('logged_at', sevenDaysAgo)
        .limit(1)
        .maybeSingle()
      if (!recentWeight) show_checkin = true
    }
  }

  console.log('[dashboard] raw meal rows:', todayMeals.map((m) => ({ id: m.id, meal_type: m.meal_type, total_calories: m.total_calories })))
  console.log('[dashboard] mergedMeals:', mergedMeals.map((m) => ({ meal_type: m.meal_type, total_calories: m.total_calories, item_count: m.items.length })))

  return NextResponse.json({
    profile,
    today,
    show_checkin,
    week_key,
    meals: mergedMeals,
  })
}
