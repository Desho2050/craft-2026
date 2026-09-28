/**
 * Sky, lights, stars and fog animated from the store day clock.
 * Everything is mutated on the three objects each frame — no React state — so
 * 60 fps lighting costs nothing in reconciliation.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import * as THREE from 'three'
import { useGameStore } from '../store/useGameStore'
import { skyAt, type SkyState } from '../utils/dayCycle'

const STAR_COUNT = 700
const STAR_RADIUS = 240

export default function DayNight() {
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const ambRef = useRef<THREE.AmbientLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const starsRef = useRef<THREE.Points>(null)
  const fogRef = useRef<THREE.Fog>(null)

  // one rig object built once: three's sky dome (rather than drei's wrapper, so we
  // can drive its shader uniforms) plus the star shell. All fields mutate per frame.
  const rig = useMemo(() => {
    const sky = new Sky()
    sky.scale.setScalar(400)
    sky.renderOrder = -1
    sky.material.depthWrite = false
    sky.material.depthTest = false

    const pos = new Float32Array(STAR_COUNT * 3)
    for (let i = 0; i < STAR_COUNT; i++) {
      const dir = new THREE.Vector3().randomDirection()
      // mirror into the upper hemisphere — stars at the horizon are just haze
      pos.set([dir.x * STAR_RADIUS, Math.abs(dir.y) * STAR_RADIUS, dir.z * STAR_RADIUS], i * 3)
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))

    const starMat = new THREE.PointsMaterial({
      color: '#e6eeff',
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    })

    return { sky, starGeo, starMat }
  }, [])

  useFrame((state, dt) => {
    const s = useGameStore.getState()
    if (s.screen === 'game' && s.overlay === 'none') s.tickDay(Math.min(dt, 0.1))
    const k = skyAt(s.runtime.time)

    paintSky(rig.sky, k, state.camera.position)
    const sun = sunRef.current
    if (sun) {
      sun.position.set(...k.sun)
      sun.intensity = k.sunIntensity
      sun.color.set(k.sunColor)
    }
    if (ambRef.current) ambRef.current.intensity = k.ambient
    if (hemiRef.current) hemiRef.current.intensity = k.hemi
    if (fogRef.current) {
      fogRef.current.color.set(k.fogColor)
      fogRef.current.near = k.fogNear
      fogRef.current.far = k.fogFar
    }
    const stars = starsRef.current
    if (stars) paintStars(stars, rig.starMat, k, state.camera.position)
  })

  return (
    <>
      <fog ref={fogRef} attach="fog" args={['#cfe8ff', 44, 190]} />
      <primitive object={rig.sky} />
      <ambientLight ref={ambRef} intensity={0.65} />
      <directionalLight ref={sunRef} position={[80, 120, 40]} intensity={1.1} />
      <hemisphereLight ref={hemiRef} args={['#bde3ff', '#5a6b3f', 0.5]} />
      <points ref={starsRef} geometry={rig.starGeo} material={rig.starMat} frustumCulled={false} />
    </>
  )
}

/** the dome follows the camera so it always surrounds the player */
function paintSky(sky: Sky, k: SkyState, camPos: THREE.Vector3) {
  const u = sky.material.uniforms
  u.turbidity.value = k.turbidity
  u.rayleigh.value = k.rayleigh
  u.sunPosition.value.set(...k.sun)
  sky.position.copy(camPos)
}

/** star shell: centred on the camera, faded in only when the sky is dark */
function paintStars(stars: THREE.Points, mat: THREE.PointsMaterial, k: SkyState, camPos: THREE.Vector3) {
  stars.position.copy(camPos)
  stars.visible = k.stars > 0.01
  mat.opacity = k.stars
}
