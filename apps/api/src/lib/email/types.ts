export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Abstração do envio de e-mail: SMTP (Mailpit em dev), Resend (produção) ou memória (testes). */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}
