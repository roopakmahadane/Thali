import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { calculateBreakdown, type ActivityLevel, type Goal } from '@/lib/macros/calculate'
import WeightLogSection from '@/components/WeightLogSection'

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

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: logsRaw }] = await Promise.all([
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
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F1E8' }}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>Something went wrong. Try refreshing.</p>
      </div>
    )
  }

  const canBreakdown = profile.age && profile.height_cm && profile.weight_kg &&
    profile.gender && profile.activity_level && profile.goal

  const breakdown = canBreakdown ? calculateBreakdown({
    age:            profile.age!,
    height_cm:      profile.height_cm!,
    weight_kg:      Number(profile.weight_kg),
    gender:         profile.gender as 'male' | 'female',
    activity_level: profile.activity_level as ActivityLevel,
    goal:           profile.goal as Goal,
  }) : null

  const goalLabel = GOAL_LABELS[profile.goal ?? ''] ?? (profile.goal ?? '—')

  function deltaStr(delta: number): string {
    if (delta === 0) return 'no adjustment'
    return delta > 0 ? `+${delta} kcal` : `${delta} kcal`
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ backgroundColor: '#F5F1E8' }}>

      {/* ── Header ── */}
      <p style={{ fontSize: 22, fontWeight: 500, color: '#0F1B2D', marginBottom: 20 }}>profile</p>

      {/* ── Section 1: Goal + Targets ── */}
      <div className="mb-3" style={{ backgroundColor: '#fff', borderRadius: 20, padding: 18 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: '#0F1B2D',
              backgroundColor: '#D4F542',
              borderRadius: 999,
              padding: '3px 10px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {goalLabel}
          </span>
          <Link
            href="/onboarding"
            style={{ fontSize: 12, color: '#D4F542', textDecoration: 'underline' }}
          >
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
              fontSize: 11,
              color: '#6B7280',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            how we calculated this
          </p>

          {[
            {
              label: 'BMR',
              value: `${breakdown.bmr} kcal`,
            },
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
            fontSize: 11,
            color: '#6B7280',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          weight log
        </p>
        <WeightLogSection initialLogs={logsRaw ?? []} />
      </div>

    </div>
  )
}
