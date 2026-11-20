/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyChanges,
  getInternalStoreItem,
  isSafeStoreKey,
  readAll,
  setInternalStoreItem,
} from './server/neon-store.ts';
import {
  checkSupabaseHealth,
  getDatabaseUrlInfo,
  getSupabasePublicConfig,
  isSupabaseConfigured,
} from './server/supabase.ts';
import {
  readNotesDocument,
  saveNoteToFile,
  deleteNoteFromFile,
  replaceAllNotesInFile,
  type StoredNote,
} from './server/notes-store.ts';
import { searchWebImages, proxyExternalImage } from './server/image-search.ts';
import {
  deleteTelegramUserByPhone,
  getTelegramBotStatus,
  getTelegramOrderLinkStatus,
  handleIncomingTelegramMessage,
  initTelegramOrderLink,
  normalizePhoneKeys,
  sendOrderNotificationToTelegram,
  sendPartnerTestOrderNotification,
  startTelegramBotPolling,
  stopTelegramBotPolling,
  toggleTelegramForRestaurant,
  unlinkTelegramForRestaurant,
  updateAdminTelegramConfig,
  verifyTelegramBotLive,
} from './server/telegram-otp.ts';
import {
  attachAuthSession,
  clearAuthSessionsByTarget,
  createServerAuthSession,
  destroyServerAuthSession,
  FULL_OWNER_PERMISSIONS,
  hashPasswordScrypt,
  matchesPhoneCandidates,
  parseRequestCookies,
  requireAdminOrStaff,
  sanitizeAuthSessionForClient,
  signSid,
  updateServerAuthSession,
  verifyStoredCredential,
} from './server/auth.ts';
import { createAdminRouter } from './server/admin-routes.ts';
import {
  collectTakenMenuSlugs,
  createSubdomainRouter,
  extractPlansList,
  generateUniqueMenuCode,
  injectSubdomainHtmlMeta,
  isPaidPlanForRestaurant,
  isValidSixCharCode,
  normalizeSubdomainRules,
  sanitizeSubdomainValue,
  subdomainMiddleware,
  SYSTEM_RESERVED_SUBDOMAINS,
  validatePathSlugFormat,
  type ResolvedSubdomainResult,
  type StoreRecord,
} from './server/subdomain.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const rawPort = String(process.env.PORT || '3000').trim();
const PORT: number | string = /^\d+$/.test(rawPort) ? Number(rawPort) : rawPort;
const isProduction = process.env.NODE_ENV === 'production' || __filename.endsWith('.js');
const BASE_DOMAIN = String(process.env.BASE_DOMAIN || 'menuplus.io')
  .toLowerCase()
  .trim()
  .replace(/^https?:\/\//, '')
  .replace(/\/.*$/, '') || 'menuplus.io';

app.set('trust proxy', true);
app.disable('x-powered-by');
app.use((req, _res, next) => {
  if (req.url.startsWith('//')) {
    req.url = req.url.replace(/^\/{2,}/, '/');
  }
  next();
});
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(compression({ threshold: 1024 }));

// Baseline HTTP security & wildcard-subdomain CORS headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=()');

  const origin = String(req.headers.origin || '').trim();
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.toLowerCase();
      if (
        originHost === BASE_DOMAIN ||
        originHost.endsWith(`.${BASE_DOMAIN}`) ||
        originHost === 'localhost' ||
        originHost.endsWith('.localhost')
      ) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id, X-Admin-Key');
      }
    } catch {
      // ignore invalid origin header
    }
  }
  next();
});

// Auth & OTP sliding-window rate limiters
const otpRateWindowMs = 60_000;
const otpRateMaxRequests = 25;
const otpRateBuckets = new Map<string, number[]>();
const loginRateMaxRequests = 20;
const loginRateBuckets = new Map<string, number[]>();

const otpCleanupTimer = setInterval(() => {
  const cutoff = Date.now() - otpRateWindowMs;
  for (const bucket of [otpRateBuckets, loginRateBuckets]) {
    for (const [ip, timestamps] of bucket.entries()) {
      const valid = timestamps.filter((ts) => ts > cutoff);
      if (valid.length === 0) {
        bucket.delete(ip);
      } else {
        bucket.set(ip, valid);
      }
    }
  }
}, otpRateWindowMs);
otpCleanupTimer.unref();

function otpRateLimiter(req: Request, res: Response, next: NextFunction) {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const cutoff = now - otpRateWindowMs;
  const recent = (otpRateBuckets.get(clientIp) || []).filter((ts) => ts > cutoff);

  if (recent.length >= otpRateMaxRequests) {
    return res.status(429).json({
      success: false,
      error: 'طلبات كثيرة جداً، يرجى الانتظار دقيقة والمحاولة مرة أخرى.',
    });
  }

  recent.push(now);
  otpRateBuckets.set(clientIp, recent);
  return next();
}

function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const cutoff = now - otpRateWindowMs;
  const recent = (loginRateBuckets.get(clientIp) || []).filter((ts) => ts > cutoff);

  if (recent.length >= loginRateMaxRequests) {
    return res.status(429).json({
      ok: false,
      error: 'محاولات دخول كثيرة جداً، يرجى الانتظار دقيقة والمحاولة مرة أخرى.',
    });
  }

  recent.push(now);
  loginRateBuckets.set(clientIp, recent);
  return next();
}

// Attach verified server session from signed HttpOnly cookie BEFORE any API routes
app.use(attachAuthSession);

// 0. Health Check endpoint for Hostinger / reverse proxies
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    env: isProduction ? 'production' : 'development',
    uptime: Math.round(process.uptime()),
  });
});

function sanitizeRecordSecrets<T>(record: T): T {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const copy = { ...(record as Record<string, unknown>) };
  if ('telegramChatId' in copy || 'telegramPhone' in copy || 'telegramLinked' in copy) {
    const hasChat = Boolean(String(copy.telegramChatId || '').trim());
    const hasPhone = Boolean(String(copy.telegramPhone || '').trim()) && copy.telegramUnlinkedManually !== true;
    copy.telegramLinked = hasChat || hasPhone || Boolean(copy.telegramLinked);
  }
  delete copy.pw;
  delete copy.passwordHash;
  delete copy.jwtToken;
  delete copy.telegramChatId;
  return copy as T;
}

function getOwnedPartnerRids(allData: Record<string, unknown>, ownerRid?: string): Set<string> {
  const owned = new Set<string>();
  if (!ownerRid) return owned;
  owned.add(ownerRid);
  for (const [k, v] of Object.entries(allData)) {
    if (!k.startsWith('restaurants/') || k.slice('restaurants/'.length).includes('/')) continue;
    const rec = v as Record<string, unknown> | undefined;
    if (rec && String(rec.parentRid || '') === ownerRid) {
      owned.add(k.slice('restaurants/'.length));
    }
  }
  return owned;
}

function collectTakenSlugsFromAllData(allData: Record<string, unknown>, excludeRid?: string): Set<string> {
  const taken = new Set<string>();
  for (const [k, v] of Object.entries(allData)) {
    if (!k.startsWith('restaurants/') || k.slice('restaurants/'.length).includes('/') || !v || typeof v !== 'object') {
      continue;
    }
    const rid = k.slice('restaurants/'.length);
    if (excludeRid && rid === excludeRid) continue;
    const rec = v as Record<string, unknown>;
    const s1 = sanitizeSubdomainValue(String(rec.slug || ''));
    const s2 = sanitizeSubdomainValue(String(rec.subdomain || ''));
    if (s1) taken.add(s1);
    if (s2) taken.add(s2);
  }
  return taken;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const safe = Math.max(1, Math.min(3650, Math.round(days)));
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + safe);
  return d.toISOString().slice(0, 10);
}

// 1. Role-Scoped & Hardened Database Endpoints
app.get('/api/db', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const allData = await readAll(false);
    const ses = req.authSession;
    const out: Record<string, unknown> = {};

    if (ses?.admin) {
      const perms =
        ses.role === 'owner' || !ses.staffId
          ? FULL_OWNER_PERMISSIONS
          : { ...FULL_OWNER_PERMISSIONS, ...req.authPermissions };
      for (const [k, v] of Object.entries(allData)) {
        if (k.startsWith('accounts/')) {
          if (perms.canManageRestaurants || ses.accountId === k.slice('accounts/'.length)) {
            out[k] = sanitizeRecordSecrets(v);
          }
        } else if (k.startsWith('staff/')) {
          if (perms.canManageStaff || ses.staffId === k.slice('staff/'.length)) {
            out[k] = sanitizeRecordSecrets(v);
          }
        } else if (k.startsWith('notes/')) {
          if (perms.canUseNotes) {
            out[k] = v;
          }
        } else if (k.startsWith('reports/')) {
          if (perms.canViewReports !== false) {
            out[k] = v;
          }
        } else if (k.startsWith('finance_expenses/') || k.startsWith('finance_profits/') || k === 'settings/finance') {
          if (perms.canManageFinance) {
            out[k] = v;
          }
        } else if (k.startsWith('custom_font_files/')) {
          continue;
        } else {
          out[k] = sanitizeRecordSecrets(v);
        }
      }
      return res.json(out);
    }

    if (ses && ses.role === 'partner') {
      const ownerRid = ses.personalRid || ses.rid;
      const ownedRids = getOwnedPartnerRids(allData, ownerRid);
      for (const [k, v] of Object.entries(allData)) {
        if (
          (k.startsWith('settings/') && k !== 'settings/finance') ||
          k.startsWith('restaurants/') ||
          k.startsWith('cats/') ||
          k.startsWith('items/') ||
          k === 'initialized_v6' ||
          k.startsWith('migrations/')
        ) {
          out[k] = sanitizeRecordSecrets(v);
        } else if (k.startsWith('orders/') || k.startsWith('reports/')) {
          const rec = v as Record<string, unknown> | undefined;
          if (rec && ownedRids.has(String(rec.rid || ''))) {
            out[k] = sanitizeRecordSecrets(v);
          }
        } else if (ses.accountId && k === `accounts/${ses.accountId}`) {
          out[k] = sanitizeRecordSecrets(v);
        }
      }
      return res.json(out);
    }

    // Unauthenticated visitor: public storefront catalog & settings only
    for (const [k, v] of Object.entries(allData)) {
      if (
        (k.startsWith('settings/') && k !== 'settings/finance') ||
        k.startsWith('restaurants/') ||
        k.startsWith('cats/') ||
        k.startsWith('items/') ||
        k === 'initialized_v6' ||
        k.startsWith('migrations/')
      ) {
        out[k] = sanitizeRecordSecrets(v);
      }
    }
    return res.json(out);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Database error' });
  }
});

