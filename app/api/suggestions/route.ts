import { createClient } from '@/lib/supabase/server'
import { getMealSuggestions } from '@/lib/claude/suggestions'
import { MEAL_SLOTS } from '@/lib/config/meals'
import { NextResponse } from 'next/server'

const IST_MS = (5 * 60 + 30) * 60 * 1000

function todayISTDateStr(): string {
  const nowIST = new Date(Date.now() + IST_MS)
  let y = nowIST.getUTCFullYear()
  let mo = nowIST.getUTCMonth()
  let d = nowIST.getUTCDate()
  if (nowIST.getUTCHours() < 4) {
    const prev = new Date(Date.UTC(y, mo, d - 1))
    y = prev.getUTCFullYear(); mo = prev.getUTCMonth(); d = prev.getUTCDate()
  }
  return `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function getCurrentMealSlot(): string {
  const istHour = new Date(Date.now() + IST_MS).getUTCHours()
  return MEAL_SLOTS.reduce((best, slot) =>
    Math.abs(slot.defaultHour - istHour) < Math.abs(best.defaultHour - istHour) ? slot : best
  ).key
}

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = todayISTDateStr()

  const [{ data: profile }, { data: summary }, { data: recentMealsRaw }, { data: patternsRaw }] = await Promise.all([
    supabase
      .from('profiles')
      .select('diet_type, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('daily_summaries')
      .select('calories_consumed, protein_g, carbs_g, fat_g')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle(),
    supabase
      .from('meals')
      .select('meal_type, meal_items(item_name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('user_patterns')
      .select('pattern_text')
      .eq('user_id', user.id),
  ])

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const remaining = {
    calories:  Math.max(0, profile.daily_calories  - (summary?.calories_consumed ?? 0)),
    protein_g: Math.max(0, profile.daily_protein_g - (summary?.protein_g        ?? 0)),
    carbs_g:   Math.max(0, profile.daily_carbs_g   - (summary?.carbs_g          ?? 0)),
    fat_g:     Math.max(0, profile.daily_fat_g     - (summary?.fat_g            ?? 0)),
  }

  // Recent meals context — one entry per slot, most recent wins
  const seen = new Set<string>()
  const contextParts: string[] = []
  for (const m of recentMealsRaw ?? []) {
    if (seen.has(m.meal_type)) continue
    seen.add(m.meal_type)
    const names = (m.meal_items as { item_name: string }[]).map((i) => i.item_name).join(', ')
    if (names) contextParts.push(`${m.meal_type.replace('_', ' ')} — ${names}`)
  }
  const recentMealsContext = contextParts.length ? 'Recent meals: ' + contextParts.join('; ') : ''

  const patternsStr = (patternsRaw ?? []).map((p) => p.pattern_text).join('; ')
  const mealSlot    = getCurrentMealSlot()
  const timeOfDay   = new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  }).format(new Date())

  const suggestions = await getMealSuggestions(
    remaining,
    mealSlot,
    timeOfDay,
    recentMealsContext,
    patternsStr,
    profile.diet_type ?? 'non-veg',
  )

  return NextResponse.json({ suggestions })
}
