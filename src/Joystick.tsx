import { useEffect, useRef, type ReactNode } from 'react'
import nipplejs from 'nipplejs'

/** Outer diameter nipplejs uses; the vector reaches 1 at STICK_RADIUS px from the centre. */
export const STICK_SIZE = 150
export const STICK_RADIUS = STICK_SIZE / 2

type Props = {
  onStart: () => void
  /** x, y in -1..1; y is positive when pushed UP. */
  onMove: (x: number, y: number) => void
  onEnd: () => void
  /** Hide nipplejs's own stick (it still tracks touches) so the caller can draw one. */
  invisible?: boolean
  className?: string
  /** Drawn inside the zone. Anything here must be pointer-events: none. */
  children?: ReactNode
}

/** Input only: reports touches, sends nothing itself. */
export default function Joystick({ invisible = false, className, children, ...handlers }: Props) {
  const zoneRef = useRef<HTMLDivElement>(null)
  // Latest callbacks, so the nipplejs listeners (bound once) never call stale ones.
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    const zone = zoneRef.current
    if (!zone) return

    const manager = nipplejs.create({
      zone,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: invisible ? 'transparent' : 'white',
      size: STICK_SIZE,
    })

    manager.on('start', () => handlersRef.current.onStart())
    manager.on('move', (evt) => {
      const { x, y } = evt.data.vector
      handlersRef.current.onMove(x, y)
    })
    // nipplejs also fires 'end' on touchcancel/pointercancel (e.g. an incoming call).
    manager.on('end', () => handlersRef.current.onEnd())

    // nipplejs measures the centre once. Re-measure if the layout moves: the bundled
    // font swapping in after first paint, a rotation, a resize.
    let alive = true
    const reposition = () => {
      if (alive) manager.reposition()
    }
    document.fonts?.ready.then(reposition)
    window.addEventListener('resize', reposition)
    window.addEventListener('orientationchange', reposition)

    // StrictMode mounts effects twice in dev; destroy so we don't get two sticks.
    return () => {
      alive = false
      window.removeEventListener('resize', reposition)
      window.removeEventListener('orientationchange', reposition)
      manager.destroy()
    }
  }, [invisible])

  return (
    <div ref={zoneRef} className={className}>
      {children}
    </div>
  )
}
