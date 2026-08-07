// Canvas renderer.
//
// The renderer is a pure view: it reads game state and draws it. It never
// mutates gameplay and stores no gameplay truth. It handles device-pixel-ratio
// scaling for sharp output on high-density displays and only resizes its
// backing store when the CSS box actually changes.

import { PIECES } from '../game/pieceDefinitions.js';
import { State } from '../game/Game.js';

// Fallback appearance for any cell value that isn't a known piece type (e.g.
// future garbage/obstacle markers) so the renderer never crashes on new data.
const UNKNOWN_CELL = { color: '#64748b', glyph: 'square' };
const cellStyle = (type) => PIECES[type] || UNKNOWN_CELL;

// Draw a single tetromino cell: base fill, a bevel for depth, and a subtle
// per-type glyph so shapes are distinguishable without relying on color.
function drawCell(ctx, px, py, size, color, glyph, { ghost = false } = {}) {
  const inset = Math.max(1, size * 0.06);
  const x = px + inset;
  const y = py + inset;
  const s = size - inset * 2;

  if (ghost) {
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, s, s);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    ctx.globalAlpha = 1;
    return;
  }

  ctx.fillStyle = color;
  ctx.fillRect(x, y, s, s);

  // Bevel: light top/left, dark bottom/right.
  const bevel = Math.max(1, s * 0.14);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x, y, s, bevel);
  ctx.fillRect(x, y, bevel, s);
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(x, y + s - bevel, s, bevel);
  ctx.fillRect(x + s - bevel, y, bevel, s);

  drawGlyph(ctx, x, y, s, glyph);
}

// Small centered symbol, one per piece type, drawn at low opacity.
function drawGlyph(ctx, x, y, s, glyph) {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.2;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.beginPath();
  switch (glyph) {
    case 'bar':
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();
      break;
    case 'square':
      ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
      break;
    case 'triangle':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.lineTo(cx - r, cy + r);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'diagUp':
      ctx.moveTo(cx - r, cy + r);
      ctx.lineTo(cx + r, cy - r);
      ctx.stroke();
      break;
    case 'diagDown':
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.stroke();
      break;
    case 'cornerL':
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
      break;
    case 'cornerR':
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.stroke();
      break;
    default:
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
  }
  ctx.restore();
}

// Colors for the phantom when its current position has no legal seat.
const PHANTOM_INVALID_FILL = '#ef4444';
const PHANTOM_INVALID_OUTLINE = '#fecaca';

// A flashing, translucent phantom cell for the phase piece.
function drawPhantomCell(ctx, px, py, size, color, alpha, outline = '#ffffff') {
  const inset = Math.max(1, size * 0.06);
  const x = px + inset;
  const y = py + inset;
  const s = size - inset * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, s, s);
  ctx.globalAlpha = Math.min(1, alpha + 0.35);
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  ctx.restore();
}

// Highlight where a phase piece would seat (a valid buried pocket).
function drawSeatCell(ctx, px, py, size) {
  const inset = Math.max(1, size * 0.06);
  const x = px + inset;
  const y = py + inset;
  const s = size - inset * 2;
  ctx.save();
  ctx.fillStyle = 'rgba(52,211,153,0.28)';
  ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = 'rgba(52,211,153,0.95)';
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
  ctx.restore();
}

// Render one piece centered inside a mini preview canvas (hold / next).
function renderPreview(canvas, type, reducedMotion) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = canvas.clientWidth || 64;
  const cssH = canvas.clientHeight || 64;
  if (canvas.width !== Math.round(cssW * dpr) ||
      canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!type) return;

  const def = PIECES[type];
  const cells = def.states[0];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [cxp, cyp] of cells) {
    minX = Math.min(minX, cxp); maxX = Math.max(maxX, cxp);
    minY = Math.min(minY, cyp); maxY = Math.max(maxY, cyp);
  }
  const wCells = maxX - minX + 1;
  const hCells = maxY - minY + 1;
  const cell = Math.min(cssW / (wCells + 0.6), cssH / (hCells + 0.6));
  const offX = (cssW - wCells * cell) / 2 - minX * cell;
  const offY = (cssH - hCells * cell) / 2 - minY * cell;
  for (const [cxp, cyp] of cells) {
    drawCell(ctx, offX + cxp * cell, offY + cyp * cell, cell, def.color, def.glyph);
  }
}

export class Renderer {
  constructor(boardCanvas, rules, { reducedMotion = false } = {}) {
    this.canvas = boardCanvas;
    this.ctx = boardCanvas.getContext('2d');
    this.rules = rules;
    this.reducedMotion = reducedMotion;
    this.cols = rules.boardWidth;
    this.rows = rules.boardHeight;
    this.hidden = rules.hiddenRows;
    this.cell = 0;
    this.dpr = 1;
    this.resize();
  }

  setReducedMotion(on) {
    this.reducedMotion = on;
  }