app.post('/api/db', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Invalid database payload' });
    }
    const payload = body as { put?: Record<string, unknown>; del?: string[] };
    const allData = await readAll(false);
    const ses = req.authSession || null;
    const filteredPut: Record<string, unknown> = {};
    const filteredDel: string[] = [];

    const checkKeyWritable = (key: string, val: unknown, isDelete: boolean): boolean => {
      if (!isSafeStoreKey(key)) return false;

      // Guest visitor: only permitted to place new pending customer orders
      if (!ses) {
        if (isDelete || !key.startsWith('orders/')) return false;
        if (Object.prototype.hasOwnProperty.call(allData, key)) return false;
        if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
        const ord = val as Record<string, unknown>;
        const rid = String(ord.rid || '').trim();
        if (!rid || !allData[`restaurants/${rid}`]) return false;
        const tot = Number(ord.tot ?? ord.total ?? 0);
        if (!Number.isFinite(tot) || tot < 0) return false;
        return true;
      }

      // Partner user: strictly scoped to own store + child branches
      if (!ses.admin) {
        const ownerRid = ses.personalRid || ses.rid;
        const ownedRids = getOwnedPartnerRids(allData, ownerRid);

        if (key.startsWith('restaurants/') && !key.slice('restaurants/'.length).includes('/')) {
          const rid = key.slice('restaurants/'.length);
          if (isDelete) {
            // Partners can delete their own child branch, never the main store
            return rid !== ownerRid && ownedRids.has(rid);
          }
          if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
          const existing = allData[key] as Record<string, unknown> | undefined;
          const nextObj = { ...(val as Record<string, unknown>) };
          const plansList = extractPlansList(allData['settings/plans']);
          const subRules = normalizeSubdomainRules((allData['settings/site'] as Record<string, unknown>) || null);
          const takenSlugs = collectTakenSlugsFromAllData(allData, rid);

          if (existing) {
            if (!ownedRids.has(rid)) return false;
            // Prevent client-side plan escalation, expiry extension, or suspension bypass
            nextObj.planId = existing.planId;
            nextObj.p = existing.p;
            nextObj.e = existing.e;
            nextObj.isPaid = existing.isPaid;
            nextObj.a = existing.a;
            if (existing.parentRid) nextObj.parentRid = existing.parentRid;
            if (existing.isBranch !== undefined) nextObj.isBranch = existing.isBranch;
            if (!nextObj.telegramChatId && existing.telegramChatId) nextObj.telegramChatId = existing.telegramChatId;
            if (!nextObj.telegramPhone && existing.telegramPhone) nextObj.telegramPhone = existing.telegramPhone;
            if (!nextObj.telegramUsername && existing.telegramUsername) nextObj.telegramUsername = existing.telegramUsername;
            if (nextObj.orderChannel === 'both' || nextObj.orderChannel === 'telegram' || nextObj.orderChannel === 'whatsapp') {
              nextObj.telegramNotificationsEnabled = nextObj.orderChannel !== 'whatsapp';
            } else if (existing.orderChannel) {
              nextObj.orderChannel = existing.orderChannel;
            }
            if (nextObj.telegramNotificationsEnabled === undefined && existing.telegramNotificationsEnabled !== undefined) {
              nextObj.telegramNotificationsEnabled = existing.telegramNotificationsEnabled;
            }

            const { isPaid } = isPaidPlanForRestaurant(existing as StoreRecord, plansList);
            const existingSlug = sanitizeSubdomainValue(String(existing.slug || ''));
            const requestedSlug = sanitizeSubdomainValue(String(nextObj.slug || ''));

            if (!isPaid) {
              nextObj.slug = existingSlug && isValidSixCharCode(existingSlug) && !takenSlugs.has(existingSlug)
                ? existingSlug
                : existingSlug || generateUniqueMenuCode(takenSlugs);
              nextObj.subdomain = '';
            } else if (requestedSlug && requestedSlug !== existingSlug) {
              const check = validatePathSlugFormat(requestedSlug, subRules);
              if (check.valid && !takenSlugs.has(requestedSlug)) {
                nextObj.slug = requestedSlug;
                nextObj.subdomain = subRules.enabled ? requestedSlug : '';
              } else {
                nextObj.slug = existingSlug || generateUniqueMenuCode(takenSlugs);
                nextObj.subdomain = subRules.enabled ? String(nextObj.slug) : '';
              }
            } else {
              nextObj.slug = existingSlug || generateUniqueMenuCode(takenSlugs);
              nextObj.subdomain = subRules.enabled ? String(nextObj.slug) : '';
            }

            filteredPut[key] = nextObj;
            return false; // handled custom sanitized write
          } else {
            // Creating a new branch under this partner's account
            if (!ownerRid || String(nextObj.parentRid || '') !== ownerRid) return false;
            const parentRest = allData[`restaurants/${ownerRid}`] as Record<string, unknown> | undefined;
            if (!parentRest) return false;
            nextObj.parentRid = ownerRid;
            nextObj.isBranch = true;
            nextObj.planId = parentRest.planId;
            nextObj.p = parentRest.p;
            nextObj.e = parentRest.e;
            nextObj.isPaid = parentRest.isPaid;
            nextObj.a = parentRest.a;

            const { isPaid } = isPaidPlanForRestaurant(parentRest as StoreRecord, plansList);
            const requestedSlug = sanitizeSubdomainValue(String(nextObj.slug || ''));
            const check = requestedSlug ? validatePathSlugFormat(requestedSlug, subRules) : { valid: false };
            if (isPaid && requestedSlug && check.valid && !takenSlugs.has(requestedSlug)) {
              nextObj.slug = requestedSlug;
              nextObj.subdomain = subRules.enabled ? requestedSlug : '';
            } else {
              nextObj.slug = generateUniqueMenuCode(takenSlugs);
              nextObj.subdomain = '';
            }

            filteredPut[key] = nextObj;
            return false;
          }
        }

        if (key.startsWith('cats/') || key.startsWith('items/') || key.startsWith('orders/')) {
          if (isDelete) {
            const existing = allData[key] as Record<string, unknown> | undefined;
            return Boolean(existing && ownedRids.has(String(existing.rid || '')));
          }
          if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
          const rec = val as Record<string, unknown>;
          return ownedRids.has(String(rec.rid || ''));
        }

        if (key.startsWith('reports/')) {
          if (isDelete || Object.prototype.hasOwnProperty.call(allData, key)) return false;
          if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
          const rep = val as Record<string, unknown>;
          const rid = String(rep.rid || '').trim();
          const msg = String(rep.message || '').trim();
          return Boolean(rid && ownedRids.has(rid) && msg.length > 0);
        }

        if (key.startsWith('logs/') && !isDelete) {
          return true;
        }
        return false;
      }

      // Admin or Staff: check hierarchical permissions per collection
      const perms =
        ses.role === 'owner' || !ses.staffId
          ? FULL_OWNER_PERMISSIONS
          : { ...FULL_OWNER_PERMISSIONS, ...req.authPermissions };

      if (key === 'settings/finance' || key.startsWith('finance_expenses/') || key.startsWith('finance_profits/')) {
        return Boolean(perms.canManageFinance);
      }
      if (key === 'settings/plans') {
        return Boolean(perms.canManagePlans);
      }
      if (key === 'settings/theme') {
        return Boolean(perms.canManageSettings || perms.canManageThemeMode || perms.canEditHomePage);
      }
      if (key.startsWith('settings/')) {
        return Boolean(perms.canManageSettings || perms.canEditTabLabels || perms.canReorderTabs || perms.canManageThemeMode || perms.canManageSubdomains || perms.canEditHomePage);
      }
      if (key === 'restaurants/demo') {
        return Boolean(perms.canEditDemoMenu || perms.canManageRestaurants);
      }
      if (key.startsWith('restaurants/')) {
        if (isDelete) return Boolean(perms.canDeletePartner || perms.canManageRestaurants);
        if (!(perms.canManageRestaurants || perms.canEditDemoMenu)) return false;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const existing = allData[key] as Record<string, unknown> | undefined;
          const nextObj = { ...(val as Record<string, unknown>) };
          if (existing) {
            if (!nextObj.telegramChatId && existing.telegramChatId) nextObj.telegramChatId = existing.telegramChatId;
            if (!nextObj.telegramPhone && existing.telegramPhone) nextObj.telegramPhone = existing.telegramPhone;
            if (!nextObj.telegramUsername && existing.telegramUsername) nextObj.telegramUsername = existing.telegramUsername;
            if (nextObj.orderChannel === 'both' || nextObj.orderChannel === 'telegram' || nextObj.orderChannel === 'whatsapp') {
              nextObj.telegramNotificationsEnabled = nextObj.orderChannel !== 'whatsapp';
            } else if (existing.orderChannel) {
              nextObj.orderChannel = existing.orderChannel;
            }
            if (nextObj.telegramNotificationsEnabled === undefined && existing.telegramNotificationsEnabled !== undefined) {
              nextObj.telegramNotificationsEnabled = existing.telegramNotificationsEnabled;
            }
          }
          filteredPut[key] = nextObj;
          return false;
        }
        return true;
      }
      if (key.startsWith('cats/') || key.startsWith('items/')) {
        const rec = (isDelete ? allData[key] : val) as Record<string, unknown> | undefined;
        const targetRid = String(rec?.rid || '');
        if (targetRid === 'demo') return Boolean(perms.canEditDemoMenu || perms.canManageRestaurants);
        return Boolean(perms.canManageRestaurants);
      }
      if (key.startsWith('orders/')) {
        return Boolean(perms.canManageRestaurants || perms.canViewAnalytics);
      }
      if (key.startsWith('accounts/')) {
        if (isDelete) return Boolean(perms.canDeletePartner && ses.role === 'owner');
        if (ses.role !== 'owner') return false;
        // Preserve existing pw if sanitized client omitted it
        const existing = allData[key] as Record<string, unknown> | undefined;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const nextObj = { ...(val as Record<string, unknown>) };
          if (!nextObj.pw && existing?.pw) nextObj.pw = existing.pw;
          filteredPut[key] = nextObj;
        }
        return false;
      }
      if (key.startsWith('staff/')) {
        if (!perms.canManageStaff) return false;
        if (!isDelete && val && typeof val === 'object' && !Array.isArray(val)) {
          const existing = allData[key] as Record<string, unknown> | undefined;
          const nextObj = { ...(val as Record<string, unknown>) };
          if (!nextObj.passwordHash && existing?.passwordHash) nextObj.passwordHash = existing.passwordHash;
          filteredPut[key] = nextObj;
          return false;
        }
        return true;
      }
      if (key.startsWith('notes/')) {
        return Boolean(perms.canUseNotes);
      }
      if (key.startsWith('reports/')) {
        return Boolean(perms.canViewReports !== false || perms.canManageRestaurants);
      }
      if (key.startsWith('logs/')) {
        return true;
      }
      if (key === 'initialized_v6' || key.startsWith('migrations/')) {
        return Boolean(perms.canManageSettings || ses.role === 'owner');
      }
      return false;
    };

    if (payload.put && typeof payload.put === 'object' && !Array.isArray(payload.put)) {
      for (const [k, v] of Object.entries(payload.put)) {
        if (checkKeyWritable(k, v, false)) {
          filteredPut[k] = v;
        }
      }
    }
    if (Array.isArray(payload.del)) {
      for (const k of payload.del) {
        if (typeof k === 'string' && checkKeyWritable(k, undefined, true)) {
          filteredDel.push(k);
        }
      }
    }

    const hasFilteredWrites = Object.keys(filteredPut).length > 0 || filteredDel.length > 0;
    const requestedWrites =
      (payload.put ? Object.keys(payload.put).length : 0) + (Array.isArray(payload.del) ? payload.del.length : 0);

    if (requestedWrites > 0 && !hasFilteredWrites) {
      return res.status(ses ? 403 : 401).json({
        ok: false,
        error: ses ? 'ليست لديك صلاحية لتعديل هذه البيانات.' : 'يرجى تسجيل الدخول لإجراء هذه العملية.',
      });
    }

    const newOrderEvents: Array<{ rest: Record<string, unknown>; ord: Record<string, unknown>; rid: string }> = [];
    if (hasFilteredWrites) {
      const ridOrderSeqTracker = new Map<string, number>();
      const countStoreOrders = (targetRid: string): number => {
        let count = 0;
        for (const [ak, av] of Object.entries(allData)) {
          if (
            ak.startsWith('orders/') &&
            av &&
            typeof av === 'object' &&
            !Array.isArray(av) &&
            String((av as Record<string, unknown>).rid || '').trim() === targetRid
          ) {
            count++;
          }
        }
        return count;
      };

      for (const [k, v] of Object.entries(filteredPut)) {
        if (
          k.startsWith('orders/') &&
          !Object.prototype.hasOwnProperty.call(allData, k) &&
          v &&
          typeof v === 'object' &&
          !Array.isArray(v)
        ) {
          const ord = v as Record<string, unknown>;
          const rid = String(ord.rid || '').trim();
          const currentRest = (filteredPut[`restaurants/${rid}`] || allData[`restaurants/${rid}`]) as
            | Record<string, unknown>
            | undefined;
          if (currentRest) {
            const baseCount = ridOrderSeqTracker.has(rid)
              ? (ridOrderSeqTracker.get(rid) as number)
              : Math.max(Number(currentRest.o || 0) || 0, countStoreOrders(rid));
            const nextSeq = baseCount + 1;
            ridOrderSeqTracker.set(rid, nextSeq);

            const updatedOrder: Record<string, unknown> = {
              ...ord,
              seq: nextSeq,
              orderSeq: nextSeq,
            };
            filteredPut[k] = updatedOrder;

            const updatedRest: Record<string, unknown> = {
              ...currentRest,
              o: Math.max(Number(currentRest.o || 0) || 0, nextSeq),
            };
            filteredPut[`restaurants/${rid}`] = updatedRest;

            newOrderEvents.push({ rest: updatedRest, ord: updatedOrder, rid });
          }
        }
      }
    }

    const newReportEvents: Array<{ rep: Record<string, unknown> }> = [];
    if (hasFilteredWrites) {
      let maxReportSeq = 0;
      for (const [ak, av] of Object.entries(allData)) {
        if (ak.startsWith('reports/') && av && typeof av === 'object' && !Array.isArray(av)) {
          const rec = av as Record<string, unknown>;
          const s = Number(rec.reportSeq || rec.seq || 0);
          if (Number.isFinite(s) && s > maxReportSeq) maxReportSeq = s;
        }
      }
      const existingReportsCount = Object.keys(allData).filter((ak) => ak.startsWith('reports/')).length;
      let nextReportSeqCursor = Math.max(maxReportSeq, existingReportsCount);

      for (const [k, v] of Object.entries(filteredPut)) {
        if (
          k.startsWith('reports/') &&
          !Object.prototype.hasOwnProperty.call(allData, k) &&
          v &&
          typeof v === 'object' &&
          !Array.isArray(v)
        ) {
          const rep = v as Record<string, unknown>;
          nextReportSeqCursor += 1;
          const updatedReport: Record<string, unknown> = {
            ...rep,
            seq: nextReportSeqCursor,
            reportSeq: nextReportSeqCursor,
          };
          filteredPut[k] = updatedReport;
          newReportEvents.push({ rep: updatedReport });
        }
      }
    }

    const result = hasFilteredWrites
      ? await applyChanges({ put: filteredPut, del: filteredDel }, false)
      : { persistedToSupabase: false };

    let telegramDispatch: { sent: boolean; reason?: string } | undefined;
    if (newOrderEvents.length > 0) {
      for (const ev of newOrderEvents) {
        const tgRes = await sendOrderNotificationToTelegram(
          { ...ev.rest, id: ev.rest.id || ev.rid },
          ev.ord
        ).catch((err) => ({ sent: false, reason: err instanceof Error ? err.message : 'error' }));
        telegramDispatch = tgRes;
        if (
          !tgRes.sent &&
          tgRes.reason &&
          tgRes.reason !== 'channel_whatsapp_only' &&
          tgRes.reason !== 'store_notifications_disabled'
        ) {
          console.warn(`[Telegram Order] Store ${ev.rid} order #${String(ev.ord.orderSeq || ev.ord.seq || '').trim() || String(ev.ord.id || '').slice(-6)} not sent: ${tgRes.reason}`);
        }
      }
    }

    const assignedOrderSeqs =
      newOrderEvents.length > 0
        ? Object.fromEntries(
            newOrderEvents
              .map((ev): [string, number] => [String(ev.ord.id || ''), Number(ev.ord.orderSeq || 0)])
              .filter(([id, seq]) => Boolean(id) && seq > 0)
          )
        : undefined;

    const assignedReportSeqs =
      newReportEvents.length > 0
        ? Object.fromEntries(
            newReportEvents
              .map((ev): [string, number] => [String(ev.rep.id || ''), Number(ev.rep.reportSeq || 0)])
              .filter(([id, seq]) => Boolean(id) && seq > 0)
          )
        : undefined;

    return res.json({
      ok: true,
      driver: isSupabaseConfigured() ? 'supabase' : 'file-memory',
      persistedToSupabase: result.persistedToSupabase,
      ...(assignedOrderSeqs ? { assignedOrderSeqs } : {}),
      ...(assignedReportSeqs ? { assignedReportSeqs } : {}),
      ...(telegramDispatch ? { telegramDispatch } : {}),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Database error' });
  }
});

