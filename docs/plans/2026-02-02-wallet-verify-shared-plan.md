# Wallet Verify Shared UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 資産/相続人のウォレット検証を共通の自動検証ロジックと共通UIで統一し、シークレット入力のみで検証できるようにする。

**Architecture:** `autoVerifyWalletOwnership` を `features/shared/lib` に集約し、資産/相続人は依存関数を注入して利用する。UIは `WalletVerifyPanel` に共通化し、Destination/Memo表示・説明文・シークレット入力・自動検証ボタンを統一する。

**Tech Stack:** React, TypeScript, CSS Modules, Vitest

**Notes:** このリポジトリは `git worktree` を使わない方針のため、現行ワークスペースで進める。

---

### Task 1: 共通自動検証ロジックのテストを作成する

**Files:**
- Create: `apps/web/src/features/shared/lib/wallet-verify.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { autoVerifyWalletOwnership } from "./wallet-verify";

describe("autoVerifyWalletOwnership", () => {
  it("requests challenge and confirms verification with tx hash", async () => {
    const requestChallenge = vi.fn().mockResolvedValue({
      challenge: "abc",
      address: "rVerify",
      amountDrops: "1"
    });
    const createPaymentTx = vi.fn().mockResolvedValue({ tx: "signed" });
    const signSingle = vi.fn().mockReturnValue({ blob: "blob", hash: "hash" });
    const submitSignedBlob = vi.fn().mockResolvedValue({ txHash: "txhash" });
    const confirmVerify = vi.fn().mockResolvedValue(undefined);

    const result = await autoVerifyWalletOwnership(
      {
        walletAddress: "rFrom",
        secret: "sSecret",
        challenge: null
      },
      {
        requestChallenge,
        createPaymentTx,
        signSingle,
        submitSignedBlob,
        confirmVerify
      }
    );

    expect(requestChallenge).toHaveBeenCalled();
    expect(createPaymentTx).toHaveBeenCalledWith({
      from: "rFrom",
      to: "rVerify",
      amount: "1",
      memoHex: "616263"
    });
    expect(signSingle).toHaveBeenCalledWith({ tx: "signed" }, "sSecret");
    expect(submitSignedBlob).toHaveBeenCalledWith("blob");
    expect(confirmVerify).toHaveBeenCalledWith("txhash");
    expect(result.txHash).toBe("txhash");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- wallet-verify.test.ts`
Expected: FAIL (`Cannot find module './wallet-verify'`)

---

### Task 2: 共通自動検証ロジックを実装する

**Files:**
- Create: `apps/web/src/features/shared/lib/wallet-verify.ts`

**Step 1: Write minimal implementation**

```ts
type VerifyChallenge = {
  challenge: string;
  address: string;
  amountDrops: string;
};

type AutoVerifyInput = {
  walletAddress: string;
  secret: string;
  challenge?: VerifyChallenge | null;
};

type AutoVerifyDeps = {
  requestChallenge: () => Promise<VerifyChallenge>;
  createPaymentTx: (input: {
    from: string;
    to: string;
    amount: string;
    memoHex?: string;
  }) => Promise<any>;
  signSingle: (tx: any, seed: string) => { blob: string; hash: string };
  submitSignedBlob: (blob: string) => Promise<{ txHash: string }>;
  confirmVerify: (txHash: string) => Promise<void>;
};

const encodeMemoHex = (memo: string) => {
  if (!memo) return "";
  const bytes = new TextEncoder().encode(memo);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

export const autoVerifyWalletOwnership = async (
  input: AutoVerifyInput,
  deps: AutoVerifyDeps
) => {
  const walletAddress = input.walletAddress.trim();
  const secret = input.secret.trim();
  if (!walletAddress) {
    throw new Error("アドレスが取得できません");
  }
  if (!secret) {
    throw new Error("シークレットを入力してください");
  }

  const challenge = input.challenge ?? (await deps.requestChallenge());
  const memoHex = encodeMemoHex(challenge.challenge ?? "");
  const tx = await deps.createPaymentTx({
    from: walletAddress,
    to: challenge.address,
    amount: challenge.amountDrops ?? "1",
    memoHex
  });
  const signed = deps.signSingle(tx, secret);
  const result = await deps.submitSignedBlob(signed.blob);
  await deps.confirmVerify(result.txHash);
  return { txHash: result.txHash, challenge };
};
```

