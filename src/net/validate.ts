/**
 * Shared block-edit validation — pure functions used by BOTH the relay
 * server (authoritative gate) and the receiving client (defence in depth),
 * so a hostile or buggy peer cannot rewrite the world outside reach,
 * bury another player, or push garbage values into the chunk arrays.
 */
import { Block, WORLD_HEIGHT } from '../utils/blocks.ts'

export const MAX_REACH = 8 // generous over the 6-block client raycast
export const WORLD_XZ_LIMIT = 4096
export const PLAYER_HALF = 0.3 // matches the local placeBlock guard
export const PLAYER_HEIGHT = 1.8
export const EYE_OFFSET = 1.62

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** shape/type gate — coordinates must be integers inside the world, block a real id */
export function isBlockShapeValid(x: unknown, y: unknown, z: unknown, b: unknown): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    Number.isInteger(z) &&
    Number.isInteger(b) &&
    (b as number) >= Block.Air &&
    (b as number) <= Block.Bedrock &&
    (y as number) >= 0 &&
    (y as number) < WORLD_HEIGHT &&
    Math.abs(x as number) <= WORLD_XZ_LIMIT &&
    Math.abs(z as number) <= WORLD_XZ_LIMIT
  )
}

/** eye-to-target distance gate */
export function withinReach(eye: Vec3, block: Vec3, dx: number, dy: number, dz: number): boolean {
  const cx = block.x + 0.5 - eye.x
  const cy = block.y + 0.5 - eye.y
  const cz = block.z + 0.5 - eye.z
  if (Math.hypot(cx, cy, cz) > MAX_REACH) return false
  // reject edits clearly behind the player's view (mining straight down while
  // walking is still ahead of the camera once pitch is considered)
  const len = Math.hypot(dx, dy, dz)
  if (len > 1e-6 && (cx * dx + cy * dy + cz * dz) / len < -2) return false
  return true
}

/** would a non-air block at (bx,by,bz) actually penetrate a player's body box? */
export function overlapsPlayer(feet: Vec3, bx: number, by: number, bz: number): boolean {
  // signed gap between the block's unit cube and the player's box per axis;
  // negative on an axis means the two overlap there. 2cm tolerance so a block
  // merely grazing a neighbouring column (player straddling the border) is legal.
  const gapX = Math.max(bx - (feet.x + PLAYER_HALF), feet.x - PLAYER_HALF - (bx + 1))
  const gapZ = Math.max(bz - (feet.z + PLAYER_HALF), feet.z - PLAYER_HALF - (bz + 1))
  const penetrates = gapX < -0.02 && gapZ < -0.02
  const verticalOverlap = by + 1 > feet.y + 0.05 && by < feet.y + PLAYER_HEIGHT
  return penetrates && verticalOverlap
}
