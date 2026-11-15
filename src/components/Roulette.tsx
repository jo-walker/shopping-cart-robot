import type { CSSProperties } from 'react'

/** An arrow pointing where "up" on the stick now sends the cart. */
export function UpArrow({ angleDeg, size = 12 }: { angleDeg: number; size?: number }) {
  // Rotating the controls counter-clockwise by θ sends "up" θ to the left;
  // CSS rotate() turns clockwise, hence the minus.
  return (
    <svg
      className="up-arrow"
      viewBox="0 0 10 10"
      width={size}
      height={size}
      style={{ transform: `rotate(${-angleDeg}deg)` }}
      aria-hidden="true"
    >
      <path d="M5 0 L10 5 L6.5 5 L6.5 10 L3.5 10 L3.5 5 L0 5 Z" fill="currentColor" />
    </svg>
  )
}

/**
 * Spins once when a stupid-mode touch starts and lands on the new "up".
 * Remount it (key) per touch to replay. Cosmetic: the rotation is already live.
 */
export function RouletteWheel({ angleDeg }: { angleDeg: number }) {
  return (
    <div className="wheel" style={{ '--end': `${-angleDeg}deg` } as CSSProperties}>
      <UpArrow angleDeg={0} size={40} />
    </div>
  )
}
