import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listPendingDeathClaims, type AdminDeathClaim } from "../api/death-claims";

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

export default function ClaimsPage() {
  const [items, setItems] = useState<AdminDeathClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listPendingDeathClaims();
        setItems(data);
      } catch (err: any) {
        setError(err?.message ?? "一覧の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <div className="card">
      <div className="card-title">未承認の死亡診断書</div>
      {error ? <div className="alert">{error}</div> : null}
      {loading ? (
        <div className="muted">読み込み中...</div>
      ) : items.length === 0 ? (
        <div className="muted">未承認の申請はありません。</div>
      ) : (
        <div className="table">
          {items.map((item) => (
            <Link
              key={`${item.caseId}:${item.claimId}`}
              to={`/claims/${item.caseId}/${item.claimId}`}
              className="row"
            >
              <div>
                <div className="row-title">Case: {item.caseId}</div>
                <div className="row-meta">申請者: {item.submittedByUid}</div>
              </div>
              <div className="row-meta">{formatDate(item.createdAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
