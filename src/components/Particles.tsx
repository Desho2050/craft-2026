/**
 * Break/place particle system: one small InstancedMesh per block type with a
 * pooled set of textured mini-cubes. The store fires bursts through the
 * shared hooks; motion is integrated analytically per particle so no scene
 * state ever touches React.
 */
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Block, CREATIVE_PALETTE } from '../utils/blocks'
import { getBlockMaterial } from '../utils/textures'
import { setParticleHooks } from '../utils/particles'

const CAP = 128 // particles per block type
const LIFE = 0.8
const RISE = 3.2 // initial upward puff speed
const GRAVITY = 18

/** per particle: x y z vx vz life (age countdown) */
interface Pool {
  mesh: THREE.InstancedMesh
  data: Float32Array
}

// scratch objects — the render loop is single-threaded, reuse beats allocating per frame
const tmp = new THREE.Matrix4()
const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6, 0.9, 0.3))
const p = new THREE.Vector3()
const s = new THREE.Vector3()

export default function Particles() {
  const { group, pools } = useMemo(() => {
    const g = new THREE.Group()
    const map = new Map<Block, Pool>()
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16)
    for (const b of CREATIVE_PALETTE) {
      const mesh = new THREE.InstancedMesh(geo, getBlockMaterial(b, 'side'), CAP)
      mesh.matrixAutoUpdate = false
      mesh.frustumCulled = false
      mesh.count = 0
      map.set(b, { mesh, data: new Float32Array(CAP * 6) })
      g.add(mesh)
    }
    return { group: g, pools: map }
  }, [])

  useEffect(() => {
    setParticleHooks({
      burst(block, x, y, z, count) {
        const pool = pools.get(block)
        if (!pool) return
        const { data } = pool
        let placed = 0
        for (let i = 0; i < CAP && placed < count; i++) {
          if (data[i * 6 + 5] > 0) continue // slot busy
          const a = Math.random() * Math.PI * 2
          const sp = 0.8 + Math.random() * 1.8
          data[i * 6] = x + 0.15 + Math.random() * 0.7
          data[i * 6 + 1] = y + 0.15 + Math.random() * 0.7
          data[i * 6 + 2] = z + 0.15 + Math.random() * 0.7
          data[i * 6 + 3] = Math.cos(a) * sp
          data[i * 6 + 4] = Math.sin(a) * sp
          data[i * 6 + 5] = LIFE * (0.65 + Math.random() * 0.35)
          placed++
        }
      },
    })
    return () => setParticleHooks(null)
  }, [pools])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    for (const { mesh, data } of pools.values()) {
      let n = 0
      for (let i = 0; i < CAP; i++) {
        const life = data[i * 6 + 5]
        if (life <= 0) continue
        const age = LIFE - life + dt
        p.set(
          data[i * 6] + data[i * 6 + 3] * age,
          data[i * 6 + 1] + RISE * age - GRAVITY * age * age * 0.5,
          data[i * 6 + 2] + data[i * 6 + 4] * age,
        )
        data[i * 6 + 5] = life - dt
        const sc = Math.min(1, (life - dt) * 4)
        if (sc <= 0) continue
        s.set(sc, sc, sc)
        tmp.compose(p, quat, s)
        mesh.setMatrixAt(n++, tmp)
      }
      mesh.count = n
      if (n > 0) mesh.instanceMatrix.needsUpdate = true
    }
  })

  return <primitive object={group} />
}
