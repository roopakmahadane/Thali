'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function CheckInBanner({ weekKey }: { weekKey: string }) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  function handleDismiss() {
    document.cookie = `checkin_dismissed_${weekKey}=1; path=/; max-age=${7 * 24 * 3600}`
    setDismissed(true)
  }

  return (
    <div
      className="flex items-center gap-3 mb-4"
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: '14px 16px',
        borderLeft: '4px solid #D4F542',
      }}
    >
      <i className="ti ti-scale" style={{ fontSize: 18, color: '#D4F542', flexShrink: 0 }} />
      <p style={{ fontSize: 13, color: '#0F1B2D', flex: 1 }}>
        Sunday check-in — log your weight to update your targets
      </p>
      <Link
        href="/profile"
        style={{ fontSize: 13, color: '#D4F542', fontWeight: 500, flexShrink: 0, textDecoration: 'none' }}
      >
        Log weight
      </Link>
      <button
        onClick={handleDismiss}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '0 0 0 4px', lineHeight: 1 }}
      >
        <i className="ti ti-x" style={{ fontSize: 16 }} />
      </button>
    </div>
  )
}
