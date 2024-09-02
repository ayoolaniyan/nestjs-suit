describe('Health', () => {
    test('reservations', async () => {
        const response = await fetch('http://reservations:3000');
        expect(response.ok).toBeTruthy();
    });
    test('auth', async () => {
        const response = await fetch('http://auth:3001');
        expect(response.ok).toBeTruthy();
    });
});