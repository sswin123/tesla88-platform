let _activeSSEConnections = 0;

export function incSSE(): void { _activeSSEConnections++; }
export function decSSE(): void { if (_activeSSEConnections > 0) _activeSSEConnections--; }
export function getActiveSSEConnections(): number { return _activeSSEConnections; }
