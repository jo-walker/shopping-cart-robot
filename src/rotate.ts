/**
 * Rotate a joystick vector by `angle` radians (counter-clockwise).
 * Length is preserved, so a stick inside the unit circle stays inside it
 * and the speeds never exceed their maximums.
 */
export function rotate(x: number, y: number, angle: number): { x: number; y: number } {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: x * c - y * s, y: x * s + y * c }
}

export const randomAngle = () => Math.random() * 2 * Math.PI

/** Stupid-mode roulette result for a rotation in degrees (0..360). */
export function rouletteVerdict(deg: number): 'jackpot' | 'cursed' | null {
  const d = ((deg % 360) + 360) % 360
  if (d <= 20 || d >= 340) return 'jackpot' // controls are (nearly) normal
  if (d >= 160 && d <= 200) return 'cursed' // controls are (nearly) backwards
  return null
}
