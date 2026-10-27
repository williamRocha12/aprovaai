import type { EmailMessage } from "./types";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function layout(title: string, body: string, actionLabel: string, url: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">
<h1 style="color:#1e3a5f;font-size:20px">${escapeHtml(title)}</h1>
${body}
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${escapeHtml(actionLabel)}</a></p>
<p style="font-size:13px;color:#475569">Se o botão não funcionar, copie e cole este link no navegador:<br>${escapeHtml(url)}</p>
<p style="font-size:13px;color:#475569">Se você não fez esta solicitação, ignore este e-mail.</p>
</body></html>`;
}

export function verificationEmail(to: string, name: string, url: string): EmailMessage {
  return {
    to,
    subject: "Confirme seu e-mail no AprovaAI",
    text: `Olá, ${name}!\n\nConfirme seu e-mail para ativar sua conta no AprovaAI:\n${url}\n\nO link expira em 24 horas.`,
    html: layout(
      "Confirme seu e-mail",
      `<p>Olá, ${escapeHtml(name)}! Confirme seu e-mail para ativar sua conta no AprovaAI. O link expira em 24 horas.</p>`,
      "Confirmar e-mail",
      url,
    ),
  };
}

export function resetPasswordEmail(to: string, name: string, url: string): EmailMessage {
  return {
    to,
    subject: "Redefinição de senha do AprovaAI",
    text: `Olá, ${name}!\n\nPara criar uma nova senha, acesse:\n${url}\n\nO link expira em 30 minutos e só pode ser usado uma vez.`,
    html: layout(
      "Redefinir senha",
      `<p>Olá, ${escapeHtml(name)}! Recebemos um pedido para redefinir sua senha. O link expira em 30 minutos e só pode ser usado uma vez.</p>`,
      "Criar nova senha",
      url,
    ),
  };
}
