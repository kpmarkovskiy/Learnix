'use client'

import { useState } from 'react'

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button className="copy-btn" onClick={copy}>
      {copied ? 'Скопировано' : 'Копировать'}
    </button>
  )
}
