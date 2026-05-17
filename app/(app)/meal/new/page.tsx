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

const UNIT_OPTIONS = ['piece', 'g', 'ml', 'cup', 'bowl', 'tbsp', 'tsp', 'slice'] as const

// ─── Types ────────────────────────────────────────────────────────────────────

type EditItem = VisionMealItem & { source: 'ai' | 'manual'; _base: VisionMealItem; _fromBarcode?: boolean }

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

function parseServingGrams(s: string): number {
  const m = s.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : 100
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const codeReaderRef = useRef<{ reset(): void } | null>(null)

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
  const [isScanning, setIsScanning] = useState(false)
  const [isFetchingProduct, setIsFetchingProduct] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [textDescription, setTextDescription] = useState('')
  const [isTextAnalyzing, setIsTextAnalyzing] = useState(false)

  useEffect(() => {
    fetch('/api/frequent-foods')
      .then((r) => r.json())
      .then((d) => setQuickFoods(d.foods ?? []))
      .catch(() => {})
  }, [])

  // ZXing scanning effect — runs when scanning overlay opens
  useEffect(() => {
    if (!isScanning || !videoRef.current) return
    let active = true
    ;(async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const codeReader = new BrowserMultiFormatReader()
        // controls.stop() releases the camera stream
        let scanControls: { stop(): void } | null = null
        scanControls = await codeReader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (!active || !result) return
          const barcode = result.getText()
          scanControls?.stop()
          setIsScanning(false)
          handleBarcodeFetched(barcode)
        })
        codeReaderRef.current = { reset: () => scanControls?.stop() }
      } catch {
        if (active) {
          setScanError("Couldn't access camera")
          setIsScanning(false)
        }
      }
    })()
    return () => {
      active = false
      codeReaderRef.current?.reset()
    }
  }, [isScanning])

  // ── File selection ────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError(null)
  }

  // ── Image compression ────────────────────────────────────────────────────

  function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const MAX = 1024
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width > height) {
            height = Math.round((height * MAX) / width)
            width = MAX
          } else {
            width = Math.round((width * MAX) / height)
            height = MAX
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('canvas toBlob failed'))),
          'image/jpeg',
          0.8,
        )
      }
      img.onerror = reject
      img.src = url
    })
  }

  // ── Analyze ───────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    if (!photoFile) return
    setIsAnalyzing(true)
    setError(null)

    const compressed = await compressImage(photoFile)
    const fd = new FormData()
    fd.append('photo', compressed, 'photo.jpg')
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

  // ── Text-based AI analysis ────────────────────────────────────────────────

  async function handleTextAnalyze() {
    if (!textDescription.trim()) return
    setIsTextAnalyzing(true)
    setError(null)
    try {
      const res = await fetch('/api/meals/text-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: textDescription.trim(),
          meal_slot: selectedSlot,
          ...(dishHint.trim() ? { dish_hint: dishHint.trim() } : {}),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      const editItems: EditItem[] = result.items.map((item: VisionMealItem) => ({
        ...item,
        source: 'ai' as const,
        _base: { ...item },
      }))
      setItems(editItems)
      setAiNotes(result.ai_notes ?? '')
    } catch {
      setError("Couldn't analyze the description. Try again.")
    } finally {
      setIsTextAnalyzing(false)
    }
  }

  // ── Direct macro edit (no proportional recompute) ─────────────────────────

  function handleMacroChange(
    idx: number,
    field: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g',
    value: number,
  ) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  // ── Barcode scanning ──────────────────────────────────────────────────────

  function handleStopScan() {
    codeReaderRef.current?.reset()
    codeReaderRef.current = null
    setIsScanning(false)
  }

  async function handleBarcodeFetched(barcode: string) {
    setIsFetchingProduct(true)
    setScanError(null)
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
      const data = await res.json()
      if (data.status === 0 || !data.product) {
        setScanError('Product not found. Enter manually.')
        return
      }
      const p = data.product
      const n = p.nutriments ?? {}
      const servingG = p.serving_size ? parseServingGrams(String(p.serving_size)) : 100
      const f = servingG / 100
      const base: VisionMealItem = {
        item_name:  p.product_name ?? 'Unknown product',
        quantity:   servingG,
        unit:       'g',
        calories:   Math.round((n['energy-kcal_100g'] ?? 0) * f),
        protein_g:  Math.round((n.protein_100g        ?? 0) * f * 10) / 10,
        carbs_g:    Math.round((n.carbohydrates_100g  ?? 0) * f * 10) / 10,
        fat_g:      Math.round((n.fat_100g            ?? 0) * f * 10) / 10,
        fiber_g:    Math.round((n.fiber_100g          ?? 0) * f * 10) / 10,
        sodium_mg:  Math.round((n.sodium_100g         ?? 0) * f * 1000),
        confidence: 'high',
      }
      setItems([{ ...base, source: 'manual', _base: base, _fromBarcode: true }])
      setEntryMode('manual')
      setAiNotes('')
      setStep('edit')
    } catch {
      setScanError("Couldn't fetch product. Try again.")
    } finally {
      setIsFetchingProduct(false)
    }
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
      items: items.map(({ _base: _b, _fromBarcode: _fb, ...rest }) => rest),
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
  // Overlays (fixed, rendered on top regardless of step)
  // ─────────────────────────────────────────────────────────────────────────

  const overlays = (
    <>
      {isScanning && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)',
            zIndex: 50, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <video
            ref={videoRef}
            style={{
              width: '100%', maxWidth: 400, borderRadius: 12,
              backgroundColor: '#000', aspectRatio: '4/3', objectFit: 'cover',
            }}
            muted
            playsInline
          />
          <p style={{ color: '#9CA3AF', fontSize: 14, marginTop: 16 }}>Point at a barcode</p>
          <button
            onClick={handleStopScan}
            style={{
              marginTop: 20, color: '#fff', fontSize: 14, background: 'none',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10,
              padding: '10px 24px', cursor: 'pointer',
            }}
          >
            cancel
          </button>
        </div>
      )}
      {isFetchingProduct && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, textAlign: 'center' }}>
            <Spinner />
            <p style={{ marginTop: 12, fontSize: 14, color: '#0F1B2D' }}>looking up product…</p>
          </div>
        </div>
      )}
    </>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1 — Capture
  // ─────────────────────────────────────────────────────────────────────────

  if (step === 'capture') {
    return (
      <>
        {overlays}
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

          {/* Barcode scan */}
          {scanError && (
            <p style={{ fontSize: 13, color: '#DC2626', marginTop: 10, textAlign: 'center' }}>{scanError}</p>
          )}
          <button
            onClick={() => { setScanError(null); setIsScanning(true) }}
            className="flex items-center justify-center gap-2 w-full"
            style={{
              backgroundColor: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 14,
              padding: '13px 0',
              fontSize: 13,
              color: '#0F1B2D',
              cursor: 'pointer',
              marginTop: 10,
            }}
          >
            <i className="ti ti-barcode" style={{ fontSize: 18 }} />
            scan barcode
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
      </>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — Edit
  // ─────────────────────────────────────────────────────────────────────────

  const slotConfig = MEAL_SLOTS.find((s) => s.key === selectedSlot)

  return (
    <>
      {overlays}
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

        {/* Text description (manual entry only) */}
        {entryMode === 'manual' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              describe what you ate
            </p>
            <input
              type="text"
              value={textDescription}
              onChange={(e) => setTextDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTextAnalyze() }}
              placeholder="e.g. 3 roti, bhindi masala, 1 cup rice"
              style={{
                width: '100%',
                fontSize: 14,
                color: '#0F1B2D',
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                padding: '10px 12px',
                outline: 'none',
                backgroundColor: '#F9F9F9',
                marginBottom: 10,
              }}
            />
            <button
              onClick={handleTextAnalyze}
              disabled={!textDescription.trim() || isTextAnalyzing}
              className="flex items-center justify-center gap-2 w-full"
              style={{
                backgroundColor: textDescription.trim() && !isTextAnalyzing ? '#D4F542' : '#E5E7EB',
                color: textDescription.trim() && !isTextAnalyzing ? '#0F1B2D' : '#9CA3AF',
                borderRadius: 10,
                padding: '10px 0',
                fontSize: 13,
                fontWeight: 500,
                border: 'none',
                cursor: textDescription.trim() && !isTextAnalyzing ? 'pointer' : 'not-allowed',
              }}
            >
              {isTextAnalyzing ? (
                <>
                  <Spinner />
                  calculating…
                </>
              ) : (
                'calculate'
              )}
            </button>
          </div>
        )}

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

              {/* Qty + unit + cal */}
              <div className="flex items-center gap-2 mb-2">
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
                <select
                  value={item.unit}
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
                  onChange={(e) => handleMacroChange(idx, 'calories', parseFloat(e.target.value) || 0)}
                  style={{
                    width: 60,
                    fontSize: 13,
                    textAlign: 'right',
                    border: `1px solid ${item._fromBarcode && item.calories === 0 ? '#F59E0B' : '#E5E7EB'}`,
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
                      onChange={(e) => handleMacroChange(idx, field, parseFloat(e.target.value) || 0)}
                      style={{
                        width: 52,
                        fontSize: 13,
                        textAlign: 'right',
                        border: `1px solid ${item._fromBarcode && item[field] === 0 ? '#F59E0B' : '#E5E7EB'}`,
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
                  onChange={(e) => handleMacroChange(idx, 'fiber_g', parseFloat(e.target.value) || 0)}
                  style={{
                    width: 52,
                    fontSize: 13,
                    textAlign: 'right',
                    border: `1px solid ${item._fromBarcode && item.fiber_g === 0 ? '#F59E0B' : '#E5E7EB'}`,
                    borderRadius: 8,
                    padding: '4px 6px',
                    outline: 'none',
                    MozAppearance: 'textfield',
                  }}
                />
                <p style={{ fontSize: 11, color: '#9CA3AF' }}>g</p>
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
    </>
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
