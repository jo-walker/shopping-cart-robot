import { useEffect, useRef, useState } from 'react'

const COUNTDOWN = 9

type Props = {
  reason: string
  /** This game's score line (drives, distance, regret). */
  stats?: string
  /** Reconnect with the same settings. */
  onContinue: () => void
  /** Back to PLAYER 1. Also happens when the countdown runs out. */
  onExit: () => void
}

/** Shown over the stick (never inside its zone) when the connection is lost or fails. */
export default function GameOver({ reason, stats, onContinue, onExit }: Props) {
  const [left, setLeft] = useState(COUNTDOWN)
  const onExitRef = useRef(onExit)
  useEffect(() => {
    onExitRef.current = onExit
  })

  useEffect(() => {
    let n = COUNTDOWN
    const id = setInterval(() => {
      n -= 1
      setLeft(n)
      if (n <= 0) {
        clearInterval(id)
        onExitRef.current()
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div id="gameover" className="gameover">
      <div className="nes-container is-dark is-rounded">
        <p className="big nes-text is-error">GAME OVER</p>
        <p className="why">{reason}</p>
        {stats && (
          <p id="gameover-stats" className="why score-line">
            {stats}
          </p>
        )}
        <button id="continue" type="button" className="nes-btn is-primary" onClick={onContinue}>
          CONTINUE? {Math.max(left, 0)}
        </button>
        <button id="exit" type="button" className="nes-btn" onClick={onExit}>
          EXIT
        </button>
      </div>
    </div>
  )
}
