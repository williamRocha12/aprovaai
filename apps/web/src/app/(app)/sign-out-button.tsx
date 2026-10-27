"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    try {
      await api.post("/api/auth/sign-out");
    } finally {
      // Mesmo se a sessão já tiver expirado no servidor, o destino é o login.
      router.replace("/entrar");
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={signOut} loading={loading}>
      Sair
    </Button>
  );
}
