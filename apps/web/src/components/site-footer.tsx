import * as React from "react";
import styles from "./site-footer.module.css";

type FooterProps = {
  note?: string;
  className?: string;
};

export default function SiteFooter({
  note = "© 2026 Kototsute",
  className
}: FooterProps) {
  const classes = [styles.footer, className].filter(Boolean).join(" ");

  return (
    <footer className={classes}>
      <div className={styles.inner}>
        <div className={styles.note}>{note}</div>
      </div>
    </footer>
  );
}
