# M0.2 SVG extraction spike

Run `npm ci --ignore-scripts`, `npm test`, then `npm run spike:svg`.
The final command regenerates `fixtures/svg-extraction-verification.json` using
the independent analytical fixture oracles, not snapshots from this adapter.
All inputs, code and retained reports stay in this repository.

`extract.mjs` uses native browser DOMParser and pure geometry libraries, with no
network, UI/rendering state or filesystem dependency. The Node harness installs
jsdom's DOMParser only for headless tests; jsdom is not an app dependency.
It does not execute SVG scripts or fetch references. Errors abort the entire import.
No production app or build is introduced, so root `index.html` remains unchanged.

See [design decisions](../../docs/design-decisions.md) for D-01/D-02, measured
library behavior, fallback policy and limits. This spike is not a public importer
or an exporter. Its permissive fixture-scale resource limits are not a production
security/performance review. Production rollout still needs M1 preflight budgets
and browser end-to-end tests.
