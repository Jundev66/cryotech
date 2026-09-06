import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Recognises the body-parser error by its `type`, not by its `status`.
 *
 * Trusting a `status` that comes from an arbitrary object would let any future
 * exception pick its own response code; this recognises exactly one known case
 * and leaves everything else at 500.
 */
function isPayloadTooLarge(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { type?: unknown }).type === 'entity.too.large'
  );
}

/**
 * Turns any thrown value into a response — and, for the unexpected ones, into
 * a log line.
 *
 * It used to swallow everything silently: a 500 reached the client as a bare
 * "Internal server error" and left no trace anywhere. That makes an incident
 * unreconstructable after the fact, and makes a run of failed requests — which
 * is what probing looks like — invisible while it happens.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : ((res as Record<string, unknown>).message as string) || exception.message;
    } else if (isPayloadTooLarge(exception)) {
      // body-parser rejects the body before Nest sees anything, with an error
      // of its own that is not an HttpException. Without this case an oversized
      // body answered 500: the defence worked, but the client read "the server
      // is broken" instead of "this does not fit", and the log kept a 500
      // indistinguishable from a real failure.
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      message = 'El cuerpo de la petición excede el tamaño permitido';
    }

    const where = `${request.method} ${request.originalUrl}`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Full stack for us; the client still gets the generic message above, so
      // nothing about the internals leaks out with the response.
      this.logger.error(
        `${status} ${where}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      // Denials are the ones worth having a trail of: a burst of them is what
      // an attempt to walk another company's data looks like.
      this.logger.warn(`${status} ${where} — ${JSON.stringify(message)}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
