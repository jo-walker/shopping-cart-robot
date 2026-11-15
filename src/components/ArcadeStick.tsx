import type { ReactNode } from 'react'
import Joystick, { STICK_RADIUS } from '../Joystick'

type Props = {
  /** Where the finger is (raw stick vector, -1..1, y up). The drawn ball follows it. */
  vec: { x: number; y: number }
  onStart: () => void
  onMove: (x: number, y: number) => void
  onEnd: () => void
  /** Extra decorations inside the zone; must be pointer-events: none. */
  children?: ReactNode
}

/**
 * A ball-top arcade stick in an octagonal gate. nipplejs tracks the touch with its own
 * (transparent) stick; this draws the visible one on the same centre.
 */
export default function ArcadeStick({ vec, children, ...handlers }: Props) {
  const reach = Math.hypot(vec.x, vec.y) * STICK_RADIUS
  const lean = Math.atan2(vec.x, vec.y) // radians clockwise from straight up
  const pupil = { transform: `translate(${vec.x * 4}px, ${-vec.y * 4}px)` }

  return (
    <Joystick invisible className="stick-zone" {...handlers}>
      <div className="gate" />
      <div
        className="shaft"
        style={{ height: reach, transform: `translateY(-100%) rotate(${lean}rad)` }}
      />
      <div
        className="ball"
        style={{ transform: `translate(${vec.x * STICK_RADIUS}px, ${-vec.y * STICK_RADIUS}px)` }}
      >
        {/* Googly eyes: the pupils look where you push. */}
        <div className="eye left">
          <div className="pupil" style={pupil} />
        </div>
        <div className="eye right">
          <div className="pupil" style={pupil} />
        </div>
      </div>
      {children}
    </Joystick>
  )
}
