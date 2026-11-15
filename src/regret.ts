/**
 * The Regret Meter: how much of your pushing sent the cart somewhere you didn't mean.
 *
 * Stupid mode rotates the stick by an angle θ, so you meant one direction and got
 * another. A touch's regret is 0 when the cart goes where you push and 1 when it goes
 * the exact opposite way (90° = 0.5: you pushed forward and it spun on the spot).
 *
 * - regret %: weighted by how hard you push the stick, over time ("push-seconds").
 *   Weighting by distance instead would score a pure spin (no distance) as 0% regret.
 * - metres of regret: commanded distance (speed × time, not measured) × regret.
 */
export const regretFraction = (angleRad: number) => (1 - Math.cos(angleRad)) / 2

/** One drive = one touch, from start until any stop (release, STOP, time up, hidden, lost). */
export type Drive = {
  startedAt: number // ms, performance.now()
  lastAt: number
  speed: number // current commanded |linear|, m/s
  push: number // current stick magnitude, 0..1
  distanceM: number
  regretM: number
  pushS: number // ∫ push dt
  regretPushS: number // ∫ push × regret dt
  topSpeed: number
  regret: number // 0..1, fixed for the whole touch
  rotationDeg: number
  stupid: boolean
}

export function startDrive(now: number, stupid: boolean, angleRad: number): Drive {
  return {
    startedAt: now,
    lastAt: now,
    speed: 0,
    push: 0,
    distanceM: 0,
    regretM: 0,
    pushS: 0,
    regretPushS: 0,
    topSpeed: 0,
    regret: stupid ? regretFraction(angleRad) : 0,
    rotationDeg: stupid ? Math.round((angleRad * 180) / Math.PI) : 0,
    stupid,
  }
}

/** Credit the time since the last update at the previous speed/push, then switch to the new ones. */
export function advanceDrive(d: Drive, now: number, speed = d.speed, push = d.push) {
  const dt = Math.max(0, now - d.lastAt) / 1000
  d.distanceM += d.speed * dt
  d.regretM += d.speed * dt * d.regret
  d.pushS += d.push * dt
  d.regretPushS += d.push * dt * d.regret
  d.lastAt = now
  d.speed = speed
  d.push = push
  d.topSpeed = Math.max(d.topSpeed, speed)
}

/**
 * Rotation rounded to the nearest 45°, zero-padded so charts sort it in order:
 * "000", "045", … "315". Plotting regret per bucket traces (1 − cos θ) / 2.
 * Normal (non-stupid) drives are "normal" so they don't pile into "000".
 */
export const rotationBucket = (deg: number, stupid = true) =>
  stupid ? String((Math.round((((deg % 360) + 360) % 360) / 45) * 45) % 360).padStart(3, '0') : 'normal'

/** Snake_case on purpose: these go straight to Amplitude as event properties. */
export type DriveReport = {
  duration_s: number
  distance_m: number
  regret_m: number
  regret_pct: number
  push_s: number
  regret_push_s: number
  top_speed: number
  stupid_mode: boolean
  rotation_deg: number
  rotation_bucket: string
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0)

export function finishDrive(d: Drive, now: number): DriveReport {
  advanceDrive(d, now, 0, 0)
  return {
    duration_s: round((now - d.startedAt) / 1000, 1),
    distance_m: round(d.distanceM, 2),
    regret_m: round(d.regretM, 2),
    regret_pct: pct(d.regretPushS, d.pushS),
    push_s: round(d.pushS, 3),
    regret_push_s: round(d.regretPushS, 3),
    top_speed: round(d.topSpeed, 2),
    stupid_mode: d.stupid,
    rotation_deg: d.rotationDeg,
    rotation_bucket: rotationBucket(d.rotationDeg, d.stupid),
  }
}

export type Session = {
  drives: number
  distanceM: number
  regretM: number
  pushS: number
  regretPushS: number
}
export const EMPTY_SESSION: Session = { drives: 0, distanceM: 0, regretM: 0, pushS: 0, regretPushS: 0 }

export const addDrive = (s: Session, r: DriveReport): Session => ({
  drives: s.drives + 1,
  distanceM: s.distanceM + r.distance_m,
  regretM: s.regretM + r.regret_m,
  pushS: s.pushS + r.push_s,
  regretPushS: s.regretPushS + r.regret_push_s,
})

/** Push-weighted over the whole game: a long wrong-way drive counts more than a tap. */
export const sessionRegretPct = (s: Session) => pct(s.regretPushS, s.pushS)
