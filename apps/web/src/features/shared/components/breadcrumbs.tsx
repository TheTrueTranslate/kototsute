import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styles from "./breadcrumbs.module.css";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items?: BreadcrumbItem[];
  className?: string;
};

export default function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const routeLabels: Record<string, string> = {
    "/": t("nav.cases"),
    "/cases": t("nav.cases"),
    "/notifications": t("nav.notifications"),
    "/invites": t("nav.invites"),
    "/login": t("nav.login"),
    "/register": t("nav.register"),
    "/reset": t("nav.reset"),
    "/me": t("nav.myPage")
  };

  const buildItemsFromPath = (path: string): BreadcrumbItem[] => {
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) {
      return [{ label: routeLabels["/"] ?? t("nav.home") }];
    }

    const builtItems: BreadcrumbItem[] = [];
    let current = "";
    for (const segment of segments) {
      current += `/${segment}`;
      const label = routeLabels[current] ?? segment;
      builtItems.push({ label, href: current });
    }
    return builtItems;
  };

  const resolved = items ?? buildItemsFromPath(pathname);
  const classes = [styles.breadcrumbs, className].filter(Boolean).join(" ");

  return (
    <nav className={classes} aria-label={t("nav.breadcrumbs")}>
      <ol className={styles.list}>
        {resolved.map((item, index) => {
          const isLast = index === resolved.length - 1;
          const content = item.href && !isLast ? (
            <Link to={item.href} className={styles.link}>
              {item.label}
            </Link>
          ) : (
            <span className={styles.current}>{item.label}</span>
          );

          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className={styles.item}>{content}</li>
              {!isLast ? <li className={styles.separator}>/</li> : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
