/**
 * VoxelWorld: chunk store with on-demand generation, player-edit tracking
 * (only deltas are persisted to localStorage) and dirty-chunk bookkeeping
 * so the renderer rebuilds exactly the meshes that changed.
 */
import { Block, CHUNK_SIZE, WORLD_HEIGHT, isSolid } from './blocks'
import { generateChunkData, idx, makeNoise, seedFromString, type NoiseSet } from './worldGen'

export interface RayHit {
  x: number
  y: number
  z: number
  nx: number
  ny: number
  nz: number
  block: Block
  distance: number
}

export class VoxelWorld {
  readonly seed: string
  readonly noise: NoiseSet
  private chunks = new Map<string, Uint8Array>()
  /** chunkKey -> (flat index -> block) — every edit the player made */
  private modifications = new Map<string, Map<number, number>>()
  /** chunk keys that need re-meshing */
  dirty = new Set<string>()

  constructor(seed: string) {
    this.seed = seed
    this.noise = makeNoise(seedFromString(seed))
  }

  static key(cx: number, cz: number): string {
    return `${cx},${cz}`
  }

  getChunk(cx: number, cz: number): Uint8Array {
    const k = VoxelWorld.key(cx, cz)
    let data = this.chunks.get(k)
    if (!data) {
      data = generateChunkData(cx, cz, this.noise)
      const mods = this.modifications.get(k)
      if (mods) for (const [i, b] of mods) data[i] = b
      this.chunks.set(k, data)
    }
    return data
  }

  /** chunk must already exist (meshing guard) */
  peekChunk(cx: number, cz: number): Uint8Array | undefined {
    return this.chunks.get(VoxelWorld.key(cx, cz))
  }

  getBlock(x: number, y: number, z: number): Block {
    if (y < 0 || y >= WORLD_HEIGHT) return Block.Air
    const cx = Math.floor(x / CHUNK_SIZE)
    const cz = Math.floor(z / CHUNK_SIZE)
    const lx = x - cx * CHUNK_SIZE
    const lz = z - cz * CHUNK_SIZE
    return this.getChunk(cx, cz)[idx(lx, y, lz)] as Block
  }

