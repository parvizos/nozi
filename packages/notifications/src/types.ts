import type { NotificationChannel, Prisma } from "@nozi/database";

export const notificationEventTypes = [
  "OTP_REQUESTED",
  "ORDER_STATUS_CHANGED",
  "COURIER_ASSIGNED",
  "COURIER_REASSIGNED",
  "COURIER_ASSIGNMENT_CANCELLED",
  "RECIPIENT_ON_THE_WAY",
  "DELIVERY_CODE_CREATED",
  "DELIVERY_FAILED",
  "COURIER_INVITED",
] as const;

export type NotificationEventType = (typeof notificationEventTypes)[number];

export type NotificationEventPayload =
  | { challengeId: string }
  | { orderId: string; status: string }
  | { assignmentId: string }
  | { courierId: string }
  | { orderId: string; encryptedCode: string; proofId: string };

export type NotificationMessage = {
  channel: NotificationChannel;
  recipient: string;
  title: string;
  body: string;
  idempotencyKey: string;
};

export type NotificationSendResult = {
  providerMessageId?: string;
  skipped?: boolean;
};

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  readonly name: string;
  send(message: NotificationMessage): Promise<NotificationSendResult>;
}

export interface SmsProvider extends NotificationProvider {
  readonly channel: "SMS";
}

export interface EmailProvider extends NotificationProvider {
  readonly channel: "EMAIL";
}

export type TransactionClient = Prisma.TransactionClient;
