// Application entry point.
//
// Constructs the engine and browser layers, wires them together, and runs the
// single requestAnimationFrame loop. The loop clamps large time gaps (tab
// switches, phone lock/unlock) so gravity never lurches, and gameplay is
// auto-paused whenever the document becomes hidden.

import { createRules } from './game/rules.js';
import { Game, State } from './game/Game.js';
import { Renderer } from './rendering/Renderer.js';
import { InputManager } from './input/InputManager.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { TouchInput } from './input/TouchInput.js';
import { StorageManager } from './storage/StorageManager.js';
import { AudioManager } from './audio/AudioManager.js';
import { UIController } from './ui/UIController.js';

const MAX_FRAME_MS = 100; // clamp to avoid gravity lurches after inactivity

function boot() {
  const rules = createRules();

  const storage = new StorageManager();
  const audio = new AudioManager();
  const game = new Game(rules);

  const prefersReduced =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new Renderer(
    document.getElementById('board-canvas'),
    rules,
    { reducedMotion: prefersReduced }
  );

  const input = new InputManager(game, rules, { audio });

  const ui = new UIController({ game, renderer, input, audio, storage, rules });

  // Keyboard: pause and restart are routed through the UI so state rules apply.
  const keyboard = new KeyboardInput(input, {
    isPlaying: () => game.state === State.PLAYING,
    onPauseToggle: () => ui.togglePause(),
    onRestart: () => ui.requestRestart(),
  });
  keyboard.attach();

  // Touch controls.
  const touch = new TouchInput(
    input,
    {
      left: document.getElementById('tb-left'),
      right: document.getElementById('tb-right'),
      softDrop: document.getElementById('tb-soft'),
      up: document.getElementById('tb-up'),
      hardDrop: document.getElementById('tb-hard'),
      rotateCW: document.getElementById('tb-rotcw'),
      rotateCCW: document.getElementById('tb-rotccw'),
      hold: document.getElementById('tb-hold'),
      phase: document.getElementById('tb-phase'),
      pause: document.getElementById('tb-pause'),
    },
    { onPauseToggle: () => ui.togglePause() }
  );
  touch.attach();

  // Keep canvases crisp and correctly sized across resize / rotation without
  // restarting the game.
  let resizeQueued = false;
  const onResize = () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      renderer.resize();
      ui.refreshPreviews();
    });
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // Auto-pause when hidden; also resets the input so no key is left "held".
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ui.pauseForHidden();
  });
  window.addEventListener('blur', () => input.reset());

  // Main loop.
  let last = performance.now();
  function frame(now) {
    let dt = now - last;
    last = now;
    if (dt > MAX_FRAME_MS) dt = MAX_FRAME_MS;
    if (dt < 0) dt = 0;

    if (game.state === State.PLAYING || game.state === State.PHASING) {
      input.update(dt);
    }
    game.tick(dt);
    renderer.render(game);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  ui.showMenu();

  // Optional debugging handle (open with #debug). Lets the engine be inspected
  // and driven from the console for tuning; absent in normal play.
  if (/(?:[?#&])debug\b/.test(window.location.href)) {
    window.drystack = { game, rules, renderer, ui, input, State };
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
