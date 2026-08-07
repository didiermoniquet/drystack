// Scoring, line count, and level.
//
// Deliberately independent of board logic. `clearLines` accepts an options
// object so future scoring (combos, back-to-back, T-spins, multipliers) can be
// layered in without changing the call sites that already pass a line count.

const LINE_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };

export class ScoreSystem {
  constructor(rules) {
    this.rules = rules;
    this.reset();
  }

  reset() {
    this.score = 0;
    this.lines = 0;
  }

  /** Level rises every `linesPerLevel` cleared lines, starting at 1. */
  get level() {
    return 1 + Math.floor(this.lines / this.rules.linesPerLevel);
  }

  /**
   * Award points for clearing `count` lines and advance the line total.
   * The multiplier uses the level *before* this clear is counted, matching
   * classic scoring. Returns the points gained.
   */
  clearLines(count, options = {}) {
    if (count <= 0) return 0;
    const base = LINE_SCORES[count] ?? count * 200;
    const multiplier = options.multiplier ?? 1;
    const gained = Math.round(base * this.level * multiplier);
    this.score += gained;
    this.lines += count;
    return gained;
  }

  softDrop(cells) {
    const gained = cells * this.rules.softDropPointsPerCell;
    this.score += gained;
    return gained;
  }

  hardDrop(cells) {
    const gained = cells * this.rules.hardDropPointsPerCell;
    this.score += gained;
    return gained;
  }

  /** Reward for seating a phase piece into buried cells. */
  phaseFill(cells) {
    const gained = cells * this.rules.phaseFillPointsPerCell;
    this.score += gained;
    return gained;
  }
}
