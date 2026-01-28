import { describe, it, expect } from "vitest";
import { XrplAnchorStub } from "./xrpl-anchor-stub.js";
import { Hash } from "../value/hash.js";

describe("XrplAnchorStub", () => {
  it("rejects anchorPlanHash", async () => {
    const stub = new XrplAnchorStub();
    await expect(stub.anchorPlanHash("plan_1", Hash.create("a1"))).rejects.toMatchObject({
      code: "XRPL_NOT_IMPLEMENTED"
    });
  });

  it("rejects anchorDeathAttestationHash", async () => {
    const stub = new XrplAnchorStub();
    await expect(
      stub.anchorDeathAttestationHash("att_1", Hash.create("a1"))
    ).rejects.toMatchObject({ code: "XRPL_NOT_IMPLEMENTED" });
  });
});
