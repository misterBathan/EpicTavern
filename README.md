# EpicTavern

Fork of SillyTavern focused on screen-based UX, native RPG tracking, lore tools, and long-term memory.

Based on SillyTavern 1.18.0 (AGPL-3.0). EpicTavern product version starts at **0.0.1** (`package.json`).

## Phase 2 (current)

Exclusive screens via AppNav:

- **Chat** — `#/chat`
- **Characters** — `#/characters` (includes **Replace with JSON** button next to Export)
- **World** — `#/world` (fullscreen lorebooks; **Replace** selected book with JSON)
- **Connect** — `#/connect`
- **Settings** — `#/settings` and `#/settings/{general|ai|formatting|backgrounds|personas|extensions}`

## Run

```bash
npm install
npm start
```

Then open the URL printed in the terminal (usually `http://127.0.0.1:8000`).

## License

AGPL-3.0
