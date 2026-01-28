import { Link } from "react-router-dom";
import AuthLayout from "../../components/auth-layout";
import { Button } from "../../components/ui/button";
import styles from "../../styles/authPages.module.css";

type PageProps = {
  className?: string;
};

export default function HomePage({ className }: PageProps) {
  return (
    <AuthLayout
      title="ログイン後ホーム（仮）"
      lead="認証後に表示されるホームは現在準備中です。"
      className={className}
      footer={
        <div className={styles.footerActions}>
          <Button asChild variant="ghost">
            <Link to="/login">ログインへ戻る</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/register">新規登録</Link>
          </Button>
        </div>
      }
    >
      <div className={styles.placeholder}>
        <p>ここから被相続人が相続人を招待する導線を配置予定です。</p>
        <ul>
          <li>招待リンクの発行</li>
          <li>相続案件の一覧</li>
          <li>状況のタイムライン</li>
        </ul>
      </div>
    </AuthLayout>
  );
}
