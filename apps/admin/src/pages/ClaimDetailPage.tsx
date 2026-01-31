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
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);

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
                    {file.fileId ? (
                      <button
                        className="row-meta"
                        type="button"
                        onClick={() => handleOpenFile(file.fileId)}
                        disabled={openingFileId === file.fileId}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "#2563eb",
                          cursor: "pointer",
                          font: "inherit"
                        }}
                      >
                        {openingFileId === file.fileId ? "取得中..." : "ファイルを開く"}
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
    </div>
  );
}
