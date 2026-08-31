import { Request, Response, NextFunction, RequestHandler, ParamsDictionary } from 'express-serve-static-core';

/**
 * Wraps an async route handler so that any thrown errors are passed to next().
 * Eliminates the need for try/catch in every route.
 *
 * Generic so each route keeps its own inferred `req.params` shape (e.g. `{ id: string }`)
 * instead of collapsing to the default `ParamsDictionary` (`string | string[]` per key).
 */
export function asyncHandler<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
>(
  fn: (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction) => Promise<any>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
