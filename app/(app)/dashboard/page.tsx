import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { MEAL_SLOTS } from '@/lib/config/meals'
import SuggestionsCard from '@/components/SuggestionsCard'
import CheckInBanner from '@/components/CheckInBanner'

// ─── Day boundary (4 AM IST) ─────────────────────────────────────────────────

function getTodayBoundaryUTC(): { start: string; end: string } {
  const IST_MS = (5 * 60 + 30) * 60 * 1000
  const now = new Date()
  const nowIST = new Date(now.getTime() + IST_MS)
  let year = nowIST.getUTCFullYear()
  let month = nowIST.getUTCMonth()
  let day = nowIST.getUTCDate()
  if (nowIST.getUTCHours() < 4) {
    const prev = new Date(Date.UTC(year, month, day - 1))
    year = prev.getUTCFullYear()
    month = prev.getUTCMonth()
    day = prev.getUTCDate()
  }
  const istMidnightUTC = new Date(Date.UTC(year, month, day) - IST_MS)
  const start = new Date(istMidnightUTC.getTime() + 4 * 3600 * 1000)
  const end = new Date(start.getTime() + 24 * 3600 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDateIST(): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
    .format(new Date())
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,/g, ',')
}

function formatTimeIST(utcTs: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(utcTs))
}

// ─── ISO week key ────────────────────────────────────────────────────────────

