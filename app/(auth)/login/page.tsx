'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback` },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: '#F5F1E8' }}
    >
      <div className="w-full max-w-sm bg-white p-8" style={{ borderRadius: 20 }}>
        <p
          className="mb-8"
          style={{ color: '#0F1B2D', fontWeight: 500, fontSize: 28 }}
        >
          thali
        </p>

        {sent ? (
          <p className="text-sm" style={{ color: '#6B7280' }}>
            Check your email — we sent a magic link to sign in.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-4 py-3 text-sm outline-none border"
              style={{
                borderRadius: 999,
                borderColor: '#E5E7EB',
                color: '#0F1B2D',
              }}
            />

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-sm"
              style={{
                backgroundColor: '#D4F542',
                color: '#0F1B2D',
                borderRadius: 14,
                fontWeight: 500,
              }}
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
