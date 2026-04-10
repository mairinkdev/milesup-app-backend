import type { VerificationPurpose } from '@prisma/client';

import { env } from '../config/env';
import { AppError } from './errors';

type VerificationEmailParams = {
  to: string;
  code: string;
  purpose: VerificationPurpose;
  recipientName?: string;
};

type VerificationCopy = {
  subject: string;
  eyebrow: string;
  title: string;
  description: string;
  supportLabel: string;
};

const verificationCopyByPurpose: Record<VerificationPurpose, VerificationCopy> = {
  REGISTER: {
    subject: 'Seu codigo MilesUp para criar a conta',
    eyebrow: 'Criar conta',
    title: 'Confirme seu cadastro no MilesUp',
    description:
      'Use o codigo abaixo para finalizar a criacao da sua conta e liberar o acesso ao ecossistema MilesUp.',
    supportLabel: 'Se voce nao iniciou este cadastro, pode ignorar este email.'
  },
  LOGIN_2FA: {
    subject: 'Seu codigo MilesUp para entrar',
    eyebrow: 'Acesso seguro',
    title: 'Confirme sua entrada',
    description:
      'Use este codigo para concluir o login com verificacao em duas etapas e acessar sua carteira.',
    supportLabel: 'Se nao foi voce, recomendamos trocar sua senha principal.'
  },
  PASSWORD_RESET: {
    subject: 'Seu codigo MilesUp para redefinir a senha',
    eyebrow: 'Recuperacao de acesso',
    title: 'Redefina sua senha com seguranca',
    description:
      'Use este codigo para validar a redefinicao da sua senha principal no MilesUp.',
    supportLabel: 'Se voce nao solicitou a redefinicao, ignore esta mensagem.'
  }
};

function buildVerificationEmailHtml(params: VerificationEmailParams) {
  const copy = verificationCopyByPurpose[params.purpose];
  const greetingName = params.recipientName?.trim() || 'por ai';

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${copy.subject}</title>
  </head>
  <body style="margin:0;padding:32px 16px;background:#F3F6EE;font-family:Inter,Segoe UI,Arial,sans-serif;color:#101112;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 16px 0;">
                <div style="background:#0F0F11;border-radius:28px;padding:24px 28px;color:#F8FAF4;box-shadow:0 18px 48px rgba(15,15,17,0.16);">
                  <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:rgba(123,214,7,0.16);border:1px solid rgba(123,214,7,0.28);color:#CFFF8B;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                    ${copy.eyebrow}
                  </div>
                  <div style="padding-top:18px;font-size:32px;font-weight:800;line-height:1.12;">MilesUp</div>
                  <div style="padding-top:10px;font-size:16px;line-height:1.6;color:rgba(248,250,244,0.82);">
                    Todos os seus programas. Uma visao inteligente.
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#F9FBF5;border:1px solid #D5DCC8;border-radius:28px;padding:32px 28px;box-shadow:0 12px 32px rgba(15,15,17,0.06);">
                <div style="font-size:14px;line-height:1.6;color:#545B50;">Oi, ${greetingName}.</div>
                <div style="padding-top:8px;font-size:28px;font-weight:800;line-height:1.18;color:#101112;">
                  ${copy.title}
                </div>
                <div style="padding-top:14px;font-size:16px;line-height:1.7;color:#545B50;">
                  ${copy.description}
                </div>
                <div style="padding-top:24px;">
                  <div style="border-radius:24px;background:linear-gradient(180deg,#101112 0%,#171A16 100%);padding:24px;border:1px solid rgba(123,214,7,0.22);text-align:center;">
                    <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(248,250,244,0.46);font-weight:700;">
                      Codigo de verificacao
                    </div>
                    <div style="padding-top:12px;font-size:40px;line-height:1;font-weight:800;letter-spacing:0.24em;color:#CFFF8B;">
                      ${params.code}
                    </div>
                  </div>
                </div>
                <div style="padding-top:18px;font-size:14px;line-height:1.7;color:#737C6D;">
                  Este codigo expira em ${env.VERIFICATION_CODE_TTL_MINUTES} minutos.
                </div>
                <div style="margin-top:24px;padding:18px 20px;border-radius:20px;background:#EEF9DE;border:1px solid #DDF4BA;font-size:14px;line-height:1.7;color:#436E10;">
                  ${copy.supportLabel}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 6px 0 6px;font-size:12px;line-height:1.7;color:#737C6D;text-align:center;">
                MilesUp - ${env.MAIL_FROM}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildVerificationEmailText(params: VerificationEmailParams) {
  const copy = verificationCopyByPurpose[params.purpose];

  return [
    'MilesUp',
    '',
    copy.title,
    copy.description,
    '',
    `Codigo: ${params.code}`,
    `Validade: ${env.VERIFICATION_CODE_TTL_MINUTES} minutos`,
    '',
    copy.supportLabel
  ].join('\n');
}

export async function sendVerificationEmail(params: VerificationEmailParams) {
  if (!env.RESEND_API_KEY) {
    const message =
      'RESEND_API_KEY is not configured. Verification email delivery is disabled for this environment.';

    if (!env.EXPOSE_DEV_CODES) {
      throw new AppError({
        statusCode: 503,
        code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
        message
      });
    }

    console.warn(message);
    return {
      dispatched: false,
      provider: 'disabled'
    } as const;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM}>`,
        to: [params.to],
        reply_to: env.MAIL_REPLY_TO ? [env.MAIL_REPLY_TO] : undefined,
        subject: verificationCopyByPurpose[params.purpose].subject,
        html: buildVerificationEmailHtml(params),
        text: buildVerificationEmailText(params)
      })
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Resend responded with ${response.status}: ${responseText}`);
    }

    return {
      dispatched: true,
      provider: 'resend'
    } as const;
  } catch (error) {
    console.error('Failed to send verification email with Resend.', error);

    if (env.EXPOSE_DEV_CODES) {
      return {
        dispatched: false,
        provider: 'resend'
      } as const;
    }

    throw new AppError({
      statusCode: 502,
      code: 'EMAIL_DELIVERY_FAILED',
      message: 'The verification email could not be sent right now.'
    });
  }
}
