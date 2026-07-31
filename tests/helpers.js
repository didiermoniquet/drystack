// Shared test helpers.

// Deterministic pseudo-random generator (mulberry32) so tests that rely on the
// randomizer are reproducible.
export function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fill specific cells on a board's grid (each [x, y]) with a marker.
export function fillCells(board, cells, marker = 'X') {
  for (const [x, y] of cells) board.set(x, y, marker);
}

// Fill an entire row (in board coordinates) except the given empty columns.
export function fillRowExcept(board, y, emptyCols = []) {
  const skip = new Set(emptyCols);
  for (let x = 0; x < board.width; x++) {
    if (!skip.has(x)) board.set(x, y, 'X');
  }
}
