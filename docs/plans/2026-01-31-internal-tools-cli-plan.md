# 内部CLIツール実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理者権限付与とXRPL操作を対話式CLIで実行できる内部ツールを追加する。

**Architecture:** `packages/internal` にCLIを新設し、XRPL共通処理は `packages/shared` に移動・拡張して再利用する。CLIは薄い入力層として実装し、ロジックは shared の関数で担保する。

**Tech Stack:** Node.js (ESM), TypeScript, vitest, prompts, firebase-admin, xrpl

---

### Task 1: XRPL共通モジュールをsharedへ移動

**Files:**
- Create: `packages/shared/src/xrpl/xrpl-wallet.ts`
- Create: `packages/shared/src/xrpl/xrpl-wallet.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json`
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`
- Delete: `apps/functions/src/api/utils/xrpl-wallet.ts`
- Delete: `apps/functions/src/api/utils/xrpl-wallet.test.ts`

**Step 1: Write the failing test (sharedの最小移植)**

```ts
import { describe, expect, it, vi } from "vitest";
import { sendXrpPayment } from "./xrpl-wallet.js";

vi.mock("xrpl", () => ({
  Client: class {
    connect = vi.fn();
    disconnect = vi.fn();
    autofill = vi.fn(async (tx) => tx);
    submit = vi.fn(async () => ({ result: { engine_result: "tesSUCCESS" } }));
  },
  Wallet: { fromSeed: vi.fn(() => ({ sign: () => ({ hash: "hash" }) })) }
}));

describe("xrpl-wallet", () => {
  it("sends XRP payment", async () => {
    const res = await sendXrpPayment({
      fromSeed: "seed",
      fromAddress: "rFrom",
      to: "rTo",
      amountDrops: "1000"
    });
    expect(res.txHash).toBe("hash");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C packages/shared test -- xrpl-wallet.test.ts`
Expected: FAIL with module not found

**Step 3: Write minimal implementation**

```ts
import { Client, Wallet } from "xrpl";
import { XRPL_URL } from "./xrpl.js";

const getXrplWsUrl = () => {
  const url = process.env.XRPL_WS_URL ?? XRPL_URL;
  if (url.startsWith("wss://") || url.startsWith("ws://")) return url;
  const parsed = new URL(url);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  if (parsed.port === "51234") parsed.port = "51233";
  return parsed.toString();
};

export const sendXrpPayment = async (input: {
  fromSeed: string;
  fromAddress: string;
  to: string;
  amountDrops: string;
}) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const wallet = Wallet.fromSeed(input.fromSeed);
    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: input.fromAddress,
      Destination: input.to,
      Amount: input.amountDrops
    });
    const signed = wallet.sign(prepared);
    const result = await client.submit(signed.tx_blob);
    const engineResult = result?.result?.engine_result;
    if (engineResult && !["tesSUCCESS", "terQUEUED"].includes(engineResult)) {
      throw new Error(`XRPL submit failed: ${engineResult}`);
    }
    return { txHash: signed.hash ?? result?.result?.tx_json?.hash ?? "" };
  } finally {
    await client.disconnect();
  }
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C packages/shared test -- xrpl-wallet.test.ts`
Expected: PASS

**Step 5: Add remaining existing functions (sendTokenPayment, sendSignerListSet) and update exports**

- 既存 `apps/functions/src/api/utils/xrpl-wallet.ts` の関数を同じAPIで移植。
- `packages/shared/src/index.ts` に `export * from "./xrpl/xrpl-wallet.js";` を追加。
- `packages/shared/package.json` に `xrpl` 依存を追加。

**Step 6: Update functions imports and tests**

- `apps/functions/src/api/routes/cases.ts` の import を `@kototsute/shared` に変更。
- `apps/functions/src/api/handler.test.ts` の `vi.mock("./utils/xrpl-wallet.js", ...)` を `vi.mock("@kototsute/shared", ...)` に変更。
- `apps/functions/src/api/utils/xrpl-wallet.ts` とテストを削除。

**Step 7: Run test to verify functions still pass**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/shared/src/xrpl/xrpl-wallet.ts packages/shared/src/xrpl/xrpl-wallet.test.ts packages/shared/src/index.ts packages/shared/package.json apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
rm apps/functions/src/api/utils/xrpl-wallet.ts apps/functions/src/api/utils/xrpl-wallet.test.ts
git add -u

git commit -m "XRPL共通モジュールをsharedへ移動"
```

---

### Task 2: XRPL共通モジュールの拡張（TrustSet / NFT / トークン発行）

**Files:**
- Modify: `packages/shared/src/xrpl/xrpl-wallet.ts`
- Modify: `packages/shared/src/xrpl/xrpl-wallet.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { issueAndSendToken, mintAndSendNft, setTrustLine } from "./xrpl-wallet.js";

const submit = vi.fn(async () => ({ result: { engine_result: "tesSUCCESS" } }));
const autofill = vi.fn(async (tx) => tx);

vi.mock("xrpl", () => ({
  Client: class {
    connect = vi.fn();
    disconnect = vi.fn();
    autofill = autofill;
    submit = submit;
    submitAndWait = vi.fn(async () => ({ result: { meta: { nftoken_id: "token" } } }));
    request = vi.fn(async () => ({ result: { account_nfts: [{ NFTokenID: "token" }] } }));
  },
  Wallet: { fromSeed: vi.fn(() => ({ sign: () => ({ tx_blob: "blob", hash: "hash" }) })) }
}));

describe("xrpl-wallet extras", () => {
  it("sets trust line", async () => {
    await setTrustLine({
      fromSeed: "seed",
      fromAddress: "rHolder",
      issuer: "rIssuer",
      currency: "USD",
      limit: "1000"
    });
    expect(autofill).toHaveBeenCalled();
  });

  it("issues and sends token", async () => {
    const res = await issueAndSendToken({
      issuerSeed: "seed",
      issuerAddress: "rIssuer",
      holderSeed: "holder",
      holderAddress: "rHolder",
      currency: "USD",
      amount: "10",
      trustLimit: "100"
    });
    expect(res.txHash).toBe("hash");
  });

  it("mints and sends NFT", async () => {
    const res = await mintAndSendNft({
      minterSeed: "seed",
      minterAddress: "rMinter",
      recipientSeed: "holder",
      recipientAddress: "rHolder",
      uri: "https://example.com/nft/1"
    });
    expect(res.txHash).toBe("hash");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -C packages/shared test -- xrpl-wallet.test.ts`
Expected: FAIL with missing functions

**Step 3: Implement minimal functions**

- `setTrustLine`: TrustSet を submit。
- `issueAndSendToken`: `setTrustLine` を呼び、issuer から holder に Payment。
- `mintAndSendNft`:
  1) NFTokenMint（URIはhex化、Flags: tfTransferable）
  2) NFTokenCreateOffer（Destination: recipient, Amount: "0"）
  3) NFTokenAcceptOffer（recipient seed で承認）

