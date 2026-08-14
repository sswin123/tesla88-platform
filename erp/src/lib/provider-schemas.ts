// ─── Types ───────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'password' | 'url' | 'number' | 'select' | 'boolean' | 'textarea' | 'radio_group';

export interface RadioGroupChildField {
  key:          string;
  label:        string;
  type:         'text' | 'number';
  placeholder?: string;
  min?:         number;
  max?:         number;
}

export interface RadioGroupOption {
  value:       string;
  label:       string;
  childField?: RadioGroupChildField;
}

export interface SchemaField {
  key:           string;
  label:         string;
  type:          FieldType;
  description?:  string;
  placeholder?:  string;
  required?:     boolean;
  options?:      { label: string; value: string }[];
  min?:          number;
  max?:          number;
  radioOptions?: RadioGroupOption[];
}

export interface ProviderSchema {
  code: string;
  displayName: string;
  /** true = adapter not implemented yet, config/cred forms show a placeholder */
  isStub: boolean;
  config: SchemaField[];
  credentials: SchemaField[];
}

// ─── MEGAH5 ──────────────────────────────────────────────────────────────────

const MEGAH5: ProviderSchema = {
  code: 'MEGAH5',
  displayName: 'MEGA H5',
  isStub: false,
  config: [
    { key: 'api_base_url',        label: 'API Provider URL',            type: 'url',    required: true,  placeholder: 'https://api.example.com' },
    { key: 'datafeed_url',        label: 'DataFeed URL',                type: 'url',    required: false, placeholder: 'https://dtfeed.h5mg888.com' },
    { key: 'h5_api_domain',       label: 'H5 API URL',                  type: 'url',    required: true,  placeholder: 'https://apigame.mg558h5.com' },
    { key: 'h5_lobby_domain',     label: 'H5 Lobby URL',                type: 'url',    required: false, placeholder: 'https://apigame.mg558h5.com' },
    { key: 'h5_game_domain',      label: 'H5 Game URL (CallGame)',      type: 'url',    required: true,  placeholder: 'https://apigame.mg558h5.com' },
    { key: 'game_icon_url',       label: 'Game Icon URL',               type: 'url',    required: false },
    { key: 'postfix_id',          label: 'PostFix ID',                  type: 'text',   required: true,  placeholder: 'e.g. mybrand' },
    {
      key: 'currency', label: 'Currency', type: 'select', required: true,
      options: [
        { label: 'MYR', value: 'MYR' }, { label: 'USD', value: 'USD' },
        { label: 'SGD', value: 'SGD' }, { label: 'THB', value: 'THB' },
        { label: 'IDR', value: 'IDR' }, { label: 'VND', value: 'VND' },
      ],
    },
    { key: 'currency_ratio',      label: 'Currency Ratio',              type: 'number', required: false, placeholder: '1' },
    { key: 'timeout_ms',          label: 'Request Timeout (ms)',        type: 'number', required: false, min: 1000, max: 60000, placeholder: '10000' },
    { key: 'circuit_threshold',   label: 'Circuit Breaker Threshold',   type: 'number', required: false, placeholder: '5' },
    { key: 'circuit_cooldown_ms', label: 'Circuit Breaker Cooldown (ms)', type: 'number', required: false, placeholder: '30000' },
    { key: 'default_lobby_url',   label: 'Default Lobby URL',           type: 'url',    required: false },
    {
      key: 'debug', label: 'Debug Mode', type: 'select', required: false,
      options: [{ label: 'Off', value: 'false' }, { label: 'On', value: 'true' }],
    },
  ],
  credentials: [
    { key: 'api_account_token', label: 'Api Account Token', type: 'password', required: true,  description: 'API Account Token — used for H5 Login body (accessToken) and all outbound Operations API calls (header: token)' },
    { key: 'operator_token',    label: 'Operator Token',    type: 'password', required: true,  description: 'Inbound token sent by MEGAH5 in callback HTTP header "token:" — used to authenticate all 9 callback types' },
    { key: 'secret_key',        label: 'SecretKey',         type: 'password', required: true,  description: 'SecretKey — used in DES-CBC QS construction and MD5 signature (H5 Login)' },
    { key: 'md5_key',           label: 'Md5EncryptKey',     type: 'password', required: true,  description: 'Md5EncryptKey — used in MD5 signature formula: MD5(QS + md5Key + currTime + secretKey)' },
    { key: 'encrypt_key',       label: 'EncryptKey',        type: 'password', required: true,  description: 'EncryptKey (8 bytes) — DES-CBC key and IV for encrypting H5 Login QS into q parameter' },
    { key: 'delimiter',         label: 'Delimiter',         type: 'text',     required: false, description: 'Field separator in signature QS string (default: | )' },
  ],
};

// ─── MEGAAPP ──────────────────────────────────────────────────────────────────

