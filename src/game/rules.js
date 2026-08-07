// Centralized rule configuration.
//
// This is the single source of truth for tunable gameplay values. Future rule
// sets (different board sizes, alternative timings, new modes) should be created
// by calling `createRules(overrides)` rather than editing values in place or
// duplicating them across files.

export const defaultRules = {
  // Board geometry
  boardWidth: 10,
  boardHeight: 20, // visible rows
  hiddenRows: 2, // spawn rows above the visible field

  // Progression
  linesPerLevel: 10,

  // Features
  enableHold: true,
  enableGhostPiece: true,
  nextQueueSize: 5, // upcoming pieces shown (3–5 recommended)

  // Lock delay
  lockDelayMs: 500,
  maxLockResets: 15,
  lockResetOnMove: true,
  lockResetOnRotate: true,

  // Scoring
  softDropPointsPerCell: 1,
  hardDropPointsPerCell: 2,

  // Phase piece (signature mechanic): a phantom that passes through the stack
  // and seats only into buried, inaccessible holes.
  enablePhasePiece: true,
  linesPerPhaseCharge: 5, // earn one phase charge per N cleared lines
  phaseFillPointsPerCell: 20, // reward for filling buried cells

  // Pluggable subsystems (looked up in registries so they can be swapped later)
  randomizer: 'seven-bag',
  rotationSystem: 'wall-kick',

  // Input timing (delayed auto-shift / auto-repeat)
  dasMs: 140, // delay before auto-repeat begins
  arrMs: 35, // interval between auto-repeated horizontal moves
  softDropIntervalMs: 45, // interval between auto-repeated soft drops

  // Presentation timing
  lineClearAnimationMs: 180,
};

/**
 * Build a rule set from the defaults, applying shallow overrides.
 * Unknown keys are preserved so experimental rules can carry extra config.
 */
export function createRules(overrides = {}) {
  return { ...defaultRules, ...overrides };
}

/**
 * Gravity interval in milliseconds per cell for a given level.
 *
 * Uses the classic guideline curve (time-per-cell shrinks geometrically with
 * level) and clamps to roughly one cell per frame at the top end so the engine
 * never tries to move a piece an unbounded distance in a single tick.
 */
export function gravityIntervalMs(level) {
  const l = Math.max(1, level);
  const secondsPerCell = Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  return Math.max(secondsPerCell * 1000, 1000 / 60);
}
