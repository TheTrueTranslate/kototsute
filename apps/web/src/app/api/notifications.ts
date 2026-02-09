import { apiFetch } from "../../features/shared/lib/api";

export type NotificationItem = {
  notificationId: string;
  receiverUid: string;
  type: string;
  title: string;
  body: string;
  related:
    | {
        kind: string;
        id: string;
        caseId?: string;
        ownerDisplayName?: string;
      }
    | null;
  isRead: boolean;
  createdAt: string;
};

export const listNotifications = async () => {
  const result = await apiFetch("/v1/notifications", { method: "GET" });
  return result.data as NotificationItem[];
};

export const markNotificationRead = async (notificationId: string) => {
  await apiFetch(`/v1/notifications/${notificationId}/read`, { method: "POST" });
};

export const readAllNotifications = async () => {
  await apiFetch("/v1/notifications/read-all", { method: "POST" });
};
