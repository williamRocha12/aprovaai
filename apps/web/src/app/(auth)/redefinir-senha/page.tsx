import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/feedback";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nova senha" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <Card>
      <h1 className="text-2xl font-semibold">Criar nova senha</h1>
      <div className="mt-6">
        {token && !error ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="space-y-4">
            <Alert variant="error">O link é inválido ou expirou. Peça um novo.</Alert>
            <Link href="/esqueci-senha" className={buttonVariants({ className: "w-full" })}>
              Pedir novo link
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
