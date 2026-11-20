/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  formatSupabaseError,
  isSupabaseConfigured,
  isSupabaseNetworkError,
  supabaseDeleteIn,
  supabaseDeleteWhere,
  supabaseSelectAll,
  supabaseSelectByPrefix,
  supabaseSelectOne,
  supabaseUpsert,
} from './supabase.ts';

const DB_FILE = path.resolve(process.cwd(), 'data/db-store.json');
const HMO_BUNDLE_FILE = path.resolve(process.cwd(), 'data/hmo-menux-bundle.json');
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const RESERVED_PREFIXES = [
  'telegram_otp_sessions/',
  'telegram_pending_start/',
  'telegram_msg_lock/',
  'user_sessions/',
  'telegram_users_db/',
  'settings/telegram_config',
  'settings/telegram_poll_state',
];
const SAMPLE_PARTNER_MIGRATION_KEY = 'migrations/purged_sample_partners_v8';
const HMO_MENUX_MIGRATION_KEY = 'migrations/hmo_menux_import_v1';
const PURGE_7833239944_MIGRATION_KEY = 'migrations/purged_7833239944_v3';
const LEGACY_TEST_RESTAURANTS_PURGE_KEY = 'migrations/purged_legacy_test_restaurants_v1';
const LEGACY_EXACT_NAMES = new Set([
  'مطعم تجريبي',
  'فوكس',
  'حمورابي',
  'حمو',
  'كاب برجر',
]);
const SAMPLE_PARTNER_KEYS = [
  'restaurants/1',
  'restaurants/2',
  'restaurants/3',
  'restaurants/4',
  'restaurants/5',
  'restaurants/6',
  'accounts/acc_r1',
  'accounts/acc_r2',
  'accounts/acc_r3',
  'accounts/acc_r4',
  'accounts/acc_r5',
  'accounts/acc_r6',
  'cats/c1',
  'cats/c2',
  'cats/c3',
  'cats/c4',
  'items/i1',
  'items/i2',
  'items/i3',
  'items/i4',
  'items/i5',
  'items/i6',
  'items/i7',
  'items/i8',
  'items/i9',
];

const SAMPLE_RESTAURANT_NAMES = new Set([
  'مطعم الأصالة العراقي',
  'برجر هاوس بغداد',
  'شاورما الشام والأصيل',
  'مطعم وكباب السندباد',
  'كافيه ومقهى ريحان',
  'مطعم دجلة للمأكولات البحرية',
  'مطعم تجريبي',
  'فوكس',
  'حمورابي',
]);

const SAMPLE_PARTNER_PHONES = new Set([
  '07701234567',
  '07802345678',
  '07713456789',
  '07814567890',
  '07725678901',
  '07826789012',
]);

function normalizeDigitsPhone(val: unknown): string {
  const digits = String(val || '').replace(/\D/g, '');
  if (digits.startsWith('964') && digits.length >= 13) {
    return `0${digits.slice(3)}`;
  }
  return digits;
}

function collectSampleKeysToPurge(store: Record<string, unknown>): string[] {
  const keysToDelete = new Set<string>();
  const purgedRids = new Set<string>(['1', '2', '3', '4', '5', '6']);

  for (const sk of SAMPLE_PARTNER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(store, sk)) {
      keysToDelete.add(sk);
    }
  }

  for (const [key, val] of Object.entries(store)) {
    if (!val || typeof val !== 'object') continue;
    const rec = val as Record<string, unknown>;

    if (key.startsWith('restaurants/') && !key.slice('restaurants/'.length).includes('/')) {
      const rid = key.slice('restaurants/'.length);
      if (rid === 'demo') continue;
      const name = String(rec.n || '').trim();
      const ph = normalizeDigitsPhone(rec.ph || rec.ow || '');
      if (SAMPLE_RESTAURANT_NAMES.has(name) || SAMPLE_PARTNER_PHONES.has(ph)) {
        keysToDelete.add(key);
        purgedRids.add(rid);
      }
    }
  }

  for (const [key, val] of Object.entries(store)) {
    if (!val || typeof val !== 'object') continue;
    const rec = val as Record<string, unknown>;

    if (key.startsWith('accounts/')) {
      const id = key.slice('accounts/'.length);
      if (id.startsWith('acc_admin_') || id === 'acc_menu_demo') continue;
      const rid = String(rec.rid || '');
      const projectName = String(rec.projectName || rec.n || '').trim();
      const ph = normalizeDigitsPhone(rec.phone || rec.ph || rec.projectPhone || rec.em || rec.username || '');
      if (purgedRids.has(rid) || SAMPLE_RESTAURANT_NAMES.has(projectName) || SAMPLE_PARTNER_PHONES.has(ph)) {
        keysToDelete.add(key);
      }
    } else if (
      (key.startsWith('cats/') || key.startsWith('items/') || key.startsWith('orders/')) &&
      purgedRids.has(String(rec.rid || ''))
    ) {
      keysToDelete.add(key);
    }
  }

  return Array.from(keysToDelete);
}

