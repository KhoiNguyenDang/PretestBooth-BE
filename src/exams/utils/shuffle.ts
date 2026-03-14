/**
 * Seeded pseudo-random number generator (Mulberry32)
 * Produces deterministic results for the same seed.
 */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle with a deterministic seed.
 * Same seed + same input array always produces the same output order.
 *
 * @param array - The array to shuffle (not mutated)
 * @param seed  - Integer seed for the PRNG
 * @returns A new shuffled array
 */
export function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const rng = mulberry32(seed);

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}
