const test = require("node:test");
const assert = require("node:assert/strict");

const { buildLeafHash, buildMerkleBundle } = require("../services/mealProofService");

test("buildLeafHash is deterministic and buildMerkleBundle returns proof data for each meal", () => {
  const mealServes = [
    {
      id: "meal-1",
      child_id: "child-1",
      school_id: "school-1",
      meal_type: "LUNCH",
      serve_date: "2026-03-13",
      created_at: "2026-03-13T08:00:00.000Z",
      is_grace: 0,
      meal_scan_id: "scan-1",
    },
    {
      id: "meal-2",
      child_id: "child-2",
      school_id: "school-1",
      meal_type: "LUNCH",
      serve_date: "2026-03-13",
      created_at: "2026-03-13T08:02:00.000Z",
      is_grace: 1,
      meal_scan_id: "scan-2",
    },
  ];

  const firstHash = buildLeafHash(mealServes[0]);
  const secondHash = buildLeafHash(mealServes[0]);
  const bundle = buildMerkleBundle(mealServes);

  assert.equal(firstHash, secondHash);
  assert.match(firstHash, /^0x[a-f0-9]{64}$/);
  assert.match(bundle.batchRoot, /^0x[a-f0-9]{64}$/);
  assert.equal(bundle.leaves.length, 2);
  assert.equal(bundle.leaves[0].mealServeId, "meal-1");
  assert.equal(bundle.leaves[0].leafIndex, 0);
  assert.ok(Array.isArray(bundle.leaves[0].merkleProof));
  assert.equal(bundle.leaves[0].merkleProof.length, 1);
});
