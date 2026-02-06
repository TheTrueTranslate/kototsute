import type { ReactNode } from "react";
import styles from "./file-list.module.css";

export type FileListItem = {
  id: string;
  name: string;
  meta?: string;
  action?: ReactNode;
};

export type FileListProps = {
  items: FileListItem[];
  emptyMessage: string;
};

export function FileList({ items, emptyMessage }: FileListProps) {
  if (!items.length) {
    return <div className={styles.fileMeta}>{emptyMessage}</div>;
  }

  return (
    <div className={styles.fileList}>
      {items.map((item) => (
        <div key={item.id} className={styles.fileRow}>
          <div className={styles.fileMain}>
            <div className={styles.fileName}>{item.name}</div>
            {item.meta ? <div className={styles.fileMeta}>{item.meta}</div> : null}
          </div>
          {item.action ? <div className={styles.fileActions}>{item.action}</div> : null}
        </div>
      ))}
    </div>
  );
}
