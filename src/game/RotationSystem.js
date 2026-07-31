// Rotation with wall kicks (Super Rotation System).
//
// Exposed as a small registry so an alternative rotation system can be
// registered and selected via `rules.rotationSystem` without touching callers.

import { KICKS } from './pieceDefinitions.js';
import { cellsFit } from './CollisionSystem.js';

function kickTableFor(type) {
  if (type === 'I') return KICKS.I;
  if (type === 'O') return null; // O never needs to move
  return KICKS.JLSTZ;
}

/**
 * Attempt to rotate `piece` in `direction` (+1 clockwise, -1 counter-clockwise)
 * against `board`. Returns a new rotated Piece on success, or null if no tested
 * offset yields a legal position.
 */
export function wallKickRotate(board, piece, direction) {
  const from = piece.rotation;
  const to = (from + (direction > 0 ? 1 : 3)) % 4;

  // O piece: rotation is a no-op in position, so it stays visually stable.
  if (piece.type === 'O') {
    const rotated = piece.clone();
    rotated.rotation = to;
    return rotated;
  }

  const table = kickTableFor(piece.type);
  const offsets = (table && table[`${from}${to}`]) || [[0, 0]];

  for (let i = 0; i < offsets.length; i++) {
    const dx = offsets[i][0];
    const dy = offsets[i][1];
    const cells = piece.cells(to, piece.x + dx, piece.y + dy);
    if (cellsFit(board, cells)) {
      const rotated = piece.clone();
      rotated.rotation = to;
      rotated.x += dx;
      rotated.y += dy;
      return rotated;
    }
  }
  return null;
}

const ROTATION_SYSTEMS = {
  'wall-kick': wallKickRotate,
};

/** Register an alternative rotation system by name. */
export function registerRotationSystem(name, fn) {
  ROTATION_SYSTEMS[name] = fn;
}

/** Resolve a rotation system by name, falling back to wall-kick. */
export function getRotationSystem(name) {
  return ROTATION_SYSTEMS[name] || wallKickRotate;
}
