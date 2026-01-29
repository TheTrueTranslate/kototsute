import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("../api/invites", () => ({
  listInvitesReceivedAll: async () => [],
  acceptInvite: async () => {},
  declineInvite: async () => {}
}));

const render = async () => {
  const { default: InvitesPage } = await import("./InvitesPage");
  return renderToString(
    React.createElement(MemoryRouter, null, React.createElement(InvitesPage))
  );
};

describe("InvitesPage", () => {
  it("renders invites header", async () => {
    const html = await render();
    expect(html).toContain("招待");
  });
});
