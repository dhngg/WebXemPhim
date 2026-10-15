import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { Environment } from '../../../config/environment';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  /** True when messages are actually delivered; false means "do not even create reset tokens". */
  readonly enabled: boolean;
  send(message: OutgoingEmail): Promise<void>;
}

export class DisabledEmailSender implements EmailSender {
  readonly enabled = false;
  send(): Promise<void> {
    return Promise.resolve();
  }
}

export class SmtpEmailSender implements EmailSender {
  readonly enabled = true;
  private readonly logger = new Logger(SmtpEmailSender.name);

  constructor(
    private readonly transport: Pick<Transporter, 'sendMail'>,
    private readonly from: string,
  ) {}

  async send(message: OutgoingEmail): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.from, ...message });
    } catch (error) {
      // Never log the message, the recipient or provider responses: they can contain the token link.
      this.logger.error(`E-mail delivery failed (${(error as { code?: string }).code ?? 'ERROR'})`);
      throw new Error('E-mail delivery failed', { cause: error });
    }
  }
}

export function createEmailSender(environment: Environment): EmailSender {
  if (environment.EMAIL_PROVIDER !== 'smtp') return new DisabledEmailSender();
  const transport = createTransport({
    host: environment.SMTP_HOST,
    port: environment.SMTP_PORT,
    secure: environment.SMTP_SECURE,
    ...(environment.SMTP_USER
      ? { auth: { user: environment.SMTP_USER, pass: environment.SMTP_PASSWORD } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return new SmtpEmailSender(transport, environment.EMAIL_FROM as string);
}
