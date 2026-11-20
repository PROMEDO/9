/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import {
  applyChanges,
  deleteInternalStoreItem,
  deleteRecordPhysicallyFromStore,
  isReservedInternalKey,
  isSafeStoreKey,
  readAll,
  readPrefixFromStore,
  upsertRecordInStore,
} from './neon-store.ts';
import { isSupabaseConfigured } from './supabase.ts';
import {
  deleteTelegramUserByPhone,
  getAdminTelegramConfig,
  listTelegramUsers,
  normalizePhoneKeys,
  sendTelegramTestMessage,
  testTelegramBotConnection,
  updateAdminTelegramConfig,
  type TelegramUserRecord,
} from './telegram-otp.ts';
import {
  clearAuthSessionsByTarget,
  FULL_OWNER_PERMISSIONS,
  hashPasswordScrypt,
  normalizeHierarchicalPermissions,
  requireAdminOrStaff,
} from './auth.ts';
import {
  collectTakenMenuSlugs,
  generateUniqueMenuCode,
  getSubdomainRulesFromStore,
  isValidSixCharCode,
  sanitizeSubdomainValue,
  SYSTEM_RESERVED_SUBDOMAINS,
} from './subdomain.ts';

const PROTECTED_OWNER_ACCOUNT_ID = 'acc_admin_owner';

export interface StaffPermissionsPayload {
  canViewAnalytics?: boolean;
  canViewHome?: boolean;
  canManageRestaurants?: boolean;
  canCreatePartner?: boolean;
  canEditPartnerPlan?: boolean;
  canSuspendPartner?: boolean;
  canEditPartnerProfile?: boolean;
  canEditPartnerLinks?: boolean;
  canImpersonatePartner?: boolean;
  canDeletePartner?: boolean;
  canEditDemoMenu?: boolean;
  canUseNotes?: boolean;
  canManagePlans?: boolean;
  canManageStaff?: boolean;
  canManageSettings?: boolean;
  canEditTabLabels?: boolean;
  canReorderTabs?: boolean;
  canManageThemeMode?: boolean;
  canManageSubdomains?: boolean;
  canRunMaintenance?: boolean;
  canManageFinance?: boolean;
  canManageDatabase?: boolean;
  [key: string]: unknown;
}

export interface StoredStaffRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  roleTitle: string;
  active: boolean;
  permissions: StaffPermissionsPayload;
  passwordHash?: string;
  pw?: string;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
  [key: string]: unknown;
}

export interface StoredAccountRecord {
  id?: string;
  u?: string;
  username?: string;
  em?: string;
  e?: string;
  n?: string;
  phone?: string;
  ph?: string;
  projectPhone?: string;
  projectName?: string;
  projectType?: string;
  roleTitle?: string;
  pw?: string;
  rid?: string;
  at?: string;
  r?: string;
  created?: string | number;
  createdAt?: number | string;
  updatedAt?: string;
  admin?: boolean;
  active?: boolean;
  authMethod?: string;
  telegramVerified?: boolean;
  [key: string]: unknown;
}

interface StoredRestaurantRecord {
  id?: string;
  n?: string;
  ph?: string;
  ow?: string;
  p?: string;
  planId?: string;
  e?: string;
  a?: number;
  done?: number;
  isPaid?: boolean;
  projectType?: string;
  slug?: string;
  subdomain?: string;
  social?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    x?: string;
    whatsapp?: string;
  };
  parentRid?: string;
  isBranch?: boolean;
  createdAt?: string | number;
  created?: string | number;
  [key: string]: unknown;
}

interface StoredPlanSettingsRecord {
  list?: Array<{
    id?: string;
    n?: string;
    pr?: number;
  }>;
}

function hashCredential(_identifier: string, password: string): string {
  return hashPasswordScrypt(password);
}

function isValidRecordId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_.-]+$/.test(id);
}

function sanitizePermissions(input: unknown): StaffPermissionsPayload {
  return normalizeHierarchicalPermissions(input);
}

function sanitizeSocialInput(input: unknown): StoredRestaurantRecord['social'] | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const s = input as Record<string, unknown>;
  const cleanUrl = (v: unknown) => {
    const str = String(v || '').trim().slice(0, 300);
    if (!str) return '';
    if (/^(javascript|data|vbscript):/i.test(str)) return '';
    return str;
  };
  return {
    instagram: cleanUrl(s.instagram),
    facebook: cleanUrl(s.facebook),
    tiktok: cleanUrl(s.tiktok),
    x: cleanUrl(s.x),
    whatsapp: cleanUrl(s.whatsapp),
  };
}

