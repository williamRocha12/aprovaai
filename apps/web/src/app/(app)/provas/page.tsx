import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server-api";
import { PastExamList } from "./past-exam-list";

export const metadata: Metadata = { title: "Provas anteriores" };

export default async function PastExamsPage() {
  const user = await getCurrentUser();
  return <PastExamList isEditor={user?.role === "editor" || user?.role === "admin"} />;
}
