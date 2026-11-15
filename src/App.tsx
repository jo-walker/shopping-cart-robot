import { useEffect, useRef, useState } from 'react'
import { analyticsOn, setAnalyticsContext, track } from './analytics'
import {
  addDrive,
  advanceDrive,
  EMPTY_SESSION,
  finishDrive,
  rotationBucket,
  sessionRegretPct,
  startDrive,
  type Drive,
} from './regret'
import { randomAngle, rotate, rouletteVerdict } from './rotate'
import PlayScreen from './screens/PlayScreen'
import SetupScreen from './screens/SetupScreen'
import { DIFFICULTIES, loadSettings, saveSettings } from './settings'
import { fetchCurse, fetchOracleStatus, speak, unlockSpeech, type Curse } from './oracle'
import { setMuted, sfx } from './sound'
import { joystickToSpeeds, type Speeds } from './speeds'
import { useCoins } from './useCoins'
import { useCommandLoop } from './useCommandLoop'
import { useFoxglove } from './useFoxglove'
import { useLinkHealth } from './useLinkHealth'
import { usePopups, type Tone } from './usePopups'

const ZERO = { x: 0, y: 0 }

// Hype popups: when they fire (fractions of the difficulty's top speeds), and how often at most.
const WHEEE_AT = 0.9 // of max linear, forward
const REVERSE_AT = -0.5 // of max linear
const SPIN_AT = 0.9 // of max angular, with almost no forward speed
const HYPE_COOLDOWN_MS = 1500
type Hype = 'fast' | 'back' | 'spin'

