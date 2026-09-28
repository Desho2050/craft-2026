# Roadmap

Execution order for the 7.2/10 evaluation report. One "week" = a bundle of workstreams that is
implemented **and** verified in the same pass (`npm run build`, `npm run lint`, `npm run test:engine`,
plus a live browser/relay probe for anything the headless tests cannot reach).

## Week 1 — survival loop, VFX, relay safety · done
- Food: apples from leaves, rotten flesh from kills, `R` eats the held food, hunger/health rules.
- Mobs: 10 HP, 5 damage per sword hit, health bar when wounded, population follows the player
  (prune beyond 96 blocks, refill to 6 on a 20 s maintain tick).
- Break/place feel: textured debris bursts through `particleHooks`, pooled InstancedMesh per block type.
- Relay: light authority — shape/reach+view/burial/token-bucket/room-cap gates with authoritative
  bounce-back, mirrored client-side. `node scripts/mp-security-test.mjs` proves 9/9.

## Week 2 — sound and daylight · done
- `src/utils/audio.ts`: nine synthesised voices, lazy `AudioContext`, 45 ms per-voice throttle,
  mute persisted with settings, 🔊 toggles in the main menu and pause overlay.
- `src/utils/dayCycle.ts` + `src/components/DayNight.tsx`: 10-minute sun arc driving the sky-dome
  uniforms, sun/ambient/hemisphere lights, fog and a camera-locked star shell; mutable `runtime.time`
  with only a coarse `dayPhase` in reactive state; HUD clock chip; the clock saves with the world.
- Verified: 62/62 engine assertions, `audioDebug()` reports `state: running` with real plays after a
  trusted gesture, and night vs noon screenshots differ. Zero downloaded assets.

## Week 3 — heavier server authority
- Per-block ownership / short lockout window so two peers cannot fight over one voxel.
- Movement sanity on `state`: speed ceiling, fly detection outside creative, teleport snap-back.
- Chat: length/rate filter + profanity hook, and a server-side join token per room.
- Verify: extend `scripts/mp-security-test.mjs` with a double-edit race, a fly/speed spoof and a chat
  flood; each must be refused or corrected by the relay.

## Week 4 — mob models and animation
- Replace the `MobAI.tsx` box placeholders with Quaternius CC0 glTF via `useGLTF`; keep the AI loop,
  swap only the renderer. Walk/attack clips driven by the existing state machine, LOD + clone pooling
  so six mobs stay cheap.
- Verify: frame-time budget (no drop below the current 60 fps target on mid hardware) and hitboxes
  still matching the store's `attack()` reach math.

## Week 5 — night needs a reason
- Placeable light sources (torch = stick + coal) with a cheap per-chunk light field, mob spawn rate
  rising after dusk, and a save-safe light cache.
- Verify: light-level assertions in `scripts/smoke.ts` plus a night screenshot showing a lit radius.

## Backlog
- Real CC0 texture packs swapped through `TEXTURE_OVERRIDES` (one line each, see ASSETS.md).
- Achievement/goal overlay, controller support, mobile touch controls.