function isTarget7833239944(val: unknown): boolean {
  const digits = normalizeDigitsPhone(val);
  return digits === '07833239944' || digits === '7833239944' || digits === '9647833239944';
}

function apply7833239944Purge(store: Record<string, unknown>): {
  changed: boolean;
  deletedKeys: string[];
  updatedEntries: Record<string, unknown>;
} {
  if (store[PURGE_7833239944_MIGRATION_KEY]) {
    return { changed: false, deletedKeys: [], updatedEntries: {} };
  }
  const deletedKeys: string[] = [];
  const updatedEntries: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(store)) {
    if (!val || typeof val !== 'object') continue;
    const rec = val as Record<string, unknown>;

    if (key.startsWith('accounts/')) {
      const isProtectedAdmin =
        key === 'accounts/acc_admin_owner' || rec.admin === true || rec.r === 'admin';
      if (
        !isProtectedAdmin &&
        (isTarget7833239944(rec.phone) ||
          isTarget7833239944(rec.projectPhone) ||
          isTarget7833239944(rec.em) ||
          isTarget7833239944(rec.username) ||
          isTarget7833239944(rec.e) ||
          isTarget7833239944(rec.u))
      ) {
        delete store[key];
        deletedKeys.push(key);
      }
    } else if (key.startsWith('staff/')) {
      if (isTarget7833239944(rec.phone) || isTarget7833239944(rec.email)) {
        delete store[key];
        deletedKeys.push(key);
      }
    } else if (key.startsWith('restaurants/') && !key.slice('restaurants/'.length).includes('/')) {
      if (isTarget7833239944(rec.ph) || isTarget7833239944(rec.ow)) {
        const cleaned = {
          ...rec,
          ...(isTarget7833239944(rec.ph) ? { ph: '' } : {}),
          ...(isTarget7833239944(rec.ow) ? { ow: '' } : {}),
        };
        store[key] = cleaned;
        updatedEntries[key] = cleaned;
      }
    } else if (key.startsWith('telegram_otp_sessions/') && isTarget7833239944(rec.phone)) {
      delete store[key];
      deletedKeys.push(key);
    } else if (key.startsWith('user_sessions/') && isTarget7833239944(rec.phone)) {
      delete store[key];
      deletedKeys.push(key);
    }
  }

  store[PURGE_7833239944_MIGRATION_KEY] = true;
  updatedEntries[PURGE_7833239944_MIGRATION_KEY] = true;
  return { changed: true, deletedKeys, updatedEntries };
}

function isLegacyRestaurantRecord(rid: string, rec: Record<string, unknown>): boolean {
  if (rid === 'demo' || rid === 'r_hmo_menux') return false;
  const name = String(rec.n || '').trim();
  const ph = normalizeDigitsPhone(rec.ph || rec.ow || '');
  if (SAMPLE_RESTAURANT_NAMES.has(name) || SAMPLE_PARTNER_PHONES.has(ph)) return true;
  if (LEGACY_EXACT_NAMES.has(name)) return true;
  return false;
}

