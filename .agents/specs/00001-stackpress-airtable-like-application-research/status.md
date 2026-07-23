# Status

## Current State

- Spec state: Draft
- Freeze state: Not Frozen
- Research state: Planned; not started
- Proof state: Candidate queue only; no Proof authorized or started
- Implementation state: Out of scope
- Context promotion: Skipped during setup because no research finding has been accepted

## Work Items

| Work item | Status | Next action |
| --- | --- | --- |
| Create and route the spec package | Complete | Keep the manifest and index current |
| Preserve the requested goal and sources | Complete | Confirm setup remains aligned with user intent |
| Define initial Gaps and assumptions | Complete | Revise after user review or new evidence |
| Define the research protocol and queue | Complete | Obtain user review before starting source research |
| Acquire and pin GitHub source revisions | Pending | Record commit SHA, access date, license, and relevant roots for each repository |
| Inventory each named source | Pending | Record architecture, domain, UI, tests, migrations, extension, and operational evidence |
| Extract domain and persistence models | Pending | Build a cross-source model map tied to Gap IDs |
| Extract reusable and rejected patterns | Pending | Build a comparison matrix with tradeoffs and Stackpress placement |
| Map findings onto Stackpress | Pending | Classify native capability, adaptation, application-owned logic, and framework gap |
| Build the snippet catalog | Pending | Preserve minimal excerpts or pseudocode with exact provenance and license notes |
| Resolve the research Gap ledger | Pending | Answer, defer, or escalate every material Gap |
| Select required Proofs | Pending | Keep only uncertainties that source reading cannot resolve |
| Execute approved Proofs | Blocked | Requires research justification and explicit approval of prototype scope |
| Synthesize a recommended starting architecture | Pending | Include product slice, tradeoffs, risks, and rejected alternatives |
| Review findings for context promotion | Pending | Promote only accepted reusable truth and create `.agents/context/index.md` if needed |
| Freeze the research spec | Blocked | Requires completed or accepted research, resolved Proof disposition, no conflicting Gaps, and user acceptance |

## Setup Review Gate

Before research starts, review:

- the research topics and comparison tracks in `research.md`;
- the assumptions and open questions in `decisions.md`;
- the candidate experiments in `proofs.md`.

## Next Action

After user review, begin with source acquisition and architecture/domain-model inventories. Do not start a Proof or implementation task during that pass.
