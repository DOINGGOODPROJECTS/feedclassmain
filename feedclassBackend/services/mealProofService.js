const crypto = require("crypto");
const mealServeRepository = require("../repositories/mealServeRepository");
const mealServeProofRepository = require("../repositories/mealServeProofRepository");
const mealBatchAnchorRepository = require("../repositories/mealBatchAnchorRepository");

function sha256Hex(value) {
  return `0x${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function hashPair(left, right) {
  const leftBuffer = Buffer.from(String(left).replace(/^0x/, ""), "hex");
  const rightBuffer = Buffer.from(String(right).replace(/^0x/, ""), "hex");
  return `0x${crypto.createHash("sha256").update(Buffer.concat([leftBuffer, rightBuffer])).digest("hex")}`;
}

function toLeafPayload(mealServe) {
  return JSON.stringify({
    mealServeId: mealServe.id,
    childId: mealServe.child_id,
    schoolId: mealServe.school_id,
    mealType: mealServe.meal_type,
    serveDate: String(mealServe.serve_date).slice(0, 10),
    createdAt:
      mealServe.created_at instanceof Date
        ? mealServe.created_at.toISOString()
        : new Date(mealServe.created_at).toISOString(),
    isGrace: Boolean(mealServe.is_grace),
    mealScanId: mealServe.meal_scan_id || null,
  });
}

function buildLeafHash(mealServe) {
  return sha256Hex(toLeafPayload(mealServe));
}

function buildMerkleBundle(mealServes) {
  if (!Array.isArray(mealServes) || mealServes.length === 0) {
    throw new Error("At least one served meal is required to build a Merkle batch");
  }

  const leaves = mealServes.map((mealServe, index) => ({
    mealServeId: mealServe.id,
    leafHash: buildLeafHash(mealServe),
    leafIndex: index,
  }));

  const layers = [leaves.map((entry) => entry.leafHash)];
  while (layers[layers.length - 1].length > 1) {
    const current = layers[layers.length - 1];
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1] || current[index];
      next.push(hashPair(left, right));
    }
    layers.push(next);
  }

  const proofs = leaves.map((leaf) => {
    const proof = [];
    let index = leaf.leafIndex;

    for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
      const layer = layers[layerIndex];
      const isRightNode = index % 2 === 1;
      const siblingIndex = isRightNode ? index - 1 : index + 1;
      const siblingHash = layer[siblingIndex] || layer[index];

      proof.push({
        position: isRightNode ? "left" : "right",
        hash: siblingHash,
      });

      index = Math.floor(index / 2);
    }

    return {
      mealServeId: leaf.mealServeId,
      leafHash: leaf.leafHash,
      leafIndex: leaf.leafIndex,
      merkleProof: proof,
    };
  });

  return {
    batchRoot: layers[layers.length - 1][0],
    leaves: proofs,
  };
}

async function persistBatchProofs({ schoolId, serveDate, batchAnchor }) {
  const mealServes = await mealServeRepository.listForBatch({ schoolId, serveDate });
  if (mealServes.length === 0) {
    throw new Error("No served meals found for the selected school/date batch");
  }

  const bundle = buildMerkleBundle(mealServes);
  const records = bundle.leaves.map((leaf) => ({
    mealServeId: leaf.mealServeId,
    batchAnchorId: batchAnchor?.id || null,
    schoolId,
    serveDate,
    leafHash: leaf.leafHash,
    leafIndex: leaf.leafIndex,
    merkleProof: leaf.merkleProof,
    batchRoot: batchAnchor?.merkle_root || batchAnchor?.merkleRoot || bundle.batchRoot,
    txHash: batchAnchor?.tx_hash || batchAnchor?.txHash || null,
    confirmationStatus: batchAnchor?.status || "UNANCHORED",
  }));

  await mealServeProofRepository.upsertProofs(records);

  return {
    mealCount: mealServes.length,
    batchRoot: bundle.batchRoot,
    proofs: records,
  };
}

async function ensureProofsForAnchoredBatch(mealServe) {
  const existing = await mealServeProofRepository.findByMealServeId(mealServe.id);
  if (existing) {
    return existing;
  }

  const batchAnchor = await mealBatchAnchorRepository.findByUniqueBatch({
    schoolId: mealServe.school_id,
    serveDate: String(mealServe.serve_date).slice(0, 10),
    batchVersion: 1,
  });

  if (!batchAnchor) {
    return null;
  }

  await persistBatchProofs({
    schoolId: mealServe.school_id,
    serveDate: String(mealServe.serve_date).slice(0, 10),
    batchAnchor,
  });

  return mealServeProofRepository.findByMealServeId(mealServe.id);
}

async function getMealVerification(mealServeId) {
  const mealServe = await mealServeRepository.findById(mealServeId);
  if (!mealServe) {
    throw new Error("Meal serve not found");
  }

  const proof = (await ensureProofsForAnchoredBatch(mealServe)) || (await mealServeProofRepository.findByMealServeId(mealServeId));
  if (!proof) {
    return {
      mealServeId: mealServe.id,
      schoolId: mealServe.school_id,
      serveDate: String(mealServe.serve_date).slice(0, 10),
      mealType: mealServe.meal_type,
      leafHash: buildLeafHash(mealServe),
      merkleProof: [],
      batchRoot: null,
      txHash: null,
      confirmationStatus: "UNANCHORED",
      anchored: false,
    };
  }

  return {
    mealServeId: mealServe.id,
    schoolId: mealServe.school_id,
    serveDate: String(mealServe.serve_date).slice(0, 10),
    mealType: mealServe.meal_type,
    leafHash: proof.leaf_hash,
    merkleProof: proof.merkle_proof || [],
    batchRoot: proof.batch_root,
    txHash: proof.tx_hash,
    confirmationStatus: proof.confirmation_status,
    anchored: proof.confirmation_status === "CONFIRMED",
  };
}

module.exports = {
  buildLeafHash,
  buildMerkleBundle,
  persistBatchProofs,
  getMealVerification,
};
