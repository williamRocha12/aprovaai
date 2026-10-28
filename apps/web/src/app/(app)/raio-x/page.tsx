import type { Metadata } from "next";
import { BoardXrayView } from "./board-xray-view";

export const metadata: Metadata = { title: "Raio-X da banca" };

export default function BoardXrayPage() {
  return <BoardXrayView />;
}
