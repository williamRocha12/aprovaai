import nodemailer from "nodemailer";
import type { AppConfig } from "../../config";
import type { EmailMessage, EmailProvider } from "./types";

export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private readonly transport;

  constructor(
    host: string,
    port: number,
    private readonly from: string,
  ) {
    // Mailpit não usa TLS nem autenticação; em produção use o Resend.
    this.transport = nodemailer.createTransport({ host, port, secure: false });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, ...message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // O corpo de erro do Resend não tem dados do destinatário; seguro para log.
      throw new Error(`Resend respondeu ${response.status}: ${await response.text()}`);
    }
  }
}

/** Guarda as mensagens em memória. Usado nos testes de integração. */
export class MemoryEmailProvider implements EmailProvider {
  readonly name = "memory";
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  lastTo(to: string): EmailMessage | undefined {
    return this.sent.filter((m) => m.to === to).at(-1);
  }
}

export function createEmailProvider(config: AppConfig): EmailProvider {
  switch (config.EMAIL_PROVIDER) {
    case "resend":
      return new ResendEmailProvider(config.RESEND_API_KEY ?? "", config.EMAIL_FROM);
    case "memory":
      return new MemoryEmailProvider();
    case "smtp":
      return new SmtpEmailProvider(config.SMTP_HOST, config.SMTP_PORT, config.EMAIL_FROM);
  }
}
