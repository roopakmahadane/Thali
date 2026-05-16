import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: foods } = await supabase
    .from('frequent_foods')
    .select('*')
    .eq('user_id', user.id)
    .gte('times_logged', 2)
    .order('times_logged', { ascending: false })
    .limit(8)

  return NextResponse.json(
    { foods: foods ?? [] },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  )
}
