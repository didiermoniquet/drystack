// Tetromino definitions and rotation kick tables.
//
// Each piece is described by:
//   - `box`:    the side length of the square bounding box the cells live in.
//   - `color`:  the fill color used by the renderer.
//   - `glyph`:  a shape key drawn on every cell so pieces are distinguishable
//               without relying on color alone (accessibility requirement).
//   - `states`: four rotation states, each a list of [col, row] cell offsets
//               within the bounding box. Coordinates use screen convention:
//               x grows right, y grows DOWN.
//
// The palette is a deliberately original scheme that does NOT follow the
// conventional per-piece colouring — combined with the per-piece glyphs, this
// gives Drystack its own visual identity. Adding a new piece is just a matter of
// adding an entry here (and, if it needs custom kicks, extending KICKS).

export const PIECES = {
  I: {
    box: 4,
    color: '#f2704e', // coral
    glyph: 'bar',
    states: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]],
    ],
  },
  O: {
    box: 2,
    color: '#2bb8a3', // teal
    glyph: 'square',
    states: [
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [0, 1], [1, 1]],
    ],
  },
  T: {
    box: 3,
    color: '#a3c93a', // lime
    glyph: 'triangle',
    states: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]],
    ],
  },
  S: {
    box: 3,
    color: '#e06fc0', // orchid
    glyph: 'diagUp',
    states: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
    ],
  },
  Z: {
    box: 3,
    color: '#4aa8f0', // azure
    glyph: 'diagDown',
    states: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]],
    ],
  },
  J: {
    box: 3,
    color: '#f4c333', // gold
    glyph: 'cornerL',
    states: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]],
    ],
  },
  L: {
    box: 3,
    color: '#7c74e6', // indigo
    glyph: 'cornerR',
    states: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
  },
};

// Canonical draw / bag order.
export const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Super Rotation System wall-kick tables.
//
// Keyed by `${fromState}${toState}`. Each entry is the ordered list of [dx, dy]
// offsets to test; the first offset that fits is applied. Offsets are expressed
// in screen coordinates (y grows down), i.e. the standard SRS data with its
// y component negated.
export const KICKS = {
  JLSTZ: {
    '01': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '10': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '12': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '21': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '23': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '32': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '30': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '03': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  },
  I: {
    '01': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '10': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '12': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '21': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '23': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '32': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '30': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '03': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  },
};
