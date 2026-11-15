/**
 * Arcade "difficulty" = speed limits. All within the cart's own limits (jiro: 2.29 m/s, 3.0 rad/s);
 * the cart's controller clamps anything above those anyway.
 */
export const DIFFICULTIES = {
  easy: { label: 'EASY', maxLinear: 0.5, maxAngular: 1.0 },
  normal: { label: 'NORMAL', maxLinear: 1.0, maxAngular: 1.5 },
  hard: { label: 'HARD', maxLinear: 2.0, maxAngular: 2.5 },
} as const
export type Difficulty = keyof typeof DIFFICULTIES

/** What PLAYER 1 sets once; remembered on this phone so it isn't retyped at the event. */
export type Settings = {
  difficulty: Difficulty
  /** Arcade-style 3 letters; the regret leaderboard groups by these. Empty = "AAA". */
  initials: string
  url: string
  robot: string
  /** Optional robot topic (e.g. /cart/joint_states) whose freshness drives the Wi-Fi hearts. */
  heartbeatTopic: string
  /** Skip insert-coin: drive without the 30 s timer. */
  freePlay: boolean
  muted: boolean
}

const KEY = 'shopping-cart-robot.settings'

const defaults = (): Settings => ({
  difficulty: 'normal',
  initials: '',
  // The page's own host: on the phone that's the laptop running the dev server.
  url: `ws://${window.location.hostname || 'localhost'}:8765`,
  robot: '',
  heartbeatTopic: '',
  freePlay: false,
  muted: false,
})

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = { ...defaults(), ...JSON.parse(raw) }
      if (!(saved.difficulty in DIFFICULTIES)) saved.difficulty = 'normal'
      return saved
    }
  } catch {
    /* storage blocked or corrupt: fall back to defaults */
  }
  return defaults()
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* private mode etc.: settings just won't be remembered */
  }
}
