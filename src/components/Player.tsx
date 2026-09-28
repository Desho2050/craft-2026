/**
 * First-person player controller:
 *  - Pointer Lock mouse look (yaw/pitch euler, YXZ order)
 *  - WASD movement, Space jump, Shift sprint, F fly (creative)
 *  - center-screen DDA raycast -> block highlight, LMB break, RMB place
 * Hot per-frame data stays in refs; only rare events touch the store.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store/useGameStore'
import { raycastVoxel } from '../utils/world'
import { canJump, EYE_HEIGHT, stepPlayer, surfaceY } from '../utils/collision'
import { heldKeys, installKeyboard } from '../utils/input'
import { getNet } from '../net/session'

const MOUSE_SENS = 0.0022
const BREAK_COOLDOWN = 0.22

export default function Player() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const pos = useRef(new THREE.Vector3())
  const vel = useRef(new THREE.Vector3())
  const yaw = useRef(0)
  const pitch = useRef(0)
  const onGround = useRef(false)
  const cooldown = useRef(0)
  const locked = useRef(false)
  const highlightRef = useRef<THREE.LineSegments>(null)
  const lastInteract = useRef<'break' | 'place' | 'pick' | null>(null)

  const store = useGameStore

  // (re)spawn placement
  useEffect(() => {
    const [x, y, z] = store.getState().spawnPos
    pos.current.set(x, y, z)
    vel.current.set(0, 0, 0)
    const onRespawn = () => {
      const s = store.getState()
      const sx = s.spawnPos[0]
      const sz = s.spawnPos[2]
      pos.current.set(sx, surfaceY(s.world!, sx, sz) + 1, sz)
      vel.current.set(0, 0, 0)
    }
    window.addEventListener('medocraft:respawn', onRespawn)
    return () => window.removeEventListener('medocraft:respawn', onRespawn)
  }, [store])

  useEffect(() => installKeyboard(), [])

  // dev-only: automation/testing can fake the pointer-lock gate.
  // No cleanup-delete: on world remounts the old unmount would erase the new hook.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__mcSetLocked = (v: boolean) => (locked.current = v)
  }, [])

  // pointer lock + mouse handling
  useEffect(() => {
    const canvas = gl.domElement

    const requestLock = () => {
      const s = store.getState()
      if (s.screen === 'game' && s.overlay === 'none') canvas.requestPointerLock()
    }
    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return
      yaw.current -= e.movementX * MOUSE_SENS
      pitch.current = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch.current - e.movementY * MOUSE_SENS))
    }
    const onMouseDown = (e: MouseEvent) => {
      if (!locked.current) return
      if (e.button === 0) lastInteract.current = 'break'
      else if (e.button === 2) lastInteract.current = 'place'
      else if (e.button === 1) lastInteract.current = 'pick'
    }
    const onContext = (e: Event) => e.preventDefault()

    canvas.addEventListener('click', requestLock)
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('contextmenu', onContext)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('mousemove', onMouseMove)
    return () => {
      canvas.removeEventListener('click', requestLock)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('contextmenu', onContext)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [gl, store])

  useFrame((_, rawDt) => {
    const s = store.getState()
    const world = s.world
    if (!world || s.screen !== 'game') return
    const dt = Math.min(rawDt, 0.05) // clamp — tab-switch spikes would tunnel through blocks

    // camera orientation
    camera.quaternion.setFromEuler(new THREE.Euler(pitch.current, yaw.current, 0, 'YXZ'))

    const uiBlocked = s.overlay !== 'none'
    const move = new THREE.Vector3()
    if (!uiBlocked && locked.current) {
      const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
      const right = new THREE.Vector3(-forward.z, 0, forward.x)
      if (heldKeys.has('KeyW')) move.add(forward)
      if (heldKeys.has('KeyS')) move.sub(forward)
      if (heldKeys.has('KeyD')) move.add(right)
      if (heldKeys.has('KeyA')) move.sub(right)
      if (move.lengthSq() > 0) move.normalize()
      if (heldKeys.has('ShiftLeft') && !s.flying) move.multiplyScalar(1.3) // sprint
      if (s.flying) {
        if (heldKeys.has('Space')) move.y = 1
        else if (heldKeys.has('ShiftLeft')) move.y = -1
      }
    }

    // jump
    if (!s.flying && uiBlocked === false && heldKeys.has('Space') && onGround.current) {
      if (canJump(world, pos.current)) vel.current.y = 8.2
    }

    stepPlayer(world, pos.current, vel.current, move, dt, s.flying && s.mode === 'creative')
    onGround.current = vel.current.y === 0 && !s.flying

    // void safety net
    if (pos.current.y < -10) {
      pos.current.set(s.spawnPos[0], surfaceY(world, s.spawnPos[0], s.spawnPos[2]) + 1, s.spawnPos[2])
      vel.current.set(0, 0, 0)
      s.damage(3)
    }

    camera.position.set(pos.current.x, pos.current.y + EYE_HEIGHT, pos.current.z)
    s.runtime.pos = [pos.current.x, pos.current.y, pos.current.z]
    getNet()?.broadcastState(pos.current.x, pos.current.y, pos.current.z, yaw.current, performance.now())

    // survival ticks (hunger drain / regen)
    if (s.mode === 'survival') s.tickSurvival(dt, heldKeys.has('ShiftLeft') && move.lengthSq() > 0)

    // ---- raycast & highlight ----
    cooldown.current -= dt
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const hit = raycastVoxel(world, camera.position, dir, 6)
    const hl = highlightRef.current
    if (hl) {
      hl.visible = !!hit && locked.current
      if (hit) hl.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
    }

    // ---- break / place ----
    if (lastInteract.current && cooldown.current <= 0 && locked.current && s.overlay === 'none') {
      cooldown.current = BREAK_COOLDOWN
      const action = lastInteract.current
      lastInteract.current = null
      if (hit) {
        if (action === 'break') {
          s.breakBlock(hit.x, hit.y, hit.z)
        } else if (action === 'place') {
          s.placeBlock(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz)
        } else if (action === 'pick' && s.mode === 'creative') {
          // middle-click pick block
          s.setSel(s.selectedSlot, { item: hit.block, count: 64 })
        }
      }
    }

    // keep chunk streaming informed
    const pcx = Math.floor(pos.current.x / 16)
    const pcz = Math.floor(pos.current.z / 16)
    if (pcx !== s.runtime.pos[0] || pcz !== s.runtime.pos[2]) {
      /* no-op: VoxelWorld reads runtime.pos itself each tick */
    }
  })

  return (
    <lineSegments ref={highlightRef} visible={false} renderOrder={2}>
      <edgesGeometry args={[new THREE.BoxGeometry(1.002, 1.002, 1.002)]} />
      <lineBasicMaterial color="#000000" transparent opacity={0.6} depthTest={false} />
    </lineSegments>
  )
}
