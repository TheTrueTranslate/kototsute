import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import { storage } from "../../features/shared/lib/firebase";
import { useAuth } from "../../features/auth/auth-provider";
import {
  confirmDeathClaim,
  createDeathClaimUploadRequest,
  downloadDeathClaimFile,
  finalizeDeathClaimFile,
  getDeathClaim,
  resubmitDeathClaim,
  submitDeathClaim,
  type DeathClaimSummary
} from "../api/death-claims";
import styles from "../../styles/deathClaimsPage.module.css";

const statusLabels: Record<string, string> = {
  SUBMITTED: "提出済み",
  ADMIN_APPROVED: "運営承認済み",
  ADMIN_REJECTED: "差し戻し",
  CONFIRMED: "確定済み"
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const decodeBase64ToBytes = (dataBase64: string) => {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(dataBase64, "base64"));
  }
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const FileOpenIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h5V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-5h-2v5H5V5z"
      fill="currentColor"
    />
  </svg>
);

export type DeathClaimsPanelProps = {
  initialClaim?: DeathClaimSummary | null;
  initialLoading?: boolean;
  initialResubmitDialogOpen?: boolean;
  initialConfirmDialogOpen?: boolean;
  onClaimChange?: (claim: DeathClaimSummary | null) => void;
};

export function DeathClaimsPanel({
  initialClaim = null,
  initialLoading,
  initialResubmitDialogOpen = false,
  initialConfirmDialogOpen = false,
  onClaimChange
}: DeathClaimsPanelProps) {
  const { caseId } = useParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(initialLoading ?? !initialClaim);
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<DeathClaimSummary | null>(initialClaim);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [resubmitDialogOpen, setResubmitDialogOpen] = useState(initialResubmitDialogOpen);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(initialConfirmDialogOpen);

  const fetchClaim = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDeathClaim(caseId);
      setClaim(data);
    } catch (err: any) {
      setError(err?.message ?? "死亡診断書の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (!user || !caseId || initialClaim) return;
    void fetchClaim();
  }, [user, caseId, fetchClaim, initialClaim]);

  useEffect(() => {
    onClaimChange?.(claim);
  }, [claim, onClaimChange]);

  const handleSubmit = async () => {
    if (!caseId) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitDeathClaim(caseId);
      await fetchClaim();
    } catch (err: any) {
      setError(err?.message ?? "死亡診断書の提出に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async () => {
    if (!caseId || !claim?.claim?.claimId) return;
    if (selectedFiles.length === 0) {
      setError("アップロードするファイルを選択してください");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      for (const file of selectedFiles) {
        if (!file.type) {
          throw new Error("ファイル形式を判定できませんでした");
        }
        const request = await createDeathClaimUploadRequest(caseId, claim.claim.claimId, {
          fileName: file.name,
          contentType: file.type,
          size: file.size
        });
        const uploadRef = storageRef(storage, request.uploadPath);
        await uploadBytes(uploadRef, file, { contentType: file.type });
        await finalizeDeathClaimFile(caseId, claim.claim.claimId, request.requestId);
      }
      setSelectedFiles([]);
      await fetchClaim();
    } catch (err: any) {
      setError(err?.message ?? "ファイルのアップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!caseId || !claim?.claim?.claimId) return;
    setConfirming(true);
    setError(null);
    try {
      await confirmDeathClaim(caseId, claim.claim.claimId);
      await fetchClaim();
    } catch (err: any) {
      setError(err?.message ?? "同意に失敗しました");
    } finally {
      setConfirming(false);
    }
  };

  const openConfirmDialog = () => {
    setConfirmDialogOpen(true);
  };

  const handleConfirmDialogChange = (open: boolean) => {
    if (confirming) return;
    setConfirmDialogOpen(open);
  };

  const handleConfirmDialogConfirm = async () => {
    await handleConfirm();
    setConfirmDialogOpen(false);
  };

  const handleResubmit = async () => {
    if (!caseId || !claim?.claim?.claimId) return;
    setResubmitting(true);
    setError(null);
    try {
      await resubmitDeathClaim(caseId, claim.claim.claimId);
      await fetchClaim();
    } catch (err: any) {
      setError(err?.message ?? "再提出に失敗しました");
    } finally {
      setResubmitting(false);
    }
  };

  const openResubmitDialog = () => {
    setResubmitDialogOpen(true);
  };

  const handleResubmitDialogChange = (open: boolean) => {
    if (resubmitting) return;
    setResubmitDialogOpen(open);
  };

  const handleConfirmResubmit = async () => {
    await handleResubmit();
    setResubmitDialogOpen(false);
  };

  const handleOpenFile = async (fileId: string) => {
    if (!caseId || !claim?.claim?.claimId) return;
    setOpeningFileId(fileId);
    setError(null);
    try {
      const file = await downloadDeathClaimFile(caseId, claim.claim.claimId, fileId);
      if (!file.dataBase64) {
        throw new Error("ファイルの取得に失敗しました");
      }
      const bytes = decodeBase64ToBytes(file.dataBase64);
      const blob = new Blob([bytes], {
        type: file.contentType ?? "application/octet-stream"
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      setError(err?.message ?? "ファイルの取得に失敗しました");
    } finally {
      setOpeningFileId(null);
    }
  };

  const hasClaim = Boolean(claim?.claim);
  const canUploadFiles =
    claim?.claim?.status === "SUBMITTED" || claim?.claim?.status === "ADMIN_REJECTED";
  const canConfirm = claim?.claim?.status === "ADMIN_APPROVED" && !claim?.confirmedByMe;
  const isRejected = claim?.claim?.status === "ADMIN_REJECTED";
  const isConfirmed = claim?.claim?.status === "CONFIRMED";

  const currentAction = (() => {
    if (!hasClaim) {
      return {
        title: "現在のアクション",
        description: "死亡診断書を提出してください。",
        actionLabel: submitting ? "提出中..." : "死亡診断書を提出",
        onAction: handleSubmit,
        disabled: submitting
      };
    }
    if (isRejected) {
      return {
        title: "現在のアクション",
        description: "差し戻し内容を確認して再提出してください。",
        actionLabel: resubmitting ? "再提出中..." : "再提出",
        onAction: openResubmitDialog,
        disabled: resubmitting
      };
    }
    if (canConfirm) {
      return {
        title: "現在のアクション",
        description: "運営承認済みです。死亡確定への同意を進めてください。",
        actionLabel: confirming ? "同意中..." : "同意する",
        onAction: openConfirmDialog,
        disabled: confirming
      };
    }
    if (isConfirmed) {
      return {
        title: "現在のアクション",
        description: "死亡確定済みです。",
        actionLabel: null,
        onAction: null,
        disabled: false
      };
    }
    if (claim?.confirmedByMe) {
      return {
        title: "現在のアクション",
        description: "同意済みです。ほかの相続人の同意を待っています。",
        actionLabel: null,
        onAction: null,
        disabled: false
      };
    }
    if (canUploadFiles) {
      return {
        title: "現在のアクション",
        description: "運営確認中です。必要があればファイルを追加してください。",
        actionLabel: null,
        onAction: null,
        disabled: false
      };
    }
    return {
      title: "現在のアクション",
      description: "運営の確認を待っています。",
      actionLabel: null,
      onAction: null,
      disabled: false
    };
  })();
  const renderFileUploadForm = (testId: string) => (
    <div className={styles.form} data-testid={testId}>
      <FormField label="ファイルを追加">
        <Input
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            setSelectedFiles(files);
          }}
        />
      </FormField>
      <div className={styles.actions}>
        <Button type="button" onClick={handleUpload} disabled={uploading}>
          {uploading ? "アップロード中..." : "アップロード"}
        </Button>
      </div>
    </div>
  );

  const stepItems = [
    { id: "submit", label: "提出・ファイル追加" },
    { id: "review", label: "運営確認" },
    { id: "consent", label: "相続人同意" },
    { id: "confirmed", label: "確定" }
  ];
  const activeStepIndex = (() => {
    if (!claim?.claim) return 0;
    const status = claim.claim.status;
    if (status === "SUBMITTED" || status === "ADMIN_REJECTED") return 1;
    if (status === "ADMIN_APPROVED") return 2;
    if (status === "CONFIRMED") return 3;
    return 0;
  })();

  return (
    <>
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <div className={styles.panel}>
        <div className={styles.actionSummary}>
          <div className={styles.actionTitle}>{currentAction.title}</div>
          <div className={styles.actionBody}>{currentAction.description}</div>
          {currentAction.actionLabel && currentAction.onAction ? (
            <div className={styles.actionButtons}>
              <Button
                type="button"
                onClick={currentAction.onAction}
                disabled={currentAction.disabled}
              >
                {currentAction.actionLabel}
              </Button>
            </div>
          ) : null}
          {canUploadFiles ? renderFileUploadForm("death-claims-action-upload") : null}
        </div>
        <div className={`${styles.panelHeader} ${styles.panelHeaderSpaced}`}>
          <h2 className={styles.panelTitle}>申請ステータス</h2>
          {hasClaim ? (
            <span className={styles.statusBadge}>
              {statusLabels[claim?.claim?.status ?? ""] ?? claim?.claim?.status}
            </span>
          ) : null}
        </div>
        <div className={styles.steps}>
          {stepItems.map((step, index) => {
            const isActive = index === activeStepIndex;
            const isDone = index < activeStepIndex;
            return (
              <div
                key={step.id}
                className={`${styles.stepItem} ${isActive ? styles.stepActive : ""} ${
                  isDone ? styles.stepDone : ""
                }`}
              >
                <div className={styles.stepIndex}>{index + 1}</div>
                <div className={styles.stepLabel}>{step.label}</div>
              </div>
            );
          })}
        </div>
        {loading ? (
          <div className={styles.muted}>読み込み中...</div>
        ) : !hasClaim ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>まだ死亡診断書が提出されていません</div>
            <div className={styles.emptyBody}>
              提出後、運営承認と相続人同意で死亡確定となります。
            </div>
            <div className={styles.actions}>
              <Button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "提出中..." : "死亡診断書を提出"}
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.statusBody}>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>同意状況</span>
              <span className={styles.statusValue}>
                {claim?.confirmationsCount ?? 0}/{claim?.requiredCount ?? 0}
              </span>
            </div>
            {isConfirmed ? (
              <div className={styles.muted}>死亡確定済みです。</div>
            ) : claim?.confirmedByMe ? (
              <div className={styles.muted}>あなたは同意済みです。</div>
            ) : canConfirm ? (
              <Button type="button" onClick={openConfirmDialog} disabled={confirming}>
                {confirming ? "同意中..." : "同意する"}
              </Button>
            ) : isRejected ? (
              <div className={styles.rejected}>
                <div className={styles.rejectedTitle}>差し戻し</div>
                <div className={styles.rejectedBody}>
                  {claim?.claim?.adminReview?.note ?? "運営から差し戻しされました。"}
                </div>
                <Button type="button" onClick={openResubmitDialog} disabled={resubmitting}>
                  {resubmitting ? "再提出中..." : "再提出"}
                </Button>
              </div>
            ) : (
              <div className={styles.muted}>運営の承認後に同意できます。</div>
            )}
          </div>
        )}
      </div>

      {hasClaim ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>提出ファイル</h2>
            <span className={styles.note}>PDF/JPG/PNG（10MBまで、100件目安）</span>
          </div>
          {claim?.files?.length ? (
            <div className={styles.fileList}>
              {claim.files.map((file) => (
                <div key={file.fileId} className={styles.fileRow}>
                  <div>
                    <div className={styles.fileName}>{file.fileName}</div>
                    <div className={styles.fileMeta}>
                      {file.contentType} ・ {formatBytes(file.size)}
                    </div>
                  </div>
                  {file.fileId ? (
                    <div className={styles.fileActions}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenFile(file.fileId)}
                        disabled={openingFileId === file.fileId}
                        data-testid={`death-claims-file-open-${file.fileId}`}
                        aria-label={
                          openingFileId === file.fileId ? "ファイルを取得中" : "ファイルを開く"
                        }
                      >
                        <FileOpenIcon />
                        {openingFileId === file.fileId ? "取得中..." : "開く"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.muted}>提出済みのファイルはありません。</div>
          )}

          {canUploadFiles ? (
            renderFileUploadForm("death-claims-files-upload")
          ) : (
            <div className={styles.muted}>運営承認後はファイルを追加できません。</div>
          )}
        </div>
      ) : null}
      {confirmDialogOpen ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => handleConfirmDialogChange(false)}
        >
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalTitle}>同意の確認</div>
            <div className={styles.modalMessage}>
              この同意は死亡確定への同意です。相続の実行はこの操作では行われません。
            </div>
            <div className={styles.modalActions}>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleConfirmDialogChange(false)}
                disabled={confirming}
              >
                キャンセル
              </Button>
              <Button type="button" onClick={handleConfirmDialogConfirm} disabled={confirming}>
                {confirming ? "同意中..." : "同意する"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {resubmitDialogOpen ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => handleResubmitDialogChange(false)}
        >
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalTitle}>再提出の確認</div>
            <div className={styles.modalMessage}>
              差し戻し内容を確認した上で、死亡診断書を再提出しますか？
            </div>
            <div className={styles.modalActions}>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleResubmitDialogChange(false)}
                disabled={resubmitting}
              >
                キャンセル
              </Button>
              <Button type="button" onClick={handleConfirmResubmit} disabled={resubmitting}>
                {resubmitting ? "再提出中..." : "再提出する"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function DeathClaimsPage(props: DeathClaimsPanelProps) {
  const { caseId } = useParams();

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: "ケース", href: "/cases" },
            { label: "死亡診断書" }
          ]}
        />
        <div className={styles.headerRow}>
          <div>
            <h1 className="text-title">死亡診断書</h1>
            <p className={styles.lead}>提出書類の管理と相続人同意を行います。</p>
          </div>
          {caseId ? (
            <Button asChild variant="secondary" size="sm">
              <Link to={`/cases/${caseId}`}>ケース詳細へ戻る</Link>
            </Button>
          ) : null}
        </div>
      </header>
      <DeathClaimsPanel {...props} />
    </section>
  );
}
