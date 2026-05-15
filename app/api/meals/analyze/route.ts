import { createClient } from '@/lib/supabase/server'
import { analyzeMealPhoto } from '@/lib/vision'
import { MEAL_SLOTS } from '@/lib/config/meals'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const photo = formData.get('photo') as File | null
  const mealSlot = formData.get('meal_slot') as string | null
  const dishHint = (formData.get('dish_hint') as string | null) ?? undefined

  if (!photo || !mealSlot) {
    return NextResponse.json({ error: 'Missing photo or meal_slot' }, { status: 400 })
  }

  const buffer = Buffer.from(await photo.arrayBuffer())
  const base64 = buffer.toString('base64')

  // Last 20 meals for context
  const { data: recentMeals } = await supabase
    .from('meals')
    .select('meal_type, meal_items(item_name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  // One entry per slot — most recent instance wins (results are DESC ordered)
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

  const result = await analyzeMealPhoto(base64, photo.type, slotLabel, recentMealsContext, dishHint)

  return NextResponse.json(result)
}
