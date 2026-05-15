'use client'

import { useState } from 'react'
import type { Suggestion } from '@/lib/claude/suggestions'

function Spinner() {
  return (
    <div
      className="animate-spin"
      style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', display: 'inline-block' }}
    />
  )
}

export default function SuggestionsCard({ hasEmptySlots }: { hasEmptySlots: boolean }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isLoading,   setIsLoading]   = useState(false)
  const [loaded,      setLoaded]      = useState(false)

  if (!hasEmptySlots) return null

  async function handleLoad() {
    setIsLoading(true)
    try {
      const res = await fetch('/api/suggestions')
      if (!res.ok) throw new Error()
      const { suggestions: data } = await res.json()
      setSuggestions(data ?? [])
      setLoaded(true)
    } catch {
      setLoaded(true)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 18, marginTop: 16 }}>
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontSize: 15, fontWeight: 500, color: '#0F1B2D' }}>what to eat?</p>
        <i className="ti ti-sparkles" style={{ fontSize: 16, color: '#6B7280' }} />
      </div>

      {!loaded && !isLoading && (
        <button
          onClick={handleLoad}
          style={{
            width: '100%',
            backgroundColor: '#fff',
            border: '1px solid #0F1B2D',
            color: '#0F1B2D',
            borderRadius: 12,
            padding: '10px 0',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          find suggestions
        </button>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2" style={{ padding: '12px 0', color: '#6B7280' }}>
          <Spinner />
          <p style={{ fontSize: 13, color: '#6B7280' }}>finding suggestions…</p>
        </div>
      )}

      {loaded && suggestions.length === 0 && (
        <p style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', padding: '8px 0' }}>
          No suggestions right now.
        </p>
      )}

      {suggestions.map((s, idx) => (
        <div
          key={idx}
          style={{ backgroundColor: '#F5F1E8', borderRadius: 12, padding: 12, marginTop: 8 }}
        >
          <p style={{ fontSize: 14, fontWeight: 500, color: '#0F1B2D', marginBottom: 2 }}>{s.meal_name}</p>
          <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
            {s.items.map((i) => i.item_name).join(', ')}
          </p>
          <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
            {s.estimated_calories} kcal · P {s.estimated_protein_g}g · C {s.estimated_carbs_g}g
          </p>
          <p style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic' }}>{s.reason}</p>
        </div>
      ))}
    </div>
  )
}
