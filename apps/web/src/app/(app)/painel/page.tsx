import type { Metadata } from "next";
import { DashboardView } from "./dashboard-view";
import { PlanSummaryCard } from "./plan-summary-card";

export const metadata: Metadata = { title: "Painel" };

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <DashboardView />
      <PlanSummaryCard />
    </div>
  );
}