function applyLegacyTestRestaurantsPurge(store: Record<string, unknown>): {
  changed: boolean;
  deletedKeys: string[];
  updatedEntries: Record<string, unknown>;
} {
  if (store[LEGACY_TEST_RESTAURANTS_PURGE_KEY]) {
    return { changed: false, deletedKeys: [], updatedEntries: {} };
  }
  const deletedKeys: string[] = [];
  const updatedEntries: Record<string, unknown> = {};
  const purgedRids = new Set<string>();

  for (const [key, val] of Object.entries(store)) {
    if (!key.startsWith('restaurants/') || key.slice('restaurants/'.length).includes('/') || !val || typeof val !== 'object') {
      continue;
    }
    const rid = key.slice('restaurants/'.length);
    const rec = val as Record<string, unknown>;
    if (isLegacyRestaurantRecord(rid, rec)) {
      purgedRids.add(rid);
      delete store[key];
      deletedKeys.push(key);
    }
  }

  // Also catch any child branches whose parentRid was purged
  if (purgedRids.size > 0) {
    for (const [key, val] of Object.entries(store)) {
      if (!key.startsWith('restaurants/') || key.slice('restaurants/'.length).includes('/') || !val || typeof val !== 'object') {
        continue;
      }
      const rid = key.slice('restaurants/'.length);
      if (rid === 'demo' || rid === 'r_hmo_menux') continue;
      const rec = val as Record<string, unknown>;
      if (rec.parentRid && purgedRids.has(String(rec.parentRid))) {
        purgedRids.add(rid);
        delete store[key];
        deletedKeys.push(key);
      }
    }
  }

  if (purgedRids.size > 0) {
    for (const [key, val] of Object.entries(store)) {
      if (!val || typeof val !== 'object') continue;
      const rec = val as Record<string, unknown>;
      if (key.startsWith('accounts/')) {
        const id = key.slice('accounts/'.length);
        if (id.startsWith('acc_admin_') || id === 'acc_menu_demo' || rec.admin === true || rec.r === 'admin') {
          continue;
        }
        if (purgedRids.has(String(rec.rid || ''))) {
          delete store[key];
          deletedKeys.push(key);
        }
      } else if (
        (key.startsWith('cats/') || key.startsWith('items/') || key.startsWith('orders/') || key.startsWith('reviews/')) &&
        purgedRids.has(String(rec.rid || ''))
      ) {
        delete store[key];
        deletedKeys.push(key);
      }
    }
  }

  // Ensure restaurants/demo (Cap Burger) does not retain old 07833239944 telegram/phone bindings
  const demoRec = store['restaurants/demo'];
  if (demoRec && typeof demoRec === 'object' && !Array.isArray(demoRec)) {
    const rec = demoRec as Record<string, unknown>;
    const socialObj = rec.social && typeof rec.social === 'object' ? (rec.social as Record<string, unknown>) : {};
    const needsDemoClean =
      isTarget7833239944(rec.ph) ||
      isTarget7833239944(rec.ow) ||
      isTarget7833239944(rec.telegramPhone) ||
      isTarget7833239944(socialObj.whatsapp);
    if (needsDemoClean) {
      const cleanedDemo: Record<string, unknown> = {
        ...rec,
        ...(isTarget7833239944(rec.ph) ? { ph: '07724799679' } : {}),
        ...(isTarget7833239944(rec.ow) ? { ow: '' } : {}),
        ...(isTarget7833239944(rec.telegramPhone)
          ? { telegramPhone: '', telegramChatId: '', telegramUsername: '' }
          : {}),
        ...(isTarget7833239944(socialObj.whatsapp)
          ? { social: { ...socialObj, whatsapp: '9647724799679' } }
          : {}),
      };
      store['restaurants/demo'] = cleanedDemo;
      updatedEntries['restaurants/demo'] = cleanedDemo;
    }
  }

  store[LEGACY_TEST_RESTAURANTS_PURGE_KEY] = true;
  updatedEntries[LEGACY_TEST_RESTAURANTS_PURGE_KEY] = true;
  return { changed: true, deletedKeys, updatedEntries };
}

interface HmoMenuxBundle {
  targetPhones: string[];
  defaultAccount?: Record<string, unknown>;
  restaurant: Record<string, unknown>;
  cats: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
}

