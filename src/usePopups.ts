import { useCallback, useEffect, useRef, useState } from 'react'

export type Tone = 'yellow' | 'red' | 'green' | 'blue'
export type Popup = { id: number; text: string; tone: Tone }

const SHOW_MS = 1100

/** Short-lived "WHEEE!"-style captions. Purely cosmetic. */
export function usePopups() {
  const [popups, setPopups] = useState<Popup[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  const pop = useCallback((text: string, tone: Tone = 'yellow') => {
    const id = nextId.current++
    setPopups((list) => [...list.slice(-2), { id, text, tone }]) // at most 3 on screen
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setPopups((list) => list.filter((p) => p.id !== id))
    }, SHOW_MS)
    timers.current.add(timer)
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  return { popups, pop }
}
