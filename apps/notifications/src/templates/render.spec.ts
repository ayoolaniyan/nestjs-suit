import { EmailTemplate } from '@app/common';
import { render } from './render';

describe('render', () => {
  const data = {
    reservationId: 11,
    startDate: '2026-11-01',
    endDate: '2026-11-04',
    amountCents: 37500,
  };

  it('renders a booking confirmation with the amount charged', () => {
    const email = render({
      email: 'user@example.com',
      template: EmailTemplate.BookingConfirmed,
      data,
    });

    expect(email.subject).toBe('Booking #11 confirmed');
    expect(email.text).toContain('2026-11-01 to 2026-11-04');
    expect(email.text).toContain('$375.00');
    expect(email.html).toContain('<p>');
  });

  it('renders a cancellation with the amount refunded', () => {
    const email = render({
      email: 'user@example.com',
      template: EmailTemplate.BookingCancelled,
      data,
    });

    expect(email.subject).toBe('Booking #11 cancelled');
    expect(email.text).toContain('refunded $375.00');
  });

  it('escapes HTML in the HTML part', () => {
    const email = render({
      email: 'user@example.com',
      template: EmailTemplate.BookingConfirmed,
      data: { ...data, startDate: '<script>' },
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});
