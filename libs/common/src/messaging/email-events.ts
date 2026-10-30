/** Event pattern for emails, published to the notifications queue. */
export const NOTIFY_EMAIL = 'notify_email';

export enum EmailTemplate {
  BookingConfirmed = 'booking_confirmed',
  BookingCancelled = 'booking_cancelled',
}

export interface BookingEmailData {
  reservationId: number;
  /** ISO dates. */
  startDate: string;
  endDate: string;
  /** Charged, or refunded for a cancellation. */
  amountCents: number;
}

/**
 * Senders name a template and supply its data; the wording lives in
 * notifications, so it can change without touching the services that send.
 */
export interface NotifyEmailEvent {
  email: string;
  template: EmailTemplate;
  data: BookingEmailData;
}
