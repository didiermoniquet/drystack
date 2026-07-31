// Sound effects via the Web Audio API.
//
// No audio files are shipped — effects are synthesized from short oscillator
// blips. This keeps the download tiny and means there is nothing to fail to
// load: if Web Audio is unavailable or the context can't start, every method is
// a silent no-op and the game plays on without sound.
//
// The context is created lazily on the first `resume()` (a user gesture),
// respecting the browser rule against autoplay before interaction.

const SFX = {
  move: { freq: 220, dur: 0.03, type: 'square', gain: 0.15 },
  rotate: { freq: 330, dur: 0.04, type: 'square', gain: 0.15 },
  softdrop: { freq: 180, dur: 0.02, type: 'square', gain: 0.1 },
  harddrop: { freq: 120, dur: 0.06, type: 'sawtooth', gain: 0.2 },
  lock: { freq: 160, dur: 0.05, type: 'triangle', gain: 0.18 },
  hold: { freq: 300, dur: 0.05, type: 'triangle', gain: 0.15 },
  lineclear: { freq: 520, dur: 0.12, type: 'triangle', gain: 0.22 },
  tetris: { freq: 660, dur: 0.22, type: 'sawtooth', gain: 0.25 },
  levelup: { freq: 740, dur: 0.18, type: 'triangle', gain: 0.22 },
  pause: { freq: 200, dur: 0.08, type: 'sine', gain: 0.15 },
  gameover: { freq: 90, dur: 0.5, type: 'sawtooth', gain: 0.25 },
};

export class AudioManager {
  constructor({ enabled = true, volume = 0.7 } = {}) {
    this.enabled = enabled;
    this.volume = volume;
    this.ctx = null;
    this.master = null;
    this.supported = typeof window !== 'undefined' &&
      !!(window.AudioContext || window.webkitAudioContext);
  }

  /** Create/resume the context. Must be called from a user gesture. */
  resume() {
    if (!this.supported) return;
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.supported = false;
    }
  }

  setEnabled(on) {
    this.enabled = on;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  play(name) {
    if (!this.enabled || !this.supported || !this.ctx) return;
    const spec = SFX[name];
    if (!spec) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = spec.type;
      osc.frequency.setValueAtTime(spec.freq, now);
      gain.gain.setValueAtTime(spec.gain, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + spec.dur);
    } catch {
      /* never let audio break gameplay */
    }
  }
}
