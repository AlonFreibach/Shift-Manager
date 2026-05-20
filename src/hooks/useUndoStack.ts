import { useRef, useState, useCallback, useEffect } from 'react'

interface UseUndoStackOptions<T> {
  /** Called with a snapshot when the user undoes. Restore your state here. */
  onRestore: (snapshot: T) => void
  /** Max snapshots to keep (default 20). */
  max?: number
  /** Whether Ctrl+Z / Cmd+Z triggers undo (default true). */
  enableHotkey?: boolean
}

/**
 * Generic undo stack shared across admin tabs.
 *
 * Each tab snapshots its own state *before* a mutation via `push(snapshot)`,
 * and provides an `onRestore(snapshot)` callback that knows how to re-apply it.
 * Snapshots are deep-cloned on push so callers can pass live state safely.
 */
export function useUndoStack<T>({ onRestore, max = 20, enableHotkey = true }: UseUndoStackOptions<T>) {
  const stackRef = useRef<T[]>([])
  const [count, setCount] = useState(0)
  // Keep latest onRestore without re-registering the hotkey listener.
  const onRestoreRef = useRef(onRestore)
  onRestoreRef.current = onRestore

  const push = useCallback((snapshot: T) => {
    stackRef.current.push(JSON.parse(JSON.stringify(snapshot)))
    if (stackRef.current.length > max) stackRef.current.shift()
    setCount(stackRef.current.length)
  }, [max])

  const undo = useCallback(() => {
    const snap = stackRef.current.pop()
    if (snap === undefined) return
    onRestoreRef.current(snap)
    setCount(stackRef.current.length)
  }, [])

  const clear = useCallback(() => {
    stackRef.current = []
    setCount(0)
  }, [])

  useEffect(() => {
    if (!enableHotkey) return
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        // Let the browser handle native text-editing undo inside fields.
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        undo()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [undo, enableHotkey])

  return { push, undo, clear, count, canUndo: count > 0 }
}
