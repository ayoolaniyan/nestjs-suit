import { NextFunction, Request, Response } from 'express';
import {
  REQUEST_ID_HEADER,
  acceptOrCreateRequestId,
  runWithRequestId,
} from './request-context';

/**
 * Registered first in each HTTP service's main.ts, ahead of Nest's own
 * middleware, so the id is in place for the logger, the guards and every TCP
 * call the request makes. It is echoed back so a client can quote it when
 * reporting a problem.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = acceptOrCreateRequestId(req.headers[REQUEST_ID_HEADER]);
  req.headers[REQUEST_ID_HEADER] = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  runWithRequestId(requestId, next);
}
