import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function MealRedirectPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data } = await supabase.from('meals').select('meal_type').eq('id', params.id).single()
  redirect(`/today?slot=${data?.meal_type ?? 'breakfast'}`)
}
