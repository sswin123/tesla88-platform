// Per-provider response format specification.
// response_format in provider_settings selects which formatter to use.

export type FormatKey =
  | 'JSON_SUCCESS'   // default: {"success":true}
  | 'JILI'           // {"code":0,"msg":"success"}
  | 'PG'             // plain text: "SUCCESS"
  | 'EVOLUTION'      // {"status":"OK"}
  | 'PLAYTECH'       // {"errorCode":"0","description":"OK"}
  | 'CQ9'            // {"status":"0000","desc":"success"}
  | string;          // unknown formats fall back to JSON_SUCCESS

export interface FormattedResponse {
  body:        string;
  contentType: string;
  status:      number;
}

const SUCCESS_FORMATS: Record<string, FormattedResponse> = {
  JSON_SUCCESS: {
    body:        JSON.stringify({ success: true }),
    contentType: 'application/json',
    status:      200,
  },
  JILI: {
    body:        JSON.stringify({ code: 0, msg: 'success' }),
    contentType: 'application/json',
    status:      200,
  },
  PG: {
    body:        'SUCCESS',
    contentType: 'text/plain',
    status:      200,
  },
  EVOLUTION: {
    body:        JSON.stringify({ status: 'OK' }),
    contentType: 'application/json',
    status:      200,
  },
  PLAYTECH: {
    body:        JSON.stringify({ errorCode: '0', description: 'OK' }),
    contentType: 'application/json',
    status:      200,
  },
  CQ9: {
    body:        JSON.stringify({ status: '0000', desc: 'success' }),
    contentType: 'application/json',
    status:      200,
  },
};

export function formatSuccess(format: FormatKey): FormattedResponse {
  return SUCCESS_FORMATS[format] ?? SUCCESS_FORMATS['JSON_SUCCESS'];
}
