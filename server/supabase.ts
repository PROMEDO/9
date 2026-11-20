/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export interface DatabaseUrlInfo {
  configured: boolean;
  valid: boolean;
  host?: string;
  port?: number;
  database?: string;
  projectRef?: string;
  error?: string;
}

export interface SupabaseConfig {
  url: string;
  secretKey: string;
}

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

function extractSupabaseRefFromHostAndUser(host: string, username: string): string | undefined {
  const directMatch = host.match(/^db\.([a-z0-9-]+)\.supabase\.(?:co|net)$/i);
  if (directMatch?.[1]) return directMatch[1];

  const poolerUserMatch = username.match(/^postgres\.([a-z0-9-]+)$/i);
  if (poolerUserMatch?.[1] && /supabase\.com$/i.test(host)) {
    return poolerUserMatch[1];
  }
  return undefined;
}

export function getDatabaseUrlInfo(): DatabaseUrlInfo {
  const raw = String(process.env.DATABASE_URL || '').trim();
  if (!raw || raw === 'MY_DATABASE_URL') {
    return { configured: false, valid: false };
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
      return {
        configured: true,
        valid: false,
        error: 'DATABASE_URL must start with postgresql:// or postgres://',
      };
    }
    const host = parsed.hostname;
    const port = parsed.port ? Number(parsed.port) : 5432;
    const database = parsed.pathname.replace(/^\/+/, '') || 'postgres';
    const username = decodeURIComponent(parsed.username || '');
    if (!host) {
      return { configured: true, valid: false, error: 'Missing host in DATABASE_URL' };
    }
    return {
      configured: true,
      valid: true,
      host,
      port: Number.isFinite(port) ? port : 5432,
      database,
      projectRef: extractSupabaseRefFromHostAndUser(host, username),
    };
  } catch {
    // Fallback parser for connection strings containing unescaped characters in password
    const match = raw.match(/^postgres(?:ql)?:\/\/([^:@\s]+):[^@\s]*@([^:/\s]+)(?::(\d+))?\/([^?\s]+)/i);
    if (!match) {
      return {
        configured: true,
        valid: false,
        error: 'Invalid DATABASE_URL connection string format',
      };
    }
    const [, username, host, portStr, database] = match;
    const port = portStr ? Number(portStr) : 5432;
    return {
      configured: true,
      valid: true,
      host,
      port: Number.isFinite(port) ? port : 5432,
      database,
      projectRef: extractSupabaseRefFromHostAndUser(host, username),
    };
  }
}

export function isDatabaseUrlConfigured(): boolean {
  const info = getDatabaseUrlInfo();
  return info.configured && info.valid;
}

export function resolveSupabaseUrl(): string {
  const explicitUrl = String(process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '');

  if (explicitUrl && explicitUrl !== 'MY_SUPABASE_URL') {
    return explicitUrl;
  }

  const dbInfo = getDatabaseUrlInfo();
  if (dbInfo.valid && dbInfo.projectRef) {
    return `https://${dbInfo.projectRef}.supabase.co`;
  }

  return '';
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = resolveSupabaseUrl();
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || '').trim();

  if (!url || !secretKey || secretKey === 'MY_SUPABASE_SECRET_KEY') {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
  } catch {
    return null;
  }

  return { url, secretKey };
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = resolveSupabaseUrl();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();

  if (!url || !anonKey || anonKey === 'MY_SUPABASE_ANON_KEY') {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
  } catch {
    return null;
  }

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function formatSupabaseError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    if (cause?.code || cause?.message) {
      return `${err.message} (${cause.code || cause.message})`;
    }
    return err.message;
  }
  return String(err || 'Supabase error');
}

export function isSupabaseNetworkError(err: unknown): boolean {
  const msg = formatSupabaseError(err).toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('eai_again') ||
    msg.includes('network') ||
    msg.includes('abort')
  );
}

