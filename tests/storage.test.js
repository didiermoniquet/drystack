import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StorageManager } from '../src/storage/StorageManager.js';

function fakeWindow() {
  const store = new Map();
  return {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    _store: store,
  };
}

test('falls back to memory when no storage is available', () => {
  delete global.window; // no window at all
  const sm = new StorageManager();
  assert.equal(sm.available, false);
  assert.ok(sm.set('score', 123));
  assert.equal(sm.get('score', 0), 123);
  assert.equal(sm.get('missing', 42), 42);
});

test('round-trips JSON through real storage', () => {
  global.window = fakeWindow();
  const sm = new StorageManager();
  assert.equal(sm.available, true);
  sm.set('settings', { ghost: false, volume: 0.5 });
  assert.deepEqual(sm.get('settings'), { ghost: false, volume: 0.5 });
  delete global.window;
});

test('malformed stored data is handled safely', () => {
  global.window = fakeWindow();
  const sm = new StorageManager();
  global.window.localStorage.setItem('drystack:broken', '{not valid json');
  assert.equal(sm.get('broken', 'fallback'), 'fallback');
  delete global.window;
});

test('write failures degrade gracefully without throwing', () => {
  global.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    },
  };
  const sm = new StorageManager();
  assert.equal(sm.available, false); // probe write threw
  // Still usable via the in-memory fallback.
  assert.doesNotThrow(() => sm.set('x', 1));
  assert.equal(sm.get('x', null), 1);
  delete global.window;
});
