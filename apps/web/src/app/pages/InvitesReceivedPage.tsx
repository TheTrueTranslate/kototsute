import { useEffect, useMemo, useState } from "react";
import { acceptInvite, declineInvite, listInvitesReceived, type InviteListItem } from "../api/invites";
import FormAlert from "../../features/shared/components/form-alert";
import { Button } from "../../features/shared/components/ui/button";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import styles from "../../styles/invitesPage.module.css";

const statusLabels: Record<string, string> = {
  pending: "招待中",
  accepted: "受諾済み",
  declined: "辞退"
};

const formatRelation = (invite: InviteListItem) => {
  if (invite.relationLabel === "その他" && invite.relationOther) {
    return `${invite.relationLabel}（${invite.relationOther}）`;
  }
  return invite.relationLabel;
};

export default function InvitesReceivedPage() {
  const [invites, setInvites] = useState<InviteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadInvites = async () => {
    setLoading(true);
    try {
      const data = await listInvitesReceived();
      setInvites(data);
    } catch (err: any) {
      if (err?.status === 401 || err?.message === "UNAUTHORIZED") {
        setInvites([]);
        return;
      }
      setError(err?.message ?? "招待一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvites();
  }, []);

  const handleAccept = async (inviteId: string) => {
    setError(null);
    setSuccess(null);
    try {
      await acceptInvite(inviteId);
      setSuccess("招待を受諾しました。");
      await loadInvites();
    } catch (err: any) {
      setError(err?.message ?? "招待の受諾に失敗しました");
    }
  };

  const handleDecline = async (inviteId: string) => {
    setError(null);
    setSuccess(null);
    try {
      await declineInvite(inviteId);
      setSuccess("招待を辞退しました。");
      await loadInvites();
    } catch (err: any) {
      setError(err?.message ?? "招待の辞退に失敗しました");
    }
  };

  const sortedInvites = useMemo(
    () =>
      [...invites].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [invites]
  );

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: "相続人", href: "/invites" },
            { label: "招待" }
          ]}
        />
        <div className={styles.headerRow}>
          <h1 className="text-title">招待</h1>
          <Button type="button" variant="outline" onClick={loadInvites}>
            更新
          </Button>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {success ? <FormAlert variant="success">{success}</FormAlert> : null}

      {loading ? null : sortedInvites.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>まだ招待が届いていません</div>
          <div className={styles.emptyBody}>招待が届くとここに表示されます。</div>
        </div>
      ) : (
        <div className={styles.list}>
          {sortedInvites.map((invite) => (
            <div key={invite.inviteId} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>{formatRelation(invite)}</div>
                  <div className={styles.rowSub}>
                  送信者: {invite.ownerEmail ?? "不明"}
                  </div>
                  {invite.memo ? <div className={styles.rowMetaText}>{invite.memo}</div> : null}
                </div>
              <div className={styles.rowSide}>
                <div className={styles.metaRow}>
                  <span className={styles.statusBadge}>
                    {statusLabels[invite.status] ?? "招待中"}
                  </span>
                  <span className={styles.meta}>
                    {new Date(invite.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className={styles.actions}>
                  {invite.status === "pending" ? (
                    <>
                      <Button type="button" onClick={() => handleAccept(invite.inviteId)}>
                        受諾する
                      </Button>
                      <Button
                        type="button"
                        variant="outlineDestructive"
                        onClick={() => handleDecline(invite.inviteId)}
                      >
                        辞退する
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
