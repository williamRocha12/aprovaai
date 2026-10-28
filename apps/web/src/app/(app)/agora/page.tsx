import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasGoal } from "@/lib/server-api";
import { NowView } from "./now-view";

export const metadata: Metadata = { title: "O que estudar agora" };

export default async function NowPage() {
  if (!(await hasGoal())) redirect("/onboarding");
  return <NowView />;
}
