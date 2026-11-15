// 8-bit sound effects generated with Web Audio: no audio files to load.
// Sound is decoration, so nothing here may ever throw into a caller (STOP included).

type Note = {
  f: number // start frequency, Hz
  t: number // start offset, s
  d: number // duration, s
  to?: number // slide to this frequency
  type?: OscillatorType
  vol?: number
}

let ctx: AudioContext | null = null
let muted = false

export function setMuted(on: boolean) {
  muted = on
}

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    // Phones start the context suspended until a touch; every call here comes from one.
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined)
    return ctx
  } catch {
    return null
  }
}

function play(notes: Note[]) {
  if (muted) return
  try {
    const a = audio()
    if (!a) return
    const now = a.currentTime
    for (const n of notes) {
      const osc = a.createOscillator()
      const gain = a.createGain()
      osc.type = n.type ?? 'square'
      osc.frequency.setValueAtTime(n.f, now + n.t)
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, now + n.t + n.d)
      gain.gain.setValueAtTime(n.vol ?? 0.05, now + n.t)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d)
      osc.connect(gain).connect(a.destination)
      osc.start(now + n.t)
      osc.stop(now + n.t + n.d + 0.02)
    }
  } catch {
    /* never let a sound break the controls */
  }
}

const arp = (freqs: number[], step: number, d = step): Note[] =>
  freqs.map((f, i) => ({ f, t: i * step, d }))

export const sfx = {
  blip: () => play([{ f: 660, t: 0, d: 0.06 }]),
  stop: () => play([{ f: 300, t: 0, d: 0.3, to: 50, type: 'sawtooth', vol: 0.07 }]),
  coin: () => play([{ f: 988, t: 0, d: 0.08 }, { f: 1319, t: 0.08, d: 0.3 }]),
  denied: () => play([{ f: 150, t: 0, d: 0.12 }, { f: 110, t: 0.15, d: 0.2 }]),
  whee: () => play([{ f: 300, t: 0, d: 0.35, to: 1400, type: 'triangle', vol: 0.08 }]),
  reverse: () => play(arp([880, 660, 880, 660], 0.09)),
  jackpot: () => play(arp([523, 659, 784, 1047, 1319], 0.07, 0.12)),
  cursed: () => play([{ f: 233, t: 0, d: 0.4, type: 'sawtooth' }, { f: 165, t: 0, d: 0.4, type: 'sawtooth' }]),
  timeUp: () => play(arp([784, 659, 523], 0.15, 0.2)),
  gameOver: () => play(arp([392, 370, 349, 330], 0.22, 0.3).concat({ f: 262, t: 0.9, d: 0.6, to: 131 })),
}
