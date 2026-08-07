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
  PHASING: 'PHASING', // positioning a phase piece through the stack
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

    // Phase piece
    this.phaseCharges = 0;
    this.phasing = false;
    this._phaseOrigin = null; // active piece snapshot to restore on cancel
    this._phaseEarned = 0; // charges already granted (from total lines)

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

  #inBounds(cells) {
    for (let i = 0; i < cells.length; i++) {
      if (!this.board.inBounds(cells[i][0], cells[i][1])) return false;
    }
    return true;
  }

  // A phase piece passes through locked blocks, so it only respects the walls
  // and floor — not occupied cells — while being positioned.
  #movePhantom(dx, dy) {
    const cells = this.active.cells(
      this.active.rotation,
      this.active.x + dx,
      this.active.y + dy
    );
    if (!this.#inBounds(cells)) return false;
    this.active.x += dx;
    this.active.y += dy;
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
    if (this.state === State.PHASING) return this.#movePhantom(-1, 0);
    if (this.state !== State.PLAYING) return false;
    if (this.#move(-1, 0)) {
      this.#registerLockReset('move');
      this.emit('move', -1);
      return true;
    }
    return false;
  }

  moveRight() {
    if (this.state === State.PHASING) return this.#movePhantom(1, 0);
    if (this.state !== State.PLAYING) return false;
    if (this.#move(1, 0)) {
      this.#registerLockReset('move');
      this.emit('move', 1);
      return true;
    }
    return false;
  }

  softDrop() {
    if (this.state === State.PHASING) return this.#movePhantom(0, 1);
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
    // While phasing, the drop key commits (seats) the phantom instead.
    if (this.state === State.PHASING) return this.seatPhase();
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
    if (this.state === State.PHASING) return this.#rotatePhantom(direction);
    if (this.state !== State.PLAYING) return false;
    const rotated = this.rotate(this.board, this.active, direction);
    if (!rotated) return false;
    this.active = rotated;
    this._ghostDirty = true;
    this.#registerLockReset('rotate');
    this.emit('rotate', direction);
    return true;
  }

  // Free rotation for the phantom: change orientation, nudging horizontally to
  // stay inside the walls (occupied cells are ignored).
  #rotatePhantom(direction) {
    const to = (this.active.rotation + (direction > 0 ? 1 : 3)) % 4;
    for (const dx of [0, -1, 1, -2, 2]) {
      const cells = this.active.cells(to, this.active.x + dx, this.active.y);
      if (this.#inBounds(cells)) {
        this.active.rotation = to;
        this.active.x += dx;
        this.emit('rotate', direction);
        return true;
      }
    }
    return false;
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

  // --- phase piece ---------------------------------------------------------

  /** Enter phase mode: the active piece becomes a phantom that passes through
   *  the stack. Costs nothing until it is seated; cancelling is free. */
  activatePhase() {
    if (!this.rules.enablePhasePiece) return false;
    if (this.state !== State.PLAYING) return false;
    if (this.phaseCharges <= 0 || !this.active) return false;
    this._phaseOrigin = this.active.clone();
    this.phasing = true;
    this.state = State.PHASING;
    this.emit('phasestart');
    return true;
  }

  /** Leave phase mode without seating; the original piece resumes falling. */
  cancelPhase() {
    if (this.state !== State.PHASING) return false;
    this.active = this._phaseOrigin;
    this._phaseOrigin = null;
    this.phasing = false;
    this.state = State.PLAYING;
    this.emit('phaseend', { seated: false });
    return true;
  }

  togglePhase() {
    return this.state === State.PHASING ? this.cancelPhase() : this.activatePhase();
  }

  /** Move the phantom up one row, kept within the visible field. */
  moveUp() {
    if (this.state !== State.PHASING) return false;
    const cells = this.active.cells(this.active.rotation, this.active.x, this.active.y - 1);
    if (!this.#inBounds(cells)) return false;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i][1] < this.board.hiddenRows) return false; // stay on-screen
    }
    this.active.y -= 1;
    return true;
  }

  // A cell is "covered" (inaccessible from above) when a filled cell sits above
  // it in the same column.
  #isCovered(x, y) {
    for (let yy = y - 1; yy >= 0; yy--) {
      if (!this.board.isEmpty(x, yy)) return true;
    }
    return false;
  }

  // The valid seat nearest the phantom's current row, so up/down aim selects
  // which buried pocket to fill. A seat is valid when every phantom cell lands
  // in an empty, covered hole. Null when there is no legal seat in this column.
  #findPhaseSeatY() {
    const rot = this.active.rotation;
    const x = this.active.x;
    let best = null;
    let bestDist = Infinity;
    for (let y = 0; y < this.board.totalRows; y++) {
      const cells = this.active.cells(rot, x, y);
      if (!this.#inBounds(cells)) continue;
      let ok = true;
      for (const [cx, cy] of cells) {
        if (!this.board.isEmpty(cx, cy) || !this.#isCovered(cx, cy)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const dist = Math.abs(y - this.active.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = y;
        }
      }
    }
    return best;
  }

  /** Cells the phantom would fill if seated now, or null if it can't seat. */
  getPhaseSeatCells() {
    if (this.state !== State.PHASING || !this.active) return null;
    const y = this.#findPhaseSeatY();
    if (y === null) return null;
    return this.active.cells(this.active.rotation, this.active.x, y);
  }

  /** Commit the phantom into the buried pocket it currently fits (if any). */
  seatPhase() {
    if (this.state !== State.PHASING) return false;
    const y = this.#findPhaseSeatY();
    if (y === null) return false; // no buried pocket fits here
    const type = this.active.type;
    const cells = this.active.cells(this.active.rotation, this.active.x, y);
    for (const [cx, cy] of cells) this.board.set(cx, cy, type);
    this.phaseCharges--;
    this.phasing = false;
    this._phaseOrigin = null;
    this.active = null;
    this.score.phaseFill(cells.length);
    this.emit('phasefill', { cells });
    this.emit('phaseend', { seated: true });

    // Filling a buried hole can complete rows — resolve like a lock.
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
      this.state = State.PLAYING;
      this.#spawn();
    }
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
    this.#accruePhaseCharges();
    this.state = State.PLAYING;
    this.#spawn();
  }

  // Grant one phase charge for every `linesPerPhaseCharge` cleared lines.
  #accruePhaseCharges() {
    if (!this.rules.enablePhasePiece) return;
    const earned = Math.floor(this.score.lines / this.rules.linesPerPhaseCharge);
    if (earned > this._phaseEarned) {
      const added = earned - this._phaseEarned;
      this._phaseEarned = earned;
      this.phaseCharges += added;
      this.emit('phasecharge', this.phaseCharges);
    }
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
    if (this.state === State.PHASING) return null;
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