function App() {
  const [screen, setScreen] = useState<'setup' | 'play'>('setup')
  const [settings, setSettings] = useState(loadSettings)
  /** raw = where the finger is (drawn); eff = after stupid-mode rotation (commanded). */
  const [drive, setDrive] = useState({ raw: ZERO, eff: ZERO })
  const [hiSpeed, setHiSpeed] = useState(0)

  // Stupid mode: every touch rotates the controls by a new random angle.
  // The ref is what onMove reads: nipplejs fires 'start' and the first 'move'
  // back to back, before React re-renders, so state alone would lag one touch.
  const [stupid, setStupid] = useState(false)
  const angleRef = useRef(0)
  const [touchAngle, setTouchAngle] = useState(0) // display only
  const [touchId, setTouchId] = useState(0)

  // A/B test, one group per game (assigned at PRESS START, revealed on GAME OVER):
  // "random" = normal stupid-mode roulette, "cursed" = every touch is exactly backwards.
  const [experiment, setExperiment] = useState<'random' | 'cursed'>('random')

  // BOB-AI (src/oracle.ts): the AI picks the NEXT stupid-mode rotation in advance, so a touch
  // never waits on it. No curse ready (slow, offline, no key) → plain random, as before.
  const [aiProvider, setAiProvider] = useState<string | null>(null)
  const aiReady = aiProvider !== null
  const nextCurseRef = useRef<Curse | null>(null)
  const curseLoadingRef = useRef(false)
  const recentCursesRef = useRef<{ rotation_deg: number; regret_pct: number }[]>([])
  const curseSourceRef = useRef<'ai' | 'random' | 'cursed' | 'none'>('none')
  const [oracle, setOracle] = useState<{ id: number; text: string } | null>(null)
  useEffect(() => {
    let alive = true
    fetchOracleStatus().then((provider) => {
      if (alive) setAiProvider(provider)
    })
    return () => {
      alive = false
    }
  }, [])

  const { popups, pop } = usePopups()
  const hypeWas = useRef<Record<Hype, boolean>>({ fast: false, back: false, spin: false })
  const hypeAt = useRef<Record<Hype, number>>({ fast: 0, back: 0, spin: 0 })

  useEffect(() => {
    setMuted(settings.muted)
  }, [settings.muted])

  // Regret meter: one Drive per touch (a ref: updated on every move), totals per game.
  const driveRef = useRef<Drive | null>(null)
  const [session, setSession] = useState(EMPTY_SESSION)
  const sessionRef = useRef(session)

  /** Runs after EVERY stop (release, STOP, time up, hidden, connection lost, exit). */
  const endDrive = (reason: string) => {
    const d = driveRef.current
    if (!d) return // stopped while not driving
    driveRef.current = null
    const report = finishDrive(d, performance.now())
    setSession((s) => addDrive(s, report))
    if (report.stupid_mode) {
      // The oracle gets told how its last few curses went.
      recentCursesRef.current = [
        ...recentCursesRef.current,
        { rotation_deg: report.rotation_deg, regret_pct: report.regret_pct },
      ].slice(-3)
    }
    if (report.stupid_mode && report.push_s >= 0.2) {
      const pct = report.regret_pct
      pop(pct === 0 ? 'NO REGRETS!' : `REGRET ${pct}%`, pct >= 50 ? 'red' : pct > 10 ? 'yellow' : 'green')
    }
    track('drive_ended', { reason, ...report, curse_source: report.stupid_mode ? curseSourceRef.current : 'none' })
  }
  const endDriveRef = useRef(endDrive)
  useEffect(() => {
    endDriveRef.current = endDrive
    sessionRef.current = session
  })

  // The connection needs the loop's stop() and the loop needs the connection's send():
  // break the cycle with a ref that's filled in once the loop exists.
  const stopRef = useRef<(reason: string) => void>(() => {})

  // Auto-reconnect: when an ESTABLISHED connection drops, retry with the same settings until
  // it's back or the player leaves. STOP stays latched throughout: after reconnecting, the
  // cart won't move until a new touch, even if a finger is still on the stick.
  const [reconnect, setReconnect] = useState<{ attempt: number; since: number } | null>(null)
  const reconnectRef = useRef(reconnect)
  useEffect(() => {
    reconnectRef.current = reconnect
  })

  const fox = useFoxglove(
    () => {
      stopRef.current('connection lost') // safety first
      setReconnect({ attempt: 0, since: Date.now() })
      sfx.denied()
      track('connection_lost')
    },
    () => {
      const r = reconnectRef.current
      if (!r) return
      setReconnect(null)
      pop('BACK ONLINE!', 'green')
      sfx.coin()
      track('reconnected', { attempts: r.attempt, downtime_s: Math.round((Date.now() - r.since) / 100) / 10 })
    },
  )
  const loop = useCommandLoop(fox.send, (reason) => endDriveRef.current(reason))
  useEffect(() => {
    stopRef.current = loop.stop
  }, [loop.stop])

  // Safety first in every handler: stop()/start() comes before anything cosmetic.
  const coins = useCoins({
    freePlay: settings.freePlay,
    driving: loop.driving,
    onTimeUp: () => {
      loop.stop('time up')
      pop('TIME UP!', 'red')
      sfx.timeUp()
    },
  })

  const health = useLinkHealth({
    connected: fox.status.kind === 'connected',
    signals: fox.linkSignals,
    takeMaxTickGap: loop.takeMaxTickGap,
  })

  // GAME OVER only when we're NOT auto-reconnecting (e.g. the very first connect failed).
  const down = fox.status.kind === 'disconnected' || fox.status.kind === 'error'
  const lost = screen === 'play' && down && !reconnect
  useEffect(() => {
    if (!lost) return
    sfx.gameOver()
    const s = sessionRef.current
    track('game_over', {
      drives: s.drives,
      distance_m: Math.round(s.distanceM * 100) / 100,
      regret_pct: sessionRegretPct(s),
    })
  }, [lost])

  const robot = settings.robot.trim()
  const rider = settings.initials || 'AAA'
  // Stupid mode always runs at HARD's top speed, whatever DIFFICULTY says.
  const speedLevel = stupid ? 'hard' : settings.difficulty
  const { maxLinear, maxAngular } = DIFFICULTIES[speedLevel]
  const heartbeatSet = settings.heartbeatTopic.trim() !== ''
  const connected = fox.status.kind === 'connected'
  useEffect(() => {
    if (connected) track('bob_connected', { robot, heartbeat_topic: heartbeatSet, free_play: settings.freePlay })
  }, [connected, robot, heartbeatSet, settings.freePlay])
  const connect = () => fox.connect(settings.url.trim(), robot, settings.heartbeatTopic.trim())

  /**
   * Ask BOB-AI for the next curse in the background (at most one request in flight).
   * Not in A/B "cursed" games: those ignore the AI, so asking would only burn the free-tier
   * budget. Pass the group when it was just picked and isn't state yet.
   */
  const prefetchCurse = (group: 'random' | 'cursed' = experiment) => {
    if (!aiReady || group === 'cursed' || curseLoadingRef.current || nextCurseRef.current) return
    curseLoadingRef.current = true
    const s = sessionRef.current
    fetchCurse({
      rider,
      difficulty: settings.difficulty,
      drives: s.drives,
      regret_pct: sessionRegretPct(s),
      previous: recentCursesRef.current,
    })
      .then((curse) => {
        nextCurseRef.current = curse
      })
      .finally(() => {
        curseLoadingRef.current = false
      })
  }
  const connectRef = useRef(connect)
  useEffect(() => {
    connectRef.current = connect
  })

  // Retry loop: whenever we're reconnecting and the link is down, try again after a short
  // wait (0.5 s, then 1.5 s, then every 3 s). Each attempt that fails lands back here.
  const attempt = reconnect?.attempt ?? -1
  const statusKind = fox.status.kind
  useEffect(() => {
    if (attempt < 0 || screen !== 'play') return
    if (statusKind !== 'disconnected' && statusKind !== 'error') return
    const delay = attempt === 0 ? 500 : attempt < 3 ? 1500 : 3000
    const id = setTimeout(() => {
      setReconnect((r) => (r ? { ...r, attempt: r.attempt + 1 } : r))
      connectRef.current()
    }, delay)
    return () => clearTimeout(id)
  }, [attempt, statusKind, screen])

  const exit = () => {
    loop.stop('exit') // first zero goes out before the socket closes
    setReconnect(null) // stop retrying
    fox.disconnect()
    setScreen('setup')
  }

  /** Fire a popup on the rising edge of a condition, at most once per cooldown. */
  const hype = (s: Speeds) => {
    const now = Date.now()
    const fire = (key: Hype, on: boolean, text: string, tone: Tone, sound: () => void) => {
      if (on && !hypeWas.current[key] && now - hypeAt.current[key] > HYPE_COOLDOWN_MS) {
        hypeAt.current[key] = now
        pop(text, tone)
        sound()
      }
      hypeWas.current[key] = on
    }
    fire('fast', s.linear >= WHEEE_AT * maxLinear, 'WHEEE!', 'yellow', sfx.whee)
    fire('back', s.linear <= REVERSE_AT * maxLinear, 'REVERSE?!', 'blue', sfx.reverse)
    fire(
      'spin',
      Math.abs(s.angular) >= SPIN_AT * maxAngular && Math.abs(s.linear) < 0.2 * maxLinear,
      'SPIN!',
      'green',
      sfx.blip,
    )
  }

  if (screen === 'setup') {
    return (
      <SetupScreen
        settings={settings}
        onChange={setSettings}
        analytics={analyticsOn()}
        aiProvider={aiProvider}
        onStart={() => {
          // Inside the PRESS START tap: the only moment an iPhone lets the page start talking.
          unlockSpeech(settings.muted, aiReady ? 'BOB-AI online. Prepare to be roasted.' : undefined)
          saveSettings(settings)
          connect()
          setSession(EMPTY_SESSION) // new game, new regret
          // New rider: forget the oracle's previous reading and ask again for them.
          nextCurseRef.current = null
          recentCursesRef.current = []
          setOracle(null)
          sessionRef.current = EMPTY_SESSION // so the oracle's first reading sees the fresh game
          const group = Math.random() < 0.5 ? 'random' : 'cursed'
          setExperiment(group)
          if (stupid) prefetchCurse(group)
          // Every event from here on says who's driving and which test group they're in.
          setAnalyticsContext({ rider, experiment: group, difficulty: settings.difficulty })
          track('game_started')
          setScreen('play')
        }}
      />
    )
  }

  const touchDeg = Math.round((touchAngle * 180) / Math.PI)

  return (
    <PlayScreen
      robot={robot}
      status={fox.status}
      reconnectAttempt={reconnect ? reconnect.attempt : null}
      health={health}
      driving={loop.driving}
      stick={drive.raw}
      speeds={joystickToSpeeds(drive.eff.x, drive.eff.y, maxLinear, maxAngular)}
      hiSpeed={hiSpeed}
      session={session}
      rider={rider}
      experiment={experiment}
      difficulty={DIFFICULTIES[speedLevel].label}
      stats={fox.stats}
      stupid={stupid}
      onStupidChange={(on) => {
        setStupid(on)
        if (on) prefetchCurse()
      }}
      oracle={oracle}
      aiReady={aiReady}
      touchId={touchId}
      touchAngleDeg={touchDeg}
      freePlay={settings.freePlay}
      timeLeft={coins.timeLeft}
      onInsertCoin={() => {
        coins.insert()
        pop('+30 SEC', 'green')
        sfx.coin()
        track('coin_inserted', { coins_total: coins.coins + 1 })
      }}
      muted={settings.muted}
      onMuteToggle={() => {
        const next = { ...settings, muted: !settings.muted }
        unlockSpeech(next.muted) // a tap: lets the voice work if sound was off at PRESS START
        setMuted(next.muted)
        setSettings(next)
        saveSettings(next)
        sfx.blip()
      }}
      popups={popups}
      onStickStart={() => {
        if (!coins.canDrive()) {
          pop('INSERT COIN!', 'yellow')
          sfx.denied()
          return // not driving: nothing is sent
        }
        // Pick this touch's rotation synchronously (never wait on the network here):
        // A/B "cursed" group → always 180°; else BOB-AI's prepared curse; else random.
        const curse = stupid && experiment !== 'cursed' ? nextCurseRef.current : null
        nextCurseRef.current = null
        const source = !stupid ? 'none' : experiment === 'cursed' ? 'cursed' : curse ? 'ai' : 'random'
        angleRef.current = source === 'cursed' ? Math.PI : curse ? curse.angleRad : randomAngle()
        loop.start()
        driveRef.current = startDrive(performance.now(), stupid, angleRef.current)
        const deg = Math.round((angleRef.current * 180) / Math.PI)
        setTouchAngle(angleRef.current)
        setTouchId((n) => n + 1)
        hypeWas.current = { fast: false, back: false, spin: false }
        sfx.blip()
        if (stupid) {
          const verdict = rouletteVerdict(deg)
          if (verdict === 'jackpot') {
            pop('JACKPOT!', 'green')
            sfx.jackpot()
          } else if (verdict === 'cursed') {
            pop('CURSED!', 'red')
            sfx.cursed()
          }
          curseSourceRef.current = source
          if (curse) {
            setOracle({ id: Date.now(), text: curse.reason })
            speak(curse.reason, settings.muted)
          } else if (source === 'random' && aiReady) {
            setOracle({ id: Date.now(), text: 'Still thinking. Random it is.' })
          }
          track('roulette_spin', {
            rotation_deg: deg,
            rotation_bucket: rotationBucket(deg),
            verdict: verdict ?? 'meh',
            curse_source: source,
            ai_reason: curse ? curse.reason.slice(0, 120) : undefined,
          })
          prefetchCurse() // get the next one ready while this drive happens
        }
      }}
      onStickMove={(x, y) => {
        // Rotate BEFORE converting to speeds; length is unchanged, so limits still hold.
        const eff = stupid ? rotate(x, y, angleRef.current) : { x, y }
        const speeds = joystickToSpeeds(eff.x, eff.y, maxLinear, maxAngular)
        loop.update(speeds)
        if (driveRef.current) {
          advanceDrive(driveRef.current, performance.now(), Math.abs(speeds.linear), Math.hypot(x, y))
        }
        setDrive({ raw: { x, y }, eff })
        setHiSpeed((hi) => Math.max(hi, Math.abs(speeds.linear)))
        if (loop.driving) hype(speeds)
      }}
      onStickEnd={() => {
        loop.stop('release')
        setDrive({ raw: ZERO, eff: ZERO })
      }}
      onStop={() => {
        const wasDriving = loop.driving
        loop.stop('button')
        pop('K.O.!', 'red')
        sfx.stop()
        track('stop_pressed', { while_driving: wasDriving })
      }}
      onContinue={connect}
      onExit={exit}
    />
  )
}

export default App
