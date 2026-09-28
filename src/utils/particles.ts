/**
 * Block break/place particles: tiny textured cubes sprayed from the
 * interacted voxel. The store fires bursts through `particleHooks` (set by
 * <Particles/> in the scene); when no scene is mounted the hooks are no-ops.
 */
import type { Block } from './blocks'

export interface ParticleHooks {
  burst(block: Block, x: number, y: number, z: number, count: number): void
}

export const particleHooks: ParticleHooks = { burst: () => {} }

/** called by <Particles/> on mount; pass null on unmount */
export function setParticleHooks(hooks: ParticleHooks | null): void {
  particleHooks.burst = hooks?.burst ?? (() => {})
}
