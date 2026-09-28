/**
 * Procedural 16x16 pixel textures for every block face.
 * Zero external downloads required — textures are generated on a canvas at boot
 * with a deterministic RNG per pattern, so every client sees identical blocks.
 *
 * To use real art packs instead: drop PNGs into /public/textures/<name>.png
 * and TEXTURE_OVERRIDES below picks them up automatically.
 */
import * as THREE from 'three'
import { BLOCKS, Block, type Face, type PatternDef } from './blocks'

const SIZE = 16

/** deterministic PRNG (mulberry32) so textures are identical every run */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

type Px = (x: number, y: number, color: string, alpha?: number) => void

function drawPattern(ctx: CanvasRenderingContext2D, p: PatternDef, seed: number): void {
  const r = rng(seed)
  const put: Px = (x, y, c, a = 1) => {
    ctx.globalAlpha = a
    ctx.fillStyle = c
    ctx.fillRect(x, y, 1, 1)
  }
  const fillAll = (c: string) => {
    ctx.globalAlpha = 1
    ctx.fillStyle = c
    ctx.fillRect(0, 0, SIZE, SIZE)
  }

  switch (p.kind) {
    case 'noise': {
      fillAll(p.colors[0])
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++)
          put(x, y, p.colors[Math.floor(r() * p.colors.length)])
      break
    }
    case 'grass': {
      // dirt base with speckles
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++)
          put(x, y, r() < 0.2 ? p.speck : p.dirt)
      // grass lip on top with ragged edge
      const lip = 3 + Math.floor(r() * 2)
      for (let x = 0; x < SIZE; x++) {
        const h = lip + Math.floor(r() * 2)
        for (let y = 0; y < h; y++) put(x, y, p.grass)
      }
      break
    }
    case 'logRings': {
      fillAll(p.bark)
      if (r() < 0.5) {
        // vertical bark stripes
        for (let x = 0; x < SIZE; x++)
          for (let y = 0; y < SIZE; y++) if (x % 4 === 1) put(x, y, p.ring, 0.35)
      } else {
        // concentric rings
        const cx = SIZE / 2
        for (let y = 0; y < SIZE; y++)
          for (let x = 0; x < SIZE; x++) {
            const d = Math.hypot(x - cx + 0.5, y - cx + 0.5)
            if (Math.floor(d) % 2 === 0) put(x, y, p.ring)
          }
      }
      break
    }
    case 'planks': {
      fillAll(p.base)
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) if (r() < 0.08) put(x, y, p.line, 0.5)
      // horizontal seams every 4px + staggered nail marks
      for (let y = 3; y < SIZE; y += 4) for (let x = 0; x < SIZE; x++) put(x, y, p.line)
      for (let y = 0; y < SIZE; y += 4) {
        const nx = Math.floor(r() * SIZE)
        put(nx, y + 1, p.line)
        put(nx, y + 2, p.line)
      }
      break
    }
    case 'leaves': {
      fillAll(p.base)
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const v = r()
          if (v < 0.22) put(x, y, p.dark)
          else if (v < 0.4) put(x, y, p.light)
        }
      break
    }
    case 'glass': {
      fillAll(p.tint)
      ctx.globalAlpha = 0.55
      ctx.clearRect(2, 2, SIZE - 4, SIZE - 4)
      ctx.globalAlpha = 1
      for (let i = 0; i < SIZE; i++) {
        put(i, 0, p.frame)
        put(i, SIZE - 1, p.frame)
        put(0, i, p.frame)
        put(SIZE - 1, i, p.frame)
      }
      // highlight streak
      for (let i = 3; i < 8; i++) put(i, 10 - i, '#ffffff', 0.5)
      break
    }
    case 'water': {
      fillAll(p.base)
      for (let y = 0; y < SIZE; y += 3)
        for (let x = 0; x < SIZE; x++) if (r() < 0.6) put(x, y + Math.floor(r() * 2), p.wave)
      break
    }
    case 'cactus': {
      fillAll(p.base)
      for (let y = 0; y < SIZE; y++) {
        put(2, y, p.dark)
        put(8, y, p.dark, 0.6)
        put(14, y, p.dark)
        for (let x = 0; x < SIZE; x++) if (r() < 0.04) put(x, y, '#e8f5d0', 0.8) // spines
      }
      break
    }
    case 'cobble': {
      fillAll(p.base)
      // rounded stone blobs
      for (let by = 0; by < 4; by++)
        for (let bx = 0; bx < 4; bx++) {
          const ox = bx * 4 + 1 + Math.floor(r() * 2)
          const oy = by * 4 + 1 + Math.floor(r() * 2)
          for (let y = 0; y < 3; y++)
            for (let x = 0; x < 3; x++) {
              const edge = x === 0 || y === 0 || x === 2 || y === 2
              const c = edge ? p.dark : r() < 0.3 ? p.light : p.base
              const px = oy + y
              const py = ox + x
              if (px < SIZE && py < SIZE) put(px, py, c)
            }
        }
      break
    }
  }
  ctx.globalAlpha = 1
}

