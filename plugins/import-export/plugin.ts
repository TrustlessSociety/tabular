//client
import type { ApplicationRuntimeService, ApplicationServer } from '../../bootstrap/application.js';
import type { CapabilityPluginService } from '../capability/helpers/service.js';
import type { DatabasePluginService } from '../database/helpers/service.js';
import type { FilesPluginService } from '../files/helpers/service.js';
import type { IdentityPluginService } from '../identity/helpers/service.js';
import type { OperationsPluginService } from '../operations/helpers/service.js';
import type { SavedViewsPluginService } from '../saved-views/helpers/service.js';
import { RUNTIME_SERVICE } from '../../bootstrap/application.js';
import { DATABASE_SERVICE } from '../database/helpers/service.js';
import { IDENTITY_SERVICE } from '../identity/helpers/service.js';
import { CAPABILITY_SERVICE } from '../capability/helpers/service.js';
import { FILES_SERVICE } from '../files/helpers/service.js';
import { SAVED_VIEWS_SERVICE } from '../saved-views/helpers/service.js';
import { OPERATIONS_SERVICE } from '../operations/helpers/service.js';
import {
  IMPORT_EXPORT_SERVICE,
  ImportExportPluginService
} from './helpers/service.js';
import { registerRawImportSourceHandler } from './helpers/raw-upload.js';
import { ImportExportRepository } from './helpers/repository.js';

export const IMPORT_EXPORT_ROUTES = [
  '/pages/import.html',
  '/events/import-export',
  '/events/import-source',
  '/events/import-google-callback'
] as const;

/**
 * Register the import export plugin with the application server.
 */
export default function importExportPlugin(
  //Stackpress discovers the service map dynamically, so this registration
  // boundary cannot name a complete static service map yet
  server: ApplicationServer
) {
  if (server.plugins.has(IMPORT_EXPORT_SERVICE)) {
    throw new Error(`Service already registered: ${IMPORT_EXPORT_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const database = server.plugin<DatabasePluginService>(DATABASE_SERVICE);
  const identity = server.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const capability = server.plugin<CapabilityPluginService>(CAPABILITY_SERVICE);
  const files = server.plugin<FilesPluginService>(FILES_SERVICE);
  const savedViews = server.plugin<SavedViewsPluginService>(SAVED_VIEWS_SERVICE);
  const operations = server.plugin<OperationsPluginService>(OPERATIONS_SERVICE);
  if (!runtime || !database || !identity || !capability || !files || !savedViews || !operations) {
    throw new Error(
      `${DATABASE_SERVICE}, ${IDENTITY_SERVICE}, ${CAPABILITY_SERVICE}, ${FILES_SERVICE}, ${SAVED_VIEWS_SERVICE}, and ${OPERATIONS_SERVICE} must register before ${IMPORT_EXPORT_SERVICE}`
    );
  }
  const service = new ImportExportPluginService(
    runtime,
    database,
    identity,
    capability,
    files,
    savedViews,
    operations
  );
  operations.registerLifecycle('import.commit', async (database, job, event) => {
    const repository = new ImportExportRepository(database);
    if (event === 'cancelled') {
      await repository.cancelConfirmedOperation(job.payload.importId);
    } else if (event === 'retried') {
      if (await repository.restoreForOperationRetry(job.payload.importId) !== 1) {
        throw new Error('Import domain state could not be restored for operation retry');
      }
    } else {
      await repository.markFailed(job.payload.importId, {
        code: 'import_commit_failed',
        message: 'No table was committed; review the source and retry the activity operation.',
        retryable: Number(job.attempts) < 20
      });
    }
  });
  if (runtime.processKind === 'web') {
    server.import.get('/pages/import.html', () => import('./pages/import.js'));
    server.view.get('/pages/import.html', '@/plugins/import-export/views/import');
    server.import.get('/events/import-google-callback', () => import('./pages/events-import-google-callback.js'));
    server.import.get('/events/import-export', () => import('./pages/events-import-export-get.js'));
    server.import.post('/events/import-export', () => import('./pages/events-import-export-post.js'));
    registerRawImportSourceHandler(runtime.rawHandlers, identity, service);
  }
  server.register(IMPORT_EXPORT_SERVICE, service);
  runtime.pluginOrder.push(IMPORT_EXPORT_SERVICE);
}
