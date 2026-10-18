import type { GeneratedCoin, GenerationKey, ValidGeneratedCoin } from './contracts';

// A freshness gate for already-validated results, not a mesh validator.
// Exporters must also validate their actual serialized coordinates.
export function isCurrentValidGeneration(
  result: GeneratedCoin | null,
  current: GenerationKey,
): result is ValidGeneratedCoin {
  return result !== null
    && result.status === 'valid'
    && result.input.importId === current.importId
    && result.input.settingsRevision === current.settingsRevision
    && result.diagnostics.every(diagnostic => diagnostic.severity !== 'error');
}
