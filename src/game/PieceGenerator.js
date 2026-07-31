// Piece randomizers.
//
// A generator only has to implement `next()` returning a piece-type string.
// Randomizers are looked up through a registry so alternatives (true random,
// weighted bags, drought-limited, etc.) can be added without changing the Game.

/**
 * Seven-bag randomizer: draws a shuffled permutation of all piece types,
 * exhausts it, then reshuffles a fresh bag. Guarantees even distribution and
 * bounded droughts. The RNG is injectable for deterministic tests.
 */
export class SevenBagGenerator {
  constructor(types, rng = Math.random) {
    this.types = [...types];
    this.rng = rng;
    this.bag = [];
  }

  #refill() {
    const bag = [...this.types];
    // Fisher–Yates shuffle.
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }
    this.bag = bag;
  }

  next() {
    if (this.bag.length === 0) this.#refill();
    return this.bag.pop();
  }
}

/**
 * Pure uniform randomizer — included to demonstrate that the randomizer slot is
 * genuinely pluggable. Not used by the default rules.
 */
export class UniformGenerator {
  constructor(types, rng = Math.random) {
    this.types = [...types];
    this.rng = rng;
  }

  next() {
    return this.types[Math.floor(this.rng() * this.types.length)];
  }
}

const RANDOMIZERS = {
  'seven-bag': SevenBagGenerator,
  uniform: UniformGenerator,
};

/** Register an alternative randomizer by name. */
export function registerRandomizer(name, ctor) {
  RANDOMIZERS[name] = ctor;
}

/** Construct a randomizer by name, falling back to seven-bag. */
export function createRandomizer(name, types, rng = Math.random) {
  const Ctor = RANDOMIZERS[name] || SevenBagGenerator;
  return new Ctor(types, rng);
}