app.get('/api/public/popular-items/:rid', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const rid = String(req.params.rid || '').trim();
    if (!rid) {
      return res.json({ ok: true, counts: {}, totalOrders: 0 });
    }
    const allData = await readAll(false);
    const counts: Record<string, number> = {};
    let totalOrders = 0;

    for (const [k, v] of Object.entries(allData)) {
      if (!k.startsWith('orders/') || !v || typeof v !== 'object') continue;
      const rec = v as Record<string, unknown>;
      if (String(rec.rid || '') !== rid) continue;
      if (rec.st === 'cancelled' || rec.status === 'cancelled') continue;
      totalOrders += 1;
      const items = Array.isArray(rec.items) ? rec.items : [];
      for (const rawLine of items) {
        if (!rawLine || typeof rawLine !== 'object') continue;
        const line = rawLine as Record<string, unknown>;
        const nameKey = String(line.n || line.name || '').trim().toLowerCase();
        if (!nameKey) continue;
        const qty = Math.max(1, Number(line.q ?? line.qty ?? 1) || 1);
        counts[nameKey] = (counts[nameKey] || 0) + qty;
      }
    }

    return res.json({ ok: true, counts, totalOrders });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Database error', counts: {}, totalOrders: 0 });
  }
});

app.get('/api/db-status', async (req, res) => {
  try {
    const supabaseHealth = await checkSupabaseHealth();
    const databaseUrl = getDatabaseUrlInfo();
    if (!req.authSession?.admin) {
      return res.json({
        connected: supabaseHealth.configured ? supabaseHealth.connected : true,
        status: !supabaseHealth.configured || supabaseHealth.connected ? 'operational' : 'degraded',
      });
    }
    const all = await readAll();
    const count = Object.keys(all).length;
    return res.json({
      connected: supabaseHealth.configured ? supabaseHealth.connected : true,
      driver: isSupabaseConfigured() ? 'supabase' : 'file-memory',
      supabase: supabaseHealth,
      databaseUrl,
      recordsCount: count,
      status: !supabaseHealth.configured || supabaseHealth.connected ? 'operational' : 'degraded',
    });
  } catch (err: any) {
    return res.status(500).json({
      connected: false,
      error: req.authSession?.admin ? err?.message || 'Database error' : 'Database unavailable',
    });
  }
});

// 1.5. Verified Cookie-Backed Authentication Endpoints
app.get('/api/auth/supabase-public-config', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const publicCfg = getSupabasePublicConfig();
  return res.json({
    ok: true,
    configured: Boolean(publicCfg),
    googleAuthEnabled: false,
    ...(publicCfg ? { url: publicCfg.url, anonKey: publicCfg.anonKey } : {}),
  });
});

app.get('/api/auth/me', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    ok: true,
    authenticated: Boolean(req.authSession),
    session: sanitizeAuthSessionForClient(req.authSession || null),
    ...(req.authSession?.sid ? { token: signSid(req.authSession.sid) } : {}),
  });
});

app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const identifier = String(body.identifier || '').trim();
    const fullPhone = String(body.fullPhone || '').trim();
    const password = String(body.password || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ ok: false, error: 'يرجى إدخال رقم الهاتف أو المعرف وكلمة المرور.' });
    }

    const allData = await readAll(false);
    const idCandidates = Array.from(new Set([identifier, fullPhone].filter(Boolean)));
    const matchesAnyId = (val: unknown): boolean => {
      if (typeof val !== 'string' || !val.trim()) return false;
      return idCandidates.some((c) => matchesPhoneCandidates(val, c));
    };

    // 1. Direct owner fallback bootstrap if acc_admin_owner not yet persisted
    const isOwnerPhone = idCandidates.some((c) => matchesPhoneCandidates('07711448594', c));
    let matchedAnyAccount = isOwnerPhone;
    if (isOwnerPhone && !allData['accounts/acc_admin_owner'] && password.toLowerCase() === 'admin') {
      const ownerAcc = {
        id: 'acc_admin_owner',
        username: '07711448594',
        em: '07711448594',
        phone: '+9647711448594',
        pw: hashPasswordScrypt('admin'),
        rid: 'demo',
        admin: true,
        active: true,
        at: todayIsoDate(),
        created: todayIsoDate(),
      };
      await applyChanges({ put: { 'accounts/acc_admin_owner': ownerAcc } }, false);
      const ses = await createServerAuthSession(req, res, {
        role: 'owner',
        admin: true,
        accountId: 'acc_admin_owner',
        rid: 'demo',
        personalRid: 'demo',
        name: 'مالك المنصة',
        phone: '+9647711448594',
        email: '07711448594',
        roleTitle: 'مالك المنصة والمدير العام',
        permissions: FULL_OWNER_PERMISSIONS,
      });
      return res.json({ ok: true, token: signSid(ses.sid), session: sanitizeAuthSessionForClient(ses), restaurant: allData['restaurants/demo'] || null });
    }

    // 2. Staff accounts in staff/*
    for (const [key, val] of Object.entries(allData)) {
      if (!key.startsWith('staff/') || !val || typeof val !== 'object') continue;
      const stf = val as Record<string, any>;
      if (!matchesAnyId(stf.phone) && !matchesAnyId(stf.email)) continue;
      matchedAnyAccount = true;

      const credOk = verifyStoredCredential(
        stf.passwordHash || stf.pw,
        [stf.email, stf.phone, identifier, fullPhone],
        password,
        false
      );
      if (!credOk) continue;

      if (stf.active === false) {
        return res.status(403).json({ ok: false, error: 'تم إيقاف هذا الحساب من قبل إدارة المنصة.' });
      }
      const staffId = key.slice('staff/'.length);
      const perms = stf.permissions || {};
      const ses = await createServerAuthSession(req, res, {
        role: 'staff',
        admin: true,
        staffId,
        rid: 'demo',
        personalRid: 'demo',
        name: String(stf.name || 'موظف إدارة'),
        email: String(stf.email || stf.phone || ''),
        phone: String(stf.phone || ''),
        roleTitle: String(stf.roleTitle || 'موظف إدارة'),
        permissions: perms,
      });
      return res.json({ ok: true, token: signSid(ses.sid), session: sanitizeAuthSessionForClient(ses), restaurant: allData['restaurants/demo'] || null });
    }

    // 3. Admin & Partner accounts in accounts/* (prioritize admin accounts first)
    const accountEntries = Object.entries(allData)
      .filter(([key, val]) => key.startsWith('accounts/') && Boolean(val) && typeof val === 'object')
      .sort(([kA, vA], [kB, vB]) => {
        const aRec = vA as Record<string, any>;
        const bRec = vB as Record<string, any>;
        const aIsAdmin = aRec.admin === true || aRec.r === 'admin' || kA.startsWith('accounts/acc_admin_') ? 0 : 1;
        const bIsAdmin = bRec.admin === true || bRec.r === 'admin' || kB.startsWith('accounts/acc_admin_') ? 0 : 1;
        return aIsAdmin - bIsAdmin;
      });

    for (const [key, val] of accountEntries) {
      const acc = val as Record<string, any>;
      const accId = key.slice('accounts/'.length);
      if (
        !matchesAnyId(acc.email) &&
        !matchesAnyId(acc.phone) &&
        !matchesAnyId(acc.projectPhone) &&
        !matchesAnyId(acc.em) &&
        !matchesAnyId(acc.username) &&
        !matchesAnyId(acc.e) &&
        !matchesAnyId(acc.u)
      ) {
        continue;
      }
      matchedAnyAccount = true;

      const credOk = verifyStoredCredential(
        acc.pw,
        [acc.email, acc.username, acc.em, acc.phone, acc.e, acc.u, identifier, fullPhone, '07711448594'],
        password,
        accId === 'acc_menu_demo'
      );
      if (!credOk) continue;

      if (acc.active === false) {
        return res.status(403).json({ ok: false, error: 'تم إيقاف هذا الحساب من قبل إدارة المنصة.' });
      }

      const isAdmin = Boolean(acc.admin === true || acc.r === 'admin' || accId.startsWith('acc_admin_'));
      const rid = String(acc.rid || (isAdmin ? 'demo' : '')).trim() || 'demo';
      const linkedRest = allData[`restaurants/${rid}`] as Record<string, any> | undefined;

      if (!isAdmin && linkedRest && linkedRest.a === 0) {
        return res.status(403).json({ ok: false, error: 'تم إيقاف هذا المتجر مؤقتاً، يرجى التواصل مع الدعم الفني.' });
      }

      if (isAdmin) {
        const ses = await createServerAuthSession(req, res, {
          role: 'owner',
          admin: true,
          accountId: accId,
          rid,
          personalRid: rid,
          name: String(acc.n || 'مدير المنصة'),
          email: String(acc.em || acc.phone || identifier),
          phone: String(acc.phone || acc.ph || ''),
          roleTitle: String(acc.roleTitle || 'مالك المنصة والمدير العام'),
          permissions: FULL_OWNER_PERMISSIONS,
        });
        return res.json({ ok: true, token: signSid(ses.sid), session: sanitizeAuthSessionForClient(ses), restaurant: linkedRest || null });
      }

      const ses = await createServerAuthSession(req, res, {
        role: 'partner',
        admin: false,
        accountId: accId,
        rid,
        personalRid: rid,
        name: String(acc.n || acc.projectName || linkedRest?.n || 'شريك'),
        email: String(acc.em || acc.phone || ''),
        phone: String(acc.phone || acc.ph || ''),
      });
      return res.json({ ok: true, token: signSid(ses.sid), session: sanitizeAuthSessionForClient(ses), restaurant: linkedRest || null });
    }

    return res.status(401).json({
      ok: false,
      error: matchedAnyAccount ? 'كلمة المرور غير صحيحة.' : 'لا يوجد حساب بهذا الرقم.',
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر إتمام تسجيل الدخول.' });
  }
});

