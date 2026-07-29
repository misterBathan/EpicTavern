# EpicTavern

Fork of SillyTavern focused on screen-based UX, native RPG tracking, lore tools, and long-term memory.

Based on SillyTavern 1.18.0 (AGPL-3.0). EpicTavern product version: **0.0.1**.

## Phase 3 (current)

Exclusive screens via AppNav:

- **Chat** — `#/chat` (compact RPG HUD strip when RPG is enabled)
- **Characters** — `#/characters`
- **World** — `#/world`
- **Journal** — `#/journal` (full RPG Companion panels: stats, scene, inventory, quests, thoughts)
- **Connect** — `#/connect`
- **Settings** — `#/settings/...` (RPG toggles also under Settings → Extensions)

RPG tracker lives under `public/scripts/rpg/` (from SpicyMarinara’s RPG Companion, AGPL-3.0).

## Run

```bash
npm install
npm start
```

Open the URL printed in the terminal (usually `http://127.0.0.1:8000`). Hard-refresh after pulls (Ctrl+F5).

## License

AGPL-3.0
