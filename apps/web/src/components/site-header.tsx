import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold text-primary">
          AprovaAI
        </Link>
        <nav aria-label="Principal" className="flex gap-4 text-sm">
          <Link href="/entrar" className="hover:underline">
            Entrar
          </Link>
          <Link href="/cadastro" className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        </nav>
      </div>
    </header>
  );
}
