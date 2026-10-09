import { createHash } from "node:crypto";

import { getEnv } from "@nozi/config";

import type {
  NotificationMessage,
  NotificationSendResult,
  SmsProvider,
} from "./types";

function maskedRecipient(value: string): string {
  return `${value.slice(0, 4)}••••${value.slice(-2)}`;
}

export class ConsoleSmsProvider implements SmsProvider {
  readonly channel = "SMS" as const;
  readonly name = "console";

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    if (getEnv().NODE_ENV === "production")
      throw new Error("Console SMS provider is disabled in production");
    // This is intentionally the only development-only plaintext SMS sink.
    process.stdout.write(
      `${JSON.stringify({
        body: message.body,
        channel: "SMS",
        idempotencyKey: message.idempotencyKey,
        recipient: maskedRecipient(message.recipient),
        title: message.title,
      })}\n`,
    );
    return {
      providerMessageId: `console-${createHash("sha256")
        .update(message.idempotencyKey)
        .digest("hex")
        .slice(0, 16)}`,
    };
  }
}

export class MockSmsProvider implements SmsProvider {
  readonly channel = "SMS" as const;
  readonly name = "mock";
  readonly messages: NotificationMessage[] = [];

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    this.messages.push(message);
    return { providerMessageId: `mock-${this.messages.length}` };
  }
}

export class DisabledSmsProvider implements SmsProvider {
  readonly channel = "SMS" as const;
  readonly name = "disabled";

  async send(): Promise<NotificationSendResult> {
    if (getEnv().SMS_REQUIRED)
      throw new Error("SMS delivery is required but no provider is configured");
    return { skipped: true };
  }
}

export class HttpSmsProvider implements SmsProvider {
  readonly channel = "SMS" as const;
  readonly name = "http";

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    const env = getEnv();
    if (!env.SMS_API_URL || !env.SMS_API_KEY || !env.SMS_FROM)
      throw new Error("HTTP SMS provider is not configured");
    const response = await fetch(env.SMS_API_URL, {
      body: JSON.stringify({
        from: env.SMS_FROM,
        message: message.body,
        to: message.recipient,
      }),
      headers: {
        authorization: `Bearer ${env.SMS_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": message.idempotencyKey,
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`SMS provider returned ${response.status}`);
    const result = (await response.json().catch(() => ({}))) as {
      id?: string;
    };
    return result.id ? { providerMessageId: result.id } : {};
  }
}

export function createSmsProvider(): SmsProvider {
  switch (getEnv().SMS_PROVIDER) {
    case "console":
      return new ConsoleSmsProvider();
    case "mock":
      return new MockSmsProvider();
    case "http":
      return new HttpSmsProvider();
    case "disabled":
      return new DisabledSmsProvider();
  }
}
