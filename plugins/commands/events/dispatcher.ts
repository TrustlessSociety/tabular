import type { GridCellPresentation } from '../../grid/helpers/contracts.js';
import type { CommandId, PresentationPatch } from '../helpers/contracts.js';

const size = (id: CommandId) => Number(id.split('.').at(-1)) as GridCellPresentation['fontSize'];

export function presentationPatchForCommand(
  id: CommandId,
  current: GridCellPresentation | { [key: string]: unknown }
): PresentationPatch | undefined {
  if (id === 'format.bold') return { bold: current.bold === true ? false : true };
  if (id === 'format.italic') return { italic: current.italic === true ? false : true };
  if (id === 'format.underline') return { underline: current.underline === true ? false : true };
  if (id.startsWith('format.size.')) return { fontSize: size(id) };
  if (id === 'format.font.arial') return { fontFamily: 'Arial' };
  if (id === 'format.font.georgia') return { fontFamily: 'Georgia' };
  if (id === 'format.font.mono') return { fontFamily: 'Courier New' };
  if (id === 'format.text.reset') return { textColor: null };
  if (id === 'format.text.black') return { textColor: '#111827' };
  if (id === 'format.text.blue') return { textColor: '#174ea6' };
  if (id === 'format.text.red') return { textColor: '#b42318' };
  if (id.startsWith('format.text.color.')) return { textColor: `#${id.slice('format.text.color.'.length)}` };
  if (id === 'format.fill.reset') return { fillColor: null };
  if (id === 'format.fill.gray') return { fillColor: '#64748b' };
  if (id === 'format.fill.blue') return { fillColor: '#3b82f6' };
  if (id === 'format.fill.yellow') return { fillColor: '#facc15' };
  if (id.startsWith('format.fill.color.')) return { fillColor: `#${id.slice('format.fill.color.'.length)}` };
  if (id.startsWith('format.align.')) return { horizontal: id.split('.').at(-1) as 'left' | 'center' | 'right' };
  if (id.startsWith('format.vertical.')) return { vertical: id.split('.').at(-1) as 'top' | 'middle' | 'bottom' };
  if (id.startsWith('format.wrap.')) return { wrap: id.split('.').at(-1) as 'wrap' | 'clip' | 'overflow' };
  if (id.startsWith('format.border.color.')) return { borderColor: `#${id.slice('format.border.color.'.length)}` };
  if (id.startsWith('format.border.style.')) return {
    borderStyle: id.slice('format.border.style.'.length) as GridCellPresentation['borderStyle']
  };
  if (id.startsWith('format.border.')) return { border: id.split('.').at(-1) as GridCellPresentation['border'] };
  if (id === 'format.number.auto') return { numberFormat: 'automatic' };
  if (id === 'format.number.plain') return { numberFormat: 'number' };
  if (id === 'format.number.currency') return { numberFormat: 'currency' };
  if (id === 'format.number.percent') return { numberFormat: 'percent' };
  return undefined;
}
