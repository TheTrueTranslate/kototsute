import { useAuth } from "../auth/auth-provider";
import styles from "../../styles/myPage.module.css";

export default function MyPage() {
  const { user } = useAuth();

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className="text-title">マイページ</h1>
        <p className={styles.lead}>登録情報の確認とプロフィールの管理ができます。</p>
      </header>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>アカウント</div>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.label}>メールアドレス</span>
            <span className={styles.value}>{user?.email ?? "未設定"}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>UID</span>
            <span className={styles.valueMono}>{user?.uid ?? "-"}</span>
          </div>
        </div>
      </div>

    </section>
  );
}
