import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/game/Board.js';
import { Piece } from '../src/game/Piece.js';
import { wallKickRotate } from '../src/game/RotationSystem.js';
import { pieceFits } from '../src/game/CollisionSystem.js';

function makeBoard() {
  return new Board(10, 22, 2);
}

test('valid rotation in open space advances the rotation state', () => {
  const b = makeBoard();
  const p = new Piece('T', 4, 5, 0);
  const r = wallKickRotate(b, p, 1);
  assert.ok(r);
  assert.equal(r.rotation, 1);
  assert.ok(pieceFits(b, r));
});

test('counter-clockwise rotation wraps from 0 to 3', () => {
  const b = makeBoard();
  const p = new Piece('J', 4, 5, 0);
  const r = wallKickRotate(b, p, -1);
  assert.ok(r);
  assert.equal(r.rotation, 3);
});

test('O piece stays in place when rotated (visually stable)', () => {
  const b = makeBoard();
  const p = new Piece('O', 4, 5, 0);
  const r = wallKickRotate(b, p, 1);
  assert.deepEqual(r.cells().sort(), p.cells().sort());
});

test('wall kick shifts an I piece off the wall', () => {
  const b = makeBoard();
  // Vertical I whose occupied column is board column 0 (x = -2, only col x+2).
  const p = new Piece('I', -2, 5, 1);
  assert.ok(pieceFits(b, p));
  const r = wallKickRotate(b, p, 1); // -> horizontal, would exit left wall
  assert.ok(r, 'rotation should succeed via a kick');
  assert.equal(r.rotation, 2);
  assert.equal(r.x, 0, 'kick should push the piece to x=0');
  assert.ok(pieceFits(b, r));
});

test('rotation is rejected when no offset fits', () => {
  const b = makeBoard();
  const p = new Piece('I', 3, 5, 0);
  const occupied = new Set(p.cells().map(([x, y]) => `${x},${y}`));
  // Fill the whole board except the piece's own cells: nothing can rotate.
  for (let y = 0; y < b.totalRows; y++) {
    for (let x = 0; x < b.width; x++) {
      if (!occupied.has(`${x},${y}`)) b.set(x, y, 'X');
    }
  }
  const r = wallKickRotate(b, p, 1);
  assert.equal(r, null);
});
