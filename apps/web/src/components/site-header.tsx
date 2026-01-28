import * as React from "react";
import { Link } from "react-router-dom";
import styles from "./site-header.module.css";
import { Menu } from "lucide-react";

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
  showMenuButton?: boolean;
  onMenuClick?: () => void;
  className?: string;
};

export default function SiteHeader({
  logoSrc = "/logo.png",
  logoAlt = "Kototsute",
  brand = "Kototsute",
  navItems = [],
  showNav = false,
  showMenuButton = false,
  onMenuClick,
  className
}: HeaderProps) {
  const classes = [styles.header, className].filter(Boolean).join(" ");

  return (
    <header className={classes}>
      <div className={styles.inner}>
        <div className={styles.leftGroup}>
          {showMenuButton ? (
            <button
              type="button"
              className={styles.menuButton}
              onClick={onMenuClick}
              aria-label="メニューを開く"
            >
              <Menu className={styles.menuIcon} />
            </button>
          ) : null}
          <Link className={styles.branding} to="/">
            <img className={styles.logo} src={logoSrc} alt={logoAlt} />
            <span className={styles.brandText}>{brand}</span>
          </Link>
        </div>
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
