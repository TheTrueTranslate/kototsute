import { describe, expect, it } from "vitest";
import { shouldCloseWalletDialogOnVerify } from "./wallet-dialog";

describe("shouldCloseWalletDialogOnVerify", () => {
  it("returns true when verify succeeded", () => {
    expect(shouldCloseWalletDialogOnVerify(true)).toBe(true);
  });
});
