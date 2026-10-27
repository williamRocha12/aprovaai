import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto w-full max-w-md px-4 py-12">
        {children}
      </main>
    </>
  );
}
