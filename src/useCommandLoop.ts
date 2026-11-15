import { useCallback, useEffect, useRef, useState } from 'react'
import type { Speeds } from './speeds'
import { toTwistStamped, type TwistStamped } from './twistStamped'

export const SEND_PERIOD_MS = 100 // 10 Hz
const ZERO_REPEATS = 3
const ZERO: Speeds = { linear: 0, angular: 0 }

/**
 * Safety-critical send loop.
 *
 * - While driving (finger down) it sends the LATEST command every 100 ms.
 * - stop() sends a zero right away, then 2 more on the next ticks, then nothing.
 * - Only start() (a NEW touch) resumes driving. So STOP latches even if a finger
 *   is still resting on the stick: moving it does nothing until you lift and touch again.
 * - Going to the background (document.hidden) calls stop().
 *
 * If the link dies, nothing reaches the robot at all, including our zeros. The robot's
 * own cmd_vel watchdog (~0.5 s with no messages) is what halts it in that case.
 *
 * `onStopped(reason)` runs after every stop, once the first zero is already sent
 * (for bookkeeping like the regret meter). It can never block or break the stop.
 */
export function useCommandLoop(
  send: (msg: TwistStamped) => void,
  onStopped?: (reason: string) => void,
) {
  // The interval callback reads these refs, never React state, so it can't see stale values.
  const sendRef = useRef(send)
  const onStoppedRef = useRef(onStopped)
  const cmdRef = useRef<Speeds>(ZERO)
  const drivingRef = useRef(false)
  const zerosLeftRef = useRef(0)
  const [driving, setDriving] = useState(false) // UI mirror only

  useEffect(() => {
    sendRef.current = send
    onStoppedRef.current = onStopped
  })

  const tick = useCallback(() => {
    if (drivingRef.current) {
      // Build the message at send time so every stamp is fresh.
      sendRef.current(toTwistStamped(cmdRef.current))
    } else if (zerosLeftRef.current > 0) {
      zerosLeftRef.current -= 1
      sendRef.current(toTwistStamped(ZERO))
    }
    // else: send nothing
  }, [])

  const start = useCallback(() => {
    cmdRef.current = ZERO
    zerosLeftRef.current = 0
    drivingRef.current = true
    setDriving(true)
  }, [])

  const update = useCallback((cmd: Speeds) => {
    cmdRef.current = cmd
  }, [])

  const stop = useCallback(
    (reason: string) => {
      console.log('stop:', reason)
      drivingRef.current = false
      cmdRef.current = ZERO
      zerosLeftRef.current = ZERO_REPEATS
      setDriving(false)
      // Send the first zero now instead of waiting for a tick: once the page is
      // hidden, mobile browsers throttle or freeze timers.
      tick()
      try {
        onStoppedRef.current?.(reason)
      } catch {
        /* bookkeeping must never break a stop */
      }
    },
    [tick],
  )

  // How late the timer runs: a busy or battery-saving phone stretches 100 ms ticks.
  const maxGapRef = useRef(0)
  /** Longest gap between timer ticks since the last call (ms), then resets. */
  const takeMaxTickGap = useCallback(() => {
    const gap = maxGapRef.current
    maxGapRef.current = 0
    return gap
  }, [])

  useEffect(() => {
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      maxGapRef.current = Math.max(maxGapRef.current, now - last)
      last = now
      tick()
    }, SEND_PERIOD_MS)
    const onVisibility = () => {
      if (document.hidden) stop('hidden')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [tick, stop])

  return { driving, start, update, stop, takeMaxTickGap }
}