function sanitizeStaffForClient(rec: StoredStaffRecord & { id: string }) {
  const { passwordHash, pw, ...rest } = rec;
  return {
    ...rest,
    id: rec.id,
    name: String(rec.name || '').trim(),
    email: String(rec.email || '').trim().toLowerCase(),
    phone: String(rec.phone || '').trim(),
    roleTitle: String(rec.roleTitle || 'مشرف الدعم والعمليات').trim(),
    active: rec.active !== false,
    permissions: sanitizePermissions(rec.permissions),
    createdAt: rec.createdAt || new Date().toISOString().slice(0, 10),
    hasPassword: Boolean(passwordHash || pw),
  };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysFromDate(days: number, baseIso?: string): string {
  const safeDays = Math.max(1, Math.min(3650, Math.round(days)));
  const now = new Date();
  const base = baseIso && /^\d{4}-\d{2}-\d{2}$/.test(baseIso) && baseIso > todayIsoDate()
    ? new Date(`${baseIso}T00:00:00Z`)
    : now;
  base.setUTCDate(base.getUTCDate() + safeDays);
  return base.toISOString().slice(0, 10);
}

function generateStaffId(): string {
  return `stf_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

function generateUid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function normalizePhoneMatchSet(phone: string): Set<string> {
  const keys = normalizePhoneKeys(phone);
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits) keys.push(digits);
  return new Set(keys.filter(Boolean));
}

function formatRegistrationDate(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'number' && Number.isFinite(val)) {
    return new Date(val).toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  if (/^\d{10,13}$/.test(str)) {
    const ms = str.length === 10 ? Number(str) * 1000 : Number(str);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return str.slice(0, 10);
}

function resolveProjectTypeLabel(
  rawType: string | undefined,
  role: 'admin' | 'partner' | 'demo' | 'telegram_only',
  hasRestaurant: boolean
): string {
  if (role === 'admin' && !hasRestaurant) return 'إدارة المنصة';
  if (role === 'demo') return 'تجريبي';
  if (role === 'telegram_only') return 'مسجل تيليجرام';
  const t = String(rawType || '').trim().toLowerCase();
  switch (t) {
    case 'restaurant':
      return 'مطعم';
    case 'store':
      return 'متجر إلكتروني';
    case 'cafe':
      return 'كافيه ومشروبات';
    case 'sweets':
    case 'bakery':
      return 'حلويات ومخبوزات';
    case 'market':
      return 'سوبرماركت';
    case 'other':
      return 'مشروع آخر';
    default:
      return hasRestaurant ? 'مطعم' : 'غير محدد';
  }
}

interface AccountViewBuildOptions {
  currentAccountId?: string;
  countsByRid?: Map<string, { items: number; cats: number; orders: number }>;
}

function buildAdminAccountsView(
  accounts: Array<StoredAccountRecord & { id: string }>,
  restaurants: Array<StoredRestaurantRecord & { id: string }>,
  telegramUsers: TelegramUserRecord[],
  options?: AccountViewBuildOptions
) {
  const restById = new Map<string, StoredRestaurantRecord & { id: string }>();
  for (const r of restaurants) {
    restById.set(r.id, r);
  }

  const tgByKey = new Map<string, TelegramUserRecord>();
  for (const tg of telegramUsers) {
    for (const key of normalizePhoneMatchSet(tg.phone)) {
      if (!tgByKey.has(key)) {
        tgByKey.set(key, tg);
      }
    }
    if (tg.normalizedPhone && !tgByKey.has(tg.normalizedPhone)) {
      tgByKey.set(tg.normalizedPhone, tg);
    }
  }

  const matchedTelegramPrimaryKeys = new Set<string>();
  const matchedRestaurantIds = new Set<string>();

  const filteredAccounts = accounts.filter((acc) => {
    if (acc.id === 'acc_menu_demo') return false;
    return true;
  });

  const accountEntries = filteredAccounts.map((acc) => {
    const rawPhone = String(acc.phone || acc.ph || acc.projectPhone || '').trim();
    const rawIdentifier = String(acc.em || acc.username || acc.e || acc.u || '').trim();
    const lookupPhone = rawPhone || (/^\+?\d[\d\s-]{6,}$/.test(rawIdentifier) ? rawIdentifier : '');

    let linkedTg: TelegramUserRecord | undefined;
    for (const cand of [lookupPhone, rawIdentifier].filter(Boolean)) {
      for (const k of normalizePhoneMatchSet(cand)) {
        const hit = tgByKey.get(k);
        if (hit) {
          linkedTg = hit;
          break;
        }
      }
      if (linkedTg) break;
    }
    if (linkedTg) {
      matchedTelegramPrimaryKeys.add(linkedTg.normalizedPhone || linkedTg.phone);
    }

    const rid = acc.rid ? String(acc.rid) : undefined;
    const linkedRest = rid ? restById.get(rid) : undefined;
    if (linkedRest && linkedRest.id !== 'demo') {
      matchedRestaurantIds.add(linkedRest.id);
    }

    const isAdmin = Boolean(
      acc.admin === true ||
      acc.r === 'admin' ||
      String(acc.id).startsWith('acc_admin_')
    );
    const isDemo = false;
    const isProtected = acc.id === PROTECTED_OWNER_ACCOUNT_ID;
    const isCurrentUser = Boolean(options?.currentAccountId && acc.id === options.currentAccountId);
    const counts = rid ? options?.countsByRid?.get(rid) : undefined;
    const itemsCount = counts?.items ?? 0;
    const catsCount = counts?.cats ?? 0;
    const ordersCount = counts?.orders ?? 0;
    const hasOwnedMenu = Boolean(!isAdmin && rid && rid !== 'demo' && linkedRest);
    const isSelfRegisteredMenuOwner = Boolean(
      hasOwnedMenu &&
        (acc.authMethod === 'telegram_bot' ||
          acc.telegramVerified === true ||
          Boolean(linkedTg) ||
          linkedRest?.done === 1 ||
          itemsCount > 0)
    );

    const accountActive = acc.active !== false;
    const restActive = linkedRest ? linkedRest.a !== 0 : true;
    const isActive = accountActive && (isAdmin || restActive);

    const role: 'admin' | 'partner' | 'demo' = isAdmin ? 'admin' : 'partner';
    const roleLabel = isProtected
      ? 'مالك المنصة'
      : isAdmin
      ? 'مدير عام'
      : 'شريك متجر';

    const registrationDate =
      formatRegistrationDate(acc.at || acc.created || acc.createdAt) ||
      (linkedTg?.linkedAt ? formatRegistrationDate(linkedTg.linkedAt) : '');

    const rawProjectType = String(linkedRest?.projectType || acc.projectType || '').trim();
    const resolvedProjectName = String(
      linkedRest?.n || acc.projectName || (isAdmin && !linkedRest ? 'إدارة المنصة' : '')
    ).trim();

    return {
      id: acc.id,
      source: 'account' as const,
      name: String(acc.n || acc.projectName || linkedRest?.n || acc.username || acc.em || 'مستخدم').trim(),
      phone: lookupPhone || rawIdentifier || '-',
      identifier: rawIdentifier || lookupPhone || acc.id,
      email: String(acc.em || acc.e || '').trim(),
      role,
      roleLabel,
      status: isActive ? ('active' as const) : ('suspended' as const),
      statusLabel: isActive ? 'فعّال' : 'موقوف',
      active: isActive,
      registrationDate,
      rid,
      done: linkedRest ? (linkedRest.done === 1 ? 1 : 0) : 1,
      restaurantName: linkedRest?.n ? String(linkedRest.n) : undefined,
      projectName: resolvedProjectName || undefined,
      projectType: rawProjectType || (linkedRest ? 'restaurant' : undefined),
      projectTypeLabel: resolveProjectTypeLabel(rawProjectType, role, Boolean(linkedRest)),
      planId: linkedRest?.planId ? String(linkedRest.planId) : undefined,
      planName: linkedRest?.p ? String(linkedRest.p) : undefined,
      isPaid: Boolean(linkedRest?.isPaid),
      expiresAt: linkedRest?.e ? String(linkedRest.e) : undefined,
      restaurantActive: linkedRest ? linkedRest.a !== 0 : undefined,
      slug: linkedRest?.slug ? String(linkedRest.slug) : linkedRest?.subdomain ? String(linkedRest.subdomain) : undefined,
      subdomain: linkedRest?.subdomain ? String(linkedRest.subdomain) : linkedRest?.slug ? String(linkedRest.slug) : undefined,
      social: linkedRest?.social || undefined,
      telegramLinked: Boolean(linkedTg || acc.telegramVerified),
      telegramUsername: linkedTg?.username || undefined,
      telegramChatId: linkedTg?.chatId ? String(linkedTg.chatId) : undefined,
      telegramLinkedAt: linkedTg?.linkedAt ? formatRegistrationDate(linkedTg.linkedAt) : undefined,
      lastSentAt: linkedTg?.lastSentAt ? formatRegistrationDate(linkedTg.lastSentAt) : undefined,
      hasPassword: Boolean(acc.pw),
      isProtected,
      isCurrentUser,
      authMethod: String(acc.authMethod || (linkedTg ? 'telegram' : isAdmin ? 'admin' : 'manual')),
      itemsCount,
      catsCount,
      ordersCount,
      hasOwnedMenu,
      isSelfRegisteredMenuOwner,
      permissionsSummary: isProtected
        ? 'سيادة كاملة (المالك)'
        : isAdmin
        ? 'صلاحيات إدارية كاملة'
        : linkedRest
        ? `إدارة متجر: ${linkedRest.n || acc.rid}`
        : 'حساب شريك',
    };
  });

  // Include standalone restaurants/* that do not have an accounts/* row (exclude demo and sub-branches)
  const standaloneRestaurantEntries = restaurants
    .filter((r) => r.id !== 'demo' && !r.isBranch && !r.parentRid && !matchedRestaurantIds.has(r.id))
    .map((r) => {
      const rPhone = String(r.ph || '').trim();
      let linkedTg: TelegramUserRecord | undefined;
      if (rPhone) {
        for (const k of normalizePhoneMatchSet(rPhone)) {
          const hit = tgByKey.get(k);
          if (hit) {
            linkedTg = hit;
            break;
          }
        }
      }
      if (linkedTg) {
        matchedTelegramPrimaryKeys.add(linkedTg.normalizedPhone || linkedTg.phone);
      }

      const isActive = r.a !== 0;
      const rawProjectType = String(r.projectType || 'restaurant').trim();
      const counts = options?.countsByRid?.get(r.id);
      const itemsCount = counts?.items ?? 0;
      const catsCount = counts?.cats ?? 0;
      const ordersCount = counts?.orders ?? 0;

      return {
        id: `rest_${r.id}`,
        source: 'restaurant' as const,
        name: String(r.ow || r.n || 'شريك').trim(),
        phone: rPhone || '-',
        identifier: rPhone || r.id,
        email: '',
        role: 'partner' as const,
        roleLabel: 'شريك متجر',
        status: isActive ? ('active' as const) : ('suspended' as const),
        statusLabel: isActive ? 'فعّال' : 'موقوف',
        active: isActive,
        registrationDate: formatRegistrationDate(r.createdAt || r.created) || '',
        rid: r.id,
        done: r.done === 1 ? 1 : 0,
        restaurantName: String(r.n || '').trim() || undefined,
        projectName: String(r.n || '').trim() || 'مشروع بدون اسم',
        projectType: rawProjectType,
        projectTypeLabel: resolveProjectTypeLabel(rawProjectType, 'partner', true),
        planId: r.planId ? String(r.planId) : undefined,
        planName: r.p ? String(r.p) : 'الباقة الاقتصادية',
        isPaid: Boolean(r.isPaid),
        expiresAt: r.e ? String(r.e) : undefined,
        restaurantActive: isActive,
        slug: r.slug ? String(r.slug) : r.subdomain ? String(r.subdomain) : undefined,
        subdomain: r.subdomain ? String(r.subdomain) : r.slug ? String(r.slug) : undefined,
        social: r.social || undefined,
        telegramLinked: Boolean(linkedTg),
        telegramUsername: linkedTg?.username || undefined,
        telegramChatId: linkedTg?.chatId ? String(linkedTg.chatId) : undefined,
        telegramLinkedAt: linkedTg?.linkedAt ? formatRegistrationDate(linkedTg.linkedAt) : undefined,
        lastSentAt: linkedTg?.lastSentAt ? formatRegistrationDate(linkedTg.lastSentAt) : undefined,
        hasPassword: false,
        isProtected: false,
        isCurrentUser: false,
        authMethod: linkedTg ? 'telegram' : 'manual',
        itemsCount,
        catsCount,
        ordersCount,
        hasOwnedMenu: true,
        isSelfRegisteredMenuOwner: Boolean(linkedTg || r.done === 1 || itemsCount > 0),
        permissionsSummary: `إدارة متجر: ${r.n || r.id}`,
      };
    });

  // Also include Telegram-only registered users who don't yet have a matching accounts/* or restaurants/* record
  const telegramOnlyEntries = telegramUsers
    .filter((tg) => !matchedTelegramPrimaryKeys.has(tg.normalizedPhone || tg.phone))
    .map((tg) => {
      const pk = tg.normalizedPhone || tg.phone.replace(/\D/g, '') || tg.phone;
      return {
        id: `tg_${pk}`,
        source: 'telegram_only' as const,
        name: String(tg.firstName || (tg.username ? `@${tg.username}` : 'مسجل عبر تيليجرام')).trim(),
        phone: tg.phone,
        identifier: tg.phone,
        email: '',
        role: 'telegram_only' as const,
        roleLabel: 'مسجل تيليجرام',
        status: 'telegram_verified' as const,
        statusLabel: 'موثق بتيليجرام',
        active: true,
        registrationDate: formatRegistrationDate(tg.linkedAt),
        rid: undefined,
        done: 0,
        restaurantName: undefined,
        projectName: undefined,
        projectType: 'telegram_only',
        projectTypeLabel: 'مسجل تيليجرام',
        planId: undefined,
        planName: undefined,
        isPaid: false,
        expiresAt: undefined,
        restaurantActive: undefined,
        telegramLinked: true,
        telegramUsername: tg.username || undefined,
        telegramChatId: String(tg.chatId),
        telegramLinkedAt: formatRegistrationDate(tg.linkedAt),
        lastSentAt: tg.lastSentAt ? formatRegistrationDate(tg.lastSentAt) : undefined,
        hasPassword: false,
        isProtected: false,
        isCurrentUser: false,
        authMethod: 'telegram_bot',
        itemsCount: 0,
        catsCount: 0,
        ordersCount: 0,
        hasOwnedMenu: false,
        isSelfRegisteredMenuOwner: false,
        permissionsSummary: 'ربط بوت التحقق (بانتظار إكمال التسجيل)',
      };
    });

  const combined = [...accountEntries, ...standaloneRestaurantEntries, ...telegramOnlyEntries].sort((a, b) => {
    if (a.isProtected && !b.isProtected) return -1;
    if (!a.isProtected && b.isProtected) return 1;
    return (b.registrationDate || '').localeCompare(a.registrationDate || '');
  });

  const todayStr = todayIsoDate();
  const stats = {
    total: combined.length,
    active: combined.filter((c) => c.active).length,
    suspended: combined.filter((c) => !c.active || (c.expiresAt && c.expiresAt < todayStr)).length,
    telegramVerified: combined.filter((c) => c.telegramLinked).length,
    admins: combined.filter((c) => c.role === 'admin').length,
    partners: combined.filter((c) => c.role === 'partner' || Boolean(c.rid && c.rid !== 'demo')).length,
    paid: combined.filter((c) => c.isPaid && c.rid !== 'demo').length,
  };

  return { accounts: combined, stats };
}

export function createAdminRouter(): Router {
  const router = Router();

  // ============================================================================
  // 1. PERSISTENT STAFF MANAGEMENT ROUTES (/api/staff)
  // ============================================================================
  router.get('/api/staff', requireAdminOrStaff('canManageStaff'), async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const { items, source, supabaseError } = await readPrefixFromStore<StoredStaffRecord>('staff/');
      const staff = items
        .map(sanitizeStaffForClient)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || a.name.localeCompare(b.name));

      return res.json({
        success: true,
        staff,
        total: staff.length,
        source,
        ...(supabaseError ? { supabaseError } : {}),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل في جلب قائمة الموظفين';
      return res.status(500).json({ success: false, error: msg });
    }
  });

  router.post('/api/staff', requireAdminOrStaff('canManageStaff'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const name = String(body.name || '').trim();
      const phone = String(body.phone || body.email || '').trim();
      const email = phone.toLowerCase();
      const roleTitle = String(body.roleTitle || 'مشرف الدعم والعمليات').trim();
      const password = String(body.password || '').trim();
      const active = body.active !== false;
      const permissions = sanitizePermissions(body.permissions);

      if (!name) {
        return res.status(400).json({ success: false, error: 'اسم الموظف مطلوب' });
      }
      if (!phone) {
        return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب' });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل (أرقام أو أحرف أو رموز)' });
      }

      const existingRes = await readPrefixFromStore<StoredStaffRecord>('staff/');
      const phoneKeys = normalizePhoneMatchSet(phone);
      const duplicatePhone = existingRes.items.find((s) => {
        const candidates = [String(s.phone || ''), String(s.email || '')].filter(Boolean);
        for (const cand of candidates) {
          for (const k of normalizePhoneMatchSet(cand)) {
            if (phoneKeys.has(k)) return true;
          }
        }
        return false;
      });
      if (duplicatePhone) {
        return res.status(409).json({
          success: false,
          error: 'يوجد موظف آخر مسجل بنفس رقم الهاتف',
        });
      }

      const requestedId = String(body.id || '').trim();
      const id = requestedId && isValidRecordId(requestedId) ? requestedId : generateStaffId();
      const nowIso = new Date().toISOString();

      const newRecord: StoredStaffRecord = {
        id,
        name,
        email,
        phone,
        roleTitle,
        active,
        permissions,
        passwordHash: hashCredential(phone, password),
        createdAt: todayIsoDate(),
        updatedAt: nowIso,
      };

      const saveResult = await upsertRecordInStore(`staff/${id}`, newRecord);
      if (!saveResult.ok) {
        return res.status(502).json({
          success: false,
          error: saveResult.error || 'تعذر حفظ بيانات الموظف في قاعدة البيانات',
        });
      }

      return res.status(201).json({
        success: true,
        staff: sanitizeStaffForClient({ ...newRecord, id }),
        persistedToSupabase: saveResult.persistedToSupabase,
        source: saveResult.source,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل في إنشاء حساب الموظف';
      return res.status(500).json({ success: false, error: msg });
    }
  });

  router.put('/api/staff/:id', requireAdminOrStaff('canManageStaff'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = String(req.params.id || '').trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: 'معرّف الموظف غير صالح' });
      }

      const existingRes = await readPrefixFromStore<StoredStaffRecord>('staff/');
      const existing = existingRes.items.find((s) => s.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'الموظف غير موجود في قاعدة البيانات' });
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const name = body.name !== undefined ? String(body.name || '').trim() : existing.name;
      const phone =
        body.phone !== undefined
          ? String(body.phone || '').trim()
          : body.email !== undefined
          ? String(body.email || '').trim()
          : String(existing.phone || existing.email || '').trim();
      const roleTitle =
        body.roleTitle !== undefined
          ? String(body.roleTitle || '').trim()
          : String(existing.roleTitle || 'مشرف الدعم والعمليات');
      const active = body.active !== undefined ? Boolean(body.active) : existing.active !== false;
      const permissions =
        body.permissions !== undefined
          ? sanitizePermissions(body.permissions)
          : sanitizePermissions(existing.permissions);
      const newPassword = body.password !== undefined ? String(body.password || '').trim() : '';

      if (!name) {
        return res.status(400).json({ success: false, error: 'اسم الموظف مطلوب' });
      }
      if (!phone) {
        return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب' });
      }
      if (newPassword && newPassword.length < 8) {
        return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل (أرقام أو أحرف أو رموز)' });
      }

      const phoneKeys = normalizePhoneMatchSet(phone);
      const duplicatePhone = existingRes.items.find((s) => {
        if (s.id === id) return false;
        const candidates = [String(s.phone || ''), String(s.email || '')].filter(Boolean);
        for (const cand of candidates) {
          for (const k of normalizePhoneMatchSet(cand)) {
            if (phoneKeys.has(k)) return true;
          }
        }
        return false;
      });
      if (duplicatePhone) {
        return res.status(409).json({
          success: false,
          error: 'يوجد موظف آخر مسجل بنفس رقم الهاتف',
        });
      }

      const passwordHash = newPassword
        ? hashCredential(phone, newPassword)
        : existing.passwordHash || existing.pw;
      const nextEmail = newPassword ? phone.toLowerCase() : String(existing.email || phone).trim().toLowerCase();

      const updatedRecord: StoredStaffRecord = {
        ...existing,
        id,
        name,
        email: nextEmail,
        phone,
        roleTitle: roleTitle || existing.roleTitle,
        active,
        permissions,
        ...(passwordHash ? { passwordHash } : {}),
        updatedAt: new Date().toISOString(),
      };

      const saveResult = await upsertRecordInStore(`staff/${id}`, updatedRecord);
      if (!saveResult.ok) {
        return res.status(502).json({
          success: false,
          error: saveResult.error || 'تعذر تحديث بيانات الموظف في قاعدة البيانات',
        });
      }

      return res.json({
        success: true,
        staff: sanitizeStaffForClient({ ...updatedRecord, id }),
        persistedToSupabase: saveResult.persistedToSupabase,
        source: saveResult.source,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل في تعديل بيانات الموظف';
      return res.status(500).json({ success: false, error: msg });
    }
  });

  router.delete('/api/staff/:id', requireAdminOrStaff('canManageStaff'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = String(req.params.id || '').trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: 'معرّف الموظف غير صالح' });
      }

      const deleteResult = await deleteRecordPhysicallyFromStore(`staff/${id}`);
      if (!deleteResult.ok) {
        return res.status(502).json({
          success: false,
          error: deleteResult.error || 'تعذر حذف سجل الموظف من قاعدة البيانات',
        });
      }

      if (!deleteResult.deletedFromSupabase && !deleteResult.deletedFromLocal) {
        return res.status(404).json({
          success: false,
          error: 'الموظف غير موجود أو تم حذفه نهائياً مسبقاً',
        });
      }

      return res.json({
        success: true,
        deletedId: id,
        physicalDelete: true,
        deletedFromSupabase: deleteResult.deletedFromSupabase,
        deletedFromLocal: deleteResult.deletedFromLocal,
        source: deleteResult.source,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل في حذف سجل الموظف';
      return res.status(500).json({ success: false, error: msg });
    }
  });

  // ============================================================================
  // 2. UNIFIED PARTNERS & ACCOUNTS ROUTES (/api/accounts & /api/partners)
  // ============================================================================
  router.get('/api/accounts', requireAdminOrStaff('canManageRestaurants'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [accountsRes, restaurantsRes, catsRes, itemsRes, ordersRes, telegramUsers] = await Promise.all([
        readPrefixFromStore<StoredAccountRecord>('accounts/'),
        readPrefixFromStore<StoredRestaurantRecord>('restaurants/'),
        readPrefixFromStore<{ rid?: string }>('cats/'),
        readPrefixFromStore<{ rid?: string }>('items/'),
        readPrefixFromStore<{ rid?: string }>('orders/'),
        listTelegramUsers(true),
      ]);

      const countsByRid = new Map<string, { items: number; cats: number; orders: number }>();
      const bump = (ridVal: unknown, field: 'items' | 'cats' | 'orders') => {
        const key = String(ridVal || '').trim();
        if (!key) return;
        const cur = countsByRid.get(key) || { items: 0, cats: 0, orders: 0 };
        cur[field] += 1;
        countsByRid.set(key, cur);
      };
      for (const c of catsRes.items) bump(c.rid, 'cats');
      for (const it of itemsRes.items) bump(it.rid, 'items');
      for (const o of ordersRes.items) bump(o.rid, 'orders');

      const { accounts, stats } = buildAdminAccountsView(
        accountsRes.items,
        restaurantsRes.items,
        telegramUsers,
        {
          currentAccountId: req.authSession?.accountId,
          countsByRid,
        }
      );

      return res.json({
        success: true,
        accounts,
        stats,
        source: accountsRes.source,
        ...(accountsRes.supabaseError ? { supabaseError: accountsRes.supabaseError } : {}),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل في جلب البيانات';
      return res.status(500).json({ success: false, error: msg });
    }
  });

  router.post('/api/partners', requireAdminOrStaff('canCreatePartner'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const projectName = String(body.projectName || body.name || '').trim();
      const ownerName = String(body.ownerName || projectName || '').trim();
      const phone = String(body.phone || '').trim();
      const projectType = String(body.projectType || 'restaurant').trim() || 'restaurant';
      const planId = String(body.planId || '').trim();
      const requestedPlanName = String(body.planName || '').trim();
      const durationDays = Math.max(1, Number(body.durationDays) || 30);
      const isPaidOverride = body.isPaid;
      const password = String(body.password || '').trim();

      if (!projectName) {
        return res.status(400).json({ success: false, error: 'اسم المشروع أو المطعم مطلوب' });
      }
      if (password && password.length < 8) {
        return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل (أرقام أو أحرف أو رموز)' });
      }

      const [plansRes, restaurantsRes, subRules] = await Promise.all([
        readPrefixFromStore<StoredPlanSettingsRecord>('settings/plans'),
        readPrefixFromStore<StoredRestaurantRecord>('restaurants/'),
        getSubdomainRulesFromStore(),
      ]);
      const plansList = plansRes.items[0]?.list || [];
      const matchedPlan = plansList.find(
        (pl) => (planId && pl.id === planId) || (requestedPlanName && pl.n === requestedPlanName)
      ) || plansList[0];

      const resolvedPlanId = planId || matchedPlan?.id || 'starter';
      const resolvedPlanName = requestedPlanName || matchedPlan?.n || 'الباقة الاقتصادية';
      const resolvedIsPaid =
        typeof isPaidOverride === 'boolean'
          ? isPaidOverride
          : matchedPlan
          ? Number(matchedPlan.pr || 0) > 0
          : true;

      const takenSlugs = collectTakenMenuSlugs(restaurantsRes.items);
      const requestedSlug = sanitizeSubdomainValue(String(body.slug || ''));
      const canUseCustomSlug =
        resolvedIsPaid &&
        requestedSlug.length >= 3 &&
        !SYSTEM_RESERVED_SUBDOMAINS.has(requestedSlug) &&
        !takenSlugs.has(requestedSlug);
      const finalSlug = canUseCustomSlug ? requestedSlug : generateUniqueMenuCode(takenSlugs);

      const rid = generateUid('r_');
      const expiry = addDaysFromDate(durationDays);
      const newRest: StoredRestaurantRecord & { id: string } = {
        id: rid,
        n: projectName,
        ow: ownerName,
        ph: phone,
        projectType,
        p: resolvedPlanName,
        planId: resolvedPlanId,
        e: expiry,
        a: 1,
        o: 0,
        v: 0,
        done: 1,
        lay: 'list',
        themeMode: 'light',
        themePreset: 'clean-light',
        color: '#059669',
        h: { m: '24' },
        isPaid: resolvedIsPaid,
        slug: finalSlug,
        subdomain: resolvedIsPaid && subRules.enabled ? finalSlug : '',
        createdAt: todayIsoDate(),
      };

      const saveRest = await upsertRecordInStore(`restaurants/${rid}`, newRest);
      if (!saveRest.ok) {
        return res.status(502).json({
          success: false,
          error: saveRest.error || 'تعذر حفظ المشروع في قاعدة البيانات',
        });
      }

      let createdAccount: (StoredAccountRecord & { id: string }) | null = null;
      if (phone) {
        const accId = generateUid('acc_');
        const accPayload: StoredAccountRecord & { id: string } = {
          id: accId,
          n: ownerName,
          phone,
          ph: phone,
          projectName,
          projectType,
          rid,
          r: 'partner',
          admin: false,
          active: true,
          at: todayIsoDate(),
          created: todayIsoDate(),
          ...(password ? { pw: hashCredential(phone, password), username: phone } : {}),
        };
        const saveAcc = await upsertRecordInStore(`accounts/${accId}`, accPayload);
        if (saveAcc.ok) {
          createdAccount = accPayload;
        }
      }

      const telegramUsers = await listTelegramUsers(false);
      const { accounts } = buildAdminAccountsView(
        createdAccount ? [createdAccount] : [],
        [newRest],
        telegramUsers
      );

      return res.status(201).json({
        success: true,
        account: accounts[0],
        persistedToSupabase: saveRest.persistedToSupabase,
        source: saveRest.source,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل في إضافة الشريك';
      return res.status(500).json({ success: false, error: msg });
    }
  });

  router.put('/api/accounts/:id', requireAdminOrStaff('canManageRestaurants'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = String(req.params.id || '').trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: 'معرّف السجل غير صالح' });
      }

      const [accountsRes, restaurantsRes, plansRes, subRules] = await Promise.all([
        readPrefixFromStore<StoredAccountRecord>('accounts/'),
        readPrefixFromStore<StoredRestaurantRecord>('restaurants/'),
        readPrefixFromStore<StoredPlanSettingsRecord>('settings/plans'),
        getSubdomainRulesFromStore(),
      ]);

      const body = (req.body || {}) as Record<string, unknown>;
      const perms = req.authPermissions || FULL_OWNER_PERMISSIONS;
      const plansList = plansRes.items[0]?.list || [];

      const hasPlanUpdate =
        body.planId !== undefined ||
        body.planName !== undefined ||
        body.durationDays !== undefined ||
        body.expiresAt !== undefined ||
        body.isPaid !== undefined;
      const hasLinkOrSocialUpdate =
        body.slug !== undefined ||
        body.subdomain !== undefined ||
        body.social !== undefined;

      if (hasPlanUpdate && !perms.canEditPartnerPlan) {
        return res.status(403).json({ success: false, error: 'ليست لديك صلاحية تعديل باقة أو مدة الشريك' });
      }
      if (body.active !== undefined && !perms.canSuspendPartner) {
        return res.status(403).json({ success: false, error: 'ليست لديك صلاحية إيقاف أو تفعيل الحسابات' });
      }
      if (hasLinkOrSocialUpdate && !perms.canEditPartnerLinks) {
        return res.status(403).json({ success: false, error: 'ليست لديك صلاحية تعديل روابط المنيو أو السوشيال' });
      }

      const validateUniqueSlug = (rawSlug: unknown, ownRid?: string): string | null => {
        const clean = sanitizeSubdomainValue(String(rawSlug || ''));
        if (!clean) return '';
        if (clean.length < 3) {
          throw new Error('معرّف الرابط يجب أن يتكون من 3 أحرف أو أرقام على الأقل');
        }
        if (SYSTEM_RESERVED_SUBDOMAINS.has(clean) || subRules.blockedKeywords.includes(clean)) {
          throw new Error(`الاسم "${clean}" محجوز للنظام، اختر اسماً مختلفاً.`);
        }
        const conflict = restaurantsRes.items.find((r) => {
          if (ownRid && r.id === ownRid) return false;
          const s1 = sanitizeSubdomainValue(String(r.slug || ''));
          const s2 = sanitizeSubdomainValue(String(r.subdomain || ''));
          return s1 === clean || s2 === clean;
        });
        if (conflict) {
          throw new Error(`الرابط "${clean}" محجوز لحساب آخر، اختر اسماً مختلفاً.`);
        }
        return clean;
      };

      const resolvePlanPayload = (currentRest?: StoredRestaurantRecord) => {
        const reqPlanId = body.planId !== undefined ? String(body.planId || '').trim() : undefined;
        const reqPlanName = body.planName !== undefined ? String(body.planName || '').trim() : undefined;
        const matched = plansList.find(
          (pl) => (reqPlanId && pl.id === reqPlanId) || (reqPlanName && pl.n === reqPlanName)
        );
        const nextPlanId = reqPlanId || matched?.id || currentRest?.planId || 'starter';
        const nextPlanName = reqPlanName || matched?.n || currentRest?.p || 'الباقة الاقتصادية';
        const nextIsPaid =
          typeof body.isPaid === 'boolean'
            ? body.isPaid
            : matched
            ? Number(matched.pr || 0) > 0
            : currentRest?.isPaid ?? true;

        let nextExpiresAt = currentRest?.e || addDaysFromDate(30);
        if (body.expiresAt !== undefined && String(body.expiresAt).trim()) {
          nextExpiresAt = String(body.expiresAt).trim().slice(0, 10);
        } else if (body.durationDays !== undefined) {
          const days = Number(body.durationDays);
          if (Number.isFinite(days) && days > 0) {
            const extendFromCurrent = body.extendFromCurrent === true;
            nextExpiresAt = addDaysFromDate(days, extendFromCurrent ? currentRest?.e : undefined);
          }
        }
        return { nextPlanId, nextPlanName, nextIsPaid, nextExpiresAt };
      };

      // Case A: Standalone restaurant entry (`rest_<rid>`)
      if (id.startsWith('rest_')) {
        const rid = id.slice(5);
        const existingRest = restaurantsRes.items.find((r) => r.id === rid);
        if (!existingRest) {
          return res.status(404).json({ success: false, error: 'المشروع غير موجود في قاعدة البيانات' });
        }

        const nextActive = body.active !== undefined ? Boolean(body.active) : existingRest.a !== 0;
        const nextProjectName =
          body.projectName !== undefined
            ? String(body.projectName || '').trim() || existingRest.n
            : existingRest.n;
        const nextProjectType =
          body.projectType !== undefined
            ? String(body.projectType || '').trim() || existingRest.projectType || 'restaurant'
            : existingRest.projectType || 'restaurant';
        const nextPhone =
          body.phone !== undefined ? String(body.phone || '').trim() : String(existingRest.ph || '').trim();
        const nextOwner =
          body.name !== undefined ? String(body.name || '').trim() : String(existingRest.ow || '').trim();

        const planFields = hasPlanUpdate ? resolvePlanPayload(existingRest) : null;
        const targetIsPaid = planFields ? planFields.nextIsPaid : Boolean(existingRest.isPaid);
        const takenOtherSlugs = collectTakenMenuSlugs(restaurantsRes.items.filter((r) => r.id !== rid));

        let nextSlug = sanitizeSubdomainValue(String(existingRest.slug || ''));
        let nextSubdomain = sanitizeSubdomainValue(String(existingRest.subdomain || ''));

        if (body.slug !== undefined || body.subdomain !== undefined) {
          const rawInput = body.slug !== undefined && String(body.slug).trim() ? body.slug : body.subdomain;
          const checked = validateUniqueSlug(rawInput, rid);
          if (checked) {
            nextSlug = checked;
            nextSubdomain = subRules.enabled && targetIsPaid ? checked : '';
          } else {
            nextSlug = generateUniqueMenuCode(takenOtherSlugs);
            nextSubdomain = '';
          }
        } else if (planFields && !planFields.nextIsPaid) {
          nextSlug = isValidSixCharCode(nextSlug) && !takenOtherSlugs.has(nextSlug)
            ? nextSlug
            : generateUniqueMenuCode(takenOtherSlugs);
          nextSubdomain = '';
        } else if (!nextSlug) {
          nextSlug = generateUniqueMenuCode(takenOtherSlugs);
          nextSubdomain = subRules.enabled && targetIsPaid ? nextSlug : '';
        } else if (!subRules.enabled) {
          nextSubdomain = '';
        }
        const nextSocial = body.social !== undefined ? sanitizeSocialInput(body.social) : existingRest.social;

        const updatedRest: StoredRestaurantRecord & { id: string } = {
          ...existingRest,
          id: rid,
          ...(nextProjectName ? { n: nextProjectName } : {}),
          ...(nextOwner ? { ow: nextOwner } : {}),
          ph: nextPhone,
          projectType: nextProjectType,
          ...(String(nextProjectType).toLowerCase().trim() === 'store' &&
          String(existingRest.tagline || '').trim() === 'أشهى الأطباق المحضرة يومياً طازجة بجودة عالية'
            ? { tagline: '' }
            : {}),
          slug: nextSlug,
          subdomain: nextSubdomain,
          ...(nextSocial !== undefined ? { social: nextSocial } : {}),
          a: planFields ? (body.active !== undefined ? (nextActive ? 1 : 0) : 1) : (nextActive ? 1 : 0),
          ...(planFields
            ? {
                planId: planFields.nextPlanId,
                p: planFields.nextPlanName,
                isPaid: planFields.nextIsPaid,
                e: planFields.nextExpiresAt,
              }
            : {}),
        };

        const saveRestRes = await upsertRecordInStore(`restaurants/${rid}`, updatedRest);
        if (!saveRestRes.ok) {
          return res.status(502).json({
            success: false,
            error: saveRestRes.error || 'تعذر تحديث بيانات المشروع في قاعدة البيانات',
          });
        }

        const telegramUsers = await listTelegramUsers(false);
        const { accounts } = buildAdminAccountsView([], [updatedRest], telegramUsers);
        return res.json({
          success: true,
          account: accounts[0],
          persistedToSupabase: saveRestRes.persistedToSupabase,
          source: saveRestRes.source,
        });
      }

      // Case B: Telegram-only registration (`tg_<phone>`) — upgrade to partner account + restaurant when editing/giving plan!
      if (id.startsWith('tg_')) {
        const tgUsers = await listTelegramUsers(true);
        const phoneSlug = id.slice(3);
        const matchedTg = tgUsers.find(
          (tg) => (tg.normalizedPhone || tg.phone.replace(/\D/g, '') || tg.phone) === phoneSlug
        );
        if (!matchedTg) {
          return res.status(404).json({ success: false, error: 'سجل تيليجرام غير موجود' });
        }

        const nextName = String(body.name || matchedTg.firstName || matchedTg.phone).trim();
        const nextPhone = String(body.phone || matchedTg.phone).trim();
        const nextProjectName = String(body.projectName || nextName).trim();
        const nextProjectType = String(body.projectType || 'restaurant').trim();
        const newPassword = body.newPassword !== undefined ? String(body.newPassword || '').trim() : '';

        if (newPassword && newPassword.length < 8) {
          return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل (أرقام أو أحرف أو رموز)' });
        }

        const rid = generateUid('r_');
        const planFields = resolvePlanPayload();
        const takenSlugs = collectTakenMenuSlugs(restaurantsRes.items);
        const autoSlug = generateUniqueMenuCode(takenSlugs);
        const newRest: StoredRestaurantRecord & { id: string } = {
          id: rid,
          n: nextProjectName,
          ow: nextName,
          ph: nextPhone,
          projectType: nextProjectType,
          p: planFields.nextPlanName,
          planId: planFields.nextPlanId,
          e: planFields.nextExpiresAt,
          isPaid: planFields.nextIsPaid,
          slug: autoSlug,
          subdomain: '',
          a: body.active === false ? 0 : 1,
          o: 0,
          v: 0,
          done: 1,
          lay: 'list',
          themeMode: 'light',
          themePreset: 'clean-light',
          color: '#059669',
          h: { m: '24' },
          createdAt: todayIsoDate(),
        };

        const accId = generateUid('acc_');
        const newAcc: StoredAccountRecord & { id: string } = {
          id: accId,
          n: nextName,
          phone: nextPhone,
          ph: nextPhone,
          projectName: nextProjectName,
          projectType: nextProjectType,
          rid,
          r: 'partner',
          admin: false,
          active: body.active !== false,
          telegramVerified: true,
          at: todayIsoDate(),
          created: todayIsoDate(),
          ...(newPassword ? { pw: hashCredential(nextPhone, newPassword), username: nextPhone } : {}),
        };

        const [saveAccRes, saveRestRes] = await Promise.all([
          upsertRecordInStore(`accounts/${accId}`, newAcc),
          upsertRecordInStore(`restaurants/${rid}`, newRest),
        ]);

        if (!saveAccRes.ok || !saveRestRes.ok) {
          return res.status(502).json({
            success: false,
            error: saveAccRes.error || saveRestRes.error || 'تعذر ترقية سجل تيليجرام إلى حساب شريك',
          });
        }

        const { accounts } = buildAdminAccountsView([newAcc], [newRest], tgUsers);
        return res.json({
          success: true,
          account: accounts[0],
          persistedToSupabase: saveAccRes.persistedToSupabase,
          source: saveAccRes.source,
        });
      }

      // Case C: Existing Account (`accounts/<id>`)
      const existing = accountsRes.items.find((a) => a.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'الحساب غير موجود في قاعدة البيانات' });
      }

      const isProtectedOwner = id === PROTECTED_OWNER_ACCOUNT_ID;

      const nextName =
        body.name !== undefined ? String(body.name || '').trim() : String(existing.n || '').trim();
      const nextPhone =
        body.phone !== undefined
          ? String(body.phone || '').trim()
          : String(existing.phone || existing.ph || '').trim();
      const nextEmail =
        body.email !== undefined
          ? String(body.email || '').trim().toLowerCase()
          : String(existing.em || existing.e || '').trim();
      const nextProjectName =
        body.projectName !== undefined
          ? String(body.projectName || '').trim()
          : String(existing.projectName || '').trim();
      const nextProjectType =
        body.projectType !== undefined
          ? String(body.projectType || '').trim()
          : String(existing.projectType || '').trim();

      let nextActive = existing.active !== false;
      if (body.active !== undefined) {
        if (isProtectedOwner && body.active === false) {
          return res.status(403).json({
            success: false,
            error: 'لا يمكن إيقاف حساب مالك المنصة الرئيسي',
          });
        }
        nextActive = Boolean(body.active);
      }

      let nextAdmin = Boolean(existing.admin === true || existing.r === 'admin');
      let nextRole = existing.r || (nextAdmin ? 'admin' : 'partner');
      if (body.role === 'admin' || body.role === 'partner') {
        if (isProtectedOwner && body.role !== 'admin') {
          return res.status(403).json({
            success: false,
            error: 'لا يمكن تغيير صلاحية مالك المنصة الرئيسي',
          });
        }
        nextAdmin = body.role === 'admin';
        nextRole = body.role;
      }

      const newPassword = body.newPassword !== undefined ? String(body.newPassword || '').trim() : '';
      if (newPassword && newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل (أرقام أو أحرف أو رموز)',
        });
      }

      const hashIdentifier =
        String(existing.username || existing.em || nextEmail || nextPhone || id).trim();
      const nextPwHash = newPassword ? hashCredential(hashIdentifier, newPassword) : existing.pw;

      // Ensure or update linked restaurant if project/plan fields were updated
      let targetRid = existing.rid ? String(existing.rid) : undefined;
      let updatedRestaurantsList = restaurantsRes.items;
      const shouldUpdateRestaurant =
        hasPlanUpdate ||
        hasLinkOrSocialUpdate ||
        body.projectName !== undefined ||
        body.projectType !== undefined ||
        body.active !== undefined ||
        body.phone !== undefined;

      if (shouldUpdateRestaurant && !isProtectedOwner && existing.id !== 'acc_menu_demo') {
        let linkedRest = targetRid ? restaurantsRes.items.find((r) => r.id === targetRid) : undefined;
        if (!linkedRest && (hasPlanUpdate || hasLinkOrSocialUpdate || nextProjectName)) {
          targetRid = targetRid && targetRid !== 'demo' ? targetRid : generateUid('r_');
          const takenSlugs = collectTakenMenuSlugs(restaurantsRes.items);
          const rawLinkInput = body.slug !== undefined && String(body.slug).trim() ? body.slug : body.subdomain;
          const checkedSlug =
            body.slug !== undefined || body.subdomain !== undefined
              ? validateUniqueSlug(rawLinkInput, targetRid)
              : '';
          const nextSocial = body.social !== undefined ? sanitizeSocialInput(body.social) : undefined;
          const planFields = resolvePlanPayload();
          const finalSlug = checkedSlug || generateUniqueMenuCode(takenSlugs);
          linkedRest = {
            id: targetRid,
            n: nextProjectName || nextName || 'مشروع جديد',
            ow: nextName,
            ph: nextPhone,
            projectType: nextProjectType || 'restaurant',
            p: planFields.nextPlanName,
            planId: planFields.nextPlanId,
            e: planFields.nextExpiresAt,
            isPaid: planFields.nextIsPaid,
            a: nextActive ? 1 : 0,
            o: 0,
            v: 0,
            done: 1,
            lay: 'list',
            themeMode: 'light',
            themePreset: 'clean-light',
            color: '#059669',
            h: { m: '24' },
            slug: finalSlug,
            subdomain: subRules.enabled && planFields.nextIsPaid ? finalSlug : '',
            ...(nextSocial ? { social: nextSocial } : {}),
            createdAt: todayIsoDate(),
          };
          await upsertRecordInStore(`restaurants/${targetRid}`, linkedRest);
          updatedRestaurantsList = [...restaurantsRes.items, linkedRest];
        } else if (linkedRest && linkedRest.id !== 'demo') {
          const planFields = hasPlanUpdate ? resolvePlanPayload(linkedRest) : null;
          const targetIsPaid = planFields ? planFields.nextIsPaid : Boolean(linkedRest.isPaid);
          const takenOtherSlugs = collectTakenMenuSlugs(restaurantsRes.items.filter((r) => r.id !== linkedRest!.id));
          let nextSlug = sanitizeSubdomainValue(String(linkedRest.slug || ''));
          let nextSubdomain = sanitizeSubdomainValue(String(linkedRest.subdomain || ''));

          if (body.slug !== undefined || body.subdomain !== undefined) {
            const rawLinkInput = body.slug !== undefined && String(body.slug).trim() ? body.slug : body.subdomain;
            const checked = validateUniqueSlug(rawLinkInput, linkedRest.id);
            if (checked) {
              nextSlug = checked;
              nextSubdomain = subRules.enabled && targetIsPaid ? checked : '';
            } else {
              nextSlug = generateUniqueMenuCode(takenOtherSlugs);
              nextSubdomain = '';
            }
          } else if (planFields && !planFields.nextIsPaid) {
            nextSlug = isValidSixCharCode(nextSlug) && !takenOtherSlugs.has(nextSlug)
              ? nextSlug
              : generateUniqueMenuCode(takenOtherSlugs);
            nextSubdomain = '';
          } else if (!nextSlug) {
            nextSlug = generateUniqueMenuCode(takenOtherSlugs);
            nextSubdomain = subRules.enabled && targetIsPaid ? nextSlug : '';
          } else if (!subRules.enabled) {
            nextSubdomain = '';
          }

          const nextSocial = body.social !== undefined ? sanitizeSocialInput(body.social) : linkedRest.social;
          const nextRest: StoredRestaurantRecord & { id: string } = {
            ...linkedRest,
            id: linkedRest.id,
            ...(nextProjectName ? { n: nextProjectName } : {}),
            ...(nextName ? { ow: nextName } : {}),
            ...(body.phone !== undefined ? { ph: nextPhone } : {}),
            ...(nextProjectType ? { projectType: nextProjectType } : {}),
            slug: nextSlug,
            subdomain: nextSubdomain,
            ...(nextSocial !== undefined ? { social: nextSocial } : {}),
            ...(body.active !== undefined
              ? { a: nextActive ? 1 : 0 }
              : hasPlanUpdate
              ? { a: 1 }
              : {}),
            ...(planFields
              ? {
                  planId: planFields.nextPlanId,
                  p: planFields.nextPlanName,
                  isPaid: planFields.nextIsPaid,
                  e: planFields.nextExpiresAt,
                }
              : {}),
          };
          await upsertRecordInStore(`restaurants/${linkedRest.id}`, nextRest);
          updatedRestaurantsList = restaurantsRes.items.map((r) =>
            r.id === linkedRest!.id ? nextRest : r
          );
        }
      }

      if (hasPlanUpdate && body.active === undefined && !isProtectedOwner) {
        nextActive = true;
      }

      const updatedAccount: StoredAccountRecord & { id: string } = {
        ...existing,
        id,
        ...(nextName ? { n: nextName } : {}),
        ...(nextPhone ? { phone: nextPhone, ph: nextPhone } : {}),
        ...(nextEmail ? { em: nextEmail } : {}),
        ...(nextProjectName ? { projectName: nextProjectName } : {}),
        ...(nextProjectType ? { projectType: nextProjectType } : {}),
        ...(targetRid ? { rid: targetRid } : {}),
        admin: nextAdmin,
        r: nextRole,
        active: nextActive,
        ...(nextPwHash ? { pw: nextPwHash } : {}),
        updatedAt: new Date().toISOString(),
      };

      const saveAccountRes = await upsertRecordInStore(`accounts/${id}`, updatedAccount);
      if (!saveAccountRes.ok) {
        return res.status(502).json({
          success: false,
          error: saveAccountRes.error || 'تعذر حفظ تحديثات الحساب في قاعدة البيانات',
        });
      }

      const telegramUsers = await listTelegramUsers(false);
      const { accounts } = buildAdminAccountsView(
        [updatedAccount],
        updatedRestaurantsList,
        telegramUsers
      );

      return res.json({
        success: true,
        account: accounts[0],
        persistedToSupabase: saveAccountRes.persistedToSupabase,
        source: saveAccountRes.source,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل في تحديث بيانات الحساب';
      return res.status(500).json({ success: false, error: msg });
    }
  });

  router.delete('/api/accounts/:id', requireAdminOrStaff('canDeletePartner'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = String(req.params.id || '').trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: 'معرّف الحساب غير صالح' });
      }

      if (id === PROTECTED_OWNER_ACCOUNT_ID) {
        return res.status(403).json({
          success: false,
          error: 'حساب مالك المنصة الرئيسي محمي ولا يمكن حذفه',
        });
      }

      if (req.authSession?.accountId && id === req.authSession.accountId) {
        return res.status(403).json({
          success: false,
          error: 'لا يمكنك حذف حسابك النشط الذي تستخدمه حالياً في إدارة المنصة',
        });
      }

      // Platform account deletion MUST ONLY delete the platform account/store and preserve the Telegram user record
      // so the phone remains registered in Telegram DB as "telegram_only" (تليكرام بدون حساب بالمنصة).
      const deleteTelegramToo = false;

      const collectPhoneKeys = (vals: Array<unknown>) =>
        Array.from(
          new Set(
            vals
              .filter((v): v is string => typeof v === 'string' && v.trim().length >= 5)
              .map((v) => v.trim())
          )
        );

      // Helper to physically delete a restaurant, child branches, categories, items, orders, and user sessions
      const deleteRestaurantCascade = async (ridToRemove: string) => {
        if (!ridToRemove || ridToRemove === 'demo') return [] as string[];
        const [restsRes, catsRes, itemsRes, ordersRes] = await Promise.all([
          readPrefixFromStore<StoredRestaurantRecord>('restaurants/'),
          readPrefixFromStore<{ rid?: string }>('cats/'),
          readPrefixFromStore<{ rid?: string }>('items/'),
          readPrefixFromStore<{ rid?: string }>('orders/'),
        ]);
        const targetRids = new Set<string>([ridToRemove]);
        const discoveredPhones: string[] = [];
        for (const r of restsRes.items) {
          if (r.id === ridToRemove || r.parentRid === ridToRemove) {
            targetRids.add(r.id);
            if (r.ph) discoveredPhones.push(String(r.ph));
            if (r.ow) discoveredPhones.push(String(r.ow));
          }
        }
        const keysToDelete: string[] = [];
        for (const rId of targetRids) {
          if (rId && rId !== 'demo') keysToDelete.push(`restaurants/${rId}`);
        }
        for (const c of catsRes.items) {
          if (c.rid && targetRids.has(c.rid)) keysToDelete.push(`cats/${c.id}`);
        }
        for (const it of itemsRes.items) {
          if (it.rid && targetRids.has(it.rid)) keysToDelete.push(`items/${it.id}`);
        }
        for (const o of ordersRes.items) {
          if (o.rid && targetRids.has(o.rid)) keysToDelete.push(`orders/${o.id}`);
        }
        await Promise.all([
          ...keysToDelete.map((k) => deleteRecordPhysicallyFromStore(k)),
          ...Array.from(targetRids).map((rId) => clearAuthSessionsByTarget(rId)),
        ]);
        return discoveredPhones;
      };

      if (id.startsWith('tg_')) {
        const targetPhone = id.slice(3);
        const phoneSet = normalizePhoneMatchSet(targetPhone);
        const [accountsRes, restsRes] = await Promise.all([
          readPrefixFromStore<StoredAccountRecord>('accounts/'),
          readPrefixFromStore<StoredRestaurantRecord>('restaurants/'),
        ]);
        for (const acc of accountsRes.items) {
          if (acc.id === PROTECTED_OWNER_ACCOUNT_ID || acc.id === req.authSession?.accountId || acc.admin) continue;
          const accPhones = [acc.phone, acc.ph, acc.projectPhone, acc.em, acc.username]
            .filter((x): x is string => Boolean(x))
            .flatMap((x) => Array.from(normalizePhoneMatchSet(x)));
          if (accPhones.some((k) => phoneSet.has(k))) {
            await deleteRecordPhysicallyFromStore(`accounts/${acc.id}`);
            await clearAuthSessionsByTarget(acc.rid && acc.rid !== 'demo' ? acc.rid : undefined, acc.id);
            if (acc.rid && acc.rid !== 'demo') await deleteRestaurantCascade(acc.rid);
          }
        }
        for (const r of restsRes.items) {
          if (r.id === 'demo') continue;
          const rPhones = [r.ph, r.ow].filter((x): x is string => Boolean(x)).flatMap((x) => Array.from(normalizePhoneMatchSet(x)));
          if (rPhones.some((k) => phoneSet.has(k))) {
            await deleteRestaurantCascade(r.id);
          }
        }
        const tgDel = await deleteTelegramUserByPhone(targetPhone);
        if (!tgDel.ok) {
          return res.status(502).json({
            success: false,
            error: tgDel.error || 'تعذر حذف ربط تيليجرام من قاعدة البيانات',
          });
        }
        return res.json({
          success: true,
          deletedId: id,
          physicalDelete: true,
          deletedFromSupabase: tgDel.deletedFromSupabase,
          deletedTelegram: true,
        });
      }

      if (id.startsWith('rest_')) {
        const rid = id.slice(5);
        const [restsRes, accountsRes] = await Promise.all([
          readPrefixFromStore<StoredRestaurantRecord>('restaurants/'),
          readPrefixFromStore<StoredAccountRecord>('accounts/'),
        ]);
        const existingRest = restsRes.items.find((r) => r.id === rid);
        if (!existingRest) {
          return res.status(404).json({
            success: false,
            error: 'المشروع غير موجود أو تم حذفه نهائياً مسبقاً',
          });
        }
        const phonesToClear = collectPhoneKeys([existingRest.ph, existingRest.ow]);
        for (const acc of accountsRes.items) {
          if (acc.id !== PROTECTED_OWNER_ACCOUNT_ID && acc.rid === rid) {
            phonesToClear.push(...collectPhoneKeys([acc.phone, acc.ph, acc.projectPhone, acc.em, acc.username]));
            await deleteRecordPhysicallyFromStore(`accounts/${acc.id}`);
            await clearAuthSessionsByTarget(rid, acc.id);
          }
        }
        const branchPhones = await deleteRestaurantCascade(rid);
        phonesToClear.push(...branchPhones);
        let deletedTelegram = false;
        if (deleteTelegramToo && phonesToClear.length > 0) {
          for (const ph of Array.from(new Set(phonesToClear))) {
            const tgRes = await deleteTelegramUserByPhone(ph);
            if (tgRes.ok) deletedTelegram = true;
          }
        }
        return res.json({
          success: true,
          deletedId: id,
          physicalDelete: true,
          deletedFromSupabase: true,
          deletedFromLocal: true,
          deletedTelegram,
        });
      }

      const accountsRes = await readPrefixFromStore<StoredAccountRecord>('accounts/');
      const existing = accountsRes.items.find((a) => a.id === id);

      const deleteResult = await deleteRecordPhysicallyFromStore(`accounts/${id}`);
      if (!deleteResult.ok) {
        return res.status(502).json({
          success: false,
          error: deleteResult.error || 'تعذر حذف الحساب من قاعدة البيانات',
        });
      }

      if (!deleteResult.deletedFromSupabase && !deleteResult.deletedFromLocal) {
        return res.status(404).json({
          success: false,
          error: 'الحساب غير موجود أو تم حذفه نهائياً مسبقاً',
        });
      }

      await clearAuthSessionsByTarget(
        existing?.rid && existing.rid !== 'demo' ? String(existing.rid) : undefined,
        id
      );

      const phonesToClear = collectPhoneKeys([
        existing?.phone,
        existing?.ph,
        existing?.projectPhone,
        existing?.em,
        existing?.username,
      ]);

      if (existing?.rid && existing.rid !== 'demo') {
        const restPhones = await deleteRestaurantCascade(String(existing.rid));
        phonesToClear.push(...restPhones);
      }

      let deletedTelegram = false;
      if (deleteTelegramToo && phonesToClear.length > 0) {
        for (const ph of Array.from(new Set(phonesToClear))) {
          const tgRes = await deleteTelegramUserByPhone(ph);
          if (tgRes.ok) deletedTelegram = true;
        }
      }

      return res.json({
        success: true,
        deletedId: id,
        physicalDelete: true,
        deletedFromSupabase: deleteResult.deletedFromSupabase,
        deletedFromLocal: deleteResult.deletedFromLocal,
        deletedTelegram,
        source: deleteResult.source,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل في حذف الحساب';
      return res.status(500).json({ success: false, error: msg });
    }
  });

  // ============================================================================
  // 2.6. STORAGE MAINTENANCE: CLEANUP ORPHANED IMAGES & RECORDS
  // ============================================================================
  router.post('/api/maintenance/cleanup-images', requireAdminOrStaff('canRunMaintenance'), async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const allData = await readAll(false);
      const validRids = new Set<string>(['demo']);
      for (const key of Object.keys(allData)) {
        if (key.startsWith('restaurants/') && !key.slice('restaurants/'.length).includes('/')) {
          validRids.add(key.slice('restaurants/'.length));
        }
      }

      const keysToDelete: string[] = [];
      let reclaimedBytes = 0;

      for (const [key, val] of Object.entries(allData)) {
        if (!val || typeof val !== 'object') continue;
        const rec = val as Record<string, unknown>;
        if (
          (key.startsWith('cats/') || key.startsWith('items/') || key.startsWith('orders/')) &&
          rec.rid &&
          !validRids.has(String(rec.rid))
        ) {
          keysToDelete.push(key);
          reclaimedBytes += Buffer.byteLength(JSON.stringify(rec), 'utf8');
        } else if (key.startsWith('images/') || key.startsWith('uploads/')) {
          keysToDelete.push(key);
          reclaimedBytes += Buffer.byteLength(JSON.stringify(rec), 'utf8');
        }
      }

      // Also drop oversized/stale logs older than 90 days (> 200 logs)
      const logs = Object.entries(allData)
        .filter(([k]) => k.startsWith('logs/'))
        .map(([k, v]) => ({ k, at: Number((v as { at?: number })?.at || 0), size: Buffer.byteLength(JSON.stringify(v), 'utf8') }))
        .sort((a, b) => b.at - a.at);
      if (logs.length > 200) {
        for (const extra of logs.slice(200)) {
          keysToDelete.push(extra.k);
          reclaimedBytes += extra.size;
        }
      }

      await Promise.all(keysToDelete.map((k) => deleteRecordPhysicallyFromStore(k)));

      return res.json({
        success: true,
        removedRecords: keysToDelete.length,
        reclaimedBytes,
        message: keysToDelete.length > 0
          ? `تم تنظيف ${keysToDelete.length} سجل وصور يتيمة غير مرتبطة وتوفير ${(reclaimedBytes / 1024).toFixed(1)} كيلوبايت`
          : 'قاعدة البيانات نظيفة حالياً ولا توجد صور أو سجلات يتيمة غير مستخدمة.',
      });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'فشل في تنظيف الصور والملفات',
      });
    }
  });

  // ============================================================================
  // 3. PERSONAL PROFILE ROUTES (/api/my-account) — FOR OWNER AND ANY STAFF MEMBER
  // ============================================================================
  router.get('/api/my-account', requireAdminOrStaff(), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const authSes = req.authSession!;
      const staffId = authSes.role === 'staff' ? String(authSes.staffId || '') : String(req.query.staffId || '').trim();
      const email = String(req.query.email || authSes.email || '').trim().toLowerCase();
      const phone = String(req.query.phone || authSes.phone || '').trim();

      if (staffId) {
        const staffRes = await readPrefixFromStore<StoredStaffRecord>('staff/');
        const member = staffRes.items.find((s) => s.id === staffId);
        if (!member) {
          return res.status(404).json({ success: false, error: 'لم يتم العثور على بيانات حساب الموظف' });
        }
        const staffPhone = String(member.phone || member.email || '').trim();
        return res.json({
          success: true,
          profile: {
            kind: 'staff' as const,
            id: member.id,
            name: String(member.name || '').trim(),
            email: staffPhone,
            phone: staffPhone,
            roleTitle: String(member.roleTitle || 'موظف إدارة').trim(),
            createdAt: member.createdAt || todayIsoDate(),
            active: member.active !== false,
            isProtected: false,
            permissions: sanitizePermissions(member.permissions),
          },
          source: staffRes.source,
        });
      }

      const accountsRes = await readPrefixFromStore<StoredAccountRecord>('accounts/');
      const phoneSet = phone ? normalizePhoneMatchSet(phone) : new Set<string>();
      const matched = accountsRes.items.find((a) => {
        if (a.id === PROTECTED_OWNER_ACCOUNT_ID && (!email || email === '07711448594' || a.em?.toLowerCase() === email)) {
          return true;
        }
        if (email && (String(a.em || '').toLowerCase() === email || String(a.e || '').toLowerCase() === email || String(a.username || '').toLowerCase() === email)) {
          return true;
        }
        if (phoneSet.size > 0) {
          const accPhones = normalizePhoneMatchSet(String(a.phone || a.ph || ''));
          for (const k of accPhones) {
            if (phoneSet.has(k)) return true;
          }
        }
        return false;
      }) || accountsRes.items.find((a) => a.id === PROTECTED_OWNER_ACCOUNT_ID || a.admin === true || a.r === 'admin');

      const ownerPhone = String(matched?.phone || matched?.ph || phone || matched?.em || '07711448594').trim();
      return res.json({
        success: true,
        profile: {
          kind: 'owner' as const,
          id: matched?.id || PROTECTED_OWNER_ACCOUNT_ID,
          name: String(matched?.n || 'مدير المنصة').trim(),
          email: ownerPhone,
          phone: ownerPhone,
          roleTitle: String(matched?.roleTitle || 'مالك المنصة والمدير العام').trim(),
          createdAt: formatRegistrationDate(matched?.created || matched?.at) || 'منذ التأسيس',
          active: true,
          isProtected: (matched?.id || PROTECTED_OWNER_ACCOUNT_ID) === PROTECTED_OWNER_ACCOUNT_ID,
          permissions: FULL_OWNER_PERMISSIONS,
        },
        source: accountsRes.source,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل في جلب بيانات الحساب الشخصي';
      return res.status(500).json({ success: false, error: msg });
    }
  });

  router.put('/api/my-account', requireAdminOrStaff(), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const authSes = req.authSession!;
      const body = (req.body || {}) as Record<string, unknown>;
      const staffId = authSes.role === 'staff'
        ? String(authSes.staffId || '')
        : body.staffId
        ? String(body.staffId).trim()
        : '';
      const targetAccountId = authSes.role === 'staff'
        ? ''
        : body.accountId
        ? String(body.accountId).trim()
        : '';
      const name = String(body.name || '').trim();
      const phone = String(body.phone || body.email || '').trim();
      const email = phone.toLowerCase();
      const roleTitle = String(body.roleTitle || '').trim();
      const newPassword = body.newPassword !== undefined ? String(body.newPassword || '').trim() : '';

      if (!name) {
        return res.status(400).json({ success: false, error: 'الاسم الكامل مطلوب' });
      }
      if (!phone) {
        return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب' });
      }
      if (newPassword && newPassword.length < 8) {
        return res.status(400).json({ success: false, error: 'كلمة المرور الجديدة يجب أن تكون 8 خانات على الأقل (أرقام أو أحرف أو رموز)' });
      }

      // 1) Staff self-edit (full edit of personal info & password; permissions stay managed by admin)
      if (staffId) {
        const staffRes = await readPrefixFromStore<StoredStaffRecord>('staff/');
        const existing = staffRes.items.find((s) => s.id === staffId);
        if (!existing) {
          return res.status(404).json({ success: false, error: 'حساب الموظف غير موجود في قاعدة البيانات' });
        }

        const oldPhoneSet = normalizePhoneMatchSet(String(existing.phone || existing.email || ''));
        const newPhoneKeys = normalizePhoneMatchSet(phone);
        let phoneChanged = oldPhoneSet.size === 0;
        for (const k of newPhoneKeys) {
          if (oldPhoneSet.has(k)) {
            phoneChanged = false;
            break;
          }
          phoneChanged = true;
        }
        if (phoneChanged && !newPassword) {
          return res.status(400).json({
            success: false,
            error: 'عند تغيير رقم الهاتف، يرجى إدخال كلمة المرور الجديدة للحفاظ على صلاحية دخولك',
          });
        }

        const duplicatePhone = staffRes.items.find((s) => {
          if (s.id === staffId) return false;
          const candidates = [String(s.phone || ''), String(s.email || '')].filter(Boolean);
          for (const cand of candidates) {
            for (const k of normalizePhoneMatchSet(cand)) {
              if (newPhoneKeys.has(k)) return true;
            }
          }
          return false;
        });
        if (duplicatePhone) {
          return res.status(409).json({
            success: false,
            error: 'يوجد موظف آخر مسجل بنفس رقم الهاتف',
          });
        }

        const passwordHash = newPassword
          ? hashCredential(phone, newPassword)
          : existing.passwordHash || existing.pw;

        const updatedStaff: StoredStaffRecord & { id: string } = {
          ...existing,
          id: staffId,
          name,
          email: newPassword ? email : String(existing.email || email),
          phone,
          roleTitle: roleTitle || existing.roleTitle || 'موظف إدارة',
          ...(passwordHash ? { passwordHash } : {}),
          updatedAt: new Date().toISOString(),
        };

        const saveRes = await upsertRecordInStore(`staff/${staffId}`, updatedStaff);
        if (!saveRes.ok) {
          return res.status(502).json({
            success: false,
            error: saveRes.error || 'تعذر حفظ تعديلات حسابك في قاعدة البيانات',
          });
        }

        return res.json({
          success: true,
          persistedToSupabase: saveRes.persistedToSupabase,
          source: saveRes.source,
          profile: {
            kind: 'staff' as const,
            id: updatedStaff.id,
            name: updatedStaff.name,
            email: updatedStaff.phone || updatedStaff.email,
            phone: updatedStaff.phone || '',
            roleTitle: updatedStaff.roleTitle,
            createdAt: updatedStaff.createdAt || todayIsoDate(),
            active: updatedStaff.active !== false,
            isProtected: false,
            permissions: sanitizePermissions(updatedStaff.permissions),
          },
          sessionPatch: {
            name: updatedStaff.name,
            email: updatedStaff.phone || updatedStaff.email,
            phone: updatedStaff.phone || '',
            roleTitle: updatedStaff.roleTitle,
          },
        });
      }

      // 2) Owner / Admin personal account update
      const accountsRes = await readPrefixFromStore<StoredAccountRecord>('accounts/');
      const existingOwner =
        (targetAccountId ? accountsRes.items.find((a) => a.id === targetAccountId) : undefined) ||
        accountsRes.items.find((a) => a.id === PROTECTED_OWNER_ACCOUNT_ID) ||
        accountsRes.items.find((a) => a.admin === true || a.r === 'admin');

      const accId = existingOwner?.id || PROTECTED_OWNER_ACCOUNT_ID;
      const normalizedDigits = phone.replace(/\D/g, '');
      const hashId =
        accId === PROTECTED_OWNER_ACCOUNT_ID &&
        (normalizedDigits === '07711448594' || normalizedDigits === '9647711448594' || normalizedDigits === '7711448594')
          ? '07711448594'
          : phone;

      const updatedPw = newPassword
        ? hashCredential(hashId, newPassword)
        : existingOwner?.pw || hashCredential('07711448594', 'admin');

      const updatedAcc: StoredAccountRecord & { id: string } = {
        ...(existingOwner || {}),
        id: accId,
        n: name,
        em: phone,
        e: phone,
        username: phone,
        phone,
        ph: phone,
        roleTitle: roleTitle || existingOwner?.roleTitle || 'مالك المنصة والمدير العام',
        pw: updatedPw,
        rid: existingOwner?.rid || 'demo',
        r: 'admin',
        admin: true,
        active: true,
        at: existingOwner?.at || todayIsoDate(),
        created: existingOwner?.created || todayIsoDate(),
        updatedAt: new Date().toISOString(),
      };

      const saveRes = await upsertRecordInStore(`accounts/${accId}`, updatedAcc);
      if (!saveRes.ok) {
        return res.status(502).json({
          success: false,
          error: saveRes.error || 'تعذر حفظ بيانات الحساب في قاعدة البيانات',
        });
      }

      return res.json({
        success: true,
        persistedToSupabase: saveRes.persistedToSupabase,
        source: saveRes.source,
        profile: {
          kind: 'owner' as const,
          id: accId,
          name: updatedAcc.n || name,
          email: updatedAcc.phone || phone,
          phone: updatedAcc.phone || phone,
          roleTitle: updatedAcc.roleTitle || 'مالك المنصة والمدير العام',
          createdAt: formatRegistrationDate(updatedAcc.created || updatedAcc.at) || 'منذ التأسيس',
          active: true,
          isProtected: accId === PROTECTED_OWNER_ACCOUNT_ID,
          permissions: FULL_OWNER_PERMISSIONS,
        },
        sessionPatch: {
          name: updatedAcc.n || name,
          email: updatedAcc.phone || phone,
          phone: updatedAcc.phone || phone,
          roleTitle: updatedAcc.roleTitle || 'مالك المنصة والمدير العام',
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل في حفظ بيانات الحساب الشخصي';
      return res.status(500).json({ success: false, error: msg });
    }
  });

  // ============================================================================
  // 4. PLATFORM FINANCE: OPERATIONAL EXPENSES, DUE COUNTDOWNS & PROFITS LOG
  // ============================================================================
  const DEFAULT_FINANCE_SETTINGS = {
    exchangeRateIqdPerUsd: 1500,
    monthlyRevenueTargetIqd: 2000000,
    expensesReservePct: 25,
    marketingSalesPct: 25,
    emergencyGrowthPct: 15,
    ownerNetProfitPct: 35,
  };

  function advanceDueDateIso(currentDue: string, cycle: string): string {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(currentDue)
      ? new Date(`${currentDue}T00:00:00Z`)
      : new Date();
    if (cycle === 'monthly') {
      base.setUTCMonth(base.getUTCMonth() + 1);
    } else if (cycle === 'quarterly') {
      base.setUTCMonth(base.getUTCMonth() + 3);
    } else if (cycle === 'annual') {
      base.setUTCFullYear(base.getUTCFullYear() + 1);
    }
    return base.toISOString().slice(0, 10);
  }

  router.get('/api/admin/finance', requireAdminOrStaff('canManageFinance'), async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [expRes, profRes, settingsRes, restsRes, plansRes] = await Promise.all([
        readPrefixFromStore<Record<string, unknown>>('finance_expenses/'),
        readPrefixFromStore<Record<string, unknown>>('finance_profits/'),
        readPrefixFromStore<Record<string, unknown>>('settings/finance'),
        readPrefixFromStore<StoredRestaurantRecord>('restaurants/'),
        readPrefixFromStore<StoredPlanSettingsRecord>('settings/plans'),
      ]);

      const rawSettings = settingsRes.items[0] || {};
      const settings = {
        ...DEFAULT_FINANCE_SETTINGS,
        ...rawSettings,
        exchangeRateIqdPerUsd: Math.max(100, Number(rawSettings.exchangeRateIqdPerUsd) || DEFAULT_FINANCE_SETTINGS.exchangeRateIqdPerUsd),
        monthlyRevenueTargetIqd: Math.max(0, Number(rawSettings.monthlyRevenueTargetIqd ?? DEFAULT_FINANCE_SETTINGS.monthlyRevenueTargetIqd)),
        expensesReservePct: Math.max(0, Math.min(100, Number(rawSettings.expensesReservePct ?? DEFAULT_FINANCE_SETTINGS.expensesReservePct))),
        marketingSalesPct: Math.max(0, Math.min(100, Number(rawSettings.marketingSalesPct ?? DEFAULT_FINANCE_SETTINGS.marketingSalesPct))),
        emergencyGrowthPct: Math.max(0, Math.min(100, Number(rawSettings.emergencyGrowthPct ?? DEFAULT_FINANCE_SETTINGS.emergencyGrowthPct))),
        ownerNetProfitPct: Math.max(0, Math.min(100, Number(rawSettings.ownerNetProfitPct ?? DEFAULT_FINANCE_SETTINGS.ownerNetProfitPct))),
      };

      const expenses = expRes.items
        .map((e) => ({ ...e, id: String(e.id || '') }))
        .filter((e) => Boolean(e.id))
        .sort((a, b) => String((a as Record<string, unknown>).dueDate || '').localeCompare(String((b as Record<string, unknown>).dueDate || '')));

      const profits = profRes.items
        .map((p) => ({ ...p, id: String(p.id || '') }))
        .filter((p) => Boolean(p.id))
        .sort((a, b) => String((b as Record<string, unknown>).date || '').localeCompare(String((a as Record<string, unknown>).date || '')));

      const plansList = plansRes.items[0]?.list || [];
      const paidRests = restsRes.items.filter((r) => r.id !== 'demo' && !r.isBranch && r.isPaid && r.a !== 0);
      const estimatedMonthlyPartnerMrrIqd = paidRests.reduce((sum, r) => {
        const matchedPlan = plansList.find((pl) => pl.id === r.planId || pl.n === r.p);
        return sum + Math.max(0, Number(matchedPlan?.pr || 0));
      }, 0);

      return res.json({
        success: true,
        expenses,
        profits,
        settings,
        partnerSummary: {
          activePaidPartners: paidRests.length,
          estimatedMonthlyMrrIqd: estimatedMonthlyPartnerMrrIqd,
        },
        source: expRes.source,
      });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'فشل في جلب بيانات المصاريف والأرباح',
      });
    }
  });

  router.post('/api/admin/finance/expenses', requireAdminOrStaff('canManageFinance'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const title = String(body.title || '').trim().slice(0, 140);
      if (!title) {
        return res.status(400).json({ success: false, error: 'يرجى كتابة اسم المصروف أو الالتزام' });
      }
      const id = generateUid('exp_');
      const nowIso = new Date().toISOString();
      const amount = Math.max(0, Number(body.amount) || 0);
      const currency = body.currency === 'USD' ? 'USD' : 'IQD';
      const billingCycle = ['monthly', 'quarterly', 'annual', 'one_time'].includes(String(body.billingCycle))
        ? String(body.billingCycle)
        : 'monthly';
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate || '').trim())
        ? String(body.dueDate).trim()
        : todayIsoDate();
      const status = ['pending', 'paid', 'overdue'].includes(String(body.status))
        ? String(body.status)
        : 'pending';

      const record = {
        id,
        title,
        vendor: String(body.vendor || '').trim().slice(0, 100),
        category: String(body.category || 'server').trim() || 'server',
        amount,
        currency,
        billingCycle,
        dueDate,
        status,
        autoRenew: Boolean(body.autoRenew),
        reminderDays: Math.max(0, Math.min(60, Number(body.reminderDays ?? 5) || 0)),
        ...(status === 'paid' ? { paidAt: String(body.paidAt || todayIsoDate()) } : {}),
        notes: String(body.notes || '').trim().slice(0, 500),
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const saved = await upsertRecordInStore(`finance_expenses/${id}`, record);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || 'تعذر حفظ المصروف' });
      }
      return res.status(201).json({ success: true, expense: record, source: saved.source });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر إضافة المصروف',
      });
    }
  });

  router.put('/api/admin/finance/expenses/:id', requireAdminOrStaff('canManageFinance'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = String(req.params.id || '').trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
      }
      const expRes = await readPrefixFromStore<Record<string, unknown>>('finance_expenses/');
      const existing = expRes.items.find((e) => e.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'المصروف غير موجود' });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const title = body.title !== undefined ? String(body.title || '').trim().slice(0, 140) : String(existing.title || '');
      if (!title) {
        return res.status(400).json({ success: false, error: 'اسم المصروف مطلوب' });
      }
      const nextStatus =
        body.status !== undefined && ['pending', 'paid', 'overdue'].includes(String(body.status))
          ? String(body.status)
          : String(existing.status || 'pending');

      const updated = {
        ...existing,
        id,
        title,
        vendor: body.vendor !== undefined ? String(body.vendor || '').trim().slice(0, 100) : existing.vendor,
        category: body.category !== undefined ? String(body.category || 'server') : existing.category,
        amount: body.amount !== undefined ? Math.max(0, Number(body.amount) || 0) : existing.amount,
        currency: body.currency !== undefined ? (body.currency === 'USD' ? 'USD' : 'IQD') : existing.currency,
        billingCycle:
          body.billingCycle !== undefined && ['monthly', 'quarterly', 'annual', 'one_time'].includes(String(body.billingCycle))
            ? String(body.billingCycle)
            : existing.billingCycle,
        dueDate:
          body.dueDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate).trim())
            ? String(body.dueDate).trim()
            : existing.dueDate,
        status: nextStatus,
        autoRenew: body.autoRenew !== undefined ? Boolean(body.autoRenew) : Boolean(existing.autoRenew),
        reminderDays:
          body.reminderDays !== undefined
            ? Math.max(0, Math.min(60, Number(body.reminderDays) || 0))
            : existing.reminderDays,
        paidAt: nextStatus === 'paid' ? String(body.paidAt || existing.paidAt || todayIsoDate()) : undefined,
        notes: body.notes !== undefined ? String(body.notes || '').trim().slice(0, 500) : existing.notes,
        updatedAt: new Date().toISOString(),
      };

      const saved = await upsertRecordInStore(`finance_expenses/${id}`, updated);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || 'تعذر تحديث المصروف' });
      }
      return res.json({ success: true, expense: updated, source: saved.source });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر تعديل المصروف',
      });
    }
  });

  router.post('/api/admin/finance/expenses/:id/pay', requireAdminOrStaff('canManageFinance'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = String(req.params.id || '').trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
      }
      const expRes = await readPrefixFromStore<Record<string, unknown>>('finance_expenses/');
      const existing = expRes.items.find((e) => e.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'المصروف غير موجود' });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const advanceCycle = body.advanceCycle === true;
      const cycle = String(existing.billingCycle || 'one_time');
      const currentDue = String(existing.dueDate || todayIsoDate());

      const updated = {
        ...existing,
        id,
        paidAt: todayIsoDate(),
        status: advanceCycle && cycle !== 'one_time' ? 'pending' : 'paid',
        dueDate: advanceCycle && cycle !== 'one_time' ? advanceDueDateIso(currentDue, cycle) : currentDue,
        updatedAt: new Date().toISOString(),
      };
      const saved = await upsertRecordInStore(`finance_expenses/${id}`, updated);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || 'تعذر تسجيل السداد' });
      }
      return res.json({ success: true, expense: updated });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر تسجيل السداد',
      });
    }
  });

  router.delete('/api/admin/finance/expenses/:id', requireAdminOrStaff('canManageFinance'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = String(req.params.id || '').trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
      }
      const delRes = await deleteRecordPhysicallyFromStore(`finance_expenses/${id}`);
      if (!delRes.ok) {
        return res.status(502).json({ success: false, error: delRes.error || 'تعذر حذف المصروف' });
      }
      return res.json({ success: true, deletedId: id });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر حذف المصروف',
      });
    }
  });

  router.post('/api/admin/finance/profits', requireAdminOrStaff('canManageFinance'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const title = String(body.title || '').trim().slice(0, 140);
      if (!title) {
        return res.status(400).json({ success: false, error: 'يرجى كتابة وصف الإيراد أو الربح' });
      }
      const id = generateUid('prf_');
      const nowIso = new Date().toISOString();
      const record = {
        id,
        title,
        source: ['subscription', 'setup', 'ads_campaign', 'custom_service', 'other'].includes(String(body.source))
          ? String(body.source)
          : 'subscription',
        partnerName: String(body.partnerName || '').trim().slice(0, 100),
        rid: body.rid ? String(body.rid).trim() : undefined,
        amount: Math.max(0, Number(body.amount) || 0),
        currency: body.currency === 'USD' ? 'USD' : 'IQD',
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '').trim())
          ? String(body.date).trim()
          : todayIsoDate(),
        allocationNote: String(body.allocationNote || '').trim().slice(0, 200),
        notes: String(body.notes || '').trim().slice(0, 500),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const saved = await upsertRecordInStore(`finance_profits/${id}`, record);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || 'تعذر حفظ سجل الربح' });
      }
      return res.status(201).json({ success: true, profit: record, source: saved.source });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر إضافة الربح',
      });
    }
  });

  router.put('/api/admin/finance/profits/:id', requireAdminOrStaff('canManageFinance'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = String(req.params.id || '').trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
      }
      const profRes = await readPrefixFromStore<Record<string, unknown>>('finance_profits/');
      const existing = profRes.items.find((p) => p.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'سجل الربح غير موجود' });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const title = body.title !== undefined ? String(body.title || '').trim().slice(0, 140) : String(existing.title || '');
      if (!title) {
        return res.status(400).json({ success: false, error: 'عنوان الربح مطلوب' });
      }
      const updated = {
        ...existing,
        id,
        title,
        source:
          body.source !== undefined && ['subscription', 'setup', 'ads_campaign', 'custom_service', 'other'].includes(String(body.source))
            ? String(body.source)
            : existing.source,
        partnerName: body.partnerName !== undefined ? String(body.partnerName || '').trim().slice(0, 100) : existing.partnerName,
        amount: body.amount !== undefined ? Math.max(0, Number(body.amount) || 0) : existing.amount,
        currency: body.currency !== undefined ? (body.currency === 'USD' ? 'USD' : 'IQD') : existing.currency,
        date:
          body.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date).trim())
            ? String(body.date).trim()
            : existing.date,
        allocationNote: body.allocationNote !== undefined ? String(body.allocationNote || '').trim().slice(0, 200) : existing.allocationNote,
        notes: body.notes !== undefined ? String(body.notes || '').trim().slice(0, 500) : existing.notes,
        updatedAt: new Date().toISOString(),
      };
      const saved = await upsertRecordInStore(`finance_profits/${id}`, updated);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || 'تعذر تحديث سجل الربح' });
      }
      return res.json({ success: true, profit: updated, source: saved.source });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر تعديل سجل الربح',
      });
    }
  });

  router.delete('/api/admin/finance/profits/:id', requireAdminOrStaff('canManageFinance'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = String(req.params.id || '').trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
      }
      const delRes = await deleteRecordPhysicallyFromStore(`finance_profits/${id}`);
      if (!delRes.ok) {
        return res.status(502).json({ success: false, error: delRes.error || 'تعذر حذف السجل' });
      }
      return res.json({ success: true, deletedId: id });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر حذف السجل',
      });
    }
  });

  router.put('/api/admin/finance/settings', requireAdminOrStaff('canManageFinance'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const existingRes = await readPrefixFromStore<Record<string, unknown>>('settings/finance');
      const existing = existingRes.items[0] || {};
      const nextSettings = {
        ...DEFAULT_FINANCE_SETTINGS,
        ...existing,
        exchangeRateIqdPerUsd: Math.max(100, Number(body.exchangeRateIqdPerUsd ?? existing.exchangeRateIqdPerUsd) || 1500),
        monthlyRevenueTargetIqd: Math.max(0, Number(body.monthlyRevenueTargetIqd ?? existing.monthlyRevenueTargetIqd ?? 2000000)),
        expensesReservePct: Math.max(0, Math.min(100, Number(body.expensesReservePct ?? existing.expensesReservePct ?? 25))),
        marketingSalesPct: Math.max(0, Math.min(100, Number(body.marketingSalesPct ?? existing.marketingSalesPct ?? 25))),
        emergencyGrowthPct: Math.max(0, Math.min(100, Number(body.emergencyGrowthPct ?? existing.emergencyGrowthPct ?? 15))),
        ownerNetProfitPct: Math.max(0, Math.min(100, Number(body.ownerNetProfitPct ?? existing.ownerNetProfitPct ?? 35))),
        updatedAt: new Date().toISOString(),
      };
      const saved = await upsertRecordInStore('settings/finance', nextSettings);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || 'تعذر حفظ الإعدادات المالية' });
      }
      return res.json({ success: true, settings: nextSettings, source: saved.source });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر حفظ الإعدادات المالية',
      });
    }
  });

  const appendDbAuditLog = async (
    req: Request,
    action: string,
    details: string,
    type: 'system' | 'plan' | 'partner' | 'auth' = 'system'
  ) => {
    try {
      const ses = req.authSession;
      const logId = `aud_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
      await upsertRecordInStore(`logs/${logId}`, {
        id: logId,
        at: Date.now(),
        actor: ses?.phone || ses?.email || ses?.name || 'مدير المنصة',
        action,
        details,
        type,
      });
    } catch {
      // ignore audit failure
    }
  };

  // ============================================================================
  // FULL DATABASE EXPLORER & CONTROL ROUTES (/api/admin/database/*)
  // ============================================================================
  router.get('/api/admin/database/overview', requireAdminOrStaff('canManageDatabase'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [allData, tgUsers] = await Promise.all([
        readAll(true),
        listTelegramUsers(true).catch(() => [] as TelegramUserRecord[]),
      ]);

      const accounts: Array<Record<string, unknown>> = [];
      const staff: Array<Record<string, unknown>> = [];
      const restaurants: Array<Record<string, unknown>> = [];
      const categories: Array<Record<string, unknown>> = [];
      const items: Array<Record<string, unknown>> = [];
      const orders: Array<Record<string, unknown>> = [];
      const auditLogs: Array<Record<string, unknown>> = [];
      const userSessions: Array<Record<string, unknown>> = [];
      const settingsAndSystem: Array<Record<string, unknown>> = [];
      const rawRecords: Array<{
        key: string;
        prefix: string;
        sizeBytes: number;
        summary: string;
        protected?: boolean;
        value: unknown;
      }> = [];

      const catsCountByRid = new Map<string, number>();
      const itemsCountByRid = new Map<string, number>();
      const ordersCountByRid = new Map<string, number>();
      const restNameByRid = new Map<string, string>();

      for (const [k, v] of Object.entries(allData)) {
        if (!v || typeof v !== 'object') continue;
        const rec = v as Record<string, unknown>;
        if (k.startsWith('restaurants/') && !k.slice('restaurants/'.length).includes('/')) {
          const ridKey = k.slice('restaurants/'.length);
          restNameByRid.set(ridKey, String(rec.n || ridKey));
        }
        const rid = String(rec.rid || '');
        if (k.startsWith('cats/') && rid) catsCountByRid.set(rid, (catsCountByRid.get(rid) || 0) + 1);
        if (k.startsWith('items/') && rid) itemsCountByRid.set(rid, (itemsCountByRid.get(rid) || 0) + 1);
        if (k.startsWith('orders/') && rid) ordersCountByRid.set(rid, (ordersCountByRid.get(rid) || 0) + 1);
      }

      const tgByPhoneKey = new Map<string, TelegramUserRecord>();
      for (const tu of tgUsers) {
        for (const pk of normalizePhoneKeys(tu.phone || tu.normalizedPhone)) {
          tgByPhoneKey.set(pk, tu);
        }
      }
      const findTgForPhoneCandidates = (candidates: Array<unknown>): TelegramUserRecord | undefined => {
        for (const c of candidates) {
          if (typeof c !== 'string' || !c.trim()) continue;
          for (const pk of normalizePhoneKeys(c)) {
            const hit = tgByPhoneKey.get(pk);
            if (hit) return hit;
          }
        }
        return undefined;
      };

      const platformLinkedPhones = new Map<string, string[]>();
      const addPlatformPhoneLabel = (rawPhone: unknown, label: string) => {
        if (typeof rawPhone !== 'string' || !rawPhone.trim()) return;
        for (const pk of normalizePhoneKeys(rawPhone)) {
          const arr = platformLinkedPhones.get(pk) || [];
          if (!arr.includes(label)) arr.push(label);
          platformLinkedPhones.set(pk, arr);
        }
      };

      // Build unified Phone Index across entire DB + Telegram
      type PhoneRef = {
        phone: string;
        sources: Array<{ kind: string; key: string; label: string }>;
        telegramLinked: boolean;
        telegramChatId: string;
        telegramUsername: string;
        protected: boolean;
      };
      const phoneMap = new Map<string, PhoneRef>();
      const ensurePhoneEntry = (rawPhone: unknown) => {
        const clean = String(rawPhone || '').trim();
        if (!clean || clean.length < 7 || !/[\d]{7,}/.test(clean)) return null;
        const keys = normalizePhoneKeys(clean);
        const canonical =
          keys.find((k) => /^07\d{9}$/.test(k)) ||
          keys.find((k) => /^\+964\d+$/.test(k)) ||
          clean.replace(/\s+/g, '');
        let existingKey: string | null = null;
        for (const [mapKey] of phoneMap.entries()) {
          const mKeys = normalizePhoneKeys(mapKey);
          if (mKeys.some((mk) => keys.includes(mk))) {
            existingKey = mapKey;
            break;
          }
        }
        const useKey = existingKey || canonical;
        if (!phoneMap.has(useKey)) {
          phoneMap.set(useKey, {
            phone: useKey,
            sources: [],
            telegramLinked: false,
            telegramChatId: '',
            telegramUsername: '',
            protected: false,
          });
        }
        return phoneMap.get(useKey)!;
      };
      const pushPhoneSource = (pEntry: PhoneRef, kind: string, key: string, label: string) => {
        if (!pEntry.sources.some((s) => s.key === key && s.kind === kind)) {
          pEntry.sources.push({ kind, key, label });
        }
      };

      let totalBytes = 0;

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('telegram_users_db/')) continue;

        let safeRawValue = value;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          if (key.startsWith('accounts/') || key.startsWith('staff/')) {
            const { pw: _pw, passwordHash: _ph, ...restVal } = value as Record<string, unknown>;
            safeRawValue = {
              ...restVal,
              hasPassword: Boolean(_pw || _ph),
            };
          } else if (key === 'settings/telegram_config') {
            const cfg = value as Record<string, unknown>;
            safeRawValue = {
              ...cfg,
              botTokenOverride: cfg.botTokenOverride ? '••••••••' : '',
            };
          }
        }

        let jsonStr = '';
        try {
          jsonStr = JSON.stringify(safeRawValue);
        } catch {
          jsonStr = String(safeRawValue);
        }
        const sizeBytes = Buffer.byteLength(jsonStr, 'utf8');
        totalBytes += sizeBytes;

        const rec = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
        let summary = '';

        if (key.startsWith('accounts/')) {
          const id = key.slice('accounts/'.length);
          const isProtected = id === PROTECTED_OWNER_ACCOUNT_ID || id === 'acc_menu_demo';
          const linkedTg = findTgForPhoneCandidates([rec.phone, rec.ph, rec.projectPhone, rec.em, rec.username]);
          const accName = String(rec.projectName || rec.n || rec.phone || rec.em || rec.username || id);
          const item = {
            key,
            id,
            name: accName,
            phone: String(rec.phone || rec.ph || ''),
            projectPhone: String(rec.projectPhone || ''),
            email: String(rec.em || rec.email || ''),
            rid: String(rec.rid || ''),
            role: rec.admin === true || rec.r === 'admin' ? 'admin' : 'partner',
            active: rec.active !== false,
            authMethod: String(rec.authMethod || 'password'),
            telegramLinked: Boolean(linkedTg || rec.telegramVerified),
            telegramChatId: String(linkedTg?.chatId || rec.telegramChatId || ''),
            createdAt: String(rec.created || rec.createdAt || ''),
            protected: isProtected,
            raw: safeRawValue,
          };
          accounts.push(item);
          summary = accName;

          for (const candidate of [rec.phone, rec.ph, rec.projectPhone, rec.em, rec.username, rec.e, rec.u]) {
            addPlatformPhoneLabel(candidate, accName);
            const pEntry = ensurePhoneEntry(candidate);
            if (pEntry) {
              pushPhoneSource(pEntry, 'account', key, `حساب: ${accName}`);
              if (id === PROTECTED_OWNER_ACCOUNT_ID) pEntry.protected = true;
            }
          }
        } else if (key.startsWith('staff/')) {
          const id = key.slice('staff/'.length);
          const stName = String(rec.name || rec.email || rec.phone || id);
          staff.push({
            key,
            id,
            name: stName,
            phone: String(rec.phone || ''),
            email: String(rec.email || ''),
            roleTitle: String(rec.roleTitle || 'موظف'),
            active: rec.active !== false,
            createdAt: String(rec.createdAt || ''),
            raw: safeRawValue,
          });
          summary = stName;
          for (const candidate of [rec.phone, rec.email]) {
            addPlatformPhoneLabel(candidate, `موظف: ${stName}`);
            const pEntry = ensurePhoneEntry(candidate);
            if (pEntry) {
              pushPhoneSource(pEntry, 'staff', key, `موظف: ${stName}`);
            }
          }
        } else if (key.startsWith('restaurants/') && !key.slice('restaurants/'.length).includes('/')) {
          const id = key.slice('restaurants/'.length);
          const restName = String(rec.n || id);
          restaurants.push({
            key,
            id,
            name: restName,
            owner: String(rec.ow || ''),
            phone: String(rec.ph || ''),
            slug: String(rec.slug || rec.subdomain || ''),
            projectType: String(rec.projectType || 'restaurant'),
            planName: String(rec.p || 'الباقة الاقتصادية'),
            planId: String(rec.planId || 'starter'),
            active: rec.a !== 0,
            done: Number(rec.done || 0),
            isPaid: Boolean(rec.isPaid),
            expiresAt: String(rec.e || ''),
            createdAt: String(rec.createdAt || ''),
            catsCount: catsCountByRid.get(id) || 0,
            itemsCount: itemsCountByRid.get(id) || 0,
            ordersCount: ordersCountByRid.get(id) || 0,
            protected: id === 'demo',
            raw: rec,
          });
          summary = restName;
          for (const candidate of [rec.ph, rec.ow]) {
            addPlatformPhoneLabel(candidate, `مشروع: ${restName}`);
            const pEntry = ensurePhoneEntry(candidate);
            if (pEntry) {
              pushPhoneSource(pEntry, 'restaurant', key, `مشروع: ${restName}`);
            }
          }
        } else if (key.startsWith('cats/')) {
          const id = key.slice('cats/'.length);
          const rid = String(rec.rid || '');
          categories.push({
            key,
            id,
            rid,
            restaurantName: restNameByRid.get(rid) || rid || '—',
            name: String(rec.n || id),
            extra: rec.published === false ? 'مخفي' : 'ظاهر',
            raw: rec,
          });
          summary = String(rec.n || id);
        } else if (key.startsWith('items/')) {
          const id = key.slice('items/'.length);
          const rid = String(rec.rid || '');
          items.push({
            key,
            id,
            rid,
            restaurantName: restNameByRid.get(rid) || rid || '—',
            name: String(rec.n || id),
            extra: `${Number(rec.pr ?? 0).toLocaleString('en-US')} د.ع`,
            raw: rec,
          });
          summary = `${String(rec.n || id)} (${String(rec.pr ?? 0)})`;
        } else if (key.startsWith('orders/')) {
          const id = key.slice('orders/'.length);
          const rid = String(rec.rid || '');
          orders.push({
            key,
            id,
            rid,
            restaurantName: restNameByRid.get(rid) || rid || '—',
            customerName: String(rec.cn || rec.customerName || 'زبون'),
            customerPhone: String(rec.cp || rec.customerPhone || ''),
            total: Number(rec.tot ?? rec.total ?? 0),
            status: String(rec.st || rec.status || 'new'),
            createdAt: String(rec.at || rec.createdAt || ''),
            raw: rec,
          });
          summary = `${String(rec.cn || rec.customerName || 'طلب')} — ${String(rec.tot ?? 0)}`;
        } else if (key.startsWith('logs/')) {
          const id = key.slice('logs/'.length);
          auditLogs.push({
            key,
            id,
            ts: Number(rec.ts || rec.at || 0),
            actor: String(rec.actor || ''),
            action: String(rec.action || id),
            details: String(rec.details || ''),
            type: String(rec.type || 'system'),
          });
          summary = `${String(rec.action || id)} (${String(rec.actor || '')})`;
        } else if (key.startsWith('user_sessions/')) {
          const id = key.slice('user_sessions/'.length);
          const sidVal = String(rec.sid || id);
          userSessions.push({
            key,
            sid: sidVal,
            role: String(rec.role || 'partner'),
            name: String(rec.name || ''),
            phone: String(rec.phone || rec.email || ''),
            rid: String(rec.rid || ''),
            createdAt: rec.createdAt ? new Date(Number(rec.createdAt)).toISOString() : '',
            expiresAt: rec.expiresAt ? new Date(Number(rec.expiresAt)).toISOString() : '',
            isCurrent: Boolean(req.authSession?.sid && req.authSession.sid === sidVal),
          });
          summary = `${String(rec.role || 'session')} — ${String(rec.phone || rec.email || rec.rid || id)}`;
        } else if (key.startsWith('telegram_otp_sessions/')) {
          continue;
        } else {
          summary = key.startsWith('settings/')
            ? key === 'settings/telegram_config'
              ? 'إعدادات بوت تيليجرام'
              : 'إعدادات المنصة'
            : key.startsWith('migrations/')
            ? 'سجل ترحيل قاعدة البيانات'
            : key.startsWith('notes/')
            ? `ملاحظة: ${String(rec.title || key)}`
            : key;
          settingsAndSystem.push({
            key,
            prefix: key.includes('/') ? `${key.split('/')[0]}/` : key,
            sizeBytes,
            summary,
            value: safeRawValue,
          });
        }

        rawRecords.push({
          key,
          prefix: key.includes('/') ? `${key.split('/')[0]}/` : key,
          sizeBytes,
          summary,
          protected:
            key === `accounts/${PROTECTED_OWNER_ACCOUNT_ID}` ||
            key === 'restaurants/demo' ||
            key === 'settings/telegram_config' ||
            Boolean(req.authSession?.sid && key === `user_sessions/${req.authSession.sid}`),
          value: safeRawValue,
        });
      }

      const formattedTelegramUsers = tgUsers.map((tu) => {
        const pEntry = ensurePhoneEntry(tu.phone || tu.normalizedPhone);
        if (pEntry) {
          pushPhoneSource(pEntry, 'telegram', `telegram/${tu.normalizedPhone || tu.phone}`, 'موثق في تيليجرام');
          pEntry.telegramLinked = true;
          pEntry.telegramChatId = String(tu.chatId || '');
          pEntry.telegramUsername = tu.username || '';
        }

        const linkedLabels = new Set<string>();
        for (const pk of normalizePhoneKeys(tu.phone || tu.normalizedPhone)) {
          for (const lbl of platformLinkedPhones.get(pk) || []) {
            linkedLabels.add(lbl);
          }
        }

        return {
          phone: tu.phone,
          normalizedPhone: tu.normalizedPhone || '',
          chatId: String(tu.chatId || ''),
          username: tu.username || '',
          firstName: tu.firstName || '',
          linkedAt: tu.linkedAt ? new Date(tu.linkedAt).toISOString() : '',
          lastSentAt: tu.lastSentAt ? new Date(tu.lastSentAt).toISOString() : '',
          hasPlatformAccount: linkedLabels.size > 0,
          linkedAccountNames: Array.from(linkedLabels),
        };
      });

      auditLogs.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
      userSessions.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      rawRecords.sort((a, b) => a.key.localeCompare(b.key));

      const phonesIndex = Array.from(phoneMap.values()).map((p) => ({
        phone: p.phone,
        sources: p.sources,
        telegramLinked: p.telegramLinked,
        telegramChatId: p.telegramChatId,
        telegramUsername: p.telegramUsername,
        protected: p.protected,
      }));

      return res.json({
        success: true,
        meta: {
          driver: isSupabaseConfigured() ? 'supabase' : 'file-memory',
          connected: true,
          supabaseConfigured: isSupabaseConfigured(),
          supabaseConnected: isSupabaseConfigured(),
          totalKvRecords: rawRecords.length,
          totalBytes,
          fetchedAt: new Date().toISOString(),
        },
        counts: {
          accounts: accounts.length,
          staff: staff.length,
          restaurants: restaurants.length,
          categories: categories.length,
          items: items.length,
          orders: orders.length,
          phones: phonesIndex.length,
          telegramUsers: formattedTelegramUsers.length,
          userSessions: userSessions.length,
          auditLogs: auditLogs.length,
          settingsAndSystem: settingsAndSystem.length,
        },
        sections: {
          accounts,
          staff,
          restaurants,
          categories,
          items,
          orders,
          phonesIndex,
          telegramUsers: formattedTelegramUsers,
          userSessions,
          auditLogs,
          settingsAndSystem,
          rawRecords,
        },
      });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر تحميل بيانات قاعدة البيانات',
      });
    }
  });

  router.delete('/api/admin/database/record', requireAdminOrStaff('canManageDatabase'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const key = String(req.body?.key || req.query.key || '').trim();
      const cascade = req.body?.cascade === true || req.query.cascade === 'true';
      if (!key || !isSafeStoreKey(key)) {
        return res.status(400).json({ success: false, error: 'مفتاح السجل غير صالح' });
      }
      if (key === `accounts/${PROTECTED_OWNER_ACCOUNT_ID}`) {
        return res.status(403).json({ success: false, error: 'لا يمكن حذف حساب المؤسس الرئيسي' });
      }
      if (req.authSession?.sid && key === `user_sessions/${req.authSession.sid}`) {
        return res.status(400).json({ success: false, error: 'لا يمكنك حذف جلسة تسجيل دخولك الحالية' });
      }

      const allData = await readAll(true);
      const targetVal = allData[key] as Record<string, unknown> | undefined;
      const deletedExtra: string[] = [];

      if (isReservedInternalKey(key)) {
        await deleteInternalStoreItem(key);
      } else {
        await deleteRecordPhysicallyFromStore(key);
      }

      if (cascade && targetVal && typeof targetVal === 'object') {
        if (key.startsWith('accounts/') || key.startsWith('restaurants/')) {
          const rid = key.startsWith('restaurants/')
            ? key.slice('restaurants/'.length)
            : String(targetVal.rid || '');
          const accId = key.startsWith('accounts/') ? key.slice('accounts/'.length) : '';
          if (rid && rid !== 'demo') {
            if (key.startsWith('accounts/') && allData[`restaurants/${rid}`]) {
              await deleteRecordPhysicallyFromStore(`restaurants/${rid}`);
              deletedExtra.push(`restaurants/${rid}`);
            }
            for (const [k, v] of Object.entries(allData)) {
              if (!v || typeof v !== 'object') continue;
              const rec = v as Record<string, unknown>;
              if (
                (k.startsWith('cats/') || k.startsWith('items/') || k.startsWith('orders/')) &&
                String(rec.rid || '') === rid
              ) {
                await deleteRecordPhysicallyFromStore(k);
                deletedExtra.push(k);
              } else if (k.startsWith('accounts/') && String(rec.rid || '') === rid && k !== key && k !== `accounts/${PROTECTED_OWNER_ACCOUNT_ID}`) {
                await deleteRecordPhysicallyFromStore(k);
                deletedExtra.push(k);
              }
            }
            await clearAuthSessionsByTarget(rid, accId || undefined).catch(() => {});
          }
        }
      }

      await appendDbAuditLog(
        req,
        'حذف سجل من قاعدة البيانات',
        `المفتاح: ${key}${deletedExtra.length > 0 ? ` (+${deletedExtra.length} سجل مرتبط)` : ''}`,
        'system'
      );

      return res.json({
        success: true,
        deletedKey: key,
        deletedKeys: [key, ...deletedExtra],
        deletedCount: 1 + deletedExtra.length,
        deletedExtraCount: deletedExtra.length,
      });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر حذف السجل',
      });
    }
  });

  router.put('/api/admin/database/record', requireAdminOrStaff('canManageDatabase'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const key = String(req.body?.key || '').trim();
      const value = req.body?.value;
      if (!key || !isSafeStoreKey(key) || isReservedInternalKey(key)) {
        return res.status(400).json({ success: false, error: 'مفتاح السجل غير صالح أو محجوز' });
      }
      if (value === undefined) {
        return res.status(400).json({ success: false, error: 'قيمة السجل مطلوبة' });
      }
      const saved = await upsertRecordInStore(key, value);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || 'تعذر تحديث السجل' });
      }
      await appendDbAuditLog(req, 'تعديل سجل في قاعدة البيانات', `المفتاح: ${key}`, 'system');
      return res.json({ success: true, key, source: saved.source });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر تعديل السجل',
      });
    }
  });

  router.delete('/api/admin/database/phone/:phone', requireAdminOrStaff('canManageDatabase'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const phone = decodeURIComponent(String(req.params.phone || '')).trim();
      const phoneKeys = new Set(normalizePhoneKeys(phone));
      if (phoneKeys.size === 0) {
        return res.status(400).json({ success: false, error: 'رقم الهاتف غير صالح' });
      }
      const matches = (val: unknown): boolean =>
        typeof val === 'string' && val.trim() !== '' && normalizePhoneKeys(val).some((k) => phoneKeys.has(k));

      const allData = await readAll(true);
      const deletedKeys: string[] = [];
      const updatedRests: Record<string, unknown> = {};

      for (const [k, v] of Object.entries(allData)) {
        if (!v || typeof v !== 'object') continue;
        const rec = v as Record<string, unknown>;
        if (k.startsWith('accounts/')) {
          const id = k.slice('accounts/'.length);
          if (id === PROTECTED_OWNER_ACCOUNT_ID || rec.admin === true || rec.r === 'admin') continue;
          if (matches(rec.phone) || matches(rec.projectPhone) || matches(rec.em) || matches(rec.username) || matches(rec.e) || matches(rec.u)) {
            await deleteRecordPhysicallyFromStore(k);
            deletedKeys.push(k);
            if (rec.rid && rec.rid !== 'demo') {
              await clearAuthSessionsByTarget(String(rec.rid), id).catch(() => {});
            }
          }
        } else if (k.startsWith('staff/')) {
          if (matches(rec.phone) || matches(rec.email)) {
            await deleteRecordPhysicallyFromStore(k);
            deletedKeys.push(k);
          }
        } else if (k.startsWith('restaurants/') && !k.slice('restaurants/'.length).includes('/')) {
          if (matches(rec.ph) || matches(rec.ow)) {
            const nextR = {
              ...rec,
              ...(matches(rec.ph) ? { ph: '' } : {}),
              ...(matches(rec.ow) ? { ow: '' } : {}),
            };
            updatedRests[k] = nextR;
          }
        } else if (k.startsWith('user_sessions/') && matches(rec.phone)) {
          if (req.authSession?.sid && k === `user_sessions/${req.authSession.sid}`) continue;
          await deleteInternalStoreItem(k).catch(() => {});
          deletedKeys.push(k);
        }
      }

      if (Object.keys(updatedRests).length > 0) {
        await applyChanges({ put: updatedRests }, false);
      }
      await deleteTelegramUserByPhone(phone).catch(() => {});

      await appendDbAuditLog(
        req,
        'حذف رقم من جذوره',
        `الرقم: ${phone} · السجلات المحذوفة: ${deletedKeys.length}`,
        'system'
      );

      return res.json({
        success: true,
        phone,
        deletedKeysCount: deletedKeys.length,
        clearedRestaurantsCount: Object.keys(updatedRests).length,
      });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر حذف الرقم من قاعدة البيانات',
      });
    }
  });

  router.delete('/api/admin/database/telegram-user/:phone', requireAdminOrStaff('canManageDatabase'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const phone = decodeURIComponent(String(req.params.phone || '')).trim();
      if (!phone) return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب' });
      await deleteTelegramUserByPhone(phone);
      await appendDbAuditLog(req, 'حذف ربط تيليجرام', `الرقم: ${phone}`, 'system');
      return res.json({ success: true, phone });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر حذف ربط تيليجرام',
      });
    }
  });

  router.post('/api/admin/database/bulk-delete', requireAdminOrStaff('canManageDatabase'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const rawKeys = Array.isArray(req.body?.keys) ? (req.body.keys as unknown[]) : [];
      const keys = rawKeys
        .map((k) => String(k || '').trim())
        .filter((k) => isSafeStoreKey(k) && k !== `accounts/${PROTECTED_OWNER_ACCOUNT_ID}`);
      if (keys.length === 0) {
        return res.status(400).json({ success: false, error: 'لم يتم تحديد سجلات صالحة للحذف' });
      }
      let deletedCount = 0;
      for (const k of keys) {
        if (req.authSession?.sid && k === `user_sessions/${req.authSession.sid}`) continue;
        if (isReservedInternalKey(k)) {
          await deleteInternalStoreItem(k);
        } else {
          await deleteRecordPhysicallyFromStore(k);
        }
        deletedCount++;
      }
      await appendDbAuditLog(req, 'حذف جماعي من قاعدة البيانات', `تم حذف ${deletedCount} سجل`, 'system');
      return res.json({
        success: true,
        deletedCount,
        deletedKeys: keys,
        skippedKeys: [],
      });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر تنفيذ الحذف الجماعي',
      });
    }
  });

  // ============================================================================
  // INTERNAL TELEGRAM BOT SETTINGS ROUTES (/api/admin/telegram/*)
  // ============================================================================
  router.get('/api/admin/telegram/settings', requireAdminOrStaff('canManageSettings'), async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const config = await getAdminTelegramConfig();
      return res.json({ success: true, config });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر تحميل إعدادات تيليجرام',
      });
    }
  });

  router.put('/api/admin/telegram/settings', requireAdminOrStaff('canManageSettings'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const config = await updateAdminTelegramConfig({
        enabled: body.enabled !== false,
        botUsername: typeof body.botUsername === 'string' ? body.botUsername : undefined,
        botTokenOverride: typeof body.botTokenOverride === 'string' ? body.botTokenOverride : undefined,
        clearTokenOverride: body.clearTokenOverride === true,
        proxyUrl: typeof body.proxyUrl === 'string' ? body.proxyUrl : undefined,
        welcomeSharePhoneText:
          typeof body.welcomeSharePhoneText === 'string' ? body.welcomeSharePhoneText : undefined,
        verifiedSuccessText:
          typeof body.verifiedSuccessText === 'string' ? body.verifiedSuccessText : undefined,
        orderHeaderText:
          typeof body.orderHeaderText === 'string' ? body.orderHeaderText : undefined,
        orderFooterText:
          typeof body.orderFooterText === 'string' ? body.orderFooterText : undefined,
      });
      await appendDbAuditLog(req, 'تحديث إعدادات بوت تيليجرام', `المعرف: @${config.botUsername}`, 'system');
      return res.json({ success: true, config });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر حفظ إعدادات تيليجرام',
      });
    }
  });

  router.post('/api/admin/telegram/test-connection', requireAdminOrStaff('canManageSettings'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const customToken = typeof req.body?.botToken === 'string' ? req.body.botToken : undefined;
      const result = await testTelegramBotConnection(customToken);
      return res.status(result.ok ? 200 : 400).json(result);
    } catch (err: unknown) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'تعذر اختبار اتصال البوت',
      });
    }
  });

  router.post('/api/admin/telegram/send-test', requireAdminOrStaff('canManageSettings'), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const target = String(req.body?.target || '').trim();
      const message = typeof req.body?.message === 'string' ? req.body.message : undefined;
      const result = await sendTelegramTestMessage(target, message);
      return res.status(result.ok ? 200 : 400).json(result);
    } catch (err: unknown) {
      return res.status(500).json({
        ok: false,
        message: err instanceof Error ? err.message : 'تعذر إرسال الرسالة التجريبية',
      });
    }
  });

  return router;
}