function buildHeaders(secretKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function supabaseSelectAll<T = Record<string, unknown>>(
  table: string,
  select = '*',
  pageSize = 1000
): Promise<T[]> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error('Supabase is not configured');
  }

  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(select)}`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: buildHeaders(cfg.secretKey, {
        Range: `${offset}-${offset + pageSize - 1}`,
        'Range-Unit': 'items',
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Supabase SELECT ${table} failed (${res.status}): ${errText}`);
    }

    const batch = (await res.json()) as T[];
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    allRows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return allRows;
}

export async function supabaseSelectByPrefix<T = Record<string, unknown>>(
  table: string,
  column: string,
  prefix: string,
  select = '*'
): Promise<T[]> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error('Supabase is not configured');
  }

  const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?${encodeURIComponent(
    column
  )}=like.${encodeURIComponent(prefix)}*&select=${encodeURIComponent(select)}`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: buildHeaders(cfg.secretKey),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase PREFIX SELECT ${table} failed (${res.status}): ${errText}`);
  }

  const rows = (await res.json()) as T[];
  return Array.isArray(rows) ? rows : [];
}

export async function supabaseSelectOne<T = Record<string, unknown>>(
  table: string,
  column: string,
  value: string,
  select = '*'
): Promise<T | null> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return null;
  }

  const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?${encodeURIComponent(column)}=eq.${encodeURIComponent(
    value
  )}&select=${encodeURIComponent(select)}&limit=1`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: buildHeaders(cfg.secretKey),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase SELECT ONE ${table} failed (${res.status}): ${errText}`);
  }

  const rows = (await res.json()) as T[];
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export async function supabaseUpsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onConflict: string,
  chunkSize = 200
): Promise<void> {
  const cfg = getSupabaseConfig();
  if (!cfg || rows.length === 0) {
    return;
  }

  const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?on_conflict=${encodeURIComponent(onConflict)}`;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(cfg.secretKey, {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Supabase UPSERT ${table} failed (${res.status}): ${errText}`);
    }
  }
}

export async function supabaseDeleteWhere<T = Record<string, unknown>>(
  table: string,
  column: string,
  value: string
): Promise<T[]> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error('Supabase is not configured');
  }

  const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?${encodeURIComponent(
    column
  )}=eq.${encodeURIComponent(value)}`;

  const res = await fetch(endpoint, {
    method: 'DELETE',
    headers: buildHeaders(cfg.secretKey, {
      Prefer: 'return=representation',
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase DELETE ${table} failed (${res.status}): ${errText}`);
  }

  const deletedRows = (await res.json().catch(() => [])) as T[];
  return Array.isArray(deletedRows) ? deletedRows : [];
}

export async function supabaseDeleteIn(
  table: string,
  column: string,
  values: string[],
  chunkSize = 100
): Promise<void> {
  const cfg = getSupabaseConfig();
  if (!cfg || values.length === 0) {
    return;
  }

  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const encodedList = chunk
      .map((v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
      .join(',');
    const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?${encodeURIComponent(
      column
    )}=in.(${encodeURIComponent(encodedList)})`;

    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: buildHeaders(cfg.secretKey, {
        Prefer: 'return=minimal',
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Supabase DELETE ${table} failed (${res.status}): ${errText}`);
    }
  }
}

export async function checkSupabaseHealth(): Promise<{
  configured: boolean;
  connected: boolean;
  error?: string;
}> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return { configured: false, connected: false };
  }

  try {
    const endpoint = `${cfg.url}/rest/v1/menuplus_kv?select=key&limit=1`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: buildHeaders(cfg.secretKey),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return {
        configured: true,
        connected: false,
        error: `HTTP ${res.status}: ${errText}`,
      };
    }
    return { configured: true, connected: true };
  } catch (err: unknown) {
    return {
      configured: true,
      connected: false,
      error: formatSupabaseError(err),
    };
  }
}
