/**
 * Block registry — every placeable voxel type in the game.
 * Each block declares a base color + pattern used by the procedural
 * 16x16 texture generator (replaceable later by real PNG atlases in /public/textures).
 */

export const CHUNK_SIZE = 16
export const WORLD_HEIGHT = 64

export enum Block {
  Air = 0,
  Grass,
  Dirt,
  Stone,
  Cobblestone,
  Sand,
  Sandstone,
  Log, // tree trunk (bark sides, rings top/bottom)
  Planks,
  Leaves,
  Cactus,
  Snow, // snow-topped grass (taiga)
  Glass,
  Water,
  Bedrock,
}

export type Face = 'top' | 'side' | 'bottom'

export interface BlockDef {
  id: Block
  /** English token id, used for recipes/localization keys */
  token: string
  name: string
  /** render as solid cube? (water/leaves are transparent-ish but still cubic here) */
  solid: boolean
  /** blocks player movement */
  collidable: boolean
  /** breakable by hand in survival? */
  breakable: boolean
  /** tool required (placeholder for survival mining rules) */
  tool?: 'pickaxe' | 'axe' | 'shovel'
  color: string
  top: PatternDef
  side: PatternDef
  bottom: PatternDef
}

export type PatternDef =
  | { kind: 'noise'; colors: string[] }
  | { kind: 'grass'; grass: string; dirt: string; speck: string }
  | { kind: 'logRings'; bark: string; ring: string }
  | { kind: 'planks'; base: string; line: string }
  | { kind: 'leaves'; base: string; dark: string; light: string }
  | { kind: 'glass'; frame: string; tint: string }
  | { kind: 'water'; base: string; wave: string }
  | { kind: 'cactus'; base: string; dark: string }
  | { kind: 'cobble'; base: string; dark: string; light: string }

const def = (
  id: Block,
  token: string,
  name: string,
  opts: Partial<Pick<BlockDef, 'solid' | 'collidable' | 'breakable' | 'tool'>> = {},
  patterns?: Partial<Record<Face, PatternDef>> & { color?: string },
): BlockDef => ({
  id,
  token,
  name,
  solid: opts.solid ?? true,
  collidable: opts.collidable ?? true,
  breakable: opts.breakable ?? true,
  tool: opts.tool,
  color: patterns?.color ?? '#888888',
  top: patterns?.top ?? { kind: 'noise', colors: [patterns?.color ?? '#888'] },
  side: patterns?.side ?? patterns?.top ?? { kind: 'noise', colors: [patterns?.color ?? '#888'] },
  bottom: patterns?.bottom ?? patterns?.side ?? patterns?.top ?? { kind: 'noise', colors: [patterns?.color ?? '#888'] },
})

const noise = (...colors: string[]): PatternDef => ({ kind: 'noise', colors })

