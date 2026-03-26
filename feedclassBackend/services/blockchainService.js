const { ethers } = require("ethers");
const { mealBatchAnchorAbi } = require("../config/mealBatchAnchorAbi");
const { getBlockchainConfig, validateBlockchainConfig } = require("../config/blockchain");

class BlockchainService {
  constructor(config = getBlockchainConfig()) {
    this.config = config;
    this.provider = null;
    this.signer = null;
    this.contract = null;
  }

  getStatus() {
    return validateBlockchainConfig(this.config);
  }

  assertReady() {
    const status = this.getStatus();
    if (!status.valid) {
      throw new Error(`Blockchain config is incomplete: ${status.missing.join(", ")}`);
    }
  }

  getProvider() {
    this.assertReady();
    if (!this.provider) {
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    }
    return this.provider;
  }

  getSigner() {
    this.assertReady();
    if (!this.signer) {
      this.signer = new ethers.Wallet(this.config.privateKey, this.getProvider());
    }
    return this.signer;
  }

  getContract() {
    this.assertReady();
    if (!this.contract) {
      this.contract = new ethers.Contract(this.config.contractAddress, mealBatchAnchorAbi, this.getSigner());
    }
    return this.contract;
  }

  async retry(operation, label = "blockchain operation") {
    let lastError;

    for (let attempt = 1; attempt <= this.config.retryCount; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === this.config.retryCount) break;
        await new Promise((resolve) => setTimeout(resolve, this.config.retryDelayMs));
      }
    }

    throw new Error(`${label} failed after ${this.config.retryCount} attempts: ${lastError.message}`);
  }

  async submitAnchorTransaction({ merkleRoot, schoolId, date, mealCount }) {
    return this.retry(async () => {
      const contract = this.getContract();
      const tx = await contract.anchorMealBatch(merkleRoot, schoolId, date, BigInt(mealCount));
      return {
        txHash: tx.hash,
        nonce: tx.nonce,
      };
    }, "submit anchor transaction");
  }

  async waitForConfirmation(txHash) {
    return this.retry(async () => {
      const provider = this.getProvider();
      const receipt = await provider.waitForTransaction(txHash, this.config.confirmations);

      if (!receipt) {
        throw new Error(`Transaction ${txHash} was not confirmed.`);
      }

      return {
        txHash,
        blockNumber: receipt.blockNumber,
        status: receipt.status,
      };
    }, "wait for transaction confirmation");
  }

  async verifyBatch({ merkleRoot, schoolId, date, mealCount }) {
    return this.retry(async () => {
      const contract = this.getContract();
      return contract.verifyBatch(merkleRoot, schoolId, date, BigInt(mealCount));
    }, "verify batch");
  }

  async getAnchorEvents(fromBlock = 0, toBlock = "latest") {
    return this.retry(async () => {
      const contract = this.getContract();
      return contract.queryFilter("MealBatchAnchored", fromBlock, toBlock);
    }, "read anchor events");
  }
}

module.exports = { BlockchainService };
