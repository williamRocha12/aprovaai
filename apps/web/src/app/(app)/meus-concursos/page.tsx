import type { Metadata } from "next";
import { MyGoalsView } from "./my-goals-view";

export const metadata: Metadata = { title: "Meus concursos" };

export default function MyGoalsPage() {
  return <MyGoalsView />;
}
