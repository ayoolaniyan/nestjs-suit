describe('Health', () => {
  test.each([
    ['reservations', 'http://reservations:3000', 'database'],
    ['auth', 'http://auth:3001', 'database'],
    ['notifications', 'http://notifications:3004', 'rabbitmq'],
  ])('%s is live and ready', async (_name, base, dependency) => {
    expect((await fetch(`${base}/health`)).ok).toBe(true);

    const ready = await fetch(`${base}/health/ready`);
    expect(ready.ok).toBe(true);
    expect(await ready.json()).toMatchObject({
      info: { [dependency]: { status: 'up' } },
    });
  });

  test('payments is live and ready', async () => {
    expect((await fetch('http://payments:3006/health/ready')).ok).toBe(true);
  });
});
