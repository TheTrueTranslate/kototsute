import * as React from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { cn } from "../lib/utils";

type FormAlertVariant = "success" | "error" | "info";

type FormAlertProps = {
  variant?: FormAlertVariant;
  className?: string;
  children: React.ReactNode;
};

const variantClasses: Record<FormAlertVariant, string> = {
  info: "border-border bg-muted/40 text-foreground",
  error: "border-red-200 bg-red-50 text-red-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900"
};

export default function FormAlert({ variant = "info", className, children }: FormAlertProps) {
  return (
    <Alert className={cn("text-body-sm", variantClasses[variant], className)}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
