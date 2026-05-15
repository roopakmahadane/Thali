'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { MEAL_SLOTS, type MealSlotKey } from '@/lib/config/meals'
import type { VisionMealItem } from '@/lib/vision'
import type { FrequentFood } from '@/lib/types'

type MacrosPerUnit = {
  calories_per_unit:  number
  protein_g_per_unit: number
  carbs_g_per_unit:   number
  fat_g_per_unit:     number
  fiber_g_per_unit:   number
  sodium_mg_per_unit: number
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EditItem = VisionMealItem & { source: 'ai' | 'manual'; _base: VisionMealItem }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IST_MS = (5 * 60 + 30) * 60 * 1000

function currentTimeIST(): string {
  const ist = new Date(Date.now() + IST_MS)
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`
}

function getTimeBasedSlot(): MealSlotKey {
  const istHour = new Date(Date.now() + IST_MS).getUTCHours()
  return MEAL_SLOTS.reduce((best, slot) =>
    Math.abs(slot.defaultHour - istHour) < Math.abs(best.defaultHour - istHour) ? slot : best
  ).key
}

function timeToISO(timeStr: string): string {
  const nowIST = new Date(Date.now() + IST_MS)
  const [h, m] = timeStr.split(':').map(Number)
  const istDt = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate(), h, m, 0))
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

function NewMealContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const slotParam = searchParams.get('slot') as MealSlotKey | null
  const defaultSlot: MealSlotKey =
    slotParam && MEAL_SLOTS.some((s) => s.key === slotParam) ? slotParam : getTimeBasedSlot()

  const [step, setStep] = useState<'capture' | 'edit'>('capture')
  const [entryMode, setEntryMode] = useState<'photo' | 'manual'>('photo')
  const [selectedSlot, setSelectedSlot] = useState<MealSlotKey>(defaultSlot)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [items, setItems] = useState<EditItem[]>([])
  const [aiNotes, setAiNotes] = useState('')
  const [loggedAt, setLoggedAt] = useState(currentTimeIST)
  const [dishHint, setDishHint] = useState('')
  const [quickFoods, setQuickFoods] = useState<FrequentFood[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/frequent-foods')
      .then((r) => r.json())
      .then((d) => setQuickFoods(d.foods ?? []))
      .catch(() => {})
  }, [])

  // ── File selection ────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError(null)
  }

  // ── Analyze ───────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    if (!photoFile) return
    setIsAnalyzing(true)
    setError(null)

    const fd = new FormData()
    fd.append('photo', photoFile)
    fd.append('meal_slot', selectedSlot)
    if (dishHint.trim()) fd.append('dish_hint', dishHint.trim())

    try {
      const res = await fetch('/api/meals/analyze', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      const editItems: EditItem[] = result.items.map((item: VisionMealItem) => ({
        ...item,
        source: 'ai' as const,
        _base: { ...item },
      }))
      setItems(editItems)
      setAiNotes(result.ai_notes ?? '')
      setStep('edit')
    } catch {
      setError("Couldn't analyze the photo. Try again.")
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ── Manual entry ─────────────────────────────────────────────────────────

  function handleManualEntry() {
    setEntryMode('manual')
    setItems([])
    setAiNotes('')
    setStep('edit')
  }

  // ── Quick add from frequent foods ─────────────────────────────────────────

  function handleQuickAdd(food: FrequentFood) {
    const macros = food.macros_per_unit_json as MacrosPerUnit | null
    if (!macros || !food.typical_quantity) return
    const qty = food.typical_quantity
    const base: VisionMealItem = {
      item_name:  food.name,
      quantity:   qty,
      unit:       food.typical_unit ?? 'g',
      calories:   Math.round(macros.calories_per_unit  * qty),
      protein_g:  Math.round(macros.protein_g_per_unit * qty * 10) / 10,
      carbs_g:    Math.round(macros.carbs_g_per_unit   * qty * 10) / 10,
      fat_g:      Math.round(macros.fat_g_per_unit     * qty * 10) / 10,
      fiber_g:    Math.round(macros.fiber_g_per_unit   * qty * 10) / 10,
      sodium_mg:  Math.round(macros.sodium_mg_per_unit * qty),
      confidence: 'high',
    }
    setItems([{ ...base, source: 'manual', _base: base }])
    setEntryMode('manual')
    setAiNotes('')
    setStep('edit')
  }

  // ── Quantity change ───────────────────────────────────────────────────────

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

    const payload = {
      meal_slot: selectedSlot,
      eaten_at:  timeToISO(loggedAt),
      // Strip _base before sending
      items: items.map(({ _base: _b, ...rest }) => rest),
      ai_notes: aiNotes || null,
    }

    try {
      const res = await fetch('/api/meals/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      router.push('/dashboard')
    } catch {
      setError('Failed to save. Please try again.')
      setIsSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1 — Capture
  // ─────────────────────────────────────────────────────────────────────────

  if (step === 'capture') {
    return (
      <div className="min-h-screen px-4 pt-6 pb-8" style={{ backgroundColor: '#F5F1E8' }}>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" style={{ color: '#0F1B2D', lineHeight: 1 }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 22 }} />
          </Link>
          <p style={{ fontSize: 17, fontWeight: 500, color: '#0F1B2D' }}>add meal</p>
        </div>

        {/* Slot picker */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5" style={{ scrollbarWidth: 'none' }}>
          {MEAL_SLOTS.map((slot) => {
            const active = selectedSlot === slot.key
            return (
              <button
                key={slot.key}
                onClick={() => setSelectedSlot(slot.key)}
                className="flex-shrink-0 px-4 py-2 text-sm"
                style={{
                  borderRadius: 999,
                  fontWeight: active ? 500 : 400,
                  backgroundColor: active ? slot.color : '#fff',
                  color: active ? '#fff' : '#6B7280',
                  border: active ? 'none' : `none`,
                  borderLeft: active ? 'none' : `3px solid ${slot.color}`,
                }}
              >
                {slot.label}
              </button>
            )
          })}
        </div>

        {/* Photo area */}
        <div
          className="relative w-full flex items-center justify-center cursor-pointer mb-5"
          style={{
            borderRadius: 20,
            minHeight: 240,
            overflow: 'hidden',
            border: photoPreview ? 'none' : '1.5px dashed #E5E7EB',
            backgroundColor: photoPreview ? 'transparent' : '#F5F1E8',
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          {photoPreview ? (
            <img
              src={photoPreview}
              alt="Meal preview"
              style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', inset: 0, borderRadius: 20, backgroundColor: '#F5F1E8' }}
            />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <i className="ti ti-camera" style={{ fontSize: 32, color: '#6B7280' }} />
              <p style={{ fontSize: 13, color: '#6B7280' }}>tap to add photo</p>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Dish hint */}
        <input
          type="text"
          value={dishHint}
          onChange={(e) => setDishHint(e.target.value)}
          placeholder="What are you eating? (optional)"
          style={{
            width: '100%',
            backgroundColor: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 14,
            color: '#0F1B2D',
            outline: 'none',
            marginBottom: 12,
          }}
        />

        {/* Error */}
        {error && <p className="text-sm mb-3" style={{ color: '#DC2626' }}>{error}</p>}

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={!photoFile || isAnalyzing}
          className="flex items-center justify-center gap-2 w-full"
          style={{
            backgroundColor: photoFile && !isAnalyzing ? '#D4F542' : '#E5E7EB',
            color: photoFile && !isAnalyzing ? '#0F1B2D' : '#9CA3AF',
            borderRadius: 14,
            padding: '13px 0',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {isAnalyzing ? (
            <>
              <Spinner />
              analyzing…
            </>
          ) : (
            'analyze meal'
          )}
        </button>

        {/* Manual entry */}
        <button
          onClick={handleManualEntry}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'center',
            fontSize: 13,
            color: '#6B7280',
            textDecoration: 'underline',
            marginTop: 12,
            padding: '4px 0',
          }}
        >
          or add without photo
        </button>

        {/* Quick add chips */}
        {quickFoods.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              quick add
            </p>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {quickFoods.map((food) => (
                <button
                  key={food.id}
                  onClick={() => handleQuickAdd(food)}
                  style={{
                    flexShrink: 0,
                    backgroundColor: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: 20,
                    padding: '6px 12px',
                    fontSize: 13,
                    color: '#0F1B2D',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {food.name}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — Edit
  // ─────────────────────────────────────────────────────────────────────────

  const slotConfig = MEAL_SLOTS.find((s) => s.key === selectedSlot)

  return (
    <div className="min-h-screen px-4 pt-6 pb-8" style={{ backgroundColor: '#F5F1E8' }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setStep('capture')} style={{ color: '#0F1B2D', lineHeight: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22 }} />
        </button>
        <p style={{ fontSize: 17, fontWeight: 500, color: '#0F1B2D' }}>review meal</p>
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
            {/* Item name */}
            <div className="flex items-center justify-between mb-2">
              <input
                value={item.item_name}
                onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, item_name: e.target.value } : it))}
                placeholder="Item name"
                style={{ fontSize: 14, fontWeight: 500, color: '#0F1B2D', border: 'none', outline: 'none', background: 'transparent', flex: 1 }}
              />
              <button
                onClick={() => handleDeleteItem(idx)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1 }}
              >
                <i className="ti ti-trash" style={{ fontSize: 16, color: '#DC2626' }} />
              </button>
            </div>

            {/* Qty + calories row */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={item.quantity}
                min={0}
                step="any"
                onChange={(e) => handleQtyChange(idx, parseFloat(e.target.value) || 0)}
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
              <p style={{ fontSize: 13, color: '#6B7280', flex: 1 }}>{item.unit}</p>
              <p style={{ fontSize: 13, color: '#6B7280' }}>{item.calories} kcal</p>
            </div>

            {/* Confidence badge */}
            {item.confidence === 'low' && (
              <span
                className="inline-block mt-2"
                style={{
                  fontSize: 11,
                  color: '#F59E0B',
                  backgroundColor: '#FEF3C7',
                  borderRadius: 999,
                  padding: '2px 8px',
                }}
              >
                uncertain
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Add item */}
      <button
        onClick={handleAddItem}
        style={{ fontSize: 13, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 12 }}
      >
        + add item
      </button>

      {/* Totals bar */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
        <p style={{ fontSize: 13, color: '#6B7280' }}>
          {Math.round(totals.calories)} kcal
          {' · '}P {Math.round(totals.protein_g * 10) / 10}g
          {' · '}C {Math.round(totals.carbs_g * 10) / 10}g
          {' · '}F {Math.round(totals.fat_g * 10) / 10}g
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
        disabled={isSaving || items.length === 0}
        className="flex items-center justify-center gap-2 w-full"
        style={{
          backgroundColor: isSaving || items.length === 0 ? '#E5E7EB' : '#D4F542',
          color: isSaving || items.length === 0 ? '#9CA3AF' : '#0F1B2D',
          borderRadius: 14,
          padding: '13px 0',
          fontSize: 13,
          fontWeight: 500,
          border: 'none',
          cursor: isSaving || items.length === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        {isSaving ? (
          <>
            <Spinner />
            saving…
          </>
        ) : (
          'save meal'
        )}
      </button>

    </div>
  )
}

// ─── Page (Suspense wrapper for useSearchParams) ───────────────────────────

export default function NewMealPage() {
  return (
    <Suspense fallback={<div style={{ backgroundColor: '#F5F1E8', minHeight: '100vh' }} />}>
      <NewMealContent />
    </Suspense>
  )
}
