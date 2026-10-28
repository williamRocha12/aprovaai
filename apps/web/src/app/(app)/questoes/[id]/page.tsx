import type { Metadata } from "next";
import { QuestionSolver } from "./question-solver";

export const metadata: Metadata = { title: "Resolver questão" };

export default async function SolvePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const filters = new URLSearchParams(
    Object.entries(query).filter(
      (entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== "revisao",
    ),
  );
  // key: ao ir para a próxima questão, o estado (resposta, resultado) recomeça do zero.
  return <QuestionSolver key={id} id={id} reviewMode={query.revisao === "1"} filters={filters.toString()} />;
}
