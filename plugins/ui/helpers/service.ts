//The ui service value exported for module callers
export const UI_SERVICE = 'tabular.ui';

//The ui plugin service contract exported for module callers
export type UiPluginService = {
  name: typeof UI_SERVICE,
  shell: 'reactus',
  density: 'compact',
  theme: 'grayscale-blue-focus',
};

/**
 * Create the ui plugin service.
 */
export function createUiPluginService(): UiPluginService {
  return {
    name: UI_SERVICE,
    shell: 'reactus',
    density: 'compact',
    theme: 'grayscale-blue-focus'
  };
}
