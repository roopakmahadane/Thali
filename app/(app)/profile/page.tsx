'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { calculateBreakdown, type ActivityLevel, type Goal } from '@/lib/macros/calculate'
import WeightLogSection from '@/components/WeightLogSection'
import SignOutButton from '@/components/SignOutButton'

const GOAL_LABELS: Record<string, string> = {
  lose_weight:  'Lose weight',
  maintain:     'Maintain',
  recomp:       'Recomp',
  muscle_gain:  'Gain muscle',
  bulk:         'Bulk',
}

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary:    'sedentary',
  light:        'light',
  moderate:     'moderate',
  very_active:  'very active',
  extra_active: 'extra active',
}

type ProfileData = {
  name: string | null
  goal: string | null
  daily_calories: number
  daily_protein_g: number
  daily_carbs_g: number
  daily_fat_g: number
  age: number | null
  height_cm: number | null
  weight_kg: string | null
  gender: string | null
  activity_level: string | null
}

type WeightLog = { id: string; weight_kg: number; logged_at: string }

function Skeleton({ height, borderRadius = 20 }: { height: number; borderRadius?: number }) {
  return (
    <div className="animate-pulse" style={{ backgroundColor: '#E8E4DB', borderRadius, height }} />
  )
}

function deltaStr(delta: number): string {
  if (delta === 0) return 'no adjustment'
  return delta > 0 ? `+${delta} kcal` : `${delta} kcal`
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => {
        setProfile(d.profile ?? null)
        setLogs(d.logs ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const canBreakdown = profile &&
    profile.age && profile.height_cm && profile.weight_kg &&
    profile.gender && profile.activity_level && profile.goal

  const breakdown = canBreakdown && profile ? calculateBreakdown({
    age:            profile.age!,
    height_cm:      profile.height_cm!,
    weight_kg:      Number(profile.weight_kg),
    gender:         profile.gender as 'male' | 'female',
    activity_level: profile.activity_level as ActivityLevel,
    goal:           profile.goal as Goal,
  }) : null

  const goalLabel = profile
    ? (GOAL_LABELS[profile.goal ?? ''] ?? (profile.goal ?? '—'))
    : '—'

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ backgroundColor: '#F5F1E8' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 22, fontWeight: 500, color: '#0F1B2D' }}>profile</p>
        <SignOutButton />
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton height={130} borderRadius={20} />
          <Skeleton height={120} borderRadius={20} />
          <Skeleton height={200} borderRadius={20} />
        </div>
      ) : profile ? (
        <>
          {/* ── Section 1: Goal + Targets ── */}
          <div className="mb-3" style={{ backgroundColor: '#fff', borderRadius: 20, padding: 18 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
              <span
                style={{
                  fontSize: 10, fontWeight: 500, color: '#0F1B2D',
                  backgroundColor: '#D4F542', borderRadius: 999, padding: '3px 10px',
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                }}
              >
                {goalLabel}
              </span>
              <Link href="/onboarding" style={{ fontSize: 12, color: '#D4F542', textDecoration: 'underline' }}>
                update goal
              </Link>
            </div>
            <div>
              {[
                { label: 'Calories', value: `${profile.daily_calories} kcal` },
                { label: 'Protein',  value: `${profile.daily_protein_g} g`  },
                { label: 'Carbs',    value: `${profile.daily_carbs_g} g`    },
                { label: 'Fat',      value: `${profile.daily_fat_g} g`      },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between"
                  style={{ paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #F3F4F6' }}
                >
                  <p style={{ fontSize: 14, color: '#6B7280' }}>{label}</p>
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#0F1B2D' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Section 2: How we calculated this ── */}
          {breakdown && (
            <div className="mb-3" style={{ backgroundColor: '#fff', borderRadius: 20, padding: 18 }}>
              <p
                style={{
                  fontSize: 11, color: '#6B7280', letterSpacing: '0.05em',
                  textTransform: 'uppercase', marginBottom: 12,
                }}
              >
                how we calculated this
              </p>
              {[
                { label: 'BMR', value: `${breakdown.bmr} kcal` },
                {
                  label: `Activity (${ACTIVITY_LABELS[profile.activity_level ?? ''] ?? profile.activity_level})`,
                  value: `×${breakdown.activity_multiplier} → ${breakdown.tdee} kcal TDEE`,
                },
                {
                  label: 'Goal adjustment',
                  value: `${deltaStr(breakdown.goal_kcal_delta)} → ${breakdown.daily_calories} kcal target`,
                },
                {
                  label: 'Protein',
                  value: `${breakdown.protein_multiplier_g_per_kg}g/kg × ${profile.weight_kg}kg = ${breakdown.daily_protein_g}g`,
                },
                {
                  label: 'Remaining',
                  value: `${breakdown.remaining_calories} kcal → carbs ${Math.round(breakdown.carb_pct * 100)}% / fat ${Math.round(breakdown.fat_pct * 100)}%`,
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4"
                  style={{ paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #F3F4F6' }}
                >
                  <p style={{ fontSize: 12, color: '#6B7280', flexShrink: 0 }}>{label}</p>
                  <p style={{ fontSize: 12, color: '#0F1B2D', textAlign: 'right' }}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Section 3: Weight log ── */}
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 18 }}>
            <p
              style={{
                fontSize: 11, color: '#6B7280', letterSpacing: '0.05em',
                textTransform: 'uppercase', marginBottom: 14,
              }}
            >
              weight log
            </p>
            <WeightLogSection initialLogs={logs} />
          </div>
        </>
      ) : (
        <div style={{ paddingTop: 80, textAlign: 'center' }}>
          <p style={{ color: '#6B7280', fontSize: 14 }}>Something went wrong. Try refreshing.</p>
        </div>
      )}

    </div>
  )
}
