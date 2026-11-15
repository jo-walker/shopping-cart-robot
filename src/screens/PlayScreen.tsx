import ArcadeStick from '../components/ArcadeStick'
import GameOver from '../components/GameOver'
import Hearts from '../components/Hearts'
import { RouletteWheel, UpArrow } from '../components/Roulette'
import { sessionRegretPct, type Session } from '../regret'
import type { Speeds } from '../speeds'
import type { ConnStatus } from '../useFoxglove'
import type { LinkHealth } from '../useLinkHealth'
import type { Popup } from '../usePopups'

type Vec = { x: number; y: number }

type Props = {
  robot: string
  status: ConnStatus
  /** Auto-reconnect attempt number while the link is being restored, else null. */
  reconnectAttempt: number | null
  health: LinkHealth
  driving: boolean
  /** Raw finger position, for drawing the stick. */
  stick: Vec
  /** What's actually being commanded (after stupid-mode rotation). */
  speeds: Speeds
  hiSpeed: number
  /** Regret meter totals for this game. */
  session: Session
  /** Rider initials and their A/B group (revealed on GAME OVER). */
  rider: string
  experiment: 'random' | 'cursed'
  /** e.g. "HARD", shown in the marquee. */
  difficulty: string
  stats: { sent: number; dropped: number }
  stupid: boolean
  onStupidChange: (on: boolean) => void
  /** BOB-AI's verdict for the current touch (id changes per touch to replay the animation). */
  oracle: { id: number; text: string } | null
  aiReady: boolean
  /** Increments on every touch; replays the roulette wheel. */
  touchId: number
  touchAngleDeg: number
  freePlay: boolean
  timeLeft: number
  onInsertCoin: () => void
  muted: boolean
  onMuteToggle: () => void
  popups: Popup[]
  onStickStart: () => void
  onStickMove: (x: number, y: number) => void
  onStickEnd: () => void
  onStop: () => void
  onContinue: () => void
  onExit: () => void
}

const fmt = (n: number) => (n >= 0 ? ' ' : '') + n.toFixed(2)

