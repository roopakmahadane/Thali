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

async function recomputeDailySummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dateStr: string,
) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const rangeStart = new Date(Date.UTC(y, mo - 1, d) - IST_MS + 4 * 3600 * 1000)
  const rangeEnd   = new Date(rangeStart.getTime() + 24 * 3600 * 1000)

  const { data: meals } = await supabase
    .from('meals')
    .select('total_calories, total_protein_g, total_carbs_g, total_fat_g')
    .eq('user_id', userId)
    .gte('eaten_at', rangeStart.toISOString())
    .lt('eaten_at',  rangeEnd.toISOString())

  const totals = (meals ?? []).reduce(
    (acc, m) => ({
      calories:  acc.calories  + (m.total_calories  ?? 0),
      protein_g: acc.protein_g + (Number(m.total_protein_g) ?? 0),
      carbs_g:   acc.carbs_g  + (Number(m.total_carbs_g)   ?? 0),
      fat_g:     acc.fat_g    + (Number(m.total_fat_g)     ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  )

  const { data: profile } = await supabase
    .from('profiles')
    .select('daily_calories')
    .eq('user_id', userId)
    .single()

  await supabase.from('daily_summaries').upsert(
    {
      user_id:           userId,
      date:              dateStr,
      calories_consumed: Math.round(totals.calories),
      protein_g:         totals.protein_g,
      carbs_g:           totals.carbs_g,
      fat_g:             totals.fat_g,
      calories_target:   profile?.daily_calories ?? 2000,
    },
    { onConflict: 'user_id,date' },
  )
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const [{ data: meal }, { data: items }] = await Promise.all([
    supabase
      .from('meals')
      .select('id, meal_type, eaten_at, total_calories, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g, total_sodium_mg, ai_notes')
      .eq('id', id)
      .single(),
    supabase
      .from('meal_items')
      .select('id, item_name, quantity, unit, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, source')
      .eq('meal_id', id),
  ])

  if (!meal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ meal, items: items ?? [] })
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

type PutItem = {
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
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch old eaten_at for date recompute
  const { data: existing } = await supabase
    .from('meals')
    .select('eaten_at')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { meal_type, eaten_at, items, ai_notes } = await request.json() as {
    meal_type: string
    eaten_at: string
    items: PutItem[]
    ai_notes: string | null
  }

  // Recompute totals server-side
  const totals = items.reduce(
    (acc, item) => ({
      calories:  acc.calories  + (item.calories  ?? 0),
      protein_g: acc.protein_g + (item.protein_g ?? 0),
      carbs_g:   acc.carbs_g  + (item.carbs_g   ?? 0),
      fat_g:     acc.fat_g    + (item.fat_g      ?? 0),
      fiber_g:   acc.fiber_g  + (item.fiber_g    ?? 0),
      sodium_mg: acc.sodium_mg + (item.sodium_mg  ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0 },
  )

  // Update meal row
  await supabase
    .from('meals')
    .update({
      meal_type,
      eaten_at,
      ai_notes,
      total_calories:  Math.round(totals.calories),
      total_protein_g: totals.protein_g,
      total_carbs_g:   totals.carbs_g,
      total_fat_g:     totals.fat_g,
      total_fiber_g:   totals.fiber_g,
      total_sodium_mg: totals.sodium_mg,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  // Replace all meal_items
  await supabase.from('meal_items').delete().eq('meal_id', id)

  if (items.length > 0) {
    await supabase.from('meal_items').insert(
      items.map((item) => ({ meal_id: id, ...item })),
    )
  }

  // Upsert frequent_foods for each item
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

    const { data: freq } = await supabase
      .from('frequent_foods')
      .select('id, times_logged')
      .eq('user_id', user.id)
      .ilike('name', item.item_name)
      .maybeSingle()

    if (freq) {
      await supabase.from('frequent_foods').update({
        times_logged:         freq.times_logged + 1,
        last_logged_at:       new Date().toISOString(),
        typical_quantity:     item.quantity,
        typical_unit:         item.unit,
        macros_per_unit_json: macrosPerUnit,
      }).eq('id', freq.id)
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

  // Recompute daily_summaries for old and new IST dates
  const oldDate = getISTDateStr(existing.eaten_at)
  const newDate = getISTDateStr(eaten_at)
  await recomputeDailySummary(supabase, user.id, newDate)
  if (oldDate !== newDate) {
    await recomputeDailySummary(supabase, user.id, oldDate)
  }

  return NextResponse.json({ success: true, meal_id: id })
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch eaten_at before deleting (needed for date recompute)
  const { data: meal } = await supabase
    .from('meals')
    .select('eaten_at')
    .eq('id', id)
    .single()

  if (!meal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.from('meals').delete().eq('id', id).eq('user_id', user.id)

  await recomputeDailySummary(supabase, user.id, getISTDateStr(meal.eaten_at))

  return NextResponse.json({ success: true })
}
