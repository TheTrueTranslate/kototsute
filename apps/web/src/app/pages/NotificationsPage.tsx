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

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

type NotificationsTableProps = {
  notifications: NotificationItem[];
  onRead: (notificationId: string) => void;
};

export function NotificationsTable({ notifications, onRead }: NotificationsTableProps) {
  return (
    <div className={styles.table}>
      <div className={styles.tableHeader}>
        <div>内容</div>
        <div>受信日時</div>
        <div className={styles.tableHeaderAction}>操作</div>
      </div>
      {notifications.map((notification) => (
        <div
          key={notification.notificationId}
          className={[styles.tableRow, notification.isRead ? "" : styles.rowUnread].filter(Boolean).join(" ")}
        >
          <div className={styles.cellMain}>
            <div className={styles.cellTitle}>{notification.title}</div>
            <div className={styles.cellBody}>{notification.body}</div>
          </div>
          <div className={styles.cellMeta}>{formatDate(notification.createdAt)}</div>
          <div className={styles.cellAction}>
            {notification.isRead ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRead(notification.notificationId)}
              >
                既読にする
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotificationsPage() {
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
      setError(err?.message ?? "通知の取得に失敗しました");
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
      setError(err?.message ?? "既読更新に失敗しました");
    }
  };

  const handleReadAll = async () => {
    setError(null);
    try {
      await readAllNotifications();
      await loadNotifications();
    } catch (err: any) {
      setError(err?.message ?? "一括既読に失敗しました");
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs items={[{ label: "通知" }]} />
        <div className={styles.headerRow}>
          <h1 className="text-title">通知</h1>
          <div className={styles.headerActions}>
            <Button type="button" variant="outline" onClick={loadNotifications} disabled={loading}>
              再読み込み
            </Button>
            <Button type="button" onClick={handleReadAll} disabled={notifications.length === 0}>
              すべて既読
            </Button>
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      {notifications.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>通知はまだありません</div>
          <p className={styles.emptyBody}>招待や指図の更新があると表示されます。</p>
        </div>
      ) : (
        <NotificationsTable notifications={notifications} onRead={handleRead} />
      )}
    </section>
  );
}
