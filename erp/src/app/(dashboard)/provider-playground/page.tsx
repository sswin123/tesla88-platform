'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProviderOption {
  provider:        string;
  display_name:    string;
  enabled:         boolean;
  environment:     string;
  response_format: string;
}

interface PlaygroundResult {
  provider:         string;
  targetUrl:        string;
  status:           number;
  responseBody:     string;
  processingMs:     number;
  error?:           string;
  sentAt:           string;
}

interface HistoryEntry extends PlaygroundResult {
  action: string;
  requestBody: string;
}

// ── Mock payload templates ─────────────────────────────────────────────────────

const MOCK_PAYLOADS: Record<string, (provider: string) => Record<string, unknown>> = {
  BALANCE_QUERY: (p) => ({
    action: 'getbalance', provider: p,
    userId: 'SS1000001', currency: 'MYR',
    timestamp: Math.floor(Date.now() / 1000),
  }),
  DEBIT: (p) => ({
    action: 'debit', provider: p,
    userId: 'SS1000001', amount: 10.00, currency: 'MYR',
    transactionId: `TX${Date.now()}`,
    roundId: `RD${Date.now()}`, gameId: 'GAME001',
    timestamp: Math.floor(Date.now() / 1000),
  }),
  CREDIT: (p) => ({
    action: 'credit', provider: p,
    userId: 'SS1000001', amount: 15.50, currency: 'MYR',
    transactionId: `TX${Date.now()}`,
    roundId: `RD${Date.now()}`, gameId: 'GAME001',
    timestamp: Math.floor(Date.now() / 1000),
  }),
  ROLLBACK: (p) => ({
    action: 'rollback', provider: p,
    userId: 'SS1000001', currency: 'MYR',
    transactionId: `TX${Date.now()}`,
    originalTransactionId: `TX${Date.now() - 5000}`,
    timestamp: Math.floor(Date.now() / 1000),
  }),
  SETTLEMENT: (p) => ({
    action: 'settle', provider: p,
    userId: 'SS1000001', currency: 'MYR',
    transactionId: `TX${Date.now()}`,
    roundId: `RD${Date.now()}`, gameId: 'GAME001',
    betAmount: 10.00, winAmount: 25.00, amount: 25.00,
    timestamp: Math.floor(Date.now() / 1000),
  }),
};

const ACTIONS = ['BALANCE_QUERY', 'DEBIT', 'CREDIT', 'ROLLBACK', 'SETTLEMENT'];
const CALLBACK_URL = 'https://apidemo.club/api/provider/callback';

// ── Provider Documentation ─────────────────────────────────────────────────────

const PROVIDER_DOCS: Record<string, {
  callbackFields: string;
  signatureAlgo: string;
  responseFormat: string;
  notes: string;
}> = {
  JILI: {
    callbackFields: 'action, userId, currency, transactionId, amount, roundId, gameId, timestamp, sign',
    signatureAlgo:  'MD5(agentId + userId + transactionId + amount + agentSecret)',
    responseFormat: '{"code":0,"msg":"success"} on success\n{"code":1,"msg":"ERROR_MSG"} on failure',
    notes:          'Retry: 3 attempts × 5s interval. Timeout: 10s per request.',
  },
  PG: {
    callbackFields: 'operatorId, playerId, currency, txnId, amount, gameId, roundId',
    signatureAlgo:  'No signature (IP whitelist only)',
    responseFormat: 'Plain text "SUCCESS" on success\nPlain text error message on failure',
    notes:          'PG uses Transfer Wallet. Transfer IN before launch; Transfer OUT after session.',
  },
  EVOLUTION: {
    callbackFields: 'sid, uuid, token, action, value, currency',
    signatureAlgo:  'HMAC-SHA256(secret, requestBody)',
    responseFormat: '{"status":"OK","uuid":"..."} on success',
    notes:          'Evolution uses WebSocket session tokens. Validate token on every callback.',
  },
  PRAGMATIC: {
    callbackFields: 'providerId, hash, userId, currency, amount, transactionId, roundId',
    signatureAlgo:  'MD5(providerId + userId + currency + ... + secretKey)',
    responseFormat: '{"error":0,"description":"ok","currency":"MYR","cash":balance}',
    notes:          'Pragmatic sends end-of-round settlement. Debit only locks bet; Credit = win.',
  },
  PLAYTECH: {
    callbackFields: 'username, amount, currency, transactionType, transactionId, gameId',
    signatureAlgo:  'MD5(username + amount + currency + transactionId + secret)',
    responseFormat: '{"errorCode":"0","balance":balance}',
    notes:          'PlayTech uses both Seamless and Transfer wallet depending on product.',
  },
};

// ── Components ─────────────────────────────────────────────────────────────────

function s(style: React.CSSProperties): React.CSSProperties { return style; }

