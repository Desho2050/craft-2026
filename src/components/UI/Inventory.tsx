/**
 * Inventory & crafting screen (E key). Fully RTL-aware:
 * the whole panel mirrors automatically because Tailwind v4 logical
 * utilities (ms/me/start/end) respond to `dir="rtl"` on <html>.
 *
 * Interaction model: click a slot to pick its stack onto the cursor,
 * click another slot to place/swap. Creative mode gets the full block
 * palette (click = fill selected hotbar slot with 64).
 */
import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../store/useGameStore'
import { BLOCKS, Block, CREATIVE_PALETTE } from '../../utils/blocks'
import { MAX_STACK, findRecipe, isBlockItem, itemToken, type ItemStack } from '../../utils/recipes'
import { translate, useT } from '../../utils/i18n'
import ItemIcon from './ItemIcon'

export default function Inventory() {
  const t = useT()
  const lang = useGameStore((s) => s.lang)
  const mode = useGameStore((s) => s.mode)
  const hotbar = useGameStore((s) => s.hotbar)
  const inventory = useGameStore((s) => s.inventory)
  const grid = useGameStore((s) => s.craftingGrid)
  const selectedSlot = useGameStore((s) => s.selectedSlot)
  const setSel = useGameStore((s) => s.setSel)
  const setInv = useGameStore((s) => s.setInv)
  const setCraftSlot = useGameStore((s) => s.setCraftSlot)
  const consumeCraft = useGameStore((s) => s.consumeCraft)
  const addItem = useGameStore((s) => s.addItem)
  const closeOverlay = useGameStore((s) => s.closeOverlay)

  const craftSize = useGameStore((s) => s.craftSize)
  const [cursor, setCursor] = useState<ItemStack | null>(null)

  // returning the item held on the cursor when the screen closes
  const cursorRef = useRef<ItemStack | null>(null)
  cursorRef.current = cursor
  const addItemRef = useRef(addItem)
  addItemRef.current = addItem
  useEffect(
    () => () => {
      const c = cursorRef.current
      if (c) addItemRef.current(c.item, c.count)
    },
    [],
  )

  const clickSlot = (
    stack: ItemStack | null,
    write: (s: ItemStack | null) => void,
    opts?: { single?: boolean },
  ) => {
    if (!cursor) {
      if (!stack) return
      if (opts?.single) {
        setCursor({ item: stack.item, count: 1 })
        const left = stack.count - 1
        write(left > 0 ? { ...stack, count: left } : null)
      } else {
        setCursor(stack)
        write(null)
      }
      return
    }
    if (!stack) {
      if (opts?.single) {
        write({ item: cursor.item, count: 1 })
        const left = cursor.count - 1
        setCursor(left > 0 ? { ...cursor, count: left } : null)
      } else {
        write(cursor)
        setCursor(null)
      }
      return
    }
    if (stack.item === cursor.item && !opts?.single) {
      const total = stack.count + cursor.count
      if (total <= MAX_STACK) {
        write({ item: stack.item, count: total })
        setCursor(null)
      } else {
        write({ item: stack.item, count: MAX_STACK })
        setCursor({ item: cursor.item, count: total - MAX_STACK })
      }
      return
    }
    // swap
    write(opts?.single ? { item: cursor.item, count: 1 } : cursor)
    if (opts?.single) {
      const left = stack.count - 1
      setCursor(left > 0 ? { item: stack.item, count: left + cursor.count } : cursor)
    } else {
      setCursor(stack)
    }
  }

  const result = findRecipe(
    grid.slice(0, craftSize * craftSize).map((st) => st?.item ?? null),
    craftSize,
  )?.result ?? null

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm font-ui">
      <div className="relative mx-4 w-full max-w-3xl rounded-2xl border border-white/20 bg-[#1c1a17]/95 p-5 text-white shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{t('inv.title')}</h2>
          <button
            onClick={() => closeOverlay()}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
          >
            {t('inv.close')} (E)
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-5">
          {/* crafting area */}
          <div className="shrink-0">
            <h3 className="mb-2 text-sm text-white/70">{t('inv.crafting')}</h3>
            <div className="flex items-center gap-4">
              <div
                className="grid gap-1 rounded-lg bg-black/40 p-2"
                style={{ gridTemplateColumns: `repeat(${craftSize}, 3rem)` }}
              >
                {Array.from({ length: craftSize * craftSize }, (_, i) => (
                  <Slot
                    key={i}
                    stack={grid[i]}
                    onClick={() => clickSlot(grid[i], (s) => setCraftSlot(i, s), { single: true })}
                  />
                ))}
              </div>
              <div className="rotate-180 rtl:rotate-0 text-2xl text-white/50">→</div>
              <button
                disabled={!result || !!cursor}
                onClick={() => {
                  if (!result || cursor) return
                  consumeCraft()
                  if (!addItem(result.item, result.count))
                    window.dispatchEvent(new CustomEvent('medocraft:toast', { detail: 'noSpace' }))
                }}
                className={`rounded-lg border-2 p-1 ${
                  result ? 'border-emerald-400/70 bg-emerald-500/15' : 'border-white/10 bg-black/40'
                }`}
              >
                {result ? <ItemIcon item={result.item} size={44} /> : <div className="h-11 w-11" />}
                {result && <div className="mt-0.5 text-[11px]">{itemName(result.item, lang)}</div>}
              </button>
            </div>
            <p className="mt-2 text-xs text-white/50">
              {craftSize}×{craftSize} · {mode === 'survival' ? t('menu.survival') : t('menu.creative')}
            </p>
          </div>

          {/* backpack + hotbar */}
          <div className="flex-1">
            {mode === 'creative' && (
              <>
                <h3 className="mb-2 text-sm text-white/70">{t('inv.creativeBlocks')}</h3>
                <div className="mb-3 grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-lg bg-black/40 p-2">
                  {CREATIVE_PALETTE.map((b) => (
                    <Slot
                      key={b}
                      stack={{ item: b, count: 1 }}
                      onClick={() => setSel(selectedSlot, { item: b, count: 64 })}
                      title={itemName(b, lang)}
                    />
                  ))}
                </div>
              </>
            )}
            <div className="mb-2 grid grid-cols-9 gap-1 rounded-lg bg-black/40 p-2">
              {inventory.map((st, i) => (
                <Slot key={i} stack={st} onClick={() => clickSlot(st, (s) => setInv(i, s))} />
              ))}
            </div>
            <div dir="ltr" className="grid grid-cols-9 gap-1 rounded-lg bg-black/40 p-2">
              {hotbar.map((st, i) => (
                <Slot key={i} stack={st} onClick={() => clickSlot(st, (s) => setSel(i, s))} highlight={selectedSlot === i} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* stack riding the mouse */}
      <CursorFollower cursor={cursor} />
    </div>
  )
}

/* ------------------------- helpers ------------------------- */

function CursorFollower({ cursor }: { cursor: ItemStack | null }) {
  const [pt, setPt] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const move = (e: MouseEvent) => setPt({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [])
  if (!cursor) return null
  return (
    <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2" style={{ left: pt.x, top: pt.y }}>
      <ItemIcon item={cursor.item} size={30} />
      {cursor.count > 1 && <span className="absolute bottom-0 end-0 text-xs font-bold drop-shadow-[0_1px_1px_#000]">{cursor.count}</span>}
    </div>
  )
}

function Slot({
  stack,
  onClick,
  highlight,
  title,
}: {
  stack: ItemStack | null
  onClick: () => void
  highlight?: boolean
  title?: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`relative flex h-13 w-13 items-center justify-center rounded-md border-2 p-0.5 transition-colors ${
        highlight ? 'border-white bg-white/20' : 'border-white/15 bg-white/5 hover:bg-white/15'
      }`}
      style={{ width: 52, height: 52 }}
    >
      {stack && (
        <>
          <ItemIcon item={stack.item} size={44} />
          {stack.count > 1 && (
            <span className="absolute bottom-0 end-1 text-[10px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
              {stack.count}
            </span>
          )}
        </>
      )}
    </button>
  )
}

function itemName(item: number, lang: 'ar' | 'en'): string {
  if (lang === 'en' && isBlockItem(item)) return BLOCKS[item as Block].name
  return translate(lang, `item.${itemToken(item)}`)
}