const MEGAAPP: ProviderSchema = {
  code: 'MEGAAPP',
  displayName: 'MEGA888 App',
  isStub: false,
  config: [
    { key: 'api_base_url',    label: 'API Base URL',           type: 'url',     required: true,  placeholder: 'https://mgapi-ali.yidaiyiluclub.com/mega-cloud/api/' },
    {
      key: 'currency', label: 'Default Currency', type: 'select', required: true,
      options: [
        { label: 'MYR', value: 'MYR' }, { label: 'USD', value: 'USD' },
        { label: 'SGD', value: 'SGD' }, { label: 'THB', value: 'THB' },
        { label: 'IDR', value: 'IDR' }, { label: 'VND', value: 'VND' },
      ],
    },
    {
      key:  'password_mode',
      type: 'radio_group',
      label: 'Password Configuration',
      required: false,
      radioOptions: [
        {
          value: 'random',
          label: 'Random Password',
          childField: { key: 'password_length', label: 'Password Length', type: 'number', placeholder: '10', min: 6, max: 20 },
        },
        {
          value: 'fixed',
          label: 'Fixed Password',
          childField: { key: 'fixed_password', label: 'Password', type: 'text', placeholder: 'e.g. Abc123' },
        },
      ],
    },
    { key: 'timeout_ms',      label: 'Request Timeout (ms)',       type: 'number', required: false, min: 3000, max: 60000, placeholder: '15000' },
    { key: 'download_url_android', label: 'APK Download URL (Android)', type: 'url', required: false, placeholder: 'https://...' },
    { key: 'download_url_ios',     label: 'App Store URL (iOS)',         type: 'url', required: false, placeholder: 'https://...' },
    { key: 'apk_version',    label: 'APK Version (optional)',     type: 'text',   required: false, placeholder: 'e.g. 8.8.8' },
    { key: 'apk_name',       label: 'APK Display Name (optional)', type: 'text',  required: false, placeholder: 'e.g. MEGA888' },
    {
      key: 'debug', label: 'Debug Mode', type: 'select', required: false,
      options: [{ label: 'Off', value: 'false' }, { label: 'On', value: 'true' }],
    },
  ],
  credentials: [
    { key: 'secret_code',    label: 'Secret Code (secretCode)', type: 'password', required: true,  description: 'API signing key from Mega agent info sheet' },
    { key: 'sn',             label: 'Hall Code (SN)',            type: 'text',     required: true,  description: '4-char hall code, e.g. ld00' },
    { key: 'agent_login_id', label: 'Agent Login ID',            type: 'text',     required: true,  description: 'Agent/merchant login ID, e.g. Mega1-7238' },
  ],
};

// ─── YES918 ───────────────────────────────────────────────────────────────────

const YES918: ProviderSchema = {
  code: 'YES918',
  displayName: '918KISS (Yes918)',
  isStub: false,
  config: [
    {
      key:         'api_base_url',
      label:       'API Base URL',
      type:        'url',
      required:    true,
      placeholder: 'https://api.yes918.com/ashx',
      description: 'YES918 API endpoint. Default: https://api.yes918.com/ashx',
    },
    {
      key:         'agent_username',
      label:       'Agent Username',
      type:        'text',
      required:    true,
      placeholder: 'e.g. ppph0001',
      description: 'Your agent username on the YES918 platform (shown as AgentId on the API page). Used for RandomUserName and AgentTotalReport calls.',
    },
    {
      key:  'password_mode',
      type: 'radio_group',
      label: 'Password Configuration',
      required: false,
      radioOptions: [
        {
          value: 'random',
          label: 'Random Password',
          childField: { key: 'password_length', label: 'Password Length', type: 'number', placeholder: '10', min: 6, max: 17 },
        },
        {
          value: 'fixed',
          label: 'Fixed Password',
          childField: { key: 'fixed_password', label: 'Password', type: 'text', placeholder: 'e.g. Abc123' },
        },
      ],
    },
    {
      key:         'timeout_ms',
      label:       'Request Timeout (ms)',
      type:        'number',
      required:    false,
      min:         3000,
      max:         60000,
      placeholder: '15000',
    },
    {
      key:         'download_url_android',
      label:       'APK Download URL (Android)',
      type:        'url',
      required:    false,
      placeholder: 'https://...',
      description: '918KISS Android APK 下载地址（由 YES918 官方提供）',
    },
    {
      key:         'download_url_ios',
      label:       'iOS Download URL',
      type:        'url',
      required:    false,
      placeholder: 'https://...',
      description: '918KISS iOS 下载/分发地址（由 YES918 官方提供）',
    },
  ],
  credentials: [
    {
      key:         'authcode',
      label:       'AuthCode',
      type:        'password',
      required:    true,
      description: 'AuthCode from YES918 → API page. Must whitelist your VPS IP first.',
    },
    {
      key:         'secret_key',
      label:       'SecretKey',
      type:        'password',
      required:    true,
      description: 'SecretKey from YES918 → API page. Used in MD5 signature: UPPERCASE(MD5(LOWERCASE(authcode + userName + time + secretKey))).',
    },
  ],
};

// ─── PUSSY888APP ──────────────────────────────────────────────────────────────

