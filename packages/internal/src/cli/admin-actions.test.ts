import { describe, expect, it, vi } from "vitest";
import { grantAdminByEmail } from "./admin-actions.js";

const getUserByEmail = vi.fn(async () => ({ uid: "uid" }));
const setCustomUserClaims = vi.fn(async () => undefined);

vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => [])
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ getUserByEmail, setCustomUserClaims })
}));

describe("admin actions", () => {
  it("grants admin claim", async () => {
    await grantAdminByEmail({ email: "a@example.com", projectId: "kototsute" });
    expect(setCustomUserClaims).toHaveBeenCalledWith("uid", { admin: true });
  });
});
