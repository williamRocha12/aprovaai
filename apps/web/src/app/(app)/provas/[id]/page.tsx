import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server-api";
import { PastExamDetailView } from "./past-exam-detail";

export const metadata: Metadata = { title: "Prova anterior" };

export default async function PastExamPage() {
  const user = await getCurrentUser();
  return <PastExamDetailView isEditor={user?.role === "editor" || user?.role === "admin"} />;
}
