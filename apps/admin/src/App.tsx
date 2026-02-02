import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./lib/firebase";
import LoginPage from "./pages/LoginPage";
import ClaimsPage from "./pages/ClaimsPage";
import ClaimDetailPage from "./pages/ClaimDetailPage";

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <div className="app-title">ことづて 管理</div>
            <div className="app-subtitle">死亡診断書の承認管理</div>
          </div>
          <button className="button button-secondary" onClick={() => signOut(auth)}>
            ログアウト
          </button>
        </div>
      </header>
      <main className="container">{children}</main>
    </div>
  );
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<ReturnType<typeof auth.currentUser> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      const token = await nextUser.getIdTokenResult();
      setIsAdmin(token.claims.admin === true);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const gate = useMemo(() => {
    if (loading) {
      return <div className="container">読み込み中...</div>;
    }
    if (!user) {
      return <LoginPage />;
    }
    if (!isAdmin) {
      return (
        <div className="container">
          <div className="card">
            <div className="card-title">権限がありません</div>
            <div className="muted">管理者権限が付与されたアカウントでログインしてください。</div>
          </div>
        </div>
      );
    }
    return null;
  }, [loading, user, isAdmin]);

  if (gate) return gate;

  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<ClaimsPage />} />
        <Route path="/claims/:caseId/:claimId" element={<ClaimDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <div className="app-footer">
        <Link to="/" className="muted-link">
          未承認一覧へ戻る
        </Link>
      </div>
    </AdminLayout>
  );
}
