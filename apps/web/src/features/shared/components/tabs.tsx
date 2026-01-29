import { cn } from "../lib/utils";
import styles from "./tabs.module.css";

type TabItem = {
  key: string;
  label: string;
  disabled?: boolean;
};

type TabsProps = {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export default function Tabs({ items, value, onChange, className }: TabsProps) {
  return (
    <div className={cn(styles.tabs, className)} role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={value === item.key}
          disabled={item.disabled}
          className={cn(styles.tabButton, value === item.key && styles.tabButtonActive)}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
