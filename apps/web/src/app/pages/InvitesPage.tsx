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
import { useTranslation } from "react-i18next";

export default function InvitesPage() {
  const { t } = useTranslation();
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
      setError(err?.message ?? "invites.error.loadFailed");
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
      setError(err?.message ?? "invites.error.actionFailed");
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
        <Breadcrumbs items={[{ label: t("invites.title") }]} />
        <div className={styles.headerRow}>
          <h1 className="text-title">{t("invites.title")}</h1>
        </div>
      </header>

      {error ? <FormAlert variant="error">{t(error)}</FormAlert> : null}

      {loading ? null : invites.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t("invites.empty.title")}</div>
          <div className={styles.emptyBody}>{t("invites.empty.body")}</div>
        </div>
      ) : (
        <div className={styles.list}>
          {invites.map((invite) => (
            <div key={invite.inviteId} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>
                  {t("invites.list.from", {
                    name:
                      invite.caseOwnerDisplayName ??
                      invite.ownerDisplayName ??
                      t("invites.list.inviterFallback")
                  })}
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
                      {t("invites.actions.decline")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleInviteAction(invite, "accept")}
                      disabled={processingInviteId === invite.inviteId}
                    >
                      {t("invites.actions.accept")}
                    </Button>
                  </div>
                ) : (
                  <span className={styles.statusBadge}>
                    {invite.status === "accepted"
                      ? t("invites.status.accepted")
                      : t("invites.status.declined")}
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
            <DialogTitle>{t("invites.dialog.decline.title")}</DialogTitle>
            <DialogDescription>
              {t("invites.dialog.decline.description", {
                name:
                  declineTarget?.caseOwnerDisplayName ??
                  declineTarget?.ownerDisplayName ??
                  t("invites.list.inviterFallback")
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("invites.dialog.decline.cancel")}
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={handleDecline}>
              {t("invites.dialog.decline.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
