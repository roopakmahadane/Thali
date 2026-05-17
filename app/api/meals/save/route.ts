import { createClient } from '@/lib/supabase/server'
import { updateUserPatterns } from '@/lib/claude/patterns'
import { NextRequest, NextResponse } from 'next/server'

const IST_MS = (5 * 60 + 30) * 60 * 1000

function todayISTDateStr(): string {
  const nowIST = new Date(Date.now() + IST_MS)
  let y = nowIST.getUTCFullYear()
  let mo = nowIST.getUTCMonth()
  let d = nowIST.getUTCDate()
  if (nowIST.getUTCHours() < 4) {
    const prev = new Date(Date.UTC(y, mo, d - 1))
    y = prev.getUTCFullYear()
    mo = prev.getUTCMonth()
    d = prev.getUTCDate()
  }
  return `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayBoundaryUTC(): { start: string; end: string } {
  const nowIST = new Date(Date.now() + IST_MS)
  let y = nowIST.getUTCFullYear()
  let mo = nowIST.getUTCMonth()
  let d = nowIST.getUTCDate()
  if (nowIST.getUTCHours() < 4) {
    const prev = new Date(Date.UTC(y, mo, d - 1))
    y = prev.getUTCFullYear()
    mo = prev.getUTCMonth()
    d = prev.getUTCDate()
  }
  const start = new Date(Date.UTC(y, mo, d) - IST_MS + 4 * 3600 * 1000)
  return { start: start.toISOString(), end: new Date(start.getTime() + 24 * 3600 * 1000).toISOString() }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { meal_slot, eaten_at, items, ai_notes } = body as {
    meal_slot: string
    eaten_at: string
    items: Array<{
      item_name: string
      quantity: number
      unit: string
      calories: number
      protein_g: number
      carbs_g: number
      fat_g: number
      fiber_g: number
      sodium_mg: number
      source: 'ai' | 'manual'
    }>
    ai_notes: string | null
  }

  // Totals for the NEW items only (used for daily_summaries increment)
  const newTotals = items.reduce(
    (acc, item) => ({
      calories:  acc.calories  + (item.calories  ?? 0),
      protein_g: acc.protein_g + (item.protein_g ?? 0),
      carbs_g:   acc.carbs_g  + (item.carbs_g   ?? 0),
      fat_g:     acc.fat_g    + (item.fat_g      ?? 0),
      fiber_g:   acc.fiber_g  + (item.fiber_g    ?? 0),
      sodium_mg: acc.sodium_mg + (item.sodium_mg  ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0 }
  )

  // Check for an existing meal for this slot today — at most one per slot per day
  const { start: dayStart, end: dayEnd } = todayBoundaryUTC()
  const { data: slotMeals } = await supabase
    .from('meals')
    .select('id, ai_notes')
    .eq('user_id', user.id)
    .eq('meal_type', meal_slot)
    .gte('eaten_at', dayStart)
    .lt('eaten_at', dayEnd)
    .limit(1)
  const existingMeal = slotMeals?.[0] ?? null

  let mealId: string

  if (existingMeal) {
    // ── Append to existing meal ────────────────────────────────────────────
    mealId = existingMeal.id

    // Insert new items
    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('meal_items').insert(
        items.map((item) => ({
          meal_id:   mealId,
          item_name: item.item_name,
          quantity:  item.quantity,
          unit:      item.unit,
          calories:  Math.round(item.calories),
          protein_g: item.protein_g,
          carbs_g:   item.carbs_g,
          fat_g:     item.fat_g,
          fiber_g:   item.fiber_g,
          sodium_mg: item.sodium_mg,
          source:    item.source,
        }))
      )
      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 500 })
      }
    }

    // Recompute meal totals from ALL items (existing + new)
    const { data: allItems } = await supabase
      .from('meal_items')
      .select('calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg')
      .eq('meal_id', mealId)

    const allTotals = (allItems ?? []).reduce(
      (acc, item) => ({
        calories:  acc.calories  + (item.calories  ?? 0),
        protein_g: acc.protein_g + Number(item.protein_g ?? 0),
        carbs_g:   acc.carbs_g  + Number(item.carbs_g   ?? 0),
        fat_g:     acc.fat_g    + Number(item.fat_g      ?? 0),
        fiber_g:   acc.fiber_g  + Number(item.fiber_g    ?? 0),
        sodium_mg: acc.sodium_mg + Number(item.sodium_mg  ?? 0),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0 }
    )

    await supabase
      .from('meals')
      .update({
        total_calories:  Math.round(allTotals.calories),
        total_protein_g: allTotals.protein_g,
        total_carbs_g:   allTotals.carbs_g,
        total_fat_g:     allTotals.fat_g,
        total_fiber_g:   allTotals.fiber_g,
        total_sodium_mg: allTotals.sodium_mg,
        // Keep existing ai_notes; only set if currently null
        ai_notes: existingMeal.ai_notes ?? ai_notes ?? null,
      })
      .eq('id', mealId)
  } else {
    // ── Create new meal ────────────────────────────────────────────────────
    const { data: meal, error: mealError } = await supabase
      .from('meals')
      .insert({
        user_id:         user.id,
        photo_url:       null,
        meal_type:       meal_slot,
        eaten_at,
        total_calories:  Math.round(newTotals.calories),
        total_protein_g: newTotals.protein_g,
        total_carbs_g:   newTotals.carbs_g,
        total_fat_g:     newTotals.fat_g,
        total_fiber_g:   newTotals.fiber_g,
        total_sodium_mg: newTotals.sodium_mg,
        ai_notes:        ai_notes ?? null,
      })
      .select('id')
      .single()

    if (mealError || !meal) {
      return NextResponse.json({ error: mealError?.message ?? 'Failed to save meal' }, { status: 500 })
    }

    mealId = meal.id

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('meal_items').insert(
        items.map((item) => ({
          meal_id:   mealId,
          item_name: item.item_name,
          quantity:  item.quantity,
          unit:      item.unit,
          calories:  Math.round(item.calories),
          protein_g: item.protein_g,
          carbs_g:   item.carbs_g,
          fat_g:     item.fat_g,
          fiber_g:   item.fiber_g,
          sodium_mg: item.sodium_mg,
          source:    item.source,
        }))
      )
      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 500 })
      }
    }
  }

  // Upsert frequent_foods for each saved item
  for (const item of items) {
    if (item.quantity === 0) continue
    const macrosPerUnit = {
      calories_per_unit:  item.calories  / item.quantity,
      protein_g_per_unit: item.protein_g / item.quantity,
      carbs_g_per_unit:   item.carbs_g   / item.quantity,
      fat_g_per_unit:     item.fat_g     / item.quantity,
      fiber_g_per_unit:   item.fiber_g   / item.quantity,
      sodium_mg_per_unit: item.sodium_mg / item.quantity,
    }

    const { data: existing } = await supabase
      .from('frequent_foods')
      .select('id, times_logged')
      .eq('user_id', user.id)
      .ilike('name', item.item_name)
      .maybeSingle()

    if (existing) {
      await supabase.from('frequent_foods').update({
        times_logged:        existing.times_logged + 1,
        last_logged_at:      new Date().toISOString(),
        typical_quantity:    item.quantity,
        typical_unit:        item.unit,
        macros_per_unit_json: macrosPerUnit,
      }).eq('id', existing.id)
    } else {
      await supabase.from('frequent_foods').insert({
        user_id:              user.id,
        name:                 item.item_name,
        typical_quantity:     item.quantity,
        typical_unit:         item.unit,
        macros_per_unit_json: macrosPerUnit,
        times_logged:         1,
        last_logged_at:       new Date().toISOString(),
        confirmed:            false,
      })
    }
  }

  // Update daily_summaries — read current then upsert with incremented values
  const today = todayISTDateStr()

  const { data: existing } = await supabase
    .from('daily_summaries')
    .select('calories_consumed, protein_g, carbs_g, fat_g, calories_target')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  // Fallback calories_target from profile if row doesn't exist yet
  let caloriesTarget = existing?.calories_target ?? null
  if (caloriesTarget === null) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('daily_calories')
      .eq('user_id', user.id)
      .single()
    caloriesTarget = profile?.daily_calories ?? 2000
  }

  await supabase.from('daily_summaries').upsert(
    {
      user_id:           user.id,
      date:              today,
      calories_consumed: (existing?.calories_consumed ?? 0) + Math.round(newTotals.calories),
      protein_g:         (existing?.protein_g ?? 0) + newTotals.protein_g,
      carbs_g:           (existing?.carbs_g ?? 0) + newTotals.carbs_g,
      fat_g:             (existing?.fat_g ?? 0) + newTotals.fat_g,
      calories_target:   caloriesTarget,
    },
    { onConflict: 'user_id,date' }
  )

  // Fire-and-forget pattern update — does not block save response
  void (async () => {
    try {
      const { count } = await supabase
        .from('meals')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      if (!count || count % 5 !== 0) return

      const [{ data: last20 }, { data: existingPatterns }] = await Promise.all([
        supabase
          .from('meals')
          .select('meal_type, eaten_at, meal_items(item_name, quantity, unit)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('user_patterns')
          .select('pattern_text, category, confidence')
          .eq('user_id', user.id),
      ])

      const newPatterns = await updateUserPatterns(
        user.id,
        (last20 ?? []).map((m) => ({
          meal_type: m.meal_type,
          eaten_at:  m.eaten_at ?? new Date().toISOString(),
          items:     (m.meal_items as { item_name: string; quantity: number; unit: string }[]),
        })),
        (existingPatterns ?? []).map((p) => ({
          pattern_text: p.pattern_text,
          category:     p.category ?? '',
          confidence:   p.confidence ?? '',
        }))
      )

      for (const p of newPatterns) {
        const { data: existing } = await supabase
          .from('user_patterns')
          .select('id')
          .eq('user_id', user.id)
          .eq('pattern_text', p.pattern_text)
          .maybeSingle()

        if (existing) {
          await supabase.from('user_patterns').update({
            confidence: p.confidence,
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id)
        } else {
          await supabase.from('user_patterns').insert({
            user_id:      user.id,
            pattern_text: p.pattern_text,
            category:     p.category,
            confidence:   p.confidence,
          })
        }
      }
    } catch (e) {
      console.error('Pattern update failed silently:', e)
    }
  })()

  return NextResponse.json({ meal_id: mealId })
}
