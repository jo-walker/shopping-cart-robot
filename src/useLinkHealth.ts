import { useEffect, useRef, useState } from 'react'
import type { LinkSignals } from './useFoxglove'

export const MAX_HEARTS = 4
const POLL_MS = 250
const LATE_TICK_MS = 300 // a 100 ms send tick this late means the phone is struggling

/**
 * robot:   hearts from how fresh the robot's heartbeat topic is (catches wifi stalls)
 * wait:    subscribed to the heartbeat but nothing has arrived yet ("?")
 * phone:   no heartbeat topic set: phone-side signals only (misses network stalls)
 * missing: a topic is set but the bridge doesn't have it: phone-side signals
 * offline: not connected
 */
export type LinkMode = 'robot' | 'wait' | 'phone' | 'missing' | 'offline'
export type LinkHealth = { hearts: number; mode: LinkMode }

/** Hearts from the age of the newest robot message. */
export function heartsFromAge(ageMs: number): number {
  if (ageMs < 300) return 4
  if (ageMs < 600) return 3
  if (ageMs < 1200) return 2
  if (ageMs < 2500) return 1
  return 0
}

const OFFLINE: LinkHealth = { hearts: 0, mode: 'offline' }

/**
 * Wi-Fi hearts, recomputed 4 times a second from refs (never per message).
 * Phone-side mode loses a heart whenever sends back up, get dropped, or the send
 * timer runs late, and regains one per clean second.
 */
export function useLinkHealth({
  connected,
  signals,
  takeMaxTickGap,
}: {
  connected: boolean
  signals: () => LinkSignals
  takeMaxTickGap: () => number
}): LinkHealth {
  const [health, setHealth] = useState<LinkHealth>(OFFLINE)
  const signalsRef = useRef(signals)
  const takeGapRef = useRef(takeMaxTickGap)
  useEffect(() => {
    signalsRef.current = signals
    takeGapRef.current = takeMaxTickGap
  })

  useEffect(() => {
    if (!connected) return
    let phoneHearts = MAX_HEARTS
    let lastDropped = signalsRef.current().dropped
    let cleanSince = performance.now()
    takeGapRef.current() // ignore any gap from before we connected

    const id = setInterval(() => {
      const s = signalsRef.current()
      const now = performance.now()
      const late = takeGapRef.current() > LATE_TICK_MS
      const dropped = s.dropped > lastDropped
      lastDropped = s.dropped
      if (s.bufferedAmount > 0 || dropped || late) {
        phoneHearts = Math.max(0, phoneHearts - 1)
        cleanSince = now
      } else if (now - cleanSince >= 1000) {
        phoneHearts = Math.min(MAX_HEARTS, phoneHearts + 1)
        cleanSince = now
      }

      const next: LinkHealth =
        s.heartbeat === 'subscribed'
          ? s.heardAt === null
            ? { hearts: 0, mode: 'wait' }
            : { hearts: heartsFromAge(now - s.heardAt), mode: 'robot' }
          : { hearts: phoneHearts, mode: s.heartbeat === 'missing' ? 'missing' : 'phone' }
      setHealth((h) => (h.hearts === next.hearts && h.mode === next.mode ? h : next))
    }, POLL_MS)
    return () => clearInterval(id)
  }, [connected])

  return connected ? health : OFFLINE
}
