import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import { NotificationsTable, localizeNotificationContent } from "./NotificationsPage";

describe("NotificationsPage", () => {
  it("shows read action only for unread notifications", async () => {
    const html = renderToString(
      React.createElement(NotificationsTable, {
        notifications: [
          {
            notificationId: "n1",
            receiverUid: "u1",
            type: "",
            title: "未読通知",
            body: "本文",
            related: null,
            createdAt: "2024-01-01T00:00:00Z",
            isRead: false
          },
          {
            notificationId: "n2",
            receiverUid: "u1",
            type: "",
            title: "既読通知",
            body: "本文",
            related: null,
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

  it("localizes case invite notification content by type", () => {
    const html = renderToString(
      React.createElement(NotificationsTable, {
        notifications: [
          {
            notificationId: "n-case",
            receiverUid: "u1",
            type: "CASE_INVITE_SENT",
            title: "固定タイトル",
            body: "山田さんから招待が届きました。",
            related: null,
            createdAt: "2024-01-01T00:00:00Z",
            isRead: true
          }
        ],
        onRead: () => undefined
      })
    );
    expect(html).toContain("ケース招待が届きました");
    expect(html).toContain("山田さんからケース招待が届きました。");
  });

  it("falls back to raw title and body when type is unknown", () => {
    const result = localizeNotificationContent(
      {
        notificationId: "n-unknown",
        receiverUid: "u1",
        type: "UNKNOWN",
        title: "Raw title",
        body: "Raw body",
        related: null,
        isRead: false,
        createdAt: "2024-01-01T00:00:00Z"
      },
      (key) => key
    );
    expect(result.title).toBe("Raw title");
    expect(result.body).toBe("Raw body");
  });
});
