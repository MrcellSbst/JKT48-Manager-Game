export function hashSeed(seed) {
  let h = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    h ^= seed.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seedValue) {
  let state = seedValue >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomInt = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;

export function weightedPick(rng, items, getWeight) {
  const total = items.reduce((sum, item) => sum + getWeight(item), 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= getWeight(item);
    if (roll <= 0) return item;
  }
  return items.at(-1);
}
