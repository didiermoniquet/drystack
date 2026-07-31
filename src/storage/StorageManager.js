// Persistence wrapper around localStorage.
//
// Every access is guarded: if storage is unavailable (private mode, disabled,
// quota) or a stored value is malformed, we silently fall back to an in-memory
// map so the game keeps working. Nothing here ever throws.

const PREFIX = 'drystack:';

export class StorageManager {
  constructor(namespace = PREFIX) {
    this.prefix = namespace;
    this.memory = new Map();
    this.available = this.#probe();
  }

  #probe() {
    try {
      const k = this.prefix + '__probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  get(key, fallback = null) {
    const full = this.prefix + key;
    try {
      const raw = this.available
        ? window.localStorage.getItem(full)
        : this.memory.get(full);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      // Malformed JSON or read error — discard and use the fallback.
      return fallback;
    }
  }

  set(key, value) {
    const full = this.prefix + key;
    let raw;
    try {
      raw = JSON.stringify(value);
    } catch {
      return false;
    }
    try {
      if (this.available) window.localStorage.setItem(full, raw);
      else this.memory.set(full, raw);
      return true;
    } catch {
      // Quota or write error — degrade to memory so the session still persists.
      this.memory.set(full, raw);
      return false;
    }
  }

  remove(key) {
    const full = this.prefix + key;
    try {
      if (this.available) window.localStorage.removeItem(full);
      this.memory.delete(full);
    } catch {
      /* ignore */
    }
  }
}
