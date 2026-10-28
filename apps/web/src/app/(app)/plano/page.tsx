import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasGoal } from "@/lib/server-api";
import { SessionsPanel } from "./sessions-panel";
import { WeekCalendar } from "./week-calendar";

export const metadata: Metadata = { title: "Plano da semana" };

export default async function PlanPage() {
  if (!(await hasGoal())) redirect("/onboarding");
  return (
    <div className="space-y-8">
      <WeekCalendar />
      <SessionsPanel />
    </div>
  );
}
