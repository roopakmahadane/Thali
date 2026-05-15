import { createClient } from '@/lib/supabase/server'
import { calculateMacros, type ActivityLevel, type Goal } from '@/lib/macros/calculate'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { weight_kg } = await request.json() as { weight_kg: number }

  if (!weight_kg || weight_kg <= 0) {
    return NextResponse.json({ error: 'Invalid weight' }, { status: 400 })
  }

  const { error: updateError, count } = await supabase
    .from('weight_logs')
    .update({ weight_kg })
    .eq('id', id)
    .eq('user_id', user.id)

  if (updateError || count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Check if this is the most recent log — if so, recalculate profile targets
  const { data: mostRecent } = await supabase
    .from('weight_logs')
    .select('id')
    .eq('user_id', user.id)
    .order('logged_at', { ascending: false })
    .limit(1)
    .single()

  let recalculated = false

  if (mostRecent?.id === id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('age, height_cm, gender, activity_level, goal')
      .eq('user_id', user.id)
      .single()

    if (profile?.age && profile.height_cm && profile.gender && profile.activity_level && profile.goal) {
      const targets = calculateMacros({
        age:            profile.age,
        height_cm:      profile.height_cm,
        weight_kg,
        gender:         profile.gender as 'male' | 'female',
        activity_level: profile.activity_level as ActivityLevel,
        goal:           profile.goal as Goal,
      })

      await supabase
        .from('profiles')
        .update({
          weight_kg,
          daily_calories:  targets.daily_calories,
          daily_protein_g: targets.daily_protein_g,
          daily_carbs_g:   targets.daily_carbs_g,
          daily_fat_g:     targets.daily_fat_g,
          daily_fiber_g:   targets.daily_fiber_g,
        })
        .eq('user_id', user.id)

      recalculated = true
    }
  }

  return NextResponse.json({ success: true, recalculated })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  await supabase
    .from('weight_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  return NextResponse.json({ success: true })
}
