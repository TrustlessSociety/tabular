# Dependency audit disposition

Audit date: 2026-08-01.

- Exact proof dependencies are locked in `package-lock.json`.
- Vite was updated from 7.3.0 to 7.3.6 after the first audit; this removed the
  high-severity Vite findings, and the proof was rebuilt and rerun.
- One low-severity transitive advisory remains for `esbuild` 0.27.7
  (`GHSA-g7r4-m6w7-qqqr`). It concerns arbitrary file reads from the Vite
  development server on Windows.
- This proof uses a production-style Reactus build and a handwritten Ingest
  server on macOS; it does not expose the Vite development server.
- The compatible Vite dependency range currently prevents moving to the
  advisory's fixed `esbuild` release without an unsupported override.

The residual advisory is therefore contained for this proof, not declared
fixed. Production implementation must re-audit and upgrade Reactus/Vite/esbuild
when a compatible release is available, and must not expose Vite's development
server.