  /**
   * Size the canvas to the largest exact cols:rows box that fits its parent,
   * then match the backing store to that CSS box and the device pixel ratio.
   * Computing the CSS size here (rather than in stylesheet) guarantees the
   * board keeps precise square cells and a 1:2 aspect on every layout. Safe to
   * call any frame.
   */
  resize() {
    const parent = this.canvas.parentElement;
    const availW = parent ? parent.clientWidth : this.canvas.clientWidth;
    const availH = parent ? parent.clientHeight : this.canvas.clientHeight;
    if (!availW || !availH) return;

    const cell = Math.max(1, Math.floor(Math.min(availW / this.cols, availH / this.rows)));
    const cssW = cell * this.cols;
    const cssH = cell * this.rows;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';

    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(cssW * this.dpr);
    const h = Math.round(cssH * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.cssW = cssW;
    this.cssH = cssH;
    this.cell = cell;
  }

  render(game) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    this.#drawBackground(ctx);

    const clearingRows = game.state === State.LINE_CLEARING && game.clearing
      ? new Set(game.clearing.rows)
      : null;
    const clearFlash = clearingRows
      ? this.#clearProgress(game)
      : 0;

    // Locked cells.
    for (let y = this.hidden; y < game.board.totalRows; y++) {
      const isClearing = clearingRows && clearingRows.has(y);
      for (let x = 0; x < this.cols; x++) {
        const type = game.board.cell(x, y);
        if (!type) continue;
        const px = x * this.cell;
        const py = (y - this.hidden) * this.cell;
        const style = cellStyle(type);
        drawCell(ctx, px, py, this.cell, style.color, style.glyph);
        if (isClearing) {
          ctx.fillStyle = `rgba(255,255,255,${clearFlash})`;
          ctx.fillRect(px, py, this.cell, this.cell);
        }
      }
    }

    if (game.state === State.PHASING && game.active) {
      this.#renderPhase(ctx, game);
    } else if (game.active && game.state !== State.LINE_CLEARING) {
      // Ghost then active piece.
      const ghost = game.getGhostCells();
      if (ghost) {
        for (const [x, y] of ghost) {
          if (y < this.hidden) continue;
          drawCell(
            ctx, x * this.cell, (y - this.hidden) * this.cell, this.cell,
            game.active.color, PIECES[game.active.type].glyph, { ghost: true }
          );
        }
      }
      for (const [x, y] of game.active.cells()) {
        if (y < this.hidden) continue;
        drawCell(
          ctx, x * this.cell, (y - this.hidden) * this.cell, this.cell,
          game.active.color, PIECES[game.active.type].glyph
        );
      }
    }
  }

  #renderPhase(ctx, game) {
    // Where the phantom would seat (green highlight), if anywhere legal.
    const seat = game.getPhaseSeatCells();
    const canSeat = !!seat;
    if (seat) {
      for (const [x, y] of seat) {
        if (y < this.hidden) continue;
        drawSeatCell(ctx, x * this.cell, (y - this.hidden) * this.cell, this.cell);
      }
    }
    // The flashing phantom at its current position — red when it can't seat here.
    const alpha = this.#phantomAlpha();
    const fill = canSeat ? game.active.color : PHANTOM_INVALID_FILL;
    const outline = canSeat ? '#ffffff' : PHANTOM_INVALID_OUTLINE;
    for (const [x, y] of game.active.cells()) {
      if (y < this.hidden) continue;
      drawPhantomCell(
        ctx, x * this.cell, (y - this.hidden) * this.cell, this.cell,
        fill, alpha, outline
      );
    }
  }

  #phantomAlpha() {
    if (this.reducedMotion) return 0.5;
    const t = (globalThis.performance ? performance.now() : 0) / 1000;
    return 0.28 + 0.34 * (0.5 + 0.5 * Math.sin(t * 8));
  }

  #clearProgress(game) {
    if (this.reducedMotion) return 0.15;
    const total = this.rules.lineClearAnimationMs || 1;
    const t = 1 - Math.max(0, game.clearing.timer) / total;
    return 0.15 + 0.55 * Math.sin(Math.min(1, t) * Math.PI); // rise then fall
  }

  #drawBackground(ctx) {
    ctx.fillStyle = '#0b0f1a';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < this.cols; x++) {
      const px = Math.round(x * this.cell) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, this.cssH);
    }
    for (let y = 1; y < this.rows; y++) {
      const py = Math.round(y * this.cell) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(this.cssW, py);
    }
    ctx.stroke();
  }

  /** Draw the held piece into its mini canvas. */
  renderHold(canvas, type) {
    renderPreview(canvas, type, this.reducedMotion);
  }

  /** Draw the upcoming pieces into their mini canvases (array of canvases). */
  renderNext(canvases, queue) {
    for (let i = 0; i < canvases.length; i++) {
      renderPreview(canvases[i], queue[i] || null, this.reducedMotion);
    }
  }
}
