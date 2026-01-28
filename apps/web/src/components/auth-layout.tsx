import * as React from "react";
import styles from "./auth-layout.module.css";

type AuthLayoutProps = {
  title: string;
  lead?: string;
  breadcrumbs?: React.ReactNode;
  footer?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export default function AuthLayout({
  title,
  lead,
  breadcrumbs,
  footer,
  aside,
  className,
  children
}: AuthLayoutProps) {
  const classes = [styles.shell, className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <main className={styles.panel}>
        {breadcrumbs ? <div className={styles.breadcrumbs}>{breadcrumbs}</div> : null}
        <header className={styles.header}>
          <span className={styles.brand}>Kototsute</span>
          <h1>{title}</h1>
          {lead ? <p>{lead}</p> : null}
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
        {aside ? <div className={styles.aside}>{aside}</div> : null}
      </main>
    </div>
  );
}
