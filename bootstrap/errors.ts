import type { Response } from '@stackpress/ingest/http';
import IngestException from '@stackpress/ingest/Exception';
import Status from '@stackpress/lib/Status';

const APPLICATION_CODE = '__tabular_application_code';
const APPLICATION_EXPOSE = '__tabular_application_expose';

export type ErrorPayload = {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
};

export class ApplicationError extends IngestException {
  readonly errorCode: string;
  readonly expose: boolean;

  constructor(
    errorCode: string,
    statusCode: number,
    message: string,
    expose = statusCode < 500
  ) {
    if (!Status.get(statusCode)) {
      throw new Error(`Application errors require a registered HTTP status code: ${statusCode}`);
    }
    super(message, statusCode);
    this.name = 'ApplicationError';
    this.errorCode = errorCode;
    this.expose = expose;
    this.withErrors({
      [APPLICATION_CODE]: errorCode,
      [APPLICATION_EXPOSE]: expose ? 'true' : 'false'
    });
  }

  get statusCode() {
    return this.code;
  }
}

export function mapError(error: unknown, requestId?: string): {
  statusCode: number;
  payload: ErrorPayload;
} {
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

export function sanitizeRouteError(response: Response) {
  const statusCode = response.code >= 400 && response.code <= 599
    ? response.code
    : 500;
  const applicationCode = response.errors.get(APPLICATION_CODE);
  const expose = response.errors.get(APPLICATION_EXPOSE) === 'true';
  const hasApplicationCode = typeof applicationCode === 'string'
    && /^[a-z][a-z0-9_]*$/.test(applicationCode);
  const code = hasApplicationCode
    ? applicationCode
    : statusCode === 404
      ? 'not_found'
      : statusCode >= 500
        ? 'internal_error'
        : 'request_rejected';
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
