# FeedClass Blockchain Architecture

FeedClass uses the backend relayer model for blockchain anchoring.

## Chosen model

- Frontend: normal app UI only
- Backend: computes the daily Merkle root and submits the anchor transaction
- CELO: stores only proof data, never child PII

## Why this model fits FeedClass

- Meal anchoring is a system action, not a user wallet action
- School staff should not approve a MetaMask transaction for every batch
- Private keys stay on the backend only
- QR scans, payments, and subscriptions stay asynchronous from blockchain confirmation

## Config meaning

- `CELO_NETWORK`: target chain, currently `celo-sepolia`
- `CELO_RPC_URL`: CELO RPC endpoint used by the backend relayer
- `CELO_PRIVATE_KEY`: backend-only signer key, never exposed to the frontend
- `CELO_MEAL_BATCH_CONTRACT_ADDRESS`: deployed MealBatch contract

## Transaction flow

1. Meals are served and recorded in the operations database.
2. End-of-day batching computes a deterministic Merkle root.
3. Backend relayer submits `anchorMealBatch(...)` to the CELO contract.
4. Backend stores tx hash, block number, and confirmation state in MySQL.
5. Verification APIs and audit surfaces read from MySQL plus on-chain state.

## Not part of this model

- Frontend wallet connection for normal daily anchoring
- Private key in browser config
- On-chain storage of names, student IDs, phone numbers, or other PII