**Step 4: Run tests to verify they pass**

Run: `pnpm -C packages/shared test -- xrpl-wallet.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/xrpl/xrpl-wallet.ts packages/shared/src/xrpl/xrpl-wallet.test.ts

git commit -m "XRPL共通機能を拡張"
```

---

### Task 3: internal パッケージ作成（CLI基盤）

**Files:**
- Create: `packages/internal/package.json`
- Create: `packages/internal/tsconfig.json`
- Create: `packages/internal/src/index.ts`

**Step 1: Write failing test (空のパッケージテスト)**

```ts
import { describe, it, expect } from "vitest";
import { INTERNAL_PACKAGE } from "./index.js";

describe("internal", () => {
  it("exports sentinel", () => {
    expect(INTERNAL_PACKAGE).toBe("internal");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C packages/internal test`
Expected: FAIL (package not found)

**Step 3: Implement minimal package**

- `package.json`: `private: true`, `type: "module"`, `scripts` は `build`/`test`。
- `tsconfig.json`: `../../tsconfig.base.json` を extends。
- `src/index.ts`: `export const INTERNAL_PACKAGE = "internal";` を追加。
- 依存に `prompts`, `firebase-admin`, `xrpl` を追加。

**Step 4: Run test to verify it passes**

Run: `pnpm -C packages/internal test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/internal

git commit -m "internalパッケージを追加"
```

---

### Task 4: 管理者付与CLI（エミュレータ専用）

