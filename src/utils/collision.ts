/**
 * Custom AABB voxel collision — the standard Minecraft approach and far
 * lighter than a general-purpose physics engine for a block world.
 * The player is a box (0.6 x 1.8 x 0.6); movement is integrated per-axis
 * so sliding along walls falls out naturally.
 */
import { Vector3, Box3 } from 'three'
import { isCollidable } from './blocks'
import type { VoxelWorld } from './world'

export const PLAYER_WIDTH = 0.6
export const PLAYER_HEIGHT = 1.8
export const EYE_HEIGHT = 1.62

function playerBox(pos: Vector3): Box3 {
  const half = PLAYER_WIDTH / 2
  return new Box3(
    new Vector3(pos.x - half, pos.y, pos.z - half),
    new Vector3(pos.x + half, pos.y + PLAYER_HEIGHT, pos.z + half),
  )
}

function collides(world: VoxelWorld, box: Box3): boolean {
  const min = new Vector3(Math.floor(box.min.x), Math.floor(box.min.y), Math.floor(box.min.z))
  const max = new Vector3(Math.floor(box.max.x), Math.floor(box.max.y), Math.floor(box.max.z))
  for (let y = min.y; y <= max.y; y++)
    for (let z = min.z; z <= max.z; z++)
      for (let x = min.x; x <= max.x; x++)
        if (isCollidable(world.getBlock(x, y, z))) return true
  return false
}

/** axis: 0=x 1=y 2=z — sweep one axis, snap against geometry, return blocked? */
function moveAxis(world: VoxelWorld, pos: Vector3, delta: number, axis: number): boolean {
  if (delta === 0) return false
  const key = axis === 0 ? 'x' : axis === 1 ? 'y' : 'z'
  const before = pos[key]
  pos[key] += delta
  if (!collides(world, playerBox(pos))) return false
  // binary back-off to touching position (cheap: just revert; per-axis stepping handles the rest)
  pos[key] = before
  return true
}

export interface StepResult {
  onGround: boolean
  hitCeiling: boolean
  collidedX: boolean
  collidedZ: boolean
}

/**
 * Advance the player one tick with gravity, drag and voxel collision.
 * `vel` is mutated in place (m/s). `intent` is desired horizontal movement.
 */
export function stepPlayer(
  world: VoxelWorld,
  pos: Vector3, // feet position
  vel: Vector3,
  intent: Vector3,
  dt: number,
  flying: boolean,
): StepResult {
  const ACCEL = flying ? 60 : 28
  const MAX_WALK = 4.317
  const MAX_FLY = 10.5
  const GRAVITY = 26

  const speedCap = flying ? MAX_FLY : MAX_WALK
  // horizontal acceleration toward intent
  const desiredX = intent.x * speedCap
  const desiredZ = intent.z * speedCap
  vel.x += (desiredX - vel.x) * Math.min(1, ACCEL * dt * 0.25)
  vel.z += (desiredZ - vel.z) * Math.min(1, ACCEL * dt * 0.25)
  if (intent.lengthSq() === 0 && !flying) {
    // ground friction
    const f = Math.max(0, 1 - 10 * dt)
    vel.x *= f
    vel.z *= f
  }

  let onGround = false
  let hitCeiling = false

  if (flying) {
    const f = Math.max(0, 1 - 8 * dt)
    vel.y *= f
    if (intent.y !== 0) vel.y += intent.y * 40 * dt * 0.5
    hitCeiling = moveAxis(world, pos, vel.y * dt, 1)
    if (hitCeiling) vel.y = 0
  } else {
    vel.y -= GRAVITY * dt
    vel.y = Math.max(vel.y, -50) // terminal velocity
    onGround = moveAxis(world, pos, vel.y * dt, 1)
    if (onGround) {
      if (vel.y < 0) vel.y = 0
    }
  }

  const cx = moveAxis(world, pos, vel.x * dt, 0)
  if (cx) vel.x = 0
  const cz = moveAxis(world, pos, vel.z * dt, 2)
  if (cz) vel.z = 0

  return { onGround, hitCeiling, collidedX: cx, collidedZ: cz }
}

export function canJump(world: VoxelWorld, pos: Vector3): boolean {
  // are feet resting on something?
  const probe = playerBox(pos.clone().setY(pos.y - 0.02))
  probe.max.y = pos.y + 0.05
  return collides(world, probe)
}

/** find highest solid y at column, spawn-safe */
export function surfaceY(world: VoxelWorld, x: number, z: number): number {
  for (let y = 63; y >= 0; y--) {
    if (isCollidable(world.getBlock(Math.floor(x), y, Math.floor(z)))) return y + 1
  }
  return 30
}
