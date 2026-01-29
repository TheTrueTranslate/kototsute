import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createCase, listCases, type CaseSummary } from "../api/cases";
import {
  acceptInvite,
  declineInvite,
  listInvitesReceivedAll,
  type InviteListItem
} from "../api/invites";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import { Button } from "../../features/shared/components/ui/button";
import { useAuth } from "../../features/auth/auth-provider";
import styles from "../../styles/casesPage.module.css";

const statusLabels: Record<string, string> = {
  DRAFT: "下書き",
  WAITING: "相続待ち",
  IN_PROGRESS: "相続中",
  COMPLETED: "相続完了"
};

const formatDate = (value: string) => {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "-";
  }
};

export default function CasesPage() {
  const { user } = useAuth();
  const [created, setCreated] = useState<CaseSummary[]>([]);
  const [received, setReceived] = useState<CaseSummary[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<InviteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayName = useMemo(() => user?.displayName ?? "", [user]);

  const load = async () => {
    try {
      const [casesResult, invitesResult] = await Promise.all([
        listCases(),
        listInvitesReceivedAll().catch((err) => {
          if (err?.status === 401 || err?.message === "UNAUTHORIZED") {
            return [];
          }
          throw err;
        })
      ]);
      setCreated(casesResult.created ?? []);
      setReceived(casesResult.received ?? []);
      setReceivedInvites(invitesResult ?? []);
    } catch (err: any) {
      if (err?.status === 401 || err?.message === "UNAUTHORIZED") {
        setCreated([]);
        setReceived([]);
        setReceivedInvites([]);
        return;
      }
      setError(err?.message ?? "ケースの取得に失敗しました");
    } finally {
      setLoading(false);
      setInvitesLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resolveOwnerDisplayName = () => {
    const trimmed = displayName.trim();
    if (trimmed) return trimmed;
    if (user?.uid) return `ユーザー-${user.uid.slice(0, 6)}`;
    return "ユーザー";
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      if (!user) {
        setError("ログイン情報が取得できません。再ログインしてください。");
        return;
      }
      const createdCase = await createCase({ ownerDisplayName: resolveOwnerDisplayName() });
      setCreated([createdCase]);
    } catch (err: any) {
      setError(err?.message ?? "ケースの作成に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  const handleInviteAction = async (invite: InviteListItem, action: "accept" | "decline") => {
    setProcessingInviteId(invite.inviteId);
    setError(null);
    try {
      if (action === "accept") {
        await acceptInvite(invite.caseId, invite.inviteId);
      } else {
        await declineInvite(invite.caseId, invite.inviteId);
      }
      await load();
    } catch (err: any) {
      setError(err?.message ?? "招待の処理に失敗しました");
    } finally {
      setProcessingInviteId(null);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs items={[{ label: "ケース" }]} />
        <div className={styles.headerRow}>
          <h1 className="text-title">ケース</h1>
        </div>
      </header>
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>受け取った招待</h2>
        </div>
        {invitesLoading ? null : receivedInvites.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>まだ招待がありません</div>
            <div className={styles.emptyBody}>招待が届くとここに表示されます。</div>
          </div>
        ) : (
          <div className={styles.list}>
            {receivedInvites.map((invite) => (
              <div key={invite.inviteId} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>
                    {invite.caseOwnerDisplayName ?? invite.ownerDisplayName ?? "ケース招待"}
                  </div>
                  <div className={styles.rowMeta}>
                    関係:{" "}
                    {invite.relationLabel === "その他"
                      ? invite.relationOther ?? "その他"
                      : invite.relationLabel}
                  </div>
                </div>
                <div className={styles.rowSide}>
                  <span className={styles.statusBadge}>
                    {invite.status === "pending"
                      ? "未対応"
                      : invite.status === "accepted"
                        ? "承認済み"
                        : "辞退済み"}
                  </span>
                  {invite.status === "pending" ? (
                    <div className={styles.rowActions}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInviteAction(invite, "decline")}
                        disabled={processingInviteId === invite.inviteId}
                      >
                        辞退
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleInviteAction(invite, "accept")}
                        disabled={processingInviteId === invite.inviteId}
                      >
                        承認
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>作成したケース</h2>
        </div>
        {loading ? null : created.length === 0 ? (
          <div className={styles.centerAction}>
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? "作成中..." : "ケースを作成"}
            </Button>
          </div>
        ) : (
          <div className={styles.list}>
            {created.map((item) => (
              <Link key={item.caseId} to={`/cases/${item.caseId}`} className={styles.rowLink}>
                <div className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{item.ownerDisplayName}</div>
                    <div className={styles.rowMeta}>最終更新: {formatDate(item.updatedAt)}</div>
                  </div>
                  <div className={styles.rowSide}>
                    <span className={styles.statusBadge}>{statusLabels[item.stage] ?? item.stage}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>招待されたケース</h2>
        </div>
        {loading ? null : received.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>まだ招待がありません</div>
            <div className={styles.emptyBody}>招待されたケースがここに表示されます。</div>
          </div>
        ) : (
          <div className={styles.list}>
            {received.map((item) => (
              <Link key={item.caseId} to={`/cases/${item.caseId}`} className={styles.rowLink}>
                <div className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{item.ownerDisplayName}</div>
                    <div className={styles.rowMeta}>最終更新: {formatDate(item.updatedAt)}</div>
                  </div>
                  <div className={styles.rowSide}>
                    <span className={styles.statusBadge}>{statusLabels[item.stage] ?? item.stage}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
