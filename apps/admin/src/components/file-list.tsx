import type { ReactNode } from "react";

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
    return <div className="muted">{emptyMessage}</div>;
  }

  return (
    <div className="file-list">
      {items.map((item) => (
        <div key={item.id} className="file-row">
          <div className="file-main">
            <div className="row-title">{item.name}</div>
            {item.meta ? <div className="row-meta">{item.meta}</div> : null}
          </div>
          {item.action ? <div className="file-actions">{item.action}</div> : null}
        </div>
      ))}
    </div>
  );
}
