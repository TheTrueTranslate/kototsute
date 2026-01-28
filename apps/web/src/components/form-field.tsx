import * as React from "react";
import { Label } from "./ui/label";
import { cn } from "../lib/utils";

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
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={htmlFor} className="text-body-sm text-foreground">
          {label}
        </Label>
        {hint ? <span className="text-meta text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="text-meta text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
