import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const alertStyles = {
  info: { box: "border-primary/30 bg-muted text-foreground", Icon: Info },
  success: { box: "border-success/40 bg-success-soft text-success", Icon: CheckCircle2 },
  warning: { box: "border-warning/40 bg-warning-soft text-warning", Icon: TriangleAlert },
  error: { box: "border-danger/40 bg-danger-soft text-danger", Icon: AlertCircle },
} as const;

export function Alert({
  variant = "info",
  title,
  children,
}: {
  variant?: keyof typeof alertStyles;
  title?: string;
  children?: ReactNode;
}) {
  const { box, Icon } = alertStyles[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-md border p-3 text-sm", box)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface p-6 shadow-sm", className)}>
      {children}
    </section>
  );
}

export function LoadingState({ label = "Carregando..." }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}
