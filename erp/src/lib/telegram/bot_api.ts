const TG_BASE = 'https://api.telegram.org';

export interface TelegramMe {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function call<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<TgResponse<T>> {
  const url = `${TG_BASE}/bot${token}/${method}`;
  const res = await fetch(url, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  return (await res.json()) as TgResponse<T>;
}

export async function getMe(token: string): Promise<TgResponse<TelegramMe>> {
  return call<TelegramMe>(token, 'getMe');
}

export async function setMyName(token: string, name: string): Promise<TgResponse<boolean>> {
  return call<boolean>(token, 'setMyName', { name });
}

export async function setMyDescription(
  token: string,
  description: string,
): Promise<TgResponse<boolean>> {
  return call<boolean>(token, 'setMyDescription', { description });
}

export async function setMyShortDescription(
  token: string,
  short_description: string,
): Promise<TgResponse<boolean>> {
  return call<boolean>(token, 'setMyShortDescription', { short_description });
}
