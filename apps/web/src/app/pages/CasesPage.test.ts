import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../features/auth/auth-provider", () => ({
  useAuth: () => ({ user: { displayName: "山田" }, loading: false })
}));

vi.mock("../api/cases", () => ({
  listCases: async () => ({ created: [], received: [] }),
  createCase: async () => ({
    caseId: "case-1",
    ownerUid: "owner",
    ownerDisplayName: "山田",
    stage: "DRAFT",
    assetLockStatus: "UNLOCKED",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01"
  })
}));

vi.mock("../api/invites", () => ({
  listInvitesReceivedAll: async () => [],
  acceptInvite: async () => {},
  declineInvite: async () => {}
}));

const render = async () => {
  const { default: CasesPage } = await import("./CasesPage");
  return renderToString(
    React.createElement(MemoryRouter, null, React.createElement(CasesPage))
  );
};

describe("CasesPage", () => {
  it("shows cases header", async () => {
    const html = await render();
    expect(html).toContain("ケース");
  });
});
