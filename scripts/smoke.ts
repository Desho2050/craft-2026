// Headless engine smoke test (scratch file — run with:
//   node --experimental-transform-types scripts/smoke.ts)
import { VoxelWorld, raycastVoxel } from '../src/utils/world.ts'
import { Block, CHUNK_SIZE, WORLD_HEIGHT } from '../src/utils/blocks.ts'
import { findRecipe } from '../src/utils/recipes.ts'
import { APPLE, ROTTEN_FLESH, SWORD } from '../src/utils/recipes.ts'
import { EYE_HEIGHT } from '../src/utils/collision.ts'
import { isBlockShapeValid, overlapsPlayer, withinReach } from '../src/net/validate.ts'
import { setParticleHooks } from '../src/utils/particles.ts'
import { useGameStore, MAX_MOBS, MOB_MAX_HEALTH, DESPAWN_RADIUS } from '../src/store/useGameStore.ts'
import * as THREE from 'three'

let failures = 0
// store toasts dispatch DOM events — stub enough of window for headless runs
;(globalThis as Record<string, unknown>).window = { dispatchEvent: () => {} }
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}

const world = new VoxelWorld('smoke-seed')

// column sanity
check('bedrock at y=0', world.getBlock(8, 0, 8) === Block.Bedrock)
let surface = -1
for (let y = WORLD_HEIGHT - 1; y >= 0; y--)
  if (world.getBlock(8, y, 8) !== Block.Air) { surface = y; break }
check('terrain has a surface', surface > 0)
check('surface is a real block', [Block.Grass, Block.Sand, Block.Snow, Block.Stone, Block.Water, Block.Sandstone].includes(world.getBlock(8, surface, 8)))
check('stone under dirt', world.getBlock(8, Math.max(1, surface - 5), 8) === Block.Stone)

// determinism: same seed -> same block
const w2 = new VoxelWorld('smoke-seed')
check('deterministic terrain', w2.getBlock(8, surface, 8) === world.getBlock(8, surface, 8))
const w3 = new VoxelWorld('other-seed')
let diff = false
for (let x = 0; x < 40; x += 7) for (let z = 0; z < 40; z += 7) {
  const a = world.getBlock(x, 25, z)
  const b = w3.getBlock(x, 25, z)
  if (a !== b) diff = true
}
check('different seeds differ', diff)

// edits + persistence round-trip
world.setBlock(8, surface + 1, 8, Block.Planks)
check('setBlock works', world.getBlock(8, surface + 1, 8) === Block.Planks)
check('chunk marked dirty', world.dirty.size > 0)
const json = world.serializeModifications()
const w4 = new VoxelWorld('smoke-seed')
w4.loadModifications(json)
check('modifications survive save/load', w4.getBlock(8, surface + 1, 8) === Block.Planks)

// raycast straight down hits the placed plank
const hit = raycastVoxel(world, new THREE.Vector3(8.5, surface + 10, 8.5), new THREE.Vector3(0, -1, 0), 20)
check('raycast hits block', !!hit)
check('raycast hit is the plank', hit?.block === Block.Planks)
check('raycast normal up', hit?.ny === 1)

// biomes: scan a wide area, expect multiple biome types
const seen = new Set<string>()
for (let x = -400; x <= 400; x += 25) for (let z = -400; z <= 400; z += 25) {
  const h = world.getBlock(x, 30, z)
  if (h !== Block.Air) seen.add(String(h))
}
check('multiple block types across world', seen.size >= 3)

// crafting: 2x2 grid of sand -> glass; log -> 4 planks
const g2 = [Block.Sand, Block.Sand, Block.Sand, Block.Sand]
check('sand x4 -> glass', findRecipe(g2 as number[], 2)?.result.item === Block.Glass)
const g3 = [Block.Log, null, null, null]
check('log -> 4 planks', findRecipe(g3 as number[], 2)?.result.count === 4)
const pick = [Block.Planks, Block.Planks, Block.Planks, null, 100 /*stick*/, null, null, 100, null]
check('3x3 -> pickaxe', findRecipe(pick as number[], 3)?.result.item === 101)

// chunk data shape
const data = world.getChunk(0, 0)
check('chunk array size', data.length === CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT)

/* ---------- food / combat ---------- */
const store = useGameStore.getState()
store.startGame({ seed: 'smoke-survival', mode: 'survival' })
const s0 = useGameStore.getState()
check('survival spawns mob ring', s0.mobs.length === MAX_MOBS)
check('mobs carry health', s0.mobs.every((m) => m.health === MOB_MAX_HEALTH))
check('starter kit in hotbar', s0.hotbar[0]?.item === Block.Planks)

