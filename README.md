# ميدو كرافت ٢٠٢ · MedoCraft 2026

A 3D voxel survival & building game for the web — React 19 + Vite + TypeScript +
Three.js (`@react-three/fiber`), Arabic-first with full RTL UI, with optional
2+ player online co-op over a tiny WebSocket relay.

```bash
npm install
npm run dev        # http://localhost:5173
npm run dev:mp     # multiplayer relay on ws://localhost:8768
npm run build      # typecheck + production bundle
npm run test:engine# 17 headless engine assertions (worldgen, raycast, crafting, saves)
```

## Architecture tour (build order = the step-by-step recipe)

| Step | File | What it does |
|---|---|---|
| 1 | `src/utils/blocks.ts` | Block registry: 15 voxel types with per-face texture patterns, solidity/collision/tool flags. `CHUNK_SIZE=16`, `WORLD_HEIGHT=64`. |
| 2 | `src/utils/worldGen.ts` | Seeded simplex noise → height, temperature, moisture fields → **4 biomes** (plains, forest, desert, taiga), water at sea level, oak/spruce trees, cacti. Fully deterministic from the seed string. |
| 3 | `src/utils/world.ts` | `VoxelWorld` class: on-demand chunk generation, player edits stored as **deltas only** (serializable to localStorage), dirty-chunk bookkeeping, DDA `raycastVoxel`, and `buildChunkMesh` → one **InstancedMesh per block type** with 6-material boxes and neighbor face-culling. |
| 4 | `src/utils/collision.ts` | Custom AABB voxel physics (chosen over Rapier — a general engine is wasted on a block world). Per-axis sweep = natural wall sliding; Minecraft-like gravity/jump/sprint/fly constants. |
| 5 | `src/utils/textures.ts` | Two-layer texture pipeline: procedural deterministic 16×16 canvas art for every face **plus** `TEXTURE_OVERRIDES` map that swaps in real CC0 PNGs from `public/textures/` when present. Shared cached materials. |
| 6 | `src/components/Player.tsx` | Pointer-Lock FPS camera, WASD/jump/sprint, F to fly (creative), center-screen raycast → wireframe highlight, LMB break / RMB place / MMB pick (creative). |
| 7 | `src/components/VoxelWorld.tsx` | Chunk streaming: ring of chunks around the player, unload beyond view distance, rebuild dirty chunks with a 3-per-frame budget so mining never stutters. |
| 8 | `src/store/useGameStore.ts` | Zustand: mode, stats (health/hunger), hotbar/inventory/crafting grid, mob list, save/load. Hot per-frame data lives in a mutable `runtime` object — no re-renders at 60fps. |
| 9 | `src/utils/recipes.ts` | Shape-trimmed crafting matcher (Minecraft rules): Log→4 Planks, 2 Planks→4 Sticks, 3×3 Pickaxe/Axe/Shovel/Sword, 4 Sand→4 Glass. |
| 10 | `src/components/UI/*` | `MainMenu` (mode + seed + language + online toggle), `HUD` (crosshair, hearts/food, hotbar, connection chip, toasts), `Inventory` (cursor-stack drag, 2×2 survival / 3×3 creative crafting, creative block palette). |
| 11 | `src/utils/i18n.ts` | ar/en dictionary (Arabic default). RTL is handled by setting `dir` on `<html>` + Tailwind v4 **logical utilities** (`start/end/ms/me`) — every panel mirrors for free. |
| 12 | `src/net/multiplayer.ts` | Transport-agnostic protocol (`NetMessage` union: join/state/block/chat/leave) with `WebSocketTransport`, `LoopbackTransport` (tests) and throttled `WorldSession`. Game glue in `src/net/session.ts`; relay server in `server/mpServer.ts` (rooms keyed by seed, late-joiner edit replay). |

## Controls
WASD move · Space jump · Shift sprint · **F** fly (creative) · LMB break · RMB place ·
MMB pick block (creative) · 1-9 hotbar · E inventory/crafting · Esc pause

## Survival vs Creative
- **Survival:** hunger drains (faster when sprinting), regen above 16 food, starvation damage,
  tool-gated mining (stone needs a pickaxe, logs an axe), mobs deal damage, drops go to inventory, die → respawn screen.
- **Creative:** flight, infinite stacks, instant break, block-pick, full palette, 3×3 crafting.

## Persistence
`localStorage["medocraft-2026:save"]` = seed + mode + stats + inventory + position +
**only the blocks you changed** (the terrain itself regenerates from the seed — saves stay tiny).

## Assets
All shipped art is CC0 — sources, curl commands and the swap-in pipeline are documented in [ASSETS.md](./ASSETS.md).

## Multiplayer (2+ players online)
`npm run dev:mp` starts the relay; in the main menu tick **لعب أونلاين**, set a name,
and share the **same world seed** — the seed is the room ID. Player movement, block
breaks/placements and late-joiner world edits sync between clients; peers render as
named avatars. `node scripts/mp-probe.mjs <seed>` joins a room headlessly for testing.

## Roadmap hooks
- Server authority: `mpServer` is currently a broadcaster — add validation/ownership there.
- Better mobs: replace `MobAI.tsx` box placeholders with Quaternius CC0 glTF via `useGLTF` — AI loop untouched.
- Day/night: animate the `<Sky>` sun position + light intensity in `Canvas3D.tsx`.
- Textures: add PNGs + one `TEXTURE_OVERRIDES` line each.