const PUSSY888APP: ProviderSchema = {
  code: 'PUSSY888APP',
  displayName: 'Pussy888 App',
  isStub: false,
  config: [
    {
      key:         'api_base_url',
      label:       'API Base URL (Primary)',
      type:        'url',
      required:    true,
      placeholder: 'http://api.pussy888.com',
      description: 'Primary Pussy888 API endpoint.',
    },
    {
      key:         'api_base_url2',
      label:       'API Base URL (Fallback)',
      type:        'url',
      required:    false,
      placeholder: 'http://api2.pussy888.com',
      description: 'Fallback endpoint used when primary is unreachable.',
    },
    {
      key: 'currency', label: 'Default Currency', type: 'select', required: true,
      options: [
        { label: 'MYR', value: 'MYR' }, { label: 'USD', value: 'USD' },
        { label: 'SGD', value: 'SGD' }, { label: 'THB', value: 'THB' },
        { label: 'IDR', value: 'IDR' }, { label: 'VND', value: 'VND' },
      ],
    },
    { key: 'timeout_ms',          label: 'Request Timeout (ms)',        type: 'number', required: false, min: 3000, max: 60000, placeholder: '15000' },
    { key: 'download_url_android', label: 'APK Download URL (Android)', type: 'url',    required: false, placeholder: 'https://...' },
    { key: 'download_url_ios',     label: 'iOS Download URL',           type: 'url',    required: false, placeholder: 'https://...' },
    {
      key: 'debug', label: 'Debug Mode', type: 'select', required: false,
      options: [{ label: 'Off', value: 'false' }, { label: 'On', value: 'true' }],
    },
  ],
  credentials: [
    {
      key:         'agent',
      label:       'Agent Code',
      type:        'text',
      required:    true,
      description: 'Your Pussy888 agent/partner code, e.g. PSYA333. Used as a prefix in player usernames.',
    },
    {
      key:         'authcode',
      label:       'AuthCode',
      type:        'password',
      required:    true,
      description: 'API authentication code sent in every request as ?authcode=. From Pussy888 API settings.',
    },
    {
      key:         'secret_key',
      label:       'SecretKey',
      type:        'password',
      required:    true,
      description: 'Secret key used only for MD5 signature. Never transmitted. Formula: MD5((authcode+userName+time+secretKey).toLowerCase()).',
    },
  ],
};

// ─── Stub helper ─────────────────────────────────────────────────────────────

function stub(code: string, displayName: string): ProviderSchema {
  return { code, displayName, isStub: true, config: [], credentials: [] };
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const REGISTRY: Record<string, ProviderSchema> = {
  MEGAH5,
  MEGAAPP,
  YES918,
  PUSSY888APP,
  KISS918:    stub('KISS918',    '918KISS'),
  '918KISS':  stub('918KISS',   '918KISS'),
  PG:         stub('PG',         'PG Soft'),
  PGSOFT:     stub('PGSOFT',     'PG Soft'),
  JILI:       stub('JILI',       'JILI Games'),
  CQ9:        stub('CQ9',        'CQ9 Gaming'),
  EVOLUTION:  stub('EVOLUTION',  'Evolution Gaming'),
  PLAYTECH:   stub('PLAYTECH',   'Playtech'),
  LIVE22:     stub('LIVE22',     'Live22'),
  SA:         stub('SA',         'SA Gaming'),
  SAGAMING:   stub('SAGAMING',   'SA Gaming'),
  WM:         stub('WM',         'WM Casino'),
  WMCASINO:   stub('WMCASINO',   'WM Casino'),
  PRAGMATIC:  stub('PRAGMATIC',  'Pragmatic Play'),
  NETENT:     stub('NETENT',     'NetEnt'),
  MICROGAMING: stub('MICROGAMING', 'Microgaming'),
  YGGDRASIL:  stub('YGGDRASIL',  'Yggdrasil'),
  REDTIGER:   stub('REDTIGER',   'Red Tiger Gaming'),
  HABANERO:   stub('HABANERO',   'Habanero'),
  SPRIBE:     stub('SPRIBE',     'Spribe'),
  HACKSAW:    stub('HACKSAW',    'Hacksaw Gaming'),
  NOLIMIT:    stub('NOLIMIT',    'Nolimit City'),
  RELAX:      stub('RELAX',      'Relax Gaming'),
  BIGTIME:    stub('BIGTIME',    'Big Time Gaming'),
  ELK:        stub('ELK',        'ELK Studios'),
  PLAYNGO:    stub('PLAYNGO',    "Play'n GO"),
  QUICKSPIN:  stub('QUICKSPIN',  'Quickspin'),
  PUSH:       stub('PUSH',       'Push Gaming'),
  THUNDERKICK: stub('THUNDERKICK', 'Thunderkick'),
};

/**
 * Returns the schema for a given provider code.
 * Unknown providers return a generic stub (isStub: true, empty fields).
 * All providers — including 918KISS — are resolved via REGISTRY.
 */
export function getProviderSchema(code: string): ProviderSchema | null {
  const upper = code.toUpperCase();
  return REGISTRY[upper] ?? stub(upper, upper);
}
