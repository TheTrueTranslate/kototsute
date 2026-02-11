# Kototsute

## Service Overview
Kototsute is a service designed to provide tamper-resistant proof for common inheritance-process concerns, such as "Which version is the latest?" and "Was the application or receipt actually completed?"  
Personal information and full document bodies are handled off-chain, while XRPL stores only the minimum verifiable data (transaction hashes, verification transactions, and metadata required for state transitions).

### Main Users (4 Roles)
- Decedent: Creates and updates pre-death instructions (plans)
- Heir: Participates in case progression, document submission, and approval flows after death
- Financial Institution Staff: Handles case intake, progress, and completion
- Administrator: Reviews death claims, manages permissions, and supports audits

### Core MVP Features
- Case creation and member (heir) invitations
- Asset registration and wallet ownership verification
- Death claim submission and administrator review
- Asset Lock wallet creation and balance/holding checks
- SignerList setup and multi-signature approvals
- Distribution execution for XRP, issued tokens, and NFTs
- Status visibility for notifications, history, and audits

### Product Flow (Summary)
1. The decedent creates a case and configures assets, plans, and heirs.
2. Heirs verify wallets and submit a death claim.
3. Administrators review the death claim and, once approved, move to execution.
4. After Asset Lock and SignerList preparation, required signatures are collected and distribution is executed.
5. Case progress and outcomes are tracked through the API and UI.

## Technical Documentation ✅

### Technology Stack
- Monorepo: pnpm workspace
- Frontend: React + Vite + TypeScript (`apps/web`, `apps/admin`)
- Backend: Firebase Functions v2 + Hono + TypeScript (`apps/functions`)
- DB / Storage / Auth: Firestore / Firebase Storage / Firebase Auth
- Blockchain: XRPL (primarily configured for Testnet)
- Test: Vitest

### Repository Structure
```txt
apps/
  web/            # User-facing UI
  admin/          # Admin-facing UI
  functions/      # API (Firebase Functions + Hono)

packages/
  shared/         # Shared utilities, XRPL wrappers, and i18n
  asset/          # Asset domain
  case/           # Case domain
  plan/           # Plan domain
  death-attestation/
  credential/
  audit/
  internal/       # CLI tools (including XRPL operations)
  ui/
```

### Architecture Principles
- Keep `apps/*` as thin layers (UI / API entry points).
- Consolidate domain logic in `packages/*`.
- Place shared values, validations, and XRPL implementations in `packages/shared`.
- Keep Functions focused on authentication, validation, use-case invocation, and I/O orchestration.

### API Structure (`/v1`)
- `/assets`: Asset CRUD and owner-facing retrieval
- `/cases`: Case lifecycle operations (invites, death claims, asset lock, distribution, signatures)
- `/plans`: Plan creation, updates, and allocation settings
- `/invites`: Invitation management
- `/notifications`: Notification retrieval and read updates
- `/admin`: Administrator endpoints for death claim review and file download

### Local Development
Prerequisites:
- Node.js 20.x (aligned with `apps/functions` engines)
- pnpm
- go-task (`task` command)
- Firebase CLI

Setup:
```bash
pnpm install
cp apps/web/.env.example apps/web/.env
cp apps/admin/.env.example apps/admin/.env
cp apps/functions/.env.example apps/functions/.env
```

Start development:
```bash
task dev
```

Main commands:
```bash
# Full build (shared/case/functions/web)
task build

# Functions build (required when Functions are modified)
task functions:build

# Tests
pnpm -C apps/functions test
pnpm -C apps/web test
pnpm -C packages/shared test
```

### Security Notes
- Manage seeds and secrets in `.env`, and never commit them to Git.
- Use Firebase ID Tokens for authentication and verify them in Functions.
- Combine Firestore/Storage rules with server-side permission checks.

## XRPL Features Used ✅

### Network Configuration
- XRPL Testnet is used by default.
  - JSON-RPC: `https://s.altnet.rippletest.net:51234`
  - WebSocket: `wss://s.altnet.rippletest.net:51233`
- Both Functions and Web can switch endpoints via environment variables.

### Main Transactions in Use
| Type | Purpose | Main Implementation |
| --- | --- | --- |
| `Payment` (XRP) | Wallet verification, pre-funding, and distribution transfers | `packages/shared/src/xrpl/xrpl-wallet.ts`, `apps/functions/src/api/routes/cases.ts` |
| `Payment` (Issued Token) | Issued token distribution | `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `SignerListSet` | Signer list setup for distribution wallets | `packages/shared/src/xrpl/xrpl-wallet.ts`, `apps/functions/src/api/utils/inheritance-execution.ts` |
| `SetRegularKey` | Clear RegularKey after execution | `packages/shared/src/xrpl/xrpl-wallet.ts`, `apps/functions/src/api/routes/cases.ts` |
| `NFTokenCreateOffer` | Create sell offers for NFT distribution | `packages/shared/src/xrpl/xrpl-wallet.ts`, `apps/functions/src/api/routes/cases.ts` |

### Main XRPL RPC Commands in Use
| Command | Purpose | Implementation |
| --- | --- | --- |
| `wallet_propose` | Generate wallets for Asset Lock | `apps/functions/src/api/routes/cases.ts` |
| `account_info` | Check account activation, balance, and RegularKey | `apps/functions/src/api/utils/xrpl.ts` |
| `account_lines` | Check held tokens | `apps/functions/src/api/utils/xrpl.ts` |
| `account_nfts` | Check held NFTs | `apps/functions/src/api/utils/xrpl.ts` |
| `server_state` | Reference reserve values and validated ledger state | `apps/functions/src/api/utils/xrpl.ts` |
| `tx` | Verify validation transactions | `apps/functions/src/api/utils/xrpl.ts` |
| `submit_multisigned` | Submit multi-signed transactions | `apps/functions/src/api/utils/xrpl-multisign.ts` |
| `nft_sell_offers` | Resolve NFT offer IDs | `packages/shared/src/xrpl/xrpl-wallet.ts` |

### Implemented XRPL Flows
- Ownership verification:
  - Server issues a challenge (Memo).
  - Client locally signs and sends a `Payment`.
  - Server validates Memo, sender, and destination using `tx`.
- Multi-signature approval:
  - Target `Payment` is generated with `autofill`.
  - Each signer creates a partial signature via `sign(tx, true)`.
  - Server combines signatures and submits with `submit_multisigned`.
- Distribution execution:
  - XRPL reserve and account states are checked.
  - XRP and issued token transfers, plus NFT sell offer creation, are executed sequentially.
  - Execution results (tx hash) are stored in the case.

### XRPL Features Used in Internal Tools
Run `task tools:xrpl` to start the CLI in `packages/internal` for assisted operations:
- XRP transfer
- NFT mint + transfer
- Issued token issuance + transfer

Main transactions used by internal tools:
| Type | Purpose | Main Implementation |
| --- | --- | --- |
| `Payment` (XRP) | XRP transfers from CLI | `packages/internal/src/cli/xrpl-actions.ts`, `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `TrustSet` | Prepare receipt of issued tokens | `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `Payment` (Issued Token) | Send issued tokens | `packages/internal/src/cli/xrpl-actions.ts`, `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `NFTokenMint` | Mint NFTs | `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `NFTokenCreateOffer` | Create offers for NFT transfer | `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `NFTokenAcceptOffer` | Accept NFT offers | `packages/shared/src/xrpl/xrpl-wallet.ts` |
