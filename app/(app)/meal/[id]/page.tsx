import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const IST_MS = (5 * 60 + 30) * 60 * 1000

export default async function MealRedirectPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data } = await supabase.from('meals').select('meal_type, eaten_at').eq('id', params.id).single()
  const slot = data?.meal_type ?? 'breakfast'
  if (data?.eaten_at) {
    const ist = new Date(new Date(data.eaten_at).getTime() + IST_MS)
    const y = ist.getUTCFullYear()
    const m = String(ist.getUTCMonth() + 1).padStart(2, '0')
    const d = String(ist.getUTCDate()).padStart(2, '0')
    redirect(`/today?slot=${slot}&date=${y}-${m}-${d}`)
  }
  redirect(`/today?slot=${slot}`)
}
