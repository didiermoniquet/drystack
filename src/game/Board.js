// The locked playfield grid.
//
// The grid includes `hiddenRows` extra rows at the top (indices 0..hiddenRows-1)
// where pieces spawn out of view. Visible rows are the remaining ones. Each cell
// is either null (empty) or a piece-type string (e.g. 'T') used for coloring.
//
// The board knows nothing about the active piece, rendering, or scoring.

export class Board {
  constructor(width, totalRows, hiddenRows) {
    this.width = width;
    this.totalRows = totalRows;
    this.hiddenRows = hiddenRows;
    this.grid = this.#emptyGrid();
  }

  #emptyGrid() {
    return Array.from({ length: this.totalRows }, () =>
      new Array(this.width).fill(null)
    );
  }

  reset() {
    this.grid = this.#emptyGrid();
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.totalRows;
  }

  isEmpty(x, y) {
    return this.grid[y][x] === null;
  }

  cell(x, y) {
    return this.grid[y][x];
  }

  set(x, y, value) {
    this.grid[y][x] = value;
  }

  /** Row indices (top to bottom) that are completely filled. */
  getFullRows() {
    const rows = [];
    for (let y = 0; y < this.totalRows; y++) {
      let full = true;
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] === null) {
          full = false;
          break;
        }
      }
      if (full) rows.push(y);
    }
    return rows;
  }

  /**
   * Remove the given rows and let everything above fall down, refilling the top
   * with empty rows. Returns the number of rows removed.
   */
  clearRows(rows) {
    if (!rows.length) return 0;
    const remove = new Set(rows);
    const kept = [];
    for (let y = 0; y < this.totalRows; y++) {
      if (!remove.has(y)) kept.push(this.grid[y]);
    }
    const removed = this.totalRows - kept.length;
    const fresh = Array.from({ length: removed }, () =>
      new Array(this.width).fill(null)
    );
    this.grid = [...fresh, ...kept];
    return removed;
  }
}
