import { DIFFICULTIES, type Difficulty, type Settings } from '../settings'
import { ROBOT_NAME_RE, topicFor } from '../useFoxglove'

type Props = {
  settings: Settings
  onChange: (settings: Settings) => void
  /** Whether stats are being sent to Amplitude (an API key is configured). */
  analytics: boolean
  /** BOB-AI's provider on the laptop ("groq" / "claude"), or null if no API key is set. */
  aiProvider: string | null
  onStart: () => void
}

/** PLAYER 1: where to connect. PRESS START connects and goes to the play screen. */
export default function SetupScreen({ settings, onChange, analytics, aiProvider, onStart }: Props) {
  const name = settings.robot.trim()
  const nameOk = ROBOT_NAME_RE.test(name)
  const ok = nameOk && settings.url.trim() !== ''

  return (
    <form
      className="screen setup"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onStart()
      }}
    >
      <div className="marquee">
        CART★1
        <small>INSERT ROBOT NAME · PRESS START · DRIVE RESPONSIBLY-ISH · NO REFUNDS</small>
      </div>

      <section className="nes-container is-dark with-title panel">
        <p className="title">PLAYER 1</p>

        {/* The fields scroll on small phones; PRESS START below them always stays on screen. */}
        <div className="fields">
          <div className="field initials-field">
            <label htmlFor="initials">ENTER YOUR INITIALS</label>
            <input
              id="initials"
              className="nes-input is-dark initials"
              value={settings.initials}
              placeholder="AAA"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) =>
                onChange({ ...settings, initials: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) })
              }
            />
          </div>

          <div className="difficulty">
            <p className="field-label">DIFFICULTY (TOP SPEED; STUPID MODE IS ALWAYS HARD)</p>
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
              <label key={d}>
                <input
                  id={`difficulty-${d}`}
                  type="radio"
                  name="difficulty"
                  className="nes-radio is-dark"
                  checked={settings.difficulty === d}
                  onChange={() => onChange({ ...settings, difficulty: d })}
                />
                <span>
                  {DIFFICULTIES[d].label} · {DIFFICULTIES[d].maxLinear.toFixed(1)} M/S
                </span>
              </label>
            ))}
          </div>

          <div className="field">
            <label htmlFor="url">BRIDGE</label>
            <input
              id="url"
              className="nes-input is-dark"
              value={settings.url}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...settings, url: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="robot">ROBOT NAME</label>
            <input
              id="robot"
              className="nes-input is-dark"
              value={settings.robot}
              placeholder="cart"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...settings, robot: e.target.value })}
            />
          </div>

          <p className="topic">
            {nameOk ? (
              `TOPIC ${topicFor(name)}`
            ) : name ? (
              <span className="nes-text is-error">LETTERS, DIGITS AND _ ONLY</span>
            ) : (
              'TOPIC /<name>/joy_teleop/cmd_vel'
            )}
          </p>

          <div className="field">
            <label htmlFor="heartbeat">HEARTBEAT TOPIC (OPTIONAL)</label>
            <input
              id="heartbeat"
              className="nes-input is-dark"
              value={settings.heartbeatTopic}
              placeholder="/cart/joint_states"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...settings, heartbeatTopic: e.target.value })}
            />
          </div>

          <label className="freeplay">
            <input
              id="freeplay"
              type="checkbox"
              className="nes-checkbox is-dark"
              checked={settings.freePlay}
              onChange={(e) => onChange({ ...settings, freePlay: e.target.checked })}
            />
            <span>FREE PLAY (NO COINS)</span>
          </label>

          <p id="analytics" className="topic">
            REGRET STATS → AMPLITUDE: {analytics ? 'ON' : 'OFF (NO KEY)'}
          </p>
          <p id="oracle-status" className="topic">
            BOB-AI STUPID-MODE ORACLE: {aiProvider ? `ON (${aiProvider.toUpperCase()})` : 'OFF (NO API KEY)'}
          </p>
        </div>

        <button
          id="start"
          type="submit"
          className={`nes-btn is-primary start-btn ${ok ? '' : 'is-disabled'}`}
          disabled={!ok}
        >
          <span className={ok ? 'blink' : ''}>PRESS START</span>
        </button>
      </section>
    </form>
  )
}
