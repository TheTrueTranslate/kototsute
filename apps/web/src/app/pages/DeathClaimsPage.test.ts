import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useParams: () => ({ caseId: "case-1" }) };
});

vi.mock("../../features/auth/auth-provider", () => ({
  useAuth: () => ({ user: { uid: "heir_1" }, loading: false })
}));

vi.mock("../api/death-claims", () => ({
  getDeathClaim: async () => ({
    claim: null,
    files: [],
    confirmationsCount: 0,
    requiredCount: 0,
    confirmedByMe: false
  }),
  submitDeathClaim: async () => ({ claimId: "claim-1" }),
  createDeathClaimUploadRequest: async () => ({
    requestId: "req-1",
    uploadPath: "cases/case-1/death-claims/claim-1/req-1"
  }),
  finalizeDeathClaimFile: async () => ({ fileId: "file-1" }),
  confirmDeathClaim: async () => ({ confirmationsCount: 0, requiredCount: 0 })
}));

const render = async () => {
  const { default: DeathClaimsPage } = await import("./DeathClaimsPage");
  return renderToString(
    React.createElement(MemoryRouter, null, React.createElement(DeathClaimsPage))
  );
};

describe("DeathClaimsPage", () => {
  it("renders page title", async () => {
    const html = await render();
    expect(html).toContain("死亡診断書");
  });
});
