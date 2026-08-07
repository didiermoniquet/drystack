// UI controller: screens, overlays, HUD, and settings.
//
// This is the only module that reads and writes the DOM for presentation. It
// observes the Game through events and reflects state into markup; it never
// stores gameplay truth. Settings and the high score are persisted through the
// StorageManager and applied to the rules/renderer/audio.

import { State } from '../game/Game.js';

const KEYS = {
  highScore: 'highScore',
  ghost: 'ghost',
  reducedMotion: 'reducedMotion',
  sound: 'sound',
  volume: 'volume',
};

const $ = (id) => document.getElementById(id);

export class UIController {
  constructor({ game, renderer, input, audio, storage, rules }) {
    this.game = game;
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.storage = storage;
    this.rules = rules;

    this.highScore = this.#loadHighScore();
    this.lastFocus = null;

    this.el = {
      menu: $('screen-menu'),
      game: $('screen-game'),
      overlays: {
        pause: $('overlay-pause'),
        gameover: $('overlay-gameover'),
        settings: $('overlay-settings'),
        controls: $('overlay-controls'),
      },
      hud: {
        score: $('hud-score'),
        high: $('hud-high'),
        level: $('hud-level'),
        lines: $('hud-lines'),
        phase: $('hud-phase'),
      },
      phaseBtn: $('tb-phase'),
      phaseHint: $('phase-hint'),
      phaseStat: document.querySelector('.stat-phase'),
      phaseMeter: $('phase-meter'),
      phaseFill: $('phase-meter-fill'),
      menuHigh: $('menu-high'),
      hold: $('hold-canvas'),
      nextList: $('next-list'),
      go: {
        score: $('go-score'),
        high: $('go-high'),
        lines: $('go-lines'),
        level: $('go-level'),
        newHigh: $('go-newhigh'),
      },
      settings: {
        ghost: $('set-ghost'),
        reduced: $('set-reduced'),
        sound: $('set-sound'),
        volume: $('set-volume'),
      },
    };

    this.nextCanvases = Array.from(
      this.el.nextList ? this.el.nextList.querySelectorAll('canvas') : []
    );

    this.#applySettings();
    this.#wireGame();
    this.#wireButtons();
    this.#refreshHighDisplays();
  }

  // --- settings ------------------------------------------------------------

