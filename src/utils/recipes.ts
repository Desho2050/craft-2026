/**
 * Items, crafting recipes and match logic.
 * Blocks double as items; a handful of non-block items (sticks, tools) use ids above 100.
 */
import { Block, BLOCKS } from './blocks'

export type ItemId = number

export const STICK: ItemId = 100
export const PICKAXE: ItemId = 101
export const AXE: ItemId = 102
export const SHOVEL: ItemId = 103
export const SWORD: ItemId = 104
export const APPLE: ItemId = 105
export const ROTTEN_FLESH: ItemId = 106

export interface ItemStack {
  item: ItemId
  count: number
}

export const MAX_STACK = 64

interface ExtraItemDef {
  token: string
  glyph: string
  tool?: 'pickaxe' | 'axe' | 'shovel' | 'sword'
  /** hunger points restored when eaten (R key) */
  food?: number
}

const EXTRA_ITEMS: Record<number, ExtraItemDef> = {
  [STICK]: { token: 'stick', glyph: '∣' },
  [PICKAXE]: { token: 'pickaxe', glyph: '⛏', tool: 'pickaxe' },
  [AXE]: { token: 'axe', glyph: '🪓', tool: 'axe' },
  [SHOVEL]: { token: 'shovel', glyph: '🥄', tool: 'shovel' },
  [SWORD]: { token: 'sword', glyph: '🗡', tool: 'sword' },
  [APPLE]: { token: 'apple', glyph: '🍎', food: 5 },
  [ROTTEN_FLESH]: { token: 'rottenFlesh', glyph: '🍖', food: 4 },
}

export function isBlockItem(item: ItemId): boolean {
  return item in BLOCKS && item !== Block.Air
}

export function isFood(item: ItemId): boolean {
  return EXTRA_ITEMS[item]?.food != null
}

export const foodValue = (item: ItemId): number => EXTRA_ITEMS[item]?.food ?? 0

export function itemToken(item: ItemId): string {
  if (isBlockItem(item)) return BLOCKS[item as Block].token
  return EXTRA_ITEMS[item]?.token ?? 'unknown'
}

export function itemTool(item: ItemId): 'pickaxe' | 'axe' | 'shovel' | 'sword' | undefined {
  return EXTRA_ITEMS[item]?.tool
}

export function itemGlyph(item: ItemId): string {
  return EXTRA_ITEMS[item]?.glyph ?? ''
}

/* ------------------------- recipes ------------------------- */

export interface Recipe {
  id: string
  /** trimmed shape; each char maps via `key`, '.' = empty */
  pattern: string[]
  key: Record<string, ItemId>
  result: ItemStack
  /** minimum crafting grid size needed (2 or 3) */
  minSize: 2 | 3
}

const L = Block.Log
const P = Block.Planks

export const RECIPES: Recipe[] = [
  {
    id: 'planks',
    pattern: ['L'],
    key: { L },
    result: { item: Block.Planks, count: 4 },
    minSize: 2,
  },
  {
    id: 'stick',
    pattern: ['P', 'P'],
    key: { P },
    result: { item: STICK, count: 4 },
    minSize: 2,
  },
  {
    id: 'pickaxe',
    pattern: ['PPP', '.S.', '.S.'],
    key: { P, S: STICK },
    result: { item: PICKAXE, count: 1 },
    minSize: 3,
  },
  {
    id: 'axe',
    pattern: ['PP', 'PS', '.S'],
    key: { P, S: STICK },
    result: { item: AXE, count: 1 },
    minSize: 3,
  },
  {
    id: 'shovel',
    pattern: ['P', 'S', 'S'],
    key: { P, S: STICK },
    result: { item: SHOVEL, count: 1 },
    minSize: 3,
  },
  {
    id: 'sword',
    pattern: ['P', 'P', 'S'],
    key: { P, S: STICK },
    result: { item: SWORD, count: 1 },
    minSize: 3,
  },
  {
    id: 'glass',
    pattern: ['SS', 'SS'],
    key: { S: Block.Sand },
    result: { item: Block.Glass, count: 4 },
    minSize: 2,
  },
  {
    id: 'cobble_to_stone',
    pattern: ['C'],
    key: { C: Block.Cobblestone },
    result: { item: Block.Stone, count: 1 },
    minSize: 2,
  },
]

/**
 * Match a crafting grid (row-major, size x size of ItemId|null) to a recipe.
 * Trims empty border rows/columns (Minecraft shape-free placement) then compares.
 */
export function findRecipe(grid: (ItemId | null)[], size: 2 | 3): Recipe | null {
  const at = (r: number, c: number) => grid[r * size + c]
  let minR: number = size, maxR = -1, minC: number = size, maxC = -1
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (at(r, c) != null) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r)
        minC = Math.min(minC, c); maxC = Math.max(maxC, c)
      }
  if (maxR < 0) return null
  const h = maxR - minR + 1
  const w = maxC - minC + 1
  const shape: (ItemId | null)[][] = []
  for (let r = 0; r < h; r++) {
    const row: (ItemId | null)[] = []
    for (let c = 0; c < w; c++) row.push(at(minR + r, minC + c))
    shape.push(row)
  }

  for (const rec of RECIPES) {
    if (rec.pattern.length !== h || rec.pattern[0].length !== w) continue
    if (Math.max(h, w) > size) continue
    let ok = true
    outer: for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const ch = rec.pattern[r][c]
        const expected = ch === '.' ? null : rec.key[ch]
        if (shape[r][c] !== expected) {
          ok = false
          break outer
        }
      }
    if (ok) return rec
  }
  return null
}