function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, height, fill }: { pct: number; height: number; fill: string }) {
  return (
    <div style={{ backgroundColor: '#E5E7EB', borderRadius: height / 2, height, overflow: 'hidden' }}>
      <div
        style={{
          backgroundColor: fill,
          width: `${Math.min(100, pct)}%`,
          height: '100%',
          borderRadius: height / 2,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // middleware handles redirect

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, daily_fiber_g')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F5F1E8' }}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>Something went wrong. Try refreshing.</p>
      </div>
    )
  }

  const { start, end } = getTodayBoundaryUTC()

  const { data: mealsRaw } = await supabase
    .from('meals')
    .select('id, meal_type, eaten_at, total_calories, total_protein_g, total_carbs_g, total_fat_g, ai_notes, meal_items(item_name, quantity, unit)')
    .eq('user_id', user.id)
    .gte('eaten_at', start)
    .lt('eaten_at', end)
    .order('eaten_at', { ascending: true })

  const meals = mealsRaw ?? []

  const consumed = {
    calories: meals.reduce((s, m) => s + (m.total_calories ?? 0), 0),
    protein:  meals.reduce((s, m) => s + (Number(m.total_protein_g) ?? 0), 0),
    carbs:    meals.reduce((s, m) => s + (Number(m.total_carbs_g) ?? 0), 0),
    fat:      meals.reduce((s, m) => s + (Number(m.total_fat_g) ?? 0), 0),
  }

  const caloriesLeft  = Math.max(0, profile.daily_calories - consumed.calories)
  const caloriePct    = (consumed.calories / profile.daily_calories) * 100
  const hasEmptySlots = MEAL_SLOTS.some((s) => !meals.find((m) => m.meal_type === s.key))

  // ── Weekly check-in banner logic ──────────────────────────────────────────
  const IST_MS_DASH = (5 * 60 + 30) * 60 * 1000
  const nowIST      = new Date(Date.now() + IST_MS_DASH)
  const isSunday    = nowIST.getUTCDay() === 0
  let showCheckIn   = false
  let weekKey       = ''

  if (isSunday) {
    weekKey = getISOWeekKey(nowIST)
    const cookieStore = await cookies()
    const dismissed   = cookieStore.get(`checkin_dismissed_${weekKey}`)?.value
    if (!dismissed) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const { data: recentWeight } = await supabase
        .from('weight_logs')
        .select('id')
        .eq('user_id', user.id)
        .gte('logged_at', sevenDaysAgo)
        .limit(1)
        .maybeSingle()
      if (!recentWeight) showCheckIn = true
    }
  }

  const initials = profile.name ? profile.name.trim().charAt(0).toUpperCase() : '?'
  const dateStr  = formatDateIST()

  return (
    <div className="min-h-screen px-4 pt-6 pb-8" style={{ backgroundColor: '#F5F1E8' }}>

      {/* ── Header ── */}
      <p
        className="mb-1"
        style={{ fontSize: 11, color: '#6B7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}
      >
        {dateStr}
      </p>
      <div className="flex items-center justify-between mb-5">
        <p style={{ fontSize: 22, fontWeight: 500, color: '#0F1B2D' }}>thali</p>
        <div
          className="flex items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: '#fff',
            color: '#0F1B2D',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {initials}
        </div>
      </div>

      {/* ── Check-in banner ── */}
      {showCheckIn && <CheckInBanner weekKey={weekKey} />}

      {/* ── Calories card ── */}
      <div className="mb-3" style={{ backgroundColor: '#fff', borderRadius: 20, padding: 18 }}>
        <p style={{ fontSize: 11, color: '#6B7280', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
          calories left
        </p>
        <div className="flex items-baseline gap-1 mb-1">
          <span style={{ fontSize: 36, fontWeight: 500, color: '#0F1B2D', lineHeight: 1 }}>
            {caloriesLeft.toLocaleString()}
          </span>
          <span style={{ fontSize: 14, color: '#6B7280' }}>
            / {profile.daily_calories.toLocaleString()} kcal
          </span>
        </div>

        <div className="mb-4">
          <ProgressBar pct={caloriePct} height={6} fill="#D4F542" />
        </div>

        {/* Macro mini-stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'PROTEIN', consumed: Math.round(consumed.protein), target: profile.daily_protein_g },
            { label: 'CARBS',   consumed: Math.round(consumed.carbs),   target: profile.daily_carbs_g   },
            { label: 'FAT',     consumed: Math.round(consumed.fat),     target: profile.daily_fat_g     },
          ].map(({ label, consumed: c, target }) => (
            <div key={label}>
              <p style={{ fontSize: 10, color: '#6B7280', letterSpacing: '0.05em', marginBottom: 2 }}>
                {label}
              </p>
              <p style={{ fontSize: 15, fontWeight: 500, color: '#0F1B2D', marginBottom: 4 }}>
                {c}
                <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 400 }}> / {target}g</span>
              </p>
              <ProgressBar pct={(c / target) * 100} height={3} fill="#0F1B2D" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Section label ── */}
      <p
        style={{
          fontSize: 11,
          color: '#6B7280',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginTop: 18,
          marginBottom: 8,
        }}
      >
        today
      </p>

      {/* ── Meal slot cards ── */}
      <div className="flex flex-col gap-2 mb-4">
        {MEAL_SLOTS.map((slot) => {
          const meal = meals.find((m) => m.meal_type === slot.key)

          if (meal) {
            // Filled slot
            const itemNames = (meal.meal_items ?? [])
              .slice(0, 2)
              .map((i: { item_name: string }) => i.item_name)
              .join(', ')
            const subtitle = itemNames
              ? `${itemNames} · ${meal.total_calories ?? 0} kcal`
              : `${meal.total_calories ?? 0} kcal`

            return (
              <Link
                key={slot.key}
                href={`/meal/${meal.id}`}
                className="flex items-center gap-3"
                style={{ backgroundColor: '#fff', borderRadius: 16, padding: '14px 16px', textDecoration: 'none' }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: slot.color,
                    flexShrink: 0,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#0F1B2D' }}>{slot.label}</p>
                  <p
                    style={{ fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {subtitle}
                  </p>
                </div>
                {meal.eaten_at && (
                  <p style={{ fontSize: 11, color: '#6B7280', flexShrink: 0 }}>
                    {formatTimeIST(meal.eaten_at)}
                  </p>
                )}
              </Link>
            )
          }

          // Empty slot
          return (
            <Link
              key={slot.key}
              href={`/meal/new?slot=${slot.key}`}
              className="flex items-center gap-3"
              style={{
                backgroundColor: '#fff',
                border: '1px dashed #E5E7EB',
                borderRadius: 16,
                padding: '14px 16px',
                textDecoration: 'none',
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  border: `1.5px solid ${slot.color}`,
                  flexShrink: 0,
                }}
              />
              <p style={{ fontSize: 14, color: '#6B7280', flex: 1 }}>{slot.label}</p>
              <i className="ti ti-plus" style={{ fontSize: 16, color: '#6B7280' }} />
            </Link>
          )
        })}
      </div>

      {/* ── Snap a meal CTA ── */}
      <Link
        href="/meal/new"
        className="flex items-center justify-center gap-2 w-full"
        style={{
          backgroundColor: '#D4F542',
          color: '#0F1B2D',
          borderRadius: 14,
          padding: '12px 0',
          fontSize: 13,
          fontWeight: 500,
          textDecoration: 'none',
        }}
      >
        <i className="ti ti-camera" style={{ fontSize: 18 }} />
        snap a meal
      </Link>

      {/* ── Suggestions ── */}
      <SuggestionsCard hasEmptySlots={hasEmptySlots} />

    </div>
  )
}
