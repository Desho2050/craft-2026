/**
 * Hostile mob placeholders (zombies): simple wander + chase AI, voxel-aware
 * gravity, and melee damage when close. Rendered as low-poly boxes — swap in
 * CC0 glTF models (Quaternius) later without touching the AI code.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, MOB_MAX_HEALTH, type Mob } from '../store/useGameStore'
import { isCollidable } from '../utils/blocks'

const MOB_W = 0.6
const MOB_H = 1.9
const GRAVITY = 26
const CHASE_SPEED = 2.6
const WANDER_SPEED = 0.9
const ATTACK_RANGE = 1.5
const ATTACK_COOLDOWN = 1.2
const CHASE_RADIUS = 18
const MAINTAIN_INTERVAL = 20 // seconds between population top-ups

export default function MobAI() {
  const mobRefs = useRef<(THREE.Group | null)[]>([])
  const maintainTimer = useRef(0)

  const world = useGameStore((s) => s.world)
  const mobs = useGameStore((s) => s.mobs)
  const mode = useGameStore((s) => s.mode)

  useFrame((state, rawDt) => {
    if (mode !== 'survival' || !world) return
    const s = useGameStore.getState()
    if (s.overlay !== 'none') return // mobs freeze while paused / inventory open
    const dt = Math.min(rawDt, 0.05)
    const [px, py, pz] = s.runtime.pos

    maintainTimer.current += dt
    if (maintainTimer.current > MAINTAIN_INTERVAL) {
      maintainTimer.current = 0
      s.maintainMobs()
    }

    for (let i = 0; i < s.mobs.length; i++) {
      const mob = s.mobs[i]
      aiStep(world, mob, px, py, pz, dt, state.clock.elapsedTime, s)
      const g = mobRefs.current[i]
      if (g) {
        g.position.set(mob.x, mob.y, mob.z)
        g.rotation.y = mob.yaw
      }
    }
  })

  if (mode !== 'survival') return null

  return (
    <group>
      {mobs.map((mob, i) => (
        <group key={mob.id} ref={(el) => (mobRefs.current[i] = el)}>
          {/* body */}
          <mesh position={[0, MOB_H * 0.45, 0]}>
            <boxGeometry args={[MOB_W, MOB_H * 0.6, MOB_W * 0.7]} />
            <meshLambertMaterial color="#3f7a3a" />
          </mesh>
          {/* head */}
          <mesh position={[0, MOB_H * 0.88, 0]}>
            <boxGeometry args={[MOB_W * 0.8, MOB_W * 0.8, MOB_W * 0.8]} />
            <meshLambertMaterial color="#59914f" />
          </mesh>
          {/* arms */}
          <mesh position={[-MOB_W * 0.55, MOB_H * 0.55, MOB_W * 0.35]} rotation={[-0.9, 0, 0]}>
            <boxGeometry args={[0.22, 0.7, 0.22]} />
            <meshLambertMaterial color="#3f7a3a" />
          </mesh>
          <mesh position={[MOB_W * 0.55, MOB_H * 0.55, MOB_W * 0.35]} rotation={[-0.9, 0, 0]}>
            <boxGeometry args={[0.22, 0.7, 0.22]} />
            <meshLambertMaterial color="#3f7a3a" />
          </mesh>
          {/* health bar — re-rendered when this mob's hp changes */}
          {mob.health < MOB_MAX_HEALTH && (
            <>
              <mesh position={[0, MOB_H + 0.35, 0]}>
                <planeGeometry args={[0.7, 0.09]} />
                <meshBasicMaterial color="#7a1d1d" depthTest={false} transparent />
              </mesh>
              <mesh position={[0, MOB_H + 0.35, 0.001]} scale={[Math.max(0, mob.health / MOB_MAX_HEALTH), 1, 1]}>
                <planeGeometry args={[0.7, 0.09]} />
                <meshBasicMaterial color="#e04b4b" depthTest={false} transparent />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  )
}

/** one AI tick for a single mob — mutates `mob` in place */
type World = NonNullable<ReturnType<typeof useGameStore.getState>['world']>

function aiStep(
  world: World,
  mob: Mob,
  px: number,
  py: number,
  pz: number,
  dt: number,
  time: number,
  store: ReturnType<typeof useGameStore.getState>,
) {
  const distToPlayer = Math.hypot(px - mob.x, pz - mob.z)
  const chasing = distToPlayer < CHASE_RADIUS

  if (chasing) {
    const dx = (px - mob.x) / (distToPlayer || 1)
    const dz = (pz - mob.z) / (distToPlayer || 1)
    mob.vx = dx * CHASE_SPEED
    mob.vz = dz * CHASE_SPEED
    mob.yaw = Math.atan2(dx, dz)
    if (distToPlayer < ATTACK_RANGE && Math.abs(py - mob.y) < 2 && time - mob.lastAttack > ATTACK_COOLDOWN) {
      mob.lastAttack = time
      store.damage(2)
    }
  } else if (time > mob.nextTurn) {
    // wander: pick a new heading every few seconds
    mob.nextTurn = time + 2 + Math.random() * 4
    const a = Math.random() * Math.PI * 2
    mob.vx = Math.cos(a) * WANDER_SPEED
    mob.vz = Math.sin(a) * WANDER_SPEED
    mob.yaw = a
  }

  // integrate horizontally with simple voxel blocking
  const tryMove = (nx: number, nz: number) => {
    const bx = Math.floor(nx)
    const bz = Math.floor(nz)
    const feetBlocked = solid(world, bx, Math.floor(mob.y + 0.1), bz)
    const headBlocked = solid(world, bx, Math.floor(mob.y + 1.2), bz)
    if (!feetBlocked && !headBlocked) {
      mob.x = nx
      mob.z = nz
      return true
    }
    return false
  }
  if (!tryMove(mob.x + mob.vx * dt, mob.z + mob.vz * dt)) {
    // bump: turn randomly
    const a = Math.random() * Math.PI * 2
    mob.vx = Math.cos(a) * WANDER_SPEED
    mob.vz = Math.sin(a) * WANDER_SPEED
  }

  // vertical: snap to surface (placeholder gravity — no jumping yet)
  const ground = groundY(world, mob.x, mob.z)
  if (mob.y > ground) {
    mob.y = Math.max(ground, mob.y - GRAVITY * dt * 0.5 - 0.05)
  } else {
    mob.y = ground
  }
}

function solid(world: World, x: number, y: number, z: number) {
  return isCollidable(world.getBlock(x, y, z))
}

function groundY(world: World, x: number, z: number) {
  const bx = Math.floor(x)
  const bz = Math.floor(z)
  for (let y = 63; y >= 0; y--) {
    if (solid(world, bx, y, bz)) return y + 1
  }
  return 0
}