app.post('/api/onboard/profile', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ses = req.authSession;
    if (!ses) {
      return res.status(401).json({ ok: false, error: 'يرجى تسجيل الدخول للمتابعة.' });
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const allData = await readAll(false);
    const ownerRid = ses.personalRid || ses.rid;
    const ownedRids = ses.admin ? null : getOwnedPartnerRids(allData, ownerRid);
    const rid = String(body.rid || ses.rid || ownerRid || '').trim();
    if (!rid || (ownedRids && !ownedRids.has(rid))) {
      return res.status(403).json({ ok: false, error: 'غير مصرح بتعديل هذا المشروع.' });
    }

    const existingRest = (allData[`restaurants/${rid}`] as Record<string, any> | undefined) || { id: rid };
    const nextRest: Record<string, any> = { ...existingRest };

    if (typeof body.n === 'string' && body.n.trim()) {
      nextRest.n = body.n.trim().slice(0, 120);
      nextRest.ow = nextRest.n;
    }
    if (body.ph !== undefined) {
      nextRest.ph = String(body.ph || '').trim().slice(0, 32);
    }
    if (body.projectType === 'restaurant' || body.projectType === 'store') {
      nextRest.projectType = body.projectType;
    }
    if (typeof body.logo === 'string' && body.logo.length <= 450_000) {
      nextRest.logo = body.logo;
    }
    if (Array.isArray(body.coverImages)) {
      nextRest.coverImages = body.coverImages
        .filter((x): x is string => typeof x === 'string' && x.length <= 650_000)
        .slice(0, 5);
    }
    if (typeof body.tagline === 'string') {
      nextRest.tagline = body.tagline.trim().slice(0, 220);
    }
    if (typeof body.aboutText === 'string') {
      nextRest.aboutText = body.aboutText.trim().slice(0, 800);
    }
    if (body.themeMode === 'light' || body.themeMode === 'dark' || body.themeMode === 'auto') {
      nextRest.themeMode = body.themeMode;
    }
    if (typeof body.themePreset === 'string' && body.themePreset.trim()) {
      nextRest.themePreset = body.themePreset.trim().slice(0, 48);
    }
    if (typeof body.themeShape === 'string' && body.themeShape.trim()) {
      nextRest.themeShape = body.themeShape.trim().slice(0, 32);
    }
    if (typeof body.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(body.color.trim())) {
      nextRest.color = body.color.trim();
    }
    if (
      body.lay === 'list' ||
      body.lay === 'grid' ||
      body.lay === 'grid3' ||
      body.lay === 'grid4' ||
      body.lay === 'cards'
    ) {
      nextRest.lay = body.lay;
    }
    if (nextRest.projectType === 'store') {
      nextRest.themeMode = 'light';
      nextRest.themePreset = 'estore';
      nextRest.themeShape = 'estore';
      nextRest.color = '#f15a29';
      delete nextRest.bgColor;
      if (String(nextRest.tagline || '').trim() === 'أشهى الأطباق المحضرة يومياً طازجة بجودة عالية') {
        nextRest.tagline = '';
      }
    }
    if (body.h && typeof body.h === 'object' && !Array.isArray(body.h)) {
      nextRest.h = body.h;
    }
    if (body.done === 0 || body.done === 1) {
      nextRest.done = body.done;
    }
    if (body.on === 0 || body.on === 1) {
      nextRest.on = body.on;
    }
    const plansList = extractPlansList(allData['settings/plans']);
    const subRules = normalizeSubdomainRules((allData['settings/site'] as Record<string, unknown>) || null);
    const takenSlugs = collectTakenSlugsFromAllData(allData, rid);
    const { isPaid: restIsPaid } = isPaidPlanForRestaurant(nextRest as StoreRecord, plansList);
    const canUseCustomSlug = Boolean(ses.admin) || restIsPaid;

    if (!canUseCustomSlug) {
      const curSlug = sanitizeSubdomainValue(String(nextRest.slug || ''));
      if (!isValidSixCharCode(curSlug) || takenSlugs.has(curSlug)) {
        nextRest.slug = generateUniqueMenuCode(takenSlugs);
      } else {
        nextRest.slug = curSlug;
      }
      nextRest.subdomain = '';
    } else {
      if (!nextRest.slug || !sanitizeSubdomainValue(String(nextRest.slug))) {
        nextRest.slug = generateUniqueMenuCode(takenSlugs);
      }
      if (typeof body.slug === 'string' && body.slug.trim()) {
        const cleanSlug = sanitizeSubdomainValue(body.slug);
        const validation = validatePathSlugFormat(cleanSlug, subRules);
        if (validation.valid && !takenSlugs.has(cleanSlug)) {
          nextRest.slug = cleanSlug;
          nextRest.subdomain = subRules.enabled ? cleanSlug : '';
        }
      } else if (!subRules.enabled) {
        nextRest.subdomain = '';
      }
    }

    const putMap: Record<string, unknown> = {
      [`restaurants/${rid}`]: nextRest,
    };

    if (ses.accountId && allData[`accounts/${ses.accountId}`]) {
      const existingAcc = allData[`accounts/${ses.accountId}`] as Record<string, any>;
      putMap[`accounts/${ses.accountId}`] = {
        ...existingAcc,
        ...(nextRest.n ? { projectName: nextRest.n, n: nextRest.n } : {}),
        ...(nextRest.projectType ? { projectType: nextRest.projectType } : {}),
        ...(body.ph !== undefined ? { projectPhone: nextRest.ph } : {}),
      };
      if (nextRest.n) {
        await updateServerAuthSession(ses.sid, { ...ses, name: nextRest.n }).catch(() => {});
      }
    }

    putMap[`logs/aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`] = {
      id: `aud_${Date.now().toString(36)}`,
      ts: Date.now(),
      actor: ses.phone || ses.name || nextRest.n || 'شريك',
      action: 'تحديث ملف المشروع والإعداد الأولي',
      details: `المشروع: ${nextRest.n || rid} (${rid})`,
      type: 'restaurant',
    };

    await applyChanges({ put: putMap }, false);
    return res.json({ ok: true, restaurant: nextRest });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر حفظ بيانات المشروع.' });
  }
});

app.post('/api/auth/impersonate', requireAdminOrStaff(), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ses = req.authSession!;
    const rawRid = (req.body as Record<string, unknown>)?.rid;
    const requestedRid = rawRid === null || rawRid === undefined ? '' : String(rawRid).trim();
    const exitToOwn = !requestedRid || requestedRid === '__exit__';
    const nextRid = exitToOwn ? (ses.personalRid || 'demo') : requestedRid;

    if (!exitToOwn) {
      const perms: Record<string, boolean | undefined> =
        ses.role === 'owner' || !ses.staffId ? FULL_OWNER_PERMISSIONS : (req.authPermissions as Record<string, boolean | undefined>) || {};
      if (nextRid === 'demo') {
        if (!perms.canEditDemoMenu && !perms.canImpersonatePartner) {
          return res.status(403).json({ ok: false, error: 'ليست لديك صلاحية تعديل المنيو التجريبي.' });
        }
      } else if (!perms.canImpersonatePartner) {
        return res.status(403).json({ ok: false, error: 'ليست لديك صلاحية فتح لوحة تحكم الشركاء.' });
      }

      const targetRest = await getInternalStoreItem(`restaurants/${nextRid}`);
      if (!targetRest) {
        return res.status(404).json({ ok: false, error: 'المتجر المستهدف غير موجود.' });
      }
    }

    const updated = {
      ...ses,
      rid: nextRid,
      personalRid: exitToOwn ? (ses.personalRid || 'demo') : (ses.personalRid || nextRid),
      impersonating: !exitToOwn && nextRid !== (ses.personalRid || 'demo'),
      menuLoggedOut: false,
    };
    await updateServerAuthSession(ses.sid, updated);
    req.authSession = updated;
    return res.json({ ok: true, token: signSid(updated.sid), session: sanitizeAuthSessionForClient(updated) });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر تبديل الجلسة.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const body = (req.body || {}) as Record<string, unknown>;
  const scope = String(body.scope || 'all').trim();
  const ses = req.authSession;
  if (scope === 'menu' && ses && ses.admin && !ses.menuLoggedOut) {
    const updated = {
      ...ses,
      rid: undefined,
      personalRid: undefined,
      impersonating: false,
      menuLoggedOut: true,
    };
    await updateServerAuthSession(ses.sid, updated);
    req.authSession = updated;
    return res.json({
      ok: true,
      partial: true,
      token: signSid(updated.sid),
      session: sanitizeAuthSessionForClient(updated),
    });
  }
  await destroyServerAuthSession(req, res);
  return res.json({ ok: true, partial: false });
});

// Validated public review submission (without granting full write access to restaurants/*)
app.post('/api/reviews', otpRateLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const rid = String(body.rid || '').trim();
    const name = String(body.name || 'زبون').trim().slice(0, 60) || 'زبون';
    const rate = Math.max(1, Math.min(5, Math.round(Number(body.rate || 5))));
    const comment = String(body.comment || '').trim().slice(0, 500);
    if (!rid || !comment) {
      return res.status(400).json({ ok: false, error: 'يرجى كتابة التقييم قبل الإرسال.' });
    }

    const rest = await getInternalStoreItem<Record<string, any>>(`restaurants/${rid}`);
    if (!rest) {
      return res.status(404).json({ ok: false, error: 'المتجر غير موجود.' });
    }

    const existingReviews = Array.isArray(rest.reviews) ? rest.reviews : [];
    const newReview = {
      id: `rev_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
      name,
      rate,
      comment,
      at: Date.now(),
    };
    const nextReviews = [newReview, ...existingReviews].slice(0, 200);
    await applyChanges({ put: { [`restaurants/${rid}`]: { ...rest, reviews: nextReviews } } }, false);
    return res.json({ ok: true, reviews: nextReviews });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر إرسال التقييم.' });
  }
});

// Backward-compatible /api/session endpoints — strictly read-only or scoped RID switch only (NO privilege escalation)
app.get('/api/session', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    sessionId: req.authSession?.sid || null,
    session: sanitizeAuthSessionForClient(req.authSession || null),
  });
});

app.post('/api/session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const ses = req.authSession;
  if (!ses) {
    return res.status(401).json({ ok: false, error: 'يتطلب تسجيل الدخول عبر /api/auth/login.' });
  }
  const reqSes = (req.body as Record<string, unknown>)?.session as Record<string, unknown> | undefined;
  const targetRid = reqSes?.rid ? String(reqSes.rid).trim() : '';
  if (!targetRid || targetRid === ses.rid) {
    return res.json({ ok: true, sessionId: ses.sid });
  }
  if (ses.admin) {
    const updated = { ...ses, rid: targetRid, menuLoggedOut: false };
    await updateServerAuthSession(ses.sid, updated);
    req.authSession = updated;
    return res.json({ ok: true, sessionId: ses.sid });
  }
  // Partners can only switch between their own store and child branches
  const allData = await readAll(false);
  const owned = getOwnedPartnerRids(allData, ses.personalRid || ses.rid);
  if (!owned.has(targetRid)) {
    return res.status(403).json({ ok: false, error: 'غير مصرح بالوصول إلى هذا المتجر.' });
  }
  const updated = { ...ses, rid: targetRid };
  await updateServerAuthSession(ses.sid, updated);
  req.authSession = updated;
  return res.json({ ok: true, sessionId: ses.sid });
});

app.delete('/api/session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  await destroyServerAuthSession(req, res);
  return res.json({ ok: true });
});

// 2. Telegram Order Notifications Bot endpoints
app.get('/api/telegram-status', (_req, res) => {
  res.json(getTelegramBotStatus());
});

async function resolvePartnerTelegramAccess(req: Request, requestedRid: unknown): Promise<{ ok: true; rid: string } | { ok: false; status: number; error: string }> {
  const ses = req.authSession;
  if (!ses) {
    return { ok: false, status: 401, error: 'يرجى تسجيل الدخول للمتابعة.' };
  }
  const targetRid = String(requestedRid || ses.rid || '').trim();
  if (!targetRid) {
    return { ok: false, status: 400, error: 'معرّف المتجر مطلوب.' };
  }
  if (ses.admin) {
    return { ok: true, rid: targetRid };
  }
  const allData = await readAll(false);
  const owned = getOwnedPartnerRids(allData, ses.personalRid || ses.rid);
  if (!owned.has(targetRid)) {
    return { ok: false, status: 403, error: 'غير مصرح بالوصول إلى هذا المتجر.' };
  }
  return { ok: true, rid: targetRid };
}

app.get('/api/dashboard/telegram/status', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const auth = await resolvePartnerTelegramAccess(req, req.query.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const status = await getTelegramOrderLinkStatus(auth.rid);
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر تحميل حالة الربط.' });
  }
});

app.post('/api/dashboard/telegram/link', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const result = await initTelegramOrderLink(auth.rid, String(body.phone || ''));
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر بدء ربط تيليجرام.' });
  }
});

app.post('/api/dashboard/telegram/toggle', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const enabled = body.enabled !== false;
    const ok = await toggleTelegramForRestaurant(auth.rid, enabled);
    if (!ok) return res.status(404).json({ ok: false, error: 'المتجر غير موجود.' });
    return res.json({ ok: true, enabled });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر تحديث التفعيل.' });
  }
});

app.post('/api/dashboard/telegram/unlink', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const ok = await unlinkTelegramForRestaurant(auth.rid);
    if (!ok) return res.status(404).json({ ok: false, error: 'المتجر غير موجود.' });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'تعذر فك الربط.' });
  }
});

app.post('/api/dashboard/telegram/test', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const result = await sendPartnerTestOrderNotification(auth.rid);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || 'تعذر إرسال الطلب التجريبي.' });
  }
});

app.post('/api/dashboard/telegram/verify', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const result = await verifyTelegramBotLive(auth.rid);
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      diagnosticMessage: err?.message || 'تعذر فحص اتصال بوت تيليجرام.',
    });
  }
});

app.post('/api/telegram/webhook', async (req, res) => {
  try {
    const body = (req.body || {}) as { message?: Parameters<typeof handleIncomingTelegramMessage>[0] };
    if (body?.message && body.message.chat?.id) {
      await handleIncomingTelegramMessage(body.message);
    }
    return res.json({ ok: true });
  } catch (err: any) {
    console.warn('[Telegram Webhook] Error:', err?.message || err);
    return res.json({ ok: true });
  }
});

// 2.5. Cross-Menu Persistent Customer Profile (auto-fills across all menus & subdomains)
const CUST_PROFILE_COOKIE = 'mp_cust_id';
const CUST_PROFILE_KV_PREFIX = 'customer_profiles/';

function setCustomerProfileCookie(res: Response, req: Request, custId: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const reqHost = String(req.hostname || '').toLowerCase().trim();
  const sharesSubdomains =
    BASE_DOMAIN &&
    (reqHost === BASE_DOMAIN || reqHost.endsWith(`.${BASE_DOMAIN}`));
  const parts = [
    `${CUST_PROFILE_COOKIE}=${encodeURIComponent(custId)}`,
    'Path=/',
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${365 * 24 * 60 * 60}`,
  ];
  if (sharesSubdomains) parts.push(`Domain=.${BASE_DOMAIN}`);
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

app.get('/api/customer-profile', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cookies = parseRequestCookies(req.headers.cookie);
    const custId = String(cookies[CUST_PROFILE_COOKIE] || req.headers['x-customer-profile-id'] || '').trim();
    if (!custId || !/^[a-zA-Z0-9_-]{8,64}$/.test(custId)) {
      return res.json({ ok: true, profile: null });
    }
    const profile = await getInternalStoreItem<{
      name?: string;
      phone?: string;
      address?: string;
      notes?: string;
      updatedAt?: number;
    }>(`${CUST_PROFILE_KV_PREFIX}${custId}`).catch(() => null);
    return res.json({ ok: true, custId, profile: profile || null });
  } catch {
    return res.json({ ok: true, profile: null });
  }
});

