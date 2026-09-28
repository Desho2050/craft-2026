/**
 * Main menu: title, mode select, world seed, language toggle (ar/en),
 * continue-from-save. All text mirrored for RTL through logical utilities.
 */
import { useState } from 'react'
import { hasSave, useGameStore } from '../../store/useGameStore'
import { useT } from '../../utils/i18n'

export default function MainMenu() {
  const t = useT()
  const startGame = useGameStore((s) => s.startGame)
  const setLang = useGameStore((s) => s.setLang)
  const lang = useGameStore((s) => s.lang)

  const [mode, setMode] = useState<'survival' | 'creative'>('survival')
  const [seed, setSeed] = useState('')
  const [mp, setMp] = useState(false)
  const [mpName, setMpName] = useState('')
  const [mpUrl, setMpUrl] = useState('ws://localhost:8768')
  const canContinue = hasSave()

  const mpOpts = mp
    ? { url: mpUrl.trim(), name: mpName.trim() || (lang === 'ar' ? 'لاعب' : 'Player') }
    : undefined

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-b from-[#79b7eb] via-[#b5dcf0] to-[#5a8a3f] font-ui">
      {/* decorative pixel hills */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[repeating-linear-gradient(90deg,#4e7a38_0_32px,#57833e_32px_64px)] opacity-80 [clip-path:polygon(0_60%,10%_45%,25%_55%,40%_35%,60%_55%,75%_40%,90%_55%,100%_45%,100%_100%,0_100%)]" />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/30 bg-black/55 p-8 text-white shadow-2xl backdrop-blur-md mx-4">
        <h1 className="text-center text-4xl font-black tracking-tight drop-shadow-[0_3px_0_rgba(0,0,0,0.6)]">
          {t('game.title')}
        </h1>
        <p className="mt-2 text-center text-white/80">{t('game.subtitle')}</p>

        {canContinue && (
          <button
            onClick={() => startGame({ mode: 'survival', fromSave: true, mp: mpOpts })}
            className="mt-6 w-full rounded-xl border-b-4 border-emerald-800 bg-emerald-600 py-3 text-lg font-bold shadow-lg transition hover:brightness-110 active:translate-y-0.5 active:border-b-2"
          >
            {t('menu.continue')}
          </button>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <ModeCard active={mode === 'survival'} onClick={() => setMode('survival')} title={t('menu.survival')} desc="♥ 🍗 🧟" />
          <ModeCard active={mode === 'creative'} onClick={() => setMode('creative')} title={t('menu.creative')} desc="✈️ ∞" />
        </div>

        <label className="mt-5 block text-sm text-white/70">
          {t('menu.seed')}
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder={t('menu.seedHint')}
            className="mt-1 w-full rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-white placeholder-white/40 outline-none focus:border-white/60"
          />
        </label>

        <label className="mt-4 flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" checked={mp} onChange={(e) => setMp(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
          🌐 {t('menu.mp')}
        </label>
        {mp && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block text-sm text-white/70">
              {t('menu.mpName')}
              <input
                value={mpName}
                onChange={(e) => setMpName(e.target.value)}
                maxLength={16}
                className="mt-1 w-full rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-white placeholder-white/40 outline-none focus:border-white/60"
              />
            </label>
            <label className="block text-sm text-white/70">
              {t('menu.mpUrl')}
              <input
                value={mpUrl}
                onChange={(e) => setMpUrl(e.target.value)}
                dir="ltr"
                className="mt-1 w-full rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-white placeholder-white/40 outline-none focus:border-white/60"
              />
            </label>
          </div>
        )}
        {mp && <p className="mt-2 text-xs leading-5 text-white/50">{t('menu.mpHint')}</p>}

        <button
          onClick={() => startGame({ seed: seed.trim() || undefined, mode, mp: mpOpts })}
          className="mt-5 w-full rounded-xl border-b-4 border-amber-800 bg-amber-600 py-3 text-xl font-black shadow-lg transition hover:brightness-110 active:translate-y-0.5 active:border-b-2"
        >
          ▶ {t('menu.play')}
        </button>

        <div className="mt-5 flex items-center justify-between text-sm">
          <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">
            🌐 {t('menu.language')}
          </button>
          <span className="text-white/40">v0.1 · WebGL</span>
        </div>

        <p className="mt-4 text-center text-xs leading-5 text-white/60">{t('menu.help')}</p>
      </div>
    </div>
  )
}

function ModeCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 p-3 text-center transition ${
        active
          ? 'border-white/80 bg-white/15 shadow-inner'
          : 'border-white/20 bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className="font-bold">{title}</div>
      <div className="mt-1 text-lg">{desc}</div>
    </button>
  )
}
