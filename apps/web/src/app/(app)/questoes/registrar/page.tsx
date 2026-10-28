import type { Metadata } from "next";
import { RegisterQuestion } from "./register-question";

export const metadata: Metadata = { title: "Registrar questão" };

export default function RegisterPage() {
  return <RegisterQuestion />;
}
