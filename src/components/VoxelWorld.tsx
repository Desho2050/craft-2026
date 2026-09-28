/**
 * Chunk streaming + InstancedMesh rendering.
 * Keeps a ring of chunk groups around the player, rebuilds dirty chunks
 * with a small per-frame budget so mining never stutters.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store/useGameStore'
import { buildChunkMesh } from '../utils/world'
import { CHUNK_SIZE } from '../utils/blocks'

const VIEW_DISTANCE = 4 // chunks in each direction
const BUILD_BUDGET = 3 // chunk meshes built per frame

export default function VoxelWorldRenderer() {
  const root = useRef(new THREE.Group())
  const groups = useRef(new Map<string, THREE.Group>())
  const lastCheck = useRef(0)
  const buildQueue = useRef<string[]>([])

  useFrame((state) => {
    const s = useGameStore.getState()
    if (!s.world || s.screen !== 'game') return
    const world = s.world
    const t = state.clock.elapsedTime

    const [px, , pz] = s.runtime.pos
    const pcx = Math.floor(px / CHUNK_SIZE)
    const pcz = Math.floor(pz / CHUNK_SIZE)

    // periodic visibility pass
    if (t - lastCheck.current > 0.4 || buildQueue.current.length === 0) {
      lastCheck.current = t
      const wanted = new Set<string>()
      for (let dz = -VIEW_DISTANCE; dz <= VIEW_DISTANCE; dz++)
        for (let dx = -VIEW_DISTANCE; dx <= VIEW_DISTANCE; dx++)
          wanted.add(`${pcx + dx},${pcz + dz}`)

      // unload far chunks
      for (const [key, group] of groups.current) {
        if (!wanted.has(key)) {
          disposeGroup(group)
          root.current.remove(group)
          groups.current.delete(key)
        }
      }
      // enqueue missing + dirty chunks (dirty first — player edits are latency-critical)
      const queue: string[] = []
      for (const key of world.dirty) if (wanted.has(key)) queue.push(key)
      for (const key of wanted) if (!groups.current.has(key)) queue.push(key)
      buildQueue.current = queue
    }

    // budgeted builds
    let budget = BUILD_BUDGET
    while (budget > 0 && buildQueue.current.length > 0) {
      const key = buildQueue.current.shift()!
      const [cx, cz] = key.split(',').map(Number)
      if (groups.current.has(key)) {
        // already visible (queued as dirty) — rebuild in place
        disposeGroup(groups.current.get(key)!)
        root.current.remove(groups.current.get(key)!)
        groups.current.delete(key)
      }
      const group = buildChunkMesh(cx, cz, world)
      group.userData.key = key
      groups.current.set(key, group)
      root.current.add(group)
      world.dirty.delete(key)
      budget--
    }
  })

  return <primitive object={root.current} />
}

function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) {
      obj.geometry.dispose()
      obj.dispose()
      // materials are shared/cached globally — do NOT dispose them here
    }
  })
}
