import * as React from "react";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "ghost" | "outline";

type ButtonOwnProps = {
  variant?: ButtonVariant;
  className?: string;
};

type ButtonProps<C extends React.ElementType = "button"> = ButtonOwnProps & {
  as?: C;
} & Omit<React.ComponentPropsWithoutRef<C>, keyof ButtonOwnProps | "as">;

export type { ButtonProps };

export default function Button<C extends React.ElementType = "button">({
  as,
  className,
  variant = "primary",
  ...props
}: ButtonProps<C>) {
  const Component = as ?? "button";
  const variantClasses: Record<ButtonVariant, string> = {
    primary: styles.buttonPrimary,
    ghost: styles.buttonGhost,
    outline: styles.buttonOutline
  };
  const classes = [styles.button, variantClasses[variant], className]
    .filter(Boolean)
    .join(" ");

  const componentProps = {
    className: classes,
    ...props
  } as unknown as React.ComponentPropsWithoutRef<C> & {
    type?: string;
  };

  if (Component === "button" && componentProps.type == null) {
    componentProps.type = "button";
  }

  return <Component {...componentProps} />;
}