**Step 2: Run test to verify it passes**

Run: `pnpm -C apps/web test -- wallet-verify.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/features/shared/lib/wallet-verify.ts apps/web/src/features/shared/lib/wallet-verify.test.ts
git commit -m "検証の共通ロジックを追加"
```

---

### Task 3: 共通UIコンポーネントのテストを作成する

**Files:**
- Create: `apps/web/src/features/shared/components/wallet-verify-panel.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { WalletVerifyPanel } from "./wallet-verify-panel";

vi.mock("./ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) =>
    React.createElement("button", props, children)
}));

vi.mock("./ui/input", () => ({
  Input: (props: Record<string, unknown>) => React.createElement("input", props)
}));

vi.mock("./form-field", () => ({
  default: ({ label, children }: { label: string; children: React.ReactNode }) =>
    React.createElement("label", null, label, children)
}));

describe("WalletVerifyPanel", () => {
  it("renders destination, memo, hints, and auto verify button", () => {
    const html = renderToString(
      React.createElement(WalletVerifyPanel, {
        destination: "rVerify",
        memo: "abc",
        secret: "sSecret",
        onSecretChange: () => undefined,
        onSubmit: () => undefined,
        isSubmitting: false,
        submitDisabled: false,
        secretDisabled: false
      })
    );

    expect(html).toContain("Destination（運営確認用ウォレット）");
    expect(html).toContain("送金先はシステムの検証用アドレスです");
    expect(html).toContain("1 drops (=0.000001 XRP)");
    expect(html).toContain("Memo");
    expect(html).toContain("シークレットで自動検証");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- wallet-verify-panel.test.ts`
Expected: FAIL (`Cannot find module './wallet-verify-panel'`)

---

### Task 4: 共通UIコンポーネントを実装する

**Files:**
- Create: `apps/web/src/features/shared/components/wallet-verify-panel.tsx`
- Create: `apps/web/src/features/shared/components/wallet-verify-panel.module.css`

**Step 1: Write minimal implementation**

```tsx
import FormField from "./form-field";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import styles from "./wallet-verify-panel.module.css";

type WalletVerifyPanelProps = {
  destination: string;
  memo: string;
  secret: string;
  onSecretChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitDisabled: boolean;
  secretDisabled: boolean;
};

export const WalletVerifyPanel = ({
  destination,
  memo,
  secret,
  onSecretChange,
  onSubmit,
  isSubmitting,
  submitDisabled,
  secretDisabled
}: WalletVerifyPanelProps) => {
  return (
    <div className={styles.panel}>
      <div className={styles.block}>
        <div className={styles.row}>
          <div>
            <div className={styles.label}>Destination（運営確認用ウォレット）</div>
            <div className={styles.value}>{destination}</div>
          </div>
        </div>
        <div className={styles.hint}>送金先はシステムの検証用アドレスです。</div>
        <div className={styles.row}>
          <div>
            <div className={styles.label}>Memo</div>
            <div className={styles.value}>{memo}</div>
          </div>
        </div>
        <div className={styles.hint}>1 drops (=0.000001 XRP) を送信します。</div>
      </div>

      <FormField label="シークレット">
        <Input
          type="password"
          value={secret}
          onChange={(event) => onSecretChange(event.target.value)}
          placeholder="s..."
          disabled={secretDisabled}
        />
      </FormField>
      <div className={styles.hint}>シークレットは一時的に利用し、保存しません。</div>
      <div className={styles.actions}>
        <Button size="sm" onClick={onSubmit} disabled={submitDisabled}>
          {isSubmitting ? "自動検証中..." : "シークレットで自動検証"}
        </Button>
      </div>
    </div>
  );
};
```

