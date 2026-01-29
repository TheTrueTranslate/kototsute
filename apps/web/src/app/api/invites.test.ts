import { describe, it, expect, vi } from "vitest";

const apiFetchMock = vi.fn(async () => ({ ok: true, data: [] }));
vi.mock("../../features/shared/lib/api", () => ({ apiFetch: apiFetchMock }));

describe("invites api", () => {
  it("calls /v1/cases/:caseId/invites", async () => {
    const { listInvitesByOwner } = await import("./invites");
    await listInvitesByOwner("case-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/invites?scope=owner", {
      method: "GET"
    });
  });
});
