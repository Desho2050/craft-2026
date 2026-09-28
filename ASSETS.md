# ASSETS — free & open-source pipeline for MedoCraft 2026

Everything shipped in this repo is **CC0 (public domain, no attribution required)**.
Licenses were verified on the source pages on 2026-09-28.

## What's already wired in

| Game asset | File | Source | License |
|---|---|---|---|
| Grass top/side, dirt, stone, cobblestone, sand, bedrock, leaves | `public/textures/*.png` | OpenGameArt — [“16*16 Block Textures”](https://opengameart.org/content/1616-block-textures) (`blocks_0.zip`) | CC0 |
| Planks, water | `public/textures/{planks,water}.png` | Kenney — [Retro Textures Fantasy](https://kenney.nl/assets/retro-textures-fantasy) | CC0 |
| Log, glass, snow, cactus, sandstone, grass-side variants | *procedural* (`src/utils/textures.ts`) | generated 16×16 canvas art, deterministic | — (yours) |
| Arabic UI fonts (Cairo, Noto Kufi Arabic, Rubik) | Google Fonts `@import` in `src/index.css` | fonts.google.com — all OFL | OFL |
| Sky | drei `<Sky>` (Preetham atmosphere shader) | three.js ecosystem | MIT |

To swap any block for real art: drop a PNG into `public/textures/` and add a
line to `TEXTURE_OVERRIDES` in `src/utils/textures.ts` — that's the whole pipeline.

## Where to get more (deep-search results, all curl-able)

### Textures
- **Kenney Retro Textures Fantasy** (CC0, 117 tiles incl. timber walls, brick, doors):
  `curl -L -o kenney.zip https://kenney.nl/media/pages/assets/retro-textures-fantasy/db459aee90-1774770433/kenney_retro-textures-fantasy.zip`
- **OpenGameArt block pack** used above: `curl -L -o blocks.zip https://opengameart.org/sites/default/files/blocks_0.zip`
- ⚠️ Kenney's old “Retro Textures Basic/Saturated” pages now 404 — don't use stale links.
- ⚠️ **Avoid**: SimplePath (proprietary), Mojang default textures (Minecraft EULA),
  BlockTop/Mixcraft on PlanetMinecraft (redistribution restricted by default terms).

### Sounds (CC0, direct zips verified)
- Block break/place impacts — Kenney [Impact Sounds](https://kenney.nl/assets/impact-sounds):
  `https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip`
- Footsteps/UI — Kenney [RPG Audio](https://kenney.nl/assets/rpg-audio) / [Digital Audio](https://kenney.nl/assets/digital-audio)
  (URL pattern: `https://kenney.nl/media/pages/assets/<slug>/<hash>/<file>.zip` — grab hash from the page HTML).
- Freesound needs login for downloads; filter `license=Creative Commons 0`.

### 3D mob models (CC0)
- Quaternius [Animated Monster Pack](https://quaternius.com/packs/animatedmonster.html) — download is a Google Drive
  folder (use `gdown --folder`, not curl). CC0 mirror list on
  [OpenGameArt](https://opengameart.org/content/all-cc0-uploader-quaternius) with direct `sites/default/files/` URLs.
- Kenney [Mini Forest](https://kenney.nl/assets/mini-forest) / [Tiny Farm](https://kenney.nl/assets/tiny-farm) — voxel-friendly glTF, same zip pattern.
- Load via `useGLTF` from drei; the box-mob placeholders in `src/components/MobAI.tsx` are drop-in replaceable.

### Sky / environment
- Poly Haven CC0 HDRIs: `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/<name>_1k.hdr`
  (e.g. `kloofendal_48d_partly_cloudy_puresky`). Currently unnecessary — `<Sky>` + fog already covers day cycle; add `<Environment>` if you want HDR reflections.

## Attribution text (only needed if you add CC-BY assets later)
CC0 requires nothing. If you later add CC-BY items, credit them in an in-game
“Credits” menu — the i18n system in `src/utils/i18n.ts` makes that a one-line key.