```css
.panel {
  @apply grid gap-3;
}

.block {
  @apply grid gap-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-4;
}

.row {
  @apply flex flex-wrap items-center justify-between gap-3;
}

.label {
  @apply text-meta text-muted-foreground;
}

.value {
  @apply break-all text-body text-foreground;
}

.hint {
  @apply text-body-sm text-muted-foreground;
}

.actions {
  @apply flex justify-end;
}
```

**Step 2: Run test to verify it passes**

Run: `pnpm -C apps/web test -- wallet-verify-panel.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/features/shared/components/wallet-verify-panel.tsx apps/web/src/features/shared/components/wallet-verify-panel.module.css apps/web/src/features/shared/components/wallet-verify-panel.test.ts
git commit -m "検証の共通UIを追加"
```

---

### Task 5: AssetDetailPage を共通ロジック/UIに切り替える

**Files:**
- Modify: `apps/web/src/app/pages/AssetDetailPage.tsx`
- Modify (if needed): `apps/web/src/app/pages/AssetDetailPage.test.ts`
- Delete (if unused): `apps/web/src/features/assets/asset-verify.ts`
- Delete (if unused): `apps/web/src/features/assets/asset-verify.test.ts`

**Step 1: Write the failing test (only if UI changes break)**

If the existing test fails after changes, update expectations to keep:
- "Destination（運営確認用ウォレット）"
- "システムの検証用アドレス"
- "1 drops (=0.000001 XRP)"
- No "TX Hash", "Destinationをコピー", "Memoをコピー"

**Step 2: Implement minimal changes**

- `autoVerifyAssetOwnership` を `autoVerifyWalletOwnership` に置き換え。
- `WalletVerifyPanel` を使って検証UIを共通化。

```tsx
import { WalletVerifyPanel } from "../../features/shared/components/wallet-verify-panel";
import { autoVerifyWalletOwnership } from "../../features/shared/lib/wallet-verify";
```

```ts
const result = await autoVerifyWalletOwnership(
  {
    walletAddress: asset.address,
    secret: verifySecret,
    challenge: resolveVerifyChallenge()
  },
  {
    requestChallenge: () => requestVerifyChallenge(caseId, assetId),
    createPaymentTx,
    signSingle,
    submitSignedBlob,
    confirmVerify: (txHash) => confirmVerify(caseId, assetId, txHash)
  }
);
```

```tsx
<WalletVerifyPanel
  destination={asset.verificationAddress}
  memo={memoDisplay}
  secret={verifySecret}
  onSecretChange={setVerifySecret}
  onSubmit={handleAutoVerify}
  isSubmitting={verifySending}
  submitDisabled={isLocked || verifySending || verifyChallengeLoading}
  secretDisabled={isLocked || verifySending}
/>
```

**Step 3: Run test to verify it passes**

Run: `pnpm -C apps/web test -- AssetDetailPage.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/app/pages/AssetDetailPage.tsx apps/web/src/app/pages/AssetDetailPage.test.ts apps/web/src/features/assets/asset-verify.ts apps/web/src/features/assets/asset-verify.test.ts
git commit -m "資産検証を共通化UIに変更"
```

---

### Task 6: CaseDetailPage を共通ロジック/UIに切り替える

