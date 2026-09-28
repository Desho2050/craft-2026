// Physics playtest — replicates exactly what Player.useFrame does each tick,
// but headless. Run: node --import jiti/register scripts/physics.ts
import * as THREE from 'three'
import { VoxelWorld, raycastVoxel } from '../src/utils/world.ts'
import { Block } from '../src/utils/blocks.ts'
import { stepPlayer, canJump, surfaceY, PLAYER_HEIGHT } from '../src/utils/collision.ts'

let failures = 0
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`)
  if (!ok) failures++
}

const world = new VoxelWorld('physics-1')
const DT = 1 / 60
const tick = (pos: THREE.Vector3, vel: THREE.Vector3, intent: THREE.Vector3, flying = false) =>
  stepPlayer(world, pos, vel, intent, DT, flying)

const sx = 8.5
const sz = 8.5
const ground = surfaceY(world, sx, sz)

// 1. fall from the air and settle on terrain
{
  const pos = new THREE.Vector3(sx, ground + 8, sz)
  const vel = new THREE.Vector3()
  let onGround = false
  for (let i = 0; i < 240 && !onGround; i++) onGround = tick(pos, vel, new THREE.Vector3()).onGround
  check('falls and lands', onGround)
  check('lands on surface', Math.abs(pos.y - ground) < 0.01, { y: +pos.y.toFixed(2), ground })
}

// 2. walking forward at ground level keeps y stable and moves x/z
{
  const pos = new THREE.Vector3(sx, ground, sz)
  const vel = new THREE.Vector3()
  const fwd = new THREE.Vector3(1, 0, 0)
  for (let i = 0; i < 120; i++) tick(pos, vel, fwd)
  check('walked forward', pos.x > sx + 2, { x: +pos.x.toFixed(1) })
  check('no vertical drift while walking flat', Math.abs(pos.y - ground) < 0.01, { y: +pos.y.toFixed(2) })
}

// 3. wall collision: build a 3-tall wall, run into it
{
  const wx = Math.floor(pos100())
  for (let y = ground - 1; y <= ground + 2; y++) for (let z = -2; z <= 2; z++) world.setBlock(wx + 3, y, Math.floor(sz) + z, Block.Stone)
  const pos = new THREE.Vector3(wx + 0.5, ground, sz)
  const vel = new THREE.Vector3()
  for (let i = 0; i < 180; i++) tick(pos, vel, new THREE.Vector3(1, 0, 0))
  check('stops at wall, never tunnels', pos.x < wx + 3 - 0.29, { x: +pos.x.toFixed(2), wallX: wx + 3 })
}
function pos100() { return 60 }

// 4. jump arc: up and back down to the same spot
{
  const pos = new THREE.Vector3(sx, ground, sz)
  const vel = new THREE.Vector3()
  tick(pos, vel, new THREE.Vector3()) // settle
  vel.y = 8.2
  let peak = pos.y
  let landed = false
  for (let i = 0; i < 180; i++) {
    const r = tick(pos, vel, new THREE.Vector3())
    peak = Math.max(peak, pos.y)
    if (r.onGround && i > 30) { landed = true; break }
  }
  check('jump peaks > 1 block', peak > ground + 1.2, { peak: +peak.toFixed(2) })
  check('jump lands back', landed && Math.abs(pos.y - ground) < 0.01)
  check('canJump true on ground', canJump(world, pos))
}

// 5. creative flight: up when intent.y=1, down when -1, no gravity drift
{
  const pos = new THREE.Vector3(sx, ground + 10, sz)
  const vel = new THREE.Vector3()
  for (let i = 0; i < 60; i++) tick(pos, vel, new THREE.Vector3(0, 1, 0), true)
  const risen = pos.y > ground + 11
  for (let i = 0; i < 120; i++) tick(pos, vel, new THREE.Vector3(0, -1, 0), true)
  const descended = pos.y < ground + 11
  check('fly up', risen, { y: +pos.y.toFixed(1) })
  check('fly down', descended)
  check('fly lands on ground not through it', pos.y >= ground - 0.01)
}

// 6. raycast break/place flow at eye height (mirrors Player.useFrame)
{
  const pos = new THREE.Vector3(sx, ground, sz)
  const vel = new THREE.Vector3()
  tick(pos, vel, new THREE.Vector3())
  const eye = new THREE.Vector3(pos.x, pos.y + 1.62, pos.z)
  const dir = new THREE.Vector3(0.6, -0.7, 0.6).normalize()
  const hit = raycastVoxel(world, eye, dir, 6)
  check('looking down-forward hits terrain', !!hit)
  if (hit) {
    const target = [hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz]
    world.setBlock(...(target as [number, number, number]), Block.Planks)
    check('place on face works', world.getBlock(target[0], target[1], target[2]) === Block.Planks)
    world.setBlock(hit.x, hit.y, hit.z, Block.Air)
    check('break works', world.getBlock(hit.x, hit.y, hit.z) === Block.Air)
  }
}

// 7. sprint is faster than walk
{
  const dist = (mult: number) => {
    const pos = new THREE.Vector3(sx, ground, sz)
    const vel = new THREE.Vector3()
    for (let i = 0; i < 60; i++) tick(pos, vel, new THREE.Vector3(mult, 0, 0))
    return pos.x - sx
  }
  const walk = dist(1)
  const sprint = dist(1.3)
  check('sprint > walk', sprint > walk * 1.1, { walk: +walk.toFixed(1), sprint: +sprint.toFixed(1) })
}

// 8. player height: a 1-block gap above ground is impassable (crouch not implemented)
{
  const pos = new THREE.Vector3(sx, ground, sz)
  const vel = new THREE.Vector3()
  const cx = Math.floor(sx)
  const cz = Math.floor(sz)
  // ceiling right above the head
  for (let x = cx; x <= cx + 6; x++) for (let z = cz - 1; z <= cz + 1; z++) world.setBlock(x, ground + 2, z, Block.Stone)
  for (let i = 0; i < 60; i++) tick(pos, vel, new THREE.Vector3(1, 0, 0))
  check('walks under 2-high tunnel fine', pos.x > sx + 1, { x: +pos.x.toFixed(1) })
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
