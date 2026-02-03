import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout from "../../features/shared/components/auth-layout";
import { Button } from "../../features/shared/components/ui/button";
import styles from "../../styles/authPages.module.css";

type PageProps = {
  className?: string;
};

export default function HomePage({ className }: PageProps) {
  const { t } = useTranslation();
  return (
    <AuthLayout
      title={t("home.title")}
      lead={t("home.lead")}
      className={className}
      footer={
        <div className={styles.footerActions}>
          <Button asChild variant="ghost">
            <Link to="/login">{t("home.footer.login")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/register">{t("home.footer.register")}</Link>
          </Button>
        </div>
      }
    >
      <div className={styles.placeholder}>
        <p>{t("home.placeholder.lead")}</p>
        <ul>
          <li>{t("home.placeholder.items.invite")}</li>
          <li>{t("home.placeholder.items.cases")}</li>
          <li>{t("home.placeholder.items.timeline")}</li>
        </ul>
      </div>
    </AuthLayout>
  );
}
