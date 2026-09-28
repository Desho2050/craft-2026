// Headless engine smoke test (scratch file — run with:
//   node --experimental-transform-types scripts/smoke.ts)
import { VoxelWorld, raycastVoxel } from '../src/utils/world.ts'
import { Block, CHUNK_SIZE, WORLD_HEIGHT } from '../src/utils/blocks.ts'
import { findRecipe } from '../src/utils/recipes.ts'
import * as THREE from 'three'

let failures = 0
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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
