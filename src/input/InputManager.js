// Abstract input model shared by keyboard and touch.
//
// Callers speak in intents (press left, release soft-drop, tap rotate) and the
// manager translates them into Game calls. Held horizontal movement and soft
// drop are driven by configurable Delayed Auto-Shift (DAS) and Auto-Repeat Rate
// (ARR) timers advanced from the game loop via `update(dt)`, rather than relying
// on the browser's native key repeat.

export class InputManager {
  constructor(game, rules, { audio = null } = {}) {
    this.game = game;
    this.rules = rules;
    this.audio = audio;

    this.horizStack = []; // held directions, most-recent last
    this.dir = 0; // active horizontal direction: -1, 0, 1
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.dasCharged = false;

    this.soft = false;
    this.softTimer = 0;
  }

  /** Clear all held state (call on pause, blur, or state changes). */
  reset() {
    this.horizStack.length = 0;
    this.dir = 0;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.dasCharged = false;
    this.soft = false;
    this.softTimer = 0;
  }

  #move(dir) {
    const moved = dir < 0 ? this.game.moveLeft() : this.game.moveRight();
    if (moved) this.audio?.play('move');
  }

  #activate(dir) {
    this.dir = dir;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.dasCharged = false;
    this.#move(dir);
  }

  pressLeft() {
    this.horizStack = this.horizStack.filter((d) => d !== -1);
    this.horizStack.push(-1);
    this.#activate(-1);
  }

  pressRight() {
    this.horizStack = this.horizStack.filter((d) => d !== 1);
    this.horizStack.push(1);
    this.#activate(1);
  }

  releaseLeft() {
    this.#releaseDir(-1);
  }

  releaseRight() {
    this.#releaseDir(1);
  }

  #releaseDir(dir) {
    this.horizStack = this.horizStack.filter((d) => d !== dir);
    const top = this.horizStack[this.horizStack.length - 1] ?? 0;
    if (top === 0) this.dir = 0;
    else if (top !== this.dir) this.#activate(top);
  }

  pressSoft() {
    this.soft = true;
    this.softTimer = 0;
    if (this.game.softDrop()) this.audio?.play('softdrop');
  }

  releaseSoft() {
    this.soft = false;
  }

  /** One-shot actions. */
  tap(action) {
    switch (action) {
      case 'hardDrop':
        this.game.hardDrop();
        this.audio?.play('harddrop');
        break;
      case 'rotateCW':
        if (this.game.rotateCW()) this.audio?.play('rotate');
        break;
      case 'rotateCCW':
        if (this.game.rotateCCW()) this.audio?.play('rotate');
        break;
      case 'hold':
        if (this.game.hold()) this.audio?.play('hold');
        break;
      case 'phase':
        if (this.game.togglePhase()) this.audio?.play('hold');
        break;
      default:
        break;
    }
  }

  /** Advance auto-repeat timers. Call once per frame. */
  update(dt) {
    if (this.dir !== 0) {
      if (!this.dasCharged) {
        this.dasTimer += dt;
        if (this.dasTimer >= this.rules.dasMs) {
          this.dasCharged = true;
          this.arrTimer = 0;
          this.#move(this.dir);
        }
      } else {
        this.arrTimer += dt;
        let guard = 0;
        while (this.arrTimer >= this.rules.arrMs && guard < this.rules.boardWidth) {
          this.arrTimer -= this.rules.arrMs;
          this.#move(this.dir);
          guard++;
        }
      }
    }

    if (this.soft) {
      this.softTimer += dt;
      let guard = 0;
      while (
        this.softTimer >= this.rules.softDropIntervalMs &&
        guard < this.rules.boardHeight
      ) {
        this.softTimer -= this.rules.softDropIntervalMs;
        if (!this.game.softDrop()) break;
        this.audio?.play('softdrop');
        guard++;
      }
    }
  }
}
