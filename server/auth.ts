/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import {
  deleteInternalStoreItem,
  getInternalStoreItem,
  readPrefixFromStore,
  setInternalStoreItem,
} from './neon-store.ts';
import { normalizePhoneKeys } from './telegram-otp.ts';

const PASSWORD_SALT = 'menuplus_secure_salt_2026';
const AUTH_SECRET_FILE = path.resolve(process.cwd(), 'data/.auth-secret');
export const AUTH_COOKIE_NAME = 'mp_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type HierarchicalStaffPermissions = {
  canViewAnalytics: boolean;
  canViewHome: boolean;
  canManageRestaurants: boolean;
  canCreatePartner: boolean;
  canEditPartnerPlan: boolean;
  canSuspendPartner: boolean;
  canEditPartnerProfile: boolean;
  canEditPartnerLinks: boolean;
  canImpersonatePartner: boolean;
  canDeletePartner: boolean;
  canEditDemoMenu: boolean;
  canUseNotes: boolean;
  canViewReports: boolean;
  canManagePlans: boolean;
  canManageStaff: boolean;
  canManageSettings: boolean;
  canEditHomePage: boolean;
  canEditTabLabels: boolean;
  canReorderTabs: boolean;
  canManageThemeMode: boolean;
  canManageSubdomains: boolean;
  canRunMaintenance: boolean;
  canManageFinance: boolean;
  canManageDatabase: boolean;
};

export interface ServerAuthSession {
  sid: string;
  role: 'owner' | 'staff' | 'partner';
  admin: boolean;
  accountId?: string;
  staffId?: string;
  rid?: string;
  personalRid?: string;
  name?: string;
  email?: string;
  phone?: string;
  roleTitle?: string;
  permissions?: Partial<HierarchicalStaffPermissions>;
  impersonating?: boolean;
  menuLoggedOut?: boolean;
  createdAt: number;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authSession?: ServerAuthSession | null;
      authPermissions?: HierarchicalStaffPermissions;
    }
  }
}

