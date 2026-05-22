'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MEAL_SLOTS, type MealSlotKey } from '@/lib/config/meals'
import type { VisionMealItem } from '@/lib/vision'

const UNIT_OPTIONS = ['piece', 'g', 'ml', 'cup', 'bowl', 'tbsp', 'tsp', 'slice'] as const

// ─── Types ────────────────────────────────────────────────────────────────────

type EditItem = VisionMealItem & { source: 'ai' | 'manual'; _base: VisionMealItem }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IST_MS = (5 * 60 + 30) * 60 * 1000

function utcToISTTimeStr(utcTs: string): string {
  const ist = new Date(new Date(utcTs).getTime() + IST_MS)
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`
}

// Converts HH:MM (IST) back to UTC ISO, preserving the original IST calendar date
function timeToISO(timeStr: string, referenceUTC: string): string {
  const ist = new Date(new Date(referenceUTC).getTime() + IST_MS)
  const [h, m] = timeStr.split(':').map(Number)
  const istDt = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), h, m, 0))
  return new Date(istDt.getTime() - IST_MS).toISOString()
}

function blankItem(): EditItem {
  const base: VisionMealItem = { item_name: '', quantity: 1, unit: 'g', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0, confidence: 'high' }
  return { ...base, source: 'manual', _base: base }
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

function EditMealContent() {
  const params    = useParams()
  const router    = useRouter()
  const id        = params.id as string

  const addPhotoRef = useRef<HTMLInputElement>(null)

  const [loading,          setLoading]          = useState(true)
  const [fetchError,       setFetchError]        = useState(false)
  const [originalUTC,      setOriginalUTC]       = useState('')  // original eaten_at for date anchoring
  const [items,            setItems]             = useState<EditItem[]>([])
  const [selectedSlot,     setSelectedSlot]      = useState<MealSlotKey>('breakfast')
  const [loggedAt,         setLoggedAt]          = useState('')
  const [aiNotes,          setAiNotes]           = useState('')
  const [isSaving,         setIsSaving]          = useState(false)
  const [isDeleting,       setIsDeleting]        = useState(false)
  const [isPhotoAnalyzing, setIsPhotoAnalyzing]  = useState(false)
  const [error,            setError]             = useState<string | null>(null)

  useEffect(() => {
    async function fetchMeal() {
      try {
        const res = await fetch(`/api/meals/${id}`)
        if (!res.ok) throw new Error()
        const { meal, items: fetchedItems } = await res.json()

        const editItems: EditItem[] = (fetchedItems ?? []).map((item: {
          item_name: string; quantity: number; unit: string
          calories: number; protein_g: number; carbs_g: number
          fat_g: number; fiber_g: number; sodium_mg: number; source: string
        }) => {
          const base: VisionMealItem = {
            item_name: item.item_name,
            quantity:  Number(item.quantity),
            unit:      item.unit,
            calories:  item.calories,
            protein_g: Number(item.protein_g),
            carbs_g:   Number(item.carbs_g),
            fat_g:     Number(item.fat_g),
            fiber_g:   Number(item.fiber_g),
            sodium_mg: Number(item.sodium_mg),
            confidence: 'high',
          }
          return { ...base, source: (item.source as 'ai' | 'manual') ?? 'manual', _base: base }
        })

        setItems(editItems)
        setSelectedSlot(meal.meal_type as MealSlotKey)
        setOriginalUTC(meal.eaten_at)
        setLoggedAt(utcToISTTimeStr(meal.eaten_at))
        setAiNotes(meal.ai_notes ?? '')
      } catch {
        setFetchError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchMeal()
  }, [id])

  // ── Add photo (append items from new photo) ───────────────────────────────

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
    // Reset input so the same file can be selected again if needed
    e.target.value = ''
    setIsPhotoAnalyzing(true)
    setError(null)
    try {
      const compressed = await compressImage(file)
      const fd = new FormData()
      fd.append('photo', compressed, 'photo.jpg')
      fd.append('meal_slot', selectedSlot)
      const res = await fetch('/api/meals/analyze', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      const newItems: EditItem[] = (result.items as VisionMealItem[]).map((item) => ({
        ...item,
        source: 'ai' as const,
        _base: { ...item },
      }))
      setItems((prev) => [...prev, ...newItems])
      if (!aiNotes && result.ai_notes) setAiNotes(result.ai_notes)
    } catch {
      setError("Couldn't analyze the photo. Try again.")
    } finally {
      setIsPhotoAnalyzing(false)
    }
  }

  // ── Quantity / item handlers ──────────────────────────────────────────────

  function handleQtyChange(idx: number, newQty: number) {
    setItems((prev) =>
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

  function handleDeleteItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleMacroChange(
    idx: number,
    field: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g',
    value: number,
  ) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function handleAddItem() {
    setItems((prev) => [...prev, blankItem()])
  }

  // ── Live totals ───────────────────────────────────────────────────────────

  const totals = items.reduce(
    (acc, item) => ({
      calories:  acc.calories  + (item.calories  || 0),
      protein_g: acc.protein_g + (item.protein_g || 0),
      carbs_g:   acc.carbs_g  + (item.carbs_g   || 0),
      fat_g:     acc.fat_g    + (item.fat_g      || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/meals/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          meal_type: selectedSlot,
          eaten_at:  timeToISO(loggedAt, originalUTC),
          items:     items.map(({ _base: _b, ...rest }) => rest),
          ai_notes:  aiNotes || null,
        }),
      })
      if (!res.ok) throw new Error()
      router.push('/dashboard')
    } catch {
      setError("couldn't save changes")
      setIsSaving(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/meals/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.push('/dashboard')
    } catch {
      setError("couldn't delete meal")
      setIsDeleting(false)
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F1E8' }}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>loading…</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F5F1E8' }}>
        <div className="text-center">
          <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 12 }}>couldn't load meal.</p>
          <button
            onClick={() => router.back()}
            style={{ fontSize: 13, color: '#D4F542', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            go back
          </button>
        </div>
      </div>
    )
  }

  const slotConfig = MEAL_SLOTS.find((s) => s.key === selectedSlot)
  const busy       = isSaving || isDeleting

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
        <p style={{ fontSize: 17, fontWeight: 500, color: '#0F1B2D', flex: 1 }}>edit meal</p>
        <button
          onClick={handleDelete}
          disabled={busy}
          style={{ background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', color: '#DC2626', padding: '0 0 0 8px', lineHeight: 1 }}
        >
          {isDeleting
            ? <span style={{ fontSize: 12, color: '#DC2626' }}>deleting…</span>
            : <i className="ti ti-trash" style={{ fontSize: 18 }} />
          }
        </button>
      </div>

      {/* Slot picker — reassigns this meal to a different type, does not navigate */}
      <div
        className="flex items-center justify-between mb-4"
        style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 16px' }}
      >
        <p style={{ fontSize: 13, color: '#6B7280' }}>meal slot</p>
        <div className="flex items-center gap-2">
          <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: slotConfig?.color ?? '#6B7280', flexShrink: 0 }} />
          <select
            value={selectedSlot}
            onChange={(e) => setSelectedSlot(e.target.value as MealSlotKey)}
            disabled={busy}
            style={{
              fontSize: 13,
              color: '#0F1B2D',
              border: 'none',
              background: 'transparent',
              fontWeight: 500,
              outline: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {MEAL_SLOTS.map((slot) => (
              <option key={slot.key} value={slot.key}>{slot.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Time picker */}
      <div
        className="flex items-center justify-between mb-4"
        style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 16px' }}
      >
        <div className="flex items-center gap-2">
          <div
            style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: slotConfig?.color ?? '#6B7280', flexShrink: 0 }}
          />
          <p style={{ fontSize: 14, color: '#0F1B2D', fontWeight: 500 }}>{slotConfig?.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <p style={{ fontSize: 13, color: '#6B7280' }}>logged at</p>
          <input
            type="time"
            value={loggedAt}
            onChange={(e) => setLoggedAt(e.target.value)}
            disabled={busy}
            style={{
              fontSize: 13,
              color: '#0F1B2D',
              border: 'none',
              background: 'transparent',
              fontWeight: 500,
              outline: 'none',
            }}
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
                onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, item_name: e.target.value } : it))}
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
                style={{
                  width: 64,
                  fontSize: 13,
                  color: '#0F1B2D',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  padding: '4px 8px',
                  outline: 'none',
                  MozAppearance: 'textfield',
                }}
              />
              <select
                value={item.unit}
                disabled={busy}
                onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  color: '#6B7280',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  padding: '4px 6px',
                  outline: 'none',
                  backgroundColor: '#fff',
                }}
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
                style={{
                  width: 60,
                  fontSize: 13,
                  textAlign: 'right',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  padding: '4px 6px',
                  outline: 'none',
                  MozAppearance: 'textfield',
                }}
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
                    style={{
                      width: 52,
                      fontSize: 13,
                      textAlign: 'right',
                      border: '1px solid #E5E7EB',
                      borderRadius: 8,
                      padding: '4px 6px',
                      outline: 'none',
                      MozAppearance: 'textfield',
                    }}
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
                style={{
                  width: 52,
                  fontSize: 13,
                  textAlign: 'right',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  padding: '4px 6px',
                  outline: 'none',
                  MozAppearance: 'textfield',
                }}
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
          {isPhotoAnalyzing ? (
            <>
              <Spinner />
              <span style={{ marginLeft: 4 }}>analyzing…</span>
            </>
          ) : (
            <>
              <i className="ti ti-camera" style={{ fontSize: 15 }} />
              <span style={{ marginLeft: 2 }}>add photo</span>
            </>
          )}
        </button>
      </div>
      <input
        ref={addPhotoRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleAddPhoto}
      />

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

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={busy || items.length === 0}
        className="flex items-center justify-center gap-2 w-full"
        style={{
          backgroundColor: busy || items.length === 0 ? '#E5E7EB' : '#D4F542',
          color:            busy || items.length === 0 ? '#9CA3AF' : '#0F1B2D',
          borderRadius: 14,
          padding: '13px 0',
          fontSize: 13,
          fontWeight: 500,
          border: 'none',
          cursor: busy || items.length === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        {isSaving ? (
          <>
            <Spinner />
            saving…
          </>
        ) : (
          'save changes'
        )}
      </button>

    </div>
  )
}

// ─── Page (Suspense wrapper for useParams) ────────────────────────────────────

export default function EditMealPage() {
  return (
    <Suspense fallback={<div style={{ backgroundColor: '#F5F1E8', minHeight: '100vh' }} />}>
      <EditMealContent />
    </Suspense>
  )
}
