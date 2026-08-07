import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, State } from '../src/game/Game.js';
import { Piece } from '../src/game/Piece.js';
import { createRules } from '../src/game/rules.js';
import { seededRng } from './helpers.js';

function newGame(overrides) {
  const g = new Game(createRules(overrides), { rng: seededRng(999) });
  g.start();
  return g;
}

// Carve a 2x2 buried pocket at columns 4-5, rows 20-21, covered by row 19.
function buildBuriedPocket(g, { covered = true } = {}) {
  for (let y = 20; y <= 21; y++) {
    for (let x = 0; x < 10; x++) {
      if (x !== 4 && x !== 5) g.board.set(x, y, 'X');
    }
  }
  if (covered) {
    g.board.set(4, 19, 'X');
    g.board.set(5, 19, 'X');
  }
}

test('phase charges accrue every N cleared lines', () => {
  const g = newGame({ linesPerPhaseCharge: 1 });
  for (let x = 0; x < 10; x++) if (x !== 4 && x !== 5) g.board.set(x, 21, 'X');
  g.active = new Piece('O', 4, 0, 0);
  g.hardDrop();
  g.tick(g.rules.lineClearAnimationMs + 10);
  assert.equal(g.score.lines, 1);
  assert.equal(g.phaseCharges, 1);
});

test('no phase charges accrue when the mechanic is disabled', () => {
  const g = newGame({ enablePhasePiece: false, linesPerPhaseCharge: 1 });
  for (let x = 0; x < 10; x++) if (x !== 4 && x !== 5) g.board.set(x, 21, 'X');
  g.active = new Piece('O', 4, 0, 0);
  g.hardDrop();
  g.tick(g.rules.lineClearAnimationMs + 10);
  assert.equal(g.phaseCharges, 0);
});

test('activating phase requires a charge and enters PHASING', () => {
  const g = newGame();
  assert.equal(g.activatePhase(), false); // no charges yet
  g.phaseCharges = 1;
  assert.ok(g.activatePhase());
  assert.equal(g.state, State.PHASING);
  assert.ok(g.phasing);
});

test('the phantom passes through locked blocks while positioning', () => {
  const g = newGame();
  g.phaseCharges = 1;
  g.active = new Piece('O', 0, 0, 0);
  g.board.set(0, 5, 'X'); // an obstacle in the phantom's path
  g.activatePhase();
  for (let i = 0; i < 8; i++) g.softDrop(); // move down through the block
  assert.ok(g.active.y > 5, 'phantom should move past the obstacle row');
});

test('seating fills a buried pocket and clears the completed lines', () => {
  const g = newGame();
  buildBuriedPocket(g, { covered: true });
  g.phaseCharges = 1;
  g.active = new Piece('O', 4, 0, 0);
  let filled = null;
  g.on('phasefill', (p) => (filled = p));
  g.activatePhase();
  assert.ok(g.seatPhase());
  assert.equal(g.phaseCharges, 0);
  assert.ok(filled && filled.cells.length === 4);
  assert.equal(g.state, State.LINE_CLEARING);
  g.tick(g.rules.lineClearAnimationMs + 10);
  assert.equal(g.score.lines, 2);
  assert.equal(g.board.getFullRows().length, 0);
});

test('seating is rejected when the pocket is not covered (reachable from above)', () => {
  const g = newGame();
  buildBuriedPocket(g, { covered: false });
  g.phaseCharges = 1;
  g.active = new Piece('O', 4, 0, 0);
  g.activatePhase();
  assert.equal(g.seatPhase(), false); // open pocket is not a legal target
  assert.equal(g.phaseCharges, 1); // charge not spent
  assert.equal(g.state, State.PHASING);
});

test('seating on an invalid spot emits phasedenied and spends no charge', () => {
  const g = newGame();
  g.phaseCharges = 1;
  g.active = new Piece('O', 0, 5, 0); // open board — nothing buried under it
  g.activatePhase();
  let denied = false;
  g.on('phasedenied', () => (denied = true));
  assert.equal(g.seatPhase(), false);
  assert.ok(denied);
  assert.equal(g.phaseCharges, 1);
  assert.equal(g.state, State.PHASING);
});

test('cancelling phase restores the original piece for free', () => {
  const g = newGame();
  g.phaseCharges = 1;
  g.active = new Piece('T', 4, 0, 0);
  g.activatePhase();
  g.moveLeft();
  g.moveLeft();
  g.softDrop();
  assert.ok(g.cancelPhase());
  assert.equal(g.state, State.PLAYING);
  assert.equal(g.phaseCharges, 1); // free to cancel
  assert.equal(g.active.x, 4); // restored position
  assert.equal(g.active.y, 0);
});

test('the phantom can move up while phasing, bounded to the visible field', () => {
  const g = newGame();
  g.phaseCharges = 1;
  g.active = new Piece('O', 4, 10, 0);
  assert.equal(g.moveUp(), false); // no effect before phasing
  g.activatePhase();
  assert.ok(g.moveUp());
  assert.equal(g.active.y, 9);
  for (let i = 0; i < 40; i++) g.moveUp(); // hit the visible ceiling
  const minRow = Math.min(...g.active.cells().map(([, y]) => y));
  assert.ok(minRow >= g.board.hiddenRows, 'phantom stays on screen');
});

test('phase seat targets the buried pocket nearest the phantom', () => {
  const g = newGame();
  const maxY = (cells) => Math.max(...cells.map(([, y]) => y));
  // Lower covered pocket (rows 20-21) and an upper one (rows 8-9), cols 4-5.
  for (let y = 20; y <= 21; y++)
    for (let x = 0; x < 10; x++) if (x !== 4 && x !== 5) g.board.set(x, y, 'X');
  g.board.set(4, 19, 'X'); g.board.set(5, 19, 'X');
  for (let y = 8; y <= 9; y++)
    for (let x = 0; x < 10; x++) if (x !== 4 && x !== 5) g.board.set(x, y, 'X');
  g.board.set(4, 7, 'X'); g.board.set(5, 7, 'X');

  g.phaseCharges = 1;
  g.active = new Piece('O', 4, 8, 0); // aimed at the upper pocket
  g.activatePhase();
  assert.equal(maxY(g.getPhaseSeatCells()), 9);
  for (let i = 0; i < 12; i++) g.softDrop(); // lower the phantom
  assert.equal(maxY(g.getPhaseSeatCells()), 21); // now targets the lower pocket
});

test('getPhaseSeatCells previews a valid seat and is null otherwise', () => {
  const g = newGame();
  buildBuriedPocket(g, { covered: true });
  g.phaseCharges = 1;
  g.active = new Piece('O', 4, 0, 0);
  g.activatePhase();
  const preview = g.getPhaseSeatCells();
  assert.ok(preview && preview.length === 4);
  g.moveLeft(); // move away from the pocket → no valid seat
  assert.equal(g.getPhaseSeatCells(), null);
});
