import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

// Accepted from callers as-is only if it looks like an id, so a client cannot
// inject arbitrary text (or log-forging newlines) into every log line.
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

interface RequestContext {
  requestId: string;
}

/**
 * Carries the correlation id of the request being handled through every
 * await, so outgoing TCP calls can forward it without it being threaded
 * through each method signature.
 */
const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestId<R>(requestId: string, callback: () => R): R {
  return storage.run({ requestId }, callback);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Returns the caller's id if it is well-formed, or a fresh one. */
export function acceptOrCreateRequestId(candidate: unknown): string {
  return typeof candidate === 'string' && VALID_REQUEST_ID.test(candidate)
    ? candidate
    : randomUUID();
}

/**
 * Adds the current request id to a TCP payload. Nest's TCP transport has no
 * headers, so the id travels in the message and is read back out by
 * RpcRequestContextInterceptor; ValidationPipe's whitelist strips it before
 * it reaches a DTO.
 */
export function withRequestId<T extends object>(
  payload: T,
): T & { requestId?: string } {
  const requestId = currentRequestId();
  return requestId ? { ...payload, requestId } : payload;
}
