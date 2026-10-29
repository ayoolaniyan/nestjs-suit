describe('Health', () => {
  test.each([
    ['reservations', 'http://reservations:3000'],
    ['auth', 'http://auth:3001'],
  ])('%s is live and ready', async (_name, base) => {
    expect((await fetch(`${base}/health`)).ok).toBe(true);

    const ready = await fetch(`${base}/health/ready`);
    expect(ready.ok).toBe(true);
    expect(await ready.json()).toMatchObject({
      info: { database: { status: 'up' } },
    });
  });
});
