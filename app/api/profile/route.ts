import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: profile }, { data: logs }] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, goal, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, age, height_cm, weight_kg, gender, activity_level')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('weight_logs')
      .select('id, weight_kg, logged_at')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(12),
  ])

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  return NextResponse.json({ profile, logs: logs ?? [] })
}
