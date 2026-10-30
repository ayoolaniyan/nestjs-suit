export interface TokenPayload {
  userId: number;
  /** The session the token was issued for; revoking it rejects the token. */
  sid: number;
}
