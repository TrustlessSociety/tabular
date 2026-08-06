//The commands service value exported for module callers
export const COMMANDS_SERVICE = 'tabular.commands';

//The commands plugin service contract exported for module callers
export type CommandsPluginService = {
  name: typeof COMMANDS_SERVICE,
  menuLabels: readonly ['File', 'Edit', 'View', 'Format'],
  presentationBoundary: 'current-tab',
  storageBoundary: 'no-postgresql-schema-or-value-mutation',
};

/**
 * Create the commands plugin service.
 */
export function createCommandsPluginService(): CommandsPluginService {
  return {
    name: COMMANDS_SERVICE,
    menuLabels: ['File', 'Edit', 'View', 'Format'],
    presentationBoundary: 'current-tab',
    storageBoundary: 'no-postgresql-schema-or-value-mutation'
  };
}
