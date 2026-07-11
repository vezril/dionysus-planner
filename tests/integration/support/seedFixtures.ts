import type { SeedRow } from "@/data/seed/seed";

/**
 * S-203 test-only fixture: a small, hand-built seed row set (distinct
 * seedKeys prefixed `test:` so it never collides with the real
 * `usda:*` keys in data/seed/seed-data.json) used by seed.test.ts and
 * bootstrap.test.ts for fast, deterministic idempotency/override tests.
 * The real 351-row seed-data.json is exercised separately (seed.test.ts's
 * "real seed-data.json" describe block) to prove the fixture-sized tests
 * generalize to production data volume/shape.
 *
 * Shape matches architecture.md §8's seed row schema exactly.
 */
export const SAMPLE_SEED_ROWS: SeedRow[] = [
  {
    seedKey: "test:onion",
    name: "Onion, yellow, medium",
    unitClass: "COUNT",
    densityGPerMl: null,
    caloriesPerRef: 44,
    proteinPerRef: 1.2,
    carbsPerRef: 10.2,
    fatPerRef: 0.1,
    fiberPerRef: 1.9,
    sugarPerRef: 4.6,
    sodiumMgPerRef: 4,
  },
  {
    seedKey: "test:flour",
    name: "Flour, all-purpose",
    unitClass: "MASS",
    densityGPerMl: null,
    caloriesPerRef: 364,
    proteinPerRef: 10.3,
    carbsPerRef: 76.3,
    fatPerRef: 1.0,
    fiberPerRef: 2.7,
    sugarPerRef: 0.3,
    sodiumMgPerRef: 2,
  },
  {
    seedKey: "test:milk",
    name: "Milk, whole",
    unitClass: "VOLUME",
    densityGPerMl: 1.03,
    caloriesPerRef: 61,
    proteinPerRef: 3.2,
    carbsPerRef: 4.8,
    fatPerRef: 3.3,
    fiberPerRef: 0,
    sugarPerRef: 5.1,
    sodiumMgPerRef: 43,
  },
  {
    seedKey: "test:butter",
    name: "Butter, salted",
    unitClass: "MASS",
    densityGPerMl: null,
    caloriesPerRef: 717,
    proteinPerRef: 0.85,
    carbsPerRef: 0.06,
    fatPerRef: 81.11,
    fiberPerRef: 0,
    sugarPerRef: 0.06,
    sodiumMgPerRef: 643,
  },
  {
    seedKey: "test:sugar",
    name: "Sugar, granulated",
    unitClass: "MASS",
    densityGPerMl: null,
    caloriesPerRef: 387,
    proteinPerRef: 0,
    carbsPerRef: 100,
    fatPerRef: 0,
    fiberPerRef: 0,
    sugarPerRef: 100,
    sodiumMgPerRef: 0,
  },
];
