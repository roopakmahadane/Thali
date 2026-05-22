'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MEAL_SLOTS, type MealSlotKey } from '@/lib/config/meals'
import type { VisionMealItem } from '@/lib/vision'

const UNIT_OPTIONS = ['piece', 'g', 'ml', 'cup', 'bowl', 'tbsp', 'tsp', 'slice'] as const

// ─── Types ────────────────────────────────────────────────────────────────────

type EditItem = VisionMealItem & { source: 'ai' | 'manual'; _base: VisionMealItem }

type SlotState = {
  status: 'loading' | 'loaded' | 'error'
  mealId: string | null
  originalUTC: string | null
  loggedAt: string
  aiNotes: string
  items: EditItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IST_MS = (5 * 60 + 30) * 60 * 1000

function utcToISTTimeStr(utcTs: string): string {
  const ist = new Date(new Date(utcTs).getTime() + IST_MS)
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`
}

function timeToISO(timeStr: string, referenceUTC: string): string {
  const ist = new Date(new Date(referenceUTC).getTime() + IST_MS)
  const [h, m] = timeStr.split(':').map(Number)
  const istDt = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), h, m, 0))
  return new Date(istDt.getTime() - IST_MS).toISOString()
}

function defaultLoggedAt(slotKey: MealSlotKey): string {
  const slot = MEAL_SLOTS.find((s) => s.key === slotKey)!
  return `${String(slot.defaultHour).padStart(2, '0')}:00`
}

function blankItem(): EditItem {
  const base: VisionMealItem = {
    item_name: '', quantity: 1, unit: 'g', calories: 0,
    protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0, confidence: 'high',
  }
  return { ...base, source: 'manual', _base: base }
}

function loadingSlotState(slotKey: MealSlotKey): SlotState {
  return { status: 'loading', mealId: null, originalUTC: null, loggedAt: defaultLoggedAt(slotKey), aiNotes: '', items: [] }
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div
      className="animate-spin"
      style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', display: 'inline-block' }}
    />
  )
}

// ─── Main content ─────────────────────────────────────────────────────────────

function TodayContent() {
  const router      = useRouter()
  const searchParams = useSearchParams()

  const slotParam   = searchParams.get('slot')
  const validKeys   = MEAL_SLOTS.map((s) => s.key) as string[]
  const initialSlot = (validKeys.includes(slotParam ?? '') ? slotParam : 'breakfast') as MealSlotKey

  const addPhotoRef  = useRef<HTMLInputElement>(null)
  const fetchedSlots = useRef<Set<MealSlotKey>>(new Set())

  const [activeSlot,       setActiveSlot]       = useState<MealSlotKey>(initialSlot)
  const [cache,            setCache]             = useState<Partial<Record<MealSlotKey, SlotState>>>({})
  const [isSaving,         setIsSaving]          = useState(false)
  const [isDeleting,       setIsDeleting]        = useState(false)
  const [isPhotoAnalyzing, setIsPhotoAnalyzing]  = useState(false)
  const [error,            setError]             = useState<string | null>(null)

  // ── Fetch slot data ───────────────────────────────────────────────────────

  useEffect(() => {
    if (fetchedSlots.current.has(activeSlot)) return
    fetchedSlots.current.add(activeSlot)

    setCache((prev) => ({ ...prev, [activeSlot]: loadingSlotState(activeSlot) }))

    fetch(`/api/meals/today?slot=${activeSlot}`)
      .then((r) => r.json())
      .then(({ meal, items: fetchedItems }: {
        meal: { id: string; meal_type: string; eaten_at: string; ai_notes: string | null } | null
        items: {
          item_name: string; quantity: number; unit: string
          calories: number; protein_g: number; carbs_g: number
          fat_g: number; fiber_g: number; sodium_mg: number; source: string
        }[]
      }) => {
        const editItems: EditItem[] = (fetchedItems ?? []).map((item) => {
          const base: VisionMealItem = {
            item_name:  item.item_name,
            quantity:   Number(item.quantity),
            unit:       item.unit,
            calories:   item.calories,
            protein_g:  Number(item.protein_g),
            carbs_g:    Number(item.carbs_g),
            fat_g:      Number(item.fat_g),
            fiber_g:    Number(item.fiber_g),
            sodium_mg:  Number(item.sodium_mg),
            confidence: 'high',
          }
          return { ...base, source: (item.source as 'ai' | 'manual') ?? 'manual', _base: base }
        })
        setCache((prev) => ({
          ...prev,
          [activeSlot]: {
            status:      'loaded',
            mealId:      meal?.id ?? null,
            originalUTC: meal?.eaten_at ?? null,
            loggedAt:    meal ? utcToISTTimeStr(meal.eaten_at) : defaultLoggedAt(activeSlot),
            aiNotes:     meal?.ai_notes ?? '',
            items:       editItems,
          },
        }))
      })
      .catch(() => {
        setCache((prev) => ({ ...prev, [activeSlot]: { ...loadingSlotState(activeSlot), status: 'error' } }))
      })
  }, [activeSlot])

  const slotState  = cache[activeSlot]
  const slotConfig = MEAL_SLOTS.find((s) => s.key === activeSlot)!
  const busy       = isSaving || isDeleting

  // ── Cache mutators ────────────────────────────────────────────────────────

  function patchSlot(patch: Partial<SlotState>) {
    setCache((prev) => ({ ...prev, [activeSlot]: { ...prev[activeSlot]!, ...patch } }))
  }

  function updateItems(updater: (prev: EditItem[]) => EditItem[]) {
    setCache((prev) => {
      const cur = prev[activeSlot]
      if (!cur) return prev
      return { ...prev, [activeSlot]: { ...cur, items: updater(cur.items) } }
    })
  }

  // ── Photo compression + analysis ──────────────────────────────────────────

  function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const MAX = 1024
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX }
          else { width = Math.round((width * MAX) / height); height = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
          'image/jpeg', 0.8,
        )
      }
      img.onerror = reject
      img.src = url
    })
  }

  async function handleAddPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setIsPhotoAnalyzing(true)
    setError(null)
    try {
      const compressed = await compressImage(file)
      const fd = new FormData()
      fd.append('photo', compressed, 'photo.jpg')
      fd.append('meal_slot', activeSlot)
      const res = await fetch('/api/meals/analyze', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      const newItems: EditItem[] = (result.items as VisionMealItem[]).map((item) => ({
        ...item, source: 'ai' as const, _base: { ...item },
      }))
      updateItems((prev) => [...prev, ...newItems])
      if (result.ai_notes) {
        setCache((prev) => {
          const cur = prev[activeSlot]
          if (!cur || cur.aiNotes) return prev
          return { ...prev, [activeSlot]: { ...cur, aiNotes: result.ai_notes } }
        })
      }
      // If slot was empty (no loaded state yet), ensure it's marked loaded
      setCache((prev) => {
        const cur = prev[activeSlot]
        if (!cur || cur.status === 'loaded') return prev
        return { ...prev, [activeSlot]: { ...cur, status: 'loaded' } }
      })
    } catch {
      setError("couldn't analyze the photo. try again.")
    } finally {
      setIsPhotoAnalyzing(false)
    }
  }

  // ── Item handlers ─────────────────────────────────────────────────────────

  function handleQtyChange(idx: number, newQty: number) {
    updateItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        if (!newQty || item._base.quantity === 0) return { ...item, quantity: newQty }
        const r = newQty / item._base.quantity
        return {
          ...item,
          quantity:  newQty,
          calories:  Math.round(item._base.calories  * r),
          protein_g: Math.round(item._base.protein_g * r * 10) / 10,
          carbs_g:   Math.round(item._base.carbs_g   * r * 10) / 10,
          fat_g:     Math.round(item._base.fat_g     * r * 10) / 10,
          fiber_g:   Math.round(item._base.fiber_g   * r * 10) / 10,
          sodium_mg: Math.round(item._base.sodium_mg * r),
        }
      })
    )
  }

  function handleMacroChange(
    idx: number,
    field: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g',
    value: number,
  ) {
    updateItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function handleDeleteItem(idx: number) {
    updateItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleAddItem() {
    updateItems((prev) => [...prev, blankItem()])
  }

  function handleAddManually() {
    if (slotState?.status !== 'loaded') return
    updateItems((prev) => [...prev, blankItem()])
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (slotState?.status !== 'loaded') return
    setIsSaving(true)
    setError(null)
    try {
      const eaten_at = timeToISO(slotState.loggedAt, slotState.originalUTC ?? new Date().toISOString())
      const itemsPayload = slotState.items.map(({ _base: _b, ...rest }) => rest)

      if (slotState.mealId) {
        const res = await fetch(`/api/meals/${slotState.mealId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ meal_type: activeSlot, eaten_at, items: itemsPayload, ai_notes: slotState.aiNotes || null }),
        })
        if (!res.ok) throw new Error()
      } else {
        const res = await fetch('/api/meals/save', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ meal_slot: activeSlot, eaten_at, items: itemsPayload, ai_notes: slotState.aiNotes || null }),
        })
        if (!res.ok) throw new Error()
        const { meal_id } = await res.json()
        patchSlot({ mealId: meal_id })
      }
      router.push('/dashboard')
    } catch {
      setError("couldn't save changes")
      setIsSaving(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!slotState?.mealId) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/meals/${slotState.mealId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.push('/dashboard')
    } catch {
      setError("couldn't delete meal")
      setIsDeleting(false)
    }
  }

  // ── Totals ────────────────────────────────────────────────────────────────

  const activeItems = slotState?.status === 'loaded' ? slotState.items : []
  const totals = activeItems.reduce(
    (acc, item) => ({
      calories:  acc.calories  + (item.calories  || 0),
      protein_g: acc.protein_g + (item.protein_g || 0),
      carbs_g:   acc.carbs_g   + (item.carbs_g   || 0),
      fat_g:     acc.fat_g     + (item.fat_g      || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen px-4 pt-6 pb-8" style={{ backgroundColor: '#F5F1E8' }}>

      {/* Header */}
      <div className="flex items-center mb-6">
        <button
          onClick={() => router.back()}
          style={{ color: '#0F1B2D', lineHeight: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginRight: 12 }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 22 }} />
        </button>
        <p style={{ fontSize: 17, fontWeight: 500, color: '#0F1B2D', flex: 1 }}>today</p>
        <button
          onClick={handleDelete}
          disabled={busy || !slotState?.mealId}
          style={{
            background: 'none', border: 'none',
            cursor: busy || !slotState?.mealId ? 'not-allowed' : 'pointer',
            color: slotState?.mealId ? '#DC2626' : '#D1D5DB',
            padding: '0 0 0 8px', lineHeight: 1,
          }}
        >
          {isDeleting
            ? <span style={{ fontSize: 12, color: '#DC2626' }}>deleting…</span>
            : <i className="ti ti-trash" style={{ fontSize: 18 }} />
          }
        </button>
      </div>

      {/* Slot tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5" style={{ scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'] }}>
        {MEAL_SLOTS.map((slot) => {
          const active = activeSlot === slot.key
          return (
            <button
              key={slot.key}
              onClick={() => { setActiveSlot(slot.key); setError(null) }}
              disabled={busy}
              className="flex-shrink-0 px-4 py-2 text-sm"
              style={{
                borderRadius: 999,
                fontWeight: active ? 500 : 400,
                backgroundColor: active ? slot.color : '#fff',
                color: active ? '#fff' : '#6B7280',
                border: 'none',
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              {slot.label}
            </button>
          )
        })}
      </div>

      {/* Content area */}
      {(() => {
        if (!slotState || slotState.status === 'loading') {
          return (
            <div className="flex justify-center pt-10">
              <Spinner />
            </div>
          )
        }

        if (slotState.status === 'error') {
          return (
            <p style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 40 }}>
              couldn't load {slotConfig.label.toLowerCase()}
            </p>
          )
        }

        const { items, mealId, loggedAt, aiNotes } = slotState

        if (items.length === 0) {
          return (
            <div className="flex flex-col items-center pt-12 gap-4">
              <p style={{ fontSize: 14, color: '#6B7280' }}>
                nothing logged for {slotConfig.label.toLowerCase()}
              </p>
              <button
                onClick={() => addPhotoRef.current?.click()}
                disabled={isPhotoAnalyzing}
                className="flex items-center justify-center gap-2"
                style={{
                  backgroundColor: '#D4F542', color: '#0F1B2D', borderRadius: 14,
                  padding: '12px 24px', fontSize: 13, fontWeight: 500, border: 'none',
                  cursor: isPhotoAnalyzing ? 'not-allowed' : 'pointer',
                }}
              >
                {isPhotoAnalyzing
                  ? <><Spinner /><span style={{ marginLeft: 6 }}>analyzing…</span></>
                  : <><i className="ti ti-camera" style={{ fontSize: 16 }} /><span style={{ marginLeft: 4 }}>snap a meal</span></>
                }
              </button>
              <button
                onClick={handleAddManually}
                style={{ fontSize: 13, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                add manually
              </button>
              {error && <p style={{ fontSize: 13, color: '#DC2626' }}>{error}</p>}
            </div>
          )
        }

        return (
          <>
            {/* Time picker */}
            <div
              className="flex items-center justify-between mb-4"
              style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 16px' }}
            >
              <div className="flex items-center gap-2">
                <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: slotConfig.color, flexShrink: 0 }} />
                <p style={{ fontSize: 14, color: '#0F1B2D', fontWeight: 500 }}>{slotConfig.label}</p>
              </div>
              <div className="flex items-center gap-2">
                <p style={{ fontSize: 13, color: '#6B7280' }}>logged at</p>
                <input
                  type="time"
                  value={loggedAt}
                  onChange={(e) => patchSlot({ loggedAt: e.target.value })}
                  disabled={busy}
                  style={{ fontSize: 13, color: '#0F1B2D', border: 'none', background: 'transparent', fontWeight: 500, outline: 'none' }}
                />
              </div>
            </div>

            {/* Items list */}
            <div className="flex flex-col gap-2 mb-3">
              {items.map((item, idx) => (
                <div key={idx} style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 14px' }}>
                  <div className="flex items-center justify-between mb-2">
                    <input
                      value={item.item_name}
                      onChange={(e) => updateItems((prev) => prev.map((it, i) => i === idx ? { ...it, item_name: e.target.value } : it))}
                      placeholder="Item name"
                      disabled={busy}
                      style={{ fontSize: 14, fontWeight: 500, color: '#0F1B2D', border: 'none', outline: 'none', background: 'transparent', flex: 1 }}
                    />
                    <button
                      onClick={() => handleDeleteItem(idx)}
                      disabled={busy}
                      style={{ background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: '0 0 0 8px', lineHeight: 1 }}
                    >
                      <i className="ti ti-trash" style={{ fontSize: 16, color: '#DC2626' }} />
                    </button>
                  </div>

                  {/* Qty + unit + cal */}
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="number"
                      value={item.quantity}
                      min={0}
                      step="any"
                      onChange={(e) => handleQtyChange(idx, parseFloat(e.target.value) || 0)}
                      disabled={busy}
                      style={{ width: 64, fontSize: 13, color: '#0F1B2D', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 8px', outline: 'none', MozAppearance: 'textfield' }}
                    />
                    <select
                      value={item.unit}
                      disabled={busy}
                      onChange={(e) => updateItems((prev) => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                      style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 6px', outline: 'none', backgroundColor: '#fff' }}
                    >
                      {(UNIT_OPTIONS.includes(item.unit as typeof UNIT_OPTIONS[number])
                        ? UNIT_OPTIONS
                        : [item.unit, ...UNIT_OPTIONS]
                      ).map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <input
                      type="number"
                      value={item.calories}
                      min={0}
                      step="any"
                      disabled={busy}
                      onChange={(e) => handleMacroChange(idx, 'calories', parseFloat(e.target.value) || 0)}
                      style={{ width: 60, fontSize: 13, textAlign: 'right', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 6px', outline: 'none', MozAppearance: 'textfield' }}
                    />
                    <p style={{ fontSize: 13, color: '#6B7280' }}>kcal</p>
                  </div>

                  {/* P / C / F */}
                  <div className="flex items-center gap-2 mb-1">
                    {(['protein_g', 'carbs_g', 'fat_g'] as const).map((field) => (
                      <div key={field} className="flex items-center gap-1">
                        <p style={{ fontSize: 11, color: '#6B7280' }}>{field === 'protein_g' ? 'P' : field === 'carbs_g' ? 'C' : 'F'}</p>
                        <input
                          type="number"
                          value={item[field]}
                          min={0}
                          step="any"
                          disabled={busy}
                          onChange={(e) => handleMacroChange(idx, field, parseFloat(e.target.value) || 0)}
                          style={{ width: 52, fontSize: 13, textAlign: 'right', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 6px', outline: 'none', MozAppearance: 'textfield' }}
                        />
                      </div>
                    ))}
                    <p style={{ fontSize: 11, color: '#6B7280' }}>g</p>
                  </div>

                  {/* Fiber */}
                  <div className="flex items-center gap-1">
                    <p style={{ fontSize: 11, color: '#9CA3AF' }}>fiber</p>
                    <input
                      type="number"
                      value={item.fiber_g}
                      min={0}
                      step="any"
                      disabled={busy}
                      onChange={(e) => handleMacroChange(idx, 'fiber_g', parseFloat(e.target.value) || 0)}
                      style={{ width: 52, fontSize: 13, textAlign: 'right', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 6px', outline: 'none', MozAppearance: 'textfield' }}
                    />
                    <p style={{ fontSize: 11, color: '#9CA3AF' }}>g</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add item / add photo row */}
            <div className="flex items-center gap-4" style={{ marginBottom: 12 }}>
              <button
                onClick={handleAddItem}
                disabled={busy}
                style={{ fontSize: 13, color: '#6B7280', background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: '4px 0' }}
              >
                + add item
              </button>
              <button
                onClick={() => addPhotoRef.current?.click()}
                disabled={busy || isPhotoAnalyzing}
                className="flex items-center gap-1"
                style={{ fontSize: 13, color: '#6B7280', background: 'none', border: 'none', cursor: busy || isPhotoAnalyzing ? 'not-allowed' : 'pointer', padding: '4px 0' }}
              >
                {isPhotoAnalyzing
                  ? <><Spinner /><span style={{ marginLeft: 4 }}>analyzing…</span></>
                  : <><i className="ti ti-camera" style={{ fontSize: 15 }} /><span style={{ marginLeft: 2 }}>add photo</span></>
                }
              </button>
            </div>

            {/* Totals bar */}
            <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
              <p style={{ fontSize: 13, color: '#6B7280' }}>
                {Math.round(totals.calories)} kcal
                {' · '}P {Math.round(totals.protein_g * 10) / 10}g
                {' · '}C {Math.round(totals.carbs_g   * 10) / 10}g
                {' · '}F {Math.round(totals.fat_g     * 10) / 10}g
              </p>
            </div>

            {/* AI notes */}
            {aiNotes && (
              <p className="mb-4" style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic' }}>
                AI note: {aiNotes}
              </p>
            )}

            {/* Error */}
            {error && <p className="text-sm mb-3" style={{ color: '#DC2626' }}>{error}</p>}

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={busy || items.length === 0}
              className="flex items-center justify-center gap-2 w-full"
              style={{
                backgroundColor: busy || items.length === 0 ? '#E5E7EB' : '#D4F542',
                color:            busy || items.length === 0 ? '#9CA3AF' : '#0F1B2D',
                borderRadius: 14, padding: '13px 0', fontSize: 13, fontWeight: 500,
                border: 'none', cursor: busy || items.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {isSaving ? <><Spinner /> saving…</> : 'save changes'}
            </button>

            {/* Unused mealId ref — kept for save logic clarity */}
            {mealId && null}
          </>
        )
      })()}

      {/* Hidden file input — shared between empty-state CTA and filled-state add photo */}
      <input
        ref={addPhotoRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleAddPhoto}
      />

    </div>
  )
}

// ─── Page (Suspense wrapper for useSearchParams) ───────────────────────────────

export default function TodayPage() {
  return (
    <Suspense fallback={<div style={{ backgroundColor: '#F5F1E8', minHeight: '100vh' }} />}>
      <TodayContent />
    </Suspense>
  )
}
