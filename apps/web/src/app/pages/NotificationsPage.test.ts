import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import { NotificationsTable } from "./NotificationsPage";

describe("NotificationsPage", () => {
  it("shows read action only for unread notifications", async () => {
    const html = renderToString(
      React.createElement(NotificationsTable, {
        notifications: [
          {
            notificationId: "n1",
            title: "未読通知",
            body: "本文",
            createdAt: "2024-01-01T00:00:00Z",
            isRead: false
          },
          {
            notificationId: "n2",
            title: "既読通知",
            body: "本文",
            createdAt: "2024-01-02T00:00:00Z",
            isRead: true
          }
        ],
        onRead: () => undefined
      })
    );
    const matches = html.match(/既読にする/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(html).not.toContain(">既読</button>");
  });
});
