'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MEAL_SLOTS } from '@/lib/config/meals'

const IST_MS = (5 * 60 + 30) * 60 * 1000
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type DayMeal = {
  id: string
  meal_type: string
  total_calories: number
  item_names: string[]
}

type DayData = {
  date: string
  meals: DayMeal[]
  calories_consumed: number
  calories_target: number
}

function getTodayIST() {
  const now = new Date(Date.now() + IST_MS)
  const base = now.getUTCHours() < 4 ? new Date(now.getTime() - 24 * 3600 * 1000) : now
  const y = base.getUTCFullYear()
  const mo = base.getUTCMonth() + 1
  const d = base.getUTCDate()
  return {
    year: y, month: mo, day: d,
    str: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  }
}

function padDate(y: number, mo: number, d: number) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const slotByKey = new Map<string, typeof MEAL_SLOTS[number]>(MEAL_SLOTS.map((s) => [s.key, s]))

export default function CalendarPage() {
  const todayIST = getTodayIST()

  const [year,        setYear]        = useState(todayIST.year)
  const [month,       setMonth]       = useState(todayIST.month)
  const [dataByDate,  setDataByDate]  = useState<Map<string, DayData>>(new Map())
  const [isLoading,   setIsLoading]   = useState(false)
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null)

  useEffect(() => {
    setIsLoading(true)
    fetch(`/api/calendar?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then(({ days }) => {
        const map = new Map<string, DayData>()
        for (const d of days ?? []) map.set(d.date, d)
        setDataByDate(map)
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [year, month])

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else setMonth((m) => m - 1)
  }

  function nextMonth() {
    if (year === todayIST.year && month === todayIST.month) return
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else setMonth((m) => m + 1)
  }

  const canGoNext      = !(year === todayIST.year && month === todayIST.month)
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()
  const daysInMonth    = new Date(year, month, 0).getDate()

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F5F1E8' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 mb-4">
        <button
          onClick={prevMonth}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', color: '#0F1B2D' }}
        >
          <i className="ti ti-chevron-left" style={{ fontSize: 20 }} />
        </button>
        <p style={{ fontSize: 18, fontWeight: 500, color: '#0F1B2D' }}>
          {MONTH_NAMES[month - 1]} {year}
        </p>
        <button
          onClick={nextMonth}
          disabled={!canGoNext}
          style={{ background: 'none', border: 'none', cursor: canGoNext ? 'pointer' : 'default', padding: '4px 8px', color: canGoNext ? '#0F1B2D' : '#D1D5DB' }}
        >
          <i className="ti ti-chevron-right" style={{ fontSize: 20 }} />
        </button>
      </div>

      {/* Weekday labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 8px', marginBottom: 4 }}>
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, color: '#6B7280', paddingBottom: 4 }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, padding: '0 8px' }}>
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`blank-${i}`} style={{ height: 56 }} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dateStr  = padDate(year, month, day)
          const isToday  = dateStr === todayIST.str
          const isFuture = dateStr > todayIST.str
          const dayData  = dataByDate.get(dateStr)
          const hasMeals = !!dayData && dayData.meals.length > 0

          let bgColor   = '#F5F1E8'
          let textColor = isFuture ? '#D1D5DB' : '#9CA3AF'
          if (isToday)       { bgColor = '#D4F542'; textColor = '#0F1B2D' }
          else if (hasMeals) { bgColor = '#fff';    textColor = '#0F1B2D' }

          return (
            <div
              key={day}
              onClick={() => !isFuture && hasMeals && setSelectedDay(dayData)}
              style={{
                height: 56,
                borderRadius: 10,
                backgroundColor: bgColor,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: 6,
                cursor: hasMeals && !isFuture ? 'pointer' : 'default',
              }}
            >
              <span style={{ fontSize: 13, color: textColor, fontWeight: isToday ? 500 : 400, lineHeight: 1 }}>
                {day}
              </span>

              {hasMeals && (
                <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                  {MEAL_SLOTS.map((slot) => {
                    if (!dayData.meals.some((m) => m.meal_type === slot.key)) return null
                    return <div key={slot.key} style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: slot.color }} />
                  })}
                </div>
              )}

              {hasMeals && dayData.calories_consumed > 0 && (
                <div style={{ width: '80%', height: 3, backgroundColor: '#E5E7EB', borderRadius: 2, marginTop: 4 }}>
                  <div
                    style={{
                      width: `${Math.min(100, (dayData.calories_consumed / dayData.calories_target) * 100)}%`,
                      height: '100%',
                      backgroundColor: '#D4F542',
                      borderRadius: 2,
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {isLoading && (
        <p style={{ textAlign: 'center', paddingTop: 20, fontSize: 13, color: '#6B7280' }}>loading…</p>
      )}

      {/* Day detail bottom sheet */}
      {selectedDay && (
        <div
          onClick={() => setSelectedDay(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 40 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: '#fff',
              borderRadius: '20px 20px 0 0',
              padding: '20px 16px 40px',
              zIndex: 50,
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 16, fontWeight: 500, color: '#0F1B2D' }}>
                {new Date(selectedDay.date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
              </p>
              <button
                onClick={() => setSelectedDay(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}
              >
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {selectedDay.meals.map((meal, idx) => {
                const slot  = slotByKey.get(meal.meal_type)
                const names = meal.item_names.slice(0, 3).join(', ')
                return (
                  <Link
                    key={idx}
                    href={`/meal/${meal.id}`}
                    className="flex items-center gap-3"
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: slot?.color ?? '#6B7280', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#0F1B2D' }}>{slot?.label ?? meal.meal_type}</p>
                      {names && (
                        <p style={{ fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {names}
                        </p>
                      )}
                    </div>
                    <p style={{ fontSize: 13, color: '#6B7280', flexShrink: 0 }}>{meal.total_calories} kcal</p>
                  </Link>
                )
              })}
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: 12, color: '#6B7280' }}>
                {selectedDay.calories_consumed} / {selectedDay.calories_target} kcal
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
