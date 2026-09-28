/**
 * Central Zustand store: game mode, world instance, player stats,
 * inventory/hotbar/crafting and settings — persisted to localStorage.
 *
 * Hot per-frame values (mobs, player pos) are kept in plain mutable objects
 * on the store and only mirrored to React state when a render actually
 * needs them, so 60fps updates never trigger re-renders.
 */
import { create } from 'zustand'
import { Block, BLOCKS } from '../utils/blocks'
import { VoxelWorld } from '../utils/world'
import { surfaceY } from '../utils/collision'
import {
  type ItemId,
  type ItemStack,
  MAX_STACK,
  APPLE,
  ROTTEN_FLESH,
  isBlockItem,
  isFood,
  foodValue,
  itemTool,
  findRecipe,
} from '../utils/recipes'
import { particleHooks } from '../utils/particles'
import type { Lang } from '../utils/i18n'
import { connectNet, disconnectNet, getNet } from '../net/session'

export type GameMode = 'survival' | 'creative'
export type UiOverlay = 'none' | 'inventory' | 'pause' | 'death' | 'menu'

export const MOB_MAX_HEALTH = 10
export const MAX_MOBS = 6
export const DESPAWN_RADIUS = 96

export interface Mob {
  id: number
  kind: 'zombie'
  x: number
  y: number
  z: number
  yaw: number
  vx: number
  vz: number
  health: number
  lastAttack: number
  nextTurn: number
}

interface SaveData {
  seed: string
  mode: GameMode
  lang: Lang
  health: number
  hunger: number
  hotbar: (ItemStack | null)[]
  inventory: (ItemStack | null)[]
  position: [number, number, number]
  modifications: string
}

const SAVE_KEY = 'medocraft-2026:save'
const SETTINGS_KEY = 'medocraft-2026:settings'

// survival tick accumulators (kept out of the store so per-frame work never re-renders)
let hungerDrain = 0
let regenAcc = 0
let starveAcc = 0

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) != null
  } catch {
    return false
  }
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

function resetSurvivalTimers(): void {
  hungerDrain = 0
  regenAcc = 0
  starveAcc = 0
}

interface GameStore {
  // --- app flow ---
  screen: 'menu' | 'game'
  overlay: UiOverlay
  mode: GameMode
  lang: Lang
  seed: string

  // --- world & player (mutable, non-reactive hot data) ---
  world: VoxelWorld | null
  spawnPos: [number, number, number]
  /** updated every frame by <Player/> — mutable on purpose to avoid re-renders */
  runtime: { pos: [number, number, number]; onGround: boolean }
  mobs: Mob[]
  mobCounter: number

  // --- survival stats ---
  health: number
  hunger: number

  // --- inventory ---
  hotbar: (ItemStack | null)[]
  inventory: (ItemStack | null)[]
  craftingGrid: (ItemStack | null)[]
  craftSize: 2 | 3
  selectedSlot: number

  // --- creative ---
  flying: boolean
  /** true while the eat key is held — HUD shows a bite animation */
  eating: boolean

  // --- actions ---
  setLang: (l: Lang) => void
  startGame: (opts: { seed?: string; mode: GameMode; fromSave?: boolean; mp?: { url: string; name: string } }) => void
  quitToMenu: () => void
  openOverlay: (o: UiOverlay) => void
  closeOverlay: () => void
  selectSlot: (i: number) => void
  toggleFly: () => void
  addItem: (item: ItemId, count: number) => boolean
  removeSelected: (n?: number) => ItemStack | null
  breakBlock: (x: number, y: number, z: number) => boolean
  placeBlock: (x: number, y: number, z: number) => boolean
  eat: () => void
  attack: (dir: { x: number; y: number; z: number }, eye: { x: number; y: number; z: number }) => boolean
  maintainMobs: () => void
  setCraftSlot: (i: number, stack: ItemStack | null) => void
  craftResult: () => ItemStack | null
  consumeCraft: () => void
  setSel: (slotIndex: number, stack: ItemStack | null) => void
  setInv: (slotIndex: number, stack: ItemStack | null) => void
  damage: (n: number) => void
  tickSurvival: (dt: number, sprinting: boolean) => void
  respawn: () => void
  save: () => void
}

