import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApplicationError } from '../../../bootstrap/errors.js';
import type { RawHttpHandlerRegistry } from '../../../bootstrap/raw-handlers.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { ImportExportPluginService } from '../helpers/service.js';

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;

export const IMPORT_SOURCE_RAW_ROUTE = 'POST /events/import-source';

/** Registers the streaming upload with the generic pre-Ingest raw handler seam. */
export function registerRawImportSourceHandler(
  registry: RawHttpHandlerRegistry,
  identity: IdentityPluginService,
  importExport: ImportExportPluginService
) {
  registry.register({
    method: 'POST',
    path: '/events/import-source',
    handle: (request, response) => receiveImportSource(
      request,
      response,
      identity,
      importExport
    )
  });
}

export async function receiveImportSource(
  request: IncomingMessage,
  response: ServerResponse,
  identity: IdentityPluginService,
  importExport: ImportExportPluginService
) {
  const url = new URL(request.url || '/', 'http://tabular.invalid');
  exactQuery(url.searchParams, ['folderId', 'kind', 'name', 'commandId']);
  const sourceKind = url.searchParams.get('kind');
  if (sourceKind !== 'csv' && sourceKind !== 'xlsx') invalid('Import source kind is invalid');
  const folderId = parameter(url, 'folderId', 80);
  const sourceName = parameter(url, 'name', 255, true);
  const commandId = parameter(url, 'commandId', 100);
  const contentType = singleHeader(request.headers['content-type']);
  const contentLength = contentLengthHeader(request.headers['content-length']);
  const cookieToken = cookieValue(singleHeader(request.headers.cookie), identity.cookieName());
  const principal = await identity.requireBrowserMutation({
    cookieToken,
    csrfToken: singleHeader(request.headers['x-tabular-csrf']),
    origin: singleHeader(request.headers.origin)
  });
  const staging = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'tabular-import-source-'));
  const sourcePath = path.join(staging, 'source.bin');
  const hash = createHash('sha256');
  let received = 0;
  try {
    await pipeline(
      request,
      new Transform({
        transform(chunk: Buffer | string, encoding, callback) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
          received += bytes.byteLength;
          if (received > MAX_SOURCE_BYTES || received > contentLength) {
            callback(new ApplicationError('import_source_too_large', 413, 'Import source exceeds its declared byte limit'));
            return;
          }
          hash.update(bytes);
          callback(null, bytes);
        }
      }),
      fs.createWriteStream(sourcePath, { flags: 'wx', mode: 0o600 })
    );
    if (received !== contentLength) invalid('Import source length does not match Content-Length');
    await assertMagic(sourcePath, sourceKind, received);
    const operation = await importExport.create(principal, {
      commandId,
      folderId,
      sourceKind,
      sourceName,
      sourceMediaType: contentType,
      sourceSize: received,
      sourceOptions: { uploadSha256: hash.digest('hex') }
    });
    if (!['initiated', 'uploading'].includes(String(operation.state))) {
      sendOperation(response, operation, 200);
      return;
    }
    const stream = fs.createReadStream(sourcePath, { highWaterMark: CHUNK_BYTES });
    let index = 0;
    for await (const chunk of stream) {
      await importExport.appendChunk(principal, String(operation.id), index, Buffer.from(chunk));
      index += 1;
    }
    if (index === 0) {
      await importExport.appendChunk(principal, String(operation.id), 0, Buffer.alloc(0));
    }
    const staged = await importExport.finalizeSource(principal, String(operation.id));
    sendOperation(response, staged, 201);
  } finally {
    await fsPromises.rm(staging, { recursive: true, force: true });
  }
}

function sendOperation(response: ServerResponse, operation: unknown, status: number) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, private');
  response.end(JSON.stringify({ status: 'ok', data: operation }));
}

async function assertMagic(sourcePath: string, kind: 'csv' | 'xlsx', size: number) {
  if (kind === 'csv' || size === 0) return;
  const handle = await fsPromises.open(sourcePath, 'r');
  try {
    const prefix = Buffer.alloc(4);
    const { bytesRead } = await handle.read(prefix, 0, 4, 0);
    if (bytesRead < 4 || prefix[0] !== 0x50 || prefix[1] !== 0x4b) {
      invalid('XLSX source does not contain an OOXML ZIP container');
    }
  } finally {
    await handle.close();
  }
}

function contentLengthHeader(value: string | undefined) {
  if (!value || !/^[0-9]{1,10}$/.test(value)) {
    throw new ApplicationError('length_required', 411, 'Import source requires Content-Length');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_SOURCE_BYTES) {
    throw new ApplicationError('import_source_too_large', 413, 'Import source exceeds 8388608 bytes');
  }
  return parsed;
}

function singleHeader(value: string | string[] | undefined) {
  if (Array.isArray(value)) invalid('Repeated import request header is invalid');
  return value || '';
}

function cookieValue(header: string, name: string) {
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    if (pair.slice(0, index).trim() === name) return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return undefined;
}

function exactQuery(parameters: URLSearchParams, allowed: string[]) {
  if ([...parameters.keys()].some((key) => !allowed.includes(key))) invalid('Import source query is invalid');
}

function parameter(url: URL, key: string, maximum: number, spaces = false) {
  const value = url.searchParams.get(key);
  if (!value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)
    || (!spaces && !/^[A-Za-z0-9_.:-]+$/.test(value))) invalid(`Import source ${key} is invalid`);
  return value;
}

function invalid(message: string): never {
  throw new ApplicationError('invalid_import_source', 400, message);
}
