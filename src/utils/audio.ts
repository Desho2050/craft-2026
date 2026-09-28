/**
 * Procedural SFX: every sound is synthesised from noise bursts and oscillator
 * sweeps, so the build ships zero audio files (same philosophy as the
 * procedural textures) and stays licence-free. The AudioContext is created
 * lazily on the first sound, which always happens inside a user gesture.
 */
export type Sfx = 'break' | 'place' | 'step' | 'eat' | 'hit' | 'hurt' | 'growl' | 'click' | 'craft'

const MASTER = 0.32
/** same sound twice inside this window is dropped — footsteps spam otherwise */
const THROTTLE = 0.045

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null
let enabled = true
let plays = 0
const lastAt = new Map<Sfx, number>()

export function setSfxEnabled(on: boolean): void {
  enabled = on
  if (ctx && master) master.gain.value = on ? MASTER : 0
}

export function sfxEnabled(): boolean {
  return enabled
}

/** automation seam: lets tests confirm the engine actually woke up */
export function audioDebug(): { state: string; plays: number; hasCtx: boolean } {
  return { state: ctx?.state ?? 'none', plays, hasCtx: !!ctx }
}

function ensure(): boolean {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return enabled
  }
  if (typeof window === 'undefined') return false
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return false
  ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = enabled ? MASTER : 0
  master.connect(ctx.destination)
  const frames = Math.floor(ctx.sampleRate * 0.6)
  noise = ctx.createBuffer(1, frames, ctx.sampleRate)
  const channel = noise.getChannelData(0)
  for (let i = 0; i < frames; i++) channel[i] = Math.random() * 2 - 1
  return enabled
}

/** filtered noise with a sweeping lowpass — the "crunch" family */
function crunch(dur: number, from: number, to: number, gain: number, q = 1): void {
  if (!ctx || !master || !noise) return
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.8 + Math.random() * 0.4
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = q
  lp.frequency.setValueAtTime(from, t)
  lp.frequency.exponentialRampToValueAtTime(Math.max(60, to), t + dur)
  const env = ctx.createGain()
  env.gain.setValueAtTime(gain, t)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(lp).connect(env).connect(master)
  src.start(t, Math.random() * 0.3)
  src.stop(t + dur)
}

/** oscillator glide — the "tonal" family */
function tone(dur: number, from: number, to: number, type: OscillatorType, gain: number, delay = 0): void {
  if (!ctx || !master) return
  const t = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(from, t)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur)
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + 0.012)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(env).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

const VOICES: Record<Sfx, () => void> = {
  break: () => {
    crunch(0.22, 2400, 300, 0.5, 1.6)
    tone(0.09, 180, 70, 'triangle', 0.25)
  },
  place: () => {
    crunch(0.09, 900, 260, 0.32, 2)
    tone(0.07, 300, 140, 'sine', 0.2)
  },
  step: () => crunch(0.06, 500, 160, 0.16, 1.2),
  eat: () => {
    crunch(0.1, 1200, 400, 0.26, 3)
    tone(0.12, 320, 200, 'sine', 0.14, 0.09)
  },
  hit: () => {
    crunch(0.05, 3200, 900, 0.3, 1)
    tone(0.13, 260, 70, 'square', 0.22)
  },
  hurt: () => {
    tone(0.28, 200, 85, 'sawtooth', 0.3)
    crunch(0.12, 700, 200, 0.18, 1.4)
  },
  growl: () => {
    tone(0.5, 95, 62, 'sawtooth', 0.12)
    tone(0.42, 63, 48, 'triangle', 0.1, 0.05)
  },
  click: () => tone(0.05, 1100, 780, 'sine', 0.16),
  craft: () => {
    tone(0.08, 620, 620, 'sine', 0.16)
    tone(0.1, 930, 930, 'sine', 0.14, 0.07)
  },
}

export function playSfx(name: Sfx): void {
  if (!ensure()) return
  if (!ctx) return
  const now = ctx.currentTime
  const prev = lastAt.get(name)
  if (prev !== undefined && now - prev < THROTTLE) return
  lastAt.set(name, now)
  plays++
  VOICES[name]()
}
