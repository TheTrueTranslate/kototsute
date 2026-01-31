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

type DeathClaimsPageProps = {
  initialClaim?: DeathClaimSummary | null;
  initialLoading?: boolean;
};

export default function DeathClaimsPage({
  initialClaim = null,
  initialLoading
}: DeathClaimsPageProps) {
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

  const hasClaim = Boolean(claim?.claim);
  const canUpload = claim?.claim?.status === "SUBMITTED";
  const canConfirm = claim?.claim?.status === "ADMIN_APPROVED" && !claim?.confirmedByMe;
  const isRejected = claim?.claim?.status === "ADMIN_REJECTED";

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

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
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
            {claim?.confirmedByMe ? (
              <div className={styles.muted}>あなたは同意済みです。</div>
            ) : canConfirm ? (
              <Button type="button" onClick={handleConfirm} disabled={confirming}>
                {confirming ? "同意中..." : "同意する"}
              </Button>
            ) : isRejected ? (
              <div className={styles.rejected}>
                <div className={styles.rejectedTitle}>差し戻し</div>
                <div className={styles.rejectedBody}>
                  {claim?.claim?.adminReview?.note ?? "運営から差し戻しされました。"}
                </div>
                <Button type="button" onClick={handleResubmit} disabled={resubmitting}>
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
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.muted}>提出済みのファイルはありません。</div>
          )}

          {canUpload ? (
            <div className={styles.form}>
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
          ) : (
            <div className={styles.muted}>運営承認後はファイルを追加できません。</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
