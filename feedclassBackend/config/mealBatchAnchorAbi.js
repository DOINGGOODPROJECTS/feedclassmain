const mealBatchAnchorAbi = Object.freeze([
  "function anchorMealBatch(bytes32 merkleRoot, string schoolId, string date, uint256 mealCount) external returns (bytes32 batchId)",
  "function verifyBatch(bytes32 merkleRoot, string schoolId, string date, uint256 mealCount) external view returns (bool)",
  "event MealBatchAnchored(bytes32 indexed batchId, bytes32 indexed merkleRoot, string schoolId, string date, uint256 mealCount, address indexed anchoredBy)"
]);

module.exports = { mealBatchAnchorAbi };
