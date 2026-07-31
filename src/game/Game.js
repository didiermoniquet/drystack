// Game controller and state machine.
//
// This is the source of gameplay truth. It owns the board, the active piece,
// the queue, hold, scoring, gravity, and lock delay. It is pure logic: it never
// touches the DOM and is advanced purely by `tick(deltaMs)`, which makes it
// deterministic and unit-testable. Rendering, input, and audio observe it
// through events and read-only accessors.

import { Board } from './Board.js';
import { Piece } from './Piece.js';
import { PIECES, TYPES } from './pieceDefinitions.js';
import { createRandomizer } from './PieceGenerator.js';
import { ScoreSystem } from './ScoreSystem.js';
import { getRotationSystem } from './RotationSystem.js';
import { cellsFit, pieceFits } from './CollisionSystem.js';
import { gravityIntervalMs } from './rules.js';

export const State = {
  LOADING: 'LOADING',
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  LINE_CLEARING: 'LINE_CLEARING',
  GAME_OVER: 'GAME_OVER',
};

// Minimal event emitter so observers can react without the Game knowing them.
class Emitter {
  constructor() {
    this._handlers = Object.create(null);
  }
  on(event, handler) {
    (this._handlers[event] ||= []).push(handler);
    return this;
  }
  emit(event, payload) {
    const list = this._handlers[event];
    if (list) for (let i = 0; i < list.length; i++) list[i](payload);
  }
}

export class Game extends Emitter {
  constructor(rules, { rng = Math.random } = {}) {
    super();
    this.rules = rules;
    this.rng = rng;
    this.rotate = getRotationSystem(rules.rotationSystem);
    this.board = new Board(
      rules.boardWidth,
      rules.boardHeight + rules.hiddenRows,
      rules.hiddenRows
    );
    this.score = new ScoreSystem(rules);
    this.state = State.READY;
    this.#init();
  }

  // --- lifecycle -----------------------------------------------------------

