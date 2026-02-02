import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(async () => ({ data: {} }))
}));

describe("admin death-claims api", () => {
  it("calls reject endpoint", async () => {
    const { rejectDeathClaim } = await import("./death-claims");
    const { apiFetch } = await import("../lib/api");
    await rejectDeathClaim("case-1", "claim-1", { note: "NG" });
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/death-claims/claim-1/admin-reject", {
      method: "POST",
      body: JSON.stringify({ note: "NG" })
    });
  });

  it("returns detail with case and file metadata", async () => {
    const { getDeathClaimDetail } = await import("./death-claims");
    const { apiFetch } = await import("../lib/api");
    vi.mocked(apiFetch).mockResolvedValueOnce({
      data: {
        claim: { claimId: "claim_1", status: "SUBMITTED", submittedByUid: "u1" },
        case: {
          caseId: "case_1",
          ownerDisplayName: "山田",
          stage: "WAITING",
          assetLockStatus: "LOCKED",
          memberCount: 2,
          createdAt: "2024-01-01T00:00:00.000Z"
        },
        files: [
          {
            fileId: "file_1",
            fileName: "doc.pdf",
            contentType: "application/pdf",
            size: 1000,
            storagePath: "cases/case_1/death-claims/claim_1/file_1",
            uploadedByUid: "u1",
            createdAt: "2024-01-02T00:00:00.000Z",
            downloadUrl: "https://storage.example.com/signed"
          }
        ]
      }
    });

    const result = await getDeathClaimDetail("case_1", "claim_1");
    expect(result.case.ownerDisplayName).toBe("山田");
    expect(result.files[0].storagePath).toContain("cases/");
    expect(result.files[0].downloadUrl).toBe("https://storage.example.com/signed");
  });

  it("downloads death claim file", async () => {
    const { apiFetch } = await import("../lib/api");
    vi.mocked(apiFetch).mockResolvedValueOnce({
      data: {
        fileName: "report.pdf",
        contentType: "application/pdf",
        dataBase64: "SGVsbG8="
      }
    });

    const { downloadDeathClaimFile } = await import("./death-claims");
    const result = await downloadDeathClaimFile("case-1", "claim-1", "file-1");

    expect(apiFetch).toHaveBeenCalledWith(
      "/v1/admin/death-claims/case-1/claim-1/files/file-1/download",
      { method: "GET" }
    );
    expect(result.fileName).toBe("report.pdf");
    expect(result.contentType).toBe("application/pdf");
    expect(result.dataBase64).toBe("SGVsbG8=");
  });
});
