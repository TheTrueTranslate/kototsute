import { useEffect, useState } from "react";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import { Button } from "../../features/shared/components/ui/button";
import {
  listNotifications,
  markNotificationRead,
  readAllNotifications,
  type NotificationItem
} from "../api/notifications";
import styles from "../../styles/notificationsPage.module.css";
import { useTranslation } from "react-i18next";

const formatDate = (value?: string | null, locale?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(locale);
};

type NotificationsTableProps = {
  notifications: NotificationItem[];
  onRead: (notificationId: string) => void;
};

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const translateStoredValue = (value: string, t: TranslateFn) => {
  if (value.startsWith("notifications.")) {
    return t(value);
  }
  return value;
};

const resolveCaseInviteOwnerName = (notification: NotificationItem) => {
  const ownerFromRelated = notification.related?.ownerDisplayName;
  if (typeof ownerFromRelated === "string" && ownerFromRelated.trim()) {
    return ownerFromRelated.trim();
  }
  const matched = notification.body.match(/^(.+?)さんから招待が届きました。?$/);
  if (!matched) return null;
  return matched[1]?.trim() || null;
};

export const localizeNotificationContent = (notification: NotificationItem, t: TranslateFn) => {
  switch (notification.type) {
    case "INVITE_SENT":
      return {
        title: t("notifications.items.inviteSent.title"),
        body: t("notifications.items.inviteSent.body")
      };
    case "INVITE_ACCEPTED":
      return {
        title: t("notifications.items.inviteAccepted.title"),
        body: t("notifications.items.inviteAccepted.body")
      };
    case "INVITE_DECLINED":
      return {
        title: t("notifications.items.inviteDeclined.title"),
        body: t("notifications.items.inviteDeclined.body")
      };
    case "CASE_INVITE_SENT": {
      const ownerName =
        resolveCaseInviteOwnerName(notification) ??
        t("notifications.items.caseInviteSent.fallbackOwner");
      return {
        title: t("notifications.items.caseInviteSent.title"),
        body: t("notifications.items.caseInviteSent.body", { ownerName })
      };
    }
    default:
      return {
        title: translateStoredValue(notification.title, t),
        body: translateStoredValue(notification.body, t)
      };
  }
};

export function NotificationsTable({ notifications, onRead }: NotificationsTableProps) {
  const { t, i18n } = useTranslation();
  return (
    <div className={styles.table}>
      <div className={styles.tableHeader}>
        <div>{t("notifications.table.content")}</div>
        <div>{t("notifications.table.receivedAt")}</div>
        <div className={styles.tableHeaderAction}>{t("notifications.table.action")}</div>
      </div>
      {notifications.map((notification) => {
        const localized = localizeNotificationContent(notification, t);
        return (
        <div
          key={notification.notificationId}
          className={[styles.tableRow, notification.isRead ? "" : styles.rowUnread].filter(Boolean).join(" ")}
        >
          <div className={styles.cellMain}>
            <div className={styles.cellTitle}>{localized.title}</div>
            <div className={styles.cellBody}>{localized.body}</div>
          </div>
          <div className={styles.cellMeta}>
            {formatDate(notification.createdAt, i18n.language)}
          </div>
          <div className={styles.cellAction}>
            {notification.isRead ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRead(notification.notificationId)}
              >
                {t("notifications.actions.markRead")}
              </Button>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadNotifications = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await listNotifications();
      setNotifications(data);
    } catch (err: any) {
      setError(err?.message ?? "notifications.error.loadFailed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  const handleRead = async (notificationId: string) => {
    setError(null);
    try {
      await markNotificationRead(notificationId);
      await loadNotifications();
    } catch (err: any) {
      setError(err?.message ?? "notifications.error.markReadFailed");
    }
  };

  const handleReadAll = async () => {
    setError(null);
    try {
      await readAllNotifications();
      await loadNotifications();
    } catch (err: any) {
      setError(err?.message ?? "notifications.error.markAllFailed");
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs items={[{ label: t("notifications.title") }]} />
        <div className={styles.headerRow}>
          <h1 className="text-title">{t("notifications.title")}</h1>
          <div className={styles.headerActions}>
            <Button type="button" variant="outline" onClick={loadNotifications} disabled={loading}>
              {t("notifications.actions.reload")}
            </Button>
            <Button type="button" onClick={handleReadAll} disabled={notifications.length === 0}>
              {t("notifications.actions.markAll")}
            </Button>
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{t(error)}</FormAlert> : null}

      {notifications.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t("notifications.empty.title")}</div>
          <p className={styles.emptyBody}>{t("notifications.empty.body")}</p>
        </div>
      ) : (
        <NotificationsTable notifications={notifications} onRead={handleRead} />
      )}
    </section>
  );
}