function StatusBadge({ code }: { code: number }) {
  const ok = code >= 200 && code < 300;
  return (
    <span style={s({
      display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12,
      fontWeight: 700, background: ok ? '#16a34a22' : '#ef444422',
      color: ok ? '#22c55e' : '#ef4444',
    })}>
      HTTP {code || 'ERR'}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProviderPlaygroundPage() {
  const [providers,       setProviders]       = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('JILI');
  const [selectedAction,  setSelectedAction]  = useState('BALANCE_QUERY');
  const [requestBody,     setRequestBody]     = useState('');
  const [extraHeaders,    setExtraHeaders]    = useState('{}');
  const [sending,         setSending]         = useState(false);
  const [result,          setResult]          = useState<PlaygroundResult | null>(null);
  const [history,         setHistory]         = useState<HistoryEntry[]>([]);
  const [tab,             setTab]             = useState<'playground' | 'docs'>('playground');

  useEffect(() => {
    fetch('/api/provider-settings')
      .then(r => r.json())
      .then((d: { providers: ProviderOption[] }) => setProviders(d.providers ?? []))
      .catch(() => {});
  }, []);

  const refreshBody = useCallback((provider: string, action: string) => {
    const fn = MOCK_PAYLOADS[action];
    setRequestBody(JSON.stringify(fn ? fn(provider) : {}, null, 2));
  }, []);

  useEffect(() => { refreshBody(selectedProvider, selectedAction); }, [selectedProvider, selectedAction, refreshBody]);

  async function send() {
    setSending(true);
    let parsed: unknown;
    try { parsed = JSON.parse(requestBody); } catch { parsed = {}; }
    let parsedHeaders: Record<string, string> = {};
    try { parsedHeaders = JSON.parse(extraHeaders) as Record<string, string>; } catch { /* ignore */ }

    try {
      const r = await fetch('/api/provider-settings/mock', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ provider: selectedProvider, headers: parsedHeaders, body: parsed }),
      });
      const d = await r.json() as PlaygroundResult;
      setResult(d);
      setHistory(prev => [{
        ...d,
        action:      selectedAction,
        requestBody: requestBody,
      }, ...prev].slice(0, 20));
    } catch (e) {
      setResult({
        provider: selectedProvider, targetUrl: CALLBACK_URL,
        status: 0, responseBody: '',
        processingMs: 0,
        error: e instanceof Error ? e.message : String(e),
        sentAt: new Date().toISOString(),
      });
    }
    setSending(false);
  }

  const docs = PROVIDER_DOCS[selectedProvider];

  return (
    <div style={s({ padding: 24, color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' })}>
      {/* Header */}
      <div style={s({ marginBottom: 20 })}>
        <h1 style={s({ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#f1f5f9' })}>
          Provider API Playground
        </h1>
        <code style={s({ fontSize: 12, color: '#38bdf8' })}>POST {CALLBACK_URL}</code>
      </div>

      {/* Tabs */}
      <div style={s({ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid #1e293b' })}>
        {(['playground', 'docs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={s({
            padding: '8px 18px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
            color: tab === t ? '#3b82f6' : '#64748b',
            borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
          })}>
            {t === 'playground' ? 'Playground' : 'Documentation'}
          </button>
        ))}
      </div>

      {/* ── Playground Tab ─────────────────────────────────────────────────────── */}
      {tab === 'playground' && (
        <div style={s({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 })}>
          {/* Left: Request */}
          <div>
            <h3 style={s({ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#94a3b8' })}>Request</h3>

            {/* Provider + Action selectors */}
            <div style={s({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 })}>
              <div>
                <label style={s({ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 })}>
                  Provider
                </label>
                <select
                  value={selectedProvider}
                  onChange={e => setSelectedProvider(e.target.value)}
                  style={s({ width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0' })}
                >
                  {providers.length > 0
                    ? providers.map(p => (
                        <option key={p.provider} value={p.provider}>{p.provider} — {p.display_name}</option>
                      ))
                    : <option value={selectedProvider}>{selectedProvider}</option>
                  }
                </select>
              </div>
              <div>
                <label style={s({ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 })}>
                  Action
                </label>
                <select
                  value={selectedAction}
                  onChange={e => setSelectedAction(e.target.value)}
                  style={s({ width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0' })}
                >
                  {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {/* JSON body */}
            <div style={s({ marginBottom: 10 })}>
              <div style={s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 })}>
                <label style={s({ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' })}>
                  Request Body (JSON)
                </label>
                <button
                  onClick={() => refreshBody(selectedProvider, selectedAction)}
                  style={s({ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer' })}
                >
                  ↺ Reset
                </button>
              </div>
              <textarea
                value={requestBody}
                onChange={e => setRequestBody(e.target.value)}
                rows={12}
                spellCheck={false}
                style={s({
                  width: '100%', padding: '10px 12px', borderRadius: 6, fontSize: 12,
                  fontFamily: 'monospace', border: '1px solid #334155',
                  background: '#0f172a', color: '#a5f3fc', resize: 'vertical', outline: 'none',
                  boxSizing: 'border-box',
                })}
              />
            </div>

            {/* Extra headers */}
            <div style={s({ marginBottom: 14 })}>
              <label style={s({ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 })}>
                Extra Headers (JSON)
              </label>
              <textarea
                value={extraHeaders}
                onChange={e => setExtraHeaders(e.target.value)}
                rows={3}
                spellCheck={false}
                style={s({
                  width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 12,
                  fontFamily: 'monospace', border: '1px solid #334155',
                  background: '#0f172a', color: '#94a3b8', resize: 'none', outline: 'none',
                  boxSizing: 'border-box',
                })}
              />
            </div>

            <button
              onClick={send}
              disabled={sending}
              style={s({
                width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                background: sending ? '#334155' : '#3b82f6', color: '#fff',
                cursor: sending ? 'default' : 'pointer', fontSize: 14, fontWeight: 700,
              })}
            >
              {sending ? 'Sending…' : `▶ Send Callback to ${selectedProvider}`}
            </button>
          </div>

          {/* Right: Response + History */}
          <div>
            <h3 style={s({ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#94a3b8' })}>Response</h3>

            {result ? (
              <div>
                <div style={s({ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 })}>
                  <StatusBadge code={result.status} />
                  <span style={s({ fontSize: 12, color: '#64748b' })}>{result.processingMs}ms</span>
                  <span style={s({ fontSize: 11, color: '#475569' })}>{result.sentAt}</span>
                </div>
                {result.error && (
                  <p style={s({ color: '#ef4444', fontSize: 13, margin: '0 0 8px' })}>{result.error}</p>
                )}
                <pre style={s({
                  background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6,
                  padding: '12px 14px', fontSize: 12, fontFamily: 'monospace',
                  color: '#a5f3fc', overflow: 'auto', margin: 0, maxHeight: 200,
                })}>
                  {(() => {
                    try { return JSON.stringify(JSON.parse(result.responseBody), null, 2); }
                    catch { return result.responseBody || '(empty)'; }
                  })()}
                </pre>
              </div>
            ) : (
              <div style={s({ background: '#0f172a', border: '1px dashed #1e293b', borderRadius: 8, padding: 24, textAlign: 'center', color: '#334155', fontSize: 13 })}>
                Send a callback to see the response here
              </div>
            )}

            {/* History */}
            {history.length > 0 && (
              <div style={s({ marginTop: 20 })}>
                <h4 style={s({ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#64748b' })}>
                  Recent Tests ({history.length})
                </h4>
                <div style={s({ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflow: 'auto' })}>
                  {history.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => { setResult(h); setRequestBody(h.requestBody); setSelectedAction(h.action); }}
                      style={s({
                        background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6,
                        padding: '8px 12px', cursor: 'pointer', textAlign: 'left',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      })}
                    >
                      <span style={s({ fontSize: 12, color: '#94a3b8' })}>
                        <span style={s({ color: '#f1f5f9', fontWeight: 600 })}>{h.provider}</span>
                        {' · '}{h.action}
                      </span>
                      <div style={s({ display: 'flex', gap: 8, alignItems: 'center' })}>
                        <StatusBadge code={h.status} />
                        <span style={s({ fontSize: 11, color: '#475569' })}>{h.processingMs}ms</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Documentation Tab ──────────────────────────────────────────────────── */}
      {tab === 'docs' && (
        <div style={s({ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 })}>
          {/* Provider list */}
          <div>
            {Object.keys(PROVIDER_DOCS).map(p => (
              <button
                key={p}
                onClick={() => setSelectedProvider(p)}
                style={s({
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', marginBottom: 4, borderRadius: 6, border: 'none',
                  background: selectedProvider === p ? '#1e3a5f' : 'transparent',
                  color: selectedProvider === p ? '#38bdf8' : '#94a3b8',
                  cursor: 'pointer', fontSize: 13, fontWeight: selectedProvider === p ? 700 : 400,
                })}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Docs content */}
          {docs ? (
            <div>
              <h2 style={s({ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: '#f1f5f9' })}>
                {selectedProvider}
              </h2>
              {[
                { label: 'Callback URL', content: CALLBACK_URL, mono: true },
                { label: 'Callback Fields', content: docs.callbackFields, mono: false },
                { label: 'Signature Algorithm', content: docs.signatureAlgo, mono: true },
                { label: 'Response Format', content: docs.responseFormat, mono: true },
                { label: 'Notes', content: docs.notes, mono: false },
              ].map(({ label, content, mono }) => (
                <div key={label} style={s({ marginBottom: 20 })}>
                  <h4 style={s({ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 })}>{label}</h4>
                  {mono ? (
                    <pre style={s({
                      background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6,
                      padding: '10px 14px', fontSize: 12, fontFamily: 'monospace',
                      color: '#a5f3fc', margin: 0, whiteSpace: 'pre-wrap',
                    })}>{content}</pre>
                  ) : (
                    <p style={s({ margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.6 })}>{content}</p>
                  )}
                </div>
              ))}

              {/* Example payload */}
              <div>
                <h4 style={s({ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 })}>
                  Example Debit Payload
                </h4>
                <pre style={s({
                  background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6,
                  padding: '10px 14px', fontSize: 12, fontFamily: 'monospace',
                  color: '#a5f3fc', margin: 0,
                })}>
                  {JSON.stringify(MOCK_PAYLOADS.DEBIT(selectedProvider), null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div style={s({ color: '#475569', fontSize: 14 })}>
              Select a provider to view documentation.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