app.post('/api/customer-profile', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cookies = parseRequestCookies(req.headers.cookie);
    let custId = String(cookies[CUST_PROFILE_COOKIE] || req.headers['x-customer-profile-id'] || '').trim();
    if (!custId || !/^[a-zA-Z0-9_-]{8,64}$/.test(custId)) {
      custId = `cust_${crypto.randomBytes(12).toString('hex')}`;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const existing = await getInternalStoreItem<{
      name?: string;
      phone?: string;
      address?: string;
      notes?: string;
      updatedAt?: number;
    }>(`${CUST_PROFILE_KV_PREFIX}${custId}`).catch(() => null);

    const nextProfile = {
      name: String(body.name ?? existing?.name ?? '').trim().slice(0, 120),
      phone: String(body.phone ?? existing?.phone ?? '').trim().slice(0, 40),
      address: String(body.address ?? existing?.address ?? '').trim().slice(0, 400),
      notes: String(body.notes ?? existing?.notes ?? '').trim().slice(0, 400),
      updatedAt: Date.now(),
    };
    await setInternalStoreItem(`${CUST_PROFILE_KV_PREFIX}${custId}`, nextProfile);
    setCustomerProfileCookie(res, req, custId);
    return res.json({ ok: true, custId, profile: nextProfile });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

// 2.6. Dashboard Media Library Physical File Cleanup (called alongside cascade DB deletion)
app.post('/api/dashboard/media/delete-file', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ses = req.authSession;
    if (!ses) {
      return res.status(401).json({ ok: false, error: 'يرجى تسجيل الدخول.' });
    }
    const url = String((req.body || {}).url || '').trim();
    if (!url || !url.startsWith('/uploads/')) {
      return res.json({ ok: true, deletedFile: false });
    }
    const allData = await readAll(false);
    const serialized = JSON.stringify(allData);
    if (serialized.includes(url)) {
      // Still referenced elsewhere in DB; do not delete physical file
      return res.json({ ok: true, deletedFile: false });
    }
    const uploadsRoot = path.resolve(process.cwd(), 'public', 'uploads');
    const relPath = url.replace(/^\/uploads\//, '');
    const resolvedTarget = path.resolve(uploadsRoot, relPath);
    if (
      resolvedTarget.startsWith(uploadsRoot + path.sep) &&
      fs.existsSync(resolvedTarget) &&
      fs.statSync(resolvedTarget).isFile()
    ) {
      fs.unlinkSync(resolvedTarget);
      return res.json({ ok: true, deletedFile: true });
    }
    return res.json({ ok: true, deletedFile: false });
  } catch {
    return res.json({ ok: true, deletedFile: false });
  }
});


// 3. Notes endpoints (strictly protected with canUseNotes permission)
app.all('/api/notes', requireAdminOrStaff('canUseNotes'), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const db = await readAll().catch(() => ({} as Record<string, unknown>));
    const seedNotes: StoredNote[] = Object.entries(db)
      .filter(([k]) => k.startsWith('notes/'))
      .map(([, v]) => v as StoredNote)
      .filter((v) => v && typeof v === 'object' && v.id);

    if (req.method === 'GET') {
      const result = readNotesDocument(seedNotes);
      if (seedNotes.length > 0 && isSupabaseConfigured()) {
        return res.json({ ...result, notes: seedNotes });
      }
      return res.json(result);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.action === 'delete' && body.id) {
        const noteId = String(body.id);
        const result = deleteNoteFromFile(noteId, seedNotes);
        await applyChanges({ del: [`notes/${noteId}`] }, false);
        return res.json({ ok: true, ...result });
      }
      if (body.action === 'replaceAll' && Array.isArray(body.notes)) {
        const result = replaceAllNotesInFile(body.notes);
        const oldNoteKeys = Object.keys(db).filter((k) => k.startsWith('notes/'));
        const putMap: Record<string, unknown> = {};
        for (const n of result.notes) {
          putMap[`notes/${n.id}`] = n;
        }
        const delKeys = oldNoteKeys.filter((k) => !Object.prototype.hasOwnProperty.call(putMap, k));
        await applyChanges({ put: putMap, del: delKeys }, false);
        return res.json({ ok: true, ...result });
      }
      if (body.note && typeof body.note === 'object' && body.note.id) {
        const result = saveNoteToFile(body.note as StoredNote, seedNotes);
        await applyChanges({ put: { [`notes/${result.savedNote.id}`]: result.savedNote } }, false);
        return res.json({ ok: true, ...result });
      }
      return res.status(400).json({ error: 'Invalid notes payload' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Notes error' });
  }
});

// 4. Image search & proxy
app.get('/api/search-images', async (req, res) => {
  const q = String(req.query.q || '').slice(0, 120);
  const limit = Math.min(24, Math.max(4, Number(req.query.limit || '16') || 16));
  const offset = Math.max(0, Math.min(80, Number(req.query.offset || '0') || 0));
  const seed = Math.max(0, Math.min(50, Number(req.query.seed || '0') || 0));
  const excludeRaw = String(req.query.exclude || '');
  const exclude = excludeRaw ? excludeRaw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 48) : [];
  const images = await searchWebImages(q, limit, offset, seed, exclude);
  res.json({ query: q, images });
});

app.get('/api/proxy-image', async (req, res) => {
  const target = String(req.query.url || '');
  const result = await proxyExternalImage(target);
  res.status(result.status);
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (result.status === 200 && result.buffer) {
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(result.buffer);
  }
  return res.json({ error: result.error || 'Proxy error' });
});

// 4.5. Admin persistent Staff CRUD & Accounts management endpoints
app.use(createAdminRouter());

// 4.6. Dynamic subdomain resolution, availability check & admin listing endpoints
app.use(createSubdomainRouter());

// 4.7. Platform Custom Font (.otf/.ttf/.woff/.woff2) Upload & Serving Endpoints
const FONTS_DISK_DIR = path.resolve(process.cwd(), 'data/fonts');

function detectFontFormatAndMime(fileName: string, buf: Buffer): {
  ext: 'otf' | 'ttf' | 'woff' | 'woff2';
  format: 'opentype' | 'truetype' | 'woff' | 'woff2';
  mime: string;
} | null {
  const lower = String(fileName || '').toLowerCase();
  const magic4 = buf.subarray(0, 4);
  const magicStr = magic4.toString('ascii');

  const isOtfMagic = magicStr === 'OTTO';
  const isTtfMagic =
    (magic4[0] === 0x00 && magic4[1] === 0x01 && magic4[2] === 0x00 && magic4[3] === 0x00) ||
    magicStr === 'true' ||
    magicStr === 'typ1';
  const isWoffMagic = magicStr === 'wOFF';
  const isWoff2Magic = magicStr === 'wOF2';

  if (lower.endsWith('.otf') && (isOtfMagic || isTtfMagic)) {
    return { ext: 'otf', format: 'opentype', mime: 'font/otf' };
  }
  if (lower.endsWith('.ttf') && (isTtfMagic || isOtfMagic)) {
    return { ext: 'ttf', format: 'truetype', mime: 'font/ttf' };
  }
  if (lower.endsWith('.woff2') && isWoff2Magic) {
    return { ext: 'woff2', format: 'woff2', mime: 'font/woff2' };
  }
  if (lower.endsWith('.woff') && isWoffMagic) {
    return { ext: 'woff', format: 'woff', mime: 'font/woff' };
  }

  // Fallback by magic bytes if filename had unusual casing or omitted ext
  if (isOtfMagic) return { ext: 'otf', format: 'opentype', mime: 'font/otf' };
  if (isWoff2Magic) return { ext: 'woff2', format: 'woff2', mime: 'font/woff2' };
  if (isWoffMagic) return { ext: 'woff', format: 'woff', mime: 'font/woff' };
  if (isTtfMagic) return { ext: 'ttf', format: 'truetype', mime: 'font/ttf' };
  return null;
}

app.post('/api/admin/fonts/upload', requireAdminOrStaff(), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ses = req.authSession!;
    const perms =
      ses.role === 'owner' || !ses.staffId
        ? FULL_OWNER_PERMISSIONS
        : { ...FULL_OWNER_PERMISSIONS, ...req.authPermissions };
    if (!perms.canManageSettings && !perms.canManageThemeMode && !perms.canEditHomePage) {
      return res.status(403).json({ ok: false, error: 'ليست لديك صلاحية رفع وتعديل خطوط المنصة' });
    }

    const { fileName, dataBase64, weight } = (req.body || {}) as {
      fileName?: string;
      dataBase64?: string;
      weight?: number;
    };

    const rawName = String(fileName || 'custom-font.otf').trim();
    const rawB64 = String(dataBase64 || '')
      .trim()
      .replace(/^data:[^;]+;base64,/i, '');

    if (!rawB64) {
      return res.status(400).json({ ok: false, error: 'ملف الخط فارغ أو غير صالح' });
    }

    const buf = Buffer.from(rawB64, 'base64');
    if (buf.length < 32 || buf.length > 8 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'حجم ملف الخط يجب أن يكون بين 32 بايت و 8 ميغابايت' });
    }

    const detected = detectFontFormatAndMime(rawName, buf);
    if (!detected) {
      return res.status(400).json({
        ok: false,
        error: 'صيغة ملف الخط غير مدعومة. يرجى رفع ملف خط بصيغة .otf أو .ttf أو .woff2 أو .woff',
      });
    }

    const fileId = `font_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    const numericWeight = Number(weight) === 0 ? 0 : Math.min(900, Math.max(100, Number(weight) || 400));

    if (!fs.existsSync(FONTS_DISK_DIR)) {
      fs.mkdirSync(FONTS_DISK_DIR, { recursive: true });
    }
    const diskPath = path.join(FONTS_DISK_DIR, `${fileId}.${detected.ext}`);
    fs.writeFileSync(diskPath, buf);

    await applyChanges(
      {
        put: {
          [`custom_font_files/${fileId}`]: {
            fileId,
            fileName: rawName.slice(0, 140),
            ext: detected.ext,
            format: detected.format,
            mime: detected.mime,
            weight: numericWeight,
            sizeBytes: buf.length,
            dataBase64: buf.toString('base64'),
            createdAt: new Date().toISOString(),
          },
        },
      },
      false
    );

    return res.json({
      ok: true,
      fileId,
      url: `/api/fonts/file/${fileId}.${detected.ext}`,
      format: detected.format,
      ext: detected.ext,
      sizeBytes: buf.length,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'فشل رفع ملف الخط' });
  }
});

app.get('/api/fonts/file/:fileParam', async (req, res) => {
  try {
    const rawParam = String(req.params.fileParam || '').trim();
    const match = /^([a-zA-Z0-9_-]+)(?:\.(otf|ttf|woff2|woff))?$/i.exec(rawParam);
    if (!match) {
      return res.status(400).send('Invalid font id');
    }
    const fileId = match[1];

    // 1. Check disk cache first
    for (const ext of ['otf', 'ttf', 'woff2', 'woff'] as const) {
      const candidate = path.join(FONTS_DISK_DIR, `${fileId}.${ext}`);
      if (fs.existsSync(candidate)) {
        const mime =
          ext === 'otf'
            ? 'font/otf'
            : ext === 'ttf'
            ? 'font/ttf'
            : ext === 'woff2'
            ? 'font/woff2'
            : 'font/woff';
        res.setHeader('Content-Type', mime);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(candidate);
      }
    }

    // 2. Fallback to persistent store (e.g. Supabase or data/db-store.json)
    const stored = (await getInternalStoreItem(`custom_font_files/${fileId}`)) as
      | { ext?: string; mime?: string; dataBase64?: string }
      | undefined;
    if (!stored || !stored.dataBase64) {
      return res.status(404).send('Font not found');
    }
    const buf = Buffer.from(stored.dataBase64, 'base64');
    const ext = stored.ext || 'otf';
    const mime = stored.mime || 'font/otf';
    try {
      if (!fs.existsSync(FONTS_DISK_DIR)) fs.mkdirSync(FONTS_DISK_DIR, { recursive: true });
      fs.writeFileSync(path.join(FONTS_DISK_DIR, `${fileId}.${ext}`), buf);
    } catch {
      // ignore disk cache write failure
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(buf);
  } catch {
    return res.status(500).send('Failed to load font');
  }
});

app.delete('/api/admin/fonts/:fileId', requireAdminOrStaff(), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ses = req.authSession!;
    const perms =
      ses.role === 'owner' || !ses.staffId
        ? FULL_OWNER_PERMISSIONS
        : { ...FULL_OWNER_PERMISSIONS, ...req.authPermissions };
    if (!perms.canManageSettings && !perms.canManageThemeMode && !perms.canEditHomePage) {
      return res.status(403).json({ ok: false, error: 'ليست لديك صلاحية حذف خطوط المنصة' });
    }
    const fileId = String(req.params.fileId || '').trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return res.status(400).json({ ok: false, error: 'معرف الخط غير صالح' });
    }
    for (const ext of ['otf', 'ttf', 'woff2', 'woff']) {
      const p = path.join(FONTS_DISK_DIR, `${fileId}.${ext}`);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
    await applyChanges({ del: [`custom_font_files/${fileId}`] }, false);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'فشل حذف ملف الخط' });
  }
});

// 5. Handle OPTIONS preflight and unmatched API routes with JSON 404 instead of index.html
app.options('/api/*', (_req, res) => {
  res.status(204).end();
});

app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global error handler for malformed JSON or unhandled middleware errors
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON request body' });
  }
  console.error('[Server Error]', err?.message || err);
  return res.status(500).json({ error: 'Internal server error' });
});

const ASSET_EXTENSION_RE = /\.(?:js|mjs|css|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|eot|json|txt|xml)$/i;

const SEO_RESERVED_SEGMENTS = new Set([
  'login', 'signup', 'forgot', 'onboard', 'dashboard', 'admin', 'menu', 'services', 'steps', 'pricing', 'faq', 'demo', 'about', 'api', 'assets',
]);

function resolveRequestOrigin(req: Request): string {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || BASE_DOMAIN).split(',')[0].trim();
  return `${proto}://${host}`;
}

