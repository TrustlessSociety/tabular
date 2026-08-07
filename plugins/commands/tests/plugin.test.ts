//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { CommandsPluginService } from '../helpers/service.js';
import { createApplication } from '../../../bootstrap/application.js';
import commandsPlugin from '../plugin.js';
import { COMMANDS_SERVICE, createCommandsPluginService } from '../helpers/service.js';

test('commands plugin registers one stable presentation-only service after grid', async () => {
  //Bootstrap through the public application composition so the test exercises
  //the same manifest ordering as every production entrypoint.
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  const commands = application.app.plugin<CommandsPluginService>(COMMANDS_SERVICE);

  //The service advertises the exact accepted menus and explicitly keeps
  //presentation away from PostgreSQL schema and value mutation.
  assert.deepEqual(commands, {
    name: 'tabular.commands',
    menuLabels: [ 'File', 'Edit', 'View', 'Format' ],
    presentationBoundary: 'current-tab',
    storageBoundary: 'no-postgresql-schema-or-value-mutation'
  });
  assert.ok(
    application.runtime.pluginOrder.indexOf('tabular.grid')
      < application.runtime.pluginOrder.indexOf(COMMANDS_SERVICE)
  );
  assert.ok(
    application.runtime.pluginOrder.indexOf('tabular.grid')
      < application.runtime.pluginOrder.indexOf(COMMANDS_SERVICE)
  );

  //A second registration must fail instead of replacing the shared command
  //service with a divergent registry.
  assert.throws(() => commandsPlugin(application.app), /already registered: tabular\.commands/);
});

test('commands service factory is deterministic and plugin prerequisites fail closed', () => {
  //A fresh service instance must expose the same immutable public contract.
  assert.deepEqual(createCommandsPluginService(), createCommandsPluginService());

  //Model an otherwise valid server surface with none of the required services.
  //The plugin must reject it before attempting any registration side effect.
  const registrations: string[] = [];
  const incompleteServer = {
    plugins: new Map<string, unknown>(),
    plugin: () => undefined,
    register: (name: string) => { registrations.push(name); }
  } as unknown as Parameters<typeof commandsPlugin>[0];

  assert.throws(
    () => commandsPlugin(incompleteServer),
    /tabular\.runtime and tabular\.grid must register before tabular\.commands/
  );
  assert.deepEqual(registrations, []);
});
