import { useTranslation } from "react-i18next";
import styles from "./site-footer.module.css";

type FooterProps = {
  note?: string;
  className?: string;
};

export default function SiteFooter({
  note,
  className
}: FooterProps) {
  const { t } = useTranslation();
  const resolvedNote = note ?? t("footer.note");
  const classes = [styles.footer, className].filter(Boolean).join(" ");

  return (
    <footer className={classes}>
        <div className={styles.inner}>
        <div className={styles.note}>{resolvedNote}</div>
      </div>
    </footer>
  );
}
