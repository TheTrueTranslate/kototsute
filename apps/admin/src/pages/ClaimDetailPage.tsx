import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  approveDeathClaim,
  getDeathClaimDetail,
  type AdminDeathClaimDetail
} from "../api/death-claims";

const formatBytes = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ClaimDetailPage() {
  const { caseId, claimId } = useParams();
  const [detail, setDetail] = useState<AdminDeathClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

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

  if (!caseId || !claimId) {
    return <div className="card">不正なURLです。</div>;
  }

  return (
    <div className="card">
      <div className="card-title">申請詳細</div>
      <div className="muted">Case: {caseId}</div>
      <div className="muted">Claim: {claimId}</div>
      {error ? <div className="alert">{error}</div> : null}
      {loading ? (
        <div className="muted">読み込み中...</div>
      ) : detail ? (
        <>
          <div className="section">
            <div className="section-title">ステータス</div>
            <div className="badge">{detail.claim.status}</div>
          </div>
          <div className="section">
            <div className="section-title">提出ファイル</div>
            {detail.files.length === 0 ? (
              <div className="muted">ファイルがありません。</div>
            ) : (
              <div className="file-list">
                {detail.files.map((file) => (
                  <div key={file.fileId} className="file-row">
                    <div>
                      <div className="row-title">{file.fileName}</div>
                      <div className="row-meta">
                        {file.contentType} ・ {formatBytes(file.size)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="actions">
            <button className="button" onClick={handleApprove} disabled={approving}>
              {approving ? "承認中..." : "運営承認"}
            </button>
          </div>
        </>
      ) : (
        <div className="muted">詳細が見つかりません。</div>
      )}
    </div>
  );
}
