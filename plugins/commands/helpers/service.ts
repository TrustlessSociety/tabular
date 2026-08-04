export const COMMANDS_SERVICE = 'tabular.commands';

export type CommandsPluginService = {
  name: typeof COMMANDS_SERVICE;
  menuLabels: readonly ['File', 'Edit', 'View', 'Format'];
  presentationBoundary: 'current-tab';
  storageBoundary: 'no-postgresql-schema-or-value-mutation';
};

export function createCommandsPluginService(): CommandsPluginService {
  return {
    name: COMMANDS_SERVICE,
    menuLabels: ['File', 'Edit', 'View', 'Format'],
    presentationBoundary: 'current-tab',
    storageBoundary: 'no-postgresql-schema-or-value-mutation'
  };
}
