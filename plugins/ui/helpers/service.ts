export const UI_SERVICE = 'tabular.ui';

export type UiPluginService = {
  name: typeof UI_SERVICE;
  shell: 'reactus';
  density: 'compact';
  theme: 'grayscale-blue-focus';
};

export function createUiPluginService(): UiPluginService {
  return {
    name: UI_SERVICE,
    shell: 'reactus',
    density: 'compact',
    theme: 'grayscale-blue-focus'
  };
}
