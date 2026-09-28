/**
 * Remote player avatars: one simple humanoid per peer. Join/leave re-renders
 * through useNetStore; per-frame position lerp reads the session map directly
 * so streaming never touches React.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Text } from '@react-three/drei'
import { getNet, useNetStore } from '../net/session'
import type { RemotePlayer } from '../net/multiplayer'

export default function RemotePlayers() {
  const players = useNetStore((s) => s.players)
  return <>{players.map((p) => <Avatar key={p.id} player={p} />)}</>
}

const SKIN = { body: '#2f7f7f', head: '#c99b6f', legs: '#3d4d8f', arms: '#2f6f9f' }

function Avatar({ player }: { player: RemotePlayer }) {
  const ref = useRef<THREE.Group>(null)
  const target = useRef(new THREE.Vector3(player.x, player.y, player.z))

  useFrame((_, dt) => {
    const p = getNet()?.players.get(player.id)
    const g = ref.current
    if (!p || !g) return
    target.current.set(p.x, p.y, p.z)
    g.position.lerp(target.current, Math.min(1, dt * 12))
    g.rotation.y = p.yaw
  })

  return (
    <group ref={ref} position={[player.x, player.y, player.z]}>
      <mesh position={[0, 1.15, 0]}>
        <boxGeometry args={[0.55, 0.75, 0.3]} />
        <meshLambertMaterial color={SKIN.body} />
      </mesh>
      <mesh position={[0, 1.85, 0]}>
        <boxGeometry args={[0.45, 0.45, 0.45]} />
        <meshLambertMaterial color={SKIN.head} />
      </mesh>
      {[-0.24, 0.24].map((x) => (
        <mesh key={x} position={[x, 1.1, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshLambertMaterial color={SKIN.arms} />
        </mesh>
      ))}
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, 0.35, 0]}>
          <boxGeometry args={[0.2, 0.8, 0.2]} />
          <meshLambertMaterial color={SKIN.legs} />
        </mesh>
      ))}
      <Text position={[0, 2.45, 0]} fontSize={0.26} color="#ffffff" outlineWidth={0.02} outlineColor="#000000" anchorX="center">
        {player.name}
      </Text>
    </group>
  )
}
