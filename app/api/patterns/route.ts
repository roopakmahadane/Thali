import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: patterns }, { count: meal_count }] = await Promise.all([
    supabase
      .from('user_patterns')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('meals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  return NextResponse.json(
    { patterns: patterns ?? [], meal_count: meal_count ?? 0 },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  )
}
