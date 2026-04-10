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
    subject: 'Your MilesUp code to create an account',
    eyebrow: 'Create account',
    title: 'Confirm your registration with MilesUp',
    description:
      'Use the code below to finalize creating your account and unlock access to the MilesUp ecosystem.',
    supportLabel: 'If you did not start this registration, you can ignore this email.'
  },
  LOGIN_2FA: {
    subject: 'Your MilesUp code to sign in',
    eyebrow: 'Secure access',
    title: 'Confirm your login',
    description:
      'Use this code to complete your login with two-factor verification and access your wallet.',
    supportLabel: 'If this wasn\'t you, we recommend changing your main password.'
  },
  PASSWORD_RESET: {
    subject: 'Your MilesUp code to reset your password',
    eyebrow: 'Access recovery',
    title: 'Reset your password securely',
    description:
      'Use this code to validate resetting your main password on MilesUp.',
    supportLabel: 'If you did not request a password reset, please ignore this message.'
  }
};

type TransactionEmailParams = {
  to: string;
  recipientName: string;
  type: 'sent' | 'received' | 'converted';
  amount: number;
  asset: string;
  otherParty?: string;
  status: 'completed' | 'pending';
};

function buildTransactionEmailHtml(params: TransactionEmailParams) {
  const firstName = params.recipientName?.trim().split(/\s+/)[0] || 'there';
  
  const details: Record<typeof params.type, { subject: string; title: string; description: string; icon: string; color: string }> = {
    sent: {
      subject: 'Miles transferred successfully',
      title: 'You sent miles',
      description: `${params.amount.toLocaleString()} ${params.asset} were transferred to ${params.otherParty} on MilesUp.`,
      icon: '📤',
      color: '#7BD607'
    },
    received: {
      subject: 'You received miles',
      title: 'Miles received',
      description: `${params.amount.toLocaleString()} ${params.asset} were transferred from ${params.otherParty} to your wallet.`,
      icon: '📥',
      color: '#7BD607'
    },
    converted: {
      subject: 'Miles conversion confirmed',
      title: 'Conversion completed',
      description: `You successfully converted ${params.amount.toLocaleString()} miles on MilesUp.`,
      icon: '🔄',
      color: '#7BD607'
    }
  };

  const detail = details[params.type];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${detail.subject}</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      @media (prefers-color-scheme: dark) {
        .bg-body { background-color: #0A0E06 !important; color: #ECEFE7 !important; }
        .bg-header { background: linear-gradient(135deg, #0A0E06 0%, #151C0F 100%) !important; border-bottom: 1px solid #1C2614 !important; }
        .bg-card { background-color: #12180D !important; border-color: #1C2614 !important; color: #ECEFE7 !important; }
        .bg-amount-box { background-color: #1A2312 !important; border-left-color: ${detail.color} !important; }
        .text-main { color: #ECEFE7 !important; }
        .text-value { color: #FFFFFF !important; }
        .text-muted { color: #A1A89A !important; }
        .border-divider { border-color: #1C2614 !important; }
      }
    </style>
  </head>
  <body class="bg-body" style="margin:0;padding:32px 16px;background:#F3F6EE;font-family:'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;color:#3c3c3c;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:collapse;">
            <!-- Header -->
            <tr>
              <td class="bg-header" style="padding:32px 24px;background:linear-gradient(135deg, #0F0F11 0%, #1a1d19 100%);border-radius:12px 12px 0 0;text-align:center;">
                <div style="font-size:48px;margin-bottom:16px;">${detail.icon}</div>
                <div style="font-size:28px;font-weight:700;color:#CFFF8B;margin-bottom:8px;">${detail.title}</div>
                <div style="font-size:14px;color:rgba(248,250,244,0.7);">${detail.subject}</div>
              </td>
            </tr>
            
            <!-- Content -->
            <tr>
              <td class="bg-card" style="background:#F9FBF5;padding:32px 24px;border-radius:0 0 12px 12px;border-left:1px solid #e0e0e0;border-right:1px solid #e0e0e0;border-bottom:1px solid #e0e0e0;">
                <div class="text-main" style="font-size:16px;line-height:1.6;color:#3c3c3c;margin-bottom:24px;">
                  <p>Hi ${firstName},</p>
                  <p>${detail.description}</p>
                </div>
                
                <!-- Amount Card -->
                <div class="bg-amount-box" style="background:#f5f5f5;border-left:4px solid ${detail.color};border-radius:6px;padding:16px 16px;margin-bottom:24px;font-size:14px;">
                  <div class="text-muted" style="color:#6c6c6c;margin-bottom:8px;">Amount transferred</div>
                  <div class="text-value" style="font-size:24px;font-weight:700;color:#101112;">${params.amount.toLocaleString()} <span class="text-muted" style="font-size:16px;color:#6c6c6c;">${params.asset}</span></div>
                </div>

                <div class="text-muted border-divider" style="font-size:13px;line-height:1.6;color:#6c6c6c;padding-top:16px;border-top:1px solid #e0e0e0;">
                  <p style="margin:0 0 8px 0;">Status: <strong>${params.status === 'completed' ? '✓ Completed' : '⏳ Pending'}</strong></p>
                  <p style="margin:0;">This transaction is visible in your MilesUp wallet and activity history.</p>
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td class="text-muted border-divider" style="padding:24px;text-align:center;font-size:12px;color:#6c6c6c;border-top:1px solid #e0e0e0;">
                <p style="margin:0 0 12px 0;">
                  <a href="https://milesup.app" style="color:#7BD607;text-decoration:none;font-weight:600;">Visit MilesUp</a>
                </p>
                <p class="text-muted" style="margin:0;color:#9c9c9c;">
                  MilesUp • All your programs. One intelligent view.<br/>
                  ${env.MAIL_FROM}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildTransactionEmailText(params: TransactionEmailParams) {
  return [
    'MilesUp - Transaction Notification',
    '',
    params.type === 'sent' ? `You sent ${params.amount.toLocaleString()} ${params.asset} to ${params.otherParty}` :
    params.type === 'received' ? `You received ${params.amount.toLocaleString()} ${params.asset} from ${params.otherParty}` :
    `You converted ${params.amount.toLocaleString()} miles`,
    '',
    `Status: ${params.status === 'completed' ? 'Completed' : 'Pending'}`,
    '',
    'Visit MilesUp to manage your wallet',
    env.MAIL_FROM
  ].join('\n');
}

function buildVerificationEmailHtml(params: VerificationEmailParams) {
  const copy = verificationCopyByPurpose[params.purpose];
  const greetingName = params.recipientName?.trim() || 'there';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${copy.subject}</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      @media (prefers-color-scheme: dark) {
        .bg-body { background-color: #0A0E06 !important; color: #ECEFE7 !important; }
        .bg-top-card { background: #0A0E06 !important; border: 1px solid #1C2614 !important; box-shadow: none !important; }
        .bg-main-card { background-color: #12180D !important; border-color: #1C2614 !important; box-shadow: none !important; color: #ECEFE7 !important; }
        .bg-code-box { background: linear-gradient(180deg, #161D10 0%, #0A0E06 100%) !important; border-color: #2F3E22 !important; }
        .bg-support-box { background-color: #151A0E !important; border-color: #222B18 !important; color: #A1A89A !important; }
        
        .text-main { color: #ECEFE7 !important; }
        .text-muted { color: #A1A89A !important; }
        .text-accent { color: #CFFF8B !important; }
      }
    </style>
  </head>
  <body class="bg-body" style="margin:0;padding:32px 16px;background:#F3F6EE;font-family:Inter,Segoe UI,Arial,sans-serif;color:#101112;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 16px 0;">
                <div class="bg-top-card" style="background:#0F0F11;border-radius:28px;padding:24px 28px;color:#F8FAF4;box-shadow:0 18px 48px rgba(15,15,17,0.16);">
                  <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:rgba(123,214,7,0.16);border:1px solid rgba(123,214,7,0.28);color:#CFFF8B;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                    ${copy.eyebrow}
                  </div>
                  <div style="padding-top:18px;font-size:32px;font-weight:800;line-height:1.12;">MilesUp</div>
                  <div style="padding-top:10px;font-size:16px;line-height:1.6;color:rgba(248,250,244,0.82);">
                    All your programs. One intelligent view.
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td class="bg-main-card" style="background:#F9FBF5;border:1px solid #D5DCC8;border-radius:28px;padding:32px 28px;box-shadow:0 12px 32px rgba(15,15,17,0.06);">
                <div class="text-muted" style="font-size:14px;line-height:1.6;color:#545B50;">Hi, ${greetingName}.</div>
                <div class="text-main" style="padding-top:8px;font-size:28px;font-weight:800;line-height:1.18;color:#101112;">
                  ${copy.title}
                </div>
                <div class="text-muted" style="padding-top:14px;font-size:16px;line-height:1.7;color:#545B50;">
                  ${copy.description}
                </div>
                <div style="padding-top:24px;">
                  <div class="bg-code-box" style="border-radius:24px;background:linear-gradient(180deg,#101112 0%,#171A16 100%);padding:24px;border:1px solid rgba(123,214,7,0.22);text-align:center;">
                    <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(248,250,244,0.46);font-weight:700;">
                      Verification code
                    </div>
                    <div class="text-accent" style="padding-top:12px;font-size:40px;line-height:1;font-weight:800;letter-spacing:0.24em;color:#CFFF8B;">
                      ${params.code}
                    </div>
                  </div>
                </div>
                <div class="text-muted" style="padding-top:18px;font-size:14px;line-height:1.7;color:#737C6D;">
                  This code expires in ${env.VERIFICATION_CODE_TTL_MINUTES} minutes.
                </div>
                <div class="bg-support-box" style="margin-top:24px;padding:18px 20px;border-radius:20px;background:#EEF9DE;border:1px solid #DDF4BA;font-size:14px;line-height:1.7;color:#436E10;">
                  ${copy.supportLabel}
                </div>
              </td>
            </tr>
            <tr>
              <td class="text-muted" style="padding:16px 6px 0 6px;font-size:12px;line-height:1.7;color:#737C6D;text-align:center;">
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
    `Code: ${params.code}`,
    `Valid for: ${env.VERIFICATION_CODE_TTL_MINUTES} minutes`,
    '',
    copy.supportLabel
  ].join('\n');
}

export async function sendTransactionEmail(params: TransactionEmailParams) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY is not configured. Transaction email delivery is disabled.');
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
        subject: params.type === 'sent' ? 'Miles transferred successfully' :
                 params.type === 'received' ? 'You received miles' :
                 'Miles conversion confirmed',
        html: buildTransactionEmailHtml(params),
        text: buildTransactionEmailText(params)
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
    console.error('Failed to send transaction email with Resend.', error);
    return {
      dispatched: false,
      provider: 'resend'
    } as const;
  }
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
