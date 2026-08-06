//modules
import type { Response } from '@stackpress/ingest/http';
import IngestException from '@stackpress/ingest/Exception';
import Status from '@stackpress/lib/Status';

const APPLICATION_CODE = '__tabular_application_code';
const APPLICATION_EXPOSE = '__tabular_application_expose';

//The error payload contract exported for module callers
export type ErrorPayload = {
  error: {
    code: string,
    message: string,
    requestId?: string,
  },
};

/**
 * Represent an owned application failure.
 */
export class ApplicationError extends IngestException {
  //The stable application code mapped into safe transport responses
  public readonly errorCode: string;
  //The disclosure flag that permits an owned message to cross the HTTP edge
  public readonly expose: boolean;

  /**
   * Create an owned application error with explicit disclosure metadata.
   */
  public constructor(
    errorCode: string,
    statusCode: number,
    message: string,
    expose = statusCode < 500
  ) {
    //reject unregistered status codes before constructing an Ingest exception
    if (!Status.get(statusCode)) {
      throw new Error(`Application errors require a registered HTTP status code: ${statusCode}`);
    }
    super(message, statusCode);
    this.name = 'ApplicationError';
    this.errorCode = errorCode;
    this.expose = expose;

    //store mapping metadata inside the shared exception error collection so
    // route-level failures can be sanitized without relying on class identity
    this.withErrors({
      [APPLICATION_CODE]: errorCode,
      [APPLICATION_EXPOSE]: expose ? 'true' : 'false'
    });
  }

  /**
   * Return the status code value.
   */
  public get statusCode() {
    return this.code;
  }
}

/**
 * Map an unknown failure to the safe application error envelope.
 */
export function mapError(error: unknown, requestId?: string): {
  statusCode: number,
  payload: ErrorPayload,
} {
  //only owned errors may select a public status, code, or message
  const applicationError = error instanceof ApplicationError ? error : undefined;
  const statusCode = applicationError?.statusCode || 500;
  const message = applicationError?.expose
    ? applicationError.message
    : 'The request could not be completed';
  return {
    statusCode,
    payload: {
      error: {
        code: applicationError?.errorCode || 'internal_error',
        message,
        requestId
      }
    }
  };
}

/**
 * Replace a route response error with a bounded public JSON envelope.
 */
export function sanitizeRouteError(response: Response) {
  //normalize invalid response codes before deriving the public error class
  const statusCode = response.code >= 400 && response.code <= 599
    ? response.code
    : 500;
  const applicationCode = response.errors.get(APPLICATION_CODE);
  const expose = response.errors.get(APPLICATION_EXPOSE) === 'true';
  const hasApplicationCode = typeof applicationCode === 'string'
    && /^[a-z][a-z0-9_]*$/.test(applicationCode);

  //select only owned application codes; otherwise expose a generic class that
  // does not reveal framework or database details
  const code = hasApplicationCode
    ? applicationCode
    : statusCode === 404
      ? 'not_found'
      : statusCode >= 500
        ? 'internal_error'
        : 'request_rejected';

  //owned, explicitly exposable messages survive; all other failures receive
  // stable status-class wording
  const message = hasApplicationCode && expose && response.error
    ? response.error
    : statusCode === 404
      ? 'Not found'
      : statusCode >= 500
        ? 'The request could not be completed'
        : 'The request was rejected';
  response.set(
    'application/json; charset=utf-8',
    JSON.stringify({ error: { code, message } }),
    statusCode
  );
}
