import { createClient } from '@/lib/supabase/server'
import { calculateMacros, type ActivityLevel, type Goal } from '@/lib/macros/calculate'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: logs } = await supabase
    .from('weight_logs')
    .select('id, weight_kg, logged_at')
    .eq('user_id', user.id)
    .order('logged_at', { ascending: false })
    .limit(12)

  return NextResponse.json({ logs: logs ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { weight_kg } = await request.json() as { weight_kg: number }

  if (!weight_kg || weight_kg <= 0) {
    return NextResponse.json({ error: 'Invalid weight' }, { status: 400 })
  }

  await supabase.from('weight_logs').insert({
    user_id:   user.id,
    weight_kg,
    logged_at: new Date().toISOString(),
  })

  const { data: profile } = await supabase
    .from('profiles')
    .select('age, height_cm, gender, activity_level, goal')
    .eq('user_id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const newTargets = calculateMacros({
    age:            profile.age,
    height_cm:      profile.height_cm,
    weight_kg,
    gender:         profile.gender as 'male' | 'female',
    activity_level: profile.activity_level as ActivityLevel,
    goal:           profile.goal as Goal,
  })

  await supabase.from('profiles').update({
    weight_kg,
    daily_calories:  newTargets.daily_calories,
    daily_protein_g: newTargets.daily_protein_g,
    daily_carbs_g:   newTargets.daily_carbs_g,
    daily_fat_g:     newTargets.daily_fat_g,
  }).eq('user_id', user.id)

  return NextResponse.json({
    success: true,
    new_targets: {
      daily_calories:  newTargets.daily_calories,
      daily_protein_g: newTargets.daily_protein_g,
      daily_carbs_g:   newTargets.daily_carbs_g,
      daily_fat_g:     newTargets.daily_fat_g,
    },
  })
}
