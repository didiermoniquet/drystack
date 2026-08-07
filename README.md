# Drystack

**An original, mobile-friendly falling-block puzzle game.** Stack the falling
tetrominoes, complete horizontal lines to clear them, and survive as long as you
can while the speed ramps up. Plays with a keyboard on desktop and with on-screen
touch controls on phones and tablets — portrait or landscape. No build step, no
dependencies, no backend, no account.

> **Legal note.** Drystack is an independent falling-block puzzle game. It is not
> affiliated with, endorsed by, sponsored by, or derived from Tetris® or any
> other commercial product. "Tetris" is a trademark of its respective owner.
> All code and artwork here are original.

---

## Features

- **Phase piece (signature mechanic):** every few cleared lines you earn a
  charge to summon a *phantom* that passes through the stack and seats **only**
  into a buried, no-longer-reachable hole — turning covered holes from permanent
  damage into a recoverable, skill-based rescue. Configurable, and off by a
  single rule flag.
- Seven classic tetromino shapes (I, O, T, S, Z, J, L) with a **seven-bag**
  randomizer for fair distribution.
- **Super Rotation System** wall kicks (with proper I-piece kicks and a stable O).
- **Hold** slot, **ghost piece**, and a configurable **3–5 piece next queue**.
- **Lock delay** with a capped number of move/rotation resets.
- Time-based gravity that speeds up per level; hard drop, soft drop, and
  press-and-hold movement with configurable **DAS/ARR**.
- Level-scaled scoring, level progression, line and high-score tracking.
- Explicit game states, pause/resume, restart, and a game-over summary.
- **Responsive** desktop / portrait / landscape layouts; the board keeps a fixed
  1:2 aspect ratio and square cells on any screen and pixel density.
- **Accessibility:** semantic buttons, ARIA dialogs, visible focus, high
  contrast, per-piece glyphs (so pieces are distinguishable without color),
  reduced-motion and mute options.
- **Persistence** via `localStorage` (high score + settings) with safe fallbacks.
- **PWA:** installable, offline-capable, works from a GitHub Pages subpath.
- Synthesized sound effects (no audio files) — the game also plays silently.
- **44 unit tests** for the core logic, run with Node's built-in test runner.

## Controls

### Keyboard (desktop)

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| ← / → | Move | ↑ / X | Rotate clockwise |
| ↓ | Soft drop | Z | Rotate counter-clockwise |
| Space | Hard drop | C / Shift | Hold |
| P / Esc | Pause | R | Restart |
| F | Phase piece (summon / cancel) | | |

While a phase piece is active, movement/rotation position the phantom freely
through the stack, and hard drop **seats** it into the highlighted buried pocket.
On touch, use the ✦ button (and drop to seat).

Horizontal movement and soft drop support press-and-hold (delayed auto-shift and
auto-repeat). Gameplay keys don't scroll the page.

### Touch (mobile / tablet)

Large on-screen buttons for move left/right, soft drop, hard drop, rotate CW/CCW,
hold, and pause. Left, right, and soft drop support press-and-hold. Controls
respect device safe-area insets and are laid out for two-thumb use in portrait
and landscape.

## Local development

