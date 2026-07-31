import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/game/Board.js';
import { fillRowExcept } from './helpers.js';

function makeBoard() {
  // 10 wide, 22 total rows (20 visible + 2 hidden).
  return new Board(10, 22, 2);
}

test('new board is empty and bounds-check works', () => {
  const b = makeBoard();
  assert.equal(b.getFullRows().length, 0);
  assert.ok(b.inBounds(0, 0));
  assert.ok(b.inBounds(9, 21));
  assert.ok(!b.inBounds(-1, 0));
  assert.ok(!b.inBounds(10, 0));
  assert.ok(!b.inBounds(0, 22));
});

test('detects a single full row', () => {
  const b = makeBoard();
  fillRowExcept(b, 21, []); // completely fill the bottom row
  assert.deepEqual(b.getFullRows(), [21]);
});

test('a row with a gap is not full', () => {
  const b = makeBoard();
  fillRowExcept(b, 21, [4]);
  assert.deepEqual(b.getFullRows(), []);
});

test('clearing a single row collapses rows above', () => {
  const b = makeBoard();
  b.set(3, 20, 'A'); // sits directly above the row we will clear
  fillRowExcept(b, 21, []);
  const removed = b.clearRows([21]);
  assert.equal(removed, 1);
  // The 'A' cell should have fallen from row 20 to row 21.
  assert.equal(b.cell(3, 21), 'A');
  assert.equal(b.cell(3, 20), null);
});

test('clearing multiple rows removes all and refills from the top', () => {
  const b = makeBoard();
  fillRowExcept(b, 20, []);
  fillRowExcept(b, 21, []);
  b.set(0, 19, 'T');
  const removed = b.clearRows([20, 21]);
  assert.equal(removed, 2);
  assert.equal(b.cell(0, 21), 'T'); // dropped two rows
  // Top rows are empty again.
  assert.equal(b.cell(0, 0), null);
});

test('reset clears the grid', () => {
  const b = makeBoard();
  fillRowExcept(b, 21, []);
  b.reset();
  assert.equal(b.getFullRows().length, 0);
});
