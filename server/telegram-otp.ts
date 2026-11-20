/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyChanges,
  deleteInternalStoreItem,
  getInternalStoreItem,
  readAll,
  readPrefixFromStore,
  setInternalStoreItem,
} from './neon-store.ts';
import {
  formatSupabaseError,
  isSupabaseConfigured,
  isSupabaseNetworkError,
  supabaseDeleteWhere,
  supabaseSelectAll,
  supabaseUpsert,
} from './supabase.ts';

export interface TelegramUserRecord {
  phone: string;
  normalizedPhone: string;
  chatId: number | string;
  username?: string;
  firstName?: string;
  linkedAt: number;
  lastSentAt?: number;
  verifiedContact?: boolean;
}

export interface TelegramBotConfig {
  enabled: boolean;
  botUsername: string;
  botTokenOverride?: string;
  proxyUrl?: string;
  welcomeSharePhoneText: string;
  verifiedSuccessText: string;
  orderHeaderText: string;
  orderFooterText: string;
  updatedAt?: string;
}

export interface IncomingTelegramMessage {
  message_id: number;
  date?: number;
  chat: { id: number; username?: string; first_name?: string };
  text?: string;
  contact?: { phone_number: string; first_name?: string; user_id?: number };
  from?: { id: number; username?: string; first_name?: string };
}

interface PendingOrderLink {
  token: string;
  rid: string;
  phone: string;
  createdAt: number;
}

const pendingOrderLinks = new Map<string, PendingOrderLink>();
const pendingLinkTokenByChatId = new Map<string, { token: string; requestedAt: number }>();
const processedUpdateIds = new Set<number>();
const processedMessageKeys = new Set<string>();

function normalizeBotToken(raw: unknown): string {
  let s = String(raw ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .trim();
  if (!s) return '';
  // Never treat UI-masked values (e.g. "••••••••" or "925212••••eF0Q") as a real token
  if (s.includes('•') || s.includes('*')) {
    return '';
  }
  s = s.replace(/%3A/gi, ':');
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) || (s.startsWith('`') && s.endsWith('`'))) {
    s = s.slice(1, -1).trim();
  }
  // Ignore common placeholder values
  if (/^(MY_|YOUR_|EXAMPLE_|TEST_|PLACEHOLDER)/i.test(s)) {
    return '';
  }
  // Extract exact <bot_id>:<secret> if embedded in URL, ENV assignment, or BotFather message
  const embeddedMatch = s.match(/(\d{5,15}:[A-Za-z0-9_-]{20,})/);
  if (embeddedMatch && embeddedMatch[1]) {
    return embeddedMatch[1].trim();
  }
  // Handle accidental whitespace/newlines/quotes inside a pasted token
  const compact = s.replace(/[\s"'`]+/g, '');
  const compactMatch = compact.match(/(?:^bot)?(\d{5,15}:[A-Za-z0-9_-]{20,})/i);
  if (compactMatch && compactMatch[1]) {
    return compactMatch[1].trim();
  }
  // Strip accidental "bot" prefix or ENV assignment prefix on malformed tokens so error checks stay clean
  s = s.replace(/^(?:TELEGRAM_BOT_TOKEN|BOT_TOKEN)\s*=\s*/i, '').trim();
  s = s.replace(/^bot(?=\d{5,}:)/i, '');
  return s.trim();
}

function isValidBotTokenFormat(token: string): boolean {
  if (!token) return false;
  if (/^(MY_|YOUR_|EXAMPLE_|TEST_|PLACEHOLDER)/i.test(token)) return false;
  return /^\d{5,}:[A-Za-z0-9_-]{15,}$/.test(token);
}

function getTokenSourceLabel(source: 'override' | 'env' | 'none'): string {
  if (source === 'override') return 'إعدادات الأدمن';
  if (source === 'env') return 'متغير البيئة TELEGRAM_BOT_TOKEN';
  return 'غير محدد';
}

function formatTelegramTokenError(
  status: number,
  description?: string,
  source: 'override' | 'env' | 'none' = 'none',
  token?: string
): string {
  const desc = String(description || '').trim();
  const sourceSuffix =
    source !== 'none'
      ? ` (المصدر: ${getTokenSourceLabel(source)}${token ? ` · ${maskToken(token)}` : ''})`
      : '';
  if (status === 404 || /not found/i.test(desc)) {
    return `توكن البوت غير صالح أو محذوف (404 Not Found)${sourceSuffix} — تأكد من نسخ التوكن الصحيح من @BotFather وإضافته في إعدادات الأدمن أو متغير TELEGRAM_BOT_TOKEN بدون كلمة bot أو مسافات.`;
  }
  if (status === 401 || /unauthorized/i.test(desc)) {
    return `توكن البوت غير صالح أو ملغى (401 Unauthorized)${sourceSuffix} — يرجى تحديث التوكن من @BotFather.`;
  }
  return desc || `HTTP ${status}`;
}

function getEnvBotToken(): string {
  return normalizeBotToken(process.env.TELEGRAM_BOT_TOKEN || '');
}

function getEnvBotUsername(): string {
  return (process.env.TELEGRAM_BOT_USERNAME || 'MenuPlus_bot').trim().replace(/^@+/, '') || 'MenuPlus_bot';
}

const ENV_BOT_USERNAME = getEnvBotUsername();

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TELEGRAM_USERS_FILE = path.resolve(DATA_DIR, 'telegram-users.json');
const TELEGRAM_CONFIG_FILE = path.resolve(DATA_DIR, 'telegram-config.json');
const TELEGRAM_POLL_STATE_FILE = path.resolve(DATA_DIR, 'telegram-poll-state.json');
const TELEGRAM_CONFIG_KV_KEY = 'settings/telegram_config';
const TELEGRAM_POLL_STATE_KV_KEY = 'settings/telegram_poll_state';
const TELEGRAM_USERS_KV_PREFIX = 'telegram_users_db/';
const TELEGRAM_PENDING_LINKS_KV_PREFIX = 'telegram_order_links/';
const TELEGRAM_PENDING_CHAT_LINK_KV_PREFIX = 'telegram_pending_chat_link/';
const TELEGRAM_MSG_LOCK_KV_PREFIX = 'telegram_msg_lock/';

const telegramUsers = new Map<string, TelegramUserRecord>();

export const DEFAULT_TELEGRAM_PROXY_URL =
  'https://t.me/proxy?server=heremit.larval.nonce.rubricate.textbook.watchpinoyteleserye.com&port=1250&secret=eeeaa279236535275f4071a1279335415773332e616d617a6f6e6177732e636f6d&bot=@mtpro_xyz_bot&channel=@mtpro_xyz';

function sanitizeTelegramProxyUrl(raw: unknown): string {
  const s = String(raw ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .trim();
  if (!s) return '';
  if (/^tg:\/\/proxy\?/i.test(s)) {
    const query = s.slice('tg://proxy?'.length);
    const params = new URLSearchParams(query);
    if (!params.get('server')?.trim()) return '';
    return `tg://proxy?${query}`;
  }
  try {
    const normalizedInput = /^t\.me\/proxy\?/i.test(s) ? `https://${s}` : s;
    const parsed = new URL(normalizedInput);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    const host = parsed.hostname.toLowerCase();
    if (host !== 't.me' && host !== 'telegram.me') return '';
    if (!parsed.pathname.toLowerCase().startsWith('/proxy')) return '';
    if (!parsed.searchParams.get('server')?.trim()) return '';
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return '';
  }
}

const DEFAULT_TELEGRAM_CONFIG: TelegramBotConfig = {
  enabled: true,
  botUsername: ENV_BOT_USERNAME || 'MenuPlus_bot',
  botTokenOverride: '',
  proxyUrl: DEFAULT_TELEGRAM_PROXY_URL,
  welcomeSharePhoneText:
    'أهلاً بك في بوت إشعارات الطلبات.\nلاستلام طلبات متجرك مباشرة عبر تيليجرام، اضغط على زر «مشاركة رقم هاتفي لاستقبال الطلبات» بالأسفل.',
  verifiedSuccessText:
    'تم ربط حسابك بنجاح ✅\nستصلك جميع طلبات متجرك أو مطعمك الجديدة هنا مباشرة فور وصولها.',
  orderHeaderText: '🔔 طلب جديد',
  orderFooterText: '',
};

let cachedTelegramConfig: TelegramBotConfig = { ...DEFAULT_TELEGRAM_CONFIG };
let hasLoadedConfigFromKv = false;
let lastPollError = '';
let lastSendError = '';
const lastSendErrorByRid = new Map<string, string>();
let lastTokenError = '';
let lastTokenErrorAt = 0;
let lastPollSuccessAt = 0;
let verifiedTokenHash = '';
let verifiedTokenUsername = '';
let verifiedTokenBotName = '';
let tokenIdentityCheckPromise: Promise<void> | null = null;

function getTokenHash(token: string): string {
  if (!token) return '';
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

function writeFileAtomicSync(filePath: string, content: string): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function isLegacyOtpTemplateText(text: string): boolean {
  return /رمز التحقق|سيتم الآن إرسال رمز|أتممت خطوة التحقق|لإتمام تسجيل|لتسجيل الدخول|كود التحقق/i.test(text);
}

function isLegacyOrderHeaderText(text: string): boolean {
  const clean = String(text || '').trim();
  return clean === '🛎️ وصل طلب جديد!' || clean === 'وصل طلب جديد!' || clean === '🛍️ طلب جديد وصلك عبر منيو بلس';
}

function sanitizeConfigObject(raw: Partial<TelegramBotConfig> | null | undefined): TelegramBotConfig {
  const src = raw && typeof raw === 'object' ? raw : {};
  const cleanUsername =
    String(src.botUsername || ENV_BOT_USERNAME || 'MenuPlus_bot')
      .trim()
      .replace(/^@+/, '')
      .replace(/[^a-zA-Z0-9_]/g, '') || 'MenuPlus_bot';
  const cleanToken = typeof src.botTokenOverride === 'string' ? normalizeBotToken(src.botTokenOverride) : '';
  const rawWelcome = String(src.welcomeSharePhoneText || '').trim();
  const rawVerified = String(src.verifiedSuccessText || '').trim();
  const rawOrderHeader = String(src.orderHeaderText || '').trim();

  const rawProxyUrl = typeof src.proxyUrl === 'string' ? sanitizeTelegramProxyUrl(src.proxyUrl) : '';

  return {
    enabled: src.enabled !== false,
    botUsername: cleanUsername,
    botTokenOverride: cleanToken,
    proxyUrl: rawProxyUrl || DEFAULT_TELEGRAM_PROXY_URL,
    welcomeSharePhoneText:
      !rawWelcome || isLegacyOtpTemplateText(rawWelcome)
        ? DEFAULT_TELEGRAM_CONFIG.welcomeSharePhoneText
        : rawWelcome,
    verifiedSuccessText:
      !rawVerified || isLegacyOtpTemplateText(rawVerified)
        ? DEFAULT_TELEGRAM_CONFIG.verifiedSuccessText
        : rawVerified,
    orderHeaderText:
      !rawOrderHeader || isLegacyOrderHeaderText(rawOrderHeader)
        ? DEFAULT_TELEGRAM_CONFIG.orderHeaderText
        : rawOrderHeader,
    orderFooterText: (() => {
      const rawFooter = String(src.orderFooterText || '').trim();
      return rawFooter === 'تواصل مع الزبون أو تابع تفاصيل الطلب من لوحة التحكم.' ? '' : rawFooter;
    })(),
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : undefined,
  };
}

function loadConfigFromDiskSync(): void {
  try {
    if (fs.existsSync(TELEGRAM_CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf-8')) as Partial<TelegramBotConfig>;
      cachedTelegramConfig = sanitizeConfigObject(parsed);
    }
  } catch (err) {
    console.warn('[Telegram Config] Failed loading local config file:', err);
  }
}

export async function loadTelegramConfigFromStore(force = false): Promise<TelegramBotConfig> {
  if (hasLoadedConfigFromKv && !force) {
    return cachedTelegramConfig;
  }
  try {
    const kvConfig = await getInternalStoreItem<Partial<TelegramBotConfig>>(TELEGRAM_CONFIG_KV_KEY);
    if (kvConfig && typeof kvConfig === 'object') {
      const sanitized = sanitizeConfigObject(kvConfig);
      cachedTelegramConfig = sanitized;
      writeFileAtomicSync(TELEGRAM_CONFIG_FILE, JSON.stringify(cachedTelegramConfig, null, 2));
      if (
        isLegacyOtpTemplateText(String(kvConfig.welcomeSharePhoneText || '')) ||
        isLegacyOtpTemplateText(String(kvConfig.verifiedSuccessText || '')) ||
        isLegacyOrderHeaderText(String(kvConfig.orderHeaderText || ''))
      ) {
        void setInternalStoreItem(TELEGRAM_CONFIG_KV_KEY, cachedTelegramConfig).catch(() => {});
      }
    }
    hasLoadedConfigFromKv = true;
  } catch (err) {
    console.warn('[Telegram Config] Failed loading KV config:', err);
  }
  return cachedTelegramConfig;
}

export function getEffectiveBotTokenInfo(): {
  token: string;
  source: 'override' | 'env' | 'none';
  ignoredInvalidOverride?: boolean;
} {
  const override = normalizeBotToken(cachedTelegramConfig.botTokenOverride || '');
  const envToken = getEnvBotToken();

  if (override && isValidBotTokenFormat(override)) {
    return { token: override, source: 'override' };
  }
  if (envToken && isValidBotTokenFormat(envToken)) {
    return {
      token: envToken,
      source: 'env',
      ignoredInvalidOverride: Boolean(override),
    };
  }
  if (override) {
    return { token: override, source: 'override' };
  }
  if (envToken) {
    return { token: envToken, source: 'env' };
  }
  return { token: '', source: 'none' };
}

export function getEffectiveBotToken(): string {
  return getEffectiveBotTokenInfo().token;
}

export function getEffectiveBotUsername(): string {
  return (
    verifiedTokenUsername ||
    String(cachedTelegramConfig.botUsername || getEnvBotUsername() || 'MenuPlus_bot')
      .trim()
      .replace(/^@+/, '')
  );
}

async function fetchTelegramGetMe(token: string): Promise<{
  ok: boolean;
  status: number;
  description?: string;
  username?: string;
  firstName?: string;
}> {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    result?: { id?: number; username?: string; first_name?: string };
  };
  if (!res.ok || !data.ok || !data.result) {
    return {
      ok: false,
      status: res.status,
      description: data.description || `HTTP ${res.status}`,
    };
  }
  return {
    ok: true,
    status: res.status,
    username: String(data.result.username || '').trim().replace(/^@+/, ''),
    firstName: String(data.result.first_name || '').trim(),
  };
}

async function syncVerifiedBotIdentity(tokenOverride?: string, force = false): Promise<{
  ok: boolean;
  username?: string;
  firstName?: string;
  error?: string;
}> {
  const info = tokenOverride
    ? { token: normalizeBotToken(tokenOverride), source: 'override' as const }
    : getEffectiveBotTokenInfo();
  const token = info.token;
  if (!token) {
    verifiedTokenHash = '';
    verifiedTokenUsername = '';
    verifiedTokenBotName = '';
    lastTokenError = '';
    lastTokenErrorAt = 0;
    return { ok: false, error: 'توكن البوت غير مضاف' };
  }
  if (!isValidBotTokenFormat(token)) {
    verifiedTokenHash = '';
    verifiedTokenUsername = '';
    verifiedTokenBotName = '';
    lastTokenError = `صيغة توكن البوت غير صحيحة (المصدر: ${getTokenSourceLabel(info.source)} · ${maskToken(token)}) — يجب أن يكون بالصيغة (123456789:ABC...) من @BotFather بدون كلمة bot أو علامات اقتباس.`;
    lastTokenErrorAt = Date.now();
    return { ok: false, error: lastTokenError };
  }
  const tokenHash = getTokenHash(token);
  if (!force && verifiedTokenHash === tokenHash && verifiedTokenUsername) {
    return { ok: true, username: verifiedTokenUsername, firstName: verifiedTokenBotName };
  }
  if (tokenIdentityCheckPromise && !force) {
    await tokenIdentityCheckPromise;
    return {
      ok: Boolean(verifiedTokenUsername),
      username: verifiedTokenUsername || undefined,
      firstName: verifiedTokenBotName || undefined,
      ...(lastTokenError ? { error: lastTokenError } : {}),
    };
  }

  let result: { ok: boolean; username?: string; firstName?: string; error?: string } = { ok: false };
  tokenIdentityCheckPromise = (async () => {
    try {
      const me = await fetchTelegramGetMe(token);
      if (!me.ok) {
        const errText = me.description || `HTTP ${me.status}`;
        const isAuthFailure = me.status === 401 || me.status === 404 || /not found|unauthorized/i.test(errText);

        // Self-heal: if DB botTokenOverride was revoked/stale while env TELEGRAM_BOT_TOKEN works, switch back to envToken
        if (isAuthFailure && !tokenOverride && info.source === 'override') {
          const envToken = getEnvBotToken();
          if (envToken && envToken !== token && isValidBotTokenFormat(envToken)) {
            const envMe = await fetchTelegramGetMe(envToken).catch(() => null);
            if (envMe?.ok) {
              cachedTelegramConfig = sanitizeConfigObject({
                ...cachedTelegramConfig,
                botTokenOverride: '',
                ...(envMe.username ? { botUsername: envMe.username } : {}),
                updatedAt: new Date().toISOString(),
              });
              try {
                writeFileAtomicSync(TELEGRAM_CONFIG_FILE, JSON.stringify(cachedTelegramConfig, null, 2));
              } catch {
                // ignore
              }
              void setInternalStoreItem(TELEGRAM_CONFIG_KV_KEY, cachedTelegramConfig).catch(() => {});
              lastTokenError = '';
              lastTokenErrorAt = 0;
              lastPollError = '';
              verifiedTokenHash = getTokenHash(envToken);
              verifiedTokenUsername = envMe.username || '';
              verifiedTokenBotName = envMe.firstName || '';
              console.warn(
                `[Telegram Bot] Cleared rejected DB botTokenOverride and switched to valid TELEGRAM_BOT_TOKEN (@${verifiedTokenUsername}).`
              );
              result = { ok: true, username: verifiedTokenUsername, firstName: verifiedTokenBotName };
              return;
            }
          }
        }

        if (isAuthFailure) {
          verifiedTokenHash = '';
          verifiedTokenUsername = '';
          verifiedTokenBotName = '';
          const friendly = formatTelegramTokenError(me.status, errText, info.source, token);
          lastTokenError = friendly;
          lastTokenErrorAt = Date.now();
          result = { ok: false, error: friendly };
          return;
        }
        result = { ok: false, error: errText };
        return;
      }
      lastTokenError = '';
      lastTokenErrorAt = 0;
      verifiedTokenHash = tokenHash;
      verifiedTokenUsername = me.username || '';
      verifiedTokenBotName = me.firstName || '';
      if (
        verifiedTokenUsername &&
        cachedTelegramConfig.botUsername &&
        cachedTelegramConfig.botUsername.toLowerCase() !== verifiedTokenUsername.toLowerCase()
      ) {
        console.warn(
          `[Telegram Bot] Configured botUsername (@${cachedTelegramConfig.botUsername}) differs from token bot (@${verifiedTokenUsername}); using @${verifiedTokenUsername}.`
        );
      }
      result = { ok: true, username: verifiedTokenUsername, firstName: verifiedTokenBotName };
    } catch (err: unknown) {
      result = { ok: false, error: err instanceof Error ? err.message : 'تعذر التحقق من هوية البوت' };
    }
  })().finally(() => {
    tokenIdentityCheckPromise = null;
  });

  await tokenIdentityCheckPromise;
  return result;
}

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 12) return '••••••••';
  return `${token.slice(0, 6)}••••••${token.slice(-4)}`;
}

const COMMON_COUNTRY_CODES = [
  '964', '966', '971', '965', '962', '20', '974', '968', '973',
  '961', '963', '970', '967', '212', '213', '218', '90',
];

export function normalizePhoneKeys(phone: string): string[] {
  const raw = String(phone || '').trim();
  let digits = raw.replace(/\D/g, '');
  const keys = new Set<string>();

  if (raw) keys.add(raw);
  if (!digits) return Array.from(keys);

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  keys.add(digits);
  keys.add(`+${digits}`);

  if (digits.startsWith('964')) {
    const local = digits.slice(3).replace(/^0+/, '');
    if (local) {
      keys.add(local);
      keys.add(`0${local}`);
      keys.add(`+964${local}`);
      keys.add(`964${local}`);
      keys.add(`00964${local}`);
      if (local.length === 10) {
        keys.add(`+964 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`);
        keys.add(`0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`);
      }
    }
  } else if (digits.startsWith('07') && digits.length === 11) {
    const local = digits.slice(1);
    keys.add(local);
    keys.add(`0${local}`);
    keys.add(`+964${local}`);
    keys.add(`964${local}`);
    keys.add(`00964${local}`);
    keys.add(`+964 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`);
  } else if (digits.startsWith('7') && digits.length === 10) {
    const local = digits;
    keys.add(local);
    keys.add(`0${local}`);
    keys.add(`+964${local}`);
    keys.add(`964${local}`);
    keys.add(`00964${local}`);
    keys.add(`+964 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`);
  } else {
    for (const cc of COMMON_COUNTRY_CODES) {
      if (digits.startsWith(cc) && digits.length >= cc.length + 7) {
        const local = digits.slice(cc.length).replace(/^0+/, '');
        if (local) {
          keys.add(local);
          keys.add(`0${local}`);
          keys.add(`${cc}${local}`);
          keys.add(`+${cc}${local}`);
          keys.add(`00${cc}${local}`);
        }
        break;
      }
    }
  }

  return Array.from(keys);
}

export function phonesMatch(a: string, b: string): boolean {
  const keysA = normalizePhoneKeys(a);
  if (keysA.length === 0) return false;
  const keysB = new Set(normalizePhoneKeys(b));
  return keysA.some((k) => keysB.has(k));
}

function getCanonicalPrimaryPhoneKey(phone: string): string {
  const keys = normalizePhoneKeys(phone);
  const localIq = keys.find((k) => /^07\d{9}$/.test(k));
  if (localIq) return localIq;
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('9647') && digits.length === 13) return `0${digits.slice(3)}`;
  return digits || String(phone || '').trim();
}