  setBlock(x: number, y: number, z: number, b: Block): void {
    if (y < 0 || y >= WORLD_HEIGHT) return
    const cx = Math.floor(x / CHUNK_SIZE)
    const cz = Math.floor(z / CHUNK_SIZE)
    const lx = x - cx * CHUNK_SIZE
    const lz = z - cz * CHUNK_SIZE
    const data = this.getChunk(cx, cz)
    const i = idx(lx, y, lz)
    if (data[i] === b) return
    data[i] = b
    let mods = this.modifications.get(VoxelWorld.key(cx, cz))
    if (!mods) {
      mods = new Map()
      this.modifications.set(VoxelWorld.key(cx, cz), mods)
    }
    mods.set(i, b)
    this.dirty.add(VoxelWorld.key(cx, cz))
    // edge edits dirty the neighbor chunk (face culling reads across borders)
    if (lx === 0) this.dirty.add(VoxelWorld.key(cx - 1, cz))
    if (lx === CHUNK_SIZE - 1) this.dirty.add(VoxelWorld.key(cx + 1, cz))
    if (lz === 0) this.dirty.add(VoxelWorld.key(cx, cz - 1))
    if (lz === CHUNK_SIZE - 1) this.dirty.add(VoxelWorld.key(cx, cz + 1))
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return isSolid(this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)))
  }

  /** serialization: { [chunkKey]: { index: block } } */
  serializeModifications(): string {
    const out: Record<string, [number, number][]> = {}
    for (const [k, m] of this.modifications) if (m.size) out[k] = [...m.entries()]
    return JSON.stringify(out)
  }

  loadModifications(json: string): void {
    try {
      const parsed = JSON.parse(json) as Record<string, [number, number][]>
      for (const [k, entries] of Object.entries(parsed)) {
        const m = this.modifications.get(k) ?? new Map<number, number>()
        for (const [i, b] of entries) m.set(i, b)
        this.modifications.set(k, m)
        // if chunk already generated, apply immediately
        const data = this.chunks.get(k)
        if (data) for (const [i, b] of entries) data[i] = b
      }
    } catch {
      /* corrupted save — start clean */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Chunk meshing: one InstancedMesh per block type, 6-material boxes.  */
/* ------------------------------------------------------------------ */
import * as THREE from 'three'
import { BLOCKS, type Face } from './blocks'
import { getBlockMaterial } from './textures'

const FACE_ORDER: Face[] = ['side', 'side', 'top', 'bottom', 'side', 'side'] // +x -x +y -y +z -z

/** transparent blocks should not hide their neighbours */
function occludes(neighbor: Block, current: Block): boolean {
  if (neighbor === Block.Air) return false
  const nDef = BLOCKS[neighbor]
  const translucent = neighbor === Block.Water || neighbor === Block.Glass || neighbor === Block.Leaves
  if (!translucent) return nDef.solid
  return neighbor === current // same translucent type -> merge faces
}

export function buildChunkMesh(cx: number, cz: number, world: VoxelWorld): THREE.Group {
  const group = new THREE.Group()
  const data = world.getChunk(cx, cz)
  const ox = cx * CHUNK_SIZE
  const oz = cz * CHUNK_SIZE

  // collect instance transforms per block type
  const perType = new Map<Block, number[]>() // matrix elements flat
  const tmp = new THREE.Matrix4()

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const b = data[idx(x, y, z)] as Block
        if (b === Block.Air) continue
        const wx = ox + x
        const wz = oz + z
        // cull if every neighbour occludes this block
        const neighbors = [
          world.getBlock(wx + 1, y, wz),
          world.getBlock(wx - 1, y, wz),
          world.getBlock(wx, y + 1, wz),
          world.getBlock(wx, y - 1, wz),
          world.getBlock(wx, y, wz + 1),
          world.getBlock(wx, y, wz - 1),
        ]
        if (neighbors.every((n) => occludes(n, b))) continue
        tmp.makeTranslation(wx + 0.5, y + 0.5, wz + 0.5)
        const arr = perType.get(b) ?? []
        arr.push(...tmp.elements)
        perType.set(b, arr)
      }
    }
  }

  const box = new THREE.BoxGeometry(1, 1, 1)
  const reuse = new THREE.Matrix4()
  for (const [b, mats] of perType) {
    const count = mats.length / 16
    const materials = FACE_ORDER.map((f) => getBlockMaterial(b, f))
    const mesh = new THREE.InstancedMesh(box, materials, count)
    mesh.matrixAutoUpdate = false
    mesh.frustumCulled = true
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, reuse.fromArray(mats, i * 16))
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.userData.block = b
    group.add(mesh)
  }
  return group
}

/** DDA voxel raycast from eye position along dir; returns first non-air hit. */
export function raycastVoxel(
  world: VoxelWorld,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist = 6,
): RayHit | null {
  const d = dir.clone().normalize()
  let x = Math.floor(origin.x)
  let y = Math.floor(origin.y)
  let z = Math.floor(origin.z)
  const stepX = Math.sign(d.x) || 1
  const stepY = Math.sign(d.y) || 1
  const stepZ = Math.sign(d.z) || 1
  const tDeltaX = d.x !== 0 ? Math.abs(1 / d.x) : Infinity
  const tDeltaY = d.y !== 0 ? Math.abs(1 / d.y) : Infinity
  const tDeltaZ = d.z !== 0 ? Math.abs(1 / d.z) : Infinity
  let tMaxX = d.x !== 0 ? (stepX > 0 ? (x + 1 - origin.x) : (origin.x - x)) * tDeltaX : Infinity
  let tMaxY = d.y !== 0 ? (stepY > 0 ? (y + 1 - origin.y) : (origin.y - y)) * tDeltaY : Infinity
  let tMaxZ = d.z !== 0 ? (stepZ > 0 ? (z + 1 - origin.z) : (origin.z - z)) * tDeltaZ : Infinity
  let nx = 0
  let ny = 0
  let nz = 0
  let t = 0

  while (t <= maxDist) {
    const b = world.getBlock(x, y, z)
    if (b !== Block.Air && b !== Block.Water) {
      return { x, y, z, nx, ny, nz, block: b, distance: t }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX
      t = tMaxX
      tMaxX += tDeltaX
      nx = -stepX; ny = 0; nz = 0
    } else if (tMaxY < tMaxZ) {
      y += stepY
      t = tMaxY
      tMaxY += tDeltaY
      nx = 0; ny = -stepY; nz = 0
    } else {
      z += stepZ
      t = tMaxZ
      tMaxZ += tDeltaZ
      nx = 0; ny = 0; nz = -stepZ
    }
  }
  return null
}
