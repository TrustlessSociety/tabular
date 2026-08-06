const ids = Array.from({ length: 58 }, (_, index) => `W-${String(index + 1).padStart(3, '0')}`);

const chapters = {
  explorer: ids.slice(0, 11),
  grid: ids.slice(11, 25),
  columns: ids.slice(25, 32),
  commands: ids.slice(32, 46),
  import: ids.slice(46, 53),
  accessibility: ids.slice(53, 58)
};

const anchors = {
  explorer: 'data-chapter="explorer"',
  grid: 'data-chapter="grid"',
  columns: 'data-panel="column-settings"',
  commands: 'data-chapter="commands"',
  import: 'data-chapter="import"',
  accessibility: 'aria-label="Tabular spreadsheet"'
};

const guideIds = new Set([
  'W-003', 'W-004', 'W-008', 'W-009', 'W-011', 'W-014', 'W-017', 'W-018',
  'W-023', 'W-024', 'W-028', 'W-029', 'W-031', 'W-034', 'W-035', 'W-042',
  'W-043', 'W-044', 'W-045', 'W-048', 'W-058'
]);

const priorEvidence = {
  'W-021': 'P-001 bounded session history plus Frozen Spec 00001 P-004 authority/version undo proof',
  'W-030': 'P-001 constraint controls plus Frozen Spec 00001 P-007 transactional constraint/DDL failure proof',
  'W-052': 'P-001 progress/failure/changed-source/abandon views plus Frozen Spec 00001 P-006 recovery proof'
};

const r003Evidence = {
  'W-013': {
    status: 'demonstrated',
    evidence: 'R-003 stable-ID logical cell/range/row/column selection projected through Tabulator virtualization.',
    sourceAnchor: 'id="logical-grid"',
    automatedCheck: 'r003-logical-selection-and-virtual-projection'
  },
  'W-020': {
    status: 'demonstrated-with-prior-evidence',
    evidence: 'R-003 aligned range target/copy/clear adapter plus Frozen Spec 00001 P-002 atomic batch transaction.',
    sourceAnchor: 'id="clear-selection"',
    automatedCheck: 'r003-range-target-and-prior-atomic-batch'
  },
  'W-038': {
    status: 'demonstrated',
    evidence: 'R-003 active and mixed toolbar state derives from the logical selection, not mounted cells.',
    sourceAnchor: 'id="bold-selection"',
    automatedCheck: 'r003-selection-aware-presentation-state'
  },
  'W-054': {
    status: 'demonstrated',
    evidence: 'R-003 keeps 1,000-row selection identity while endpoints unmount and exposes logical ARIA counts; native AT remains target validation.',
    sourceAnchor: 'aria-label="Tabular spreadsheet"',
    automatedCheck: 'r003-unmounted-endpoint-and-aria-counts'
  }
};

const blockers = {
  'W-015': 'Searchable relation entry is present; exact URL and phone validation policy remains user-owned.',
  'W-025': 'Row/column presentation persistence remains an explicit personal/shared/session product choice.'
};

export const FEATURE_EVIDENCE = Object.entries(chapters).flatMap(
  ([chapter, featureIds]) => featureIds.map((id) => ({
    id,
    chapter,
    status: r003Evidence[id]?.status ?? (blockers[id] ? 'blocking' : priorEvidence[id] ? 'demonstrated-with-prior-evidence' : guideIds.has(id) ? 'guide' : 'demonstrated'),
    evidence: r003Evidence[id]?.evidence ?? blockers[id] ?? priorEvidence[id] ?? `${chapter} source anchor and focused ${chapter} verification`,
    sourceAnchor: r003Evidence[id]?.sourceAnchor ?? anchors[chapter],
    automatedCheck: r003Evidence[id]?.automatedCheck ?? (
      chapter === 'explorer' ? 'explorer-and-file-state' :
      chapter === 'grid' ? 'grid-edit-draft-and-reorder' :
      chapter === 'columns' ? 'column-metadata-and-relations' :
      chapter === 'commands' ? 'command-and-presentation-contract' :
      chapter === 'import' ? 'import-state-machine' :
      'rendered-browser-accessibility')
  }))
);

export const EXPECTED_WIREFRAME_IDS = ids;