function indexTelegramUserRecord(rec: TelegramUserRecord): void {
  const normalizedRec: TelegramUserRecord = {
    ...rec,
    verifiedContact: rec.verifiedContact !== false,
  };
  const keys = normalizePhoneKeys(normalizedRec.phone);
  for (const k of keys) {
    telegramUsers.set(k, normalizedRec);
  }
}

export function loadTelegramUsers(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(TELEGRAM_USERS_FILE)) {
      const content = fs.readFileSync(TELEGRAM_USERS_FILE, 'utf-8');
      const records = JSON.parse(content) as Record<string, TelegramUserRecord>;
      for (const rec of Object.values(records)) {
        if (rec && rec.chatId && rec.phone) {
          indexTelegramUserRecord({
            ...rec,
            verifiedContact: rec.verifiedContact !== false,
          });
        }
      }
      console.log(`[Telegram Bot] Loaded ${telegramUsers.size} indexed user keys from ${TELEGRAM_USERS_FILE}`);
    }
  } catch (err) {
    console.warn('[Telegram Bot] Failed to load telegram users from file:', err);
  }
}

interface SupabaseTelegramUserRow {
  normalized_phone: string;
  phone: string;
  chat_id: string;
  username?: string | null;
  first_name?: string | null;
  linked_at: number;
  last_sent_at?: number | null;
}

let hasSyncedTelegramUsers = false;
let lastTelegramSyncAt = 0;
let telegramUsersSyncPromise: Promise<void> | null = null;