  #loadHighScore() {
    const v = this.storage.get(KEYS.highScore, 0);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }

  #applySettings() {
    const ghost = this.storage.get(KEYS.ghost, true);
    const reduced = this.storage.get(KEYS.reducedMotion, false);
    const sound = this.storage.get(KEYS.sound, true);
    const volume = this.storage.get(KEYS.volume, 0.7);

    this.rules.enableGhostPiece = ghost !== false;
    this.renderer.setReducedMotion(reduced === true);
    document.body.classList.toggle('reduced-motion', reduced === true);
    this.audio.setEnabled(sound !== false);
    this.audio.setVolume(typeof volume === 'number' ? volume : 0.7);

    const s = this.el.settings;
    if (s.ghost) s.ghost.checked = this.rules.enableGhostPiece;
    if (s.reduced) s.reduced.checked = reduced === true;
    if (s.sound) s.sound.checked = sound !== false;
    if (s.volume) s.volume.value = String(this.audio.volume);
  }

  #wireSettings() {
    const s = this.el.settings;
    s.ghost?.addEventListener('change', () => {
      this.rules.enableGhostPiece = s.ghost.checked;
      this.storage.set(KEYS.ghost, s.ghost.checked);
    });
    s.reduced?.addEventListener('change', () => {
      this.renderer.setReducedMotion(s.reduced.checked);
      document.body.classList.toggle('reduced-motion', s.reduced.checked);
      this.storage.set(KEYS.reducedMotion, s.reduced.checked);
    });
    s.sound?.addEventListener('change', () => {
      this.audio.setEnabled(s.sound.checked);
      this.storage.set(KEYS.sound, s.sound.checked);
    });
    s.volume?.addEventListener('input', () => {
      const v = Number(s.volume.value);
      this.audio.setVolume(v);
      this.storage.set(KEYS.volume, v);
    });
  }

  // --- game events ---------------------------------------------------------

  #wireGame() {
    const g = this.game;
    g.on('start', () => this.#onStart());
    g.on('spawn', () => this.#refreshPieces());
    g.on('hold', () => this.#refreshPieces());
    g.on('lock', () => this.audio.play('lock'));
    g.on('lineclearstart', ({ count }) =>
      this.audio.play(count >= 4 ? 'quad' : 'lineclear')
    );
    g.on('lineclear', () => {
      this.#updateHud();
      this.#updatePhase();
    });
    g.on('levelup', () => this.audio.play('levelup'));
    g.on('gameover', (data) => this.#onGameOver(data));

    g.on('phasecharge', () => this.#updatePhase());
    g.on('phasestart', () => {
      document.body.classList.add('phasing');
      if (this.el.phaseHint) this.el.phaseHint.hidden = false;
      this.#updatePhase();
      this.#reflow(); // hint + up-button change the layout; refit the board
    });
    g.on('phaseend', () => {
      document.body.classList.remove('phasing');
      if (this.el.phaseHint) this.el.phaseHint.hidden = true;
      this.#updatePhase();
      this.#refreshPieces();
      this.#reflow();
    });
    g.on('phasefill', () => this.audio.play('lineclear'));
    g.on('phasedenied', () => this.audio.play('deny'));
  }

  #updatePhase() {
    if (!this.rules.enablePhasePiece) {
      if (this.el.phaseBtn) this.el.phaseBtn.hidden = true;
      if (this.el.phaseStat) this.el.phaseStat.hidden = true;
      return;
    }
    const charges = this.game.phaseCharges;
    if (this.el.hud.phase) this.el.hud.phase.textContent = String(charges);

    // Meter: progress in lines toward the next phase charge.
    const per = Math.max(1, this.rules.linesPerPhaseCharge);
    const progress = Math.round(((this.game.score.lines % per) / per) * 100);
    if (this.el.phaseFill) this.el.phaseFill.style.width = progress + '%';
    if (this.el.phaseMeter)
      this.el.phaseMeter.setAttribute('aria-valuenow', String(progress));
    if (this.el.phaseStat) this.el.phaseStat.classList.toggle('ready', charges > 0);

    const btn = this.el.phaseBtn;
    if (btn) {
      const phasing = this.game.state === State.PHASING;
      btn.disabled = charges <= 0 && !phasing;
      btn.classList.toggle('is-armed', charges > 0 || phasing);
    }
  }

  #onStart() {
    this.#updateHud();
    this.#refreshPieces();
    this.#updatePhase();
  }

  #onGameOver(data) {
    const isHigh = data.score > this.highScore;
    if (isHigh) {
      this.highScore = data.score;
      this.storage.set(KEYS.highScore, this.highScore);
      this.#refreshHighDisplays();
    }
    this.audio.play('gameover');
    const go = this.el.go;
    if (go.score) go.score.textContent = data.score.toLocaleString();
    if (go.high) go.high.textContent = this.highScore.toLocaleString();
    if (go.lines) go.lines.textContent = String(data.lines);
    if (go.level) go.level.textContent = String(data.level);
    if (go.newHigh) go.newHigh.hidden = !isHigh;
    this.#openOverlay('gameover');
  }

  #updateHud() {
    const hud = this.el.hud;
    const s = this.game.score;
    const live = Math.max(this.highScore, s.score);
    if (hud.score) hud.score.textContent = s.score.toLocaleString();
    if (hud.high) hud.high.textContent = live.toLocaleString();
    if (hud.level) hud.level.textContent = String(s.level);
    if (hud.lines) hud.lines.textContent = String(s.lines);
  }

  #refreshPieces() {
    this.#updateHud();
    this.renderer.renderHold(this.el.hold, this.game.heldPiece);
    this.renderer.renderNext(this.nextCanvases, this.game.getPreview());
  }

  #refreshHighDisplays() {
    if (this.el.menuHigh)
      this.el.menuHigh.textContent = this.highScore.toLocaleString();
    if (this.el.hud.high)
      this.el.hud.high.textContent = this.highScore.toLocaleString();
  }

  /** Re-render mini canvases after a layout change. */
  refreshPreviews() {
    this.#refreshPieces();
  }

  // Refit the board canvas after a layout change (e.g. the phase hint/up button
  // appearing or disappearing changes the available height).
  #reflow() {
    requestAnimationFrame(() => this.renderer.resize());
  }

  // --- screens & overlays --------------------------------------------------

  showMenu() {
    this.#closeAllOverlays();
    this.input.reset();
    this.el.game.hidden = true;
    this.el.menu.hidden = false;
    this.#refreshHighDisplays();
    $('btn-play')?.focus();
  }

  startGame() {
    this.audio.resume();
    this.el.menu.hidden = true;
    this.el.game.hidden = false;
    this.#closeAllOverlays();
    this.input.reset();
    // Let layout settle before sizing canvases.
    requestAnimationFrame(() => {
      this.renderer.resize();
      this.game.start();
    });
  }

  playAgain() {
    this.#closeAllOverlays();
    this.input.reset();
    this.audio.resume();
    this.game.start();
  }

  togglePause() {
    if (this.game.state === State.PLAYING ||
        this.game.state === State.LINE_CLEARING) {
      this.game.pause();
      this.input.reset();
      this.audio.play('pause');
      this.#openOverlay('pause');
    } else if (this.game.state === State.PAUSED) {
      this.#closeOverlay('pause');
      this.game.resume();
    }
  }

  /** Auto-pause when the tab/app is hidden. */
  pauseForHidden() {
    if (this.game.state === State.PLAYING ||
        this.game.state === State.LINE_CLEARING) {
      this.game.pause();
      this.input.reset();
      this.#openOverlay('pause');
    }
  }

  requestRestart() {
    const active = this.game.state === State.PLAYING ||
      this.game.state === State.PAUSED ||
      this.game.state === State.LINE_CLEARING;
    if (active && !window.confirm('Restart the current game?')) return;
    this.#closeAllOverlays();
    this.input.reset();
    this.game.restart();
  }

  #openOverlay(name) {
    const el = this.el.overlays[name];
    if (!el) return;
    this.lastFocus = document.activeElement;
    el.hidden = false;
    const focusable = el.querySelector(
      'button, [href], input, select, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  }

  #closeOverlay(name) {
    const el = this.el.overlays[name];
    if (el) el.hidden = true;
    if (this.lastFocus && document.contains(this.lastFocus)) {
      this.lastFocus.focus();
      this.lastFocus = null;
    }
  }

  #closeAllOverlays() {
    for (const el of Object.values(this.el.overlays)) if (el) el.hidden = true;
  }

  // --- buttons -------------------------------------------------------------

  #wireButtons() {
    $('btn-play')?.addEventListener('click', () => this.startGame());
    $('btn-controls')?.addEventListener('click', () => this.#openOverlay('controls'));
    $('btn-settings')?.addEventListener('click', () => this.#openOverlay('settings'));

    $('btn-resume')?.addEventListener('click', () => this.togglePause());
    $('btn-restart')?.addEventListener('click', () => this.requestRestart());
    $('btn-pause-settings')?.addEventListener('click', () => this.#openOverlay('settings'));
    $('btn-menu')?.addEventListener('click', () => this.#confirmToMenu());

    $('btn-again')?.addEventListener('click', () => this.playAgain());
    $('btn-menu-2')?.addEventListener('click', () => this.showMenu());

    $('btn-settings-close')?.addEventListener('click', () => this.#closeOverlay('settings'));
    $('btn-controls-close')?.addEventListener('click', () => this.#closeOverlay('controls'));

    // Escape closes the settings/controls overlays.
    for (const name of ['settings', 'controls']) {
      this.el.overlays[name]?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          this.#closeOverlay(name);
        }
      });
    }

    this.#wireSettings();
  }

  #confirmToMenu() {
    if (!window.confirm('Return to the main menu? The current game will end.')) return;
    this.showMenu();
  }
}