  #init() {
    this.board.reset();
    this.score.reset();
    this.generator = createRandomizer(this.rules.randomizer, TYPES, this.rng);
    this.queue = [];
    this.#fillQueue();
    this.active = null;
    this.heldPiece = null;
    this.holdUsed = false;
    this.gravityAcc = 0;
    this.lockActive = false;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.clearing = null; // { rows, timer, count } while animating a clear
    this._ghostCells = null;
    this._ghostDirty = true;
    this._prevState = null;
    this.state = State.READY;
  }

  /** Begin a fresh game and spawn the first piece. */
  start() {
    this.#init();
    this.state = State.PLAYING;
    this.#spawn();
    this.emit('start');
  }

  /** Reset everything and immediately start again. */
  restart() {
    this.start();
    this.emit('restart');
  }

  #fillQueue() {
    while (this.queue.length < this.rules.nextQueueSize + 1) {
      this.queue.push(this.generator.next());
    }
  }

  /**
   * Spawn a piece near the top-center. When `type` is given (hold swaps) the
   * queue is not consumed. Triggers game over if the spawn position is blocked.
   */
  #spawn(type = null) {
    const t = type ?? this.queue.shift();
    this.#fillQueue();

    const box = PIECES[t].box;
    const x = Math.floor((this.rules.boardWidth - box) / 2);
    const piece = new Piece(t, x, 0, 0);

    this.active = piece;
    this.holdUsed = false;
    this.gravityAcc = 0;
    this.lockActive = false;
    this.lockTimer = 0;
    this.lockResets = 0;
    this._ghostDirty = true;

    if (!pieceFits(this.board, piece)) {
      this.#gameOver();
      return false;
    }
    this.emit('spawn', piece);
    return true;
  }

  #gameOver() {
    this.state = State.GAME_OVER;
    this.emit('gameover', {
      score: this.score.score,
      lines: this.score.lines,
      level: this.score.level,
    });
  }

  // --- per-frame update ----------------------------------------------------

  /** Advance the simulation by `dt` milliseconds. */
  tick(dt) {
    if (this.state === State.PLAYING) {
      this.#applyGravity(dt);
      this.#applyLockDelay(dt);
    } else if (this.state === State.LINE_CLEARING) {
      this.clearing.timer -= dt;
      if (this.clearing.timer <= 0) this.#finishClear();
    }
  }

  #grounded() {
    const cells = this.active.cells(
      this.active.rotation,
      this.active.x,
      this.active.y + 1
    );
    return !cellsFit(this.board, cells);
  }

  #applyGravity(dt) {
    if (this.#grounded()) return; // resting: lock delay takes over
    this.gravityAcc += dt;
    const interval = gravityIntervalMs(this.score.level);
    let guard = 0;
    while (
      this.gravityAcc >= interval &&
      !this.#grounded() &&
      guard < this.board.totalRows
    ) {
      this.gravityAcc -= interval;
      this.#move(0, 1);
      guard++;
    }
  }

  #applyLockDelay(dt) {
    if (this.#grounded()) {
      if (!this.lockActive) {
        this.lockActive = true;
        this.lockTimer = 0;
      }
      this.lockTimer += dt;
      if (this.lockTimer >= this.rules.lockDelayMs) this.#lock();
    } else {
      this.lockActive = false;
      this.lockTimer = 0;
    }
  }

  // --- piece manipulation --------------------------------------------------

  #move(dx, dy) {
    const cells = this.active.cells(
      this.active.rotation,
      this.active.x + dx,
      this.active.y + dy
    );
    if (!cellsFit(this.board, cells)) return false;
    this.active.x += dx;
    this.active.y += dy;
    this._ghostDirty = true;
    return true;
  }

  // A successful move/rotation while grounded resets the lock timer, up to a
  // capped number of resets so a piece cannot be stalled forever.
  #registerLockReset(kind) {
    if (!this.lockActive || !this.#grounded()) return;
    const allowed =
      (kind === 'move' && this.rules.lockResetOnMove) ||
      (kind === 'rotate' && this.rules.lockResetOnRotate);
    if (allowed && this.lockResets < this.rules.maxLockResets) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  moveLeft() {
    if (this.state !== State.PLAYING) return false;
    if (this.#move(-1, 0)) {
      this.#registerLockReset('move');
      this.emit('move', -1);
      return true;
    }
    return false;
  }

  moveRight() {
    if (this.state !== State.PLAYING) return false;
    if (this.#move(1, 0)) {
      this.#registerLockReset('move');
      this.emit('move', 1);
      return true;
    }
    return false;
  }

  softDrop() {
    if (this.state !== State.PLAYING) return false;
    if (this.#move(0, 1)) {
      this.score.softDrop(1);
      this.gravityAcc = 0;
      this.emit('softdrop');
      return true;
    }
    return false;
  }

  hardDrop() {
    if (this.state !== State.PLAYING) return false;
    let distance = 0;
    while (this.#move(0, 1)) distance++;
    if (distance > 0) this.score.hardDrop(distance);
    this.emit('harddrop', distance);
    this.#lock();
    return true;
  }

  rotateCW() {
    return this.#rotate(1);
  }

  rotateCCW() {
    return this.#rotate(-1);
  }

  #rotate(direction) {
    if (this.state !== State.PLAYING) return false;
    const rotated = this.rotate(this.board, this.active, direction);
    if (!rotated) return false;
    this.active = rotated;
    this._ghostDirty = true;
    this.#registerLockReset('rotate');
    this.emit('rotate', direction);
    return true;
  }

  /** Swap the active piece with the hold slot (once per piece). */
  hold() {
    if (!this.rules.enableHold) return false;
    if (this.state !== State.PLAYING) return false;
    if (this.holdUsed) return false;

    const current = this.active.type;
    if (this.heldPiece === null) {
      this.heldPiece = current;
      this.#spawn();
    } else {
      const swap = this.heldPiece;
      this.heldPiece = current;
      this.#spawn(swap);
    }
    // #spawn cleared holdUsed; a hold is only allowed once per active piece.
    this.holdUsed = true;
    this.emit('hold', this.heldPiece);
    return true;
  }

  // --- locking and clearing ------------------------------------------------

  #lock() {
    const type = this.active.type;
    const cells = this.active.cells();
    for (let i = 0; i < cells.length; i++) {
      const x = cells[i][0];
      const y = cells[i][1];
      if (this.board.inBounds(x, y)) this.board.set(x, y, type);
    }
    this.emit('lock', this.active);
    this.active = null;
    this.lockActive = false;
    this.lockTimer = 0;

    const rows = this.board.getFullRows();
    if (rows.length > 0) {
      this.state = State.LINE_CLEARING;
      this.clearing = {
        rows,
        count: rows.length,
        timer: this.rules.lineClearAnimationMs,
      };
      this.emit('lineclearstart', { rows, count: rows.length });
      if (this.rules.lineClearAnimationMs <= 0) this.#finishClear();
    } else {
      this.#spawn();
    }
  }

  #finishClear() {
    const { rows, count } = this.clearing;
    const prevLevel = this.score.level;
    this.board.clearRows(rows);
    const gained = this.score.clearLines(count);
    this.clearing = null;
    this.emit('lineclear', { rows, count, gained });
    if (this.score.level > prevLevel) this.emit('levelup', this.score.level);
    this.state = State.PLAYING;
    this.#spawn();
  }

  // --- pause / resume ------------------------------------------------------

  pause() {
    if (this.state === State.PLAYING || this.state === State.LINE_CLEARING) {
      this._prevState = this.state;
      this.state = State.PAUSED;
      this.emit('pause');
    }
  }

  resume() {
    if (this.state === State.PAUSED) {
      this.state = this._prevState || State.PLAYING;
      this._prevState = null;
      this.emit('resume');
    }
  }

  // --- read-only views for renderer/UI ------------------------------------

  /** Cells of the hard-drop landing position, or null when disabled. */
  getGhostCells() {
    if (!this.rules.enableGhostPiece || !this.active) return null;
    if (!this._ghostDirty && this._ghostCells) return this._ghostCells;
    let dy = 0;
    while (
      cellsFit(
        this.board,
        this.active.cells(this.active.rotation, this.active.x, this.active.y + dy + 1)
      )
    ) {
      dy++;
    }
    this._ghostCells = this.active.cells(
      this.active.rotation,
      this.active.x,
      this.active.y + dy
    );
    this._ghostDirty = false;
    return this._ghostCells;
  }

  /** The next `nextQueueSize` upcoming piece types. */
  getPreview() {
    return this.queue.slice(0, this.rules.nextQueueSize);
  }
}