useGameStore.setState({ hunger: 6, selectedSlot: 0 })
s0.setSel(0, { item: APPLE, count: 2 })
useGameStore.getState().eat()
check('apple restores hunger', useGameStore.getState().hunger === 11)
check('eating consumes one', useGameStore.getState().hotbar[0]?.count === 1)
s0.setSel(1, { item: Block.Dirt, count: 1 })
useGameStore.setState({ selectedSlot: 1, hunger: 6 })
useGameStore.getState().eat()
check('non-food is not eaten', useGameStore.getState().hunger === 6)

// melee: sword 2 blocks ahead at eye height
const target = useGameStore.getState().mobs[0]
useGameStore.setState({ runtime: { pos: [target.x - 2, target.y, target.z], onGround: true } })
const eye = { x: target.x - 2, y: target.y + EYE_HEIGHT, z: target.z }
const aim = { x: 1, y: 0, z: 0 }
s0.setSel(0, { item: SWORD, count: 1 })
useGameStore.setState({ selectedSlot: 0 })
check('sword hit damages mob', useGameStore.getState().attack(aim, eye) && useGameStore.getState().mobs[0].health === MOB_MAX_HEALTH - 5)
useGameStore.getState().attack(aim, eye)
check('second hit kills and despawns', useGameStore.getState().mobs.length === MAX_MOBS - 1)
check('kill drops rotten flesh', useGameStore.getState().hotbar.some((h) => h?.item === ROTTEN_FLESH))
s0.setSel(0, { item: Block.Dirt, count: 1 })
check('no sword = no attack', !useGameStore.getState().attack(aim, eye))

// population: a maintain tick refills the ring and strands mobs far behind
const pm = useGameStore.getState().runtime.pos
const pre = useGameStore.getState().mobs
useGameStore.setState({ mobs: [{ ...pre[0], x: pm[0] + 500, z: pm[2] + 500 }, ...pre.slice(1)] })
useGameStore.getState().maintainMobs()
const post = useGameStore.getState().mobs
check('maintain refills to cap', post.length === MAX_MOBS)
check('stranded mobs despawn', post.every((m) => Math.hypot(m.x - pm[0], m.z - pm[2]) <= DESPAWN_RADIUS))
check('mob ids stay unique', new Set(post.map((m) => m.id)).size === post.length)

/* ---------- break / place VFX wiring ---------- */
const bursts: { b: number; n: number }[] = []
setParticleHooks({ burst: (b, _x, _y, _z, n) => bursts.push({ b, n }) })
const wm = useGameStore.getState().world!
const bp = useGameStore.getState().runtime.pos
const bx = Math.round(bp[0]) + 4
const by = Math.round(bp[1]) + 1
const bz = Math.round(bp[2])
wm.setBlock(bx, by, bz, Block.Air)
s0.setSel(0, { item: Block.Dirt, count: 10 })
useGameStore.setState({ selectedSlot: 0 })
check('place puts a block', s0.placeBlock(bx, by, bz) && wm.getBlock(bx, by, bz) === Block.Dirt)
check('place bursts particles', bursts.at(-1)?.b === Block.Dirt && (bursts.at(-1)?.n ?? 0) > 0)
check('break clears the block', s0.breakBlock(bx, by, bz) && wm.getBlock(bx, by, bz) === Block.Air)
check('break bursts particles', bursts.at(-1)?.b === Block.Dirt && (bursts.at(-1)?.n ?? 0) > 0)
setParticleHooks(null)

/* ---------- MP relay validation ---------- */
const near = { x: 10, y: 20, z: 10 }
check('shape: valid edit', isBlockShapeValid(10, 20, 10, Block.Stone))
check('shape: air allowed', isBlockShapeValid(10, 20, 10, Block.Air))
check('shape: y out of world', !isBlockShapeValid(10, WORLD_HEIGHT, 10, Block.Stone))
check('shape: unknown block id', !isBlockShapeValid(10, 20, 10, 99))
check('shape: fractional coords', !isBlockShapeValid(10.5, 20, 10, Block.Stone))
check('shape: outside xz limit', !isBlockShapeValid(99999, 20, 10, Block.Stone))
check('reach: block in front', withinReach(near, { x: 12, y: 20, z: 10 }, 1, 0, 0))
check('reach: 60 blocks away', !withinReach(near, { x: 70, y: 20, z: 10 }, 1, 0, 0))
check('reach: behind the player', !withinReach({ x: 10.5, y: 20, z: 10.5 }, { x: 7, y: 20, z: 10 }, 1, 0.05, 0))
check('bury: block in the body column', overlapsPlayer(near, 10, 20, 10) && overlapsPlayer(near, 10, 21, 10))
check('bury: block above the head is safe', !overlapsPlayer(near, 10, 22, 10))
check('bury: two columns away is safe', !overlapsPlayer(near, 12, 20, 10))
check('bury: grazed adjacent column is safe', !overlapsPlayer({ x: 10.5, y: 20, z: 10.5 }, 11, 20, 10))
check('bury: block sunk into the box is caught', overlapsPlayer({ x: 10.9, y: 20, z: 10.5 }, 11, 20, 10))

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
