const { BlockchainService } = require("./blockchainService");
const mealBatchAnchorRepository = require("../repositories/mealBatchAnchorRepository");
const { persistBatchProofs } = require("./mealProofService");

const blockchainService = new BlockchainService();

async function anchorDailyMealBatch({
  schoolId,
  serveDate,
  merkleRoot = null,
  mealCount = null,
  batchVersion = null,
}) {
  if (!schoolId || !serveDate) {
    throw new Error("schoolId and serveDate are required.");
  }

  const blockchainStatus = blockchainService.getStatus();
  if (!blockchainStatus.valid) {
    const error = new Error("Blockchain relayer is not configured.");
    error.statusCode = 503;
    error.details = { missing: blockchainStatus.missing };
    throw error;
  }

  const proofBatch = await persistBatchProofs({
    schoolId,
    serveDate,
    batchAnchor: {
      id: null,
      merkle_root: null,
      tx_hash: null,
      status: "UNANCHORED",
    },
  });

  if (merkleRoot && merkleRoot !== proofBatch.batchRoot) {
    const error = new Error("Provided merkleRoot does not match the computed daily meal batch root.");
    error.statusCode = 400;
    error.details = { computedMerkleRoot: proofBatch.batchRoot };
    throw error;
  }

  if (mealCount && Number(mealCount) !== proofBatch.mealCount) {
    const error = new Error("Provided mealCount does not match the served meal count for this batch.");
    error.statusCode = 400;
    error.details = { computedMealCount: proofBatch.mealCount };
    throw error;
  }

  const latestBatch = await mealBatchAnchorRepository.findLatestForBatch({ schoolId, serveDate });
  if (
    latestBatch &&
    latestBatch.merkle_root === proofBatch.batchRoot &&
    Number(latestBatch.meal_count) === Number(proofBatch.mealCount) &&
    ["SUBMITTED", "CONFIRMED"].includes(latestBatch.status)
  ) {
    await persistBatchProofs({
      schoolId,
      serveDate,
      batchAnchor: latestBatch,
    });
    return {
      batch: latestBatch,
      reused: true,
      proofBatch,
    };
  }

  const effectiveBatchVersion =
    batchVersion || (latestBatch ? Number(latestBatch.batch_version || 0) + 1 : 1);

  let pendingBatch = null;
  try {
    pendingBatch = await mealBatchAnchorRepository.createPendingAnchor({
      schoolId,
      serveDate,
      batchVersion: effectiveBatchVersion,
      mealCount: proofBatch.mealCount,
      merkleRoot: proofBatch.batchRoot,
      network: blockchainStatus.config.network,
      contractAddress: blockchainStatus.config.contractAddress,
    });

    const submission = await blockchainService.submitAnchorTransaction({
      merkleRoot: proofBatch.batchRoot,
      schoolId,
      date: serveDate,
      mealCount: proofBatch.mealCount,
    });

    await mealBatchAnchorRepository.markSubmitted(pendingBatch.id, submission.txHash);
    const confirmation = await blockchainService.waitForConfirmation(submission.txHash);

    if (Number(confirmation.status) !== 1) {
      const failedBatch = await mealBatchAnchorRepository.markFailed(
        pendingBatch.id,
        `Transaction ${submission.txHash} reverted on-chain.`
      );
      await persistBatchProofs({
        schoolId,
        serveDate,
        batchAnchor: failedBatch,
      });

      const error = new Error("Anchor transaction reverted.");
      error.statusCode = 502;
      error.details = { batch: failedBatch };
      throw error;
    }

    const confirmedBatch = await mealBatchAnchorRepository.markConfirmed(
      pendingBatch.id,
      confirmation.blockNumber
    );
    await persistBatchProofs({
      schoolId,
      serveDate,
      batchAnchor: confirmedBatch,
    });

    return {
      batch: confirmedBatch,
      reused: false,
      proofBatch,
    };
  } catch (error) {
    if (pendingBatch?.id) {
      const failedBatch = await mealBatchAnchorRepository.markFailed(pendingBatch.id, error.message);
      await persistBatchProofs({
        schoolId,
        serveDate,
        batchAnchor: failedBatch,
      });
      error.details = {
        ...(error.details || {}),
        batch: failedBatch,
      };
    }
    throw error;
  }
}

module.exports = {
  anchorDailyMealBatch,
};
