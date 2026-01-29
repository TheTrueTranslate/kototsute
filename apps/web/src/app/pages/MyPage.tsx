import { useEffect, useState } from "react";
import { updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { displayNameSchema } from "@kototsute/shared";
import { useAuth } from "../../features/auth/auth-provider";
import FormAlert from "../../features/shared/components/form-alert";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import { auth, db } from "../../features/shared/lib/firebase";
import styles from "../../styles/myPage.module.css";

type FormStatus = {
  type: "success" | "error";
  message: string;
};

export default function MyPage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [lastSavedName, setLastSavedName] = useState(user?.displayName ?? "");
  const [status, setStatus] = useState<FormStatus | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
    setLastSavedName(user?.displayName ?? "");
  }, [user?.displayName]);

  const saveDisplayName = async () => {
    setStatus(null);
    const parsed = displayNameSchema.safeParse(displayName);
    if (!parsed.success) {
      setStatus({
        type: "error",
        message: parsed.error.issues[0]?.message ?? "入力が不正です"
      });
      return;
    }
    if (!auth.currentUser) {
      setStatus({ type: "error", message: "ログイン情報が取得できません。再ログインしてください。" });
      return;
    }
    if (parsed.data === lastSavedName) {
      return;
    }
    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: parsed.data });
      await setDoc(
        doc(db, "profiles", auth.currentUser.uid),
        {
          uid: auth.currentUser.uid,
          displayName: parsed.data,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      setLastSavedName(parsed.data);
      setStatus({ type: "success", message: "表示名を更新しました。" });
    } catch (err: any) {
      setStatus({ type: "error", message: err?.message ?? "表示名の更新に失敗しました。" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className="text-title">マイページ</h1>
        <p className={styles.lead}>登録情報の確認とプロフィールの管理ができます。</p>
      </header>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>アカウント</div>
        <div className={styles.card}>
          {status ? <FormAlert variant={status.type}>{status.message}</FormAlert> : null}
          <div className={styles.row}>
            <span className={styles.label}>メールアドレス</span>
            <span className={styles.value}>{user?.email ?? "未設定"}</span>
          </div>
          <form
            className={styles.row}
            onSubmit={(event) => {
              event.preventDefault();
              void saveDisplayName();
            }}
          >
            <span className={styles.label}>表示名</span>
            <div className={styles.editRow}>
              <div className={styles.editField}>
                <Input
                  aria-label="表示名"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="例: 山田 太郎"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={saving || !displayName.trim() || displayName.trim() === lastSavedName.trim()}
              >
                {saving ? "更新中..." : "更新"}
              </Button>
            </div>
          </form>
          <div className={styles.row}>
            <span className={styles.label}>UID</span>
            <span className={styles.valueMono}>{user?.uid ?? "-"}</span>
          </div>
        </div>
      </div>

    </section>
  );
}
