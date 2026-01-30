import type { TodoMaster } from "./types.js";

export const todoMaster: TodoMaster = {
  owner: [
    {
      id: "owner.register-assets",
      description: "相続対象の資産を登録する"
    },
    {
      id: "owner.verify-assets",
      description: "資産ウォレットの所有確認を完了する"
    },
    {
      id: "owner.create-plan",
      description: "指図（分配プラン）を作成する"
    },
    {
      id: "owner.set-allocations",
      description: "配分が100%になるよう設定する"
    },
    {
      id: "owner.confirm-plan",
      description: "指図内容（資産・配分）を最終確認する"
    },
    {
      id: "owner.confirm-reserve",
      description: "準備金・手数料の差引ルールを確認する"
    },
    {
      id: "owner.confirm-flow",
      description: "相続発生後の解放フローを確認する"
    },
    {
      id: "owner.invite-heirs",
      description: "相続人を招待して承認を待つ"
    },
    {
      id: "owner.check-heir-wallets",
      description: "相続人のウォレット登録状況を確認する"
    },
    {
      id: "owner.lock-assets",
      description: "資産ロック方法（A/B）を確認して実行する"
    }
  ],
  heir: [
    {
      id: "heir.accept-invite",
      description: "招待を受諾する"
    },
    {
      id: "heir.register-wallet",
      description: "受取用ウォレットを登録する",
      requiresWallet: true
    },
    {
      id: "heir.verify-wallet",
      description: "ウォレットの所有確認を完了する",
      requiresWallet: true
    },
    {
      id: "heir.review-plan",
      description: "指図内容（資産・配分）を確認する"
    },
    {
      id: "heir.check-allocations",
      description: "自分の配分割合を確認する"
    },
    {
      id: "heir.confirm-reserve",
      description: "準備金・手数料の差引ルールを確認する"
    },
    {
      id: "heir.prepare-receive",
      description: "相続発生後の受取手順を確認する"
    }
  ]
};
