import * as React from "react";
import { Link } from "react-router-dom";
import styles from "./site-header.module.css";

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

export default function SiteHeader({
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
        <Link className={styles.branding} to="/">
          <img className={styles.logo} src={logoSrc} alt={logoAlt} />
          <span className={styles.brandText}>{brand}</span>
        </Link>
        {showNav ? (
          <nav className={styles.nav} aria-label="メインメニュー">
            {navItems.map((item) => (
              <Link key={item.href} to={item.href} className={styles.navLink}>
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
