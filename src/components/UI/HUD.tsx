/**
 * In-game HUD: crosshair, health/hunger (survival), hotbar, mode chip, toasts.
 * All layout uses logical properties (ms-/me-/start/end) so RTL mirrors cleanly.
 */
import { useEffect, useState } from 'react'
import { useGameStore } from '../../store/useGameStore'
import { BLOCKS, Block } from '../../utils/blocks'
import { isBlockItem, itemToken } from '../../utils/recipes'
import { useT, translate } from '../../utils/i18n'
import { clockOf, type DayPhase } from '../../utils/dayCycle'
import { useNetStore } from '../../net/session'
import ItemIcon from './ItemIcon'

export default function HUD() {
  const t = useT()
  const mode = useGameStore((s) => s.mode)
  const health = useGameStore((s) => s.health)
  const hunger = useGameStore((s) => s.hunger)
  const hotbar = useGameStore((s) => s.hotbar)
  const selected = useGameStore((s) => s.selectedSlot)
  const overlay = useGameStore((s) => s.overlay)
  const eating = useGameStore((s) => s.eating)
  const lang = useGameStore((s) => s.lang)
  const mpEnabled = useNetStore((s) => s.enabled)
  const connected = useNetStore((s) => s.connected)
  const peers = useNetStore((s) => s.players)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      setToast(translate(lang, `toast.${detail}`))
    }
    window.addEventListener('medocraft:toast', onToast)
    return () => window.removeEventListener('medocraft:toast', onToast)
  }, [lang])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  if (overlay !== 'none') return null // HUD hides behind full-screen overlays

  return (
    <div className="pointer-events-none absolute inset-0 z-10 font-ui">
      {/* crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/90 text-2xl leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        +
      </div>

      {/* survival stats */}
      {mode === 'survival' && (
        <div className="absolute bottom-24 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 flex flex-col gap-1 items-center">
          <div className="flex gap-0.5" aria-label={t('hud.health')}>
            {Array.from({ length: 10 }, (_, i) => {
              const v = health - i * 2
              return (
                <span key={i} className={`text-lg leading-none ${v >= 2 ? 'text-red-500' : v >= 1 ? 'text-red-500/50' : 'text-black/40'}`}>
                  ♥
                </span>
              )
            })}
          </div>
          <div className="flex gap-0.5" aria-label={t('hud.hunger')}>
            {Array.from({ length: 10 }, (_, i) => {
              const v = hunger - i * 2
              return (
                <span key={i} className={`text-lg leading-none ${v >= 2 ? 'text-amber-600' : v >= 1 ? 'text-amber-600/50' : 'text-black/40'}`}>
                  🍗
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* hotbar — always LTR like every real inventory HUD, even in Arabic */}
      <div dir="ltr" className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
        {hotbar.map((stack, i) => (
          <div
            key={i}
            className={`h-12 w-12 rounded-md border-2 backdrop-blur-sm ${
              i === selected ? 'border-white bg-white/25' : 'border-white/30 bg-black/35'
            } relative flex items-center justify-center`}
          >
            {stack && (
              <>
                <ItemIcon item={stack.item} size={36} />
                {stack.count > 1 && (
                  <span className="absolute bottom-0 end-1 text-[11px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                    {stack.count}
                  </span>
                )}
              </>
            )}
            <span className="absolute top-0 start-1 text-[10px] text-white/60">{i + 1}</span>
          </div>
        ))}
      </div>

      {/* held item name */}
      {hotbar[selected] && (
        <div className="absolute bottom-18 left-1/2 -translate-x-1/2 text-white/90 text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
          {itemName(hotbar[selected]!.item, lang)}
        </div>
      )}

      {/* eating animation — the held food bobs toward the mouth while R is held */}
      {eating && hotbar[selected] && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 eat-bob">
          <ItemIcon item={hotbar[selected]!.item} size={52} />
        </div>
      )}

      {/* mode chip */}
      <div className="absolute top-3 start-3 rounded-md bg-black/40 px-3 py-1 text-sm text-white/90 backdrop-blur-sm">
        {mode === 'survival' ? t('menu.survival') : t('menu.creative')} · {t('game.title')}
      </div>

      {/* multiplayer status chip */}
      {mpEnabled && (
        <div className={`absolute top-11 start-3 rounded-md px-3 py-1 text-sm backdrop-blur-sm ${connected ? 'bg-emerald-900/60 text-emerald-100' : 'bg-red-900/60 text-red-100'}`}>
          🌐 {connected ? `${t('hud.online')} · ${peers.length + 1}` : '…'}
        </div>
      )}

      <DayChip />

      {/* toast */}
      {toast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 rounded-lg bg-black/70 px-4 py-2 text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

const PHASE_ICON: Record<DayPhase, string> = { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' }

/** clock chip — its own component so the 1 Hz tick doesn't re-render the HUD */
function DayChip() {
  const phase = useGameStore((s) => s.dayPhase)
  const lang = useGameStore((s) => s.lang)
  const [clock, setClock] = useState(() => clockOf(useGameStore.getState().runtime.time))

  useEffect(() => {
    const id = setInterval(() => setClock(clockOf(useGameStore.getState().runtime.time)), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      dir="ltr"
      className="absolute top-3 end-3 rounded-md bg-black/40 px-3 py-1 text-sm text-white/90 backdrop-blur-sm"
    >
      {PHASE_ICON[phase]} {clock} · {translate(lang, `phase.${phase}`)}
    </div>
  )
}

function itemName(item: number, lang: 'ar' | 'en'): string {
  if (lang === 'en' && isBlockItem(item)) return BLOCKS[item as Block].name
  return translate(lang, `item.${itemToken(item)}`)
}
