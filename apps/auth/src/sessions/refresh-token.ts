import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * A refresh token is `<session id>.<secret>`: the id finds the session, and
 * the secret, of which only a hash is stored, proves the bearer holds the
 * latest token issued for it.
 */
export interface RefreshToken {
  sessionId: number;
  secret: string;
}

export const newSecret = () => randomBytes(32).toString('base64url');

export const hashSecret = (secret: string) =>
  createHash('sha256').update(secret).digest('hex');

export const formatRefreshToken = ({ sessionId, secret }: RefreshToken) =>
  `${sessionId}.${secret}`;

export function parseRefreshToken(token: unknown): RefreshToken | null {
  const match =
    typeof token === 'string' &&
    /^(\d{1,10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  return match ? { sessionId: Number(match[1]), secret: match[2] } : null;
}

/** Constant-time, so response timing does not reveal how much matched. */
export function secretMatches(secret: string, storedHash: string) {
  const presented = Buffer.from(hashSecret(secret), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return (
    presented.length === stored.length && timingSafeEqual(presented, stored)
  );
}
