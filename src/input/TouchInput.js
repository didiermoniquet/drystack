// Touch / pointer bindings for the on-screen control pad.
//
// Left, right, and soft-drop support press-and-hold (pointerdown starts the
// intent, pointerup/cancel/leave ends it). Rotate, hard drop, hold, and pause
// are one-shot on pointerdown. Default actions are prevented to stop scrolling,
// double-tap zoom, and text selection; pressed-state feedback is applied via a
// CSS class.

const HOLD_ACTIONS = new Set(['left', 'right', 'softDrop', 'up']);

export class TouchInput {
  constructor(input, buttons, { onPauseToggle } = {}) {
    this.input = input;
    this.buttons = buttons; // { action: HTMLElement }
    this.onPauseToggle = onPauseToggle;
    this._bound = [];
  }

  attach() {
    for (const [action, el] of Object.entries(this.buttons)) {
      if (!el) continue;
      this.#bind(action, el);
    }
  }

  #bind(action, el) {
    const start = (e) => {
      e.preventDefault();
      el.classList.add('is-pressed');
      this.#begin(action);
    };
    const end = (e) => {
      e.preventDefault();
      el.classList.remove('is-pressed');
      this.#finish(action);
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
    // Suppress the synthetic context menu on long-press.
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this._bound.push([el, start, end]);
  }

  #begin(action) {
    switch (action) {
      case 'left':
        this.input.pressLeft();
        break;
      case 'right':
        this.input.pressRight();
        break;
      case 'softDrop':
        this.input.pressSoft();
        break;
      case 'up':
        this.input.pressUp();
        break;
      case 'hardDrop':
        this.input.tap('hardDrop');
        break;
      case 'rotateCW':
        this.input.tap('rotateCW');
        break;
      case 'rotateCCW':
        this.input.tap('rotateCCW');
        break;
      case 'hold':
        this.input.tap('hold');
        break;
      case 'phase':
        this.input.tap('phase');
        break;
      case 'pause':
        this.onPauseToggle?.();
        break;
      default:
        break;
    }
  }

  #finish(action) {
    if (!HOLD_ACTIONS.has(action)) return;
    if (action === 'left') this.input.releaseLeft();
    else if (action === 'right') this.input.releaseRight();
    else if (action === 'softDrop') this.input.releaseSoft();
    else if (action === 'up') this.input.releaseUp();
  }

  detach() {
    for (const [el, start, end] of this._bound) {
      el.removeEventListener('pointerdown', start);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      el.removeEventListener('pointerleave', end);
    }
    this._bound.length = 0;
  }
}
