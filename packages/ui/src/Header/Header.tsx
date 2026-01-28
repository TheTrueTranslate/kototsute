import * as React from "react";
import styles from "./Header.module.css";

export type HeaderNavItem = {
  label: string;
  href: string;
};

type HeaderProps = {
  logoSrc?: string;
  logoAlt?: string;
  brand?: string;
  navItems?: HeaderNavItem[];
  showNav?: boolean;
  className?: string;
};

export default function Header({
  logoSrc = "/logo.png",
  logoAlt = "Kototsute",
  brand = "Kototsute",
  navItems = [],
  showNav = false,
  className
}: HeaderProps) {
  const classes = [styles.header, className].filter(Boolean).join(" ");

  return (
    <header className={classes}>
      <div className={styles.inner}>
        <a className={styles.branding} href="/">
          <img className={styles.logo} src={logoSrc} alt={logoAlt} />
          <span className={styles.brandText}>{brand}</span>
        </a>
        {showNav ? (
          <nav className={styles.nav} aria-label="メインメニュー">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
