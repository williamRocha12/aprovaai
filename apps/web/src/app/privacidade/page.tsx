import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade">
      <h2>1. Dados que coletamos</h2>
      <p>
        Nome, e-mail, senha (guardada apenas como hash Argon2id), preferências de estudo e os registros que
        você cria (tarefas, tentativas de questões, anotações). Registramos IP e navegador das sessões por
        segurança.
      </p>
      <h2>2. Para que usamos</h2>
      <p>Para autenticar você, montar seu plano de estudos e proteger a conta contra acessos indevidos.</p>
      <h2>3. Cookies</h2>
      <p>Usamos apenas cookies essenciais (sessão). Cookies de análise só com o seu consentimento.</p>
      <h2>4. Seus direitos (LGPD)</h2>
      <p>
        Você pode exportar seus dados e excluir sua conta a qualquer momento pelas configurações. Na exclusão,
        os dados pessoais são removidos ou anonimizados; registros de auditoria são mantidos de forma
        anonimizada pelo prazo definido na política de retenção.
      </p>
      <h2>5. Compartilhamento</h2>
      <p>
        Não vendemos dados. Provedores de infraestrutura (hospedagem, e-mail) processam dados apenas para
        operar o serviço.
      </p>
    </LegalPage>
  );
}
