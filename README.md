# ميدو كرافت ٢٠٢ · MedoCraft 2026

A 3D voxel survival & building game for the web — React 19 + Vite + TypeScript +
Three.js (`@react-three/fiber`), Arabic-first with full RTL UI, with optional
2+ player online co-op over a tiny WebSocket relay.

```bash
npm install
npm run dev        # http://localhost:5173
npm run dev:mp     # multiplayer relay on ws://localhost:8768
npm run build      # typecheck + production bundle
npm run test:engine# 62 headless engine assertions (worldgen, raycast, crafting, saves, mobs, VFX, day cycle)
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
| 10 | `src/components/UI/*` | `MainMenu` (mode + seed + language + sound + online toggle), `HUD` (crosshair, hearts/food, hotbar, day-clock chip, connection chip, toasts), `Inventory` (cursor-stack drag, 2×2 survival / 3×3 creative crafting, creative block palette). |
| 11 | `src/utils/i18n.ts` | ar/en dictionary (Arabic default). RTL is handled by setting `dir` on `<html>` + Tailwind v4 **logical utilities** (`start/end/ms/me`) — every panel mirrors for free. |
| 12 | `src/net/multiplayer.ts` | Transport-agnostic protocol (`NetMessage` union: join/state/block/chat/leave) with `WebSocketTransport`, `LoopbackTransport` (tests) and throttled `WorldSession`. Game glue in `src/net/session.ts`; relay server in `server/mpServer.ts` (rooms keyed by seed, late-joiner edit replay). Shared gates live in `src/net/validate.ts`. |
| 13 | `src/utils/particles.ts` + `src/components/Particles.tsx` | Break/place/melee VFX: the store fires `particleHooks.burst(...)`, the scene pools 128 textured mini-cubes per block type, one InstancedMesh each, and integrates motion analytically — no particle state ever reaches React. |
| 14 | `src/utils/audio.ts` | Procedural SFX — nine voices (break, place, step, eat, hit, hurt, growl, click, craft) synthesised from a noise buffer through sweeping biquads and oscillator glides. Zero audio files, `AudioContext` created lazily on the first gesture, per-voice 45 ms throttle, mute persisted with the settings. |
| 15 | `src/utils/dayCycle.ts` + `src/components/DayNight.tsx` | 10-minute sun arc. `skyAt(time)` is pure math (sun vector, light 0..1, fog, star alpha, clock) so it is unit-testable; `DayNight` pushes those values into the sky-dome uniforms, three lights, `THREE.Fog` and a camera-locked star shell every frame, mutating three objects instead of React state. Only the coarse `dayPhase` (dawn/day/dusk/night) is reactive — the HUD clock chip reads the mutable `runtime.time`. |

## Controls
WASD move · Space jump · Shift sprint · **F** fly (creative) · LMB break / attack (sword) · RMB place ·
MMB pick block (creative) · **R** eat held food · 1-9 hotbar · E inventory/crafting · Esc pause
(pause and the main menu both carry a 🔊 sound toggle and the 🌐 language toggle)

## Sound & daylight
- **Sound** is fully synthesised in `src/utils/audio.ts` — footsteps, digging, placing, eating, hits,
  mob growls and UI clicks. Nothing to download, nothing to license; browsers only unlock audio after
  the first click/key, so the context boots lazily and the mute switch is saved with the settings.
- **Day/night** runs a 10-minute sun arc (`DAY_LENGTH` in `src/utils/dayCycle.ts`): dawn, day, dusk and
  night move the sun, tint the lights, pull the fog in at night and fade in a star shell. The HUD chip
  shows the in-world 24h clock; the clock is saved with the world, so a night stays a night on reload.

## Survival vs Creative
- **Survival:** hunger drains (faster when sprinting), regen above 16 food, starvation damage,
  tool-gated mining (stone needs a pickaxe, logs an axe), mobs deal damage, drops go to inventory, die → respawn screen.
  Food: apples drop from leaves (25%) and rotten flesh from killed zombies — both restore hunger (+5 / +4).
  Zombies have 10 HP, take 5 per sword hit, show a health bar when wounded, and the population of 6
  follows the player (mobs beyond 96 blocks despawn, a 20s maintain tick refills the ring).
- **Creative:** flight, infinite stacks, instant break, block-pick, full palette, 3×3 crafting.

## Persistence
`localStorage["medocraft-2026:save"]` = seed + mode + stats + inventory + position + day time +
**only the blocks you changed** (the terrain itself regenerates from the seed — saves stay tiny).

## Assets
All shipped art is CC0 — sources, curl commands and the swap-in pipeline are documented in [ASSETS.md](./ASSETS.md).

## Multiplayer (2+ players online)
`npm run dev:mp` starts the relay; in the main menu tick **لعب أونلاين**, set a name,
and share the **same world seed** — the seed is the room ID. Player movement, block
breaks/placements and late-joiner world edits sync between clients; peers render as
named avatars. `node scripts/mp-probe.mjs <seed>` joins a room headlessly for testing.

The relay is a **light authority**, not a dumb broadcaster (`server/mpServer.ts` +
`src/net/validate.ts`, one rule set shared by client and server). Every `block` edit is
rejected unless it is a well-formed voxel (integers, in-world, known block id), within
8 blocks of the sender's last reported eye position and roughly in the direction they are
looking, and not buried inside any peer's body box. Senders are rate-limited by a token
bucket (30 burst / 12 per second), rooms cap at 8 players, duplicate ids and non-finite
coordinates drop the connection, and every rejected edit is **bounced back** with the
authoritative value so a cheat self-reverts instead of desyncing. Clients run the same
shape/burial/distance gates before applying a remote edit, so a compromised relay cannot
push garbage into chunk arrays either.

`node scripts/mp-security-test.mjs` drives a live relay with an observer, an attacker and
a victim: it asserts the legit edit lands, and that reach cheats (`--teleport-edit`),
burial, malformed frames and a 200-edit flood are all refused.

## Roadmap hooks
Shipped since the evaluation report: food + killable mobs, break/place VFX, hardened relay, procedural
sound, day/night. Remaining weeks are tracked in [PLANNING.md](./PLANNING.md).
- Heavier authority: per-block ownership/lockout, movement sanity (fly/noclip speed), chat filters — the hooks all live behind `mpServer`'s `block`/`state` cases.
- Better mobs: replace `MobAI.tsx` box placeholders with Quaternius CC0 glTF via `useGLTF` — AI loop untouched.
- Night payoff: torches / placed light sources so the dark hours cost something (the ambient floor keeps night playable until then).
- Textures: add PNGs + one `TEXTURE_OVERRIDES` line each.