async function applyHmoMenuxMigrationInRemote(
  store: Record<string, unknown>
): Promise<boolean> {
  if (store[HMO_MENUX_MIGRATION_KEY]) return false;
  if (!fs.existsSync(HMO_BUNDLE_FILE)) return false;

  let bundle: HmoMenuxBundle;
  try {
    bundle = JSON.parse(fs.readFileSync(HMO_BUNDLE_FILE, 'utf-8')) as HmoMenuxBundle;
  } catch (e) {
    console.warn('[Migration HMO] Failed to parse bundle:', e);
    return false;
  }
  if (!bundle?.restaurant || !Array.isArray(bundle.cats) || !Array.isArray(bundle.items)) {
    return false;
  }

  const targetDigits = new Set((bundle.targetPhones || ['07722213811']).map((p) => normalizeDigitsPhone(p)));
  const matchesTargetPhone = (val: unknown): boolean => {
    const d = normalizeDigitsPhone(val);
    return Boolean(d && targetDigits.has(d));
  };

  let existingAccKey: string | null = null;
  let existingAcc: Record<string, unknown> | null = null;
  let existingRid: string | null = null;

  for (const [k, v] of Object.entries(store)) {
    if (!k.startsWith('accounts/') || !v || typeof v !== 'object') continue;
    const rec = v as Record<string, unknown>;
    if (
      matchesTargetPhone(rec.phone) ||
      matchesTargetPhone(rec.ph) ||
      matchesTargetPhone(rec.projectPhone) ||
      matchesTargetPhone(rec.em) ||
      matchesTargetPhone(rec.username) ||
      matchesTargetPhone(rec.e) ||
      matchesTargetPhone(rec.u)
    ) {
      existingAccKey = k;
      existingAcc = rec;
      if (rec.rid && String(rec.rid) !== 'demo') {
        existingRid = String(rec.rid);
      }
      break;
    }
  }

  if (!existingRid) {
    for (const [k, v] of Object.entries(store)) {
      if (!k.startsWith('restaurants/') || k.slice('restaurants/'.length).includes('/') || !v || typeof v !== 'object') continue;
      const ridCand = k.slice('restaurants/'.length);
      if (ridCand === 'demo') continue;
      const rec = v as Record<string, unknown>;
      if (matchesTargetPhone(rec.ph)) {
        existingRid = ridCand;
        break;
      }
    }
  }

  const targetRid = existingRid || String(bundle.restaurant.id || 'r_hmo_menux');
  const existingRest = (store[`restaurants/${targetRid}`] as Record<string, unknown> | undefined) || undefined;

  // Check if slug 'hmo' is available (not taken by a different restaurant)
  const desiredSlug = String(bundle.restaurant.slug || 'hmo').trim();
  const slugConflict = Object.entries(store).some(([k, v]) => {
    if (!k.startsWith('restaurants/') || k === `restaurants/${targetRid}` || !v || typeof v !== 'object') return false;
    const r = v as Record<string, unknown>;
    return String(r.slug || '').trim().toLowerCase() === desiredSlug.toLowerCase() ||
      String(r.subdomain || '').trim().toLowerCase() === desiredSlug.toLowerCase();
  });
  const resolvedSlug = existingRest?.slug ? String(existingRest.slug) : (!slugConflict ? desiredSlug : undefined);
  const resolvedSubdomain = existingRest?.subdomain ? String(existingRest.subdomain) : (!slugConflict ? desiredSlug : undefined);

  const upsertEntries: Record<string, unknown> = {};
  const deleteKeys: string[] = [];

  // Delete old categories & items for targetRid so the menu is cleanly replaced
  for (const [k, v] of Object.entries(store)) {
    if ((k.startsWith('cats/') || k.startsWith('items/')) && v && typeof v === 'object') {
      if (String((v as Record<string, unknown>).rid || '') === targetRid) {
        delete store[k];
        deleteKeys.push(k);
      }
    }
  }

  const mergedRest: Record<string, unknown> = {
    ...bundle.restaurant,
    ...(existingRest ? {
      createdAt: existingRest.createdAt || bundle.restaurant.createdAt,
      p: existingRest.p || bundle.restaurant.p,
      planId: existingRest.planId || bundle.restaurant.planId,
      isPaid: existingRest.isPaid !== undefined ? existingRest.isPaid : bundle.restaurant.isPaid,
      e: existingRest.e || bundle.restaurant.e,
      o: existingRest.o ?? 0,
      v: existingRest.v ?? 0,
      ...(existingRest.reviews !== undefined ? { reviews: existingRest.reviews } : {}),
    } : {}),
    id: targetRid,
    done: 1,
    a: 1,
    ...(resolvedSlug ? { slug: resolvedSlug } : {}),
    ...(resolvedSubdomain ? { subdomain: resolvedSubdomain } : {}),
  };

  store[`restaurants/${targetRid}`] = mergedRest;
  upsertEntries[`restaurants/${targetRid}`] = mergedRest;

  if (existingAccKey && existingAcc) {
    const updatedAcc: Record<string, unknown> = {
      ...existingAcc,
      rid: targetRid,
      projectName: String(mergedRest.n || existingAcc.projectName || 'حمو – Hmo'),
      projectType: String(mergedRest.projectType || existingAcc.projectType || 'restaurant'),
    };
    store[existingAccKey] = updatedAcc;
    upsertEntries[existingAccKey] = updatedAcc;
  } else if (bundle.defaultAccount) {
    const accId = String(bundle.defaultAccount.id || 'acc_hmo_07722213811');
    const accRec = { ...bundle.defaultAccount, rid: targetRid };
    store[`accounts/${accId}`] = accRec;
    upsertEntries[`accounts/${accId}`] = accRec;
  }

  for (const cat of bundle.cats) {
    const cid = String(cat.id || '');
    if (!cid) continue;
    const catRec = { ...cat, rid: targetRid };
    store[`cats/${cid}`] = catRec;
    upsertEntries[`cats/${cid}`] = catRec;
  }

  for (const item of bundle.items) {
    const iid = String(item.id || '');
    if (!iid) continue;
    const itemRec = { ...item, rid: targetRid };
    store[`items/${iid}`] = itemRec;
    upsertEntries[`items/${iid}`] = itemRec;
  }

  store[HMO_MENUX_MIGRATION_KEY] = true;
  upsertEntries[HMO_MENUX_MIGRATION_KEY] = true;

  if (deleteKeys.length > 0) {
    await supabaseDeleteIn('menuplus_kv', 'key', deleteKeys);
  }
  const nowIso = new Date().toISOString();
  const rowsToUpsert = Object.entries(upsertEntries).map(([key, value]) => ({
    key,
    value,
    updated_at: nowIso,
  }));
  await supabaseUpsert('menuplus_kv', rowsToUpsert, 'key');
  console.log(`[Migration HMO] Synced menu (${bundle.cats.length} cats, ${bundle.items.length} items) to rid=${targetRid}`);
  return true;
}

