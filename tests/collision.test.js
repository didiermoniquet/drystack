import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/game/Board.js';
import { Piece } from '../src/game/Piece.js';
import { cellsFit, pieceFits } from '../src/game/CollisionSystem.js';

function makeBoard() {
  return new Board(10, 22, 2);
}

test('piece fits in open space', () => {
  const b = makeBoard();
  const p = new Piece('T', 4, 5, 0);
  assert.ok(pieceFits(b, p));
});

test('rejects moving past the left wall', () => {
  const b = makeBoard();
  // O piece at x=0 occupies columns 0..1; moving left goes out of bounds.
  const p = new Piece('O', 0, 5, 0);
  assert.ok(!cellsFit(b, p.cells(0, -1, 5)));
});

test('rejects moving past the right wall', () => {
  const b = makeBoard();
  // O piece occupies 2 columns; x=9 would put a cell at column 10.
  const p = new Piece('O', 8, 5, 0);
  assert.ok(pieceFits(b, p)); // columns 8..9 ok
  assert.ok(!cellsFit(b, p.cells(0, 9, 5)));
});

test('rejects moving below the floor', () => {
  const b = makeBoard();
  const p = new Piece('O', 4, 20, 0); // occupies rows 20..21 (bottom)
  assert.ok(pieceFits(b, p));
  assert.ok(!cellsFit(b, p.cells(0, 4, 21))); // row 22 is out of bounds
});

test('rejects overlap with a locked cell', () => {
  const b = makeBoard();
  b.set(4, 6, 'X');
  const p = new Piece('O', 4, 5, 0); // would occupy (4,5),(5,5),(4,6),(5,6)
  assert.ok(!pieceFits(b, p));
});
