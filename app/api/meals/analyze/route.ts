import { createClient } from '@/lib/supabase/server'
import { analyzeMealPhoto } from '@/lib/vision'
import { MEAL_SLOTS } from '@/lib/config/meals'
import { NextRequest, NextResponse } from 'next/server'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export async function POST(request: NextRequest) {
  console.log('[analyze] route hit')

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const photo = formData.get('photo') as File | null
  const mealSlot = formData.get('meal_slot') as string | null
  const dishHint = (formData.get('dish_hint') as string | null) ?? undefined

  console.log('[analyze] meal_slot:', mealSlot)
  console.log('[analyze] dish_hint:', dishHint ?? '(none)')
  console.log('[analyze] photo mime type:', photo?.type ?? '(no photo)')

  if (!photo || !mealSlot) {
    return NextResponse.json({ error: 'Missing photo or meal_slot' }, { status: 400 })
  }

  const buffer = Buffer.from(await photo.arrayBuffer())
  const base64 = buffer.toString('base64')

  console.log('[analyze] base64 image size (chars):', base64.length)

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

  console.log('[analyze] recentMealsContext:', recentMealsContext || '(empty)')

  const slot = MEAL_SLOTS.find((s) => s.key === mealSlot)
  const slotLabel = slot?.label ?? mealSlot

  try {
    const result = await analyzeMealPhoto(base64, photo.type, slotLabel, recentMealsContext, dishHint)
    console.log('[analyze] success, items count:', result.items?.length ?? 0)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[analyze] error:', err instanceof Error ? err.stack : err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
