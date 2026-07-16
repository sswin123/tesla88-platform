import type { ProviderAdapter } from './ProviderAdapter';
import { JiliAdapter } from './adapters/JiliAdapter';

// Registry maps provider name (case-insensitive) → adapter instance.
// To add a new provider: import its adapter and add one line below.
const ADAPTERS: ProviderAdapter[] = [
  new JiliAdapter(),
  // new PgAdapter(),
  // new PragmaticAdapter(),
  // new EvolutionAdapter(),
  // new PlaytechAdapter(),
  // new Cq9Adapter(),
  // new JokerAdapter(),
  // new Live22Adapter(),
  // new AceAdapter(),
  // new Mega888Adapter(),
  // new KissAdapter(),
  // new NewtownAdapter(),
  // new PussyAdapter(),
];

const registry = new Map<string, ProviderAdapter>();
for (const adapter of ADAPTERS) {
  registry.set(adapter.name.toUpperCase(), adapter);
}

export function getAdapter(providerName: string): ProviderAdapter | null {
  return registry.get(providerName.toUpperCase()) ?? null;
}

export function listProviders(): string[] {
  return [...registry.keys()];
}
