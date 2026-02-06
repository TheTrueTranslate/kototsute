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

  it("calls PATCH /v1/cases/:caseId/invites/:inviteId", async () => {
    const { updateInvite } = await import("./invites");
    await updateInvite("case-1", "invite-1", {
      relationLabel: "長女",
      memo: "更新メモ"
    });
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/invites/invite-1", {
      method: "PATCH",
      body: JSON.stringify({
        relationLabel: "長女",
        memo: "更新メモ"
      })
    });
  });
});
