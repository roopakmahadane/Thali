import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function getTodayBoundaryUTC(): { start: string; end: string } {
  const IST_MS = (5 * 60 + 30) * 60 * 1000
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

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, daily_fiber_g')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const { start, end } = getTodayBoundaryUTC()

  const { data: meals } = await supabase
    .from('meals')
    .select('id, meal_type, eaten_at, total_calories, total_protein_g, total_carbs_g, total_fat_g, ai_notes, meal_items(item_name, quantity, unit)')
    .eq('user_id', user.id)
    .gte('eaten_at', start)
    .lt('eaten_at', end)
    .order('eaten_at', { ascending: true })

  const todayMeals = meals ?? []

  const today = {
    calories_consumed: todayMeals.reduce((s, m) => s + (m.total_calories ?? 0), 0),
    protein_g:         todayMeals.reduce((s, m) => s + (m.total_protein_g ?? 0), 0),
    carbs_g:           todayMeals.reduce((s, m) => s + (m.total_carbs_g ?? 0), 0),
    fat_g:             todayMeals.reduce((s, m) => s + (m.total_fat_g ?? 0), 0),
  }

  return NextResponse.json({
    profile,
    today,
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
