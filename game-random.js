const DEFAULT_SEED_LIMIT = 96;

function normalizeSeed(seed, limit = DEFAULT_SEED_LIMIT) {
  if (seed === null || seed === undefined) {
    return null;
  }
  const normalized = String(seed).trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, limit);
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

function nextMulberry32(state) {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let value = nextState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return {
    state: nextState,
    value: ((value ^ (value >>> 14)) >>> 0) / 4294967296,
  };
}

function normalizeRandomState(state) {
  const number = Number(state);
  return Number.isFinite(number) ? number >>> 0 : null;
}

function createSeededRandomSource(seed, initialState = null) {
  const normalizedSeed = normalizeSeed(seed) ?? "";
  let state = normalizeRandomState(initialState) ?? hashSeed(normalizedSeed);
  return {
    seed: normalizedSeed,
    next() {
      const result = nextMulberry32(state);
      state = result.state;
      return result.value;
    },
    clone() {
      return createSeededRandomSource(normalizedSeed, state);
    },
    snapshot() {
      return {
        mode: "seeded",
        seed: normalizedSeed,
        state,
      };
    },
  };
}

function createRandomSource({ seed = null, rng = null, snapshot = null } = {}) {
  if (snapshot && typeof snapshot === "object") {
    if (snapshot.mode === "seeded" || typeof snapshot.seed === "string") {
      const snapshotSeed = snapshot.seed === "" ? "" : normalizeSeed(snapshot.seed);
      if (snapshotSeed !== null) {
        return createSeededRandomSource(snapshotSeed, snapshot.state);
      }
    }
  }

  const normalizedSeed = normalizeSeed(seed);
  if (normalizedSeed !== null) {
    return createSeededRandomSource(normalizedSeed);
  }
  if (typeof rng === "function") {
    return {
      seed: null,
      next: rng,
      clone: () => createRandomSource({ rng }),
      snapshot: () => ({ mode: "external" }),
    };
  }
  return {
    seed: null,
    next: () => Math.random(),
    clone: () => createRandomSource(),
    snapshot: () => ({ mode: "random" }),
  };
}

function randint(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function choice(rng, items) {
  return items[randint(rng, 0, items.length - 1)];
}

function weightedChoice(rng, weightMap) {
  const entries = Object.entries(weightMap);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * totalWeight;
  for (const [item, weight] of entries) {
    roll -= weight;
    if (roll < 0) {
      return item;
    }
  }
  return entries[entries.length - 1][0];
}

function shuffle(rng, items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randint(rng, 0, index);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

export {
  createRandomSource,
  createSeededRandomSource,
  normalizeSeed,
  randint,
  choice,
  weightedChoice,
  shuffle,
};
