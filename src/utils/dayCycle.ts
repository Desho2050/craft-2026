/**
 * Day/night cycle math — pure functions of a 0..1 clock so the lighting can be
 * asserted headlessly and animated by mutating three objects, never React state.
 * time 0 is sunrise (06:00), 0.25 noon, 0.5 sunset, 0.75 midnight.
 */
export const DAY_LENGTH = 600 // seconds for a full cycle
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

export interface SkyState {
  /** unit-ish sun direction scaled for <Sky> and the directional light */
  sun: [number, number, number]
  /** 0..1 how much of the sky is lit — drives every other value */
  light: number
  sunIntensity: number
  sunColor: string
  ambient: number
  hemi: number
  fogColor: string
  fogNear: number
  fogFar: number
  rayleigh: number
  turbidity: number
  /** star layer opacity */
  stars: number
  phase: DayPhase
  /** 24h wall clock, e.g. "18:40" */
  clock: string
}

type RGB = [number, number, number]

const NIGHT: RGB = [13, 20, 40]
const DAY: RGB = [207, 232, 255]
const DUSK: RGB = [236, 140, 78]
const SUN_HIGH: RGB = [255, 246, 224]
const SUN_LOW: RGB = [255, 150, 74]

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function hex(c: RGB): string {
  const part = (v: number) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0')
  return `#${part(c[0])}${part(c[1])}${part(c[2])}`
}

export function advanceDay(time: number, dt: number): number {
  const next = (time + dt / DAY_LENGTH) % 1
  return next < 0 ? next + 1 : next
}

export function phaseOf(time: number): DayPhase {
  const theta = time * Math.PI * 2
  const sunY = Math.sin(theta)
  if (sunY > 0.15) return 'day'
  if (sunY < -0.12) return 'night'
  // sun still climbing = dawn, sinking = dusk
  return Math.cos(theta) > 0 ? 'dawn' : 'dusk'
}

export function skyAt(time: number): SkyState {
  const theta = time * Math.PI * 2
  const sunY = Math.sin(theta)
  const sunX = -Math.cos(theta)
  // how high the sun is, flattened near the horizon so dawn/dusk linger
  const light = clamp01(sunY * 1.8 + 0.22)
  const horizon = 1 - Math.min(1, Math.abs(sunY) * 3)

  const fog = mix(mix(NIGHT, DAY, light), DUSK, horizon * 0.7)
  const sunColor = mix(SUN_HIGH, SUN_LOW, horizon)

  return {
    sun: [sunX * 100, sunY * 100, 32],
    light,
    sunIntensity: 0.08 + light * 1.12,
    sunColor: hex(sunColor),
    // never fully black: without torches yet, a pitch-dark night is unplayable
    ambient: 0.3 + light * 0.4,
    hemi: 0.16 + light * 0.4,
    fogColor: hex(fog),
    fogNear: 28 + light * 16,
    fogFar: 130 + light * 60,
    rayleigh: 0.45 + horizon * 1.7,
    turbidity: 2 + horizon * 6,
    stars: clamp01(1 - light * 4),
    phase: phaseOf(time),
    clock: clockOf(time),
  }
}

export function clockOf(time: number): string {
  const minutes = Math.floor(((time + 0.25) % 1) * 24 * 60)
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}
