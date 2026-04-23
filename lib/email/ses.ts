import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import pino from "pino";

const logger = pino();

/**
 * Lazy-initialized SES client.
 * Only created when first email is sent, avoiding startup errors if credentials are missing.
 */
let _sesClient: SESClient | null = null;

function getSesClient(): SESClient {
  if (!_sesClient) {
    const region = process.env.AWS_SES_REGION;
    const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "AWS SES credentials not configured. Set AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, and AWS_SES_SECRET_ACCESS_KEY."
      );
    }

    _sesClient = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return _sesClient;
}

/**
 * Send an email via AWS SES.
 *
 * @param to - Recipient email address
 * @param subject - Email subject line
 * @param htmlBody - HTML email body
 * @param fromName - Optional sender display name (e.g., "Electric Team")
 * @returns The SES message ID on success
 */
export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  fromName?: string
): Promise<string | undefined> {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error("AWS_SES_FROM_EMAIL is not configured.");
  }

  // Construct source with display name if provided: "Name <email@example.com>"
  const source = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
  const replyTo = process.env.REPLY_TO_EMAIL;

  // Strip HTML tags for the plain-text fallback
  const textBody = htmlBody
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const command = new SendEmailCommand({
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: {
        Html: { Data: htmlBody, Charset: "UTF-8" },
        Text: { Data: textBody, Charset: "UTF-8" },
      },
    },
    Source: source,
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
  });

  try {
    const client = getSesClient();
    const result = await client.send(command);
    logger.info({ to, subject, messageId: result.MessageId }, "Email sent successfully");
    return result.MessageId;
  } catch (error) {
    logger.error({ to, subject, error }, "Failed to send email via SES");
    throw error;
  }
}
