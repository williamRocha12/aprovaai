import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";

const pillars = [
  {
    title: "O edital é a fonte da verdade",
    text: "Disciplinas, assuntos e pesos vêm do edital do seu concurso, não de uma lista genérica.",
  },
  {
    title: "Ciclo, não cronograma",
    text: "Perdeu um dia? A fila de estudo só anda. Nada de atraso acumulado.",
  },
  {
    title: "Seus erros guiam o plano",
    text: "Cada erro classificado (teoria, pegadinha, atenção...) muda o tipo do próximo bloco e entra na revisão espaçada.",
  },
];

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-5xl px-4 py-16">
        <section className="max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-primary">O que estudar agora, e por quê.</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            O AprovaAI monta um ciclo de estudos a partir do edital do seu concurso e ajusta as prioridades
            conforme você acerta e erra questões. Toda sugestão vem com a justificativa.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/cadastro" className={buttonVariants()}>
              Criar conta grátis
            </Link>
            <Link href="/entrar" className={buttonVariants({ variant: "outline" })}>
              Já tenho conta
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Não prometemos aprovação: o objetivo é organização, constância e foco no que mais derruba a sua
            nota.
          </p>
        </section>

        <section aria-labelledby="como-funciona" className="mt-16">
          <h2 id="como-funciona" className="text-xl font-semibold">
            Como funciona
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {pillars.map((p) => (
              <li key={p.title} className="rounded-lg border border-border bg-surface p-5">
                <h3 className="font-medium text-primary">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        <Link href="/termos" className="underline-offset-2 hover:underline">
          Termos de uso
        </Link>
        {" · "}
        <Link href="/privacidade" className="underline-offset-2 hover:underline">
          Política de privacidade
        </Link>
      </footer>
    </>
  );
}
