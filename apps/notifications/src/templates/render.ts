import { EmailTemplate, NotifyEmailEvent } from '@app/common';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );

/** One paragraph per line, in both a plain-text and an HTML part. */
function email(subject: string, lines: string[]): RenderedEmail {
  return {
    subject,
    text: lines.join('\n\n'),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n'),
  };
}

export function render({ template, data }: NotifyEmailEvent): RenderedEmail {
  const stay = `${data.startDate} to ${data.endDate}`;
  switch (template) {
    case EmailTemplate.BookingConfirmed:
      return email(`Booking #${data.reservationId} confirmed`, [
        `Your booking for ${stay} is confirmed.`,
        `We charged ${dollars(data.amountCents)} to your card.`,
      ]);
    case EmailTemplate.BookingCancelled:
      return email(`Booking #${data.reservationId} cancelled`, [
        `Your booking for ${stay} has been cancelled.`,
        `We have refunded ${dollars(data.amountCents)}; it can take 5 to 10 business days to reach your card.`,
      ]);
  }
}
