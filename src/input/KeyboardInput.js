// Keyboard bindings.
//
// Maps physical keys to input intents. Held movement/soft-drop use keydown to
// press and keyup to release, ignoring the browser's native auto-repeat so the
// InputManager's DAS/ARR is authoritative. Gameplay keys have their default
// action prevented so the page never scrolls while playing.

const GAMEPLAY_CODES = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space',
]);

export class KeyboardInput {
  constructor(input, { isPlaying, onPauseToggle, onRestart }) {
    this.input = input;
    this.isPlaying = isPlaying;
    this.onPauseToggle = onPauseToggle;
    this.onRestart = onRestart;
    this._down = this.#onKeyDown.bind(this);
    this._up = this.#onKeyUp.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
  }

  detach() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
  }

  #onKeyDown(e) {
    if (GAMEPLAY_CODES.has(e.code)) e.preventDefault();
    if (e.repeat) return; // our own auto-repeat handles holds

    switch (e.code) {
      case 'ArrowLeft':
        this.input.pressLeft();
        break;
      case 'ArrowRight':
        this.input.pressRight();
        break;
      case 'ArrowDown':
        this.input.pressSoft();
        break;
      case 'Space':
        this.input.tap('hardDrop');
        break;
      case 'ArrowUp':
      case 'KeyX':
        this.input.tap('rotateCW');
        break;
      case 'KeyZ':
        this.input.tap('rotateCCW');
        break;
      case 'KeyC':
      case 'ShiftLeft':
      case 'ShiftRight':
        this.input.tap('hold');
        break;
      case 'KeyF':
        this.input.tap('phase');
        break;
      case 'KeyP':
      case 'Escape':
        this.onPauseToggle?.();
        break;
      case 'KeyR':
        this.onRestart?.();
        break;
      default:
        break;
    }
  }

  #onKeyUp(e) {
    switch (e.code) {
      case 'ArrowLeft':
        this.input.releaseLeft();
        break;
      case 'ArrowRight':
        this.input.releaseRight();
        break;
      case 'ArrowDown':
        this.input.releaseSoft();
        break;
      default:
        break;
    }
  }
}
