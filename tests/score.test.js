import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScoreSystem } from '../src/game/ScoreSystem.js';
import { createRules } from '../src/game/rules.js';

function makeScore(overrides) {
  return new ScoreSystem(createRules(overrides));
}

test('line clear scores follow the level-scaled table', () => {
  const s = makeScore();
  assert.equal(s.clearLines(1), 100); // level 1
  s.reset();
  assert.equal(s.clearLines(2), 300);
  s.reset();
  assert.equal(s.clearLines(3), 500);
  s.reset();
  assert.equal(s.clearLines(4), 800);
});

test('scores scale with the current level', () => {
  const s = makeScore({ linesPerLevel: 10 });
  // Reach level 2 by clearing 10 lines (as 5 doubles).
  for (let i = 0; i < 5; i++) s.clearLines(2);
  assert.equal(s.level, 2);
  const before = s.score;
  const gained = s.clearLines(4); // 800 * level 2
  assert.equal(gained, 1600);
  assert.equal(s.score, before + 1600);
});

test('level increases every linesPerLevel lines', () => {
  const s = makeScore({ linesPerLevel: 10 });
  assert.equal(s.level, 1);
  s.clearLines(4);
  s.clearLines(4); // 8 lines
  assert.equal(s.level, 1);
  s.clearLines(2); // 10 lines
  assert.equal(s.level, 2);
});

test('soft and hard drop points respect the rules', () => {
  const s = makeScore({ softDropPointsPerCell: 1, hardDropPointsPerCell: 2 });
  assert.equal(s.softDrop(5), 5);
  assert.equal(s.hardDrop(6), 12);
  assert.equal(s.score, 17);
});

test('clearing zero lines scores nothing', () => {
  const s = makeScore();
  assert.equal(s.clearLines(0), 0);
  assert.equal(s.score, 0);
  assert.equal(s.lines, 0);
});
