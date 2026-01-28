import * as React from "react";
import styles from "./FormAlert.module.css";

type FormAlertVariant = "success" | "error" | "info";

type FormAlertProps = {
  variant?: FormAlertVariant;
  className?: string;
  children: React.ReactNode;
};

export default function FormAlert({
  variant = "info",
  className,
  children
}: FormAlertProps) {
  const variantClasses: Record<FormAlertVariant, string> = {
    success: styles.alertSuccess,
    error: styles.alertError,
    info: styles.alertInfo
  };
  const classes = [styles.alert, variantClasses[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="status">
      {children}
    </div>
  );
}
