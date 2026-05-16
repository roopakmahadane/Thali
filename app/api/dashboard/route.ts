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
      .select('id, meal_type, eaten_at, total_calories, total_protein_g, total_carbs_g, total_fat_g, ai_notes, meal_items(item_name, quantity, unit)')
      .eq('user_id', user.id)
      .gte('eaten_at', start)
      .lt('eaten_at', end)
      .order('eaten_at', { ascending: true }),
  ])

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const todayMeals = meals ?? []

  const today = {
    calories_consumed: todayMeals.reduce((s, m) => s + (m.total_calories ?? 0), 0),
    protein_g:         todayMeals.reduce((s, m) => s + Number(m.total_protein_g ?? 0), 0),
    carbs_g:           todayMeals.reduce((s, m) => s + Number(m.total_carbs_g ?? 0), 0),
    fat_g:             todayMeals.reduce((s, m) => s + Number(m.total_fat_g ?? 0), 0),
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

  return NextResponse.json({
    profile,
    today,
    show_checkin,
    week_key,
    meals: todayMeals.map((m) => ({
      id:              m.id,
      meal_type:       m.meal_type,
      eaten_at:        m.eaten_at,
      total_calories:  m.total_calories,
      total_protein_g: m.total_protein_g,
      total_carbs_g:   m.total_carbs_g,
      total_fat_g:     m.total_fat_g,
      ai_notes:        m.ai_notes,
      items:           m.meal_items ?? [],
    })),
  })
}
