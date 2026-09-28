/**
 * Main R3F canvas: sky, fog, lights, and the game scene graph.
 * Shadows stay off — with millions of voxels, lambert + baked-feel AO is the
 * right trade for stable 60fps on mid hardware.
 */
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import Player from './Player'
import VoxelWorldRenderer from './VoxelWorld'
import MobAI from './MobAI'
import Particles from './Particles'
import RemotePlayers from './RemotePlayers'
import { useGameStore } from '../store/useGameStore'

export default function Canvas3D() {
  const seed = useGameStore((s) => s.seed)
  const [px, , pz] = useGameStore((s) => s.spawnPos)

  return (
    <Canvas
      key={seed} // fresh renderer per world
      camera={{ fov: 75, near: 0.1, far: 400, position: [px, 40, pz] }}
      dpr={[1, 1.5]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Sky sunPosition={[100, 60, 100]} turbidity={2} rayleigh={0.6} />
      <fog attach="fog" args={['#cfe8ff', 40, 180]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[80, 120, 40]} intensity={1.1} />
      <hemisphereLight args={['#bde3ff', '#5a6b3f', 0.5]} />

      <Suspense fallback={null}>
        {/* key remounts chunk groups when a new world starts */}
        <VoxelWorldRenderer key={`world-${seed}`} />
        <Player key={`player-${seed}`} />
        <MobAI />
        <Particles />
        <RemotePlayers />
      </Suspense>
    </Canvas>
  )
}
