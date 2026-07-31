// The active (falling) piece: a type, a position, and a rotation state.
//
// A Piece never touches the board directly — it just reports which cells it
// would occupy. The Game and collision system decide whether those cells are
// legal. This keeps the active piece cleanly separate from locked cells.

import { PIECES } from './pieceDefinitions.js';

export class Piece {
  constructor(type, x, y, rotation = 0) {
    this.type = type;
    this.x = x; // board column of the bounding box's left edge
    this.y = y; // board row of the bounding box's top edge
    this.rotation = rotation; // 0..3
  }

  get color() {
    return PIECES[this.type].color;
  }

  /**
   * Board cells occupied for a given rotation/position (defaults to current).
   * Returns an array of [col, row] pairs.
   */
  cells(rotation = this.rotation, x = this.x, y = this.y) {
    const offsets = PIECES[this.type].states[rotation];
    const out = new Array(offsets.length);
    for (let i = 0; i < offsets.length; i++) {
      out[i] = [x + offsets[i][0], y + offsets[i][1]];
    }
    return out;
  }

  clone() {
    return new Piece(this.type, this.x, this.y, this.rotation);
  }
}
