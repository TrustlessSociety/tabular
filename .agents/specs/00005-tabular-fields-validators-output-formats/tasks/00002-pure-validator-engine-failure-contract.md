# Task 00002: Pure Validator Engine and Failure Contract

## Task summary

Implement the closed, versioned, exact and non-coercive Tabular validator
engine independently from database constraints and UI wiring.

## Implementation steps

1. Implement storage-, Field-, and configured-rule composition against Task
   00001 interfaces.
2. Implement compatible rules, stable failure identities, bounded paths,
   duplicate/contradiction checks, and the eight-failure cap with overflow.
3. Preserve SQL NULL, empty, zero, false, exact numeric, temporal, and bounded
   pattern/JSON semantics.
4. Add isolated exhaustive tests without editing shared wiring.

## Verification process

Run focused validator unit and contract tests covering exact numeric and
temporal comparisons, pattern bounds, JSON depth, composition order,
duplicates/contradictions, and Stackpress-regression cases.

## Acceptance criteria

Acceptance criteria: none; browser projection belongs to Task 00006.

## Implementation notes

- Assigned to `validator_worker` after Task 00001 verification.
- Started after Task 00001 verification. Exact allow-list:
  `src/plugins/files/helpers/validator-engine.ts` and
  `tests/plugins/files/validator-engine.test.ts` only.
- Worker stayed within the allow-list. Coordinator reviewed exact numeric and
  temporal handling, rule composition, bounded pattern/JSON behavior, stable
  failures, and duplicate/contradiction checks.

## Verification notes

- Worker: 15 focused validator tests passed; typecheck and diff check passed.
- Coordinator rerun: all 15 validator tests passed together with 16 codec/editor
  tests and full typecheck (31 tests total).

## Acceptance notes

- No visual acceptance applies; the task finishes at `verified`.
