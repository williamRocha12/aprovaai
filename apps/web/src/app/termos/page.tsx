import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso">
      <h2>1. O que é o AprovaAI</h2>
      <p>
        Plataforma de organização de estudos para concursos públicos. Sugere o que estudar com base no edital
        e no seu desempenho. Não garante aprovação nem calcula probabilidade de aprovação.
      </p>
      <h2>2. Sua conta</h2>
      <p>
        Você é responsável por manter sua senha em sigilo. Contas podem ser desativadas em caso de uso abusivo
        ou violação destes termos.
      </p>
      <h2>3. Conteúdo</h2>
      <p>
        O catálogo usa apenas fontes oficiais citadas, conteúdo autoral ou licenciado. Questões e materiais
        que você cadastrar são privados e não são exibidos a outros usuários.
      </p>
      <h2>4. Alterações</h2>
      <p>Mudanças relevantes nestes termos serão comunicadas e exigirão novo aceite.</p>
    </LegalPage>
  );
}