function escapeSeoAttr(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function xmlEscape(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const DEFAULT_SEO_FAQS = [
  {
    q: 'شو يعني منيو وكتالوج إلكتروني ذكي؟',
    a: 'هو رابط خاص وباركود QR باسم مشروعك يفتحه الزبون فوراً من متصفح هاتفه بدون تحميل أي تطبيق؛ يتصفح الأقسام والوجبات أو المنتجات بالصور والأسعار، يضيف للسلة، ويرسل لك الطلب مرتباً بالكامل على الواتساب.',
  },
  {
    q: 'هل منيو بلس مناسب لمطعمي أو متجري؟',
    a: 'نعم، المنصة مصممة بمرونة كاملة لتناسب المطاعم، الكافيهات، محلات الحلويات والعصائر، وكذلك المتاجر الإلكترونية ومحلات العطور والملابس والإكسسوارات.',
  },
  {
    q: 'بقدر أستخدم اسمي وشعاري وأغيّر الألوان والمظهر؟',
    a: 'أكيد! تقدر ترفع شعار مشروعك وصورة الغلاف، وتختار بين المظهر النهاري الفاتح والمظهر الليلي الغامق مع قوالب ألوان احترافية ورابط مخصص باسم مشروعك.',
  },
  {
    q: 'هل تاخذون نسبة أو عمولة على مبيعاتي وطلباتي؟',
    a: 'لا، 0% عمولة على مبيعاتك للأبد. كل أرباح طلبات التوصيل والاستلام والطاولات تبقى لك بالكامل وتستلمها مباشرة على رقم الواتساب الخاص بك.',
  },
  {
    q: 'كيف يتم تفعيل الاشتراك وما هي الباقات المتوفرة؟',
    a: 'نوفر 3 باقات مرنة (الاقتصادية، الاحترافية، وباقة الأعمال الشاملة) باشتراك شهري أو سنوي بدون أي عمولات على مبيعاتك، ويمكنك الترقية بين الباقات في أي وقت.',
  },
  {
    q: 'هل أقدر أفعّل نشاطي وأعدّل الأسعار الآن؟',
    a: 'نعم، خلال دقائق معدودة تسجّل برقم هاتفك، تضيف أقسامك ومنتجاتك، وتطبع كود الـ QR وتبدأ باستقبال الطلبات فوراً.',
  },
];

async function injectSeoMetaIntoHtml(html: string, req: Request): Promise<string> {
  try {
    const origin = resolveRequestOrigin(req);
    const cleanPath = req.path === '/' ? '/' : req.path.replace(/\/+$/, '');
    const canonicalUrl = `${origin}${cleanPath === '/' ? '' : cleanPath}`;
    const allData = await readAll(false).catch(() => ({} as Record<string, unknown>));

    let pageTitle = 'منيو بلس | أذكى منصة منيو إلكتروني QR وكتالوج طلبات واتساب للمطاعم والمتاجر';
    let pageDesc = 'أنشئ منيو إلكتروني QR احترافي لمطعمك أو متجرك خلال دقائق واستقبل الطلبات مباشرة على واتساب بـ 0% عمولة. تصميم متكامل، لوحة تحكم سحابية، وثيمات نهارية وليلية.';
    let noIndex = false;
    const jsonLdBlocks: Record<string, unknown>[] = [];

    if (cleanPath.startsWith('/admin') || cleanPath.startsWith('/dashboard') || cleanPath === '/login' || cleanPath === '/signup' || cleanPath === '/forgot' || cleanPath === '/onboard') {
      noIndex = true;
    }

    // Check if route is /menu/:idOrSlug or /:slug
    const segs = cleanPath.replace(/^\/+/, '').split('/').filter(Boolean);
    let targetSlugOrId = '';
    if (segs[0] === 'menu' && segs[1]) {
      targetSlugOrId = decodeURIComponent(segs[1]);
    } else if (segs.length === 1 && !SEO_RESERVED_SEGMENTS.has(segs[0].toLowerCase())) {
      targetSlugOrId = decodeURIComponent(segs[0]);
    }

    if (targetSlugOrId) {
      const targetLower = targetSlugOrId.toLowerCase();
      let matchedRest: Record<string, unknown> | undefined;
      if (allData[`restaurants/${targetSlugOrId}`]) {
        matchedRest = allData[`restaurants/${targetSlugOrId}`] as Record<string, unknown>;
      } else {
        for (const [k, v] of Object.entries(allData)) {
          if (!k.startsWith('restaurants/') || !v || typeof v !== 'object') continue;
          const r = v as Record<string, unknown>;
          if (
            String(r.slug || '').toLowerCase() === targetLower ||
            String(r.subdomain || '').toLowerCase() === targetLower
          ) {
            matchedRest = r;
            break;
          }
        }
      }
      if (matchedRest) {
        const restName = String(matchedRest.n || 'المنيو الإلكتروني');
        const rawTagline = String(matchedRest.tagline || '').trim();
        const isMatchedStore = String(matchedRest.projectType || '').toLowerCase().trim() === 'store';
        const cleanTagline =
          isMatchedStore && rawTagline === 'أشهى الأطباق المحضرة يومياً طازجة بجودة عالية'
            ? ''
            : rawTagline;
        const restAbout = String(cleanTagline || matchedRest.aboutText || '').trim();
        pageTitle = `${restName} – المنيو الإلكتروني وطلبات الواتساب | منيو بلس`;
        pageDesc = restAbout
          ? `${restName}: ${restAbout.slice(0, 130)} — تصفح القائمة واطلب الآن عبر منيو بلس.`
          : `تصفح قائمة طعام ومنتجات ${restName} مع الأسعار والصور واطلب مباشرة عبر واتساب على منصة منيو بلس.`;
        jsonLdBlocks.push({
          '@context': 'https://schema.org',
          '@type': matchedRest.projectType === 'store' ? 'Store' : 'Restaurant',
          name: restName,
          description: pageDesc,
          url: canonicalUrl,
          ...(matchedRest.ph ? { telephone: String(matchedRest.ph) } : {}),
          ...(matchedRest.logo && !String(matchedRest.logo).startsWith('data:') ? { image: String(matchedRest.logo) } : {}),
          hasMenu: canonicalUrl,
        });
      }
    } else if (!noIndex) {
      const homeDoc = allData['settings/home'] as { faq?: { enabled?: boolean; items?: Array<{ q?: string; a?: string; visible?: boolean }> } } | undefined;
      const faqItems = (homeDoc?.faq?.items && homeDoc.faq.items.length > 0
        ? homeDoc.faq.items.filter((f) => f.visible !== false && f.q && f.a)
        : DEFAULT_SEO_FAQS
      ).map((f) => ({
        '@type': 'Question',
        name: String(f.q),
        acceptedAnswer: {
          '@type': 'Answer',
          text: String(f.a),
        },
      }));

      jsonLdBlocks.push({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'منيو بلس – Menu+',
        alternateName: ['Menu Plus', 'Menu+', 'منيو بلس الإلكتروني'],
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, iOS, Android',
        inLanguage: ['ar', 'en', 'ku'],
        url: origin,
        description: pageDesc,
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'IQD',
          lowPrice: '9000',
          highPrice: '29000',
          offerCount: '3',
        },
      });

      if (faqItems.length > 0 && homeDoc?.faq?.enabled !== false) {
        jsonLdBlocks.push({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems,
        });
      }
    }

    const safeTitle = escapeSeoAttr(pageTitle);
    const safeDesc = escapeSeoAttr(pageDesc);
    const safeCanonical = escapeSeoAttr(canonicalUrl);
    const safeEmbedImage = escapeSeoAttr(`${origin}/assets/aistudio/icon_f95f5a07.png`);

    let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
    out = out.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${safeDesc}" />`);
    out = out.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${safeTitle}" />`);
    out = out.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${safeDesc}" />`);
    out = out.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${safeEmbedImage}" />`);
    out = out.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${safeEmbedImage}" />`);

    const seoTags: string[] = [
      `<link rel="canonical" href="${safeCanonical}" />`,
      `<meta property="og:url" content="${safeCanonical}" />`,
      `<meta name="robots" content="${noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1'}" />`,
      ...jsonLdBlocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b).replace(/</g, '\\u003c')}</script>`),
    ];

    if (out.includes('</head>')) {
      out = out.replace('</head>', `  ${seoTags.join('\n  ')}\n  </head>`);
    }
    return out;
  } catch {
    return html;
  }
}

app.get('/robots.txt', (req, res) => {
  const origin = resolveRequestOrigin(req);
  res
    .status(200)
    .setHeader('Content-Type', 'text/plain; charset=utf-8')
    .setHeader('Cache-Control', 'public, max-age=3600')
    .send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /admin/',
        'Disallow: /dashboard',
        'Disallow: /dashboard/',
        'Disallow: /login',
        'Disallow: /signup',
        'Disallow: /forgot',
        'Disallow: /onboard',
        'Disallow: /api/',
        `Sitemap: ${origin}/sitemap.xml`,
      ].join('\n')
    );
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const origin = resolveRequestOrigin(req);
    const allData = await readAll(false).catch(() => ({} as Record<string, unknown>));
    const nowIso = new Date().toISOString().slice(0, 10);

    const demoRest = allData['restaurants/demo'] as Record<string, unknown> | undefined;
    const demoSlug = sanitizeSubdomainValue(String(demoRest?.slug || '')) || 'cap-burger';
    const entries: Array<{ loc: string; priority: string; changefreq: string }> = [
      { loc: `${origin}/`, priority: '1.0', changefreq: 'daily' },
      { loc: `${origin}/services`, priority: '0.9', changefreq: 'weekly' },
      { loc: `${origin}/steps`, priority: '0.8', changefreq: 'weekly' },
      { loc: `${origin}/pricing`, priority: '0.9', changefreq: 'weekly' },
      { loc: `${origin}/faq`, priority: '0.8', changefreq: 'weekly' },
      { loc: `${origin}/${encodeURIComponent(demoSlug)}`, priority: '0.85', changefreq: 'daily' },
    ];

    const seen = new Set(entries.map((e) => e.loc));
    for (const [k, v] of Object.entries(allData)) {
      if (!k.startsWith('restaurants/') || !v || typeof v !== 'object') continue;
      const r = v as Record<string, unknown>;
      const id = String(r.id || k.slice('restaurants/'.length));
      if (!id || id === 'demo' || r.a === 0) continue;
      const slug = sanitizeSubdomainValue(String(r.slug || r.subdomain || '')) || id;
      const loc = `${origin}/${encodeURIComponent(slug)}`;
      if (!seen.has(loc)) {
        seen.add(loc);
        entries.push({ loc, priority: '0.75', changefreq: 'daily' });
      }
    }

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      entries
        .map(
          (e) =>
            `  <url>\n    <loc>${xmlEscape(e.loc)}</loc>\n    <lastmod>${nowIso}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
        )
        .join('\n') +
      `\n</urlset>`;

    return res
      .status(200)
      .setHeader('Content-Type', 'application/xml; charset=utf-8')
      .setHeader('Cache-Control', 'public, max-age=1800')
      .send(xml);
  } catch {
    return res.status(500).setHeader('Content-Type', 'text/plain').send('Failed to generate sitemap');
  }
});

// 6. Subdomain interception + Vite middleware (dev) or static dist/ + SPA fallback (prod)
app.use(subdomainMiddleware());

