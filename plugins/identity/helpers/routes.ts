//client
import { ApplicationError } from '../../../bootstrap/errors.js';

/**
 * Validate the login form and return only the credentials the identity service needs.
 */
export function loginCredentials(username: unknown, password: unknown) {
  if (
    typeof username !== 'string'
    || username !== username.trim()
    || username.length < 1
    || Buffer.byteLength(username, 'utf8') > 63
    || /[\u0000-\u001f\u007f]/.test(username)
    || typeof password !== 'string'
    || password.length < 1
    || password.length > 1_024
    || password.includes('\u0000')
  ) {
    throw new ApplicationError('authentication_failed', 401, 'Sign-in failed');
  }
  return { roleName: username, password };
}

/**
 * Require the ordinary URL-encoded login form.
 */
export function requireForm(contentType: string | string[] | undefined) {
  if (!isFormContentType(contentType)) {
    throw new ApplicationError('authentication_failed', 401, 'Sign-in failed');
  }
}

/**
 * Return whether a request uses the accepted URL-encoded form content type.
 */
export function isFormContentType(contentType: string | string[] | undefined) {
  return typeof contentType === 'string'
    && /^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(contentType);
}

/**
 * Require an accepted JSON content type for identity mutations.
 */
export function requireJson(contentType: string | string[] | undefined) {
  if (
    typeof contentType !== 'string'
    || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)
  ) {
    throw new ApplicationError('invalid_content_type', 415, 'A JSON request is required');
  }
}
