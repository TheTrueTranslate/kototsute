import * as React from "react";
import styles from "./Input.module.css";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const classes = [styles.input, className].filter(Boolean).join(" ");
    return <input ref={ref} className={classes} {...props} />;
  }
);

Input.displayName = "Input";

export default Input;