const cache = new Map<string, THREE.Texture>()

/**
 * PNG overrides loaded from /public/textures (CC0 art, see ASSETS.md).
 * Anything not listed here falls back to the procedural generator above.
 */
export const TEXTURE_OVERRIDES: Record<string, string> = {
  'grass.top': '/textures/grass_top.png',
  'grass.side': '/textures/grass_side.png',
  'grass.bottom': '/textures/dirt.png',
  'dirt.top': '/textures/dirt.png',
  'stone.top': '/textures/stone.png',
  'cobblestone.top': '/textures/cobblestone.png',
  'sand.top': '/textures/sand.png',
  'planks.top': '/textures/planks.png',
  'planks.side': '/textures/planks.png',
  'planks.bottom': '/textures/planks.png',
  'leaves.top': '/textures/leaves.png',
  'leaves.side': '/textures/leaves.png',
  'leaves.bottom': '/textures/leaves.png',
  'water.top': '/textures/water.png',
  'bedrock.top': '/textures/bedrock.png',
}

const loader = new THREE.TextureLoader()
const pngCache = new Map<string, THREE.Texture>()

function makeProcedural(block: Block, face: Face): THREE.Texture {
  const key = `${Block[block]}.${face}`
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  drawPattern(ctx, BLOCKS[block][face], hashStr(key))
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function getTexture(block: Block, face: Face): THREE.Texture {
  const key = `${Block[block]}.${face}`
  const override = TEXTURE_OVERRIDES[key]
  if (override) {
    let t = pngCache.get(override)
    if (!t) {
      t = loader.load(override)
      t.magFilter = THREE.NearestFilter
      t.minFilter = THREE.NearestFilter
      t.colorSpace = THREE.SRGBColorSpace
      pngCache.set(override, t)
    }
    return t
  }
  let tex = cache.get(key)
  if (!tex) {
    tex = makeProcedural(block, face)
    cache.set(key, tex)
  }
  return tex
}

/** dataURL of a block's side texture — used as DOM icon in hotbar/inventory */
export function blockIconDataURL(block: Block): string {
  const tex = getTexture(block, 'side')
  const canvas = tex.image as HTMLCanvasElement
  if (canvas.toDataURL) return canvas.toDataURL()
  return ''
}

/** DOM icon source for a block: PNG override URL when present, else procedural dataURL */
export function blockIconSrc(block: Block): string {
  const name = Block[block]
  const override = TEXTURE_OVERRIDES[`${name}.side`] ?? TEXTURE_OVERRIDES[`${name}.top`]
  if (override) return override
  return blockIconDataURL(block)
}

/** One shared material per (block, face) — huge win for draw-call batching */
const materialCache = new Map<string, THREE.MeshLambertMaterial>()

export function getBlockMaterial(block: Block, face: Face): THREE.MeshLambertMaterial {
  const key = `${block}.${face}`
  let m = materialCache.get(key)
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      map: getTexture(block, face),
      transparent: block === Block.Glass || block === Block.Water,
      opacity: block === Block.Water ? 0.75 : block === Block.Glass ? 0.65 : 1,
    })
    materialCache.set(key, m)
  }
  return m
}
