import * as React from "react";
import styles from "./FormField.module.css";

type FormFieldProps = {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
};

export default function FormField({
  label,
  hint,
  error,
  htmlFor,
  className,
  children
}: FormFieldProps) {
  const classes = [styles.field, className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
        </label>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
