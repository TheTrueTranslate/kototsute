import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  approveDeathClaim,
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

const toStorageDownloadUrl = (path?: string | null) => {
  if (!path) return null;
  if (!path.startsWith("cases/")) {
    return null;
  }
  return `https://firebasestorage.googleapis.com/v0/b/kototsute.appspot.com/o/${encodeURIComponent(
    path
  )}?alt=media`;
};

export const toClaimStatusLabel = (status: string) => {
  switch (status) {
    case "SUBMITTED":
      return "提出済み";
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

export default function ClaimDetailPage() {
  const { caseId, claimId } = useParams();
  const [detail, setDetail] = useState<AdminDeathClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

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

  if (!caseId || !claimId) {
    return <div className="card">不正なURLです。</div>;
  }

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
              <button className="button" onClick={handleApprove} disabled={approving}>
                {approving ? "承認中..." : "運営承認"}
              </button>
              <button className="button button-secondary" onClick={handleReject} disabled={rejecting}>
                {rejecting ? "差し戻し中..." : "差し戻し"}
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
                    {toStorageDownloadUrl(file.storagePath) ? (
                      <a
                        className="row-meta"
                        href={toStorageDownloadUrl(file.storagePath)!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ファイルを開く
                      </a>
                    ) : (
                      <div className="row-meta">閲覧リンクがありません。</div>
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
    </div>
  );
}
