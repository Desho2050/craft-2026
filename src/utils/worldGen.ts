/**
 * Procedural terrain: simplex-noise height + moisture + temperature fields
 * select a biome per column, and the column is filled with biome-specific
 * blocks, trees and cacti. Water fills everything below SEA_LEVEL.
 */
import { createNoise2D } from 'simplex-noise'
import { Block, CHUNK_SIZE, WORLD_HEIGHT } from './blocks'

export const SEA_LEVEL = 18

export type Biome = 'plains' | 'forest' | 'desert' | 'taiga'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedFromString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** world-seeded noise field factory */
export function makeNoise(seed: number) {
  const rand = mulberry32(seed)
  return {
    seed,
    height: createNoise2D(rand),
    heightDetail: createNoise2D(rand),
    moisture: createNoise2D(rand),
    temperature: createNoise2D(rand),
  }
}

export type NoiseSet = ReturnType<typeof makeNoise>

export function biomeAt(wx: number, wz: number, n: NoiseSet): Biome {
  const temp = n.temperature(wx / 220, wz / 220)
  const moist = n.moisture(wx / 160, wz / 160)
  if (temp < -0.35) return 'taiga'
  if (temp > 0.3 && moist < 0.05) return 'desert'
  if (moist > 0.15) return 'forest'
  return 'plains'
}

export function heightAt(wx: number, wz: number, n: NoiseSet): number {
  const base = n.height(wx / 110, wz / 110)
  const detail = n.heightDetail(wx / 34, wz / 34)
  // rolling hills, occasional mountains
  const h = 24 + base * 12 + detail * 3 + Math.max(0, base) * 10
  return Math.min(WORLD_HEIGHT - 12, Math.max(3, Math.floor(h)))
}

/** Fill a fresh chunk's Uint8Array with terrain. Origin = (cx*16, cz*16). */
export function generateChunkData(cx: number, cz: number, n: NoiseSet): Uint8Array {
  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
  const ox = cx * CHUNK_SIZE
  const oz = cz * CHUNK_SIZE

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = ox + x
      const wz = oz + z
      const h = heightAt(wx, wz, n)
      const biome = biomeAt(wx, wz, n)
      const underwater = h <= SEA_LEVEL

      const surface =
        biome === 'desert' ? Block.Sand
        : biome === 'taiga' ? Block.Snow
        : Block.Grass

      for (let y = 0; y <= h; y++) {
        let b: Block
        if (y === 0) b = Block.Bedrock
        else if (y < h - 3) b = Block.Stone
        else if (y < h) b = biome === 'desert' ? Block.Sandstone : Block.Dirt
        else b = underwater ? (y === h ? Block.Sand : surface) : surface
        data[idx(x, y, z)] = b
      }
      // water body
      if (underwater) {
        for (let y = h + 1; y <= SEA_LEVEL; y++) data[idx(x, y, z)] = Block.Water
      }
    }
  }

  // decorate: deterministic per-chunk RNG for trees/cacti
  const rand = mulberry32(((ox * 73856093) ^ (oz * 19349663) ^ n.seed) >>> 0)
  const placeTree = (tx: number, ty: number, tz: number, kind: 'oak' | 'spruce') => {
    if (tx < 2 || tx > CHUNK_SIZE - 3 || tz < 2 || tz > CHUNK_SIZE - 3) return
    const trunkH = kind === 'spruce' ? 5 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 2)
    if (ty + trunkH + 2 >= WORLD_HEIGHT) return
    for (let y = 1; y <= trunkH; y++) data[idx(tx, ty + y, tz)] = Block.Log
    const leafTop = kind === 'spruce' ? 2 : 1
    for (let ly = ty + trunkH - leafTop; ly <= ty + trunkH + 1; ly++) {
      const radius = ly === ty + trunkH + 1 ? 1 : 2
      for (let lx = -radius; lx <= radius; lx++)
        for (let lz = -radius; lz <= radius; lz++) {
          if (lx === 0 && lz === 0 && ly <= ty + trunkH) continue
          const px = tx + lx
          const pz = tz + lz
          if (px < 0 || px >= CHUNK_SIZE || pz < 0 || pz >= CHUNK_SIZE) continue
          if (Math.abs(lx) === radius && Math.abs(lz) === radius && rand() < 0.5) continue
          if (data[idx(px, ly, pz)] === Block.Air) data[idx(px, ly, pz)] = Block.Leaves
        }
    }
  }

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = ox + x
      const wz = oz + z
      const h = heightAt(wx, wz, n)
      if (h <= SEA_LEVEL) continue
      const biome = biomeAt(wx, wz, n)
      const roll = rand()
      if (biome === 'forest' && roll < 0.045) placeTree(x, h, z, 'oak')
      else if (biome === 'taiga' && roll < 0.035) placeTree(x, h, z, 'spruce')
      else if (biome === 'plains' && roll < 0.006) placeTree(x, h, z, 'oak')
      else if (biome === 'desert' && roll < 0.012) {
        // cactus, 1-3 tall
        const ch = 1 + Math.floor(rand() * 3)
        for (let y = 1; y <= ch && h + y < WORLD_HEIGHT; y++) data[idx(x, h + y, z)] = Block.Cactus
      }
    }
  }
  return data
}

/** flat index helper — y-major bands read well for column access */
export const idx = (x: number, y: number, z: number): number =>
  x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE
