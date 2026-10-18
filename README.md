# coinPrintMaker
 Making 3MF out of an SVG

## Development fixtures

Representative Inkscape inputs, analytical geometry expectations and verification
instructions: [fixtures/README.md](fixtures/README.md).

## SVG extraction validation

M0.2 prototype, reproducible headless checks and measured library decisions:
[spikes/svg-import/README.md](spikes/svg-import/README.md) and
[docs/design-decisions.md](docs/design-decisions.md).

## Tiered coin / STL validation

M0.3 prototype, generated STL samples, topology/volume evidence and pending
OrcaSlicer checklist: [spikes/tiered-stl/README.md](spikes/tiered-stl/README.md).
Run `npm run spike:stl` to regenerate retained samples and metrics.

## Layered 3MF / joint M0 validation

M0.4 prototype, six paired 3MF samples and automated package/mesh checks:
[spikes/layered-3mf/README.md](spikes/layered-3mf/README.md).
Run `npm run spike:3mf` to regenerate, or
`node scripts/check-layered-3mf.mjs --check` to verify retained artifacts.
Record pending STL and 3MF OrcaSlicer results together in the
[M0 worksheet](docs/m0-slicer-validation.md). M0 remains open pending that evidence.
