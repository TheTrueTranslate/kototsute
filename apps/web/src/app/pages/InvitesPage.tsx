import { useEffect, useState } from "react";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import { Button } from "../../features/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../features/shared/components/ui/dialog";
import {
  acceptInvite,
  declineInvite,
  listInvitesReceivedAll,
  type InviteListItem
} from "../api/invites";
import styles from "../../styles/casesPage.module.css";

export default function InvitesPage() {
  const [invites, setInvites] = useState<InviteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<InviteListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await listInvitesReceivedAll();
      setInvites(data ?? []);
    } catch (err: any) {
      if (err?.status === 401 || err?.message === "UNAUTHORIZED") {
        setInvites([]);
        return;
      }
      setError(err?.message ?? "招待の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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

  const handleDecline = async () => {
    if (!declineTarget) return;
    await handleInviteAction(declineTarget, "decline");
    setDeclineTarget(null);
  };

  return (
    <>
      <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs items={[{ label: "招待" }]} />
        <div className={styles.headerRow}>
          <h1 className="text-title">招待</h1>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      {loading ? null : invites.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>まだ招待がありません</div>
          <div className={styles.emptyBody}>招待が届くとここに表示されます。</div>
        </div>
      ) : (
        <div className={styles.list}>
          {invites.map((invite) => (
            <div key={invite.inviteId} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>
                  「{invite.caseOwnerDisplayName ?? invite.ownerDisplayName ?? "招待者"}」さんから
                  招待がきています。
                </div>
              </div>
              <div className={styles.rowSide}>
                {invite.status === "pending" ? (
                  <div className={styles.rowActions}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeclineTarget(invite)}
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
                ) : (
                  <span className={styles.statusBadge}>
                    {invite.status === "accepted" ? "参加中" : "辞退"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </section>
      <Dialog
        open={Boolean(declineTarget)}
        onOpenChange={(open) => (open ? null : setDeclineTarget(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>招待を辞退しますか？</DialogTitle>
            <DialogDescription>
              「
              {declineTarget?.caseOwnerDisplayName ?? declineTarget?.ownerDisplayName ?? "招待者"}
              」さんからの招待を辞退します。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                キャンセル
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={handleDecline}>
              辞退する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