async function runStartupMigrations() {
  const allData = await readAll(false).catch(() => ({} as Record<string, unknown>));
  const putData: Record<string, unknown> = {};
  const delKeys: string[] = [];

  if (!allData['migrations/purged_7833239944_v3']) {
    const targetKeys = new Set(normalizePhoneKeys('07833239944'));
    const matchesTarget = (val: unknown): boolean =>
      typeof val === 'string' && val.trim() !== '' && normalizePhoneKeys(val).some((k) => targetKeys.has(k));

    for (const [k, v] of Object.entries(allData)) {
      if (!v || typeof v !== 'object') continue;
      const rec = v as Record<string, any>;
      if (k.startsWith('accounts/')) {
        const isProtectedAdmin =
          k === 'accounts/acc_admin_owner' || rec.admin === true || rec.r === 'admin';
        if (
          !isProtectedAdmin &&
          (matchesTarget(rec.phone) ||
            matchesTarget(rec.projectPhone) ||
            matchesTarget(rec.em) ||
            matchesTarget(rec.username) ||
            matchesTarget(rec.e) ||
            matchesTarget(rec.u))
        ) {
          delKeys.push(k);
          if (rec.rid && rec.rid !== 'demo') {
            await clearAuthSessionsByTarget(String(rec.rid), k.slice('accounts/'.length)).catch(() => {});
          }
        }
      } else if (k.startsWith('staff/')) {
        if (matchesTarget(rec.phone) || matchesTarget(rec.email)) {
          delKeys.push(k);
        }
      } else if (k.startsWith('restaurants/') && !k.slice('restaurants/'.length).includes('/')) {
        if (matchesTarget(rec.ph) || matchesTarget(rec.ow)) {
          putData[k] = {
            ...rec,
            ...(matchesTarget(rec.ph) ? { ph: '' } : {}),
            ...(matchesTarget(rec.ow) ? { ow: '' } : {}),
          };
        }
      }
    }

    await deleteTelegramUserByPhone('07833239944').catch(() => {});
    await deleteTelegramUserByPhone('9647833239944').catch(() => {});
    putData['migrations/purged_7833239944_v3'] = true;
  }

  if (!allData['migrations/default_light_platform_v1']) {
    const existingSite =
      allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? (allData['settings/site'] as Record<string, any>)
        : {};
    const existingTheme =
      allData['settings/theme'] && typeof allData['settings/theme'] === 'object'
        ? (allData['settings/theme'] as Record<string, any>)
        : {};

    putData['settings/site'] = {
      ...existingSite,
      homeThemeMode: 'light',
    };
    putData['settings/theme'] = {
      c1: '#0F766E',
      c2: '#FFFFFF',
      c3: '#059669',
      bg: '#F8FAFC',
      mode: 'light',
      c4: '#F1F5F9',
      c5: '#0F766E',
      font: existingTheme.font && !String(existingTheme.font).toLowerCase().startsWith('thmanyah') ? existingTheme.font : 'tajawal',
      ...(existingTheme.typography ? { typography: existingTheme.typography } : {}),
      preset: 'clean_light',
    };
    putData['migrations/default_light_platform_v1'] = true;
  }

  if (!allData['migrations/hero_iraq_copy_v1']) {
    const existingHome =
      allData['settings/home'] && typeof allData['settings/home'] === 'object'
        ? (allData['settings/home'] as Record<string, any>)
        : {};
    const existingHero =
      existingHome.hero && typeof existingHome.hero === 'object' ? existingHome.hero : {};
    putData['settings/home'] = {
      ...existingHome,
      hero: {
        ...existingHero,
        titleLine1: 'المنيو الأذكى بالعراق',
        titleLine2: 'لمتجرك أو مطعمك',
        title: 'المنيو الأذكى بالعراق — لمتجرك أو مطعمك',
        lead: 'أطلق متجرك الآن واستقبل الطلبات',
      },
    };
    putData['migrations/hero_iraq_copy_v1'] = true;
  }

  if (!allData['migrations/root_codes_and_disable_google_subdomain_v1']) {
    const existingSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? (putData['settings/site'] as Record<string, any>)
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? (allData['settings/site'] as Record<string, any>)
        : {};
    const normalizedSubRules = normalizeSubdomainRules(existingSite);
    putData['settings/site'] = {
      ...existingSite,
      googleAuthEnabled: false,
      subdomainRules: {
        ...normalizedSubRules,
        enabled: false,
      },
    };

    const existingHome =
      putData['settings/home'] && typeof putData['settings/home'] === 'object'
        ? (putData['settings/home'] as Record<string, any>)
        : allData['settings/home'] && typeof allData['settings/home'] === 'object'
        ? (allData['settings/home'] as Record<string, any>)
        : null;
    if (existingHome) {
      const existingHero = existingHome.hero && typeof existingHome.hero === 'object' ? existingHome.hero : {};
      const curCta1 = String(existingHero.cta1Link || '').trim();
      if (!curCta1 || curCta1 === '/menu/demo') {
        putData['settings/home'] = {
          ...existingHome,
          hero: {
            ...existingHero,
            cta1Link: '/cap-burger',
          },
        };
      }
    }

    const plansList = extractPlansList(allData['settings/plans']);
    if (allData['settings/plans'] && typeof allData['settings/plans'] === 'object') {
      const rawPlansDoc = allData['settings/plans'] as Record<string, any>;
      if (Array.isArray(rawPlansDoc.list)) {
        putData['settings/plans'] = {
          ...rawPlansDoc,
          list: rawPlansDoc.list.map((pl: any) => ({
            ...pl,
            featuresMap: {
              ...(pl.featuresMap || {}),
              customSlug: !(pl.id === 'free' && Number(pl.pr || 0) <= 0),
            },
          })),
        };
      }
    }

    const takenSlugs = new Set<string>();
    const restEntries: Array<[string, Record<string, any>]> = [];
    for (const [k, v] of Object.entries(allData)) {
      if (!k.startsWith('restaurants/') || k.slice('restaurants/'.length).includes('/') || !v || typeof v !== 'object') {
        continue;
      }
      const rec = (putData[k] as Record<string, any> | undefined) || (v as Record<string, any>);
      restEntries.push([k, rec]);
    }

    // Reserve valid slugs of paid plans first
    for (const [k, rec] of restEntries) {
      const rid = k.slice('restaurants/'.length);
      if (rid === 'demo') {
        takenSlugs.add('cap-burger');
        continue;
      }
      const { isPaid } = isPaidPlanForRestaurant(rec as StoreRecord, plansList);
      if (isPaid) {
        const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ''));
        if (curSlug && curSlug.length >= 3 && !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug) && !takenSlugs.has(curSlug)) {
          takenSlugs.add(curSlug);
        }
      }
    }

    // Migrate every restaurant to root-level handle (custom for paid, 6-char random code for free/missing)
    for (const [k, rec] of restEntries) {
      const rid = k.slice('restaurants/'.length);
      if (rid === 'demo') {
        const demoSlug = sanitizeSubdomainValue(String(rec.slug || '')) || 'cap-burger';
        putData[k] = {
          ...rec,
          slug: demoSlug,
          subdomain: '',
          isPaid: true,
        };
        continue;
      }

      const { isPaid } = isPaidPlanForRestaurant(rec as StoreRecord, plansList);
      const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ''));

      let nextSlug: string;
      if (isPaid) {
        if (curSlug && curSlug.length >= 3 && !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
          nextSlug = curSlug;
          takenSlugs.add(curSlug);
        } else {
          nextSlug = generateUniqueMenuCode(takenSlugs);
        }
      } else {
        // Free tier MUST have a 6-char random alphanumeric code
        if (isValidSixCharCode(curSlug) && !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug) && !takenSlugs.has(curSlug)) {
          nextSlug = curSlug;
          takenSlugs.add(curSlug);
        } else {
          nextSlug = generateUniqueMenuCode(takenSlugs);
        }
      }

      putData[k] = {
        ...rec,
        isPaid,
        slug: nextSlug,
        subdomain: '',
      };
    }

    putData['migrations/root_codes_and_disable_google_subdomain_v1'] = true;
  }

  if (!allData['migrations/branches_and_links_v2']) {
    const existingSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? (putData['settings/site'] as Record<string, any>)
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? (allData['settings/site'] as Record<string, any>)
        : {};
    const subRules = normalizeSubdomainRules(existingSite);
    const plansList = extractPlansList(allData['settings/plans']);

    const curHome =
      putData['settings/home'] && typeof putData['settings/home'] === 'object'
        ? (putData['settings/home'] as Record<string, any>)
        : allData['settings/home'] && typeof allData['settings/home'] === 'object'
        ? (allData['settings/home'] as Record<string, any>)
        : null;
    if (curHome?.hero && (String(curHome.hero.cta1Link || '').includes('/menu/') || !curHome.hero.cta1Link)) {
      putData['settings/home'] = {
        ...curHome,
        hero: {
          ...curHome.hero,
          cta1Link: '/cap-burger',
        },
      };
    }

    const takenSlugs = new Set<string>(['cap-burger']);
    const restItems: Array<[string, Record<string, any>]> = [];
    for (const [k, v] of Object.entries(allData)) {
      if (!k.startsWith('restaurants/') || k.slice('restaurants/'.length).includes('/') || !v || typeof v !== 'object') {
        continue;
      }
      const rec = (putData[k] as Record<string, any> | undefined) || (v as Record<string, any>);
      restItems.push([k, rec]);
      const rid = k.slice('restaurants/'.length);
      if (rid === 'demo') continue;
      const parentRec = rec.parentRid ? (allData[`restaurants/${rec.parentRid}`] as Record<string, any> | undefined) : undefined;
      const { isPaid } = isPaidPlanForRestaurant((parentRec || rec) as StoreRecord, plansList);
      const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ''));
      if (isPaid && curSlug && curSlug.length >= 3 && !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
        takenSlugs.add(curSlug);
      } else if (!isPaid && isValidSixCharCode(curSlug) && !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
        takenSlugs.add(curSlug);
      }
    }

    for (const [k, rec] of restItems) {
      const rid = k.slice('restaurants/'.length);
      if (rid === 'demo') continue;
      const parentRec = rec.parentRid ? (allData[`restaurants/${rec.parentRid}`] as Record<string, any> | undefined) : undefined;
      const { isPaid } = isPaidPlanForRestaurant((parentRec || rec) as StoreRecord, plansList);
      const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ''));

      let nextSlug = curSlug;
      if (isPaid) {
        if (!curSlug || curSlug.length < 3 || SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
          nextSlug = generateUniqueMenuCode(takenSlugs);
        }
      } else {
        if (!isValidSixCharCode(curSlug) || SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
          nextSlug = generateUniqueMenuCode(takenSlugs);
        }
      }

      const nextSubdomain = subRules.enabled && isPaid ? nextSlug : '';
      if (rec.slug !== nextSlug || (rec.subdomain || '') !== nextSubdomain || Boolean(rec.isPaid) !== isPaid) {
        putData[k] = {
          ...rec,
          isPaid,
          slug: nextSlug,
          subdomain: nextSubdomain,
        };
      }
    }

    putData['migrations/branches_and_links_v2'] = true;
  }

  // Idempotent migration v3: clean up legacy phoneDemo data from settings/home
  if (!allData['migrations/home_phone_demo_off_v1']) {
    const curHome =
      putData['settings/home'] && typeof putData['settings/home'] === 'object'
        ? (putData['settings/home'] as Record<string, any>)
        : allData['settings/home'] && typeof allData['settings/home'] === 'object'
        ? (allData['settings/home'] as Record<string, any>)
        : {};
    const curSections =
      curHome.sections && typeof curHome.sections === 'object'
        ? (curHome.sections as Record<string, any>)
        : {};
    const { phoneDemo: _legacyPhoneDemo, ...restHome } = curHome;
    putData['settings/home'] = {
      ...restHome,
      sections: {
        hero: curSections.hero !== false,
        services: curSections.services !== false,
        faq: curSections.faq !== false,
        pricing: curSections.pricing !== false,
        footer: curSections.footer !== false,
      },
    };
    putData['migrations/home_phone_demo_off_v1'] = true;
  }

  // Idempotent migration v4: update Cap Burger demo restaurant phone to 07724799679 (leaving Owner Admin 07711448594 intact)
  if (!allData['migrations/cap_burger_phone_07833239944_v1']) {
    const curDemo =
      putData['restaurants/demo'] && typeof putData['restaurants/demo'] === 'object'
        ? (putData['restaurants/demo'] as Record<string, any>)
        : allData['restaurants/demo'] && typeof allData['restaurants/demo'] === 'object'
        ? (allData['restaurants/demo'] as Record<string, any>)
        : null;
    if (curDemo) {
      putData['restaurants/demo'] = {
        ...curDemo,
        ph: '07724799679',
      };
    }
    putData['migrations/cap_burger_phone_07833239944_v1'] = true;
  }

  // Idempotent migration v5: switch platform support & demo phone to 07724799679 everywhere
  if (!allData['migrations/platform_phone_07724799679_v1']) {
    const curSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? (putData['settings/site'] as Record<string, any>)
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? (allData['settings/site'] as Record<string, any>)
        : {};
    const oldPlaceholders = new Set(['', '07833239944', '9647833239944', '+9647833239944', '07701234567']);
    const curWa = String(curSite.wa || '').trim();
    const curSupportWa = String(curSite.supportWhatsapp || '').trim();
    if (oldPlaceholders.has(curWa) || oldPlaceholders.has(curSupportWa)) {
      putData['settings/site'] = {
        ...curSite,
        wa: oldPlaceholders.has(curWa) ? '07724799679' : curWa,
        supportWhatsapp: oldPlaceholders.has(curSupportWa) ? '07724799679' : curSupportWa,
      };
    }

    const curDemo =
      putData['restaurants/demo'] && typeof putData['restaurants/demo'] === 'object'
        ? (putData['restaurants/demo'] as Record<string, any>)
        : allData['restaurants/demo'] && typeof allData['restaurants/demo'] === 'object'
        ? (allData['restaurants/demo'] as Record<string, any>)
        : null;
    if (curDemo) {
      const curSocial = curDemo.social && typeof curDemo.social === 'object' ? curDemo.social : {};
      const curDemoSocialWa = String(curSocial.whatsapp || '').trim();
      putData['restaurants/demo'] = {
        ...curDemo,
        ph: '07724799679',
        social: {
          ...curSocial,
          whatsapp:
            !curDemoSocialWa || curDemoSocialWa === '9647711448594' || curDemoSocialWa.includes('7833239944')
              ? '9647724799679'
              : curDemoSocialWa,
        },
      };
    }
    putData['migrations/platform_phone_07724799679_v1'] = true;
  }

  // Idempotent migration v6: disable self-registration by default (login only)
  if (!allData['migrations/disable_signup_default_v1']) {
    const curSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? (putData['settings/site'] as Record<string, any>)
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? (allData['settings/site'] as Record<string, any>)
        : {};
    putData['settings/site'] = {
      ...curSite,
      signupEnabled: false,
      su: 0,
    };
    putData['migrations/disable_signup_default_v1'] = true;
  }

  // Idempotent migration v7: remove Thmanyah font completely and set Tajawal as default platform font
  if (!allData['migrations/remove_thmanyah_default_tajawal_v1']) {
    const curTheme =
      putData['settings/theme'] && typeof putData['settings/theme'] === 'object'
        ? (putData['settings/theme'] as Record<string, any>)
        : allData['settings/theme'] && typeof allData['settings/theme'] === 'object'
        ? (allData['settings/theme'] as Record<string, any>)
        : {};
    const curTypo =
      curTheme.typography && typeof curTheme.typography === 'object'
        ? { ...(curTheme.typography as Record<string, any>) }
        : {};
    delete curTypo.thmanyahFamily;
    const rawKey = String(curTypo.fontKey || curTheme.font || '').trim().toLowerCase();
    const normalizedKey =
      rawKey === 'firjar'
        ? 'firjar'
        : rawKey === 'alan_sans' || rawKey === 'alansans' || rawKey === 'alan sans'
        ? 'alan_sans'
        : 'tajawal';
    putData['settings/theme'] = {
      ...curTheme,
      font: normalizedKey,
      typography: {
        ...curTypo,
        fontKey: normalizedKey,
        separateHeadingFont: false,
        headingFontKey: normalizedKey,
        bodyFontKey: normalizedKey,
        headingScale: curTypo.headingScale ?? 100,
        bodySize: curTypo.bodySize ?? 15,
        descSize: curTypo.descSize ?? 13.5,
        headingWeight: curTypo.headingWeight ?? 800,
        subHeadingWeight: curTypo.subHeadingWeight ?? 700,
        bodyWeight: curTypo.bodyWeight ?? 400,
        descWeight: curTypo.descWeight ?? 400,
        headingLineHeight: curTypo.headingLineHeight ?? 1.28,
        bodyLineHeight: curTypo.bodyLineHeight ?? 1.7,
        letterSpacing: curTypo.letterSpacing ?? 0,
        fontStretch: curTypo.fontStretch ?? 100,
      },
    };
    putData['migrations/curated_google_fonts_cleanup_v1'] = true;
    putData['migrations/remove_thmanyah_default_tajawal_v1'] = true;
  }
  if (allData['migrations/thmanyah_serif_display_headings_v1']) {
    delKeys.push('migrations/thmanyah_serif_display_headings_v1');
  }

  // Idempotent migration v8: ensure demo platform admin account (07711448594 / 11111111) exists internally
  if (!allData['migrations/demo_platform_admin_07711448594_v1'] || !allData['accounts/acc_admin_demo']) {
    putData['accounts/acc_admin_demo'] = {
      id: 'acc_admin_demo',
      n: 'مدير منصة تجريبي',
      roleTitle: 'مدير منصة تجريبي',
      em: '07711448594',
      username: '07711448594',
      phone: '+9647711448594',
      pw: '29a217776b53a000d9a17f20587c7983ab7749f3d03a566b0aac9684cec5cbd4',
      rid: 'demo',
      admin: true,
      active: true,
      at: new Date().toISOString().slice(0, 10),
    };
    putData['migrations/demo_platform_admin_07711448594_v1'] = true;
  }

  if (allData['migrations/telegram_otp_off_v1']) {
    const curSite =
      putData['settings/site'] && typeof putData['settings/site'] === 'object'
        ? { ...(putData['settings/site'] as Record<string, any>) }
        : allData['settings/site'] && typeof allData['settings/site'] === 'object'
        ? { ...(allData['settings/site'] as Record<string, any>) }
        : null;
    if (curSite && 'telegramAuthEnabled' in curSite) {
      delete curSite.telegramAuthEnabled;
      putData['settings/site'] = curSite;
    }
    await updateAdminTelegramConfig({ enabled: true }).catch(() => {});
    delKeys.push('migrations/telegram_otp_off_v1');
  }

  if (!allData['migrations/remove_free_plan_v1']) {
    const existingPlans =
      allData['settings/plans'] && typeof allData['settings/plans'] === 'object'
        ? (allData['settings/plans'] as { list?: Array<Record<string, any>>; [k: string]: any })
        : null;
    if (existingPlans && Array.isArray(existingPlans.list)) {
      const nextList = existingPlans.list.filter(
        (pl) => pl && pl.id !== 'free' && Number(pl.pr) > 0
      );
      putData['settings/plans'] = {
        ...existingPlans,
        list: nextList,
        planNoFreeV8: true,
      };
    }

    const existingHome =
      allData['settings/home'] && typeof allData['settings/home'] === 'object'
        ? { ...(allData['settings/home'] as Record<string, any>) }
        : null;
    if (existingHome) {
      if (existingHome.nav && typeof existingHome.nav === 'object') {
        existingHome.nav = { ...existingHome.nav };
        if (existingHome.nav.modalSignup === 'إنشاء حساب مجاني') {
          existingHome.nav.modalSignup = 'إنشاء حساب';
        }
      }
      if (existingHome.hero && typeof existingHome.hero === 'object') {
        existingHome.hero = { ...existingHome.hero };
        if (typeof existingHome.hero.cta1 === 'string' && /مجانا|مجاناً/i.test(existingHome.hero.cta1)) {
          existingHome.hero.cta1 = 'جرب المنيو الان';
        }
      }
      if (existingHome.pricing && typeof existingHome.pricing === 'object') {
        const nextPricing = { ...existingHome.pricing };
        delete nextPricing.freeBadge;
        delete nextPricing.freeCta;
        if (typeof nextPricing.sub !== 'string' || /مجان|مجانية|تجريبية/i.test(nextPricing.sub)) {
          nextPricing.sub = 'اشترك بالباقة المناسبة لمشروعك بدون أي عمولة على مبيعاتك، وطوّر باقتك في أي وقت مع نمو طلباتك.';
        }
        existingHome.pricing = nextPricing;
      }
      if (existingHome.faq && Array.isArray(existingHome.faq.items)) {
        existingHome.faq = {
          ...existingHome.faq,
          items: existingHome.faq.items.map((item: Record<string, any>) =>
            item?.id === 'faq_5' || /الباقة المجانية|أبدأ مجاناً/i.test(`${item?.q || ''} ${item?.a || ''}`)
              ? {
                  ...item,
                  q: 'كيف يتم تفعيل الاشتراك وما هي الباقات المتوفرة؟',
                  a: 'نوفر 3 باقات مرنة (الاقتصادية، الاحترافية، وباقة الأعمال الشاملة) باشتراك شهري أو سنوي بدون أي عمولات على مبيعاتك، ويمكنك الترقية بين الباقات في أي وقت.',
                }
              : item
          ),
        };
      }
      putData['settings/home'] = existingHome;
    }

    for (const [k, v] of Object.entries(allData)) {
      if (!k.startsWith('restaurants/') || k.slice('restaurants/'.length).includes('/') || !v || typeof v !== 'object') {
        continue;
      }
      const r = v as Record<string, any>;
      const planStr = String(r.p || '').trim();
      if (r.planId === 'free' || planStr === 'الباقة المجانية' || planStr === 'البداية المجانية') {
        putData[k] = {
          ...r,
          planId: 'starter',
          p: 'الباقة الاقتصادية',
          isPaid: true,
        };
      }
    }

    putData['migrations/remove_free_plan_v1'] = true;
  }

  for (const k of Object.keys(allData)) {
    if (k.startsWith('promo_codes/')) {
      delKeys.push(k);
    } else if (k.startsWith('items/')) {
      const itemRec = allData[k] as Record<string, any> | undefined;
      if (itemRec && typeof itemRec.img === 'string' && itemRec.img.includes('1576107232684-1279f3908594')) {
        putData[k] = {
          ...itemRec,
          img: '/uploads/hmo/item_046.jpg',
        };
      }
    }
  }

  if (Object.keys(putData).length > 0 || delKeys.length > 0) {
    await applyChanges({ put: putData, del: delKeys }, false);
  }
}

