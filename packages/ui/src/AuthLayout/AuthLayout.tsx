import * as React from "react";
import styles from "./AuthLayout.module.css";

type AuthLayoutProps = {
  title: string;
  lead?: string;
  footer?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export default function AuthLayout({
  title,
  lead,
  footer,
  aside,
  className,
  children
}: AuthLayoutProps) {
  const classes = [styles.shell, className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <main className={styles.panel}>
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