let memoryStore: Record<string, unknown> = Object.create(null);
let isFileLoaded = false;
let hasHydratedSupabase = false;
let lastSupabaseSyncAt = 0;
let lastSupabaseErrorAt = 0;
let lastSupabaseWarnLoggedAt = 0;
let activeSyncPromise: Promise<void> | null = null;
const SUPABASE_SYNC_TTL_MS = 3000;
const SUPABASE_ERROR_BACKOFF_MS = 30_000;
const SUPABASE_LOG_THROTTLE_MS = 300_000;

interface KvRow {
  key: string;
  value: unknown;
  updated_at?: string;
}

export function isReservedInternalKey(key: string): boolean {
  return RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function isSafeStoreKey(key: string): boolean {
  if (typeof key !== 'string' || key.length === 0 || key.length > 256) return false;
  if (key.includes('..') || /[\x00-\x1f\x7f]/.test(key)) return false;
  const segments = key.split('/');
  return segments.every((seg) => seg.length > 0 && !DANGEROUS_KEYS.has(seg));
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function writeFileAtomicSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function loadStoreFromFile(): Record<string, unknown> {
  if (isFileLoaded) return memoryStore;
  const fresh: Record<string, unknown> = Object.create(null);
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (isSafeStoreKey(k)) {
            fresh[k] = v;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Store] Failed to read db file:', e);
  }
  let removedSamples = false;
  for (const sampleKey of collectSampleKeysToPurge(fresh)) {
    if (Object.prototype.hasOwnProperty.call(fresh, sampleKey)) {
      delete fresh[sampleKey];
      removedSamples = true;
    }
  }
  if (!fresh[SAMPLE_PARTNER_MIGRATION_KEY]) {
    fresh[SAMPLE_PARTNER_MIGRATION_KEY] = true;
    removedSamples = true;
  }
  const purgeRes = apply7833239944Purge(fresh);
  if (purgeRes.changed) {
    removedSamples = true;
  }
  const legacyPurgeRes = applyLegacyTestRestaurantsPurge(fresh);
  if (legacyPurgeRes.changed) {
    removedSamples = true;
  }
  memoryStore = fresh;
  isFileLoaded = true;
  if (removedSamples) {
    persistStoreToFile();
  }
  return memoryStore;
}

let pendingFileWriteTimer: ReturnType<typeof setTimeout> | null = null;
let fileWriteQueue: Promise<void> = Promise.resolve();

function persistStoreToFile(): void {
  if (pendingFileWriteTimer) {
    clearTimeout(pendingFileWriteTimer);
  }
  pendingFileWriteTimer = setTimeout(() => {
    pendingFileWriteTimer = null;
    const plain: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(memoryStore)) {
      if (isSafeStoreKey(k)) {
        plain[k] = v;
      }
    }
    const content = JSON.stringify(plain);
    fileWriteQueue = fileWriteQueue
      .then(async () => {
        const dir = path.dirname(DB_FILE);
        await fs.promises.mkdir(dir, { recursive: true });
        const tmpPath = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
        await fs.promises.writeFile(tmpPath, content, 'utf-8');
        await fs.promises.rename(tmpPath, DB_FILE);
      })
      .catch((e) => {
        console.warn('[Store] Failed to write db file:', e);
      });
  }, 60);
}

function logSupabaseSyncNotice(err: unknown): void {
  if (isSupabaseNetworkError(err)) {
    // Offline / DNS-blocked environments fall back cleanly to local store;
    // status is surfaced structurally via /api/db-status without spamming server logs.
    return;
  }
  const now = Date.now();
  if (now - lastSupabaseWarnLoggedAt < SUPABASE_LOG_THROTTLE_MS) return;
  lastSupabaseWarnLoggedAt = now;
  console.warn('[Supabase KV] Unexpected response, using local store fallback:', formatSupabaseError(err));
}

