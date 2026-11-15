import { useCallback, useEffect, useRef, useState } from 'react'

export const SECONDS_PER_COIN = 30

/**
 * Insert coin to drive: each coin buys 30 s, counted down only while driving.
 * Coins can only ever stop the cart (time up) or refuse to start it; they never
 * get in the way of STOP.
 */
export function useCoins({
  freePlay,
  driving,
  onTimeUp,
}: {
  freePlay: boolean
  driving: boolean
  onTimeUp: () => void
}) {
  const [timeLeft, setTimeLeft] = useState(0)
  const [coins, setCoins] = useState(0)
  const timeRef = useRef(0)
  const onTimeUpRef = useRef(onTimeUp)
  useEffect(() => {
    onTimeUpRef.current = onTimeUp
  })

  const insert = useCallback(() => {
    timeRef.current += SECONDS_PER_COIN
    setTimeLeft(timeRef.current)
    setCoins((c) => c + 1)
  }, [])

  /** Read from a ref so a touch handler always sees the current time. */
  const canDrive = useCallback(() => freePlay || timeRef.current > 0, [freePlay])

  useEffect(() => {
    if (!driving || freePlay) return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      timeRef.current = Math.max(0, timeRef.current - (now - last) / 1000)
      last = now
      setTimeLeft(timeRef.current)
      if (timeRef.current <= 0) {
        clearInterval(id)
        onTimeUpRef.current()
      }
    }, 200)
    return () => clearInterval(id)
  }, [driving, freePlay])

  return { timeLeft, coins, insert, canDrive }
}
