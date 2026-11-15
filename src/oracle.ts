// Phone side of BOB-AI (server/aiCurse.ts): ask the laptop for the NEXT curse ahead of time,
// so a touch never waits on the AI. Everything here fails soft: null means "use random".

export type Curse = { deg: number; angleRad: number; reason: string }

export type CurseContext = {
  rider: string
  difficulty: string
  drives: number
  regret_pct: number
  previous: { rotation_deg: number; regret_pct: number }[]
}

export async function fetchCurse(ctx: CurseContext, timeoutMs = 15000): Promise<Curse | null> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const res = await fetch('/api/curse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ctx),
      signal: abort.signal,
    })
    if (!res.ok) return null
    const data: unknown = await res.json()
    const d = data as { rotation_deg?: unknown; reason?: unknown }
    if (typeof d.rotation_deg !== 'number' || !Number.isFinite(d.rotation_deg) || typeof d.reason !== 'string') {
      return null
    }
    const deg = ((Math.round(d.rotation_deg) % 360) + 360) % 360
    return { deg, angleRad: (deg * Math.PI) / 180, reason: d.reason.slice(0, 200) }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Which AI provider the laptop has a key for ("groq" / "claude"), or null if none. */
export async function fetchOracleStatus(): Promise<string | null> {
  try {
    const res = await fetch('/api/curse')
    if (!res.ok) return null
    const d = (await res.json()) as { configured?: unknown; provider?: unknown }
    return d.configured && typeof d.provider === 'string' ? d.provider : null
  } catch {
    return null
  }
}

// ---------- the voice ----------
// Phones are picky about speech:
// - iPhone Safari stays silent until the page has spoken once INSIDE a real tap (click or
//   touchend). The stick fires on touchstart/pointerdown, which doesn't count, so PRESS START
//   and the SND button call unlockSpeech().
// - Safari (and sometimes Chrome) drops a speak() that comes right after cancel().
// - The synthesizer can get stuck paused, e.g. after the page was in the background.
// - A phone set to French would read English slang with a French voice.
// A voice is decoration: nothing here may ever throw into the controls.

let current: SpeechSynthesisUtterance | null = null // keep it referenced until it's done

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
}

function utterance(s: SpeechSynthesis, text: string, volume = 1) {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  const voices = s.getVoices() // may be empty until the phone has loaded them; lang still applies
  const voice = voices.find((v) => v.lang === 'en-US' && v.localService) ?? voices.find((v) => v.lang.startsWith('en'))
  if (voice) u.voice = voice
  u.rate = 1.05
  u.pitch = 0.7 // ominous
  u.volume = volume
  u.onend = u.onerror = () => {
    if (current === u) current = null
  }
  return u
}

function say(s: SpeechSynthesis, u: SpeechSynthesisUtterance) {
  current = u
  s.resume()
  if (s.speaking || s.pending) {
    s.cancel() // newest verdict wins
    setTimeout(() => {
      try {
        s.speak(u)
      } catch {
        /* decoration */
      }
    }, 80)
  } else {
    s.speak(u)
  }
}

/**
 * Call from a real tap (a click handler): lets the phone talk later, outside taps.
 * With `greeting` (and sound on) it says it out loud, which doubles as a speaker check.
 */
export function unlockSpeech(muted: boolean, greeting?: string) {
  try {
    const s = synth()
    if (!s) return
    // Silent unlock = a real word at volume 0 (a blank utterance may not count).
    say(s, muted || !greeting ? utterance(s, 'ready', 0) : utterance(s, greeting))
  } catch {
    /* decoration */
  }
}

/** Read the oracle's verdict aloud with the phone's built-in voice. Never throws. */
export function speak(text: string, muted: boolean) {
  try {
    const s = synth()
    if (muted || !s) return
    say(s, utterance(s, text))
  } catch {
    /* a voice is decoration; never let it break the controls */
  }
}