async function syncFromSupabase(force = false): Promise<void> {
  loadStoreFromFile();
  if (!isSupabaseConfigured()) return;

  const now = Date.now();
  if (!force && hasHydratedSupabase && now - lastSupabaseSyncAt < SUPABASE_SYNC_TTL_MS) {
    return;
  }
  if (!force && lastSupabaseErrorAt && now - lastSupabaseErrorAt < SUPABASE_ERROR_BACKOFF_MS) {
    return;
  }

  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    try {
      const rows = await supabaseSelectAll<KvRow>('menuplus_kv', 'key,value');

      if (rows.length === 0 && !hasHydratedSupabase) {
        // Bootstrap Supabase menuplus_kv from local seed file on very first run
        const seedEntries = Object.entries(memoryStore).filter(
          ([k]) => isSafeStoreKey(k) && !isReservedInternalKey(k)
        );
        if (seedEntries.length > 0) {
          const timestamp = new Date().toISOString();
          await supabaseUpsert(
            'menuplus_kv',
            seedEntries.map(([key, value]) => ({ key, value, updated_at: timestamp })),
            'key'
          );
          console.log(`[Supabase KV] Bootstrapped ${seedEntries.length} initial records into menuplus_kv`);
        }
      } else {
        const nextStore: Record<string, unknown> = Object.create(null);
        for (const row of rows) {
          if (row && typeof row.key === 'string' && isSafeStoreKey(row.key)) {
            nextStore[row.key] = row.value;
          }
        }
        const sampleKeysInRemote = collectSampleKeysToPurge(nextStore);
        if (sampleKeysInRemote.length > 0 || !nextStore[SAMPLE_PARTNER_MIGRATION_KEY]) {
          for (const sampleKey of sampleKeysInRemote) {
            delete nextStore[sampleKey];
          }
          nextStore[SAMPLE_PARTNER_MIGRATION_KEY] = true;
          if (sampleKeysInRemote.length > 0) {
            await supabaseDeleteIn('menuplus_kv', 'key', sampleKeysInRemote);
          }
          await supabaseUpsert(
            'menuplus_kv',
            [{ key: SAMPLE_PARTNER_MIGRATION_KEY, value: true, updated_at: new Date().toISOString() }],
            'key'
          );
        }
        await applyHmoMenuxMigrationInRemote(nextStore);
        const remotePurge = apply7833239944Purge(nextStore);
        if (remotePurge.changed) {
          if (remotePurge.deletedKeys.length > 0) {
            await supabaseDeleteIn('menuplus_kv', 'key', remotePurge.deletedKeys);
          }
          const nowIso = new Date().toISOString();
          await supabaseUpsert(
            'menuplus_kv',
            Object.entries(remotePurge.updatedEntries).map(([key, value]) => ({
              key,
              value,
              updated_at: nowIso,
            })),
            'key'
          );
        }
        const remoteLegacyPurge = applyLegacyTestRestaurantsPurge(nextStore);
        if (remoteLegacyPurge.changed) {
          if (remoteLegacyPurge.deletedKeys.length > 0) {
            await supabaseDeleteIn('menuplus_kv', 'key', remoteLegacyPurge.deletedKeys);
          }
          const nowIso = new Date().toISOString();
          await supabaseUpsert(
            'menuplus_kv',
            Object.entries(remoteLegacyPurge.updatedEntries).map(([key, value]) => ({
              key,
              value,
              updated_at: nowIso,
            })),
            'key'
          );
        }
        memoryStore = nextStore;
        persistStoreToFile();
      }

      hasHydratedSupabase = true;
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
    } catch (err: unknown) {
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

export async function readAll(includeReserved = false): Promise<Record<string, unknown>> {
  await syncFromSupabase(false);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(memoryStore)) {
    if (!includeReserved && isReservedInternalKey(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function readPrefixFromStore<T = Record<string, unknown>>(
  prefix: string
): Promise<{
  items: Array<T & { id: string }>;
  source: 'supabase' | 'file-memory';
  supabaseError?: string;
}> {
  loadStoreFromFile();

  const readLocal = () => {
    const items: Array<T & { id: string }> = [];
    for (const [k, v] of Object.entries(memoryStore)) {
      if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/') && v && typeof v === 'object') {
        items.push({ ...(v as T), id: k.slice(prefix.length) });
      }
    }
    return items;
  };

  const now = Date.now();
  const inErrorBackoff = Boolean(lastSupabaseErrorAt && now - lastSupabaseErrorAt < SUPABASE_ERROR_BACKOFF_MS);

  if (isSupabaseConfigured() && !inErrorBackoff) {
    if (!hasHydratedSupabase) {
      await syncFromSupabase(false);
    }
    try {
      const rows = await supabaseSelectByPrefix<KvRow>('menuplus_kv', 'key', prefix, 'key,value');
      // Refresh local cache entries for this prefix so memory + disk stay strictly in sync
      for (const existingKey of Object.keys(memoryStore)) {
        if (existingKey.startsWith(prefix)) {
          delete memoryStore[existingKey];
        }
      }
      const items: Array<T & { id: string }> = [];
      const prefixSampleKeys: string[] = [];
      for (const row of rows) {
        if (
          row &&
          typeof row.key === 'string' &&
          row.key.startsWith(prefix) &&
          isSafeStoreKey(row.key) &&
          row.value &&
          typeof row.value === 'object'
        ) {
          memoryStore[row.key] = row.value;
        }
      }
      for (const sk of collectSampleKeysToPurge(memoryStore)) {
        if (sk.startsWith(prefix)) {
          delete memoryStore[sk];
          prefixSampleKeys.push(sk);
        }
      }
      if (prefixSampleKeys.length > 0) {
        await supabaseDeleteIn('menuplus_kv', 'key', prefixSampleKeys).catch(() => {});
      }
      for (const [k, v] of Object.entries(memoryStore)) {
        if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/') && v && typeof v === 'object') {
          items.push({ ...(v as T), id: k.slice(prefix.length) });
        }
      }
      persistStoreToFile();
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
      return { items, source: 'supabase' };
    } catch (err: unknown) {
      const errMsg = formatSupabaseError(err);
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
      return { items: readLocal(), source: 'file-memory', supabaseError: errMsg };
    }
  }

  return { items: readLocal(), source: 'file-memory' };
}

export async function upsertRecordInStore<T = Record<string, unknown>>(
  key: string,
  value: T
): Promise<{
  ok: boolean;
  persistedToSupabase: boolean;
  source: 'supabase' | 'file-memory';
  error?: string;
}> {
  if (!isSafeStoreKey(key) || isReservedInternalKey(key)) {
    return { ok: false, persistedToSupabase: false, source: 'file-memory', error: 'Invalid record key' };
  }

  loadStoreFromFile();

  if (isSupabaseConfigured()) {
    try {
      await supabaseUpsert(
        'menuplus_kv',
        [{ key, value, updated_at: new Date().toISOString() }],
        'key'
      );
      memoryStore[key] = value;
      persistStoreToFile();
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
      return { ok: true, persistedToSupabase: true, source: 'supabase' };
    } catch (err: unknown) {
      const errMsg = formatSupabaseError(err);
      if (!isSupabaseNetworkError(err)) {
        return { ok: false, persistedToSupabase: false, source: 'supabase', error: errMsg };
      }
      // Network unreachable in offline/sandbox container: persist locally & surface notice
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
      memoryStore[key] = value;
      persistStoreToFile();
      return { ok: true, persistedToSupabase: false, source: 'file-memory', error: errMsg };
    }
  }

  memoryStore[key] = value;
  persistStoreToFile();
  return { ok: true, persistedToSupabase: false, source: 'file-memory' };
}

export async function deleteRecordPhysicallyFromStore(key: string): Promise<{
  ok: boolean;
  deletedFromSupabase: boolean;
  deletedFromLocal: boolean;
  source: 'supabase' | 'file-memory';
  error?: string;
}> {
  if (!isSafeStoreKey(key) || isReservedInternalKey(key)) {
    return {
      ok: false,
      deletedFromSupabase: false,
      deletedFromLocal: false,
      source: 'file-memory',
      error: 'Invalid record key',
    };
  }

  loadStoreFromFile();

  if (isSupabaseConfigured()) {
    try {
      const deletedRows = await supabaseDeleteWhere('menuplus_kv', 'key', key);
      const existedLocally = Object.prototype.hasOwnProperty.call(memoryStore, key);
      if (existedLocally) {
        delete memoryStore[key];
        persistStoreToFile();
      }
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
      return {
        ok: true,
        deletedFromSupabase: deletedRows.length > 0,
        deletedFromLocal: existedLocally,
        source: 'supabase',
      };
    } catch (err: unknown) {
      const errMsg = formatSupabaseError(err);
      if (!isSupabaseNetworkError(err)) {
        return {
          ok: false,
          deletedFromSupabase: false,
          deletedFromLocal: false,
          source: 'supabase',
          error: errMsg,
        };
      }
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
      const existedLocally = Object.prototype.hasOwnProperty.call(memoryStore, key);
      if (existedLocally) {
        delete memoryStore[key];
        persistStoreToFile();
      }
      return {
        ok: true,
        deletedFromSupabase: false,
        deletedFromLocal: existedLocally,
        source: 'file-memory',
        error: errMsg,
      };
    }
  }

  const existedLocally = Object.prototype.hasOwnProperty.call(memoryStore, key);
  if (existedLocally) {
    delete memoryStore[key];
    persistStoreToFile();
  }
  return {
    ok: true,
    deletedFromSupabase: false,
    deletedFromLocal: existedLocally,
    source: 'file-memory',
  };
}

export async function getInternalStoreItem<T = unknown>(key: string): Promise<T | null> {
  if (!isSafeStoreKey(key)) return null;
  loadStoreFromFile();

  const now = Date.now();
  const inErrorBackoff = Boolean(lastSupabaseErrorAt && now - lastSupabaseErrorAt < SUPABASE_ERROR_BACKOFF_MS);

  if (isSupabaseConfigured() && !inErrorBackoff) {
    try {
      const row = await supabaseSelectOne<KvRow>('menuplus_kv', 'key', key, 'key,value');
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
      if (row) {
        memoryStore[key] = row.value;
        persistStoreToFile();
        return row.value as T;
      }
      if (Object.prototype.hasOwnProperty.call(memoryStore, key)) {
        delete memoryStore[key];
        persistStoreToFile();
      }
      return null;
    } catch (err: unknown) {
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
    }
  }

  return Object.prototype.hasOwnProperty.call(memoryStore, key)
    ? (memoryStore[key] as T)
    : null;
}

export async function setInternalStoreItem(key: string, value: unknown): Promise<void> {
  await applyChanges({ put: { [key]: value } }, true);
}

export async function deleteInternalStoreItem(key: string): Promise<void> {
  await applyChanges({ del: [key] }, true);
}

export async function applyChanges(
  diff: {
    put?: Record<string, unknown>;
    del?: string[];
  },
  allowReserved = false
): Promise<{ persistedToSupabase: boolean }> {
  loadStoreFromFile();
  let changed = false;
  const upsertRows: Array<{ key: string; value: unknown; updated_at: string }> = [];
  const deleteKeys: string[] = [];
  const nowIso = new Date().toISOString();

  if (diff.put && isPlainObject(diff.put)) {
    for (const [k, v] of Object.entries(diff.put)) {
      if (!isSafeStoreKey(k)) continue;
      if (!allowReserved && isReservedInternalKey(k)) continue;
      memoryStore[k] = v;
      upsertRows.push({ key: k, value: v, updated_at: nowIso });
      changed = true;
    }
  }

  if (Array.isArray(diff.del)) {
    for (const k of diff.del) {
      if (typeof k !== 'string' || !isSafeStoreKey(k)) continue;
      if (!allowReserved && isReservedInternalKey(k)) continue;
      if (Object.prototype.hasOwnProperty.call(memoryStore, k)) {
        delete memoryStore[k];
        changed = true;
      }
      deleteKeys.push(k);
    }
  }

  if (changed || deleteKeys.length > 0) {
    persistStoreToFile();
  }

  let persistedToSupabase = false;
  if (isSupabaseConfigured() && (upsertRows.length > 0 || deleteKeys.length > 0)) {
    try {
      if (upsertRows.length > 0) {
        await supabaseUpsert('menuplus_kv', upsertRows, 'key');
      }
      if (deleteKeys.length > 0) {
        await supabaseDeleteIn('menuplus_kv', 'key', deleteKeys);
      }
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
      persistedToSupabase = true;
    } catch (err: unknown) {
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
    }
  }

  return { persistedToSupabase };
}

export async function handleDbRequest(
  method: string,
  body?: unknown
): Promise<{ status: number; json: unknown }> {
  try {
    if (method === 'GET') {
      const publicData = await readAll(false);
      return { status: 200, json: publicData };
    }
    if (method === 'POST') {
      if (!isPlainObject(body)) {
        return { status: 400, json: { error: 'Invalid database payload' } };
      }
      const payload = body as {
        put?: Record<string, unknown>;
        del?: string[];
      };
      const result = await applyChanges(payload, false);
      const count = Object.keys(memoryStore).filter((k) => !isReservedInternalKey(k)).length;
      return {
        status: 200,
        json: {
          ok: true,
          count,
          driver: isSupabaseConfigured() ? 'supabase' : 'file-memory',
          persistedToSupabase: result.persistedToSupabase,
        },
      };
    }
    return { status: 405, json: { error: 'Method not allowed' } };
  } catch (err: any) {
    return { status: 500, json: { error: err?.message || 'Database error' } };
  }
}
