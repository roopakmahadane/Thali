'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <button
      onClick={handleSignOut}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: 13,
        color: '#6B7280',
        padding: 0,
      }}
    >
      sign out
    </button>
  )
}