function loadSettings(): { lang: Lang } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { lang: 'ar' }
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'menu',
  overlay: 'none',
  mode: 'survival',
  lang: loadSettings().lang,
  seed: '',

  world: null,
  spawnPos: [8, 40, 8],
  runtime: { pos: [8, 40, 8], onGround: false },
  mobs: [],
  mobCounter: 0,

  health: 20,
  hunger: 20,

  hotbar: Array(9).fill(null),
  inventory: Array(27).fill(null),
  craftingGrid: Array(9).fill(null),
  craftSize: 2,
  selectedSlot: 0,

  flying: false,
  eating: false,

  setLang: (lang) => {
    set({ lang })
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lang }))
    } catch { /* ignore */ }
  },

  startGame: ({ seed, mode, fromSave, mp: opts }) => {
    const finalSeed = seed || randomSeed()
    const world = new VoxelWorld(finalSeed)
    resetSurvivalTimers()

    if (fromSave) {
      try {
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') as Partial<SaveData>
        world.loadModifications(saved.modifications ?? '{}')
        const pos = saved.position ?? [8.5, surfaceY(world, 8, 8) + 1, 8.5]
        const roomSeed = saved.seed ?? finalSeed
        set({
          world,
          seed: roomSeed,
          mode: saved.mode ?? 'survival',
          craftSize: saved.mode === 'creative' ? 3 : 2,
          health: saved.health ?? 20,
          hunger: saved.hunger ?? 20,
          hotbar: saved.hotbar ?? Array(9).fill(null),
          inventory: saved.inventory ?? Array(27).fill(null),
          spawnPos: pos,
          runtime: { pos: [...pos] as [number, number, number], onGround: false },
          mobs: spawnMobs(world, pos[0], pos[1], pos[2]),
          screen: 'game',
          overlay: 'none',
          flying: false,
          craftingGrid: Array(9).fill(null),
        })
        if (opts) connectNet(opts.url, opts.name, roomSeed)
        return
      } catch { /* fall through to fresh world */ }
    }

    const spawnY = surfaceY(world, 8, 8) + 1
    // starter kit so survival isn't hopeless at t=0
    const hotbar: (ItemStack | null)[] = Array(9).fill(null)
    if (mode === 'survival') hotbar[0] = { item: Block.Planks, count: 8 }
    set({
      world,
      seed: finalSeed,
      mode,
      health: 20,
      hunger: 20,
      hotbar,
      inventory: Array(27).fill(null),
      craftingGrid: Array(9).fill(null),
      spawnPos: [8.5, spawnY, 8.5],
      runtime: { pos: [8.5, spawnY, 8.5], onGround: false },
      screen: 'game',
      overlay: 'none',
      flying: false,
      craftSize: mode === 'creative' ? 3 : 2,
      mobs: spawnMobs(world, 8.5, spawnY, 8.5),
    })
    get().save()
    if (opts) connectNet(opts.url, opts.name, finalSeed)
  },

  quitToMenu: () => {
    get().save()
    disconnectNet()
    set({ screen: 'menu', overlay: 'none', flying: false })
  },

  openOverlay: (overlay) => set({ overlay }),
  closeOverlay: () => set({ overlay: 'none' }),
  selectSlot: (selectedSlot) => set({ selectedSlot }),
  toggleFly: () => set((s) => ({ flying: !s.flying })),

  addItem: (item, count) => {
    if (count <= 0 || !Number.isInteger(count)) return false
    const s = get()
    const addTo = (arr: (ItemStack | null)[]) => {
      let left = count
      for (const slot of arr) {
        if (left <= 0) break
        if (slot && slot.item === item && slot.count < MAX_STACK) {
          const add = Math.min(MAX_STACK - slot.count, left)
          slot.count += add
          left -= add
        }
      }
      for (let i = 0; i < arr.length && left > 0; i++) {
        if (!arr[i]) {
          const add = Math.min(MAX_STACK, left)
          arr[i] = { item, count: add }
          left -= add
        }
      }
      return left
    }
    let left = addTo(s.hotbar)
    left = addTo(s.inventory)
    set({ hotbar: [...s.hotbar], inventory: [...s.inventory] })
    return left === 0
  },

  removeSelected: (n = 1) => {
    const s = get()
    const stack = s.hotbar[s.selectedSlot]
    if (!stack) return null
    if (s.mode === 'creative') return stack // infinite resources in creative
    if (stack.count <= n) {
      const hotbar = [...s.hotbar]
      hotbar[s.selectedSlot] = null
      set({ hotbar })
      return { ...stack, count: n }
    }
    const hotbar = [...s.hotbar]
    hotbar[s.selectedSlot] = { ...stack, count: stack.count - n }
    set({ hotbar })
    return { item: stack.item, count: n }
  },

  breakBlock: (x, y, z) => {
    const s = get()
    if (!s.world) return false
    const b = s.world.getBlock(x, y, z)
    if (b === Block.Air) return false
    if (!BLOCKS[b].breakable) return false
    // survival gating: stone-family needs a pickaxe in hand
    if (s.mode === 'survival') {
      const required = b === Block.Stone || b === Block.Cobblestone || b === Block.Sandstone ? 'pickaxe'
        : b === Block.Log ? 'axe' : null
      if (required) {
        const held = s.hotbar[s.selectedSlot]
        if (!held || itemTool(held.item) !== required) {
          window.dispatchEvent(new CustomEvent('medocraft:toast', { detail: 'needsTool' }))
          return false
        }
      }
    }
    s.world.setBlock(x, y, z, Block.Air)
    getNet()?.broadcastBlock(x, y, z, Block.Air)
    particleHooks.burst(b, x, y, z, 14)
    if (s.mode === 'survival') {
      if (isBlockItem(b)) get().addItem(b, 1)
      // apple harvest: breaking leaves sometimes drops food
      if (b === Block.Leaves && Math.random() < 0.25) get().addItem(APPLE, 1)
    }
    get().save()
    return true
  },

  placeBlock: (x, y, z) => {
    const s = get()
    if (!s.world) return false
    const stack = s.hotbar[s.selectedSlot]
    if (!stack || !isBlockItem(stack.item)) return false
    if (s.world.getBlock(x, y, z) !== Block.Air) return false
    // don't place inside the player's AABB
    const [px, py, pz] = s.runtime.pos
    if (x + 1 > px - 0.3 && x < px + 0.3 && z + 1 > pz - 0.3 && z < pz + 0.3 && y + 1 > py && y < py + 1.8)
      return false
    s.world.setBlock(x, y, z, stack.item as Block)
    getNet()?.broadcastBlock(x, y, z, stack.item as Block)
    particleHooks.burst(stack.item as Block, x, y, z, 6)
    if (s.mode === 'survival') get().removeSelected(1)
    get().save()
    return true
  },

  eat: () => {
    const s = get()
    if (s.mode !== 'survival' || s.overlay !== 'none') return
    const stack = s.hotbar[s.selectedSlot]
    if (!stack || !isFood(stack.item)) {
      window.dispatchEvent(new CustomEvent('medocraft:toast', { detail: 'notFood' }))
      return
    }
    if (s.hunger >= 20) return
    const hotbar = [...s.hotbar]
    hotbar[s.selectedSlot] = stack.count > 1 ? { ...stack, count: stack.count - 1 } : null
    set({ hotbar, hunger: Math.min(20, s.hunger + foodValue(stack.item)) })
    get().save()
  },

  attack: (dir, eye) => {
    const s = get()
    if (s.mode !== 'survival' || !s.mobs.length) return false
    const held = s.hotbar[s.selectedSlot]
    if (!held || itemTool(held.item) !== 'sword') {
      window.dispatchEvent(new CustomEvent('medocraft:toast', { detail: 'needsSword' }))
      return false
    }
    // nearest mob roughly along the aim ray, within melee range
    const len = Math.hypot(dir.x, dir.y, dir.z)
    if (len < 1e-6) return false
    const dx = dir.x / len, dy = dir.y / len, dz = dir.z / len
    let best = -1
    let bestAlong = 0
    for (let i = 0; i < s.mobs.length; i++) {
      const mob = s.mobs[i]
      const cx = mob.x - eye.x, cy = mob.y + 1 - eye.y, cz = mob.z - eye.z
      const along = cx * dx + cy * dy + cz * dz
      if (along < 0 || along > 3.5) continue
      const perp = Math.hypot(cx - along * dx, cy - along * dy, cz - along * dz)
      if (perp > 0.9) continue
      if (best < 0 || along < bestAlong) {
        best = i
        bestAlong = along
      }
    }
    if (best < 0) return false
    const mobs = s.mobs.map((m, i) => (i === best ? { ...m, health: m.health - 5 } : m))
    const dead = mobs[best].health <= 0
    particleHooks.burst(Block.Leaves, Math.floor(mobs[best].x), Math.floor(mobs[best].y), Math.floor(mobs[best].z), 8)
    set({ mobs: dead ? mobs.filter((_, i) => i !== best) : mobs })
    if (dead) get().addItem(ROTTEN_FLESH, 1)
    get().save()
    return true
  },

  maintainMobs: () => {
    const s = get()
    if (s.mode !== 'survival' || !s.world) return
    const [px, , pz] = s.runtime.pos
    // mobs left far behind are stranded on terrain the player no longer sees —
    // prune them so the population follows the player instead of freezing in place
    const kept = s.mobs.filter((m) => Math.hypot(m.x - px, m.z - pz) <= DESPAWN_RADIUS)
    if (kept.length >= MAX_MOBS) {
      if (kept.length !== s.mobs.length) set({ mobs: kept })
      return
    }
    let id = kept.reduce((m, b) => Math.max(m, b.id), -1) + 1
    while (kept.length < MAX_MOBS) kept.push(makeMob(s.world, id++, px, pz))
    set({ mobs: kept })
  },

  setCraftSlot: (i, stack) => {
    const s = get()
    const grid = [...s.craftingGrid]
    grid[i] = stack
    set({ craftingGrid: grid })
  },

  craftResult: () => {
    const s = get()
    const items = s.craftingGrid.map((st) => st?.item ?? null)
    // grids carry counts of 1 while crafting; count >1 slots block the recipe check
    const rec = findRecipe(items, s.craftSize)
    return rec ? rec.result : null
  },

  consumeCraft: () => {
    const s = get()
    const rec = findRecipe(s.craftingGrid.map((st) => st?.item ?? null), s.craftSize)
    if (!rec) return
    const grid = s.craftingGrid.map((st) => {
      if (!st) return null
      const left = st.count - 1
      return left <= 0 ? null : { ...st, count: left }
    })
    set({ craftingGrid: grid })
    get().addItem(rec.result.item, rec.result.count)
    get().save()
  },

  setSel: (slotIndex, stack) => {
    const s = get()
    const hotbar = [...s.hotbar]
    hotbar[slotIndex] = stack
    set({ hotbar })
  },

  setInv: (slotIndex, stack) => {
    const s = get()
    const inventory = [...s.inventory]
    inventory[slotIndex] = stack
    set({ inventory })
  },

  damage: (n) => {
    const s = get()
    if (s.mode !== 'survival') return
    const health = Math.max(0, s.health - n)
    set({ health })
    if (health === 0) set({ overlay: 'death' })
  },

  tickSurvival: (dt, sprinting) => {
    const s = get()
    if (s.mode !== 'survival' || s.overlay !== 'none') return
    // batched writes: only touch the store when a displayed (½-heart) step changes,
    // otherwise the HUD re-renders at 60fps for a float nobody can see
    hungerDrain += dt * (sprinting ? 0.06 : 0.018)
    let { hunger, health } = s
    let changed = false
    if (hungerDrain >= 0.5) {
      hunger = Math.max(0, hunger - hungerDrain)
      hungerDrain = 0
      changed = true
    }
    if (hunger > 16 && health < 20) {
      regenAcc += dt
      if (regenAcc > 4) {
        health = Math.min(20, health + 1)
        regenAcc = 0
        changed = true
      }
    }
    if (hunger <= 0) {
      starveAcc += dt
      if (starveAcc > 3) {
        health = Math.max(0, health - 1)
        starveAcc = 0
        changed = true
        if (health === 0) set({ overlay: 'death' })
      }
    }
    if (changed) set({ hunger, health })
  },

  respawn: () => {
    const s = get()
    resetSurvivalTimers()
    set({ health: 20, hunger: 20, overlay: 'none' })
    const y = s.world ? surfaceY(s.world, s.spawnPos[0], s.spawnPos[2]) : 40
    set({ spawnPos: [s.spawnPos[0], y + 1, s.spawnPos[2]] })
    window.dispatchEvent(new CustomEvent('medocraft:respawn'))
  },

  save: () => {
    const s = get()
    if (!s.world) return
    const data: SaveData = {
      seed: s.seed,
      mode: s.mode,
      lang: s.lang,
      health: s.health,
      hunger: s.hunger,
      hotbar: s.hotbar,
      inventory: s.inventory,
      position: s.runtime.pos,
      modifications: s.world.serializeModifications(),
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    } catch { /* storage full / private mode */ }
  },
}))

/** hostile mobs spawn in a ring around the player at world load */
function spawnMobs(world: VoxelWorld, px: number, _py: number, pz: number): Mob[] {
  const mobs: Mob[] = []
  for (let i = 0; i < MAX_MOBS; i++) mobs.push(makeMob(world, i, px, pz))
  return mobs
}

function makeMob(world: VoxelWorld, id: number, px: number, pz: number): Mob {
  const angle = Math.random() * Math.PI * 2
  const dist = 20 + Math.random() * 25
  const x = px + Math.cos(angle) * dist
  const z = pz + Math.sin(angle) * dist
  return {
    id,
    kind: 'zombie',
    x,
    y: surfaceY(world, x, z),
    z,
    yaw: 0,
    vx: 0,
    vz: 0,
    health: MOB_MAX_HEALTH,
    lastAttack: 0,
    nextTurn: 0,
  }
}
