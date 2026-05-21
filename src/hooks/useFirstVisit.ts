import { useState, useCallback } from 'react'

/**
 * Tracks whether this is the user's first visit for a given feature key.
 * Persists a timestamp flag in localStorage.
 *
 * @param key  unique feature key, e.g. 'admin_help'
 * @returns [isFirstVisit, markVisited]
 */
export function useFirstVisit(key: string): [boolean, () => void] {
  const storageKey = `first_visit_${key}`

  const [isFirstVisit, setIsFirstVisit] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === null
    } catch {
      return false
    }
  })

  const markVisited = useCallback(() => {
    try {
      localStorage.setItem(storageKey, new Date().toISOString())
    } catch {
      /* ignore storage errors */
    }
    setIsFirstVisit(false)
  }, [storageKey])

  return [isFirstVisit, markVisited]
}
