'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignUpPage() {
  const router = useRouter()
  const [email, setEmail]                   = useState('')
  const [password, setPassword]             = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signUp({ email, password })

    if (authError) {
      setError(
        authError.message === 'User already registered'
          ? 'An account with this email already exists'
          : authError.message
      )
      setLoading(false)
      return
    }

    router.push('/onboarding')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: '#F5F1E8' }}
    >
      <div className="w-full max-w-sm bg-white p-8" style={{ borderRadius: 20 }}>
        <p className="mb-8" style={{ color: '#0F1B2D', fontWeight: 500, fontSize: 28 }}>
          thali
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="w-full px-4 py-3 text-sm outline-none border"
            style={{ borderRadius: 999, borderColor: '#E5E7EB', color: '#0F1B2D' }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 8 characters"
            required
            className="w-full px-4 py-3 text-sm outline-none border"
            style={{ borderRadius: 999, borderColor: '#E5E7EB', color: '#0F1B2D' }}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="confirm password"
            required
            className="w-full px-4 py-3 text-sm outline-none border"
            style={{ borderRadius: 999, borderColor: '#E5E7EB', color: '#0F1B2D' }}
          />

          {error && (
            <p className="text-sm" style={{ color: '#DC2626' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-sm"
            style={{
              backgroundColor: loading ? '#E5E7EB' : '#D4F542',
              color: loading ? '#9CA3AF' : '#0F1B2D',
              borderRadius: 14,
              fontWeight: 500,
            }}
          >
            {loading ? 'Creating account…' : 'create account'}
          </button>
        </form>

        <p className="mt-5 text-sm text-center" style={{ color: '#6B7280' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#0F1B2D', fontWeight: 500 }}>
            sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