**Files:**
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx`
- Modify: `apps/web/src/app/pages/CaseDetailPage.test.ts`

**Step 1: Write the failing test**

Update `CaseDetailPage.test.ts` test "shows copyable verification fields for heir wallet" to new expectations:

```ts
expect(html).toContain("Destination（運営確認用ウォレット）");
expect(html).toContain("システムの検証用アドレス");
expect(html).toContain("1 drops (=0.000001 XRP)");
expect(html).not.toContain("Amount (drops)");
expect(html).not.toContain("Amount (XRP)");
expect(html).not.toContain("取引ハッシュ");
expect(html).not.toContain("Destinationをコピー");
expect(html).not.toContain("Memoをコピー");
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- CaseDetailPage.test.ts`
Expected: FAIL (old UI still present)

**Step 3: Implement minimal changes**

- `WalletVerifyPanel` と `autoVerifyWalletOwnership` を導入。
- 手動送金/Tx Hash 入力の state と handler を削除。

```tsx
import { WalletVerifyPanel } from "../../features/shared/components/wallet-verify-panel";
import { autoVerifyWalletOwnership } from "../../features/shared/lib/wallet-verify";
```

```ts
const memoDisplay = heirWalletChallenge?.challenge ??
  (heirWalletVerifyLoading ? "発行中..." : "未発行");
const destinationDisplay = heirWalletChallenge?.address ?? "未発行";
```

```ts
const handleAutoVerifyHeirWallet = async () => {
  if (!caseId) {
    setHeirWalletVerifyError("ケースIDが取得できません");
    return;
  }
  if (!heirWallet?.address) {
    setHeirWalletVerifyError("ウォレットアドレスが取得できません");
    return;
  }
  setHeirWalletVerifyError(null);
  setHeirWalletVerifySuccess(null);
  setHeirWalletSending(true);
  try {
    const result = await autoVerifyWalletOwnership(
      {
        walletAddress: heirWallet.address,
        secret: heirWalletSecret,
        challenge: heirWalletChallenge
      },
      {
        requestChallenge: () => requestHeirWalletVerifyChallenge(caseId),
        createPaymentTx,
        signSingle,
        submitSignedBlob,
        confirmVerify: (txHash) => confirmHeirWalletVerify(caseId, txHash)
      }
    );
    setHeirWalletChallenge(result.challenge);
    setHeirWalletSecret("");
    const wallet = await getHeirWallet(caseId);
    setHeirWallet(wallet);
    setHeirWalletVerifySuccess("所有確認が完了しました");
    if (shouldCloseWalletDialogOnVerify(wallet?.verificationStatus === "VERIFIED")) {
      setWalletDialogOpen(false);
    }
  } catch (err: any) {
    setHeirWalletVerifyError(err?.message ?? "所有確認に失敗しました");
  } finally {
    setHeirWalletSending(false);
  }
};
```

```tsx
<WalletVerifyPanel
  destination={destinationDisplay}
  memo={memoDisplay}
  secret={heirWalletSecret}
  onSecretChange={setHeirWalletSecret}
  onSubmit={handleAutoVerifyHeirWallet}
  isSubmitting={heirWalletSending}
  submitDisabled={heirWalletSending || heirWalletVerifyLoading}
  secretDisabled={heirWalletSending}
/>
```

- `handleRequestHeirWalletChallenge` の送金関連リセットを削除。
- `encodeMemoHex` / `handleSendHeirWalletVerification` / `handleConfirmHeirWalletVerify` / `dropsInput` / `xrpInput` / `heirWalletTxHash` / `heirWalletSendError` / `heirWalletSendSuccess` を削除。
- `xrp-amount` の不要 import を削除。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- CaseDetailPage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/CaseDetailPage.tsx apps/web/src/app/pages/CaseDetailPage.test.ts
git commit -m "相続人検証を自動化UIに統一"
```

---

### Task 7: 影響範囲の確認テスト

**Files:**
- Test: `apps/web/src/app/pages/AssetDetailPage.test.ts`
- Test: `apps/web/src/app/pages/CaseDetailPage.test.ts`

**Step 1: Run tests**

Run:
- `pnpm -C apps/web test -- AssetDetailPage.test.ts`
- `pnpm -C apps/web test -- CaseDetailPage.test.ts`

Expected: PASS

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-02-02-wallet-verify-shared-plan.md`.

Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