export default function PlayScreen(p: Props) {
  const { status } = p
  const connected = status.kind === 'connected'
  const reconnecting = p.reconnectAttempt !== null
  const lost = !reconnecting && (status.kind === 'disconnected' || status.kind === 'error')
  const downReason =
    status.kind === 'error' ? status.message : status.kind === 'disconnected' ? (status.reason ?? '') : ''
  const [led, label] = connected
    ? ['on', 'ONLINE']
    : status.kind === 'connecting'
      ? ['wait', 'CONNECTING']
      : ['off', 'OFFLINE']
  const broke = !p.freePlay && p.timeLeft <= 0
  const regret = sessionRegretPct(p.session)

  return (
    <div className="screen play">
      <div className="marquee">
        {p.robot.toUpperCase()}★1
        <small>
          DIFFICULTY: {p.difficulty} · NOW WITH 4 WHEELS! · DRIVE RESPONSIBLY-ISH · NO REFUNDS · HIGH SCORE =
          TOP SPEED
        </small>
      </div>

      <div className="hud">
        <div id="link" data-kind={status.kind} className="box" title={label}>
          <span className={`led ${led}`} />
          <Hearts health={p.health} />
        </div>
        <div className="hud-right">
          <button id="mute" type="button" className="nes-btn" onClick={p.onMuteToggle}>
            {p.muted ? 'SND OFF' : 'SND ON'}
          </button>
          <button id="menu" type="button" className="nes-btn" onClick={p.onExit}>
            MENU
          </button>
        </div>
      </div>

      <div className="hud">
        <span id="status" className={p.driving ? 'driving' : 'stopped'}>
          {p.driving
            ? connected
              ? 'DRIVING'
              : 'DRIVING · NOT CONNECTED'
            : 'STOPPED · TOUCH TO DRIVE'}
        </span>
        {p.freePlay ? (
          <span id="time" className="box">FREE PLAY</span>
        ) : (
          <button
            id="coin"
            type="button"
            className={`nes-btn is-warning coin-btn ${broke ? 'blink' : ''}`}
            onClick={p.onInsertCoin}
          >
            <i className="nes-icon coin is-small" />
            <span id="time">{broke ? 'INSERT COIN' : `TIME ${Math.ceil(p.timeLeft)}`}</span>
          </button>
        )}
      </div>

      <div className="hud">
        <label>
          <input
            id="stupid"
            type="checkbox"
            className="nes-checkbox is-dark"
            checked={p.stupid}
            onChange={(e) => p.onStupidChange(e.target.checked)}
          />
          <span>STUPID MODE · HARD{p.aiReady ? ' · AI' : ''}</span>
        </label>
        {p.stupid && p.touchId > 0 && (
          <span id="stupid-angle" className="box" data-angle={p.touchAngleDeg}>
            UP IS NOW <UpArrow angleDeg={p.touchAngleDeg} />
          </span>
        )}
      </div>

      <div className="stick-wrap">
        <ArcadeStick
          vec={p.stick}
          onStart={p.onStickStart}
          onMove={p.onStickMove}
          onEnd={p.onStickEnd}
        >
          {/* Inside the zone, so all of this is pointer-events: none (see CSS). */}
          {p.stupid && p.touchId > 0 && <RouletteWheel key={p.touchId} angleDeg={p.touchAngleDeg} />}
          {p.stupid && p.oracle && (
            <div key={p.oracle.id} id="oracle" className="nes-balloon from-left is-dark oracle">
              <span className="oracle-name">BOB-AI:</span> {p.oracle.text}
            </div>
          )}
          <div id="popups" className="popups">
            {p.popups.map((pop) => (
              <div key={pop.id} className={`popup ${pop.tone}`}>
                {pop.text}
              </div>
            ))}
          </div>
        </ArcadeStick>
        {status.kind === 'connecting' && !reconnecting && (
          <div className="ready nes-text is-warning blink">GET READY!</div>
        )}
        {reconnecting && (
          <div id="reconnecting" className="gameover" data-attempt={p.reconnectAttempt}>
            <div className="nes-container is-dark is-rounded">
              <p className="big nes-text is-warning">SIGNAL LOST</p>
              <p className="why blink">
                {status.kind === 'connecting' ? 'RECONNECTING' : 'RETRYING'} · TRY #{Math.max(p.reconnectAttempt ?? 0, 1)}
              </p>
              {downReason && <p className="why">{downReason}</p>}
              <p className="why score-line">CART STOPPED. TOUCH THE STICK AGAIN ONCE IT'S BACK.</p>
              <button id="reconnect-exit" type="button" className="nes-btn" onClick={p.onExit}>
                EXIT
              </button>
            </div>
          </div>
        )}
        {lost && (
          <GameOver
            reason={status.kind === 'error' ? status.message : (status.reason ?? 'DISCONNECTED')}
            stats={`${p.rider}: DRIVES ${p.session.drives} · ${p.session.distanceM.toFixed(1)} M · REGRET ${regret}% · TEST GROUP ${p.experiment.toUpperCase()}`}
            onContinue={p.onContinue}
            onExit={p.onExit}
          />
        )}
      </div>

      {/* Outside the stick zone, and fires on press (pointerdown), not on release. */}
      <button id="stop" type="button" className="nes-btn is-error stop-btn" onPointerDown={p.onStop}>
        STOP
        <small>(PANIC)</small>
      </button>

      <div className="score">
        <span>SPD{fmt(p.speeds.linear)}</span>
        <span>TRN{fmt(p.speeds.angular)}</span>
        <span>HI {p.hiSpeed.toFixed(2)}</span>
        <span id="regret" className="regret" data-pct={regret} data-metres={p.session.regretM.toFixed(2)}>
          REGRET
          <span className="regret-bar">
            <i style={{ width: `${regret}%` }} />
          </span>
          {regret}%
        </span>
        <span>
          TX <span id="sent-count">{p.stats.sent}</span>
        </span>
        <span>
          DROP <span id="dropped-count">{p.stats.dropped}</span>
        </span>
      </div>
    </div>
  )
}
