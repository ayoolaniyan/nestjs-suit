import { instanceToPlain } from 'class-transformer';
import { User } from './user.entity';

describe('User serialization', () => {
  it('omits the password hash', () => {
    const user = new User({
      id: 1,
      email: 'user@example.com',
      password: '$2a$10$hash',
      roles: [],
    });

    const plain = instanceToPlain(user);

    expect(plain).not.toHaveProperty('password');
    expect(plain).toMatchObject({ id: 1, email: 'user@example.com' });
  });
});
