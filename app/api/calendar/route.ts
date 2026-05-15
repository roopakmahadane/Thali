import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const IST_MS = (5 * 60 + 30) * 60 * 1000

function getISTDateStr(utcTs: string): string {
  const ist = new Date(new Date(utcTs).getTime() + IST_MS)
  if (ist.getUTCHours() < 4) {
    const prev = new Date(ist.getTime() - 24 * 3600 * 1000)
    return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`
  }
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year  = parseInt(searchParams.get('year')  ?? '')
  const month = parseInt(searchParams.get('month') ?? '')

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 })
  }

  // 4 AM IST on 1st of month → 4 AM IST on 1st of next month
  const rangeStart = new Date(Date.UTC(year, month - 1, 1) - IST_MS + 4 * 3600 * 1000)
  const rangeEnd   = new Date(Date.UTC(year, month,     1) - IST_MS + 4 * 3600 * 1000)

  const daysInMonth = new Date(year, month, 0).getDate()
  const monthStart  = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd    = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  const [{ data: mealsRaw }, { data: summaries }] = await Promise.all([
    supabase
      .from('meals')
      .select('id, meal_type, eaten_at, total_calories, meal_items(item_name)')
      .eq('user_id', user.id)
      .gte('eaten_at', rangeStart.toISOString())
      .lt('eaten_at',  rangeEnd.toISOString()),
    supabase
      .from('daily_summaries')
      .select('date, calories_consumed, calories_target')
      .eq('user_id', user.id)
      .gte('date', monthStart)
      .lte('date', monthEnd),
  ])

  // Group meals by IST date
  const mealsByDate = new Map<string, Array<{ id: string; meal_type: string; total_calories: number; item_names: string[] }>>()
  for (const meal of mealsRaw ?? []) {
    if (!meal.eaten_at) continue
    const dateStr = getISTDateStr(meal.eaten_at)
    if (!mealsByDate.has(dateStr)) mealsByDate.set(dateStr, [])
    mealsByDate.get(dateStr)!.push({
      id:             meal.id,
      meal_type:      meal.meal_type,
      total_calories: meal.total_calories ?? 0,
      item_names:     (meal.meal_items as { item_name: string }[]).map((i) => i.item_name),
    })
  }

  const summaryByDate = new Map<string, { calories_consumed: number; calories_target: number }>()
  for (const s of summaries ?? []) {
    summaryByDate.set(s.date, {
      calories_consumed: s.calories_consumed,
      calories_target:   s.calories_target ?? 2000,
    })
  }

  const days = Array.from(mealsByDate.entries()).map(([date, meals]) => {
    const summary = summaryByDate.get(date)
    return {
      date,
      meals,
      calories_consumed: summary?.calories_consumed ?? meals.reduce((s, m) => s + m.total_calories, 0),
      calories_target:   summary?.calories_target ?? 2000,
    }
  })

  return NextResponse.json({ days })
}
