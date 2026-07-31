import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SevenBagGenerator, createRandomizer } from '../src/game/PieceGenerator.js';
import { TYPES } from '../src/game/pieceDefinitions.js';
import { seededRng } from './helpers.js';

test('seven-bag contains exactly one of every piece', () => {
  const gen = new SevenBagGenerator(TYPES, seededRng(1));
  const drawn = [];
  for (let i = 0; i < 7; i++) drawn.push(gen.next());
  assert.deepEqual([...drawn].sort(), [...TYPES].sort());
});

test('multiple bags each contain all seven pieces', () => {
  const gen = new SevenBagGenerator(TYPES, seededRng(42));
  for (let bag = 0; bag < 5; bag++) {
    const drawn = [];
    for (let i = 0; i < 7; i++) drawn.push(gen.next());
    assert.deepEqual(
      [...drawn].sort(),
      [...TYPES].sort(),
      `bag ${bag} should contain all pieces`
    );
  }
});

test('never repeats more than expected within a window', () => {
  // Across two bags the same piece can appear at most twice.
  const gen = new SevenBagGenerator(TYPES, seededRng(7));
  const counts = new Map();
  for (let i = 0; i < 14; i++) {
    const t = gen.next();
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  for (const [, c] of counts) assert.equal(c, 2);
});

test('createRandomizer resolves seven-bag and falls back for unknown names', () => {
  const a = createRandomizer('seven-bag', TYPES, seededRng(1));
  assert.equal(typeof a.next, 'function');
  const b = createRandomizer('does-not-exist', TYPES, seededRng(1));
  assert.ok(TYPES.includes(b.next()));
});
