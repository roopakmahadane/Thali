'use client'

import { useState } from 'react'

type WeightLog = { id: string; weight_kg: number; logged_at: string }

function formatLogDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}

export default function WeightLogSection({
  initialLogs,
}: {
  initialLogs: WeightLog[]
}) {
  const [logs,      setLogs]      = useState<WeightLog[]>(initialLogs)
  const [inputKg,   setInputKg]   = useState('')
  const [isLogging, setIsLogging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editKg,    setEditKg]    = useState('')
  const [toast,     setToast]     = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  async function handleLog() {
    const kg = parseFloat(inputKg)
    if (isNaN(kg) || kg <= 0) return
    setIsLogging(true)
    try {
      const res = await fetch('/api/weight', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ weight_kg: kg }),
      })
      if (!res.ok) throw new Error()
      setLogs((prev) => [
        { id: Date.now().toString(), weight_kg: kg, logged_at: new Date().toISOString() },
        ...prev,
      ])
      setInputKg('')
      showToast('logged — refresh to see updated targets')
    } catch {
      showToast('failed to log weight')
    } finally {
      setIsLogging(false)
    }
  }

  async function handleEditSave(id: string) {
    const kg = parseFloat(editKg)
    if (isNaN(kg) || kg <= 0) return
    try {
      const res = await fetch(`/api/weight/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ weight_kg: kg }),
      })
      if (!res.ok) throw new Error()
      setLogs((prev) => prev.map((l) => l.id === id ? { ...l, weight_kg: kg } : l))
      setEditingId(null)
      showToast('updated')
    } catch {
      showToast('failed to update')
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/weight/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setLogs((prev) => prev.filter((l) => l.id !== id))
    } catch {
      showToast('failed to delete')
    }
  }

  const trend = logs.length >= 2 ? logs[0].weight_kg - logs[1].weight_kg : null

  return (
    <div>
      {/* Log input */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="number"
          value={inputKg}
          onChange={(e) => setInputKg(e.target.value)}
          placeholder="kg"
          step="0.1"
          style={{
            flex: 1,
            border: '1px solid #E5E7EB',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 14,
            color: '#0F1B2D',
            outline: 'none',
          }}
        />
        <button
          onClick={handleLog}
          disabled={isLogging || !inputKg}
          style={{
            backgroundColor: inputKg && !isLogging ? '#D4F542' : '#E5E7EB',
            color:            inputKg && !isLogging ? '#0F1B2D' : '#9CA3AF',
            borderRadius: 10,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 500,
            border: 'none',
            cursor: inputKg && !isLogging ? 'pointer' : 'not-allowed',
          }}
        >
          {isLogging ? '…' : 'log'}
        </button>
      </div>

      {toast && (
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, fontStyle: 'italic' }}>{toast}</p>
      )}

      {/* Weight history */}
      {logs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p style={{ fontSize: 12, color: '#6B7280' }}>recent</p>
            {trend !== null && (
              trend < 0
                ? <i className="ti ti-trending-down" style={{ fontSize: 14, color: '#22C55E' }} />
                : trend > 0
                  ? <i className="ti ti-trending-up"   style={{ fontSize: 14, color: '#DC2626' }} />
                  : <i className="ti ti-minus"          style={{ fontSize: 14, color: '#6B7280' }} />
            )}
          </div>
          <div className="flex flex-col">
            {logs.slice(0, 12).map((log) => {
              if (editingId === log.id) {
                return (
                  <div key={log.id} className="flex items-center gap-2" style={{ padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
                    <input
                      type="number"
                      value={editKg}
                      onChange={(e) => setEditKg(e.target.value)}
                      step="0.1"
                      autoFocus
                      style={{
                        flex: 1,
                        border: '1px solid #D4F542',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: 13,
                        color: '#0F1B2D',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => handleEditSave(log.id)}
                      style={{ fontSize: 12, color: '#0F1B2D', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                    >
                      save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{ fontSize: 12, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                    >
                      cancel
                    </button>
                  </div>
                )
              }

              return (
                <div key={log.id} className="flex items-center justify-between" style={{ padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
                  <p style={{ fontSize: 14, color: '#0F1B2D' }}>{log.weight_kg} kg</p>
                  <p style={{ fontSize: 12, color: '#6B7280', flex: 1, marginLeft: 12 }}>{formatLogDate(log.logged_at)}</p>
                  <button
                    onClick={() => { setEditingId(log.id); setEditKg(String(log.weight_kg)) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '0 6px', lineHeight: 1 }}
                  >
                    <i className="ti ti-pencil" style={{ fontSize: 13 }} />
                  </button>
                  <button
                    onClick={() => handleDelete(log.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '0 2px', lineHeight: 1 }}
                  >
                    <i className="ti ti-trash" style={{ fontSize: 13 }} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
