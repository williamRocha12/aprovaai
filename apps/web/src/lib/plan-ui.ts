import type { Task } from "@aprovaai/shared";

export const TASK_TYPE_STYLES: Record<Task["type"], string> = {
  teoria: "bg-primary/10 text-primary",
  questoes: "bg-success-soft text-success",
  revisao: "bg-warning-soft text-warning",
  lei_seca: "bg-muted text-foreground",
  simulado: "bg-danger-soft text-danger",
  analise_erros: "bg-warning-soft text-warning",
};

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** "2026-10-28" → "qua, 28/10". */
export function formatDayShort(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAY_SHORT[d.getUTCDay()]?.toLowerCase()}, ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export function formatDateBr(date: string | null): string {
  if (!date) return "não confirmada";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Hoje no fuso do navegador, como "YYYY-MM-DD". */
export function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

export function isOpen(task: Task): boolean {
  return task.status === "pendente" || task.status === "em_andamento";
}
