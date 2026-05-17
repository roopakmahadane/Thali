import { createClient } from '@/lib/supabase/server'
import { analyzeMealText } from '@/lib/claude/text-analyze'
import { MEAL_SLOTS } from '@/lib/config/meals'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { description?: string; meal_slot?: string; dish_hint?: string }
  const { description, meal_slot: mealSlot, dish_hint: dishHint } = body

  if (!description?.trim() || !mealSlot) {
    return NextResponse.json({ error: 'Missing description or meal_slot' }, { status: 400 })
  }

  // Last 20 meals for context — same logic as analyze route
  const { data: recentMeals } = await supabase
    .from('meals')
    .select('meal_type, meal_items(item_name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const seen = new Set<string>()
  const parts: string[] = []
  for (const m of recentMeals ?? []) {
    if (seen.has(m.meal_type)) continue
    seen.add(m.meal_type)
    const names = (m.meal_items as { item_name: string }[]).map((i) => i.item_name).join(', ')
    if (names) parts.push(`${m.meal_type.replace('_', ' ')} — ${names}`)
  }
  const recentMealsContext = parts.length ? 'Recent meals: ' + parts.join('; ') : ''

  const slot = MEAL_SLOTS.find((s) => s.key === mealSlot)
  const slotLabel = slot?.label ?? mealSlot

  try {
    const result = await analyzeMealText(description.trim(), slotLabel, recentMealsContext, dishHint)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[text-analyze] error:', err instanceof Error ? err.stack : err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
