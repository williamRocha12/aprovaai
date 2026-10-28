import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server-api";
import { RadarQueue } from "./radar-queue";

export const metadata: Metadata = { title: "Radar de editais" };

export default async function RadarPage() {
  const user = await getCurrentUser();
  return <RadarQueue isAdmin={user?.role === "admin"} />;
}