let cachedAuthSecret = '';
export function getAuthSecret(): string {
  if (cachedAuthSecret) return cachedAuthSecret;
  const fromEnv = String(process.env.SESSION_SECRET || '').trim();
  if (fromEnv && fromEnv.length >= 16) {
    cachedAuthSecret = fromEnv;
    return cachedAuthSecret;
  }
  try {
    const dir = path.dirname(AUTH_SECRET_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(AUTH_SECRET_FILE)) {
      const saved = fs.readFileSync(AUTH_SECRET_FILE, 'utf-8').trim();
      if (saved.length >= 32) {
        cachedAuthSecret = saved;
        return cachedAuthSecret;
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(AUTH_SECRET_FILE, generated, { mode: 0o600 });
    cachedAuthSecret = generated;
    return cachedAuthSecret;
  } catch {
    cachedAuthSecret = crypto.randomBytes(32).toString('hex');
    return cachedAuthSecret;
  }
}

export function hashLegacySha256(identifier: string, pw: string): string {
  const raw = `${identifier.trim().toLowerCase()}::${pw.trim().toLowerCase()}::${PASSWORD_SALT}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password.trim(), salt, 64).toString('hex');
  return `$scrypt$${salt}$${derived}`;
}

export function safeTimingEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyStoredCredential(
  storedHash: string | undefined | null,
  candidateIdentifiers: Array<string | undefined | null>,
  plainPassword: string,
  allowPlainFallback = false
): boolean {
  const stored = String(storedHash || '').trim();
  const pw = String(plainPassword || '').trim();
  if (!stored || !pw) return false;

  if (stored.startsWith('$scrypt$')) {
    const parts = stored.split('$');
    // ['', 'scrypt', salt, hex]
    if (parts.length !== 4) return false;
    const [, , salt, expectedHex] = parts;
    if (!salt || !expectedHex) return false;
    try {
      const derivedLower = crypto.scryptSync(pw.toLowerCase(), salt, 64).toString('hex');
      if (safeTimingEqual(derivedLower, expectedHex)) return true;
      const derivedExact = crypto.scryptSync(pw, salt, 64).toString('hex');
      return safeTimingEqual(derivedExact, expectedHex);
    } catch {
      return false;
    }
  }

  for (const cand of candidateIdentifiers) {
    const idStr = String(cand || '').trim();
    if (!idStr) continue;
    const hLower = hashLegacySha256(idStr, pw.toLowerCase());
    if (safeTimingEqual(hLower, stored)) return true;
    const hExact = hashLegacySha256(idStr, pw);
    if (safeTimingEqual(hExact, stored)) return true;
  }

  if (allowPlainFallback) {
    return safeTimingEqual(stored.toLowerCase(), pw.toLowerCase());
  }

  return false;
}

export function signSid(sid: string): string {
  const sig = crypto
    .createHmac('sha256', getAuthSecret())
    .update(sid)
    .digest('base64url');
  return `${sid}.${sig}`;
}

export function verifySignedSid(cookieVal: string): string | null {
  const val = String(cookieVal || '').trim();
  if (!val) return null;
  const dotIdx = val.indexOf('.');
  if (dotIdx <= 0) {
    return null;
  }
  const sid = val.slice(0, dotIdx);
  const sig = val.slice(dotIdx + 1);
  if (!/^[a-zA-Z0-9_-]{12,96}$/.test(sid) || !sig) return null;
  const expected = crypto
    .createHmac('sha256', getAuthSecret())
    .update(sid)
    .digest('base64url');
  return safeTimingEqual(sig, expected) ? sid : null;
}

export function parseRequestCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function setAuthCookie(res: Response, req: Request, sid: string | null): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const signed = sid ? signSid(sid) : '';
  const parts = [
    `${AUTH_COOKIE_NAME}=${signed ? encodeURIComponent(signed) : ''}`,
    'Path=/',
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) parts.push('Secure', 'Partitioned');
  if (sid) {
    parts.push(`Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
  } else {
    parts.push('Max-Age=0');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function extractRequestSid(req: Request): string | null {
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    const sidFromBearer = verifySignedSid(token);
    if (sidFromBearer) return sidFromBearer;
  }
  const headerToken = String(req.headers['x-session-token'] || '').trim();
  if (headerToken) {
    const sidFromHeader = verifySignedSid(headerToken);
    if (sidFromHeader) return sidFromHeader;
  }
  const cookies = parseRequestCookies(req.headers.cookie);
  const rawCookie = cookies[AUTH_COOKIE_NAME] || '';
  return verifySignedSid(rawCookie);
}

export const FULL_OWNER_PERMISSIONS: HierarchicalStaffPermissions = {
  canViewAnalytics: true,
  canViewHome: true,
  canManageRestaurants: true,
  canCreatePartner: true,
  canEditPartnerPlan: true,
  canSuspendPartner: true,
  canEditPartnerProfile: true,
  canEditPartnerLinks: true,
  canImpersonatePartner: true,
  canDeletePartner: true,
  canEditDemoMenu: true,
  canUseNotes: true,
  canViewReports: true,
  canManagePlans: true,
  canManageStaff: true,
  canManageSettings: true,
  canEditHomePage: true,
  canEditTabLabels: true,
  canReorderTabs: true,
  canManageThemeMode: true,
  canManageSubdomains: true,
  canRunMaintenance: true,
  canManageFinance: true,
  canManageDatabase: true,
};

export function normalizeHierarchicalPermissions(raw: unknown): HierarchicalStaffPermissions {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const canManageRestaurants = Boolean(src.canManageRestaurants || src.canManageUsers);
  const canManageSettings =
    src.canManageSettings !== undefined
      ? Boolean(src.canManageSettings)
      : Boolean(src.canManagePlans);

  return {
    canViewAnalytics: Boolean(src.canViewAnalytics),
    canViewHome: src.canViewHome !== undefined ? Boolean(src.canViewHome) : Boolean(src.canViewAnalytics ?? true),
    canManageRestaurants,
    canCreatePartner: src.canCreatePartner !== undefined ? Boolean(src.canCreatePartner) : canManageRestaurants,
    canEditPartnerPlan: Boolean(src.canEditPartnerPlan || src.canExtendSubscription),
    canSuspendPartner: src.canSuspendPartner !== undefined ? Boolean(src.canSuspendPartner) : canManageRestaurants,
    canEditPartnerProfile: src.canEditPartnerProfile !== undefined ? Boolean(src.canEditPartnerProfile) : canManageRestaurants,
    canEditPartnerLinks: src.canEditPartnerLinks !== undefined ? Boolean(src.canEditPartnerLinks) : canManageRestaurants,
    canImpersonatePartner: Boolean(src.canImpersonatePartner),
    canDeletePartner: Boolean(src.canDeletePartner),
    canEditDemoMenu: Boolean(src.canEditDemoMenu),
    canUseNotes: src.canUseNotes === undefined ? true : Boolean(src.canUseNotes),
    canViewReports: src.canViewReports === undefined ? true : Boolean(src.canViewReports),
    canManagePlans: Boolean(src.canManagePlans),
    canManageStaff: Boolean(src.canManageStaff),
    canManageSettings,
    canEditHomePage: src.canEditHomePage !== undefined ? Boolean(src.canEditHomePage) : canManageSettings,
    canEditTabLabels: src.canEditTabLabels !== undefined ? Boolean(src.canEditTabLabels) : canManageSettings,
    canReorderTabs: src.canReorderTabs !== undefined ? Boolean(src.canReorderTabs) : canManageSettings,
    canManageThemeMode: src.canManageThemeMode !== undefined ? Boolean(src.canManageThemeMode) : canManageSettings,
    canManageSubdomains: src.canManageSubdomains !== undefined ? Boolean(src.canManageSubdomains) : canManageSettings,
    canRunMaintenance: src.canRunMaintenance !== undefined ? Boolean(src.canRunMaintenance) : canManageSettings,
    canManageFinance: Boolean(src.canManageFinance),
    canManageDatabase: Boolean(src.canManageDatabase),
  };
}

export async function createServerAuthSession(
  req: Request,
  res: Response,
  payload: Omit<ServerAuthSession, 'sid' | 'createdAt' | 'expiresAt'>
): Promise<ServerAuthSession> {
  const sid = `mp_s_${crypto.randomBytes(18).toString('hex')}`;
  const now = Date.now();
  const full: ServerAuthSession = {
    ...payload,
    sid,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  await setInternalStoreItem(`user_sessions/${sid}`, {
    session: full,
    updatedAt: now,
    expiresAt: full.expiresAt,
  });
  setAuthCookie(res, req, sid);
  req.authSession = full;
  return full;
}

export async function updateServerAuthSession(
  sid: string,
  nextSession: ServerAuthSession
): Promise<void> {
  const now = Date.now();
  await setInternalStoreItem(`user_sessions/${sid}`, {
    session: nextSession,
    updatedAt: now,
    expiresAt: nextSession.expiresAt || now + SESSION_TTL_MS,
  });
}

export async function destroyServerAuthSession(req: Request, res: Response): Promise<void> {
  const sidFromAuth = extractRequestSid(req);
  const cookies = parseRequestCookies(req.headers.cookie);
  const sidFromCookie = verifySignedSid(cookies[AUTH_COOKIE_NAME] || '');
  const sidsToDestroy = Array.from(new Set([sidFromAuth, sidFromCookie].filter((x): x is string => Boolean(x))));
  for (const sid of sidsToDestroy) {
    await deleteInternalStoreItem(`user_sessions/${sid}`).catch(() => {});
  }
  setAuthCookie(res, req, null);
  req.authSession = null;
}

export async function clearAuthSessionsByTarget(
  targetRid?: string,
  targetAccountId?: string
): Promise<void> {
  try {
    const res = await readPrefixFromStore<{ session?: ServerAuthSession }>('user_sessions/');
    for (const item of res.items) {
      const ses = item.session;
      if (!ses) continue;
      if (
        (targetRid && ses.rid === targetRid) ||
        (targetAccountId && ses.accountId === targetAccountId)
      ) {
        await deleteInternalStoreItem(`user_sessions/${item.id}`).catch(() => {});
      }
    }
  } catch {
    // ignore cleanup error
  }
}

export function sanitizeAuthSessionForClient(ses: ServerAuthSession | null) {
  if (!ses) return null;
  return {
    admin: Boolean(ses.admin),
    role: ses.role,
    accountId: ses.accountId,
    staffId: ses.staffId,
    rid: ses.rid,
    personalRid: ses.personalRid,
    name: ses.name,
    email: ses.email,
    phone: ses.phone,
    roleTitle: ses.roleTitle,
    permissions: ses.permissions,
    impersonating: ses.impersonating,
    menuLoggedOut: ses.menuLoggedOut ? true : undefined,
  };
}

export async function attachAuthSession(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sid = extractRequestSid(req);

    if (!sid) {
      req.authSession = null;
      return next();
    }

    const record = await getInternalStoreItem<{
      session?: ServerAuthSession;
      expiresAt?: number;
    }>(`user_sessions/${sid}`);

    if (!record || !record.session || (record.expiresAt && Date.now() > record.expiresAt)) {
      if (record) {
        void deleteInternalStoreItem(`user_sessions/${sid}`);
      }
      req.authSession = null;
      return next();
    }

    const ses = record.session;

    // Live suspension/permission enforcement for staff & partner accounts
    if (ses.role === 'staff' && ses.staffId) {
      const staffRec = await getInternalStoreItem<{
        active?: boolean;
        permissions?: Record<string, unknown>;
        name?: string;
        roleTitle?: string;
        phone?: string;
        email?: string;
      }>(`staff/${ses.staffId}`);
      if (!staffRec || staffRec.active === false) {
        void deleteInternalStoreItem(`user_sessions/${sid}`);
        req.authSession = null;
        return next();
      }
      const perms = normalizeHierarchicalPermissions(staffRec.permissions);
      ses.permissions = perms;
      ses.name = staffRec.name || ses.name;
      ses.roleTitle = staffRec.roleTitle || ses.roleTitle;
      req.authPermissions = perms;
    } else if (ses.role === 'owner' || (ses.admin && !ses.staffId)) {
      if (ses.accountId) {
        const acc = await getInternalStoreItem<{ active?: boolean }>(`accounts/${ses.accountId}`);
        if (!acc || acc.active === false) {
          void deleteInternalStoreItem(`user_sessions/${sid}`);
          req.authSession = null;
          return next();
        }
      }
      ses.permissions = FULL_OWNER_PERMISSIONS;
      req.authPermissions = FULL_OWNER_PERMISSIONS;
    } else if (ses.role === 'partner') {
      if (ses.accountId) {
        const acc = await getInternalStoreItem<{ active?: boolean; rid?: string }>(`accounts/${ses.accountId}`);
        if (!acc || acc.active === false) {
          void deleteInternalStoreItem(`user_sessions/${sid}`);
          req.authSession = null;
          return next();
        }
      }
      if (ses.rid && ses.rid !== 'demo') {
        const rest = await getInternalStoreItem<{ a?: number }>(`restaurants/${ses.rid}`);
        if (rest && rest.a === 0) {
          void deleteInternalStoreItem(`user_sessions/${sid}`);
          req.authSession = null;
          return next();
        }
      }
    }

    req.authSession = { ...ses, sid };
    return next();
  } catch {
    req.authSession = null;
    return next();
  }
}

export function requireAdminOrStaff(permKey?: keyof HierarchicalStaffPermissions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ses = req.authSession;
    if (!ses || !ses.admin) {
      return res.status(401).json({
        success: false,
        error: 'يتطلب تسجيل الدخول بصلاحية إدارة المنصة',
      });
    }
    const perms = ses.role === 'owner' || !ses.staffId
      ? FULL_OWNER_PERMISSIONS
      : req.authPermissions || normalizeHierarchicalPermissions(ses.permissions);

    if (permKey && !perms[permKey]) {
      return res.status(403).json({
        success: false,
        error: 'ليست لديك الصلاحية اللازمة لتنفيذ هذا الإجراء',
      });
    }
    return next();
  };
}

export function matchesPhoneCandidates(a: string | undefined | null, b: string | undefined | null): boolean {
  const s1 = String(a || '').trim();
  const s2 = String(b || '').trim();
  if (!s1 || !s2) return false;
  if (s1.toLowerCase() === s2.toLowerCase()) return true;
  if (s1.includes('@') || s2.includes('@')) return false;
  const k1 = new Set(normalizePhoneKeys(s1));
  const k2 = normalizePhoneKeys(s2);
  return k2.some((k) => k1.has(k));
}
