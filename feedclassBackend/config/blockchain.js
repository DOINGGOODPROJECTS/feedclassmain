const { loadEnv } = require("./env");

loadEnv();

function getBlockchainConfig() {
  // Backend relayer model:
  // the private key stays on the server and is used only for automated batch anchoring.
  return {
    rpcUrl: process.env.CELO_RPC_URL || "",
    privateKey: process.env.CELO_PRIVATE_KEY || "",
    contractAddress: process.env.CELO_MEAL_BATCH_CONTRACT_ADDRESS || "",
    network: process.env.CELO_NETWORK || "celo-sepolia",
    confirmations: Number(process.env.CELO_TX_CONFIRMATIONS || 1),
    retryCount: Number(process.env.BLOCKCHAIN_RETRY_COUNT || 3),
    retryDelayMs: Number(process.env.BLOCKCHAIN_RETRY_DELAY_MS || 1500),
  };
}

function validateBlockchainConfig(config = getBlockchainConfig()) {
  const missing = [];

  if (!config.rpcUrl) missing.push("CELO_RPC_URL");
  if (!config.privateKey) missing.push("CELO_PRIVATE_KEY");
  if (!config.contractAddress) missing.push("CELO_MEAL_BATCH_CONTRACT_ADDRESS");

  return {
    valid: missing.length === 0,
    missing,
    config,
  };
}

module.exports = { getBlockchainConfig, validateBlockchainConfig };
