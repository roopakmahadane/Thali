import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const {
    name, age, height_cm, weight_kg, gender,
    activity_level, goal, target_weight_kg, timeline_weeks,
    diet_type, allergies,
    daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, daily_fiber_g,
  } = body

  const { error: profileError } = await supabase.from('profiles').upsert({
    user_id: user.id,
    name,
    age,
    height_cm,
    weight_kg,
    gender,
    activity_level,
    goal,
    target_weight_kg: target_weight_kg ?? null,
    timeline_weeks:   timeline_weeks ?? null,
    diet_type,
    allergies:        allergies ?? null,
    daily_calories,
    daily_protein_g,
    daily_carbs_g,
    daily_fat_g,
    daily_fiber_g,
  })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  const today = new Date().toISOString().split('T')[0]

  await supabase.from('daily_summaries').upsert(
    {
      user_id:           user.id,
      date:              today,
      calories_target:   daily_calories,
      calories_consumed: 0,
      protein_g:         0,
      carbs_g:           0,
      fat_g:             0,
    },
    { onConflict: 'user_id,date' }
  )

  return NextResponse.json({ success: true })
}