No install or build is required — it's plain ES modules. Serve the folder over
HTTP (a service worker and manifest won't load from `file://`):

```bash
npm run serve       # python3 -m http.server 8000
# then open http://localhost:8000/
```

Any static server works (`npx serve`, `php -S`, etc.).

> The service worker caches assets. During development, if a change doesn't
> appear, do a hard reload or unregister the worker in DevTools → Application.

## Tests & checks

Tests use the built-in Node test runner (Node 18+; developed on Node 22) — no
dependencies to install.

```bash
npm test            # node --test  — runs the tests/ suites
npm run check       # node --check syntax pass over every source file
```

The suites cover the seven-bag randomizer, collisions, rotation and wall kicks,
board line-clear/collapse, scoring and levels, and full game flow (hard/soft
drop, hold rules, line clears, spawn/game-over, pause, restart, storage
failures).

## Build

There is **no build step**. The `src/` ES modules are served directly. The only
generated artifact is the app icon set:

```bash
npm run icons       # regenerates assets/icons/*.png from a procedural drawing
```

## Deploying to GitHub Pages

The site is fully static and **base-path aware** — every asset uses relative
paths and the service worker resolves URLs relative to its own location, so it
works from `https://<user>.github.io/<repo>/` as well as a custom domain.
`.nojekyll` is included so paths beginning with `_` or nested folders are served
verbatim.

**Enable Pages once (one-time, requires repo admin):**
1. Repo → *Settings* → *Pages* → *Source:* **Deploy from a branch**.
2. Choose the `main` branch and the `/ (root)` folder, then *Save*.
3. Wait ~1 minute and visit the published URL. Every later push to `main`
   redeploys automatically — no build step.

> GitHub only lets a repository **admin** turn Pages on for the first time; it
> can't be enabled by a push or a workflow token on a repo that has never had
> Pages. After that first toggle, deployment is automatic.

Continuous integration (`.github/workflows/ci.yml`) runs the syntax check and
unit tests on every push and pull request; it does not deploy, so publishing and
CI never conflict.

## Project structure

```
index.html                 App shell and markup
manifest.webmanifest       PWA manifest
service-worker.js          Offline cache (network-first HTML, versioned)
styles/main.css            Responsive, accessible styling
src/
  main.js                  Bootstrap + game loop (rAF, delta clamp, visibility)
  game/                    Pure, DOM-free engine (unit-tested)
    rules.js               Central rule configuration + gravity curve
    pieceDefinitions.js    Tetromino shapes, colors, glyphs, SRS kick tables
    Piece.js               Active piece (type, position, rotation)
    Board.js               Locked grid, full-row detection, row collapse
    CollisionSystem.js     Bounds/overlap tests
    RotationSystem.js      Wall-kick rotation (registry-based, swappable)
    PieceGenerator.js      Seven-bag + uniform randomizers (registry-based)
    ScoreSystem.js         Score, lines, level
    Game.js                State machine: gravity, lock delay, hold, clears
  input/
    InputManager.js        Abstract intents + DAS/ARR auto-repeat
    KeyboardInput.js       Key bindings
    TouchInput.js          On-screen button bindings
  rendering/Renderer.js    Canvas view (DPR-aware); reads state, owns none
  ui/UIController.js       Screens, overlays, HUD, settings persistence
  storage/StorageManager.js  Safe localStorage wrapper (memory fallback)
  audio/AudioManager.js    Web Audio SFX (synthesized, optional)
tests/                     node --test suites
scripts/                   icon generator + syntax checker
```

## Architecture overview

The design keeps **gameplay truth independent of the DOM**.

- The `game/` modules are pure logic with no browser dependencies. `Game` owns
  all state and is advanced solely by `tick(deltaMs)`, which makes it
  deterministic and unit-testable (the RNG is injectable).
- `Game` is a small **state machine** (`LOADING`, `READY`, `PLAYING`, `PAUSED`,
  `LINE_CLEARING`, `GAME_OVER`). Input is only acted on when valid for the
  current state, so state checks aren't scattered around the codebase.
- Observers (renderer, UI, audio) subscribe to game **events** (`spawn`, `lock`,
  `lineclear`, `levelup`, `gameover`, …) and read state through accessors. The
  renderer never mutates gameplay and stores no gameplay state.
- The main loop clamps large time gaps (tab switches, phone lock) so gravity
  never lurches, and the game auto-pauses when the tab is hidden.
- Subsystems that are likely to change — the **randomizer** and the **rotation
  system** — are looked up in small registries by name from the rules, so
  alternatives can be registered without touching call sites.

## Rule configuration

All tunable values live in one place: `src/game/rules.js`. Build a rule set from
the defaults with `createRules(overrides)`; nothing is duplicated across files.

```js
import { createRules } from './src/game/rules.js';

const rules = createRules({
  boardWidth: 10,
  boardHeight: 20,
  hiddenRows: 2,
  linesPerLevel: 10,
  enableHold: true,
  enableGhostPiece: true,
  nextQueueSize: 5,
  lockDelayMs: 500,
  maxLockResets: 15,
  softDropPointsPerCell: 1,
  hardDropPointsPerCell: 2,
  randomizer: 'seven-bag',   // or 'uniform', or a registered custom name
  rotationSystem: 'wall-kick',
  // Phase piece
  enablePhasePiece: true,
  linesPerPhaseCharge: 5,    // earn one phantom per N cleared lines
  phaseFillPointsPerCell: 20,
});
```

Input timing (`dasMs`, `arrMs`, `softDropIntervalMs`), lock-reset behavior, and
the line-clear animation length are configurable here too.

## Future extension points

The engine was built so later rule changes don't require a rewrite:

- **New pieces / shapes:** add an entry to `pieceDefinitions.js` (any bounding
  box; the renderer and collision system are shape-agnostic). Cells-per-piece is
  not assumed to be four anywhere in the core.
- **Alternative randomizers / rotation systems:** implement the small interface
  and `registerRandomizer` / `registerRotationSystem`, then select it by name in
  the rules.
- **Different board sizes,** hidden-row counts, scoring, and timings: rule
  overrides only.
- **Richer scoring** (combos, back-to-back, T-spins, multipliers): `ScoreSystem`
  already accepts an options object per clear.
- **Obstacles, bombs, frozen/destructible cells, gravity variants, abilities,
  missions, modes:** the board is a plain grid, the loop is time-based, and
  observers react to events — new mechanics hook in without rewriting the engine.

## Known limitations

- No music track ships (sound effects are synthesized); the music slot is left
  as a clean extension rather than a stub.
- Gesture controls are intentionally not enabled — visible touch buttons are the
  primary, always-available method.
- Control remapping and DAS/ARR tuning are configurable in code but not yet
  surfaced in the settings UI.
- A single global rule set is used; per-mode rule presets are an extension point,
  not a shipped feature.

## License

MIT — see [LICENSE](./LICENSE).
