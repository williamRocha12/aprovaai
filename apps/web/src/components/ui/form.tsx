import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, className)} {...props} />;
}

interface FieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}

/** Rótulo + campo + mensagem de erro, ligados por id/aria para leitores de tela. */
export function Field({ id, label, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Props de acessibilidade para o input dentro de um Field. */
export function fieldAria(id: string, error?: string, hint?: boolean) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy };
}
