'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MEAL_SLOTS } from '@/lib/config/meals'
import SuggestionsCard from '@/components/SuggestionsCard'
import CheckInBanner from '@/components/CheckInBanner'

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardProfile = {
  name: string | null
  daily_calories: number
  daily_protein_g: number
  daily_carbs_g: number
  daily_fat_g: number
  daily_fiber_g: number
}

type DashboardMeal = {
  id: string
  meal_type: string
  eaten_at: string
  total_calories: number
  total_protein_g: number
  total_carbs_g: number
  total_fat_g: number
  ai_notes: string | null
  items: { item_name: string; quantity: number; unit: string }[]
}

type DashboardData = {
  profile: DashboardProfile
  today: { calories_consumed: number; protein_g: number; carbs_g: number; fat_g: number }
  show_checkin: boolean
  week_key: string
  meals: DashboardMeal[]
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

// ─── Components ───────────────────────────────────────────────────────────────

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

function Skeleton({ height, borderRadius = 16 }: { height: number; borderRadius?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{ backgroundColor: '#E8E4DB', borderRadius, height }}
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = () => {
      setLoading(true)
      fetch('/api/dashboard', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { setData(d); setLoading(false) })
        .catch(() => setLoading(false))
    }
    fetchData()
    document.addEventListener('visibilitychange', fetchData)
    return () => document.removeEventListener('visibilitychange', fetchData)
  }, [])

  const dateStr = formatDateIST()
  const initials = data?.profile?.name ? data.profile.name.trim().charAt(0).toUpperCase() : '?'
  const hasEmptySlots = data
    ? MEAL_SLOTS.some((s) => !data.meals.find((m) => m.meal_type === s.key))
    : false

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
            width: 36, height: 36, borderRadius: '50%',
            backgroundColor: '#fff', color: '#0F1B2D', fontSize: 14, fontWeight: 500,
          }}
        >
          {initials}
        </div>
      </div>

      {/* ── Check-in banner ── */}
      {data?.show_checkin && <CheckInBanner weekKey={data.week_key} />}

      {/* ── Calories card ── */}
      {loading ? (
        <div className="mb-3"><Skeleton height={140} borderRadius={20} /></div>
      ) : data ? (
        <div className="mb-3" style={{ backgroundColor: '#fff', borderRadius: 20, padding: 18 }}>
          <p style={{ fontSize: 11, color: '#6B7280', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
            calories consumed
          </p>
          <div className="flex items-baseline gap-1 mb-1">
            <span style={{ fontSize: 36, fontWeight: 500, color: '#0F1B2D', lineHeight: 1 }}>
              {data.today.calories_consumed.toLocaleString()}
            </span>
            <span style={{ fontSize: 14, color: '#6B7280' }}>
              / {data.profile.daily_calories.toLocaleString()} kcal target
            </span>
          </div>
          <div className="mb-2">
            <ProgressBar
              pct={(data.today.calories_consumed / data.profile.daily_calories) * 100}
              height={6}
              fill="#D4F542"
            />
          </div>
          <p className="mb-4" style={{ fontSize: 13, color: '#6B7280' }}>
            {Math.max(0, data.profile.daily_calories - data.today.calories_consumed).toLocaleString()} kcal remaining
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'PROTEIN', consumed: Math.round(data.today.protein_g), target: data.profile.daily_protein_g },
              { label: 'CARBS',   consumed: Math.round(data.today.carbs_g),   target: data.profile.daily_carbs_g   },
              { label: 'FAT',     consumed: Math.round(data.today.fat_g),     target: data.profile.daily_fat_g     },
            ].map(({ label, consumed, target }) => (
              <div key={label}>
                <p style={{ fontSize: 10, color: '#6B7280', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 15, fontWeight: 500, color: '#0F1B2D', marginBottom: 4 }}>
                  {consumed}
                  <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 400 }}> / {target}g</span>
                </p>
                <ProgressBar pct={(consumed / target) * 100} height={3} fill="#0F1B2D" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Section label ── */}
      <p
        style={{
          fontSize: 11, color: '#6B7280', letterSpacing: '0.05em',
          textTransform: 'uppercase', marginTop: 18, marginBottom: 8,
        }}
      >
        today
      </p>

      {/* ── Meal slot cards ── */}
      <div className="flex flex-col gap-2 mb-4">
        {loading ? (
          MEAL_SLOTS.map((s) => <Skeleton key={s.key} height={52} borderRadius={16} />)
        ) : data ? (
          MEAL_SLOTS.map((slot) => {
            const slotMeals = data.meals.filter((m) => m.meal_type === slot.key)

            if (slotMeals.length > 0) {
              // Merge items and calories from all meals for this slot
              const allItems = slotMeals.flatMap((m) => m.items)
              const totalCalories = slotMeals.reduce((s, m) => s + (m.total_calories ?? 0), 0)
              // Link to the most recently logged meal (array is ascending by eaten_at)
              const latestMeal = slotMeals[slotMeals.length - 1]
              const itemNames = allItems.slice(0, 2).map((i) => i.item_name).join(', ')
              const subtitle = itemNames
                ? `${itemNames} · ${totalCalories} kcal`
                : `${totalCalories} kcal`
              return (
                <Link
                  key={slot.key}
                  href={`/today?slot=${slot.key}`}
                  className="flex items-center gap-3"
                  style={{ backgroundColor: '#fff', borderRadius: 16, padding: '14px 16px', textDecoration: 'none' }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: slot.color, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 14, fontWeight: 500, color: '#0F1B2D' }}>{slot.label}</p>
                    <p style={{ fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {subtitle}
                    </p>
                  </div>
                  {latestMeal.eaten_at && (
                    <p style={{ fontSize: 11, color: '#6B7280', flexShrink: 0 }}>{formatTimeIST(latestMeal.eaten_at)}</p>
                  )}
                </Link>
              )
            }

            return (
              <Link
                key={slot.key}
                href={`/today?slot=${slot.key}`}
                className="flex items-center gap-3"
                style={{
                  backgroundColor: '#fff', border: '1px dashed #E5E7EB',
                  borderRadius: 16, padding: '14px 16px', textDecoration: 'none',
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${slot.color}`, flexShrink: 0 }} />
                <p style={{ fontSize: 14, color: '#6B7280', flex: 1 }}>{slot.label}</p>
                <i className="ti ti-plus" style={{ fontSize: 16, color: '#6B7280' }} />
              </Link>
            )
          })
        ) : null}
      </div>

      {/* ── Snap a meal CTA ── */}
      <Link
        href="/meal/new"
        className="flex items-center justify-center gap-2 w-full"
        style={{
          backgroundColor: '#D4F542', color: '#0F1B2D', borderRadius: 14,
          padding: '12px 0', fontSize: 13, fontWeight: 500, textDecoration: 'none',
        }}
      >
        <i className="ti ti-camera" style={{ fontSize: 18 }} />
        snap a meal
      </Link>

      {/* ── Suggestions ── */}
      {data && <SuggestionsCard hasEmptySlots={hasEmptySlots} />}

    </div>
  )
}
