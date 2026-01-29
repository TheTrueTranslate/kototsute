import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { inviteCreateSchema, relationOptions } from "@kototsute/shared";
import { createInvite, deleteInvite, listInvitesByOwner, type InviteListItem } from "../api/invites";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import { Button } from "../../features/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../../features/shared/components/ui/dialog";
import { Input } from "../../features/shared/components/ui/input";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import styles from "../../styles/invitesPage.module.css";

const statusLabels: Record<string, string> = {
  pending: "招待中",
  accepted: "受諾済み",
  declined: "辞退"
};

type FormValues = z.infer<typeof inviteCreateSchema>;

const formatRelation = (invite: InviteListItem) => {
  if (invite.relationLabel === "その他" && invite.relationOther) {
    return `${invite.relationLabel}（${invite.relationOther}）`;
  }
  return invite.relationLabel;
};

export default function InvitesPage() {
  const [invites, setInvites] = useState<InviteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InviteListItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const {
    register,
    handleSubmit,
    formState,
    watch,
    reset,
    setValue
  } = useForm<FormValues>({
    resolver: zodResolver(inviteCreateSchema),
    defaultValues: {
      relationLabel: relationOptions[0]
    }
  });

  const relationLabel = watch("relationLabel");

  useEffect(() => {
    if (relationLabel !== "その他") {
      setValue("relationOther", "");
    }
  }, [relationLabel, setValue]);

  const loadInvites = async () => {
    setLoading(true);
    try {
      const data = await listInvitesByOwner();
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

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setFormSuccess(null);
    try {
      await createInvite(values);
      setFormSuccess("招待を作成しました。");
      reset({
        email: "",
        relationLabel: values.relationLabel,
        relationOther: "",
        memo: ""
      });
      setModalOpen(false);
      await loadInvites();
    } catch (err: any) {
      setFormError(err?.message ?? "招待の作成に失敗しました");
    }
  });

  const handleResend = async (invite: InviteListItem) => {
    setError(null);
    setSuccess(null);
    try {
      await createInvite({
        email: invite.email,
        relationLabel: invite.relationLabel,
        relationOther: invite.relationOther ?? undefined,
        memo: invite.memo ?? undefined
      });
      setSuccess("再招待を送信しました。");
      await loadInvites();
    } catch (err: any) {
      setError(err?.message ?? "再招待に失敗しました");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteInvite(deleteTarget.inviteId);
      setSuccess("招待を削除しました。");
      setDeleteOpen(false);
      setDeleteTarget(null);
      await loadInvites();
    } catch (err: any) {
      setError(err?.message ?? "招待の削除に失敗しました");
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
        <Breadcrumbs items={[{ label: "相続人" }]} />
        <div className={styles.headerRow}>
          <h1 className="text-title">相続人</h1>
          <div className={styles.actions}>
            <Button type="button" variant="outline" onClick={loadInvites}>
              更新
            </Button>
            <Dialog
              open={modalOpen}
              onOpenChange={(next) => {
                setModalOpen(next);
                if (next) {
                  setFormError(null);
                  setFormSuccess(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button type="button">新規招待</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>相続人を招待</DialogTitle>
                  <DialogDescription>
                    メールアドレスと関係を入力して招待を作成します。
                  </DialogDescription>
                </DialogHeader>
                <form className={styles.form} onSubmit={onSubmit}>
                  {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
                  {formSuccess ? <FormAlert variant="success">{formSuccess}</FormAlert> : null}
                  <FormField label="メールアドレス" error={formState.errors.email?.message}>
                    <Input type="email" autoComplete="email" {...register("email")} />
                  </FormField>

                  <div className={styles.fieldRow}>
                    <FormField label="関係" error={formState.errors.relationLabel?.message}>
                      <select className={styles.select} {...register("relationLabel")}>
                        {relationOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    {relationLabel === "その他" ? (
                      <FormField
                        label="その他の関係"
                        error={formState.errors.relationOther?.message}
                      >
                        <Input {...register("relationOther")} />
                      </FormField>
                    ) : null}
                  </div>

                  <FormField label="メモ" error={formState.errors.memo?.message}>
                    <textarea className={styles.textarea} {...register("memo")} />
                  </FormField>

                  <div className={styles.actions}>
                    <Button type="submit">招待する</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {success ? <FormAlert variant="success">{success}</FormAlert> : null}

      {loading ? null : sortedInvites.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>まだ招待がありません</div>
          <div className={styles.emptyBody}>上のフォームから相続人を招待できます。</div>
        </div>
      ) : (
        <div className={styles.list}>
          {sortedInvites.map((invite) => (
            <div key={invite.inviteId} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>{invite.email}</div>
                <div className={styles.rowSub}>{formatRelation(invite)}</div>
                {invite.memo ? <div className={styles.rowMetaText}>{invite.memo}</div> : null}
                <div className={styles.rowMetaRow}>
                  {invite.acceptedAt ? (
                    <span>受諾: {new Date(invite.acceptedAt).toLocaleDateString()}</span>
                  ) : null}
                  {invite.declinedAt ? (
                    <span>辞退: {new Date(invite.declinedAt).toLocaleDateString()}</span>
                  ) : null}
                </div>
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
                {invite.status === "declined" ? (
                  <div className={styles.actions}>
                    <Button type="button" variant="outline" onClick={() => handleResend(invite)}>
                      再招待する
                    </Button>
                    <Button
                      type="button"
                      variant="outlineDestructive"
                      onClick={() => {
                        setDeleteTarget(invite);
                        setDeleteOpen(true);
                      }}
                    >
                      削除
                    </Button>
                  </div>
                ) : invite.status === "pending" ? (
                  <div className={styles.actions}>
                    <Button
                      type="button"
                      variant="outlineDestructive"
                      onClick={() => {
                        setDeleteTarget(invite);
                        setDeleteOpen(true);
                      }}
                    >
                      削除
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={deleteOpen}
        onOpenChange={(next) => {
          setDeleteOpen(next);
          if (!next) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className={styles.confirmDialog}>
          <div className={styles.confirmBody}>
            <DialogHeader className={styles.confirmHeader}>
              <DialogTitle className={styles.confirmTitle}>招待を削除しますか？</DialogTitle>
              <DialogDescription className={styles.confirmDescription}>
                この操作は取り消せません
              </DialogDescription>
            </DialogHeader>
            {deleteTarget ? (
              <div className={styles.confirmMeta}>
                <div className={styles.confirmEmail}>{deleteTarget.email}</div>
                <div className={styles.confirmRelation}>{formatRelation(deleteTarget)}</div>
              </div>
            ) : null}
            <div className={styles.confirmActions}>
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                キャンセル
              </Button>
              <Button type="button" variant="outlineDestructive" onClick={handleDeleteConfirm}>
                削除
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
