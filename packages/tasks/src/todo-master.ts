import type { TodoMaster } from "./types.js";

export const todoMaster: TodoMaster = {
  shared: [
    {
      id: "shared.confirm-plan",
      title: "指図内容を確認",
      description: "共有内容を最終確認する"
    }
  ],
  owner: [
    {
      id: "owner.register-assets",
      title: "資産を登録",
      description: "相続対象となる資産を登録する"
    }
  ],
  heir: [
    {
      id: "heir.register-wallet",
      title: "相続人ウォレットを登録",
      description: "受取用のウォレットを登録する",
      requiresWallet: true
    }
  ]
};
