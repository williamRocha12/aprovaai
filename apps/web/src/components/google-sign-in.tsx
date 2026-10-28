"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

interface PublicConfig {
  googleLoginEnabled: boolean;
}

/** Logo oficial "G" do Google (cores da marca, exigidas pelas diretrizes de branding). */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

/**
 * Botão "Continuar com Google". Só aparece quando a API informa que o login social está ativo
 * (credenciais configuradas + flag google_login ligada).
 */
export function GoogleSignIn({ termsNotice = false }: { termsNotice?: boolean }) {
  const config = useQuery({
    queryKey: ["public-config"],
    queryFn: () => api.get<PublicConfig>("/api/public/config"),
    staleTime: 5 * 60_000,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!config.data?.googleLoginEnabled) return null;

  async function signIn() {
    setLoading(true);
    setError(null);
    try {
      const { url } = await api.post<{ url: string }>("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "/conta",
        errorCallbackURL: "/entrar?erro=google",
      });
      window.location.assign(url);
    } catch (err) {
      setError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      <Button type="button" variant="outline" className="w-full" loading={loading} onClick={signIn}>
        {!loading && <GoogleLogo />}
        Continuar com Google
      </Button>
      {termsNotice && (
        <p className="text-center text-xs text-muted-foreground">
          Ao continuar com o Google, você aceita os{" "}
          <a href="/termos" target="_blank" className="underline">
            termos de uso
          </a>{" "}
          e a{" "}
          <a href="/privacidade" target="_blank" className="underline">
            política de privacidade
          </a>
          .
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
