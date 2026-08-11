/**
 * Adapter Plugin Loader — the ONE file to touch when adding a new provider.
 *
 * Each import triggers the adapter's self-registration via AdapterRegistry.register().
 * The framework (BrandProviderManager, snapshot, health checks) never imports
 * concrete adapter classes — it only calls AdapterRegistry.create().
 *
 * To add a new provider (e.g. JILI):
 *   1. Create  adapters/jili/JiliAdapter.ts   (implement IGameProvider)
 *   2. Create  adapters/jili/index.ts         (call AdapterRegistry.register())
 *   3. Add the line below:                    import './jili';
 *   → Zero changes to Framework core.
 */

import './kiss918';
import './megah5';
import './megaapp';
import './yes918';

// ── Future providers ────────────────────────────────────────────────────────
// import './jili';
// import './pg';
// import './evolution';
// import './pragmatic';
// import './cq9';
// import './ace';
// import './live22';
// import './pussy888';