**Files:**
- Create: `packages/internal/src/cli/admin-actions.ts`
- Create: `packages/internal/src/cli/admin-actions.test.ts`
- Create: `packages/internal/src/cli/admin.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { grantAdminByEmail } from "./admin-actions.js";

const getUserByEmail = vi.fn(async () => ({ uid: "uid" }));
const setCustomUserClaims = vi.fn(async () => undefined);

vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => [])
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ getUserByEmail, setCustomUserClaims })
}));

describe("admin actions", () => {
  it("grants admin claim", async () => {
    await grantAdminByEmail({ email: "a@example.com", projectId: "kototsute" });
    expect(setCustomUserClaims).toHaveBeenCalledWith("uid", { admin: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C packages/internal test -- admin-actions.test.ts`
Expected: FAIL with missing file

**Step 3: Implement minimal functions**

- `grantAdminByEmail` は `FIREBASE_AUTH_EMULATOR_HOST` を自動設定。
- `initializeApp({ projectId })` → `getAuth()` → `getUserByEmail` → `setCustomUserClaims`。
- 既に `admin: true` の場合は noop。

**Step 4: Run test to verify it passes**

Run: `pnpm -C packages/internal test -- admin-actions.test.ts`
Expected: PASS

**Step 5: CLI entry**

- `packages/internal/src/cli/admin.ts` で `prompts` を使いメール入力を受け取って `grantAdminByEmail` を呼ぶ。

**Step 6: Commit**

```bash
git add packages/internal/src/cli/admin-actions.ts packages/internal/src/cli/admin-actions.test.ts packages/internal/src/cli/admin.ts

git commit -m "管理者付与CLIを追加"
```

---

### Task 5: XRPL CLI（送金 / NFT / トークン発行）

**Files:**
- Create: `packages/internal/src/cli/xrpl-actions.ts`
- Create: `packages/internal/src/cli/xrpl-actions.test.ts`
- Create: `packages/internal/src/cli/xrpl.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { runXrpTransfer } from "./xrpl-actions.js";

vi.mock("@kototsute/shared", () => ({
  sendXrpPayment: vi.fn(async () => ({ txHash: "hash" }))
}));

describe("xrpl actions", () => {
  it("transfers XRP", async () => {
    const res = await runXrpTransfer({
      fromSeed: "seed",
      fromAddress: "rFrom",
      toAddress: "rTo",
      amountXrp: "1"
    });
    expect(res.txHash).toBe("hash");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C packages/internal test -- xrpl-actions.test.ts`
Expected: FAIL with missing file

**Step 3: Implement minimal actions**

- `runXrpTransfer`: `xrpToDrops` を使い `sendXrpPayment` を呼ぶ。
- `runNftMintSend`: `mintAndSendNft` を呼ぶ。
- `runTokenIssueSend`: `issueAndSendToken` を呼ぶ。

**Step 4: Run test to verify it passes**

Run: `pnpm -C packages/internal test -- xrpl-actions.test.ts`
Expected: PASS

**Step 5: CLI entry**

- `packages/internal/src/cli/xrpl.ts` でメニューを表示し、
  - XRP送金: seed/from/to/amountXrp を取得
  - NFT: minter seed/address, recipient seed/address, uri を取得
  - Token: issuer/holder seed+address, currency, amount, trust limit を取得
- 入力は `prompts` の `password` タイプを使い非表示入力にする。

**Step 6: Commit**

```bash
git add packages/internal/src/cli/xrpl-actions.ts packages/internal/src/cli/xrpl-actions.test.ts packages/internal/src/cli/xrpl.ts

git commit -m "XRPL操作CLIを追加"
```

---

### Task 6: Taskfileの起動コマンド追加

**Files:**
- Modify: `Taskfile.yml`

**Step 1: Update Taskfile**

```yaml
  tools:admin:
    desc: "Run admin grant tool"
    cmds:
      - pnpm -C packages/internal build
      - node packages/internal/dist/cli/admin.js

  tools:xrpl:
    desc: "Run XRPL tool"
    cmds:
      - pnpm -C packages/internal build
      - node packages/internal/dist/cli/xrpl.js
```

**Step 2: Commit**

```bash
git add Taskfile.yml

git commit -m "内部ツール起動タスクを追加"
```

---

### Task 7: Functions build 実行

**Step 1: Run build**

Run: `task functions:build`
Expected: PASS

**Step 2: Commit (if build artifacts are produced, do not commit them)**

No commit needed unless new source changes are required.
