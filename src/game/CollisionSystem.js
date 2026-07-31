// Collision queries.
//
// Pure functions with no state, kept separate from movement and rotation so
// alternative board topologies (wrap-around, obstacles, destructible cells)
// can reuse or replace the collision test in isolation.

/**
 * True if every cell is inside the board and lands on an empty square.
 * @param {import('./Board.js').Board} board
 * @param {Array<[number, number]>} cells
 */
export function cellsFit(board, cells) {
  for (let i = 0; i < cells.length; i++) {
    const x = cells[i][0];
    const y = cells[i][1];
    if (!board.inBounds(x, y)) return false;
    if (!board.isEmpty(x, y)) return false;
  }
  return true;
}

/** True if the piece's current cells all fit on the board. */
export function pieceFits(board, piece) {
  return cellsFit(board, piece.cells());
}