export const BLOCKS: Record<Block, BlockDef> = {
  [Block.Air]: def(Block.Air, 'air', 'Air', { solid: false, collidable: false, breakable: false }),
  [Block.Grass]: def(Block.Grass, 'grass', 'Grass Block', {}, {
    color: '#57833e',
    top: noise('#57833e', '#4e7a38', '#639346', '#4a7335'),
    side: { kind: 'grass', grass: '#57833e', dirt: '#79552f', speck: '#6b4b28' },
    bottom: noise('#79552f', '#6b4b28', '#835d35'),
  }),
  [Block.Dirt]: def(Block.Dirt, 'dirt', 'Dirt', {}, {
    color: '#79552f',
    top: noise('#79552f', '#6b4b28', '#835d35'),
  }),
  [Block.Stone]: def(Block.Stone, 'stone', 'Stone', { tool: 'pickaxe' }, {
    color: '#7d7d7d',
    top: noise('#7d7d7d', '#717171', '#888888'),
  }),
  [Block.Cobblestone]: def(Block.Cobblestone, 'cobblestone', 'Cobblestone', { tool: 'pickaxe' }, {
    color: '#7a7a7a',
    top: { kind: 'cobble', base: '#7a7a7a', dark: '#4f4f4f', light: '#949494' },
  }),
  [Block.Sand]: def(Block.Sand, 'sand', 'Sand', {}, {
    color: '#dbd3a1',
    top: noise('#dbd3a1', '#d1c994', '#e3dcae'),
  }),
  [Block.Sandstone]: def(Block.Sandstone, 'sandstone', 'Sandstone', { tool: 'pickaxe' }, {
    color: '#cfc37f',
    top: noise('#cfc37f', '#c6ba74'),
    side: noise('#cfc37f', '#c2b56c', '#d8cd8d'),
  }),
  [Block.Log]: def(Block.Log, 'log', 'Wood Log', { tool: 'axe' }, {
    color: '#6b5334',
    top: { kind: 'logRings', bark: '#6b5334', ring: '#a08353' },
    side: { kind: 'logRings', bark: '#6b5334', ring: '#5d4728' },
    bottom: { kind: 'logRings', bark: '#6b5334', ring: '#a08353' },
  }),
  [Block.Planks]: def(Block.Planks, 'planks', 'Wooden Planks', {}, {
    color: '#9c7f4e',
    top: { kind: 'planks', base: '#9c7f4e', line: '#7d6339' },
  }),
  [Block.Leaves]: def(Block.Leaves, 'leaves', 'Leaves', {}, {
    color: '#3f6b25',
    top: { kind: 'leaves', base: '#3f6b25', dark: '#2e5219', light: '#54853a' },
  }),
  [Block.Cactus]: def(Block.Cactus, 'cactus', 'Cactus', {}, {
    color: '#0b9e3b',
    top: { kind: 'cactus', base: '#0b9e3b', dark: '#076e29' },
    side: { kind: 'cactus', base: '#0e8a37', dark: '#076e29' },
    bottom: { kind: 'cactus', base: '#0b9e3b', dark: '#076e29' },
  }),
  [Block.Snow]: def(Block.Snow, 'snow', 'Snowy Grass', {}, {
    color: '#e8f0f5',
    top: noise('#e8f0f5', '#dbe6ee', '#f4fafd'),
    side: { kind: 'grass', grass: '#e8f0f5', dirt: '#79552f', speck: '#c9d8e2' },
    bottom: noise('#79552f', '#6b4b28'),
  }),
  [Block.Glass]: def(Block.Glass, 'glass', 'Glass', {}, {
    color: '#bfe3ee',
    top: { kind: 'glass', frame: '#dfeef4', tint: '#a8d8e8' },
  }),
  [Block.Water]: def(Block.Water, 'water', 'Water', { solid: false, collidable: false, breakable: false }, {
    color: '#3b6fd4',
    top: { kind: 'water', base: '#3b6fd4', wave: '#5a8ce0' },
  }),
  [Block.Bedrock]: def(Block.Bedrock, 'bedrock', 'Bedrock', { breakable: false }, {
    color: '#3a3a3a',
    top: noise('#3a3a3a', '#2e2e2e', '#4a4a4a', '#242424'),
  }),
}

export const blockDef = (b: Block): BlockDef => BLOCKS[b]
export const isSolid = (b: Block): boolean => b !== Block.Air && BLOCKS[b].solid
export const isCollidable = (b: Block): boolean => b !== Block.Air && BLOCKS[b].collidable

/** Placeable blocks in the creative palette (water/bedrock excluded:
 *  water can't be re-targeted by the raycast, bedrock can't be broken) */
export const CREATIVE_PALETTE: Block[] = (Object.keys(BLOCKS) as unknown as string[])
  .map(Number)
  .filter(
    (id) =>
      !Number.isNaN(id) &&
      id !== Block.Air &&
      id !== Block.Water &&
      id !== Block.Bedrock &&
      BLOCKS[id as Block].breakable,
  ) as Block[]
