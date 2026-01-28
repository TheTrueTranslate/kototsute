import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "./breadcrumbs.module.css";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items?: BreadcrumbItem[];
  className?: string;
};

const routeLabels: Record<string, string> = {
  "/": "ホーム",
  "/assets": "資産一覧",
  "/assets/new": "資産登録",
  "/invites": "相続人",
  "/invites/received": "招待",
  "/login": "ログイン",
  "/register": "新規登録",
  "/reset": "パスワードリセット",
  "/me": "マイページ"
};

const buildItemsFromPath = (pathname: string): BreadcrumbItem[] => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [{ label: routeLabels["/"] ?? "ホーム" }];
  }

  const items: BreadcrumbItem[] = [];
  let current = "";
  for (const segment of segments) {
    current += `/${segment}`;
    const label = routeLabels[current] ?? segment;
    items.push({ label, href: current });
  }
  return items;
};

export default function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const { pathname } = useLocation();
  const resolved = items ?? buildItemsFromPath(pathname);
  const classes = [styles.breadcrumbs, className].filter(Boolean).join(" ");

  return (
    <nav className={classes} aria-label="パンくずリスト">
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
