import { useState } from 'react'

export function useError() {
  const [error, setError] = useState<string | null>(null)
  const wrap = async (fn: () => Promise<void>) => {
    try {
      setError(null)
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error')
    }
  }
  return { error, wrap }
}
