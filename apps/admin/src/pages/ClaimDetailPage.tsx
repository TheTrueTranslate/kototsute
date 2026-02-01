import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  approveDeathClaim,
  downloadDeathClaimFile,
  getDeathClaimDetail,
  rejectDeathClaim,
  type AdminDeathClaimDetail
} from "../api/death-claims";

const formatBytes = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ja-JP");
};

export const decodeBase64ToBytes = (dataBase64: string) => {
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

export const toClaimStatusLabel = (status: string) => {
  switch (status) {
    case "SUBMITTED":
      return "運営確認待ち";
    case "ADMIN_APPROVED":
      return "運営承認済み";
    case "ADMIN_REJECTED":
      return "差し戻し";
    case "CONFIRMED":
      return "死亡確定";
    default:
      return status;
  }
};

export const profileLabel = "被相続人プロフィール";

export type ReviewAction = "approve" | "reject";

export const getReviewModalCopy = (action: ReviewAction, note: string) => {
  if (action === "approve") {
    return {
      title: "運営承認の確認",
      message: "この申請を承認しますか？",
      confirmLabel: "承認する",
      noteLabel: null
    };
  }
  const trimmed = note.trim();
  return {
    title: "差し戻しの確認",
    message: "この申請を差し戻しますか？",
    confirmLabel: "差し戻す",
    noteLabel: trimmed ? `差し戻し理由: ${trimmed}` : "差し戻し理由: （未入力）"
  };
};

const FileOpenIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h5V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-5h-2v5H5V5z"
      fill="currentColor"
    />
  </svg>
);

export default function ClaimDetailPage() {
  const { caseId, claimId } = useParams();
  const [detail, setDetail] = useState<AdminDeathClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);

  const load = useCallback(async () => {
    if (!caseId || !claimId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDeathClaimDetail(caseId, claimId);
      setDetail(data);
    } catch (err: any) {
      setError(err?.message ?? "詳細の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [caseId, claimId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async () => {
    if (!caseId || !claimId) return;
    setApproving(true);
    setError(null);
    try {
      await approveDeathClaim(caseId, claimId);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "承認に失敗しました");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!caseId || !claimId) return;
    setRejecting(true);
    setError(null);
    try {
      await rejectDeathClaim(caseId, claimId, { note: rejectNote.trim() || null });
      await load();
    } catch (err: any) {
      setError(err?.message ?? "差し戻しに失敗しました");
    } finally {
      setRejecting(false);
    }
  };

  const handleOpenFile = async (fileId: string) => {
    if (!caseId || !claimId) return;
    setOpeningFileId(fileId);
    setError(null);
    try {
      const file = await downloadDeathClaimFile(caseId, claimId, fileId);
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

  const handleConfirmReview = async () => {
    if (!reviewAction) return;
    if (reviewAction === "approve") {
      await handleApprove();
    } else {
      await handleReject();
    }
    setReviewAction(null);
  };

  const handleCancelReview = () => {
    if (approving || rejecting) return;
    setReviewAction(null);
  };

  if (!caseId || !claimId) {
    return <div className="card">不正なURLです。</div>;
  }

  const reviewCopy = reviewAction ? getReviewModalCopy(reviewAction, rejectNote) : null;
  const reviewBusy = approving || rejecting;

  return (
    <div className="card">
      <div className="card-title">申請詳細</div>
      {error ? <div className="alert">{error}</div> : null}
      {loading ? (
        <div className="muted">読み込み中...</div>
      ) : detail ? (
        <>
          <div className="section">
            <div className="section-title">ステータス</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <div className="badge">{toClaimStatusLabel(detail.claim.status)}</div>
            </div>
            <div className="actions">
              <button
                className="button"
                onClick={() => setReviewAction("approve")}
                disabled={approving || rejecting}
              >
                運営承認
              </button>
              <button
                className="button button-secondary"
                onClick={() => setReviewAction("reject")}
                disabled={approving || rejecting}
              >
                差し戻し
              </button>
            </div>
            <label className="label">
              差し戻し理由
              <textarea
                className="input"
                rows={3}
                value={rejectNote}
                onChange={(event) => setRejectNote(event.target.value)}
                placeholder="差し戻し理由を入力してください"
              />
            </label>
          </div>
          <div className="section">
            <div className="section-title">{profileLabel}</div>
            {detail.case ? (
              <div className="muted">{detail.case.ownerDisplayName ?? "-"}</div>
            ) : (
              <div className="muted">ケース情報が取得できません。</div>
            )}
          </div>
          <div className="section">
            <div className="section-title">提出ファイル</div>
            {detail.files.length === 0 ? (
              <div className="muted">ファイルがありません。</div>
            ) : (
              <div className="file-list">
                {detail.files.map((file) => (
                  <div key={file.fileId} className="file-row">
                    <div className="row-title">{file.fileName}</div>
                    {file.fileId ? (
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => handleOpenFile(file.fileId)}
                        disabled={openingFileId === file.fileId}
                        aria-label={
                          openingFileId === file.fileId ? "ファイルを取得中" : "ファイルを開く"
                        }
                        title="ファイルを開く"
                      >
                        <FileOpenIcon />
                      </button>
                    ) : (
                      <div className="row-meta">閲覧できません。</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="muted">詳細が見つかりません。</div>
      )}
      {reviewAction && reviewCopy ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={handleCancelReview}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">{reviewCopy.title}</div>
            <div className="modal-message">{reviewCopy.message}</div>
            {reviewCopy.noteLabel ? (
              <div className="modal-note">{reviewCopy.noteLabel}</div>
            ) : null}
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={handleCancelReview}
                disabled={reviewBusy}
              >
                キャンセル
              </button>
              <button
                className="button"
                type="button"
                onClick={handleConfirmReview}
                disabled={reviewBusy}
              >
                {reviewBusy ? "処理中..." : reviewCopy.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
