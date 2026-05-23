import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const IST_MS = (5 * 60 + 30) * 60 * 1000

function getBoundaryForIST(dateStr: string): { start: string; end: string } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const istMidnightUTC = new Date(Date.UTC(y, m - 1, d) - IST_MS)
  const start = new Date(istMidnightUTC.getTime() + 4 * 3600 * 1000)
  const end   = new Date(start.getTime() + 24 * 3600 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function getTodayBoundaryUTC(): { start: string; end: string } {
  const now = new Date()
  const nowIST = new Date(now.getTime() + IST_MS)
  let year = nowIST.getUTCFullYear()
  let month = nowIST.getUTCMonth() + 1
  let day = nowIST.getUTCDate()
  if (nowIST.getUTCHours() < 4) {
    const prev = new Date(Date.UTC(year, month - 1, day - 1))
    year = prev.getUTCFullYear()
    month = prev.getUTCMonth() + 1
    day = prev.getUTCDate()
  }
  return getBoundaryForIST(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
}

export async function GET(req: NextRequest) {
  console.log('[today-api] handler called, url:', req.url)
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slot = req.nextUrl.searchParams.get('slot')
  if (!slot) return NextResponse.json({ error: 'Missing slot' }, { status: 400 })

  const dateParam = req.nextUrl.searchParams.get('date')
  const { start, end } = dateParam ? getBoundaryForIST(dateParam) : getTodayBoundaryUTC()
  console.log('[today-api] boundary:', start, 'to', end)

  const { data: meals } = await supabase
    .from('meals')
    .select('id, meal_type, eaten_at, ai_notes, total_calories, total_protein_g, total_carbs_g, total_fat_g')
    .eq('user_id', user.id)
    .eq('meal_type', slot)
    .gte('eaten_at', start)
    .lt('eaten_at', end)
    .order('eaten_at', { ascending: true })
  console.log('[today-api] meals found:', meals?.length ?? 0)

  const todayMeals = meals ?? []

  if (todayMeals.length === 0) {
    return NextResponse.json({ meal: null, items: [] })
  }

  const mealIds = todayMeals.map((m) => m.id)
  const { data: allItems } = await supabase
    .from('meal_items')
    .select('id, meal_id, item_name, quantity, unit, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, source')
    .in('meal_id', mealIds)

  type ItemRow = {
    id: string; meal_id: string; item_name: string; quantity: number; unit: string
    calories: number; protein_g: number; carbs_g: number; fat_g: number
    fiber_g: number; sodium_mg: number; source: string
  }

  const merged = {
    id:              todayMeals[0].id,
    meal_type:       todayMeals[0].meal_type,
    eaten_at:        todayMeals[0].eaten_at,
    ai_notes:        todayMeals[0].ai_notes as string | null,
    total_calories:  0,
    total_protein_g: 0,
    total_carbs_g:   0,
    total_fat_g:     0,
  }
  const mergedItems: ItemRow[] = []

  for (const m of todayMeals) {
    merged.total_calories  += m.total_calories  ?? 0
    merged.total_protein_g += Number(m.total_protein_g ?? 0)
    merged.total_carbs_g   += Number(m.total_carbs_g   ?? 0)
    merged.total_fat_g     += Number(m.total_fat_g      ?? 0)
    if (m.eaten_at > merged.eaten_at) { merged.id = m.id; merged.eaten_at = m.eaten_at }
    const mItems = (allItems ?? []).filter((i) => (i as unknown as ItemRow).meal_id === m.id)
    mergedItems.push(...(mItems as unknown as ItemRow[]))
  }

  return NextResponse.json({ meal: merged, items: mergedItems })
}
