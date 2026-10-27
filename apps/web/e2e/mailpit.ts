// Lê e-mails capturados pelo Mailpit (SMTP de desenvolvimento) pela API HTTP dele.
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface MailpitSummary {
  ID: string;
  Subject: string;
}

/** Espera chegar um e-mail para `to` com o assunto contendo `subject` e devolve o primeiro link. */
export async function waitForEmailLink(to: string, subject: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: MailpitSummary[] };
    const match = messages.find((m) => m.Subject.includes(subject));
    if (match) {
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`)).json()) as {
        Text: string;
      };
      const link = message.Text.match(/https?:\/\/\S+/)?.[0];
      if (!link) throw new Error("E-mail sem link.");
      return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Nenhum e-mail "${subject}" para ${to} em ${timeoutMs}ms.`);
}