function persistUsersMapToFileFromMemory(): void {
  try {
    const uniqueByPrimary = new Map<string, TelegramUserRecord>();
    for (const rec of telegramUsers.values()) {
      if (!rec.phone || !rec.chatId) continue;
      const pk = rec.normalizedPhone || rec.phone.replace(/\D/g, '') || rec.phone;
      if (!uniqueByPrimary.has(pk) || (rec.linkedAt || 0) >= (uniqueByPrimary.get(pk)?.linkedAt || 0)) {
        uniqueByPrimary.set(pk, { ...rec, verifiedContact: rec.verifiedContact !== false });
      }
    }
    const obj: Record<string, TelegramUserRecord> = {};
    for (const [pk, rec] of uniqueByPrimary.entries()) {
      obj[pk] = rec;
    }
    writeFileAtomicSync(TELEGRAM_USERS_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.warn('[Telegram Bot] Failed persisting users map:', err);
  }
}

export async function syncTelegramUsersFromSupabase(force = false, ignoreThrottle = false): Promise<void> {
  if (hasLoadedConfigFromKv === false) {
    await loadTelegramConfigFromStore().catch(() => {});
  }
  if (hasSyncedTelegramUsers && !force) return;
  if (force && !ignoreThrottle && lastTelegramSyncAt && Date.now() - lastTelegramSyncAt < 3_500) {
    return;
  }
  if (telegramUsersSyncPromise) return telegramUsersSyncPromise;

  telegramUsersSyncPromise = (async () => {
    try {
      const kvRes = await readPrefixFromStore<TelegramUserRecord>(TELEGRAM_USERS_KV_PREFIX).catch(() => null);
      if (kvRes && Array.isArray(kvRes.items)) {
        for (const rec of kvRes.items) {
          if (rec && rec.phone && rec.chatId) {
            indexTelegramUserRecord({
              ...rec,
              verifiedContact: rec.verifiedContact !== false,
            });
          }
        }
      }

      if (isSupabaseConfigured()) {
        try {
          const rows = await supabaseSelectAll<SupabaseTelegramUserRow>('telegram_users', '*');
          if (rows.length > 0) {
            for (const row of rows) {
              if (!row || !row.phone || !row.chat_id) continue;
              const rec: TelegramUserRecord = {
                phone: row.phone,
                normalizedPhone: row.normalized_phone || row.phone.replace(/\D/g, '') || row.phone,
                chatId: row.chat_id,
                username: row.username || undefined,
                firstName: row.first_name || undefined,
                linkedAt: Number(row.linked_at) || Date.now(),
                lastSentAt: row.last_sent_at ? Number(row.last_sent_at) : undefined,
                verifiedContact: true,
              };
              const existingChat = getVerifiedChatIdForPhone(rec.phone);
              if (!existingChat) {
                indexTelegramUserRecord(rec);
              }
            }
          } else if (telegramUsers.size > 0) {
            const uniqueByPrimary = new Map<string, TelegramUserRecord>();
            for (const rec of telegramUsers.values()) {
              if (rec.verifiedContact === false) continue;
              const pk = rec.normalizedPhone || rec.phone.replace(/\D/g, '') || rec.phone;
              uniqueByPrimary.set(pk, rec);
            }
            const seedRows: SupabaseTelegramUserRow[] = Array.from(uniqueByPrimary.entries()).map(([pk, rec]) => ({
              normalized_phone: pk,
              phone: rec.phone,
              chat_id: String(rec.chatId),
              username: rec.username || null,
              first_name: rec.firstName || null,
              linked_at: Number(rec.linkedAt) || Date.now(),
              last_sent_at: rec.lastSentAt ? Number(rec.lastSentAt) : null,
            }));
            if (seedRows.length > 0) {
              await supabaseUpsert('telegram_users', seedRows as unknown as Record<string, unknown>[], 'normalized_phone').catch(
                () => {}
              );
            }
          }
        } catch (err: unknown) {
          if (!isSupabaseNetworkError(err)) {
            console.warn('[Telegram Bot] Supabase telegram_users sync warning:', formatSupabaseError(err));
          }
        }
      }

      persistUsersMapToFileFromMemory();
      hasSyncedTelegramUsers = true;
      lastTelegramSyncAt = Date.now();
    } finally {
      telegramUsersSyncPromise = null;
    }
  })();

  return telegramUsersSyncPromise;
}

export async function listTelegramUsers(forceSync = true): Promise<TelegramUserRecord[]> {
  await syncTelegramUsersFromSupabase(forceSync);
  const unique = new Map<string, TelegramUserRecord>();
  for (const rec of telegramUsers.values()) {
    const pk = getCanonicalPrimaryPhoneKey(rec.phone || rec.normalizedPhone);
    const prev = unique.get(pk);
    if (!prev || (rec.linkedAt || 0) >= (prev.linkedAt || 0)) {
      unique.set(pk, {
        ...rec,
        normalizedPhone: rec.normalizedPhone || pk,
        verifiedContact: rec.verifiedContact !== false,
      });
    }
  }
  return Array.from(unique.values()).sort((a, b) => (b.linkedAt || 0) - (a.linkedAt || 0));
}

export async function deleteTelegramUserByPhone(phoneOrNormalized: string): Promise<{
  ok: boolean;
  deletedFromSupabase: boolean;
  error?: string;
}> {
  const clean = String(phoneOrNormalized || '').trim();
  const digits = clean.replace(/\D/g, '') || clean;
  const candidateKeys = new Set<string>([clean, digits, ...normalizePhoneKeys(clean)]);

  const primaryTargets = new Set<string>([digits, clean, getCanonicalPrimaryPhoneKey(clean)]);
  for (const k of candidateKeys) {
    const rec = telegramUsers.get(k);
    if (rec?.normalizedPhone) primaryTargets.add(rec.normalizedPhone);
    if (rec?.phone) {
      primaryTargets.add(rec.phone.replace(/\D/g, '') || rec.phone);
      primaryTargets.add(getCanonicalPrimaryPhoneKey(rec.phone));
    }
    telegramUsers.delete(k);
  }

  try {
    if (fs.existsSync(TELEGRAM_USERS_FILE)) {
      const existingMap = JSON.parse(fs.readFileSync(TELEGRAM_USERS_FILE, 'utf-8')) as Record<string, TelegramUserRecord>;
      let fileChanged = false;
      for (const [k, rec] of Object.entries(existingMap)) {
        if (
          primaryTargets.has(k) ||
          (rec?.normalizedPhone && primaryTargets.has(rec.normalizedPhone)) ||
          (rec?.phone && (candidateKeys.has(rec.phone) || phonesMatch(rec.phone, clean)))
        ) {
          delete existingMap[k];
          fileChanged = true;
        }
      }
      if (fileChanged) {
        writeFileAtomicSync(TELEGRAM_USERS_FILE, JSON.stringify(existingMap, null, 2));
      }
    }
  } catch (err) {
    console.warn('[Telegram Bot] Failed to delete user from local file:', err);
  }

  await Promise.all(
    Array.from(primaryTargets)
      .filter(Boolean)
      .map((target) => deleteInternalStoreItem(`${TELEGRAM_USERS_KV_PREFIX}${target}`).catch(() => {}))
  );

  if (isSupabaseConfigured()) {
    let deletedCount = 0;
    try {
      for (const target of primaryTargets) {
        if (!target) continue;
        const rows = await supabaseDeleteWhere('telegram_users', 'normalized_phone', target);
        deletedCount += rows.length;
      }
      return { ok: true, deletedFromSupabase: deletedCount > 0 };
    } catch (err: unknown) {
      const errMsg = formatSupabaseError(err);
      if (!isSupabaseNetworkError(err)) {
        return { ok: false, deletedFromSupabase: false, error: errMsg };
      }
      return { ok: true, deletedFromSupabase: false, error: errMsg };
    }
  }

  return { ok: true, deletedFromSupabase: false };
}

loadConfigFromDiskSync();
loadTelegramUsers();
void loadTelegramConfigFromStore().then(() => syncTelegramUsersFromSupabase());

export function saveTelegramUser(data: {
  phone: string;
  chatId: number | string;
  username?: string;
  firstName?: string;
  verifiedContact?: boolean;
}): TelegramUserRecord {
  const canonicalPhone = getCanonicalPrimaryPhoneKey(data.phone) || String(data.phone || '').trim();
  const digits = canonicalPhone.replace(/\D/g, '') || String(data.phone || '').replace(/\D/g, '');
  const now = Date.now();
  const isVerified = data.verifiedContact !== false;

  const existing = telegramUsers.get(canonicalPhone) || telegramUsers.get(String(data.phone || '').trim());
  const linkedAt = existing?.linkedAt || now;

  for (const [key, rec] of Array.from(telegramUsers.entries())) {
    if (String(rec.chatId) === String(data.chatId) && !phonesMatch(rec.phone, canonicalPhone)) {
      telegramUsers.delete(key);
      const stalePk = rec.normalizedPhone || rec.phone.replace(/\D/g, '');
      if (stalePk) {
        void deleteInternalStoreItem(`${TELEGRAM_USERS_KV_PREFIX}${stalePk}`).catch(() => {});
      }
    }
  }

  const record: TelegramUserRecord = {
    phone: canonicalPhone,
    normalizedPhone: digits,
    chatId: data.chatId,
    username: data.username || existing?.username,
    firstName: data.firstName || existing?.firstName,
    linkedAt,
    lastSentAt: now,
    verifiedContact: isVerified,
  };

  indexTelegramUserRecord(record);
  persistUsersMapToFileFromMemory();

  const primaryKey = digits || canonicalPhone;
  void setInternalStoreItem(`${TELEGRAM_USERS_KV_PREFIX}${primaryKey}`, record).catch(() => {});

  if (isSupabaseConfigured() && isVerified) {
    void supabaseUpsert(
      'telegram_users',
      [
        {
          normalized_phone: primaryKey,
          phone: canonicalPhone,
          chat_id: String(data.chatId),
          username: record.username || null,
          first_name: record.firstName || null,
          linked_at: linkedAt,
          last_sent_at: now,
        },
      ],
      'normalized_phone'
    ).catch((err: unknown) => {
      if (!isSupabaseNetworkError(err)) {
        console.warn('[Telegram Bot] Failed persisting user to Supabase telegram_users:', formatSupabaseError(err));
      }
    });
  }

  return record;
}

export function getVerifiedTelegramUserForPhone(phone: string): TelegramUserRecord | null {
  const cleanPhone = String(phone || '').trim();
  const keys = normalizePhoneKeys(cleanPhone);
  for (const k of keys) {
    const rec = telegramUsers.get(k);
    if (rec && rec.chatId && rec.verifiedContact !== false && phonesMatch(rec.phone, cleanPhone)) {
      return rec;
    }
  }
  return null;
}

export function getVerifiedChatIdForPhone(phone: string): number | string | null {
  return getVerifiedTelegramUserForPhone(phone)?.chatId || null;
}

export function findVerifiedPhoneForChatId(chatId: number | string): string | null {
  for (const rec of telegramUsers.values()) {
    if (String(rec.chatId) === String(chatId) && rec.verifiedContact !== false && rec.phone) {
      return rec.phone;
    }
  }
  return null;
}

export function recordMessageSent(phone: string): void {
  const cleanPhone = String(phone || '').trim();
  const keys = normalizePhoneKeys(cleanPhone);
  const now = Date.now();
  let matchedRec: TelegramUserRecord | undefined;
  for (const k of keys) {
    const rec = telegramUsers.get(k);
    if (rec) {
      rec.lastSentAt = now;
      matchedRec = rec;
    }
  }
  if (matchedRec) {
    persistUsersMapToFileFromMemory();
    const primaryKey = matchedRec.normalizedPhone || matchedRec.phone.replace(/\D/g, '') || matchedRec.phone;
    void setInternalStoreItem(`${TELEGRAM_USERS_KV_PREFIX}${primaryKey}`, matchedRec).catch(() => {});

    if (isSupabaseConfigured()) {
      void supabaseUpsert(
        'telegram_users',
        [
          {
            normalized_phone: primaryKey,
            phone: matchedRec.phone,
            chat_id: String(matchedRec.chatId),
            username: matchedRec.username || null,
            first_name: matchedRec.firstName || null,
            linked_at: matchedRec.linkedAt || now,
            last_sent_at: now,
          },
        ],
        'normalized_phone'
      ).catch(() => {});
    }
  }
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: Record<string, unknown>,
  tokenOverride?: string
): Promise<boolean> {
  const token = (tokenOverride || getEffectiveBotToken()).trim();
  if (!token) {
    lastSendError = 'توكن البوت غير مهيأ لإرسال الرسائل';
    return false;
  }

  const dispatch = async (
    markup?: Record<string, unknown>,
    parseMode: 'HTML' | undefined = 'HTML',
    bodyText = text
  ): Promise<{ ok: boolean; status: number; description?: string; retryAfterSec?: number }> => {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: bodyText,
      link_preview_options: { is_disabled: true },
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }
    if (markup) {
      payload.reply_markup = markup;
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const rawText = await res.text().catch(() => '');
    let data: { ok?: boolean; description?: string; parameters?: { retry_after?: number } } = {};
    try {
      data = rawText ? (JSON.parse(rawText) as typeof data) : {};
    } catch {
      data = { ok: false, description: rawText || `HTTP ${res.status}` };
    }

    return {
      ok: Boolean(data.ok),
      status: res.status,
      description: data.description,
      retryAfterSec: data.parameters?.retry_after,
    };
  };

  const stripHtmlTags = (html: string): string =>
    html
      .replace(/<\/?(?:code|b|strong|i|em|u|s|pre|a)\b[^>]*>/gi, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

  try {
    const first = await dispatch(replyMarkup, 'HTML');
    if (first.ok) {
      lastSendError = '';
      return true;
    }

    lastSendError = first.description || `HTTP ${first.status}`;

    if (first.status === 429 || first.status >= 500) {
      const waitMs = Math.min(3500, Math.max(450, (first.retryAfterSec || 1) * 1000));
      await new Promise((r) => setTimeout(r, waitMs));
    }

    if (replyMarkup) {
      const noMarkup = await dispatch(undefined, 'HTML');
      if (noMarkup.ok) {
        lastSendError = '';
        return true;
      }
      lastSendError = noMarkup.description || `HTTP ${noMarkup.status}`;
    }

    const plainFallback = await dispatch(undefined, undefined, stripHtmlTags(text));
    if (plainFallback.ok) {
      lastSendError = '';
      return true;
    }
    lastSendError = plainFallback.description || `HTTP ${plainFallback.status}`;

    return false;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : '';
    lastSendError = msg;
    if (errName === 'TimeoutError' || errName === 'AbortError' || /timeout|abort/i.test(msg)) {
      return false;
    }
    try {
      await new Promise((r) => setTimeout(r, 450));
      const retry = await dispatch(undefined, undefined, stripHtmlTags(text));
      if (retry.ok) {
        lastSendError = '';
        return true;
      }
    } catch {
      // ignore second failure
    }
    return false;
  }
}

function buildRequestContactKeyboard(): Record<string, unknown> {
  return {
    keyboard: [[{ text: '📱 مشاركة رقم هاتفي لاستقبال الطلبات', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMoney(num: unknown): string {
  const n = Number(num || 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

async function savePendingOrderLink(link: PendingOrderLink): Promise<void> {
  pendingOrderLinks.set(link.token, link);
  await setInternalStoreItem(`${TELEGRAM_PENDING_LINKS_KV_PREFIX}${link.token}`, link).catch(() => {});
}

async function getPendingOrderLink(token: string): Promise<PendingOrderLink | null> {
  const clean = String(token || '').trim();
  if (!clean) return null;
  const mem = pendingOrderLinks.get(clean);
  if (mem) return mem;
  const kv = await getInternalStoreItem<PendingOrderLink>(`${TELEGRAM_PENDING_LINKS_KV_PREFIX}${clean}`).catch(() => null);
  if (kv && kv.token && kv.rid) {
    pendingOrderLinks.set(clean, kv);
    return kv;
  }
  return null;
}

async function savePendingLinkForChat(chatKey: string, token: string): Promise<void> {
  const entry = { token, requestedAt: Date.now() };
  pendingLinkTokenByChatId.set(chatKey, entry);
  await setInternalStoreItem(`${TELEGRAM_PENDING_CHAT_LINK_KV_PREFIX}${chatKey}`, entry).catch(() => {});
}

async function takePendingLinkForChat(chatKey: string): Promise<string | null> {
  const mem = pendingLinkTokenByChatId.get(chatKey);
  pendingLinkTokenByChatId.delete(chatKey);
  const kv = await getInternalStoreItem<{ token: string; requestedAt: number }>(
    `${TELEGRAM_PENDING_CHAT_LINK_KV_PREFIX}${chatKey}`
  ).catch(() => null);
  if (kv) {
    void deleteInternalStoreItem(`${TELEGRAM_PENDING_CHAT_LINK_KV_PREFIX}${chatKey}`).catch(() => {});
  }
  if (mem && (!kv || mem.requestedAt >= kv.requestedAt)) {
    return mem.token;
  }
  return kv?.token || null;
}

function isPhoneLikeCandidate(val: unknown): string {
  const s = String(val || '').trim();
  if (!s || s.includes('@')) return '';
  const digits = s.replace(/\D/g, '');
  return digits.length >= 7 ? s : '';
}

function collectRestaurantPhoneCandidates(
  rid: string,
  rest: Record<string, unknown>,
  allData: Record<string, unknown>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (val: unknown) => {
    const clean = isPhoneLikeCandidate(val);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  };

  add(rest.telegramPhone);
  if (rid === 'demo') {
    // Only match the demo store when telegramPhone was explicitly configured on it
    return out;
  }
  add(rest.ph);
  if (rest.social && typeof rest.social === 'object') {
    add((rest.social as Record<string, unknown>).whatsapp);
  }

  for (const [k, v] of Object.entries(allData)) {
    if (!k.startsWith('accounts/') || !v || typeof v !== 'object') continue;
    const acc = v as Record<string, unknown>;
    if (
      k.startsWith('accounts/acc_admin_') ||
      k === 'accounts/acc_menu_demo' ||
      acc.admin === true ||
      acc.r === 'admin'
    ) {
      continue;
    }
    if (String(acc.rid || '').trim() !== rid) continue;
    add(acc.telegramPhone);
    add(acc.phone);
    add(acc.projectPhone);
    add(acc.ph);
    add(acc.em);
    add(acc.username);
  }

  return out;
}

async function autoLinkRestaurantsByPhone(
  phone: string,
  chatId: number | string,
  username?: string,
  forceRelink = true
): Promise<Array<{ rid: string; name: string }>> {
  const allData = await readAll(false);
  const linked: Array<{ rid: string; name: string }> = [];

  for (const [k, v] of Object.entries(allData)) {
    if (!k.startsWith('restaurants/') || k.slice('restaurants/'.length).includes('/') || !v || typeof v !== 'object') {
      continue;
    }
    const rid = k.slice('restaurants/'.length);
    if (rid === 'demo') continue;
    const rest = v as Record<string, unknown>;
    if (rest.a === 0 || rest.deleted === true) {
      continue;
    }
    if (!forceRelink && rest.telegramUnlinkedManually === true) {
      continue;
    }
    const candidates = collectRestaurantPhoneCandidates(rid, rest, allData);
    const matchedPhone = candidates.find((c) => phonesMatch(c, phone));
    if (!matchedPhone) continue;

    const preferredPhone = String(rest.telegramPhone || matchedPhone || phone).trim();
    const alreadyBound =
      String(rest.telegramChatId || '').trim() === String(chatId) &&
      phonesMatch(String(rest.telegramPhone || ''), preferredPhone) &&
      rest.telegramNotificationsEnabled !== false &&
      rest.telegramUnlinkedManually !== true;

    if (!alreadyBound) {
      await bindRestaurantToTelegram(rid, {
        phone: preferredPhone,
        chatId,
        username,
        enabled: rest.telegramNotificationsEnabled !== false,
      });
    }
    linked.push({ rid, name: String(rest.n || rid).trim() || rid });
  }

  return linked;
}

async function bindRestaurantToTelegram(
  rid: string,
  data: {
    phone: string;
    chatId: number | string;
    username?: string;
    enabled?: boolean;
  }
): Promise<boolean> {
  const cleanRid = String(rid || '').trim();
  if (!cleanRid) return false;
  const allData = await readAll(false);
  const rest = allData[`restaurants/${cleanRid}`] as Record<string, unknown> | undefined;
  if (!rest || typeof rest !== 'object') return false;

  const updated = {
    ...rest,
    telegramPhone: data.phone,
    telegramChatId: String(data.chatId),
    telegramUsername: data.username || rest.telegramUsername || '',
    telegramNotificationsEnabled: data.enabled !== false,
    telegramUnlinkedManually: false,
    orderChannel:
      data.enabled !== false && rest.orderChannel === 'whatsapp'
        ? 'both'
        : rest.orderChannel || (data.enabled !== false ? 'both' : 'whatsapp'),
  };
  await applyChanges({ put: { [`restaurants/${cleanRid}`]: updated } }, false);
  return true;
}

/**
 * Initiates or completes Telegram binding for a store/restaurant owner from Dashboard.
 */
export async function initTelegramOrderLink(
  rid: string,
  phone: string
): Promise<{
  ok: boolean;
  linked: boolean;
  botUrl: string;
  botUsername: string;
  telegramPhone: string;
  telegramUsername?: string;
  message: string;
}> {
  await loadTelegramConfigFromStore();
  await syncTelegramUsersFromSupabase(true, true);

  const cleanRid = String(rid || '').trim();
  const cleanPhone = String(phone || '').trim();
  const botUsername = getEffectiveBotUsername();

  if (!cleanRid) {
    return {
      ok: false,
      linked: false,
      botUrl: `https://t.me/${botUsername}`,
      botUsername,
      telegramPhone: cleanPhone,
      message: 'معرّف المتجر غير صالح.',
    };
  }

  if (!cleanPhone || cleanPhone.replace(/\D/g, '').length < 7) {
    return {
      ok: false,
      linked: false,
      botUrl: `https://t.me/${botUsername}`,
      botUsername,
      telegramPhone: cleanPhone,
      message: 'يرجى إدخال رقم هاتف صحيح أولاً.',
    };
  }

  const verifiedUser = getVerifiedTelegramUserForPhone(cleanPhone);
  if (verifiedUser && verifiedUser.chatId) {
    await bindRestaurantToTelegram(cleanRid, {
      phone: cleanPhone,
      chatId: verifiedUser.chatId,
      username: verifiedUser.username,
      enabled: true,
    });
    return {
      ok: true,
      linked: true,
      botUrl: `https://t.me/${botUsername}`,
      botUsername,
      telegramPhone: cleanPhone,
      telegramUsername: verifiedUser.username || '',
      message: 'تم ربط رقمك مع البوت بنجاح! ستصلك طلبات الزبائن على تيليجرام مباشرة ✓',
    };
  }

  const linkToken = `ord_${crypto.randomBytes(5).toString('hex')}`;
  await savePendingOrderLink({
    token: linkToken,
    rid: cleanRid,
    phone: cleanPhone,
    createdAt: Date.now(),
  });

  // Save the phone draft onto the restaurant record while keeping existing chatId cleared if phone changed
  const allData = await readAll(false);
  const rest = allData[`restaurants/${cleanRid}`] as Record<string, unknown> | undefined;
  if (rest && typeof rest === 'object') {
    await applyChanges(
      {
        put: {
          [`restaurants/${cleanRid}`]: {
            ...rest,
            telegramPhone: cleanPhone,
            telegramChatId: '',
            telegramUsername: '',
            telegramUnlinkedManually: false,
          },
        },
      },
      false
    );
  }

  return {
    ok: true,
    linked: false,
    botUrl: `https://t.me/${botUsername}?start=${linkToken}`,
    botUsername,
    telegramPhone: cleanPhone,
    message: 'افتح البوت في تيليجرام واضغط Start ثم شارك رقم هاتفك لتفعيل استلام الطلبات.',
  };
}

export function resolveRestaurantOrderChannel(
  rest: Record<string, unknown> | null | undefined
): 'both' | 'telegram' | 'whatsapp' {
  const raw = String(rest?.orderChannel || '').trim();
  if (raw === 'both' || raw === 'telegram' || raw === 'whatsapp') {
    return raw;
  }
  if (rest && rest.telegramNotificationsEnabled === false) {
    return 'whatsapp';
  }
  return 'both';
}

export async function getTelegramOrderLinkStatus(rid: string): Promise<{
  ok: boolean;
  linked: boolean;
  enabled: boolean;
  orderChannel: 'both' | 'telegram' | 'whatsapp';
  whatsappConfigured: boolean;
  telegramSendReady: boolean;
  pollingActive: boolean;
  pollingHealthy: boolean;
  lastPollError: string | null;
  lastSendError: string | null;
  lastPollSuccessAt: number | null;
  botEnabled: boolean;
  botConfigured: boolean;
  botTokenValid: boolean;
  botTokenError: string | null;
  botUsername: string;
  configuredBotUsername: string;
  verifiedBotUsername: string | null;
  telegramPhone: string;
  telegramUsername: string;
  proxyUrl: string;
}> {
  await loadTelegramConfigFromStore();
  await syncTelegramUsersFromSupabase();

  const tokenInfo = getEffectiveBotTokenInfo();
  const effectiveToken = tokenInfo.token;
  const shouldRecheckError = Boolean(lastTokenError && Date.now() - lastTokenErrorAt > 10000);
  if (effectiveToken && (!verifiedTokenUsername || shouldRecheckError)) {
    await syncVerifiedBotIdentity(undefined, shouldRecheckError).catch(() => {});
  }

  const cleanRid = String(rid || '').trim();
  const botUsername = getEffectiveBotUsername();
  const allData = await readAll(false);
  const rest = (allData[`restaurants/${cleanRid}`] || {}) as Record<string, unknown>;

  let telegramPhone = String(rest.telegramPhone || '').trim();
  let telegramChatId = String(rest.telegramChatId || '').trim();
  let telegramUsername = String(rest.telegramUsername || '').trim();
  const orderChannel = resolveRestaurantOrderChannel(rest);
  const enabled = orderChannel !== 'whatsapp' && rest.telegramNotificationsEnabled !== false;

  if (!telegramChatId && rest.telegramUnlinkedManually !== true) {
    const candidates = telegramPhone
      ? [telegramPhone, ...collectRestaurantPhoneCandidates(cleanRid, rest, allData)]
      : collectRestaurantPhoneCandidates(cleanRid, rest, allData);
    for (const candidate of candidates) {
      const matched = getVerifiedTelegramUserForPhone(candidate);
      if (matched && matched.chatId) {
        telegramPhone = telegramPhone || matched.phone || candidate;
        telegramChatId = String(matched.chatId);
        telegramUsername = matched.username || telegramUsername;
        await bindRestaurantToTelegram(cleanRid, {
          phone: telegramPhone,
          chatId: telegramChatId,
          username: telegramUsername,
          enabled,
        });
        break;
      }
    }
  }

  const botEnabled = cachedTelegramConfig.enabled !== false;
  const botConfigured = Boolean(effectiveToken);
  const botTokenValid = Boolean(effectiveToken && !lastTokenError);
  const socialObj = (rest.social && typeof rest.social === 'object' ? rest.social : {}) as Record<string, unknown>;
  const whatsappConfigured = Boolean(String(socialObj.whatsapp || rest.ph || '').trim());
  const pollingHealthy = Boolean(isPollingActive && !lastPollError && (lastPollSuccessAt > 0 || !consecutiveAuthErrors));
  const storeSendError = lastSendErrorByRid.get(cleanRid) || '';

  return {
    ok: true,
    linked: Boolean(telegramChatId),
    enabled,
    orderChannel,
    whatsappConfigured,
    telegramSendReady: Boolean(botConfigured && botTokenValid && botEnabled && telegramChatId && enabled),
    pollingActive: Boolean(isPollingActive),
    pollingHealthy,
    lastPollError: lastPollError || null,
    lastSendError: storeSendError || null,
    lastPollSuccessAt: lastPollSuccessAt || null,
    botEnabled,
    botConfigured,
    botTokenValid,
    botTokenError: lastTokenError || null,
    botUsername,
    configuredBotUsername: cachedTelegramConfig.botUsername,
    verifiedBotUsername: verifiedTokenUsername || null,
    telegramPhone,
    telegramUsername,
    proxyUrl: cachedTelegramConfig.proxyUrl || DEFAULT_TELEGRAM_PROXY_URL,
  };
}

export async function toggleTelegramForRestaurant(rid: string, enabled: boolean): Promise<boolean> {
  const cleanRid = String(rid || '').trim();
  if (!cleanRid) return false;
  const allData = await readAll(false);
  const rest = allData[`restaurants/${cleanRid}`] as Record<string, unknown> | undefined;
  if (!rest || typeof rest !== 'object') return false;
  const currentChannel = resolveRestaurantOrderChannel(rest);
  const nextChannel: 'both' | 'telegram' | 'whatsapp' = enabled
    ? currentChannel === 'whatsapp'
      ? 'both'
      : currentChannel
    : 'whatsapp';
  await applyChanges(
    {
      put: {
        [`restaurants/${cleanRid}`]: {
          ...rest,
          telegramNotificationsEnabled: Boolean(enabled),
          orderChannel: nextChannel,
        },
      },
    },
    false
  );
  return true;
}

export async function unlinkTelegramForRestaurant(rid: string): Promise<boolean> {
  const cleanRid = String(rid || '').trim();
  if (!cleanRid) return false;
  const allData = await readAll(false);
  const rest = allData[`restaurants/${cleanRid}`] as Record<string, unknown> | undefined;
  if (!rest || typeof rest !== 'object') return false;
  await applyChanges(
    {
      put: {
        [`restaurants/${cleanRid}`]: {
          ...rest,
          telegramChatId: '',
          telegramUsername: '',
          telegramUnlinkedManually: true,
        },
      },
    },
    false
  );
  return true;
}

const ORDER_TYPE_AR: Record<string, string> = {
  delivery: 'توصيل',
  pickup: 'استلام ذاتي',
  table: 'طلب طاولة',
};

function formatIraqOrderDateTime(tsRaw: unknown): {
  timeStr: string;
  dayNameAr: string;
  dateStr: string;
} {
  const numericTs = Number(tsRaw || Date.now());
  const dateObj = Number.isFinite(numericTs) && numericTs > 0 ? new Date(numericTs) : new Date();
  const timeZone = 'Asia/Baghdad';

  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(dateObj);
  const hour = timeParts.find((p) => p.type === 'hour')?.value || '12';
  const minute = timeParts.find((p) => p.type === 'minute')?.value || '00';
  const dayPeriod = timeParts.find((p) => p.type === 'dayPeriod')?.value || '';
  const arPeriod = /pm/i.test(dayPeriod) ? 'م' : 'ص';
  const timeStr = `${hour}:${minute} ${arPeriod}`;

  const dayNameAr = new Intl.DateTimeFormat('ar-IQ', {
    timeZone,
    weekday: 'long',
  }).format(dateObj);

  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dateObj);

  return { timeStr, dayNameAr, dateStr };
}

export function formatOrderTelegramMessage(
  restaurant: Record<string, unknown>,
  order: Record<string, unknown>,
  isTest = false
): string {
  const rawHeader =
    cachedTelegramConfig.orderHeaderText || DEFAULT_TELEGRAM_CONFIG.orderHeaderText;
  const header = isLegacyOrderHeaderText(rawHeader)
    ? DEFAULT_TELEGRAM_CONFIG.orderHeaderText
    : rawHeader;
  const footer =
    cachedTelegramConfig.orderFooterText || DEFAULT_TELEGRAM_CONFIG.orderFooterText;

  const storeName = escapeHtml(restaurant.n || 'المتجر');
  const currency = escapeHtml(restaurant.currency || 'د.ع');
  const rawSeq = Number(order.seq ?? order.orderSeq ?? 0);
  const seqNumber =
    Number.isFinite(rawSeq) && rawSeq > 0
      ? rawSeq
      : Math.max(1, (Number(restaurant.o || 0) || 0) + (isTest ? 1 : 0));

  const { timeStr, dateStr } = formatIraqOrderDateTime(order.at);
  const cu = (order.cu && typeof order.cu === 'object' ? order.cu : {}) as Record<string, unknown>;

  const customerName = escapeHtml(cu.n || order.name || 'زبون');
  const customerPhone = escapeHtml(cu.ph || order.phone || '—');
  const rawType = String(cu.orderType || order.type || 'delivery');
  const typeLabel = ORDER_TYPE_AR[rawType] || rawType;
  const tableNum = cu.table || order.table;
  const area = cu.area ? String(cu.area).trim() : '';
  const city = cu.city ? String(cu.city).trim() : '';
  const address = String(cu.address || order.address || '').trim();
  const notes = String(cu.nt || order.notes || '').trim();
  const deliveryFee = Number(cu.deliveryFee || 0);
  const serviceFee = Number(order.serviceFee || 0);
  const discount = Number(order.discount || 0);
  const total = Number(order.tot ?? order.total ?? 0);
  const lat = cu.lat !== undefined && cu.lat !== null && cu.lat !== '' ? Number(cu.lat) : undefined;
  const lng = cu.lng !== undefined && cu.lng !== null && cu.lng !== '' ? Number(cu.lng) : undefined;

  const itemsList = Array.isArray(order.items) ? (order.items as Array<Record<string, unknown>>) : [];
  let computedOrigSubtotal = 0;
  let computedSubtotal = 0;
  const itemLines = itemsList.map((it) => {
    const qty = Math.max(1, Number(it.q || 1));
    const price = Number(it.p || 0);
    const origPrice = Number(it.origPrice ?? it.origP ?? 0);
    const hasItemDiscount = origPrice > price && origPrice > 0;
    const pct =
      Number(it.discountPct || 0) ||
      (hasItemDiscount ? Math.max(1, Math.round(((origPrice - price) / origPrice) * 100)) : 0);
    computedSubtotal += qty * price;
    computedOrigSubtotal += qty * (hasItemDiscount ? origPrice : price);

    const parts = [
      it.size ? String(it.size) : '',
      ...(Array.isArray(it.choices) ? it.choices.map(String) : []),
      ...(Array.isArray(it.extras) ? it.extras.map(String) : []),
    ].filter(Boolean);
    const optsText = parts.length > 0 ? ` <i>(${escapeHtml(parts.join('، '))})</i>` : '';
    const itemNote = String(it.notes || '').trim();
    const noteLine = itemNote ? `\n   ↳ <i>${escapeHtml(itemNote)}</i>` : '';
    const unitDiscountPart = hasItemDiscount
      ? ` · <s>${formatMoney(origPrice)}</s> (<b>خصم ${pct}%</b>)`
      : '';
    return `• <b>${escapeHtml(it.n || 'منتج')}</b>${optsText} × ${qty} — سعر الطبق: ${formatMoney(price)} ${currency}${unitDiscountPart} = <b>${formatMoney(qty * price)} ${currency}</b>${noteLine}`;
  });

  const divider = '────────────';
  const lines: string[] = [];

  const cleanHeader = header.replace(/^🔔\s*/, '').trim() || 'طلب جديد';
  lines.push(`🔔 <b>${escapeHtml(cleanHeader)}</b> — ${storeName}`);
  if (isTest) {
    lines.push('<i>طلب تجريبي للتحقق من الربط</i>');
  }
  lines.push(`<b>رقم الطلب:</b> <code>#${seqNumber}</code>`);
  lines.push(`<b>النوع:</b> ${escapeHtml(typeLabel)}${tableNum ? ` (طاولة ${escapeHtml(tableNum)})` : ''}`);
  lines.push(`<b>الوقت:</b> <code>${escapeHtml(timeStr)}</code> · <code>${escapeHtml(dateStr)}</code>`);

  lines.push(divider);
  lines.push(`<b>الزبون:</b> ${customerName}`);
  lines.push(`<b>الهاتف:</b> <code>${customerPhone}</code>`);
  if (area || city || address) {
    const rawLocParts = [city, area, address].filter(Boolean);
    const dedupedLoc: string[] = [];
    for (const part of rawLocParts) {
      const existingIdx = dedupedLoc.findIndex(
        (ex) => ex === part || ex.includes(part) || part.includes(ex)
      );
      if (existingIdx === -1) {
        dedupedLoc.push(part);
      } else if (part.length > dedupedLoc[existingIdx].length) {
        dedupedLoc[existingIdx] = part;
      }
    }
    lines.push(`<b>العنوان:</b> ${escapeHtml(dedupedLoc.join(' — '))}`);
  }

  if (itemLines.length > 0) {
    lines.push(divider);
    lines.push(...itemLines);
  }

  const freeGiftName = String(order.freeGiftName || '').trim();
  const scheduledSlot = String(order.scheduledSlot || '').trim();
  const tipAmount = Number(order.tipAmount || 0);
  const firstOrderDiscount = Number(order.firstOrderDiscount || 0);
  const spinRewardLabel = String(order.spinRewardLabel || '').trim();
  const spinDiscount = Number(order.spinDiscount || 0);
  const pickupDiscount = Number(order.pickupDiscount || 0);
  const pickupDiscountLabel = String(order.pickupDiscountLabel || 'خصم الاستلام الفوري').trim();
  const menuDiscountLabel = String(order.menuDiscountLabel || '').trim();
  const origSubtotal = Number(order.origSubtotal || 0) || computedOrigSubtotal;
  const itemsDiscountTotal =
    Number(order.itemsDiscountTotal || 0) || Math.max(0, origSubtotal - computedSubtotal);
  const orderLevelDiscountTotal = discount + firstOrderDiscount + spinDiscount + pickupDiscount;
  const totalDiscount = itemsDiscountTotal + orderLevelDiscountTotal;
  const couponCode = String(order.couponCode || '').trim();

  lines.push(divider);
  if (origSubtotal > 0 && totalDiscount > 0) {
    lines.push(`<b>المجموع قبل الخصم:</b> ${formatMoney(origSubtotal)} ${currency}`);
  } else if (computedSubtotal > 0) {
    lines.push(`<b>مجموع الأطباق:</b> ${formatMoney(computedSubtotal)} ${currency}`);
  }
  if (itemsDiscountTotal > 0) {
    lines.push(
      `<b>خصم على الأطباق${menuDiscountLabel ? ` (${escapeHtml(menuDiscountLabel)})` : ''}:</b> -${formatMoney(itemsDiscountTotal)} ${currency}`
    );
  }
  if (deliveryFee > 0) {
    lines.push(`<b>التوصيل:</b> ${formatMoney(deliveryFee)} ${currency}`);
  }
  if (serviceFee > 0) {
    lines.push(`<b>رسوم الخدمة:</b> ${formatMoney(serviceFee)} ${currency}`);
  }
  if (tipAmount > 0) {
    lines.push(`<b>إكرامية:</b> ${formatMoney(tipAmount)} ${currency}`);
  }
  if (discount > 0) {
    lines.push(`<b>خصم على الطلب${couponCode ? ` (${escapeHtml(couponCode)})` : ''}:</b> -${formatMoney(discount)} ${currency}`);
  }
  if (firstOrderDiscount > 0) {
    lines.push(`<b>خصم على الطلب (الطلب الأول):</b> -${formatMoney(firstOrderDiscount)} ${currency}`);
  }
  if (spinDiscount > 0) {
    lines.push(`<b>خصم على الطلب (مكافأة${spinRewardLabel ? ` ${escapeHtml(spinRewardLabel)}` : ''}):</b> -${formatMoney(spinDiscount)} ${currency}`);
  }
  if (pickupDiscount > 0) {
    lines.push(`<b>خصم على الطلب (${escapeHtml(pickupDiscountLabel)}):</b> -${formatMoney(pickupDiscount)} ${currency}`);
  }
  if (totalDiscount > 0) {
    lines.push(`<b>إجمالي الخصم:</b> -${formatMoney(totalDiscount)} ${currency}`);
  }
  if (freeGiftName) {
    lines.push(`<b>هدية مجانية:</b> ${escapeHtml(freeGiftName)}`);
  }
  if (order.needCutlery === true) {
    lines.push('<b>أدوات الطعام:</b> مطلوبة');
  } else if (order.needCutlery === false) {
    lines.push('<b>أدوات الطعام:</b> غير مطلوبة');
  }
  if (scheduledSlot) {
    lines.push(`<b>الموعد:</b> ${escapeHtml(scheduledSlot)}`);
  }
  lines.push(`<b>الإجمالي النهائي: ${formatMoney(total)} ${currency}</b>`);

  if (notes) {
    lines.push(`<b>ملاحظات:</b> ${escapeHtml(notes)}`);
  }

  if (
    lat !== undefined &&
    lng !== undefined &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    (lat !== 0 || lng !== 0)
  ) {
    const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    lines.push(divider);
    lines.push('📍 <b>الموقع:</b>');
    lines.push(`Google Maps: <a href="${escapeHtml(googleMapsUrl)}">${escapeHtml(googleMapsUrl)}</a>`);
    lines.push(`Waze: <a href="${escapeHtml(wazeUrl)}">${escapeHtml(wazeUrl)}</a>`);
  }

  if (footer && footer !== 'تواصل مع الزبون أو تابع تفاصيل الطلب من لوحة التحكم.') {
    lines.push('');
    lines.push(`<i>${escapeHtml(footer)}</i>`);
  }

  return lines.join('\n');
}

export async function sendOrderNotificationToTelegram(
  restaurant: Record<string, unknown>,
  order: Record<string, unknown>
): Promise<{ sent: boolean; reason?: string }> {
  await loadTelegramConfigFromStore();
  if (!cachedTelegramConfig.enabled) {
    return { sent: false, reason: 'bot_disabled' };
  }
  const token = getEffectiveBotToken();
  if (!token) {
    return { sent: false, reason: 'no_token' };
  }
  if (!restaurant) {
    return { sent: false, reason: 'no_restaurant' };
  }
  const channel = resolveRestaurantOrderChannel(restaurant);
  if (channel === 'whatsapp') {
    return { sent: false, reason: 'channel_whatsapp_only' };
  }
  if (channel !== 'telegram' && restaurant.telegramNotificationsEnabled === false) {
    return { sent: false, reason: 'store_notifications_disabled' };
  }

  await syncTelegramUsersFromSupabase();

  const rid = String(restaurant.id || '').trim();
  let chatId: number | string | null = String(restaurant.telegramChatId || '').trim() || null;
  let storePhone = String(restaurant.telegramPhone || '').trim();
  if (!chatId && restaurant.telegramUnlinkedManually !== true) {
    const allData = rid ? await readAll(false) : {};
    const candidates = rid
      ? collectRestaurantPhoneCandidates(rid, restaurant, allData)
      : [storePhone, isPhoneLikeCandidate(restaurant.ph)].filter(Boolean);

    for (const candidate of candidates) {
      const matchedUser = getVerifiedTelegramUserForPhone(candidate);
      if (matchedUser && matchedUser.chatId) {
        chatId = matchedUser.chatId;
        storePhone = storePhone || matchedUser.phone || candidate;
        if (rid) {
          void bindRestaurantToTelegram(rid, {
            phone: storePhone,
            chatId,
            username: matchedUser.username,
            enabled: restaurant.telegramNotificationsEnabled !== false,
          }).catch(() => {});
        }
        break;
      }
    }
  }
  if (!chatId) {
    return { sent: false, reason: 'no_chat_id' };
  }

  const text = formatOrderTelegramMessage(restaurant, order, false);
  const ok = await sendTelegramMessage(chatId, text);
  if (ok) {
    if (rid) lastSendErrorByRid.delete(rid);
    if (storePhone) recordMessageSent(storePhone);
  } else {
    if (rid) lastSendErrorByRid.set(rid, lastSendError || 'تعذر إرسال الطلب عبر تيليجرام');
    console.warn(`[Telegram Order] Failed sending order #${String(order.id || '').slice(-6)} to chatId=${chatId}: ${lastSendError || 'unknown'}`);
  }
  return { sent: ok, ...(ok ? {} : { reason: lastSendError || 'telegram_send_failed' }) };
}

export async function sendPartnerTestOrderNotification(rid: string): Promise<{
  ok: boolean;
  message: string;
}> {
  await loadTelegramConfigFromStore();
  const status = await getTelegramOrderLinkStatus(rid);
  if (!status.botConfigured) {
    return { ok: false, message: 'بوت تيليجرام غير مهيأ حالياً من إعدادات المنصة.' };
  }
  if (!status.botEnabled) {
    return { ok: false, message: 'إرسال الطلبات عبر تيليجرام متوقف حالياً من إعدادات المنصة.' };
  }
  if (!status.linked) {
    return { ok: false, message: 'لم يتم ربط رقم الهاتف بالبوت بعد. شارك رقمك في البوت أولاً.' };
  }

  const allData = await readAll(false);
  const rest = (allData[`restaurants/${rid}`] || { n: 'متجري', currency: 'د.ع' }) as Record<string, unknown>;
  const chatId = String(rest.telegramChatId || getVerifiedChatIdForPhone(status.telegramPhone) || '').trim();
  if (!chatId) {
    return { ok: false, message: 'تعذر العثور على محادثة تيليجرام المربوطة.' };
  }

  const nowTs = Date.now();
  const nextSeq = Math.max(1, (Number(rest.o || 0) || 0) + 1);
  const sampleOrder: Record<string, unknown> = {
    id: `test_${nowTs}`,
    at: nowTs,
    seq: nextSeq,
    orderSeq: nextSeq,
    type: 'delivery',
    tot: 15000,
    cu: {
      n: 'زبون تجريبي',
      ph: status.telegramPhone || '07700000000',
      address: 'بغداد — المنصور',
      orderType: 'delivery',
      deliveryFee: 3000,
      lat: 33.3152,
      lng: 44.3661,
      nt: 'رسالة تجربة لاستلام الطلبات',
    },
    items: [
      { n: 'وجبة تجريبية', q: 1, p: 12000 },
    ],
  };

  const text = formatOrderTelegramMessage(rest, sampleOrder, true);
  const sent = await sendTelegramMessage(chatId, text);
  if (!sent) {
    lastSendErrorByRid.set(rid, lastSendError || 'تعذر إرسال الطلب التجريبي (تأكد من أنك لم تحظر البوت).');
    return { ok: false, message: 'تعذر إرسال الطلب التجريبي (تأكد من أنك لم تحظر البوت).' };
  }
  lastSendErrorByRid.delete(rid);
  if (status.telegramPhone) recordMessageSent(status.telegramPhone);
  return { ok: true, message: 'تم إرسال طلب تجريبي إلى حسابك في تيليجرام ✓' };
}

async function claimIncomingMessageLock(chatId: number | string, messageId: number): Promise<boolean> {
  if (!messageId) return true;
  const msgKey = `${chatId}_${messageId}`;
  if (processedMessageKeys.has(msgKey)) {
    return false;
  }
  processedMessageKeys.add(msgKey);
  if (processedMessageKeys.size > 2000) {
    const firstKey = processedMessageKeys.values().next().value;
    if (firstKey) processedMessageKeys.delete(firstKey);
  }

  const lockKey = `${TELEGRAM_MSG_LOCK_KV_PREFIX}${msgKey}`;
  const existing = await getInternalStoreItem<{ claimedAt?: number; claimId?: string }>(lockKey).catch(() => null);
  if (existing && existing.claimedAt) {
    return false;
  }
  const claimId = crypto.randomBytes(5).toString('hex');
  await setInternalStoreItem(lockKey, { claimedAt: Date.now(), claimId }).catch(() => {});
  const verified = await getInternalStoreItem<{ claimedAt?: number; claimId?: string }>(lockKey).catch(() => null);
  if (verified && verified.claimId && verified.claimId !== claimId) {
    return false;
  }
  return true;
}

export async function handleIncomingTelegramMessage(msg: IncomingTelegramMessage): Promise<void> {
  await loadTelegramConfigFromStore();

  const chatId = msg.chat.id;
  const chatKey = String(chatId);
  const text = (msg.text || '').trim();
  const msgAgeSec = msg.date ? Math.floor(Date.now() / 1000) - msg.date : 0;

  if (msgAgeSec > 1800) {
    console.warn(`[Telegram Bot] Skipping stale message (${msgAgeSec}s old) from chat=${chatId}`);
    return;
  }

  if (!(await claimIncomingMessageLock(chatId, msg.message_id))) {
    return;
  }

  console.log(`[Telegram Bot] Processing message from chat=${chatId}: ${msg.contact ? '[contact]' : JSON.stringify(text)}`);
  await syncTelegramUsersFromSupabase();

  // 1. Handle shared contact from Telegram
  if (msg.contact && msg.contact.phone_number) {
    const contactUserId = msg.contact.user_id;
    const senderUserId = msg.from?.id;
    if (contactUserId === undefined || senderUserId === undefined || Number(contactUserId) !== Number(senderUserId)) {
      await sendTelegramMessage(
        chatId,
        'عذراً، يرجى مشاركة رقم هاتف حسابك الشخصي عبر الضغط على الزر بالأسفل فقط.',
        { remove_keyboard: true }
      );
      return;
    }

    const verifiedContactPhone = String(msg.contact.phone_number).trim();
    saveTelegramUser({
      phone: verifiedContactPhone,
      chatId,
      username: msg.from?.username,
      firstName: msg.from?.first_name || msg.contact?.first_name,
      verifiedContact: true,
    });

    const pendingToken = await takePendingLinkForChat(chatKey);
    let linkedCount = 0;

    if (pendingToken) {
      const pendingLink = await getPendingOrderLink(pendingToken);
      if (pendingLink) {
        if (!phonesMatch(verifiedContactPhone, pendingLink.phone)) {
          await sendTelegramMessage(
            chatId,
            `رقم هاتف حساب تيليجرام هذا (${verifiedContactPhone}) يختلف عن الرقم المدخل في لوحة التحكم (${pendingLink.phone}).\nيرجى تعديل الرقم في قسم «إعداد التليجرام» في لوحة التحكم أو فتح البوت من الحساب المطابق.`,
            { remove_keyboard: true }
          );
          return;
        }
        const ok = await bindRestaurantToTelegram(pendingLink.rid, {
          phone: pendingLink.phone,
          chatId,
          username: msg.from?.username,
          enabled: true,
        });
        if (ok) linkedCount++;
      }
    }

    // Auto-recognize and link all stores/accounts matching this verified phone number
    const autoLinkedStores = await autoLinkRestaurantsByPhone(
      verifiedContactPhone,
      chatId,
      msg.from?.username,
      true
    );
    const totalLinked = linkedCount + autoLinkedStores.length;

    let replyText: string;
    if (totalLinked > 0) {
      const storeNames = autoLinkedStores.map((s) => `• ${s.name}`).join('\n');
      replyText =
        `${cachedTelegramConfig.verifiedSuccessText || DEFAULT_TELEGRAM_CONFIG.verifiedSuccessText}\n\n` +
        `📱 الرقم المحفوظ: <code>${escapeHtml(verifiedContactPhone)}</code>` +
        (storeNames ? `\n🏪 المتاجر المربوطة:\n${escapeHtml(storeNames)}` : '');
    } else {
      replyText =
        `✅ تم حفظ رقمك (<code>${escapeHtml(verifiedContactPhone)}</code>) في قاعدة البيانات بنجاح.\n\n` +
        `لم يتم العثور على متجر مسجل بهذا الرقم حالياً — فور تسجيل متجرك بنفس الرقم أو إدخاله في «إعداد التليجرام» بلوحة التحكم سيتم التعرف عليك وإرسال الطلبات هنا تلقائياً.`;
    }

    const sent = await sendTelegramMessage(chatId, replyText, { remove_keyboard: true });
    if (!sent) console.warn(`[Telegram Bot] Failed replying after contact share to chat=${chatId}: ${lastSendError}`);
    return;
  }

  // 2. Check /start [ord_...] or /start@BotName [ord_...]
  const startMatch = text.match(/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s+([a-zA-Z0-9_-]+))?/i);
  const param = startMatch ? startMatch[1]?.trim() : undefined;

  let knownVerifiedPhone = findVerifiedPhoneForChatId(chatId);
  if (!knownVerifiedPhone) {
    await syncTelegramUsersFromSupabase(true, true);
    knownVerifiedPhone = findVerifiedPhoneForChatId(chatId);
  }

  if (param && param.startsWith('ord_')) {
    const pendingLink = await getPendingOrderLink(param);
    if (!pendingLink) {
      const sent = await sendTelegramMessage(
        chatId,
        'انتهت صلاحية رابط الربط، يرجى العودة إلى قسم «إعداد التليجرام» في لوحة التحكم والضغط على زر الربط مجدداً.',
        { remove_keyboard: true }
      );
      if (!sent) console.warn(`[Telegram Bot] Failed replying to expired ord_ link for chat=${chatId}: ${lastSendError}`);
      return;
    }

    if (knownVerifiedPhone && phonesMatch(knownVerifiedPhone, pendingLink.phone)) {
      await bindRestaurantToTelegram(pendingLink.rid, {
        phone: pendingLink.phone,
        chatId,
        username: msg.from?.username,
        enabled: true,
      });
      const sent = await sendTelegramMessage(
        chatId,
        cachedTelegramConfig.verifiedSuccessText || DEFAULT_TELEGRAM_CONFIG.verifiedSuccessText,
        { remove_keyboard: true }
      );
      if (!sent) console.warn(`[Telegram Bot] Failed replying verified ord_ link for chat=${chatId}: ${lastSendError}`);
      return;
    }

    await savePendingLinkForChat(chatKey, param);
    const sent = await sendTelegramMessage(
      chatId,
      cachedTelegramConfig.welcomeSharePhoneText || DEFAULT_TELEGRAM_CONFIG.welcomeSharePhoneText,
      buildRequestContactKeyboard()
    );
    if (!sent) console.warn(`[Telegram Bot] Failed sending contact keyboard for ord_ link to chat=${chatId}: ${lastSendError}`);
    return;
  }

  // 3. Plain /start or unrecognized prompt from unverified user -> ALWAYS ask to share phone number first
  if (!knownVerifiedPhone) {
    const sent = await sendTelegramMessage(
      chatId,
      cachedTelegramConfig.welcomeSharePhoneText || DEFAULT_TELEGRAM_CONFIG.welcomeSharePhoneText,
      buildRequestContactKeyboard()
    );
    if (!sent) console.warn(`[Telegram Bot] Failed sending welcome/contact keyboard to chat=${chatId}: ${lastSendError}`);
    return;
  }

  if (startMatch) {
    const matchedStores = await autoLinkRestaurantsByPhone(
      knownVerifiedPhone,
      chatId,
      msg.from?.username,
      true
    );
    if (matchedStores.length > 0) {
      const storeNames = matchedStores.map((s) => `• ${s.name}`).join('\n');
      const sent = await sendTelegramMessage(
        chatId,
        `حسابك مربوط ومُفعّل لاستقبال إشعارات الطلبات تلقائياً عبر منيو بلس ✅\n\n📱 الرقم المحفوظ: <code>${escapeHtml(
          knownVerifiedPhone
        )}</code>\n🏪 المتاجر المربوطة:\n${escapeHtml(storeNames)}`,
        { remove_keyboard: true }
      );
      if (!sent) console.warn(`[Telegram Bot] Failed sending active confirmation to chat=${chatId}: ${lastSendError}`);
    } else {
      const sent = await sendTelegramMessage(
        chatId,
        `رقمك (<code>${escapeHtml(
          knownVerifiedPhone
        )}</code>) محفوظ في قاعدة البيانات، لكن لا يوجد متجر مطابق له حالياً.\nيمكنك مشاركة رقم آخر بالضغط على الزر بالأسفل أو تسجيل متجرك بنفس الرقم لتصلك الطلبات تلقائياً.`,
        buildRequestContactKeyboard()
      );
      if (!sent) console.warn(`[Telegram Bot] Failed sending re-share keyboard to chat=${chatId}: ${lastSendError}`);
    }
  }
}

/**
 * Background Polling Service for Telegram Bot
 */
let isPollingActive = false;
let lastUpdateId = 0;
let consecutiveAuthErrors = 0;
let pollingGeneration = 0;
let pollingStartPromise: Promise<void> | null = null;

function loadPollStateFromDisk(expectedTokenHash?: string): void {
  try {
    if (fs.existsSync(TELEGRAM_POLL_STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(TELEGRAM_POLL_STATE_FILE, 'utf-8')) as {
        lastUpdateId?: number;
        tokenHash?: string;
      };
      if (
        expectedTokenHash &&
        parsed?.tokenHash &&
        parsed.tokenHash !== expectedTokenHash
      ) {
        lastUpdateId = 0;
        return;
      }
      if (typeof parsed?.lastUpdateId === 'number' && parsed.lastUpdateId > lastUpdateId) {
        lastUpdateId = parsed.lastUpdateId;
      }
    }
  } catch {
    // ignore
  }
}

async function loadPollStateFromStore(expectedTokenHash?: string): Promise<void> {
  loadPollStateFromDisk(expectedTokenHash);
  try {
    const kvState = await getInternalStoreItem<{ lastUpdateId?: number; tokenHash?: string }>(
      TELEGRAM_POLL_STATE_KV_KEY
    );
    if (expectedTokenHash && kvState?.tokenHash && kvState.tokenHash !== expectedTokenHash) {
      lastUpdateId = 0;
      return;
    }
    if (typeof kvState?.lastUpdateId === 'number' && kvState.lastUpdateId > lastUpdateId) {
      lastUpdateId = kvState.lastUpdateId;
    }
  } catch {
    // ignore
  }
}

function persistPollState(updateId: number, tokenHash?: string): void {
  if (!updateId) return;
  const payload = { lastUpdateId: updateId, ...(tokenHash ? { tokenHash } : {}), updatedAt: Date.now() };
  try {
    writeFileAtomicSync(TELEGRAM_POLL_STATE_FILE, JSON.stringify(payload));
  } catch {
    // ignore
  }
  void setInternalStoreItem(TELEGRAM_POLL_STATE_KV_KEY, payload).catch(() => {});
}

export function stopTelegramBotPolling(): void {
  pollingGeneration++;
  isPollingActive = false;
}

export async function restartTelegramBotPolling(): Promise<void> {
  stopTelegramBotPolling();
  await new Promise((r) => setTimeout(r, 250));
  await startTelegramBotPolling();
}

export async function startTelegramBotPolling(): Promise<void> {
  if (isPollingActive) return;
  if (pollingStartPromise) return pollingStartPromise;

  pollingStartPromise = (async () => {
    await loadTelegramConfigFromStore();
    if (isPollingActive) return;

    const initialInfo = getEffectiveBotTokenInfo();
    if (!initialInfo.token) {
      lastPollError = '';
      console.log('[Telegram Bot] Bot token not configured; polling disabled.');
      return;
    }

    const identity = await syncVerifiedBotIdentity(undefined, true);
    const activeInfo = getEffectiveBotTokenInfo();
    const token = activeInfo.token;
    if (!identity.ok && identity.error && /401|404|غير صالح|غير صحيحة|Not Found/i.test(identity.error)) {
      lastPollError = identity.error;
      isPollingActive = false;
      console.warn('[Telegram Bot] Invalid/rejected bot token:', identity.error);
      return;
    }

    const activeTokenHash = getTokenHash(token);
    await loadPollStateFromStore(activeTokenHash);

    const botUsername = getEffectiveBotUsername();
    const myGen = ++pollingGeneration;
    isPollingActive = true;
    lastPollError = '';
    lastPollSuccessAt = 0;

    console.log(`[Telegram Bot] Initializing polling for @${botUsername} (source=${activeInfo.source}, offset=${lastUpdateId})...`);

    try {
      const delRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`, {
        signal: AbortSignal.timeout(10000),
      });
      const delJson = (await delRes.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      if (!delJson.ok && delJson.description) {
        console.warn('[Telegram Bot] deleteWebhook notice:', delJson.description);
      }
    } catch {
      // ignore webhook warning
    }

    let lastLoggedErrAt = 0;
    let consecutivePollNetworkErrors = 0;
    let isFirstPollCycle = true;
    const encodedAllowedUpdates = encodeURIComponent(JSON.stringify(['message']));

    async function pollLoop() {
      while (isPollingActive && pollingGeneration === myGen) {
        const currentInfo = getEffectiveBotTokenInfo();
        const currentToken = currentInfo.token;
        if (!currentToken) {
          isPollingActive = false;
          lastPollError = '';
          break;
        }
        const currentHash = getTokenHash(currentToken);
        const pollTimeoutSec = isFirstPollCycle ? 0 : 10;
        isFirstPollCycle = false;

        try {
          const url = `https://api.telegram.org/bot${currentToken}/getUpdates?offset=${
            lastUpdateId + 1
          }&timeout=${pollTimeoutSec}&allowed_updates=${encodedAllowedUpdates}`;

          const res = await fetch(url, {
            signal: AbortSignal.timeout(pollTimeoutSec === 0 ? 10000 : 15000),
          });

          const rawText = await res.text().catch(() => '');
          let data: {
            ok?: boolean;
            description?: string;
            result?: Array<{
              update_id: number;
              message?: IncomingTelegramMessage;
            }>;
          } = {};
          try {
            data = rawText ? (JSON.parse(rawText) as typeof data) : {};
          } catch {
            data = { ok: false, description: rawText || `HTTP ${res.status}` };
          }

          if (res.status === 401 || res.status === 404) {
            consecutiveAuthErrors++;
            const friendly = formatTelegramTokenError(res.status, data.description, currentInfo.source, currentToken);
            lastPollError = friendly;
            lastTokenError = friendly;
            lastTokenErrorAt = Date.now();
            verifiedTokenHash = '';
            verifiedTokenUsername = '';
            verifiedTokenBotName = '';
            if (consecutiveAuthErrors === 1) {
              console.warn(`[Telegram Bot] ${res.status} rejected bot token (${currentInfo.source}). Polling backoff active.`);
            }
            await new Promise((r) => setTimeout(r, 30000));
            continue;
          }

          if (res.status === 409) {
            const desc = String(data.description || '');
            if (/webhook/i.test(desc)) {
              lastPollError = '';
              await fetch(`https://api.telegram.org/bot${currentToken}/deleteWebhook?drop_pending_updates=false`, {
                signal: AbortSignal.timeout(8000),
              }).catch(() => {});
              await new Promise((r) => setTimeout(r, 1500));
            } else {
              // Another active server replica/instance holds getUpdates; the bot itself is reachable and operational.
              consecutivePollNetworkErrors = 0;
              lastPollError = '';
              if (!lastPollSuccessAt) {
                lastPollSuccessAt = Date.now();
              }
              const nowTs = Date.now();
              if (nowTs - lastLoggedErrAt > 120000) {
                lastLoggedErrAt = nowTs;
                console.log('[Telegram Bot] Shared polling active on sibling instance; keeping user sync & sending active.');
              }
              await syncTelegramUsersFromSupabase().catch(() => {});
              await new Promise((r) => setTimeout(r, 12000));
            }
            continue;
          }

          consecutiveAuthErrors = 0;

          if (!res.ok || !data.ok) {
            consecutivePollNetworkErrors++;
            if (consecutivePollNetworkErrors >= 3) {
              lastPollError = data.description || `HTTP ${res.status}`;
            }
            await new Promise((r) => setTimeout(r, 4000));
            continue;
          }

          consecutivePollNetworkErrors = 0;
          lastPollError = '';
          lastTokenError = '';
          lastTokenErrorAt = 0;
          lastPollSuccessAt = Date.now();

          if (Array.isArray(data.result) && data.result.length > 0) {
            let maxSeen = lastUpdateId;
            for (const update of data.result) {
              if (update.update_id > maxSeen) maxSeen = update.update_id;
            }
            if (maxSeen > lastUpdateId) {
              lastUpdateId = maxSeen;
              persistPollState(lastUpdateId, currentHash);
            }

            for (const update of data.result) {
              if (processedUpdateIds.has(update.update_id)) continue;
              processedUpdateIds.add(update.update_id);
              if (processedUpdateIds.size > 2000) {
                const firstUpd = processedUpdateIds.values().next().value;
                if (firstUpd !== undefined) processedUpdateIds.delete(firstUpd);
              }
              const msg = update.message;
              if (!msg) continue;
              await handleIncomingTelegramMessage(msg);
            }
          }
        } catch (err: any) {
          const msg = err?.message || String(err);
          consecutivePollNetworkErrors++;
          if (consecutivePollNetworkErrors >= 3) {
            lastPollError = msg;
          }
          const nowTs = Date.now();
          if (nowTs - lastLoggedErrAt > 30000) {
            lastLoggedErrAt = nowTs;
            console.warn('[Telegram Bot] Polling error:', msg);
          }
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    }

    void pollLoop();
  })().finally(() => {
    pollingStartPromise = null;
  });

  return pollingStartPromise;
}

export function getTelegramBotStatus(): {
  configured: boolean;
  enabled: boolean;
  botUsername: string;
  boundUsersCount: number;
  pollingActive: boolean;
  pollingHealthy: boolean;
  botTokenValid: boolean;
  botTokenError: string | null;
  tokenSource: 'override' | 'env' | 'none';
  lastPollError: string | null;
  lastSendError: string | null;
  lastPollSuccessAt: number | null;
  provider: 'telegram';
} {
  const uniquePhones = new Set<string>();
  for (const rec of telegramUsers.values()) {
    uniquePhones.add(getCanonicalPrimaryPhoneKey(rec.phone || rec.normalizedPhone));
  }
  const tokenInfo = getEffectiveBotTokenInfo();
  const botTokenValid = Boolean(tokenInfo.token && isValidBotTokenFormat(tokenInfo.token) && !lastTokenError);
  return {
    configured: Boolean(tokenInfo.token),
    enabled: cachedTelegramConfig.enabled !== false,
    botUsername: getEffectiveBotUsername(),
    boundUsersCount: uniquePhones.size,
    pollingActive: Boolean(isPollingActive),
    pollingHealthy: Boolean(isPollingActive && !lastPollError && (lastPollSuccessAt > 0 || !consecutiveAuthErrors)),
    botTokenValid,
    botTokenError: lastTokenError || null,
    tokenSource: tokenInfo.source,
    lastPollError: lastPollError || null,
    lastSendError: lastSendError || null,
    lastPollSuccessAt: lastPollSuccessAt || null,
    provider: 'telegram',
  };
}

export async function getAdminTelegramConfig() {
  await loadTelegramConfigFromStore();
  await syncTelegramUsersFromSupabase();
  const tokenInfo = getEffectiveBotTokenInfo();
  const effectiveToken = tokenInfo.token;
  const shouldRecheck = Boolean(lastTokenError && Date.now() - lastTokenErrorAt > 10000);
  if (effectiveToken && (!verifiedTokenUsername || shouldRecheck)) {
    await syncVerifiedBotIdentity(undefined, shouldRecheck).catch(() => {});
  }
  const freshTokenInfo = getEffectiveBotTokenInfo();
  const status = getTelegramBotStatus();

  return {
    enabled: cachedTelegramConfig.enabled,
    botUsername: getEffectiveBotUsername(),
    configuredBotUsername: cachedTelegramConfig.botUsername,
    verifiedBotUsername: verifiedTokenUsername || null,
    hasBotTokenOverride: Boolean(normalizeBotToken(cachedTelegramConfig.botTokenOverride || '')),
    hasEnvToken: Boolean(getEnvBotToken()),
    hasEffectiveToken: Boolean(freshTokenInfo.token),
    tokenSource: freshTokenInfo.source,
    botTokenValid: status.botTokenValid,
    botTokenError: status.botTokenError,
    maskedToken: maskToken(freshTokenInfo.token),
    proxyUrl: cachedTelegramConfig.proxyUrl || DEFAULT_TELEGRAM_PROXY_URL,
    welcomeSharePhoneText: cachedTelegramConfig.welcomeSharePhoneText,
    verifiedSuccessText: cachedTelegramConfig.verifiedSuccessText,
    orderHeaderText: cachedTelegramConfig.orderHeaderText,
    orderFooterText: cachedTelegramConfig.orderFooterText,
    updatedAt: cachedTelegramConfig.updatedAt || null,
    runtime: {
      ...status,
      lastPollError: lastPollError || null,
      lastSendError: lastSendError || null,
      lastPollSuccessAt: lastPollSuccessAt || null,
    },
  };
}

export async function updateAdminTelegramConfig(
  patch: Partial<TelegramBotConfig> & { clearTokenOverride?: boolean }
) {
  await loadTelegramConfigFromStore();
  const prevToken = getEffectiveBotToken();

  let nextOverride = cachedTelegramConfig.botTokenOverride;
  if (patch.clearTokenOverride) {
    nextOverride = '';
  } else if (typeof patch.botTokenOverride === 'string' && patch.botTokenOverride.trim()) {
    const rawDraft = patch.botTokenOverride.trim();
    if (!rawDraft.includes('•') && !rawDraft.includes('*')) {
      const normalizedDraft = normalizeBotToken(rawDraft);
      if (!normalizedDraft || !isValidBotTokenFormat(normalizedDraft)) {
        throw new Error(
          'صيغة توكن البوت المدخل غير صحيحة — انسخ التوكن من @BotFather بالصيغة (123456789:ABC...) بدون كلمة bot أو علامات اقتباس.'
        );
      }
      nextOverride = normalizedDraft;
    }
  }

  if (typeof patch.proxyUrl === 'string' && patch.proxyUrl.trim()) {
    const validProxy = sanitizeTelegramProxyUrl(patch.proxyUrl);
    if (!validProxy) {
      throw new Error(
        'صيغة رابط بروكسي تيليجرام غير صحيحة — يجب أن يكون بالصيغة https://t.me/proxy?server=... أو tg://proxy?server=...'
      );
    }
    patch = { ...patch, proxyUrl: validProxy };
  } else if (typeof patch.proxyUrl === 'string' && !patch.proxyUrl.trim()) {
    patch = { ...patch, proxyUrl: DEFAULT_TELEGRAM_PROXY_URL };
  }

  cachedTelegramConfig = sanitizeConfigObject({
    ...cachedTelegramConfig,
    ...patch,
    botTokenOverride: nextOverride,
    updatedAt: new Date().toISOString(),
  });

  const nextToken = getEffectiveBotToken();
  if (nextToken && (nextToken !== prevToken || lastTokenError)) {
    if (nextToken !== prevToken) {
      lastUpdateId = 0;
      lastPollSuccessAt = 0;
      try {
        if (fs.existsSync(TELEGRAM_POLL_STATE_FILE)) fs.unlinkSync(TELEGRAM_POLL_STATE_FILE);
      } catch {
        // ignore
      }
      void deleteInternalStoreItem(TELEGRAM_POLL_STATE_KV_KEY).catch(() => {});
    }
    lastPollError = '';
    lastSendError = '';
    lastTokenError = '';
    lastTokenErrorAt = 0;
    const identity = await syncVerifiedBotIdentity(undefined, true);
    if (identity.ok && identity.username) {
      cachedTelegramConfig.botUsername = identity.username;
    }
  } else if (!nextToken) {
    verifiedTokenHash = '';
    verifiedTokenUsername = '';
    verifiedTokenBotName = '';
    lastTokenError = '';
    lastTokenErrorAt = 0;
  }

  writeFileAtomicSync(TELEGRAM_CONFIG_FILE, JSON.stringify(cachedTelegramConfig, null, 2));
  await setInternalStoreItem(TELEGRAM_CONFIG_KV_KEY, cachedTelegramConfig);

  if (nextToken !== prevToken || !isPollingActive) {
    if (nextToken) {
      await restartTelegramBotPolling();
    } else {
      stopTelegramBotPolling();
    }
  }

  return getAdminTelegramConfig();
}

export async function verifyTelegramBotLive(rid: string): Promise<{
  ok: boolean;
  diagnosticMessage: string;
  status: Awaited<ReturnType<typeof getTelegramOrderLinkStatus>>;
}> {
  await loadTelegramConfigFromStore(true);
  const token = getEffectiveBotToken();
  if (!token) {
    return {
      ok: false,
      diagnosticMessage: 'توكن البوت غير مضبوط في المنصة (TELEGRAM_BOT_TOKEN أو إعدادات الأدمن).',
      status: await getTelegramOrderLinkStatus(rid),
    };
  }

  const identity = await syncVerifiedBotIdentity(undefined, true);
  if (!identity.ok) {
    lastPollError = identity.error || 'تعذر التحقق من التوكن';
    return {
      ok: false,
      diagnosticMessage: identity.error || 'فشل التحقق من توكن البوت.',
      status: await getTelegramOrderLinkStatus(rid),
    };
  }

  const resolvedToken = getEffectiveBotToken();
  let webhookCleared = false;
  try {
    const whRes = await fetch(`https://api.telegram.org/bot${resolvedToken}/getWebhookInfo`, {
      signal: AbortSignal.timeout(8000),
    });
    const whData = (await whRes.json()) as { ok?: boolean; result?: { url?: string } };
    if (whData?.result?.url) {
      await fetch(`https://api.telegram.org/bot${resolvedToken}/deleteWebhook?drop_pending_updates=false`, {
        signal: AbortSignal.timeout(8000),
      });
      webhookCleared = true;
    }
  } catch {
    // ignore webhook check error
  }

  if (!isPollingActive) {
    await restartTelegramBotPolling();
    await new Promise((r) => setTimeout(r, 900));
  } else {
    lastPollError = '';
  }

  lastSendErrorByRid.delete(String(rid || '').trim());
  const freshStatus = await getTelegramOrderLinkStatus(rid);
  if (freshStatus.lastPollError) {
    return {
      ok: false,
      diagnosticMessage: freshStatus.lastPollError,
      status: freshStatus,
    };
  }

  return {
    ok: true,
    diagnosticMessage: `البوت @${freshStatus.botUsername} متصل ويستقبل الطلبات بشكل سليم ✓${
      webhookCleared ? ' (تمت إزالة Webhook عالق)' : ''
    }`,
    status: freshStatus,
  };
}

export async function testTelegramBotConnection(customToken?: string): Promise<{
  ok: boolean;
  bot?: { id: number; username?: string; first_name?: string };
  webhookUrl?: string;
  error?: string;
}> {
  await loadTelegramConfigFromStore(true);
  const rawCustom = String(customToken || '').trim();
  const tokenInfo = rawCustom
    ? { token: normalizeBotToken(rawCustom), source: 'override' as const }
    : getEffectiveBotTokenInfo();
  const token = tokenInfo.token;
  if (!token) {
    return { ok: false, error: 'لم يتم تعيين توكن البوت بعد.' };
  }
  if (!isValidBotTokenFormat(token)) {
    return {
      ok: false,
      error: `صيغة توكن البوت غير صحيحة (المصدر: ${getTokenSourceLabel(tokenInfo.source)} · ${maskToken(token)}) — يجب أن يكون بالصيغة (123456789:ABC...) من @BotFather بدون كلمة bot أو علامات اقتباس.`,
    };
  }

  try {
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10000),
    });
    const meData = (await meRes.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { id: number; username?: string; first_name?: string };
    };
    if (!meRes.ok || !meData.ok || !meData.result) {
      return {
        ok: false,
        error:
          meRes.status === 401 || meRes.status === 404
            ? formatTelegramTokenError(meRes.status, meData.description, tokenInfo.source, token)
            : meData.description || 'فشل التحقق من توكن البوت عبر تيليجرام.',
      };
    }

    let webhookUrl = '';
    try {
      const whRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
        signal: AbortSignal.timeout(8000),
      });
      const whData = (await whRes.json()) as { ok?: boolean; result?: { url?: string } };
      webhookUrl = whData?.result?.url || '';
      if (webhookUrl) {
        await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`, {
          signal: AbortSignal.timeout(8000),
        });
      }
    } catch {
      // ignore webhook diagnostic error
    }

    return {
      ok: true,
      bot: meData.result,
      webhookUrl,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'تعذر الاتصال بخوادم تيليجرام.' };
  }
}

export async function sendTelegramTestMessage(
  targetPhoneOrChatId: string,
  customText?: string
): Promise<{ ok: boolean; chatId?: string; message: string }> {
  await loadTelegramConfigFromStore();
  await syncTelegramUsersFromSupabase();

  const token = getEffectiveBotToken();
  if (!token) {
    return { ok: false, message: 'توكن البوت غير مهيأ.' };
  }

  const rawTarget = String(targetPhoneOrChatId || '').trim();
  if (!rawTarget) {
    return { ok: false, message: 'يرجى إدخال رقم هاتف مربوط أو Chat ID.' };
  }

  let resolvedChatId: number | string | null = getVerifiedChatIdForPhone(rawTarget);
  if (!resolvedChatId && /^-?\d{5,16}$/.test(rawTarget)) {
    resolvedChatId = rawTarget;
  }

  if (!resolvedChatId) {
    return {
      ok: false,
      message: 'هذا الرقم غير مربوط في قاعدة بيانات تيليجرام بعد، أو أدخل Chat ID رقمي مباشر.',
    };
  }

  const body =
    String(customText || '').trim() ||
    'رسالة اختبار من لوحة تحكم منيو بلس ✅ — البوت يعمل ويرسل الطلبات بنجاح.';
  const sent = await sendTelegramMessage(resolvedChatId, body);
  if (!sent) {
    return {
      ok: false,
      chatId: String(resolvedChatId),
      message: 'تعذر إرسال الرسالة إلى هذا الحساب (تأكد من التوكن وأن المستخدم لم يحظر البوت).',
    };
  }
  return {
    ok: true,
    chatId: String(resolvedChatId),
    message: `تم إرسال الرسالة التجريبية بنجاح إلى (${resolvedChatId}) ✓`,
  };
}
