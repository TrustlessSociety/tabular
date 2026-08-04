import type { GridColumn, GridRow } from '../helpers/contracts.js';

export const REVIEW_COLUMNS: GridColumn[] = [
  {
    id: 'order_id', coordinate: 'A', label: 'Order ID', width: 128,
    editable: false, key: true, required: true, storageCodec: 'text'
  },
  {
    id: 'customer', coordinate: 'B', label: 'Customer', width: 176,
    kind: 'relation', storageCodec: 'text',
    options: [
      { value: 'Northstar Foods', label: 'Northstar Foods — C-1042' },
      { value: 'Lakehouse Supply', label: 'Lakehouse Supply — C-1088' }
    ],
    relation: {
      sourceColumnIds: ['customer'],
      targetFileId: 'obj_review_customers_00000000000000000000000000000000',
      targetLabel: 'CRM / Customers',
      targetColumnIds: ['col_review_customer_id_0000000000000000000000000000'],
      pickerTemplate: '{{company}} — {{customer_id}}',
      outputTemplate: '{{company}}'
    }
  },
  { id: 'channel', coordinate: 'C', label: 'Channel', width: 128 },
  {
    id: 'status', coordinate: 'D', label: 'Status', width: 132,
    kind: 'select', storageCodec: 'text',
    options: ['Pending', 'Confirmed', 'Packed', 'Shipped']
      .map((value) => ({ value, label: value }))
  },
  {
    id: 'order_date', coordinate: 'E', label: 'Order date', width: 140,
    kind: 'date', storageCodec: 'date'
  },
  {
    id: 'units', coordinate: 'F', label: 'Units', width: 104,
    kind: 'number', storageCodec: 'integer'
  },
  {
    id: 'unit_price', coordinate: 'G', label: 'Unit price', width: 128,
    kind: 'number', storageCodec: 'decimal'
  },
  {
    id: 'total', coordinate: 'H', label: 'Total', width: 132,
    kind: 'number', storageCodec: 'decimal', editable: false, generated: true
  },
  { id: 'owner', coordinate: 'I', label: 'Owner', width: 150 },
  { id: 'region', coordinate: 'J', label: 'Region', width: 124 },
  { id: 'updated_at', coordinate: 'K', label: 'Updated', width: 152, editable: false },
  { id: 'notes', coordinate: 'L', label: 'Notes', width: 220 }
];

/** Builds deterministic rows for isolated workbench component tests. */
export function createReviewRows(count = 1_000): GridRow[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    const units = (index % 8) + 1;
    const unitPrice = 180 + ((index * 37) % 1_200);
    const hasData = index < 260;
    return {
      id: String(sequence),
      order_id: hasData ? `ORD-${String(2_400 + sequence).padStart(5, '0')}` : '',
      customer: hasData ? ['Northstar Foods', 'Lakehouse Supply'][index % 2]! : '',
      channel: hasData ? ['Web', 'Marketplace', 'Wholesale'][index % 3]! : '',
      status: hasData ? ['Pending', 'Confirmed', 'Packed', 'Shipped'][index % 4]! : '',
      order_date: hasData
        ? `2026-07-${String((index % 28) + 1).padStart(2, '0')}`
        : '',
      units: hasData ? units : null,
      unit_price: hasData ? unitPrice : null,
      total: hasData ? units * unitPrice : null,
      owner: hasData ? 'Test owner' : '',
      region: hasData ? 'Test region' : '',
      updated_at: hasData ? 'fixture timestamp' : '',
      notes: hasData && index % 7 === 0 ? 'Test note' : ''
    };
  });
}
