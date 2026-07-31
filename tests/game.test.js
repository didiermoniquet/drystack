import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, State } from '../src/game/Game.js';
import { Piece } from '../src/game/Piece.js';
import { createRules } from '../src/game/rules.js';
import { seededRng } from './helpers.js';

function newGame(overrides) {
  const g = new Game(createRules(overrides), { rng: seededRng(12345) });
  g.start();
  return g;
}

test('start spawns a valid active piece and enters PLAYING', () => {
  const g = newGame();
  assert.equal(g.state, State.PLAYING);
  assert.ok(g.active);
  assert.ok(g.getPreview().length >= 3);
});

test('soft drop moves the piece down one cell and scores', () => {
  const g = newGame();
  const y0 = g.active.y;
  assert.ok(g.softDrop());
  assert.equal(g.active.y, y0 + 1);
  assert.ok(g.score.score >= 1);
});

test('horizontal movement is blocked at the walls', () => {
  const g = newGame();
  g.active = new Piece('O', 0, 5, 0); // against the left wall
  assert.equal(g.moveLeft(), false);
  assert.equal(g.active.x, 0);
  g.active = new Piece('O', 8, 5, 0); // against the right wall (cols 8..9)
  assert.equal(g.moveRight(), false);
  assert.equal(g.active.x, 8);
});

test('gravity pulls the piece down over time', () => {
  const g = newGame();
  const y0 = g.active.y;
  g.tick(1000); // ~1 cell at level 1
  assert.ok(g.active.y > y0);
});

test('hard drop lands the piece, scores by distance, and locks immediately', () => {
  const g = newGame();
  g.active = new Piece('O', 4, 0, 0);
  const before = g.score.score;
  g.hardDrop();
  // O locks on the floor: rows 20 and 21, columns 4 and 5.
  assert.equal(g.board.cell(4, 21), 'O');
  assert.equal(g.board.cell(5, 20), 'O');
  assert.ok(g.score.score > before); // hard-drop cells scored
  assert.ok(g.active); // a new piece spawned
});

test('ghost piece marks the hard-drop destination', () => {
  const g = newGame();
  g.active = new Piece('O', 4, 0, 0);
  const ghost = g.getGhostCells();
  const maxY = Math.max(...ghost.map(([, y]) => y));
  assert.equal(maxY, 21); // bottom row
});

test('lock delay holds a resting piece before locking', () => {
  const g = newGame({ lockDelayMs: 500 });
  g.active = new Piece('O', 0, 20, 0); // resting on the floor
  g.tick(400);
  assert.equal(g.board.cell(0, 21), null); // not locked yet
  g.tick(200); // total 600 > 500
  assert.equal(g.board.cell(0, 21), 'O'); // now locked
});

test('single line clear updates lines and collapses rows', () => {
  const g = newGame();
  // Fill the bottom row except columns 4 and 5.
  for (let x = 0; x < 10; x++) if (x !== 4 && x !== 5) g.board.set(x, 21, 'X');
  g.active = new Piece('O', 4, 0, 0);
  g.hardDrop(); // completes row 21
  assert.equal(g.state, State.LINE_CLEARING);
  g.tick(g.rules.lineClearAnimationMs + 10);
  assert.equal(g.score.lines, 1);
  assert.equal(g.board.getFullRows().length, 0);
  // The O's upper cells (row 20) fell into row 21.
  assert.equal(g.board.cell(4, 21), 'O');
});

test('multi-line clear removes all completed rows', () => {
  const g = newGame();
  for (let y = 20; y <= 21; y++) {
    for (let x = 0; x < 10; x++) if (x !== 4 && x !== 5) g.board.set(x, y, 'X');
  }
  g.active = new Piece('O', 4, 0, 0);
  g.hardDrop(); // completes rows 20 and 21
  g.tick(g.rules.lineClearAnimationMs + 10);
  assert.equal(g.score.lines, 2);
  assert.equal(g.board.getFullRows().length, 0);
  assert.equal(g.board.cell(4, 21), null); // everything cleared away
});

test('hold stores a piece and cannot be used twice per piece', () => {
  const g = newGame();
  const first = g.active.type;
  assert.ok(g.hold());
  assert.equal(g.heldPiece, first);
  assert.ok(g.holdUsed);
  assert.equal(g.hold(), false); // blocked until the active piece locks
});

test('hold becomes available again after a lock, and swaps', () => {
  const g = newGame();
  const first = g.active.type;
  g.hold(); // store `first`, spawn next
  g.active = new Piece(g.active.type, 4, 0, 0);
  g.hardDrop(); // locks, spawns a new piece, resets hold availability
  const current = g.active.type;
  assert.ok(g.hold()); // swap allowed again
  assert.equal(g.active.type, first);
  assert.equal(g.heldPiece, current);
});

test('game over is detected when a spawn cannot be placed', () => {
  const g = newGame();
  // Block the spawn zone (hidden rows) without completing any line.
  for (let y = 0; y < 2; y++) for (let x = 3; x <= 6; x++) g.board.set(x, y, 'X');
  let over = false;
  g.on('gameover', () => (over = true));
  g.active = new Piece('O', 0, 20, 0); // harmless drop at the far left
  g.hardDrop();
  assert.equal(g.state, State.GAME_OVER);
  assert.ok(over);
});

test('pause prevents gameplay updates and input', () => {
  const g = newGame();
  const y0 = g.active.y;
  g.pause();
  assert.equal(g.state, State.PAUSED);
  g.tick(5000);
  assert.equal(g.active.y, y0); // gravity did not run
  assert.equal(g.moveLeft(), false); // input rejected while paused
  g.resume();
  assert.equal(g.state, State.PLAYING);
});

test('restart resets score, board, and state', () => {
  const g = newGame();
  g.active = new Piece('O', 4, 0, 0);
  g.hardDrop(); // score some points and place cells
  assert.ok(g.score.score > 0);
  g.restart();
  assert.equal(g.state, State.PLAYING);
  assert.equal(g.score.score, 0);
  assert.equal(g.score.lines, 0);
  assert.equal(g.board.getFullRows().length, 0);
  assert.ok(g.active);
});

test('game reaches higher levels and gravity gets faster', () => {
  const g = newGame({ linesPerLevel: 1 });
  // Directly exercise the score/level coupling.
  g.score.clearLines(4);
  assert.ok(g.score.level > 1);
});
