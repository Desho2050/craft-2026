/**
 * App root: owns RTL direction, global one-shot keybindings (1-9, E, F, Esc),
 * pause/death overlays, and routes between menu and game screens.
 */
import { useEffect } from 'react'
import Canvas3D from './components/Canvas3D'
import HUD from './components/UI/HUD'
import Inventory from './components/UI/Inventory'
import MainMenu from './components/UI/MainMenu'
import { useGameStore } from './store/useGameStore'
import { dirFor, useT } from './utils/i18n'

// dev-only: automation/testing can drive the store directly (block edits, world queries)
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__mcGame = useGameStore
}

export default function App() {
  const t = useT()
  const screen = useGameStore((s) => s.screen)
  const overlay = useGameStore((s) => s.overlay)
  const lang = useGameStore((s) => s.lang)

  // RTL wiring — every Tailwind logical utility flips with this attribute
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dirFor(lang)
  }, [lang])

  // global one-shot keybindings
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGameStore.getState()
      if (s.screen !== 'game' || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5))
        if (n >= 1 && n <= 9) s.selectSlot(n - 1)
      } else if (e.code === 'KeyE') {
        if (s.overlay === 'inventory') s.closeOverlay()
        else if (s.overlay === 'none') {
          s.openOverlay('inventory')
          document.exitPointerLock?.()
        }
      } else if (e.code === 'KeyF' && s.mode === 'creative') {
        s.toggleFly()
      } else if (e.code === 'Escape' && s.overlay === 'none') {
        s.openOverlay('pause')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Esc released pointer lock → show pause (browser already consumed Escape)
  useEffect(() => {
    const onLock = () => {
      const s = useGameStore.getState()
      if (!document.pointerLockElement && s.screen === 'game' && s.overlay === 'none')
        s.openOverlay('pause')
    }
    document.addEventListener('pointerlockchange', onLock)
    return () => document.removeEventListener('pointerlockchange', onLock)
  }, [])

  const quitToMenu = useGameStore((s) => s.quitToMenu)
  const closeOverlay = useGameStore((s) => s.closeOverlay)
  const respawn = useGameStore((s) => s.respawn)
  const health = useGameStore((s) => s.health)

  if (screen === 'menu') return <MainMenu />

  return (
    <div className="relative h-full w-full bg-black">
      <Canvas3D />
      <HUD />

      {overlay === 'inventory' && <Inventory />}

      {overlay === 'pause' && (
        <Overlay>
          <h2 className="text-3xl font-black">{t('pause.title')}</h2>
          <div className="mt-2 text-white/60 text-sm">{lang === 'ar' ? `البذرة: ${useGameStore.getState().seed}` : `Seed: ${useGameStore.getState().seed}`}</div>
          <button className="mc-btn mc-green mt-6" onClick={() => closeOverlay()}>
            {t('pause.resume')}
          </button>
          <button className="mc-btn mc-amber" onClick={() => quitToMenu()}>
            {t('pause.save')}
          </button>
          <p className="mt-4 text-xs text-white/50">{t('menu.help')}</p>
        </Overlay>
      )}

      {overlay === 'death' && health <= 0 && (
        <Overlay>
          <h2 className="text-4xl font-black text-red-500">{t('death.title')}</h2>
          <button className="mc-btn mc-red mt-6" onClick={() => respawn()}>
            {t('death.respawn')}
          </button>
          <button className="mc-btn mc-amber" onClick={() => quitToMenu()}>
            {t('pause.save')}
          </button>
        </Overlay>
      )}
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-black/70 text-white backdrop-blur-sm font-ui">
      {children}
    </div>
  )
}
