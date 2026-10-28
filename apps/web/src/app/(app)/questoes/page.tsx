import type { Metadata } from "next";
import { QuestionBank } from "./question-bank";

export const metadata: Metadata = { title: "Questões" };

export default function QuestionsPage() {
  return <QuestionBank />;
}
