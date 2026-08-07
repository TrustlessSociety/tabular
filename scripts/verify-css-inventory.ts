import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const publicStyles = path.join(projectRoot, 'public/styles');
const pluginRoots = ['app', 'commands', 'explorer', 'grid', 'identity', 'import-export', 'operations', 'saved-views'];
const inventory: Record<string, string> = {
  'base.css': 'Accessibility/reset layer: root tokens, box sizing, focus-visible outlines, skip links, screen-reader utility, and reduced-motion cascade.',
  'explorer.css': 'Cascade-sensitive explorer shell: responsive grid, menus/dialogs, focus/hover states, and collection layout.',
  'commands.css': 'Cascade-sensitive command surface: positioned menus/submenus, hover/focus/expanded states, palette, and responsive behavior.',
  'grid.css': 'Cascade-sensitive workbench: grid viewport, selection/edit states, panels, focus behavior, responsive overflow, and reduced-motion rules.',
  'identity.css': 'Authentication/account surface: responsive centered shell, form states, and focus/error presentation.',
  'import.css': 'Import workflow: nested wizard states, table presentation, validation states, and 390px responsive layout.',
  'activity.css': 'Operations surface: responsive shell, live/recovery states, dialogs, tables, and reduced-motion behavior.',
  'saved-views.css': 'Fixed overlay/dialog interaction surface with stacking, focus, validation, and confirmation states.',
  'tabulator.css': 'Vendor Tabulator stylesheet; retained unchanged as a third-party exception.'
};

for (const plugin of pluginRoots) {
  const root = path.join(projectRoot, 'plugins', plugin);
  const files = await walk(root);
  assert.equal(files.filter(file => file.endsWith('.css')).length, 0, `${plugin} retains plugin-local CSS`);
}
const styleEntries = await fs.readdir(publicStyles, { withFileTypes: true });
assert.deepEqual(styleEntries.filter(entry => entry.isDirectory()), [], 'public/styles must remain flat');
const cssNames = styleEntries.filter(entry => entry.isFile() && entry.name.endsWith('.css')).map(entry => entry.name).sort();
assert.deepEqual(cssNames, Object.keys(inventory).sort(), 'CSS inventory drifted');
console.log(JSON.stringify({ root: 'public/styles', files: cssNames.map(name => ({ name, justification: inventory[name] })) }, null, 2));

async function walk(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(item));
    else files.push(item);
  }
  return files;
}