async function startServer() {
  await runStartupMigrations().catch((err) => {
    console.warn('[Startup Migration] Failed:', err);
  });
  if (isProduction) {
    const localDist = path.resolve(__dirname, 'dist');
    const cwdDist = path.resolve(process.cwd(), 'dist');
    const distDir = fs.existsSync(path.join(localDist, 'index.html')) ? localDist : cwdDist;
    const distAssetsDir = path.join(distDir, 'assets');
    const indexHtmlPath = path.join(distDir, 'index.html');

    // Long immutable cache for hashed Vite JS/CSS bundles
    if (fs.existsSync(distAssetsDir)) {
      app.use(
        '/assets',
        express.static(distAssetsDir, {
          maxAge: '1y',
          immutable: true,
          index: false,
        })
      );
    }

    // Static serving for public assets (e.g. favicon.svg, logo.png)
    app.use(
      express.static(distDir, {
        maxAge: '7d',
        index: false,
      })
    );

    // Cache dist/index.html keyed by file mtime so live rebuilds never serve stale CSS/JS hashes
    let cachedProdHtml: string | null = null;
    let cachedProdHtmlMtime = -1;
    const readFreshProdHtml = (): string | null => {
      try {
        const st = fs.statSync(indexHtmlPath);
        if (!cachedProdHtml || st.mtimeMs !== cachedProdHtmlMtime) {
          cachedProdHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
          cachedProdHtmlMtime = st.mtimeMs;
        }
        return cachedProdHtml;
      } catch {
        return cachedProdHtml;
      }
    };

    app.get('*', async (req, res, next) => {
      if (req.path.startsWith('/assets/') || ASSET_EXTENSION_RE.test(req.path)) {
        return res.status(404).end();
      }
      const rawHtml = readFreshProdHtml();
      if (!rawHtml) {
        return res.status(500).send('Build output not found. Run npm run build first.');
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      try {
        const subdomainResolved = res.locals.subdomainResolved as ResolvedSubdomainResult | undefined;
        if (subdomainResolved?.found) {
          const injected = injectSubdomainHtmlMeta(rawHtml, subdomainResolved);
          return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(injected);
        }
        const seoInjected = await injectSeoMetaIntoHtml(rawHtml, req);
        return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(seoInjected);
      } catch (err) {
        return next(err);
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.get('*', async (req, res, next) => {
      if (
        req.path.startsWith('/@') ||
        req.path.startsWith('/src/') ||
        req.path.startsWith('/node_modules/') ||
        ASSET_EXTENSION_RE.test(req.path)
      ) {
        return next();
      }
      try {
        const rawTemplate = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawTemplate);
        const subdomainResolved = res.locals.subdomainResolved as ResolvedSubdomainResult | undefined;
        if (subdomainResolved?.found) {
          const injected = injectSubdomainHtmlMeta(transformed, subdomainResolved);
          return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(injected);
        }
        const seoInjected = await injectSeoMetaIntoHtml(transformed, req);
        return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(seoInjected);
      } catch (err) {
        return next(err);
      }
    });
    app.use(vite.middlewares);
  }

  const onListening = () => {
    const addr = typeof PORT === 'number' ? `http://0.0.0.0:${PORT}` : String(PORT);
    console.log(`Menu+ server running on ${addr} (${isProduction ? 'production' : 'development'})`);
    const dbInfo = getDatabaseUrlInfo();
    if (dbInfo.configured && dbInfo.valid) {
      console.log(`[Database] DATABASE_URL configured (${dbInfo.host}:${dbInfo.port}/${dbInfo.database})`);
    } else if (dbInfo.configured && !dbInfo.valid) {
      console.warn(`[Database] DATABASE_URL invalid: ${dbInfo.error}`);
    } else {
      console.warn('[Database] DATABASE_URL is not set.');
    }
    startTelegramBotPolling().catch((err) => {
      console.warn('[Telegram Bot] Failed to start polling:', err);
    });
  };

  const server =
    typeof PORT === 'number'
      ? app.listen(PORT, '0.0.0.0', onListening)
      : app.listen(PORT, onListening);

  const shutdown = (signal: string) => {
    console.log(`[Server] Received ${signal}, shutting down gracefully...`);
    stopTelegramBotPolling();
    clearInterval(otpCleanupTimer);
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
