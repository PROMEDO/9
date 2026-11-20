// server.ts
import "dotenv/config";
import crypto4 from "node:crypto";
import express2 from "express";
import fs5 from "node:fs";
import path5 from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

// server/neon-store.ts
import fs from "node:fs";
import path from "node:path";

// server/supabase.ts
var DEFAULT_TIMEOUT_MS = 1e4;
function extractSupabaseRefFromHostAndUser(host, username) {
  const directMatch = host.match(/^db\.([a-z0-9-]+)\.supabase\.(?:co|net)$/i);
  if (directMatch?.[1]) return directMatch[1];
  const poolerUserMatch = username.match(/^postgres\.([a-z0-9-]+)$/i);
  if (poolerUserMatch?.[1] && /supabase\.com$/i.test(host)) {
    return poolerUserMatch[1];
  }
  return void 0;
}
function getDatabaseUrlInfo() {
  const raw = String(process.env.DATABASE_URL || "").trim();
  if (!raw || raw === "MY_DATABASE_URL") {
    return { configured: false, valid: false };
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      return {
        configured: true,
        valid: false,
        error: "DATABASE_URL must start with postgresql:// or postgres://"
      };
    }
    const host = parsed.hostname;
    const port = parsed.port ? Number(parsed.port) : 5432;
    const database = parsed.pathname.replace(/^\/+/, "") || "postgres";
    const username = decodeURIComponent(parsed.username || "");
    if (!host) {
      return { configured: true, valid: false, error: "Missing host in DATABASE_URL" };
    }
    return {
      configured: true,
      valid: true,
      host,
      port: Number.isFinite(port) ? port : 5432,
      database,
      projectRef: extractSupabaseRefFromHostAndUser(host, username)
    };
  } catch {
    const match = raw.match(/^postgres(?:ql)?:\/\/([^:@\s]+):[^@\s]*@([^:/\s]+)(?::(\d+))?\/([^?\s]+)/i);
    if (!match) {
      return {
        configured: true,
        valid: false,
        error: "Invalid DATABASE_URL connection string format"
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
      projectRef: extractSupabaseRefFromHostAndUser(host, username)
    };
  }
}
function resolveSupabaseUrl() {
  const explicitUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
  if (explicitUrl && explicitUrl !== "MY_SUPABASE_URL") {
    return explicitUrl;
  }
  const dbInfo = getDatabaseUrlInfo();
  if (dbInfo.valid && dbInfo.projectRef) {
    return `https://${dbInfo.projectRef}.supabase.co`;
  }
  return "";
}
function getSupabaseConfig() {
  const url = resolveSupabaseUrl();
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !secretKey || secretKey === "MY_SUPABASE_SECRET_KEY") {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
  } catch {
    return null;
  }
  return { url, secretKey };
}
function getSupabasePublicConfig() {
  const url = resolveSupabaseUrl();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey || anonKey === "MY_SUPABASE_ANON_KEY") {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
  } catch {
    return null;
  }
  return { url, anonKey };
}
function isSupabaseConfigured() {
  return getSupabaseConfig() !== null;
}
function formatSupabaseError(err) {
  if (err instanceof Error) {
    const cause = err.cause;
    if (cause?.code || cause?.message) {
      return `${err.message} (${cause.code || cause.message})`;
    }
    return err.message;
  }
  return String(err || "Supabase error");
}
function isSupabaseNetworkError(err) {
  const msg = formatSupabaseError(err).toLowerCase();
  return msg.includes("fetch failed") || msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("etimedout") || msg.includes("eai_again") || msg.includes("network") || msg.includes("abort");
}
function buildHeaders(secretKey, extra) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}
async function supabaseSelectAll(table, select = "*", pageSize = 1e3) {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error("Supabase is not configured");
  }
  const allRows = [];
  let offset = 0;
  while (true) {
    const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(select)}`;
    const res = await fetch(endpoint, {
      method: "GET",
      headers: buildHeaders(cfg.secretKey, {
        Range: `${offset}-${offset + pageSize - 1}`,
        "Range-Unit": "items"
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Supabase SELECT ${table} failed (${res.status}): ${errText}`);
    }
    const batch = await res.json();
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
async function supabaseSelectByPrefix(table, column, prefix, select = "*") {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error("Supabase is not configured");
  }
  const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?${encodeURIComponent(
    column
  )}=like.${encodeURIComponent(prefix)}*&select=${encodeURIComponent(select)}`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: buildHeaders(cfg.secretKey),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase PREFIX SELECT ${table} failed (${res.status}): ${errText}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}
async function supabaseSelectOne(table, column, value, select = "*") {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return null;
  }
  const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?${encodeURIComponent(column)}=eq.${encodeURIComponent(
    value
  )}&select=${encodeURIComponent(select)}&limit=1`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: buildHeaders(cfg.secretKey),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase SELECT ONE ${table} failed (${res.status}): ${errText}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}
async function supabaseUpsert(table, rows, onConflict, chunkSize = 200) {
  const cfg = getSupabaseConfig();
  if (!cfg || rows.length === 0) {
    return;
  }
  const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?on_conflict=${encodeURIComponent(onConflict)}`;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(cfg.secretKey, {
        Prefer: "resolution=merge-duplicates,return=minimal"
      }),
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Supabase UPSERT ${table} failed (${res.status}): ${errText}`);
    }
  }
}
async function supabaseDeleteWhere(table, column, value) {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error("Supabase is not configured");
  }
  const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?${encodeURIComponent(
    column
  )}=eq.${encodeURIComponent(value)}`;
  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: buildHeaders(cfg.secretKey, {
      Prefer: "return=representation"
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase DELETE ${table} failed (${res.status}): ${errText}`);
  }
  const deletedRows = await res.json().catch(() => []);
  return Array.isArray(deletedRows) ? deletedRows : [];
}
async function supabaseDeleteIn(table, column, values, chunkSize = 100) {
  const cfg = getSupabaseConfig();
  if (!cfg || values.length === 0) {
    return;
  }
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const encodedList = chunk.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
    const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(table)}?${encodeURIComponent(
      column
    )}=in.(${encodeURIComponent(encodedList)})`;
    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: buildHeaders(cfg.secretKey, {
        Prefer: "return=minimal"
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Supabase DELETE ${table} failed (${res.status}): ${errText}`);
    }
  }
}
async function checkSupabaseHealth() {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return { configured: false, connected: false };
  }
  try {
    const endpoint = `${cfg.url}/rest/v1/menuplus_kv?select=key&limit=1`;
    const res = await fetch(endpoint, {
      method: "GET",
      headers: buildHeaders(cfg.secretKey),
      signal: AbortSignal.timeout(5e3)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return {
        configured: true,
        connected: false,
        error: `HTTP ${res.status}: ${errText}`
      };
    }
    return { configured: true, connected: true };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      error: formatSupabaseError(err)
    };
  }
}

// server/neon-store.ts
var DB_FILE = path.resolve(process.cwd(), "data/db-store.json");
var HMO_BUNDLE_FILE = path.resolve(process.cwd(), "data/hmo-menux-bundle.json");
var DANGEROUS_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
var RESERVED_PREFIXES = [
  "telegram_otp_sessions/",
  "telegram_pending_start/",
  "telegram_msg_lock/",
  "user_sessions/",
  "telegram_users_db/",
  "settings/telegram_config",
  "settings/telegram_poll_state"
];
var SAMPLE_PARTNER_MIGRATION_KEY = "migrations/purged_sample_partners_v8";
var HMO_MENUX_MIGRATION_KEY = "migrations/hmo_menux_import_v1";
var PURGE_7833239944_MIGRATION_KEY = "migrations/purged_7833239944_v3";
var LEGACY_TEST_RESTAURANTS_PURGE_KEY = "migrations/purged_legacy_test_restaurants_v1";
var LEGACY_EXACT_NAMES = /* @__PURE__ */ new Set([
  "\u0645\u0637\u0639\u0645 \u062A\u062C\u0631\u064A\u0628\u064A",
  "\u0641\u0648\u0643\u0633",
  "\u062D\u0645\u0648\u0631\u0627\u0628\u064A",
  "\u062D\u0645\u0648",
  "\u0643\u0627\u0628 \u0628\u0631\u062C\u0631"
]);
var SAMPLE_PARTNER_KEYS = [
  "restaurants/1",
  "restaurants/2",
  "restaurants/3",
  "restaurants/4",
  "restaurants/5",
  "restaurants/6",
  "accounts/acc_r1",
  "accounts/acc_r2",
  "accounts/acc_r3",
  "accounts/acc_r4",
  "accounts/acc_r5",
  "accounts/acc_r6",
  "cats/c1",
  "cats/c2",
  "cats/c3",
  "cats/c4",
  "items/i1",
  "items/i2",
  "items/i3",
  "items/i4",
  "items/i5",
  "items/i6",
  "items/i7",
  "items/i8",
  "items/i9"
];
var SAMPLE_RESTAURANT_NAMES = /* @__PURE__ */ new Set([
  "\u0645\u0637\u0639\u0645 \u0627\u0644\u0623\u0635\u0627\u0644\u0629 \u0627\u0644\u0639\u0631\u0627\u0642\u064A",
  "\u0628\u0631\u062C\u0631 \u0647\u0627\u0648\u0633 \u0628\u063A\u062F\u0627\u062F",
  "\u0634\u0627\u0648\u0631\u0645\u0627 \u0627\u0644\u0634\u0627\u0645 \u0648\u0627\u0644\u0623\u0635\u064A\u0644",
  "\u0645\u0637\u0639\u0645 \u0648\u0643\u0628\u0627\u0628 \u0627\u0644\u0633\u0646\u062F\u0628\u0627\u062F",
  "\u0643\u0627\u0641\u064A\u0647 \u0648\u0645\u0642\u0647\u0649 \u0631\u064A\u062D\u0627\u0646",
  "\u0645\u0637\u0639\u0645 \u062F\u062C\u0644\u0629 \u0644\u0644\u0645\u0623\u0643\u0648\u0644\u0627\u062A \u0627\u0644\u0628\u062D\u0631\u064A\u0629",
  "\u0645\u0637\u0639\u0645 \u062A\u062C\u0631\u064A\u0628\u064A",
  "\u0641\u0648\u0643\u0633",
  "\u062D\u0645\u0648\u0631\u0627\u0628\u064A"
]);
var SAMPLE_PARTNER_PHONES = /* @__PURE__ */ new Set([
  "07701234567",
  "07802345678",
  "07713456789",
  "07814567890",
  "07725678901",
  "07826789012"
]);
function normalizeDigitsPhone(val) {
  const digits = String(val || "").replace(/\D/g, "");
  if (digits.startsWith("964") && digits.length >= 13) {
    return `0${digits.slice(3)}`;
  }
  return digits;
}
function collectSampleKeysToPurge(store) {
  const keysToDelete = /* @__PURE__ */ new Set();
  const purgedRids = /* @__PURE__ */ new Set(["1", "2", "3", "4", "5", "6"]);
  for (const sk of SAMPLE_PARTNER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(store, sk)) {
      keysToDelete.add(sk);
    }
  }
  for (const [key, val] of Object.entries(store)) {
    if (!val || typeof val !== "object") continue;
    const rec = val;
    if (key.startsWith("restaurants/") && !key.slice("restaurants/".length).includes("/")) {
      const rid = key.slice("restaurants/".length);
      if (rid === "demo") continue;
      const name = String(rec.n || "").trim();
      const ph = normalizeDigitsPhone(rec.ph || rec.ow || "");
      if (SAMPLE_RESTAURANT_NAMES.has(name) || SAMPLE_PARTNER_PHONES.has(ph)) {
        keysToDelete.add(key);
        purgedRids.add(rid);
      }
    }
  }
  for (const [key, val] of Object.entries(store)) {
    if (!val || typeof val !== "object") continue;
    const rec = val;
    if (key.startsWith("accounts/")) {
      const id = key.slice("accounts/".length);
      if (id.startsWith("acc_admin_") || id === "acc_menu_demo") continue;
      const rid = String(rec.rid || "");
      const projectName = String(rec.projectName || rec.n || "").trim();
      const ph = normalizeDigitsPhone(rec.phone || rec.ph || rec.projectPhone || rec.em || rec.username || "");
      if (purgedRids.has(rid) || SAMPLE_RESTAURANT_NAMES.has(projectName) || SAMPLE_PARTNER_PHONES.has(ph)) {
        keysToDelete.add(key);
      }
    } else if ((key.startsWith("cats/") || key.startsWith("items/") || key.startsWith("orders/")) && purgedRids.has(String(rec.rid || ""))) {
      keysToDelete.add(key);
    }
  }
  return Array.from(keysToDelete);
}
function isTarget7833239944(val) {
  const digits = normalizeDigitsPhone(val);
  return digits === "07833239944" || digits === "7833239944" || digits === "9647833239944";
}
function apply7833239944Purge(store) {
  if (store[PURGE_7833239944_MIGRATION_KEY]) {
    return { changed: false, deletedKeys: [], updatedEntries: {} };
  }
  const deletedKeys = [];
  const updatedEntries = {};
  for (const [key, val] of Object.entries(store)) {
    if (!val || typeof val !== "object") continue;
    const rec = val;
    if (key.startsWith("accounts/")) {
      const isProtectedAdmin = key === "accounts/acc_admin_owner" || rec.admin === true || rec.r === "admin";
      if (!isProtectedAdmin && (isTarget7833239944(rec.phone) || isTarget7833239944(rec.projectPhone) || isTarget7833239944(rec.em) || isTarget7833239944(rec.username) || isTarget7833239944(rec.e) || isTarget7833239944(rec.u))) {
        delete store[key];
        deletedKeys.push(key);
      }
    } else if (key.startsWith("staff/")) {
      if (isTarget7833239944(rec.phone) || isTarget7833239944(rec.email)) {
        delete store[key];
        deletedKeys.push(key);
      }
    } else if (key.startsWith("restaurants/") && !key.slice("restaurants/".length).includes("/")) {
      if (isTarget7833239944(rec.ph) || isTarget7833239944(rec.ow)) {
        const cleaned = {
          ...rec,
          ...isTarget7833239944(rec.ph) ? { ph: "" } : {},
          ...isTarget7833239944(rec.ow) ? { ow: "" } : {}
        };
        store[key] = cleaned;
        updatedEntries[key] = cleaned;
      }
    } else if (key.startsWith("telegram_otp_sessions/") && isTarget7833239944(rec.phone)) {
      delete store[key];
      deletedKeys.push(key);
    } else if (key.startsWith("user_sessions/") && isTarget7833239944(rec.phone)) {
      delete store[key];
      deletedKeys.push(key);
    }
  }
  store[PURGE_7833239944_MIGRATION_KEY] = true;
  updatedEntries[PURGE_7833239944_MIGRATION_KEY] = true;
  return { changed: true, deletedKeys, updatedEntries };
}
function isLegacyRestaurantRecord(rid, rec) {
  if (rid === "demo" || rid === "r_hmo_menux") return false;
  const name = String(rec.n || "").trim();
  const ph = normalizeDigitsPhone(rec.ph || rec.ow || "");
  if (SAMPLE_RESTAURANT_NAMES.has(name) || SAMPLE_PARTNER_PHONES.has(ph)) return true;
  if (LEGACY_EXACT_NAMES.has(name)) return true;
  return false;
}
function applyLegacyTestRestaurantsPurge(store) {
  if (store[LEGACY_TEST_RESTAURANTS_PURGE_KEY]) {
    return { changed: false, deletedKeys: [], updatedEntries: {} };
  }
  const deletedKeys = [];
  const updatedEntries = {};
  const purgedRids = /* @__PURE__ */ new Set();
  for (const [key, val] of Object.entries(store)) {
    if (!key.startsWith("restaurants/") || key.slice("restaurants/".length).includes("/") || !val || typeof val !== "object") {
      continue;
    }
    const rid = key.slice("restaurants/".length);
    const rec = val;
    if (isLegacyRestaurantRecord(rid, rec)) {
      purgedRids.add(rid);
      delete store[key];
      deletedKeys.push(key);
    }
  }
  if (purgedRids.size > 0) {
    for (const [key, val] of Object.entries(store)) {
      if (!key.startsWith("restaurants/") || key.slice("restaurants/".length).includes("/") || !val || typeof val !== "object") {
        continue;
      }
      const rid = key.slice("restaurants/".length);
      if (rid === "demo" || rid === "r_hmo_menux") continue;
      const rec = val;
      if (rec.parentRid && purgedRids.has(String(rec.parentRid))) {
        purgedRids.add(rid);
        delete store[key];
        deletedKeys.push(key);
      }
    }
  }
  if (purgedRids.size > 0) {
    for (const [key, val] of Object.entries(store)) {
      if (!val || typeof val !== "object") continue;
      const rec = val;
      if (key.startsWith("accounts/")) {
        const id = key.slice("accounts/".length);
        if (id.startsWith("acc_admin_") || id === "acc_menu_demo" || rec.admin === true || rec.r === "admin") {
          continue;
        }
        if (purgedRids.has(String(rec.rid || ""))) {
          delete store[key];
          deletedKeys.push(key);
        }
      } else if ((key.startsWith("cats/") || key.startsWith("items/") || key.startsWith("orders/") || key.startsWith("reviews/")) && purgedRids.has(String(rec.rid || ""))) {
        delete store[key];
        deletedKeys.push(key);
      }
    }
  }
  const demoRec = store["restaurants/demo"];
  if (demoRec && typeof demoRec === "object" && !Array.isArray(demoRec)) {
    const rec = demoRec;
    const socialObj = rec.social && typeof rec.social === "object" ? rec.social : {};
    const needsDemoClean = isTarget7833239944(rec.ph) || isTarget7833239944(rec.ow) || isTarget7833239944(rec.telegramPhone) || isTarget7833239944(socialObj.whatsapp);
    if (needsDemoClean) {
      const cleanedDemo = {
        ...rec,
        ...isTarget7833239944(rec.ph) ? { ph: "07724799679" } : {},
        ...isTarget7833239944(rec.ow) ? { ow: "" } : {},
        ...isTarget7833239944(rec.telegramPhone) ? { telegramPhone: "", telegramChatId: "", telegramUsername: "" } : {},
        ...isTarget7833239944(socialObj.whatsapp) ? { social: { ...socialObj, whatsapp: "9647724799679" } } : {}
      };
      store["restaurants/demo"] = cleanedDemo;
      updatedEntries["restaurants/demo"] = cleanedDemo;
    }
  }
  store[LEGACY_TEST_RESTAURANTS_PURGE_KEY] = true;
  updatedEntries[LEGACY_TEST_RESTAURANTS_PURGE_KEY] = true;
  return { changed: true, deletedKeys, updatedEntries };
}
async function applyHmoMenuxMigrationInRemote(store) {
  if (store[HMO_MENUX_MIGRATION_KEY]) return false;
  if (!fs.existsSync(HMO_BUNDLE_FILE)) return false;
  let bundle;
  try {
    bundle = JSON.parse(fs.readFileSync(HMO_BUNDLE_FILE, "utf-8"));
  } catch (e) {
    console.warn("[Migration HMO] Failed to parse bundle:", e);
    return false;
  }
  if (!bundle?.restaurant || !Array.isArray(bundle.cats) || !Array.isArray(bundle.items)) {
    return false;
  }
  const targetDigits = new Set((bundle.targetPhones || ["07722213811"]).map((p) => normalizeDigitsPhone(p)));
  const matchesTargetPhone = (val) => {
    const d = normalizeDigitsPhone(val);
    return Boolean(d && targetDigits.has(d));
  };
  let existingAccKey = null;
  let existingAcc = null;
  let existingRid = null;
  for (const [k, v] of Object.entries(store)) {
    if (!k.startsWith("accounts/") || !v || typeof v !== "object") continue;
    const rec = v;
    if (matchesTargetPhone(rec.phone) || matchesTargetPhone(rec.ph) || matchesTargetPhone(rec.projectPhone) || matchesTargetPhone(rec.em) || matchesTargetPhone(rec.username) || matchesTargetPhone(rec.e) || matchesTargetPhone(rec.u)) {
      existingAccKey = k;
      existingAcc = rec;
      if (rec.rid && String(rec.rid) !== "demo") {
        existingRid = String(rec.rid);
      }
      break;
    }
  }
  if (!existingRid) {
    for (const [k, v] of Object.entries(store)) {
      if (!k.startsWith("restaurants/") || k.slice("restaurants/".length).includes("/") || !v || typeof v !== "object") continue;
      const ridCand = k.slice("restaurants/".length);
      if (ridCand === "demo") continue;
      const rec = v;
      if (matchesTargetPhone(rec.ph)) {
        existingRid = ridCand;
        break;
      }
    }
  }
  const targetRid = existingRid || String(bundle.restaurant.id || "r_hmo_menux");
  const existingRest = store[`restaurants/${targetRid}`] || void 0;
  const desiredSlug = String(bundle.restaurant.slug || "hmo").trim();
  const slugConflict = Object.entries(store).some(([k, v]) => {
    if (!k.startsWith("restaurants/") || k === `restaurants/${targetRid}` || !v || typeof v !== "object") return false;
    const r = v;
    return String(r.slug || "").trim().toLowerCase() === desiredSlug.toLowerCase() || String(r.subdomain || "").trim().toLowerCase() === desiredSlug.toLowerCase();
  });
  const resolvedSlug = existingRest?.slug ? String(existingRest.slug) : !slugConflict ? desiredSlug : void 0;
  const resolvedSubdomain = existingRest?.subdomain ? String(existingRest.subdomain) : !slugConflict ? desiredSlug : void 0;
  const upsertEntries = {};
  const deleteKeys = [];
  for (const [k, v] of Object.entries(store)) {
    if ((k.startsWith("cats/") || k.startsWith("items/")) && v && typeof v === "object") {
      if (String(v.rid || "") === targetRid) {
        delete store[k];
        deleteKeys.push(k);
      }
    }
  }
  const mergedRest = {
    ...bundle.restaurant,
    ...existingRest ? {
      createdAt: existingRest.createdAt || bundle.restaurant.createdAt,
      p: existingRest.p || bundle.restaurant.p,
      planId: existingRest.planId || bundle.restaurant.planId,
      isPaid: existingRest.isPaid !== void 0 ? existingRest.isPaid : bundle.restaurant.isPaid,
      e: existingRest.e || bundle.restaurant.e,
      o: existingRest.o ?? 0,
      v: existingRest.v ?? 0,
      ...existingRest.reviews !== void 0 ? { reviews: existingRest.reviews } : {}
    } : {},
    id: targetRid,
    done: 1,
    a: 1,
    ...resolvedSlug ? { slug: resolvedSlug } : {},
    ...resolvedSubdomain ? { subdomain: resolvedSubdomain } : {}
  };
  store[`restaurants/${targetRid}`] = mergedRest;
  upsertEntries[`restaurants/${targetRid}`] = mergedRest;
  if (existingAccKey && existingAcc) {
    const updatedAcc = {
      ...existingAcc,
      rid: targetRid,
      projectName: String(mergedRest.n || existingAcc.projectName || "\u062D\u0645\u0648 \u2013 Hmo"),
      projectType: String(mergedRest.projectType || existingAcc.projectType || "restaurant")
    };
    store[existingAccKey] = updatedAcc;
    upsertEntries[existingAccKey] = updatedAcc;
  } else if (bundle.defaultAccount) {
    const accId = String(bundle.defaultAccount.id || "acc_hmo_07722213811");
    const accRec = { ...bundle.defaultAccount, rid: targetRid };
    store[`accounts/${accId}`] = accRec;
    upsertEntries[`accounts/${accId}`] = accRec;
  }
  for (const cat of bundle.cats) {
    const cid = String(cat.id || "");
    if (!cid) continue;
    const catRec = { ...cat, rid: targetRid };
    store[`cats/${cid}`] = catRec;
    upsertEntries[`cats/${cid}`] = catRec;
  }
  for (const item of bundle.items) {
    const iid = String(item.id || "");
    if (!iid) continue;
    const itemRec = { ...item, rid: targetRid };
    store[`items/${iid}`] = itemRec;
    upsertEntries[`items/${iid}`] = itemRec;
  }
  store[HMO_MENUX_MIGRATION_KEY] = true;
  upsertEntries[HMO_MENUX_MIGRATION_KEY] = true;
  if (deleteKeys.length > 0) {
    await supabaseDeleteIn("menuplus_kv", "key", deleteKeys);
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const rowsToUpsert = Object.entries(upsertEntries).map(([key, value]) => ({
    key,
    value,
    updated_at: nowIso
  }));
  await supabaseUpsert("menuplus_kv", rowsToUpsert, "key");
  console.log(`[Migration HMO] Synced menu (${bundle.cats.length} cats, ${bundle.items.length} items) to rid=${targetRid}`);
  return true;
}
var memoryStore = /* @__PURE__ */ Object.create(null);
var isFileLoaded = false;
var hasHydratedSupabase = false;
var lastSupabaseSyncAt = 0;
var lastSupabaseErrorAt = 0;
var lastSupabaseWarnLoggedAt = 0;
var activeSyncPromise = null;
var SUPABASE_SYNC_TTL_MS = 3e3;
var SUPABASE_ERROR_BACKOFF_MS = 3e4;
var SUPABASE_LOG_THROTTLE_MS = 3e5;
function isReservedInternalKey(key) {
  return RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));
}
function isSafeStoreKey(key) {
  if (typeof key !== "string" || key.length === 0 || key.length > 256) return false;
  if (key.includes("..") || /[\x00-\x1f\x7f]/.test(key)) return false;
  const segments = key.split("/");
  return segments.every((seg) => seg.length > 0 && !DANGEROUS_KEYS.has(seg));
}
function isPlainObject(val) {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}
function loadStoreFromFile() {
  if (isFileLoaded) return memoryStore;
  const fresh = /* @__PURE__ */ Object.create(null);
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
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
    console.warn("[Store] Failed to read db file:", e);
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
var pendingFileWriteTimer = null;
var fileWriteQueue = Promise.resolve();
function persistStoreToFile() {
  if (pendingFileWriteTimer) {
    clearTimeout(pendingFileWriteTimer);
  }
  pendingFileWriteTimer = setTimeout(() => {
    pendingFileWriteTimer = null;
    const plain = {};
    for (const [k, v] of Object.entries(memoryStore)) {
      if (isSafeStoreKey(k)) {
        plain[k] = v;
      }
    }
    const content = JSON.stringify(plain);
    fileWriteQueue = fileWriteQueue.then(async () => {
      const dir = path.dirname(DB_FILE);
      await fs.promises.mkdir(dir, { recursive: true });
      const tmpPath = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
      await fs.promises.writeFile(tmpPath, content, "utf-8");
      await fs.promises.rename(tmpPath, DB_FILE);
    }).catch((e) => {
      console.warn("[Store] Failed to write db file:", e);
    });
  }, 60);
}
function logSupabaseSyncNotice(err) {
  if (isSupabaseNetworkError(err)) {
    return;
  }
  const now = Date.now();
  if (now - lastSupabaseWarnLoggedAt < SUPABASE_LOG_THROTTLE_MS) return;
  lastSupabaseWarnLoggedAt = now;
  console.warn("[Supabase KV] Unexpected response, using local store fallback:", formatSupabaseError(err));
}
async function syncFromSupabase(force = false) {
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
      const rows = await supabaseSelectAll("menuplus_kv", "key,value");
      if (rows.length === 0 && !hasHydratedSupabase) {
        const seedEntries = Object.entries(memoryStore).filter(
          ([k]) => isSafeStoreKey(k) && !isReservedInternalKey(k)
        );
        if (seedEntries.length > 0) {
          const timestamp = (/* @__PURE__ */ new Date()).toISOString();
          await supabaseUpsert(
            "menuplus_kv",
            seedEntries.map(([key, value]) => ({ key, value, updated_at: timestamp })),
            "key"
          );
          console.log(`[Supabase KV] Bootstrapped ${seedEntries.length} initial records into menuplus_kv`);
        }
      } else {
        const nextStore = /* @__PURE__ */ Object.create(null);
        for (const row of rows) {
          if (row && typeof row.key === "string" && isSafeStoreKey(row.key)) {
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
            await supabaseDeleteIn("menuplus_kv", "key", sampleKeysInRemote);
          }
          await supabaseUpsert(
            "menuplus_kv",
            [{ key: SAMPLE_PARTNER_MIGRATION_KEY, value: true, updated_at: (/* @__PURE__ */ new Date()).toISOString() }],
            "key"
          );
        }
        await applyHmoMenuxMigrationInRemote(nextStore);
        const remotePurge = apply7833239944Purge(nextStore);
        if (remotePurge.changed) {
          if (remotePurge.deletedKeys.length > 0) {
            await supabaseDeleteIn("menuplus_kv", "key", remotePurge.deletedKeys);
          }
          const nowIso = (/* @__PURE__ */ new Date()).toISOString();
          await supabaseUpsert(
            "menuplus_kv",
            Object.entries(remotePurge.updatedEntries).map(([key, value]) => ({
              key,
              value,
              updated_at: nowIso
            })),
            "key"
          );
        }
        const remoteLegacyPurge = applyLegacyTestRestaurantsPurge(nextStore);
        if (remoteLegacyPurge.changed) {
          if (remoteLegacyPurge.deletedKeys.length > 0) {
            await supabaseDeleteIn("menuplus_kv", "key", remoteLegacyPurge.deletedKeys);
          }
          const nowIso = (/* @__PURE__ */ new Date()).toISOString();
          await supabaseUpsert(
            "menuplus_kv",
            Object.entries(remoteLegacyPurge.updatedEntries).map(([key, value]) => ({
              key,
              value,
              updated_at: nowIso
            })),
            "key"
          );
        }
        memoryStore = nextStore;
        persistStoreToFile();
      }
      hasHydratedSupabase = true;
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
    } catch (err) {
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
    } finally {
      activeSyncPromise = null;
    }
  })();
  return activeSyncPromise;
}
async function readAll(includeReserved = false) {
  await syncFromSupabase(false);
  const out = {};
  for (const [k, v] of Object.entries(memoryStore)) {
    if (!includeReserved && isReservedInternalKey(k)) continue;
    out[k] = v;
  }
  return out;
}
async function readPrefixFromStore(prefix) {
  loadStoreFromFile();
  const readLocal = () => {
    const items = [];
    for (const [k, v] of Object.entries(memoryStore)) {
      if (k.startsWith(prefix) && !k.slice(prefix.length).includes("/") && v && typeof v === "object") {
        items.push({ ...v, id: k.slice(prefix.length) });
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
      const rows = await supabaseSelectByPrefix("menuplus_kv", "key", prefix, "key,value");
      for (const existingKey of Object.keys(memoryStore)) {
        if (existingKey.startsWith(prefix)) {
          delete memoryStore[existingKey];
        }
      }
      const items = [];
      const prefixSampleKeys = [];
      for (const row of rows) {
        if (row && typeof row.key === "string" && row.key.startsWith(prefix) && isSafeStoreKey(row.key) && row.value && typeof row.value === "object") {
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
        await supabaseDeleteIn("menuplus_kv", "key", prefixSampleKeys).catch(() => {
        });
      }
      for (const [k, v] of Object.entries(memoryStore)) {
        if (k.startsWith(prefix) && !k.slice(prefix.length).includes("/") && v && typeof v === "object") {
          items.push({ ...v, id: k.slice(prefix.length) });
        }
      }
      persistStoreToFile();
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
      return { items, source: "supabase" };
    } catch (err) {
      const errMsg = formatSupabaseError(err);
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
      return { items: readLocal(), source: "file-memory", supabaseError: errMsg };
    }
  }
  return { items: readLocal(), source: "file-memory" };
}
async function upsertRecordInStore(key, value) {
  if (!isSafeStoreKey(key) || isReservedInternalKey(key)) {
    return { ok: false, persistedToSupabase: false, source: "file-memory", error: "Invalid record key" };
  }
  loadStoreFromFile();
  if (isSupabaseConfigured()) {
    try {
      await supabaseUpsert(
        "menuplus_kv",
        [{ key, value, updated_at: (/* @__PURE__ */ new Date()).toISOString() }],
        "key"
      );
      memoryStore[key] = value;
      persistStoreToFile();
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
      return { ok: true, persistedToSupabase: true, source: "supabase" };
    } catch (err) {
      const errMsg = formatSupabaseError(err);
      if (!isSupabaseNetworkError(err)) {
        return { ok: false, persistedToSupabase: false, source: "supabase", error: errMsg };
      }
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
      memoryStore[key] = value;
      persistStoreToFile();
      return { ok: true, persistedToSupabase: false, source: "file-memory", error: errMsg };
    }
  }
  memoryStore[key] = value;
  persistStoreToFile();
  return { ok: true, persistedToSupabase: false, source: "file-memory" };
}
async function deleteRecordPhysicallyFromStore(key) {
  if (!isSafeStoreKey(key) || isReservedInternalKey(key)) {
    return {
      ok: false,
      deletedFromSupabase: false,
      deletedFromLocal: false,
      source: "file-memory",
      error: "Invalid record key"
    };
  }
  loadStoreFromFile();
  if (isSupabaseConfigured()) {
    try {
      const deletedRows = await supabaseDeleteWhere("menuplus_kv", "key", key);
      const existedLocally2 = Object.prototype.hasOwnProperty.call(memoryStore, key);
      if (existedLocally2) {
        delete memoryStore[key];
        persistStoreToFile();
      }
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
      return {
        ok: true,
        deletedFromSupabase: deletedRows.length > 0,
        deletedFromLocal: existedLocally2,
        source: "supabase"
      };
    } catch (err) {
      const errMsg = formatSupabaseError(err);
      if (!isSupabaseNetworkError(err)) {
        return {
          ok: false,
          deletedFromSupabase: false,
          deletedFromLocal: false,
          source: "supabase",
          error: errMsg
        };
      }
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
      const existedLocally2 = Object.prototype.hasOwnProperty.call(memoryStore, key);
      if (existedLocally2) {
        delete memoryStore[key];
        persistStoreToFile();
      }
      return {
        ok: true,
        deletedFromSupabase: false,
        deletedFromLocal: existedLocally2,
        source: "file-memory",
        error: errMsg
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
    source: "file-memory"
  };
}
async function getInternalStoreItem(key) {
  if (!isSafeStoreKey(key)) return null;
  loadStoreFromFile();
  const now = Date.now();
  const inErrorBackoff = Boolean(lastSupabaseErrorAt && now - lastSupabaseErrorAt < SUPABASE_ERROR_BACKOFF_MS);
  if (isSupabaseConfigured() && !inErrorBackoff) {
    try {
      const row = await supabaseSelectOne("menuplus_kv", "key", key, "key,value");
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
      if (row) {
        memoryStore[key] = row.value;
        persistStoreToFile();
        return row.value;
      }
      if (Object.prototype.hasOwnProperty.call(memoryStore, key)) {
        delete memoryStore[key];
        persistStoreToFile();
      }
      return null;
    } catch (err) {
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
    }
  }
  return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
}
async function setInternalStoreItem(key, value) {
  await applyChanges({ put: { [key]: value } }, true);
}
async function deleteInternalStoreItem(key) {
  await applyChanges({ del: [key] }, true);
}
async function applyChanges(diff, allowReserved = false) {
  loadStoreFromFile();
  let changed = false;
  const upsertRows = [];
  const deleteKeys = [];
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
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
      if (typeof k !== "string" || !isSafeStoreKey(k)) continue;
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
        await supabaseUpsert("menuplus_kv", upsertRows, "key");
      }
      if (deleteKeys.length > 0) {
        await supabaseDeleteIn("menuplus_kv", "key", deleteKeys);
      }
      lastSupabaseSyncAt = Date.now();
      lastSupabaseErrorAt = 0;
      persistedToSupabase = true;
    } catch (err) {
      lastSupabaseErrorAt = Date.now();
      logSupabaseSyncNotice(err);
    }
  }
  return { persistedToSupabase };
}

// server/notes-store.ts
import fs2 from "node:fs";
import path2 from "node:path";
var NOTES_JSON_FILE = path2.resolve(process.cwd(), "data/notes-document.json");
var NOTES_MD_FILE = path2.resolve(process.cwd(), "data/notes-document.md");
function ensureDataDir() {
  const dir = path2.dirname(NOTES_JSON_FILE);
  if (!fs2.existsSync(dir)) {
    fs2.mkdirSync(dir, { recursive: true });
  }
}
function writeFileAtomicSync(filePath, content) {
  ensureDataDir();
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs2.writeFileSync(tmpPath, content, "utf-8");
  fs2.renameSync(tmpPath, filePath);
}
function sanitizeNote(raw) {
  return {
    id: String(raw.id).slice(0, 64),
    title: String(raw.title || "\u0645\u0644\u0627\u062D\u0638\u0629 \u062C\u062F\u064A\u062F\u0629").slice(0, 300),
    content: String(raw.content || "").slice(0, 5e4),
    author: raw.author ? String(raw.author).slice(0, 120) : void 0,
    category: raw.category ? String(raw.category).slice(0, 40) : void 0,
    priority: raw.priority ? String(raw.priority).slice(0, 40) : void 0,
    status: raw.status ? String(raw.status).slice(0, 40) : void 0,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    pinned: Boolean(raw.pinned)
  };
}
function loadNotesFile() {
  try {
    if (fs2.existsSync(NOTES_JSON_FILE)) {
      const raw = fs2.readFileSync(NOTES_JSON_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.warn("[NotesStore] Failed to parse notes json:", e);
  }
  return [];
}
function buildMarkdownDocument(notes) {
  const nowArabic = (/* @__PURE__ */ new Date()).toLocaleString("ar-IQ");
  let md = `# \u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0648\u0623\u0641\u0643\u0627\u0631 \u0645\u0646\u064A\u0648 \u0628\u0644\u0633 (${notes.length} \u0645\u0644\u0627\u062D\u0638\u0629)
\u0622\u062E\u0631 \u062A\u062D\u062F\u064A\u062B: ${nowArabic}

---

`;
  notes.forEach((n, idx) => {
    md += `${idx + 1}. ${n.title}
`;
    if (n.createdAt) {
      md += `\u0627\u0644\u062A\u0627\u0631\u064A\u062E: ${new Date(n.createdAt).toLocaleString("ar-IQ")}
`;
    }
    if (n.content) {
      md += `${n.content}
`;
    }
    md += `
---

`;
  });
  return md;
}
function saveNotesToFiles(notes) {
  try {
    writeFileAtomicSync(NOTES_JSON_FILE, JSON.stringify(notes, null, 2));
    writeFileAtomicSync(NOTES_MD_FILE, buildMarkdownDocument(notes));
  } catch (e) {
    console.warn("[NotesStore] Failed to write notes files:", e);
  }
}
function readNotesDocument(seedNotes = []) {
  let fileNotes = loadNotesFile();
  if (!fileNotes.length && seedNotes.length) {
    fileNotes = seedNotes.map(sanitizeNote);
    saveNotesToFiles(fileNotes);
  }
  return {
    notes: fileNotes,
    jsonPath: NOTES_JSON_FILE,
    mdPath: NOTES_MD_FILE,
    filePath: "data/notes-document.md",
    documentText: buildMarkdownDocument(fileNotes)
  };
}
function saveNoteToFile(note, seedNotes = []) {
  let notes = loadNotesFile();
  if (!notes.length && seedNotes.length) {
    notes = seedNotes.map(sanitizeNote);
  }
  const toSave = sanitizeNote(note);
  const existingIdx = notes.findIndex((n) => n.id === toSave.id);
  if (existingIdx >= 0) {
    toSave.createdAt = notes[existingIdx].createdAt || toSave.createdAt;
    notes[existingIdx] = toSave;
  } else {
    notes.unshift(toSave);
  }
  saveNotesToFiles(notes);
  return {
    notes,
    savedNote: toSave,
    filePath: "data/notes-document.md",
    documentText: buildMarkdownDocument(notes)
  };
}
function deleteNoteFromFile(id, seedNotes = []) {
  let notes = loadNotesFile();
  if (!notes.length && seedNotes.length) {
    notes = seedNotes.map(sanitizeNote);
  }
  notes = notes.filter((n) => n.id !== id);
  saveNotesToFiles(notes);
  return {
    notes,
    filePath: "data/notes-document.md",
    documentText: buildMarkdownDocument(notes)
  };
}
function replaceAllNotesInFile(notes) {
  const sanitized = notes.filter((n) => n && typeof n === "object" && n.id).map(sanitizeNote);
  saveNotesToFiles(sanitized);
  return {
    notes: sanitized,
    filePath: "data/notes-document.md",
    documentText: buildMarkdownDocument(sanitized)
  };
}

// server/image-search.ts
import dns from "node:dns/promises";
import net from "node:net";
var CURATED_IMAGE_CATALOG = [
  // Burgers & Smash Burgers
  {
    name: "\u0628\u0631\u062C\u0631 \u0644\u062D\u0645 \u0633\u0645\u0627\u0634 \u062F\u0628\u0644 \u062A\u0634\u064A\u0632",
    url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u0631\u062C\u0631", "\u0633\u0645\u0627\u0634", "\u0647\u0645\u0628\u0631\u062C\u0631", "\u0644\u062D\u0645", "\u062A\u0634\u064A\u0632", "\u0643\u0644\u0627\u0633\u064A\u0643", "burger", "smash", "cheeseburger", "beef", "\u0643\u0627\u0628"]
  },
  {
    name: "\u0628\u0631\u062C\u0631 \u062F\u0628\u0644 \u0634\u064A\u062F\u0631 \u0648\u0635\u0648\u0635 \u062E\u0627\u0635",
    url: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u0631\u062C\u0631", "\u062F\u0628\u0644", "\u062A\u0634\u064A\u0632", "\u0634\u064A\u062F\u0631", "\u0644\u062D\u0645", "burger", "double", "cheese"]
  },
  {
    name: "\u0628\u0631\u062C\u0631 \u062A\u0631\u0627\u0641\u0644 \u0648\u0645\u0634\u0631\u0648\u0645 \u0641\u0627\u062E\u0631",
    url: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u0631\u062C\u0631", "\u062A\u0631\u0627\u0641\u0644", "\u0645\u0634\u0631\u0648\u0645", "\u0641\u0637\u0631", "\u0633\u0628\u064A\u0634\u0627\u0644", "burger", "truffle", "mushroom"]
  },
  {
    name: "\u0628\u0631\u062C\u0631 \u0628\u0627\u0631\u0628\u0643\u064A\u0648 \u0645\u062F\u062E\u0646",
    url: "https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u0631\u062C\u0631", "\u0628\u0627\u0631\u0628\u0643\u064A\u0648", "\u0633\u0645\u0648\u0643\u064A", "\u0645\u062F\u062E\u0646", "\u0644\u062D\u0645", "burger", "bbq", "smoky"]
  },
  {
    name: "\u0628\u0631\u062C\u0631 \u062F\u062C\u0627\u062C \u0643\u0631\u064A\u0633\u0628\u064A \u0645\u0642\u0631\u0645\u0634",
    url: "https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u0631\u062C\u0631 \u062F\u062C\u0627\u062C", "\u062F\u062C\u0627\u062C", "\u0643\u0631\u0633\u0628\u064A", "\u0632\u0646\u062C\u0631", "\u0645\u0642\u0631\u0645\u0634", "\u0633\u0627\u0646\u062F\u0648\u064A\u0634", "chicken", "crispy", "zinger"]
  },
  {
    name: "\u062A\u0634\u0643\u0646 \u0628\u0631\u062C\u0631 \u0628\u0627\u0644\u062C\u0628\u0646 \u0648\u0627\u0644\u062E\u0633",
    url: "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=700&q=80",
    tags: ["\u062F\u062C\u0627\u062C", "\u0628\u0631\u062C\u0631", "\u0641\u0631\u0627\u064A\u062F", "\u0633\u0628\u0627\u064A\u0633\u064A", "chicken", "burger"]
  },
  {
    name: "\u0648\u062C\u0628\u0629 \u0628\u0631\u062C\u0631 \u0643\u0648\u0645\u0628\u0648 \u0645\u0639 \u0628\u0637\u0627\u0637\u0627",
    url: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0643\u0648\u0645\u0628\u0648", "\u0648\u062C\u0628\u0629", "\u0628\u0648\u0643\u0633", "\u0628\u0631\u062C\u0631", "combo", "box", "meal"]
  },
  {
    name: "\u0633\u0644\u0627\u064A\u062F\u0631\u0632 \u0628\u0631\u062C\u0631 \u0645\u064A\u0646\u064A \u0628\u0648\u0643\u0633",
    url: "https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u0648\u0643\u0633", "\u0639\u0627\u0626\u0644\u064A", "\u0645\u064A\u0646\u064A", "\u0633\u0644\u0627\u064A\u062F\u0631", "\u0628\u0631\u062C\u0631", "box", "sliders", "family"]
  },
  // Chicken Strips, Wings, Wraps & Shawarma
  {
    name: "\u0633\u062A\u0631\u0628\u0633 \u062F\u062C\u0627\u062C \u0645\u0642\u0631\u0645\u0634 \u0630\u0647\u0628\u064A",
    url: "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0633\u062A\u0631\u0628\u0633", "\u062F\u062C\u0627\u062C", "\u0643\u0631\u0633\u0628\u064A", "\u062A\u0646\u062F\u0631", "\u0646\u062C\u062A\u0633", "\u0628\u0631\u0648\u0633\u062A\u062F", "strips", "tenders", "fried chicken", "nuggets"]
  },
  {
    name: "\u0623\u062C\u0646\u062D\u0629 \u062F\u062C\u0627\u062C \u0628\u0627\u0631\u0628\u0643\u064A\u0648 \u0648\u0628\u0627\u0641\u0644\u0648",
    url: "https://images.unsplash.com/photo-1527477321055-43615b629c95?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0627\u062C\u0646\u062D\u0629", "\u0623\u062C\u0646\u062D\u0629", "\u0648\u064A\u0646\u062C\u0632", "\u062F\u062C\u0627\u062C", "\u0628\u0627\u0631\u0628\u0643\u064A\u0648", "\u0628\u0627\u0641\u0644\u0648", "wings", "chicken"]
  },
  {
    name: "\u0631\u0627\u0628 \u062F\u062C\u0627\u062C \u0648\u062A\u0648\u0631\u062A\u064A\u0644\u0627 \u0633\u0628\u064A\u0634\u0627\u0644",
    url: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0631\u0627\u0628", "\u062A\u0648\u0631\u062A\u064A\u0644\u0627", "\u0641\u0627\u0647\u064A\u062A\u0627", "\u0633\u0627\u0646\u062F\u0648\u064A\u0634", "\u0635\u0627\u062C", "wrap", "tortilla", "sandwich"]
  },
  {
    name: "\u0634\u0627\u0648\u0631\u0645\u0627 \u0639\u0631\u0628\u064A \u0635\u0627\u062C \u0637\u0627\u0632\u062C",
    url: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0634\u0627\u0648\u0631\u0645\u0627", "\u0643\u0635", "\u0635\u0627\u062C", "\u0633\u0627\u0646\u062F\u0648\u064A\u0634", "\u0639\u0631\u0628\u064A", "shawarma", "kebab", "wrap"]
  },
  // Fries & Appetizers
  {
    name: "\u0628\u0637\u0627\u0637\u0627 \u0641\u0631\u0627\u064A\u0632 \u0645\u0642\u0631\u0645\u0634\u0629",
    url: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u0637\u0627\u0637\u0627", "\u0641\u0631\u0627\u064A\u0632", "\u0641\u0646\u06AF\u0631", "\u0641\u0646\u0643\u0631", "\u0645\u0642\u0631\u0645\u0634\u0629", "fries", "potato"]
  },
  {
    name: "\u0628\u0637\u0627\u0637\u0627 \u0628\u0627\u0644\u062C\u0628\u0646 \u0627\u0644\u0634\u064A\u062F\u0631 \u0648\u0627\u0644\u0647\u0644\u0627\u0628\u064A\u0646\u0648",
    url: "/uploads/hmo/item_046.jpg",
    tags: ["\u0628\u0637\u0627\u0637\u0627", "\u062C\u0628\u0646", "\u0641\u0631\u0627\u064A\u0632", "\u0634\u064A\u062F\u0631", "\u062A\u0634\u064A\u0643\u0646 \u0641\u0631\u0627\u064A\u0632", "\u0644\u0648\u062F\u064A\u062F", "cheese fries", "loaded fries"]
  },
  {
    name: "\u062D\u0644\u0642\u0627\u062A \u0628\u0635\u0644 \u0645\u0642\u0631\u0645\u0634\u0629 \u0630\u0647\u0628\u064A\u0629",
    url: "https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u0635\u0644", "\u062D\u0644\u0642\u0627\u062A", "\u0645\u0642\u0628\u0644\u0627\u062A", "\u0645\u0642\u0631\u0645\u0634", "onion rings", "appetizer"]
  },
  {
    name: "\u0623\u0635\u0627\u0628\u0639 \u0645\u0648\u0632\u0627\u0631\u064A\u0644\u0627 \u0645\u0642\u0631\u0645\u0634\u0629",
    url: "https://images.unsplash.com/photo-1531749668029-2db88e4276c7?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0645\u0648\u0632\u0627\u0631\u064A\u0644\u0627", "\u0627\u0635\u0627\u0628\u0639", "\u0623\u0635\u0627\u0628\u0639", "\u062C\u0628\u0646", "\u0645\u0642\u0628\u0644\u0627\u062A", "mozzarella", "cheese sticks"]
  },
  {
    name: "\u0633\u0644\u0637\u0629 \u0633\u064A\u0632\u0631 \u0648\u062E\u0636\u0631\u0648\u0627\u062A \u0637\u0627\u0632\u062C\u0629",
    url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0633\u0644\u0637\u0629", "\u0633\u064A\u0632\u0631", "\u0643\u0648\u0644\u0633\u0644\u0648", "\u0645\u0642\u0628\u0644\u0627\u062A", "\u062E\u0636\u0627\u0631", "\u0641\u062A\u0648\u0634", "\u062A\u0628\u0648\u0644\u0629", "salad", "coleslaw"]
  },
  {
    name: "\u062D\u0645\u0635 \u0628\u0627\u0644\u0637\u062D\u064A\u0646\u0629 \u0648\u0632\u064A\u062A \u0627\u0644\u0632\u064A\u062A\u0648\u0646",
    url: "https://images.unsplash.com/photo-1577906096429-f73c2c312435?auto=format&fit=crop&w=700&q=80",
    tags: ["\u062D\u0645\u0635", "\u0645\u062A\u0628\u0644", "\u0645\u0642\u0628\u0644\u0627\u062A", "\u0634\u0631\u0642\u064A", "hummus", "dip"]
  },
  // Sauces
  {
    name: "\u0635\u0648\u0635\u0627\u062A \u0645\u062A\u0646\u0648\u0639\u0629 (\u062B\u0648\u0645\u064A\u0629 / \u0634\u064A\u062F\u0631 / \u062F\u064A\u0646\u0627\u0645\u064A\u062A)",
    url: "https://images.unsplash.com/photo-1472476443507-c7a5948772fc?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0635\u0648\u0635", "\u0635\u0644\u0635\u0629", "\u0635\u0648\u0635\u0627\u062A", "\u062B\u0648\u0645\u064A\u0629", "\u0643\u0627\u062A\u0634\u0628", "\u0628\u0627\u0631\u0628\u0643\u064A\u0648", "\u0631\u0627\u0646\u0634", "\u062F\u064A\u0646\u0627\u0645\u064A\u062A", "\u062A\u0631\u0627\u0641\u0644", "sauce", "dip", "ketchup", "mayo"]
  },
  {
    name: "\u0635\u0648\u0635 \u062C\u0628\u0646 \u0634\u064A\u062F\u0631 \u0648\u0643\u0627\u0628 \u0627\u0644\u0633\u0631\u064A",
    url: "https://images.unsplash.com/photo-1607532941433-304659e8198a?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0635\u0648\u0635", "\u0635\u0644\u0635\u0629", "\u0634\u064A\u062F\u0631", "\u0645\u0627\u064A\u0648\u0646\u064A\u0632", "\u0643\u0648\u0644\u0633\u0644\u0648", "sauce", "dressing"]
  },
  // Cold Drinks, Sodas, Mojito & Water
  {
    name: "\u0645\u0634\u0631\u0648\u0628 \u063A\u0627\u0632\u064A \u0643\u0648\u0644\u0627 / \u0628\u064A\u0628\u0633\u064A \u0645\u062B\u0644\u062C",
    url: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u064A\u0628\u0633\u064A", "\u0643\u0648\u0644\u0627", "\u0643\u0648\u0643\u0627\u0643\u0648\u0644\u0627", "\u063A\u0627\u0632\u064A", "\u0645\u0634\u0631\u0648\u0628", "\u0645\u0634\u0631\u0648\u0628\u0627\u062A", "\u062F\u0627\u064A\u062A", "\u0633\u0641\u0646", "\u0645\u064A\u0631\u0646\u062F\u0627", "\u0633\u0628\u0631\u0627\u064A\u062A", "\u0643\u0627\u0646\u0632", "pepsi", "cola", "soda", "soft drink"]
  },
  {
    name: "\u0645\u0634\u0631\u0648\u0628\u0627\u062A \u063A\u0627\u0632\u064A\u0629 \u0628\u0627\u0631\u062F\u0629 \u0645\u0639 \u062B\u0644\u062C",
    url: "https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=700&q=80",
    tags: ["\u063A\u0627\u0632\u064A", "\u0628\u064A\u0628\u0633\u064A", "\u0643\u0648\u0644\u0627", "\u0628\u0627\u0631\u062F", "\u0645\u0634\u0631\u0648\u0628", "\u0633\u0641\u0646", "\u0645\u064A\u0631\u0646\u062F\u0627", "soda", "cola", "pepsi", "cold drink"]
  },
  {
    name: "\u0645\u0648\u0647\u064A\u062A\u0648 \u0644\u064A\u0645\u0648\u0646 \u0648\u0646\u0639\u0646\u0627\u0639 \u0645\u062B\u0644\u062C",
    url: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0645\u0648\u0647\u064A\u062A\u0648", "\u0639\u0635\u064A\u0631", "\u0644\u064A\u0645\u0648\u0646", "\u0646\u0639\u0646\u0627\u0639", "\u0628\u0644\u0648\u0628\u064A\u0631\u064A", "\u0641\u0631\u0627\u0648\u0644\u0629", "\u0645\u0634\u0631\u0648\u0628", "\u0628\u0627\u0631\u062F", "mojito", "juice", "cocktail"]
  },
  {
    name: "\u0639\u0635\u0627\u0626\u0631 \u0637\u0628\u064A\u0639\u064A\u0629 \u0637\u0627\u0632\u062C\u0629",
    url: "https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0639\u0635\u064A\u0631", "\u0628\u0631\u062A\u0642\u0627\u0644", "\u0645\u0627\u0646\u062C\u0648", "\u0641\u0648\u0627\u0643\u0647", "\u0637\u0628\u064A\u0639\u064A", "\u0645\u0634\u0631\u0648\u0628\u0627\u062A", "juice", "fresh juice"]
  },
  {
    name: "\u0645\u064A\u0627\u0647 \u0645\u0639\u062F\u0646\u064A\u0629 \u0628\u0627\u0631\u062F\u0629",
    url: "https://images.unsplash.com/photo-1560023907-5f339617ea30?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0645\u0627\u0621", "\u0645\u064A\u0627\u0647", "\u0645\u0639\u062F\u0646\u064A\u0629", "\u0642\u0646\u064A\u0646\u0629", "\u0628\u0627\u0631\u062F", "water", "bottle"]
  },
  // Pizza (Dedicated variety for بيتزا queries)
  {
    name: "\u0628\u064A\u062A\u0632\u0627 \u0628\u064A\u0628\u0631\u0648\u0646\u064A \u0648\u062C\u0628\u0646\u0629 \u0645\u0648\u0632\u0627\u0631\u064A\u0644\u0627",
    url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u064A\u062A\u0632\u0627", "\u0628\u064A\u0628\u0631\u0648\u0646\u064A", "\u062C\u0628\u0646", "\u0645\u0648\u0632\u0627\u0631\u064A\u0644\u0627", "pizza", "pepperoni"]
  },
  {
    name: "\u0628\u064A\u062A\u0632\u0627 \u0625\u064A\u0637\u0627\u0644\u064A\u0629 \u0641\u0631\u0646 \u062D\u0637\u0628",
    url: "https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u064A\u062A\u0632\u0627", "\u0633\u0628\u064A\u0634\u0627\u0644", "\u0628\u064A\u0628\u0631\u0648\u0646\u064A", "pizza", "wood fired"]
  },
  {
    name: "\u0628\u064A\u062A\u0632\u0627 \u0645\u0627\u0631\u063A\u0631\u064A\u062A\u0627 \u0628\u0627\u0644\u0631\u064A\u062D\u0627\u0646 \u0648\u0627\u0644\u0637\u0645\u0627\u0637\u0645",
    url: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u064A\u062A\u0632\u0627", "\u0645\u0627\u0631\u063A\u0631\u064A\u062A\u0627", "\u0645\u0631\u063A\u0631\u064A\u062A\u0627", "\u0646\u0628\u0627\u062A\u064A", "\u062C\u0628\u0646", "pizza", "margherita"]
  },
  {
    name: "\u0628\u064A\u062A\u0632\u0627 \u062F\u062C\u0627\u062C \u0631\u0627\u0646\u0634 \u0648\u0628\u0627\u0631\u0628\u0643\u064A\u0648",
    url: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u064A\u062A\u0632\u0627", "\u0631\u0627\u0646\u0634", "\u062F\u062C\u0627\u062C", "\u0628\u0627\u0631\u0628\u0643\u064A\u0648", "\u062E\u0636\u0627\u0631", "pizza", "chicken", "ranch"]
  },
  {
    name: "\u0628\u064A\u062A\u0632\u0627 \u0623\u062C\u0628\u0627\u0646 \u0623\u0631\u0628\u0639\u0629 \u0648\u0633\u0648\u0628\u0631\u064A\u0645",
    url: "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u064A\u062A\u0632\u0627", "\u0633\u0648\u0628\u0631\u064A\u0645", "\u0627\u062C\u0628\u0627\u0646", "\u0623\u062C\u0628\u0627\u0646", "\u0644\u062D\u0645", "pizza", "supreme", "cheese"]
  },
  {
    name: "\u0628\u064A\u062A\u0632\u0627 \u062E\u0636\u0627\u0631 \u0648\u0641\u0637\u0631 \u0648\u0632\u064A\u062A\u0648\u0646",
    url: "https://images.unsplash.com/photo-1595854341625-f33ee10dbf94?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u064A\u062A\u0632\u0627", "\u062E\u0636\u0627\u0631", "\u0641\u0637\u0631", "\u0645\u0634\u0631\u0648\u0645", "\u0632\u064A\u062A\u0648\u0646", "pizza", "veggie"]
  },
  // Grills, Rice & Coffee
  {
    name: "\u0645\u0634\u0627\u0648\u064A \u0648\u0643\u0628\u0627\u0628 \u0639\u0631\u0627\u0642\u064A \u0639\u0644\u0649 \u0627\u0644\u0641\u062D\u0645",
    url: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0643\u0628\u0627\u0628", "\u0645\u0634\u0627\u0648\u064A", "\u062A\u0643\u0629", "\u062A\u0643\u0647", "\u0634\u064A\u0634", "\u0641\u062D\u0645", "\u0644\u062D\u0645", "grill", "kebab", "bbq"]
  },
  {
    name: "\u0631\u064A\u0632\u0648 \u062F\u062C\u0627\u062C \u0645\u0639 \u0635\u0648\u0635 \u062E\u0627\u0635",
    url: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0631\u064A\u0632\u0648", "\u0631\u0632", "\u0627\u0631\u0632", "\u0623\u0631\u0632", "\u0645\u0646\u062F\u064A", "\u0628\u0631\u064A\u0627\u0646\u064A", "\u062A\u0645\u0646", "\u0634\u0631\u0642\u064A", "rice", "rizo"]
  },
  {
    name: "\u0642\u0647\u0648\u0629 \u0644\u0627\u062A\u064A\u0647 \u0648\u0627\u0633\u0628\u0631\u064A\u0633\u0648 \u0648\u0643\u0627\u0628\u062A\u0634\u064A\u0646\u0648",
    url: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0642\u0647\u0648\u0629", "\u0644\u0627\u062A\u064A\u0647", "\u0627\u0633\u0628\u0631\u064A\u0633\u0648", "\u0643\u0627\u0628\u062A\u0634\u064A\u0646\u0648", "\u0627\u0645\u0631\u064A\u0643\u0627\u0646\u0648", "\u0645\u0648\u0643\u0627", "\u0627\u064A\u0633", "\u0643\u0627\u0641\u064A\u0647", "coffee", "latte", "espresso"]
  },
  {
    name: "\u0643\u0631\u064A\u0628 \u0648\u0648\u0627\u0641\u0644 \u0648\u0628\u0627\u0646 \u0643\u064A\u0643 \u0628\u0627\u0644\u0634\u0648\u0643\u0648\u0644\u0627\u062A\u0629",
    url: "https://images.unsplash.com/photo-1519676867240-f03562e64548?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0643\u0631\u064A\u0628", "\u0648\u0627\u0641\u0644", "\u0628\u0627\u0646 \u0643\u064A\u0643", "\u0646\u0648\u062A\u064A\u0644\u0627", "\u0634\u0648\u0643\u0648\u0644\u0627\u062A\u0629", "\u062D\u0644\u0648\u064A\u0627\u062A", "\u062D\u0644\u0627", "crepe", "waffle", "pancake", "dessert"]
  },
  // Cakes, Pastries & Desserts (Dedicated variety for كيكة / كيك queries)
  {
    name: "\u0643\u064A\u0643\u0629 \u0634\u0648\u0643\u0648\u0644\u0627\u062A\u0629 \u063A\u0646\u064A\u0629 \u0628\u0627\u0644\u0635\u0648\u0635",
    url: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0643\u064A\u0643", "\u0643\u064A\u0643\u0629", "\u0643\u064A\u0643\u0647", "\u0634\u0648\u0643\u0648\u0644\u0627\u062A\u0629", "\u0634\u0648\u0643\u0644\u062A", "\u062A\u0648\u0631\u062A\u0629", "\u062A\u0648\u0631\u062A\u0647", "\u062D\u0644\u0627", "\u062D\u0644\u0648\u064A\u0627\u062A", "cake", "chocolate cake"]
  },
  {
    name: "\u062A\u0634\u064A\u0632 \u0643\u064A\u0643 \u0628\u0627\u0644\u062A\u0648\u062A \u0648\u0627\u0644\u0641\u0631\u0627\u0648\u0644\u0629",
    url: "https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0643\u064A\u0643", "\u0643\u064A\u0643\u0629", "\u0643\u064A\u0643\u0647", "\u062A\u0634\u064A\u0632", "\u0641\u0631\u0627\u0648\u0644\u0629", "\u062D\u0644\u0627", "\u062D\u0644\u0648\u064A\u0627\u062A", "cake", "cheesecake", "dessert"]
  },
  {
    name: "\u0643\u064A\u0643 \u0641\u0627\u0646\u064A\u0644\u0627 \u0628\u0627\u0644\u0643\u0631\u064A\u0645\u0629 \u0648\u0627\u0644\u0641\u0648\u0627\u0643\u0647",
    url: "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0643\u064A\u0643", "\u0643\u064A\u0643\u0629", "\u0643\u064A\u0643\u0647", "\u0641\u0627\u0646\u064A\u0644\u0627", "\u0643\u0631\u064A\u0645\u0629", "\u0641\u0648\u0627\u0643\u0647", "\u0639\u064A\u062F \u0645\u064A\u0644\u0627\u062F", "\u062A\u0648\u0631\u062A\u0629", "cake", "cream cake"]
  },
  {
    name: "\u0643\u064A\u0643 \u0631\u064A\u062F \u0641\u064A\u0644\u0641\u064A\u062A \u0648\u062A\u0648\u0631\u062A\u0629 \u0641\u0627\u062E\u0631\u0629",
    url: "https://images.unsplash.com/photo-1616541823729-00fe0aacd32c?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0643\u064A\u0643", "\u0643\u064A\u0643\u0629", "\u0643\u064A\u0643\u0647", "\u0631\u064A\u062F \u0641\u064A\u0644\u0641\u064A\u062A", "\u0641\u064A\u0644\u0641\u064A\u062A", "\u062A\u0648\u0631\u062A\u0629", "\u062D\u0644\u0627", "cake", "red velvet"]
  },
  {
    name: "\u062A\u0648\u0631\u062A\u0629 \u0627\u062D\u062A\u0641\u0627\u0644\u0627\u062A \u0648\u0645\u0646\u0627\u0633\u0628\u0627\u062A \u062E\u0627\u0635\u0629",
    url: "https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0643\u064A\u0643", "\u0643\u064A\u0643\u0629", "\u0643\u064A\u0643\u0647", "\u062A\u0648\u0631\u062A\u0629", "\u062A\u0648\u0631\u062A\u0647", "\u0643\u0639\u0643\u0629", "\u0643\u0639\u0643", "\u0639\u064A\u062F \u0645\u064A\u0644\u0627\u062F", "birthday cake", "cake"]
  },
  {
    name: "\u0643\u0628 \u0643\u064A\u0643 \u0648\u0645\u064A\u0646\u064A \u0643\u064A\u0643 \u0645\u0632\u064A\u0646",
    url: "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0643\u064A\u0643", "\u0643\u064A\u0643\u0629", "\u0643\u064A\u0643\u0647", "\u0643\u0628 \u0643\u064A\u0643", "\u0645\u0627\u0641\u0646", "\u062D\u0644\u0627", "\u062D\u0644\u0648\u064A\u0627\u062A", "cupcake", "cake", "muffin"]
  },
  {
    name: "\u0645\u064A\u0644\u0643 \u0634\u064A\u0643 \u0648\u0628\u0648\u0638\u0629 \u0622\u064A\u0633 \u0643\u0631\u064A\u0645",
    url: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0645\u064A\u0644\u0643 \u0634\u064A\u0643", "\u0634\u064A\u0643", "\u0627\u064A\u0633 \u0643\u0631\u064A\u0645", "\u0645\u062B\u0644\u062C\u0627\u062A", "\u0641\u0631\u0627\u0648\u0644\u0629", "\u0627\u0648\u0631\u064A\u0648", "milkshake", "shake", "ice cream"]
  },
  // Store & General Business Products (For non-restaurant shops)
  {
    name: "\u0639\u0637\u0648\u0631 \u0641\u0627\u062E\u0631\u0629 \u0648\u0645\u0633\u062A\u062D\u0636\u0631\u0627\u062A \u062A\u062C\u0645\u064A\u0644",
    url: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0639\u0637\u0631", "\u0639\u0637\u0648\u0631", "\u0628\u062E\u0648\u0631", "\u062A\u062C\u0645\u064A\u0644", "\u0645\u0633\u0643", "perfume", "fragrance"]
  },
  {
    name: "\u0632\u062C\u0627\u062C\u0629 \u0639\u0637\u0631 \u0641\u0631\u0646\u0633\u064A \u0641\u0627\u062E\u0631\u0629",
    url: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0639\u0637\u0631", "\u0639\u0637\u0648\u0631", "\u0628\u0631\u0641\u0627\u0646", "\u0639\u0648\u062F", "\u062A\u062C\u0645\u064A\u0644", "perfume", "cologne"]
  },
  {
    name: "\u0645\u0633\u062A\u062D\u0636\u0631\u0627\u062A \u0639\u0646\u0627\u064A\u0629 \u0628\u0627\u0644\u0628\u0634\u0631\u0629 \u0648\u0645\u0643\u064A\u0627\u062C",
    url: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0645\u0643\u064A\u0627\u062C", "\u062A\u062C\u0645\u064A\u0644", "\u0643\u0631\u064A\u0645", "\u0628\u0634\u0631\u0629", "\u0631\u0648\u062C", "cosmetics", "makeup", "skincare"]
  },
  {
    name: "\u0633\u0627\u0639\u0629 \u064A\u062F \u0630\u0643\u064A\u0629 \u0648\u0643\u0644\u0627\u0633\u064A\u0643",
    url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0633\u0627\u0639\u0629", "\u0633\u0627\u0639\u0627\u062A", "\u0630\u0643\u064A\u0629", "\u0627\u0643\u0633\u0633\u0648\u0627\u0631", "watch", "smartwatch"]
  },
  {
    name: "\u0633\u0627\u0639\u0629 \u064A\u062F \u0643\u0644\u0627\u0633\u064A\u0643\u064A\u0629 \u0641\u062E\u0645\u0629",
    url: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0633\u0627\u0639\u0629", "\u0633\u0627\u0639\u0627\u062A", "\u0631\u062C\u0627\u0644\u064A", "\u0627\u0643\u0633\u0633\u0648\u0627\u0631", "watch", "luxury watch"]
  },
  {
    name: "\u0645\u0644\u0627\u0628\u0633 \u0648\u0623\u0632\u064A\u0627\u0621 \u0639\u0635\u0631\u064A\u0629",
    url: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0645\u0644\u0627\u0628\u0633", "\u062A\u064A\u0634\u064A\u0631\u062A", "\u0642\u0645\u064A\u0635", "\u0627\u0632\u064A\u0627\u0621", "\u0623\u0632\u064A\u0627\u0621", "\u0628\u0648\u062A\u064A\u0643", "clothes", "shirt", "fashion"]
  },
  {
    name: "\u0641\u0633\u062A\u0627\u0646 \u0648\u0623\u0632\u064A\u0627\u0621 \u0646\u0633\u0627\u0626\u064A\u0629 \u0623\u0646\u064A\u0642\u0629",
    url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0641\u0633\u062A\u0627\u0646", "\u0645\u0644\u0627\u0628\u0633", "\u0646\u0633\u0627\u0626\u064A", "\u0623\u0632\u064A\u0627\u0621", "\u0628\u0648\u062A\u064A\u0643", "dress", "fashion"]
  },
  {
    name: "\u0623\u062D\u0630\u064A\u0629 \u0631\u064A\u0627\u0636\u064A\u0629 \u0648\u0633\u0646\u064A\u0643\u0631\u0632",
    url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=80",
    tags: ["\u062D\u0630\u0627\u0621", "\u0627\u062D\u0630\u064A\u0629", "\u0623\u062D\u0630\u064A\u0629", "\u0633\u0646\u064A\u0643\u0631\u0632", "\u0631\u064A\u0627\u0636\u064A", "shoes", "sneakers"]
  },
  {
    name: "\u062D\u0630\u0627\u0621 \u0631\u064A\u0627\u0636\u064A \u0623\u0628\u064A\u0636 \u0645\u0648\u062F\u0631\u0646",
    url: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=700&q=80",
    tags: ["\u062D\u0630\u0627\u0621", "\u0627\u062D\u0630\u064A\u0629", "\u0633\u0646\u064A\u0643\u0631\u0632", "\u0634\u0648\u0632", "shoes", "sneakers"]
  },
  {
    name: "\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0627\u062A \u0648\u0647\u0648\u0627\u062A\u0641 \u0648\u0633\u0645\u0627\u0639\u0627\u062A",
    url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0633\u0645\u0627\u0639\u0629", "\u0633\u0645\u0627\u0639\u0627\u062A", "\u0627\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0627\u062A", "\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0627\u062A", "\u0647\u0627\u062A\u0641", "\u0645\u0648\u0628\u0627\u064A\u0644", "\u0627\u062C\u0647\u0632\u0629", "headphones", "electronics"]
  },
  {
    name: "\u0647\u0627\u062A\u0641 \u0630\u0643\u064A \u0648\u0627\u0643\u0633\u0633\u0648\u0627\u0631\u0627\u062A \u062A\u0642\u0646\u064A\u0629",
    url: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0647\u0627\u062A\u0641", "\u0645\u0648\u0628\u0627\u064A\u0644", "\u0627\u064A\u0641\u0648\u0646", "\u062C\u0648\u0627\u0644", "\u062A\u0642\u0646\u064A\u0629", "phone", "smartphone", "mobile"]
  },
  {
    name: "\u0628\u0627\u0642\u0629 \u0648\u0631\u062F \u0648\u0647\u062F\u0627\u064A\u0627 \u0623\u0646\u064A\u0642\u0629",
    url: "https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0648\u0631\u062F", "\u0648\u0631\u0648\u062F", "\u0647\u062F\u064A\u0629", "\u0647\u062F\u0627\u064A\u0627", "\u0628\u0627\u0642\u0629", "\u0632\u0647\u0648\u0631", "flowers", "gift"]
  },
  {
    name: "\u0628\u0648\u0643\u0633 \u0647\u062F\u0627\u064A\u0627 \u0648\u0648\u0631\u062F \u0637\u0628\u064A\u0639\u064A",
    url: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0647\u062F\u064A\u0629", "\u0647\u062F\u0627\u064A\u0627", "\u0628\u0648\u0643\u0633", "\u0648\u0631\u062F", "\u0645\u0646\u0627\u0633\u0628\u0627\u062A", "gift", "present"]
  },
  // Grills, Iraqi & Oriental Dishes, Pasta, Seafood, Breakfast, Sweets & Coffee Variety
  {
    name: "\u0643\u0628\u0627\u0628 \u0645\u0634\u0648\u064A \u0639\u0644\u0649 \u0627\u0644\u0641\u062D\u0645 \u0645\u0639 \u062E\u0628\u0632",
    url: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0643\u0628\u0627\u0628", "\u0645\u0634\u0627\u0648\u064A", "\u0644\u062D\u0645", "\u0631\u064A\u0634", "\u0634\u0648\u064A", "\u0633\u062A\u064A\u0643", "grill", "kebab", "steak"]
  },
  {
    name: "\u0634\u064A\u0634 \u0637\u0627\u0648\u0648\u0642 \u0648\u062A\u0643\u0629 \u062F\u062C\u0627\u062C \u0645\u0634\u0648\u064A\u0629",
    url: "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0634\u064A\u0634", "\u062A\u0643\u0629", "\u062A\u0643\u0647", "\u0637\u0627\u0648\u0648\u0642", "\u062F\u062C\u0627\u062C", "\u0645\u0634\u0627\u0648\u064A", "\u0643\u0628\u0627\u0628", "kebab", "skewer", "chicken"]
  },
  {
    name: "\u0634\u0627\u0648\u0631\u0645\u0627 \u0644\u062D\u0645 \u0648\u062F\u062C\u0627\u062C \u0639\u0631\u0628\u064A",
    url: "https://images.unsplash.com/photo-1561651823-34feb02250e4?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0634\u0627\u0648\u0631\u0645\u0627", "\u0643\u0635", "\u0635\u0627\u062C", "\u0641\u0644\u0627\u0641\u0644", "\u0633\u0627\u0646\u062F\u0648\u064A\u0634", "shawarma", "doner", "wrap"]
  },
  {
    name: "\u062F\u062C\u0627\u062C \u0628\u0631\u0648\u0633\u062A\u062F \u0648\u0645\u0642\u0644\u064A \u0645\u0642\u0631\u0645\u0634",
    url: "https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u0631\u0648\u0633\u062A\u062F", "\u062F\u062C\u0627\u062C", "\u0643\u0646\u062A\u0627\u0643\u064A", "\u0645\u0642\u0631\u0645\u0634", "\u0641\u0631\u0627\u064A\u062F", "\u0648\u062C\u0628\u0629", "fried chicken", "broast"]
  },
  {
    name: "\u0628\u0631\u064A\u0627\u0646\u064A \u0648\u0645\u0646\u062F\u064A \u0648\u0643\u0628\u0633\u0629 \u062F\u062C\u0627\u062C",
    url: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u0631\u064A\u0627\u0646\u064A", "\u0645\u0646\u062F\u064A", "\u0643\u0628\u0633\u0629", "\u0642\u0648\u0632\u064A", "\u0631\u0632", "\u062A\u0645\u0646", "\u062F\u062C\u0627\u062C", "\u0644\u062D\u0645", "biryani", "rice", "mandi"]
  },
  {
    name: "\u0628\u0627\u0633\u062A\u0627 \u0648\u0645\u0639\u0643\u0631\u0648\u0646\u0629 \u0628\u0635\u0648\u0635 \u0623\u0644\u0641\u0631\u064A\u062F\u0648 \u0648\u0627\u0644\u0637\u0645\u0627\u0637\u0645",
    url: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0628\u0627\u0633\u062A\u0627", "\u0645\u0639\u0643\u0631\u0648\u0646\u0629", "\u0633\u0628\u0627\u063A\u064A\u062A\u064A", "\u0641\u064A\u062A\u0648\u062A\u0634\u064A\u0646\u064A", "\u0628\u064A\u0646\u064A", "\u0627\u064A\u0637\u0627\u0644\u064A", "pasta", "spaghetti", "alfredo"]
  },
  {
    name: "\u0633\u0645\u0643 \u0645\u0634\u0648\u064A \u0648\u0645\u0623\u0643\u0648\u0644\u0627\u062A \u0628\u062D\u0631\u064A\u0629",
    url: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0633\u0645\u0643", "\u0645\u0633\u0642\u0648\u0641", "\u0628\u062D\u0631\u064A\u0629", "\u0631\u0648\u0628\u064A\u0627\u0646", "\u062C\u0645\u0628\u0631\u064A", "\u0633\u0644\u0645\u0648\u0646", "fish", "seafood", "salmon"]
  },
  {
    name: "\u0641\u0637\u0648\u0631 \u0635\u0628\u0627\u062D\u064A \u0648\u0643\u0631\u0648\u0633\u0627\u0646 \u0648\u0628\u064A\u0636",
    url: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0641\u0637\u0648\u0631", "\u0631\u064A\u0648\u0643", "\u0631\u064A\u0648\u0642", "\u0635\u0628\u0627\u062D\u064A", "\u0628\u064A\u0636", "\u0643\u0631\u0648\u0633\u0627\u0646", "\u0645\u0639\u062C\u0646\u0627\u062A", "breakfast", "brunch"]
  },
  {
    name: "\u0627\u064A\u0633 \u0644\u0627\u062A\u064A\u0647 \u0648\u0642\u0647\u0648\u0629 \u0645\u062B\u0644\u062C\u0629",
    url: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0627\u064A\u0633", "\u0644\u0627\u062A\u064A\u0647", "\u0642\u0647\u0648\u0629", "\u0633\u0628\u0627\u0646\u0634", "\u0643\u0627\u0641\u064A\u0647", "\u0628\u0627\u0631\u062F", "iced coffee", "latte", "cold brew"]
  },
  {
    name: "\u0643\u0627\u0628\u062A\u0634\u064A\u0646\u0648 \u0648\u0625\u0633\u0628\u0631\u064A\u0633\u0648 \u0637\u0627\u0632\u062C",
    url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0642\u0647\u0648\u0629", "\u0627\u0633\u0628\u0631\u064A\u0633\u0648", "\u0627\u0645\u0631\u064A\u0643\u0627\u0646\u0648", "\u0643\u0627\u0628\u062A\u0634\u064A\u0646\u0648", "\u0645\u0648\u0643\u0627", "\u0634\u0627\u064A", "coffee", "espresso"]
  },
  {
    name: "\u0643\u0646\u0627\u0641\u0629 \u0648\u0628\u0642\u0644\u0627\u0648\u0629 \u0648\u062D\u0644\u0648\u064A\u0627\u062A \u0634\u0631\u0642\u064A\u0629",
    url: "https://images.unsplash.com/photo-1519676867240-f03562e64548?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0643\u0646\u0627\u0641\u0629", "\u0628\u0642\u0644\u0627\u0648\u0629", "\u0634\u0631\u0642\u064A\u0629", "\u062D\u0644\u0648\u064A\u0627\u062A", "\u062D\u0644\u0627", "\u0646\u0648\u062A\u064A\u0644\u0627", "kunafa", "baklava", "sweets"]
  },
  {
    name: "\u062F\u0648\u0646\u0627\u062A \u0648\u0634\u0648\u0643\u0648\u0644\u0627\u062A\u0629 \u0645\u062D\u0634\u0648\u0629",
    url: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=700&q=80",
    tags: ["\u062F\u0648\u0646\u0627\u062A", "\u062D\u0644\u0648\u064A", "\u062D\u0644\u0648\u064A\u0627\u062A", "\u062D\u0644\u0627", "\u0643\u064A\u0643", "\u0634\u0648\u0643\u0648\u0644\u0627\u062A\u0629", "donut", "donuts", "dessert"]
  },
  {
    name: "\u0639\u0635\u064A\u0631 \u0645\u0627\u0646\u062C\u0648 \u0648\u0641\u0631\u0627\u0648\u0644\u0629 \u0637\u0628\u064A\u0639\u064A",
    url: "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0639\u0635\u064A\u0631", "\u0633\u0645\u0648\u062B\u064A", "\u0641\u0631\u0627\u0648\u0644\u0629", "\u0645\u0627\u0646\u062C\u0648", "\u0641\u0648\u0627\u0643\u0647", "\u0637\u0628\u064A\u0639\u064A", "juice", "smoothie"]
  },
  {
    name: "\u0645\u0646\u062A\u062C\u0627\u062A \u0628\u0642\u0627\u0644\u0629 \u0648\u0633\u0648\u0628\u0631\u0645\u0627\u0631\u0643\u062A \u0637\u0627\u0632\u062C\u0629",
    url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=700&q=80",
    tags: ["\u0633\u0648\u0628\u0631\u0645\u0627\u0631\u0643\u062A", "\u0628\u0642\u0627\u0644\u0629", "\u062E\u0636\u0631\u0648\u0627\u062A", "\u0641\u0648\u0627\u0643\u0647", "\u0645\u0648\u0627\u062F \u063A\u0630\u0627\u0626\u064A\u0629", "\u0645\u062A\u062C\u0631", "grocery", "supermarket"]
  }
];
function normAr(input) {
  return String(input || "").toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/ؤ/g, "\u0648").replace(/ئ/g, "\u064A").trim();
}
var AR_TO_EN_DICT = [
  [/بيبسي|كولا|كوكاكولا/i, "pepsi cola soda"],
  [/سفن|سبرايت|ميرندا|فانتا/i, "soda cold drink"],
  [/موهيتو/i, "mojito drink"],
  [/عصير|سموثي|برتقال|مانجو/i, "fresh juice smoothie"],
  [/ماء|مياه/i, "water bottle"],
  [/سماش|برجر|همبرجر|تشيز برجر/i, "cheeseburger burger"],
  [/بروستد|كرسبي|زنجر|تندر|ستربس/i, "fried chicken crispy"],
  [/اجنحة|أجنحة|وينجز/i, "chicken wings"],
  [/بطاطا|فرايز|فنكر|فنگر/i, "french fries"],
  [/صوص|صلصة|ثومية|كاتشب|مايونيز/i, "dipping sauce"],
  [/بيتزا|بيبروني|مارغريتا|مرغريتا/i, "pepperoni pizza"],
  [/شاورما|كص|صاج/i, "shawarma wrap"],
  [/كباب|تكة|تكه|مشاوي|شيش/i, "kebab grill meat"],
  [/ريزو|رز|ارز|تمن|برياني|مندي|كبسة/i, "biryani chicken rice"],
  [/باستا|معكرونة|سباغيتي|فيتوتشيني/i, "pasta spaghetti"],
  [/سمك|مسقوف|روبيان|جمبري/i, "grilled fish seafood"],
  [/فطور|ريوك|ريوق|كروسان/i, "breakfast croissant"],
  [/راب|تورتيلا|فاهيتا|ساندويش/i, "sandwich wrap"],
  [/حلقات بصل/i, "onion rings"],
  [/موزاريلا/i, "mozzarella sticks"],
  [/سلطة|كولسلو|فتوش|تبولة/i, "salad bowl"],
  [/حمص/i, "hummus dish"],
  [/قهوة|لاتيه|اسبريسو|كابتشينو|موكا|ايس/i, "latte coffee cup"],
  [/كريب|وافل|بان كيك|كنافة|بقلاوة|دونات/i, "waffle dessert pastry"],
  [/كيكة|كيكه|كيك|تشيز كيك|تورتة|تورته|كعك|حلا|حلويات/i, "chocolate cake dessert"],
  [/ميلك شيك|ايس كريم/i, "milkshake ice cream"],
  [/بوكس|وجبة|كومبو/i, "burger fries meal"],
  [/عطر|عطور|عود/i, "perfume bottle"],
  [/مكياج|تجميل|بشرة/i, "cosmetics makeup"],
  [/ساعة|ساعات/i, "wristwatch"],
  [/ملابس|قميص|تيشيرت|بوتيك|فستان/i, "fashion apparel"],
  [/حذاء|احذية|سنيكرز/i, "sneakers shoe"],
  [/سماعة|الكترونيات|هاتف|موبايل/i, "headphones smartphone"],
  [/ورد|ورود|هدية|هدايا/i, "flower bouquet"],
  [/سوبرماركت|بقالة/i, "fresh grocery produce"]
];
function translateArabicToEnglishQuery(rawQuery) {
  const norm = normAr(rawQuery);
  const matched = [];
  for (const [regex, enTerm] of AR_TO_EN_DICT) {
    if (regex.test(rawQuery) || regex.test(norm)) {
      matched.push(enTerm);
    }
  }
  if (matched.length > 0) {
    return matched.slice(0, 2).join(" ");
  }
  return rawQuery;
}
async function fetchWikimediaImages(searchTerm, limit, offset = 0) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const safeOffset = Math.max(0, Math.min(80, Math.floor(offset)));
    const fetchLimit = Math.min(24, limit + 10);
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      searchTerm
    )}&gsrlimit=${fetchLimit}&gsroffset=${safeOffset}&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=640&format=json`;
    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MenuPlusApp/1.0 (https://menuplus.app)",
        Accept: "application/json"
      }
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const pages = Object.values(data.query?.pages || {});
    const kwTokens = searchTerm.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    const results = [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      const mime = String(info?.mime || "").toLowerCase();
      const chosenUrl = info?.thumburl || info?.url;
      if (!chosenUrl || !mime.startsWith("image/jpeg") && !mime.startsWith("image/png") && !mime.startsWith("image/webp")) continue;
      if (info?.width && info.width < 200 || info?.height && info.height < 160) continue;
      const cleanTitle = (page.title || searchTerm).replace(/^File:/i, "").replace(/\.[a-z0-9]+$/i, "");
      const titleLower = cleanTitle.toLowerCase();
      if (titleLower.includes("map") || titleLower.includes("logo") || titleLower.includes("diagram") || titleLower.includes("flag") || titleLower.includes("icon") || titleLower.includes("chart") || titleLower.includes("stamp") || titleLower.includes("sign")) {
        continue;
      }
      if (kwTokens.length > 0 && !kwTokens.some((tok) => titleLower.includes(tok))) {
        continue;
      }
      results.push({
        id: `wiki_${page.pageid}_${safeOffset}`,
        name: cleanTitle,
        title: cleanTitle,
        url: chosenUrl,
        thumb: chosenUrl,
        source: "web"
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch {
    return [];
  }
}
async function searchWebImages(query, limit = 16, offset = 0, seed = 0, excludeUrls = []) {
  const cleanQuery = String(query || "").trim();
  const qNorm = normAr(cleanQuery);
  const excludedSet = new Set(excludeUrls.map((u) => String(u || "").trim()).filter(Boolean));
  if (!cleanQuery) {
    const len = CURATED_IMAGE_CATALOG.length;
    const startIdx = len > 0 ? Math.abs(offset + seed * 4) % len : 0;
    const rotated = [...CURATED_IMAGE_CATALOG.slice(startIdx), ...CURATED_IMAGE_CATALOG.slice(0, startIdx)];
    const filtered = rotated.filter((it) => !excludedSet.has(it.url));
    const sourceList = filtered.length >= Math.min(limit, 4) ? filtered : rotated;
    return sourceList.slice(0, limit).map((it, idx) => ({
      id: `curated_${startIdx}_${idx}`,
      name: it.name,
      title: it.name,
      url: it.url,
      thumb: it.url,
      source: "curated"
    }));
  }
  const rawTokens = qNorm.split(/[\s,،.\-/+]+/).filter((t) => t.length >= 2);
  const tokens = Array.from(
    new Set(rawTokens.flatMap((t) => t.startsWith("\u0627\u0644") && t.length > 3 ? [t, t.slice(2)] : [t]))
  );
  const scored = CURATED_IMAGE_CATALOG.map((it, idx) => {
    let score = 0;
    const normTags = it.tags.map((tg) => normAr(tg));
    const normName = normAr(it.name);
    const haystack = `${normName} ${normTags.join(" ")}`;
    if (haystack.includes(qNorm)) score += 10;
    for (const tok of tokens) {
      if (normTags.some((tg) => tg === tok)) score += 9;
      else if (normTags.some((tg) => tg.includes(tok) || tg.length >= 3 && tok.includes(tg))) score += 5;
      else if (normName.includes(tok)) score += 3;
    }
    return { it, idx, score };
  }).filter((entry) => entry.score >= 5).sort((a, b) => b.score - a.score);
  const curatedPool = scored.map((entry) => ({
    id: `curated_${entry.idx}`,
    name: entry.it.name,
    title: entry.it.name,
    url: entry.it.url,
    thumb: entry.it.url,
    source: "curated"
  }));
  const searchKeyword = translateArabicToEnglishQuery(cleanQuery);
  const wikiOffset = Math.max(0, offset + seed * 6);
  const neededWeb = Math.max(limit, 12);
  let webResults = await fetchWikimediaImages(searchKeyword, neededWeb, wikiOffset);
  if (webResults.length < 4 && wikiOffset > 0) {
    const extra = await fetchWikimediaImages(searchKeyword, neededWeb, 0);
    webResults = [...webResults, ...extra];
  }
  const unseenCurated = curatedPool.filter((r) => !excludedSet.has(r.url));
  const unseenWeb = webResults.filter((r) => !excludedSet.has(r.url));
  const seenUrls = /* @__PURE__ */ new Set();
  const combined = [];
  const orderedCandidates = seed > 0 ? [...unseenCurated, ...unseenWeb, ...webResults, ...curatedPool] : [...curatedPool, ...unseenWeb, ...webResults];
  for (const r of orderedCandidates) {
    if (seed > 0 && excludedSet.has(r.url) && combined.length < limit) {
      continue;
    }
    if (!seenUrls.has(r.url)) {
      seenUrls.add(r.url);
      combined.push(r);
    }
    if (combined.length >= limit) break;
  }
  if (combined.length < Math.min(4, limit)) {
    for (const r of [...unseenCurated, ...unseenWeb, ...curatedPool, ...webResults]) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        combined.push(r);
      }
      if (combined.length >= limit) break;
    }
  }
  return combined.slice(0, limit);
}
var MAX_PROXY_IMAGE_BYTES = 5 * 1024 * 1024;
var PROXY_TIMEOUT_MS = 8e3;
var MAX_REDIRECTS = 3;
function isPrivateIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}
function isPrivateIp(ip) {
  const clean = ip.split("%")[0].trim().toLowerCase();
  const ver = net.isIP(clean);
  if (ver === 4) return isPrivateIpv4(clean);
  if (ver === 6) {
    if (clean === "::" || clean === "::1") return true;
    if (clean.startsWith("fc") || clean.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(clean)) return true;
    if (clean.startsWith("ff")) return true;
    const mappedV4 = clean.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedV4) return isPrivateIpv4(mappedV4[1]);
    return false;
  }
  return true;
}
async function assertSafeExternalImageUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Unsupported URL protocol");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL credentials are not allowed");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal") {
    throw new Error("Disallowed target host");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Disallowed private IP address");
    return parsed;
  }
  const records = await dns.lookup(host, { all: true });
  if (!records || records.length === 0) {
    throw new Error("Host resolution failed");
  }
  for (const rec of records) {
    if (isPrivateIp(rec.address)) {
      throw new Error("Resolved IP is in a restricted network");
    }
  }
  return parsed;
}
async function proxyExternalImage(targetUrl) {
  try {
    if (!targetUrl || typeof targetUrl !== "string" || targetUrl.length > 2048) {
      return { status: 400, contentType: "application/json", error: "Invalid URL" };
    }
    let currentUrl = await assertSafeExternalImageUrl(targetUrl.trim());
    let response = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(currentUrl.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
        headers: {
          "User-Agent": "MenuPlusImageProxy/1.0",
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5"
        }
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || hop === MAX_REDIRECTS) {
          return { status: 400, contentType: "application/json", error: "Redirect limit exceeded" };
        }
        const resolvedRedirect = new URL(location, currentUrl).toString();
        currentUrl = await assertSafeExternalImageUrl(resolvedRedirect);
        continue;
      }
      break;
    }
    if (!response || !response.ok) {
      return {
        status: response?.status || 502,
        contentType: "application/json",
        error: `Failed to fetch image: ${response?.statusText || "Upstream error"}`
      };
    }
    const rawContentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!rawContentType.startsWith("image/") || rawContentType.includes("svg") || rawContentType.includes("xml") || rawContentType.includes("html")) {
      return {
        status: 415,
        contentType: "application/json",
        error: "Unsupported image media type"
      };
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_PROXY_IMAGE_BYTES) {
      return {
        status: 413,
        contentType: "application/json",
        error: "Image exceeds maximum allowed size"
      };
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PROXY_IMAGE_BYTES) {
      return {
        status: 413,
        contentType: "application/json",
        error: "Image exceeds maximum allowed size"
      };
    }
    const buffer = Buffer.from(arrayBuffer);
    return {
      status: 200,
      contentType: rawContentType,
      buffer
    };
  } catch (err) {
    const msg = err?.message || "Proxy error";
    const isClientError = msg.includes("Invalid URL") || msg.includes("Disallowed") || msg.includes("Unsupported") || msg.includes("credentials") || msg.includes("restricted");
    return {
      status: isClientError ? 400 : 502,
      contentType: "application/json",
      error: msg
    };
  }
}

// server/telegram-otp.ts
import crypto from "node:crypto";
import fs3 from "node:fs";
import path3 from "node:path";
var pendingOrderLinks = /* @__PURE__ */ new Map();
var pendingLinkTokenByChatId = /* @__PURE__ */ new Map();
var processedUpdateIds = /* @__PURE__ */ new Set();
var processedMessageKeys = /* @__PURE__ */ new Set();
function normalizeBotToken(raw) {
  let s = String(raw ?? "").replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, "").trim();
  if (!s) return "";
  if (s.includes("\u2022") || s.includes("*")) {
    return "";
  }
  s = s.replace(/%3A/gi, ":");
  if (s.startsWith('"') && s.endsWith('"') || s.startsWith("'") && s.endsWith("'") || s.startsWith("`") && s.endsWith("`")) {
    s = s.slice(1, -1).trim();
  }
  if (/^(MY_|YOUR_|EXAMPLE_|TEST_|PLACEHOLDER)/i.test(s)) {
    return "";
  }
  const embeddedMatch = s.match(/(\d{5,15}:[A-Za-z0-9_-]{20,})/);
  if (embeddedMatch && embeddedMatch[1]) {
    return embeddedMatch[1].trim();
  }
  const compact = s.replace(/[\s"'`]+/g, "");
  const compactMatch = compact.match(/(?:^bot)?(\d{5,15}:[A-Za-z0-9_-]{20,})/i);
  if (compactMatch && compactMatch[1]) {
    return compactMatch[1].trim();
  }
  s = s.replace(/^(?:TELEGRAM_BOT_TOKEN|BOT_TOKEN)\s*=\s*/i, "").trim();
  s = s.replace(/^bot(?=\d{5,}:)/i, "");
  return s.trim();
}
function isValidBotTokenFormat(token) {
  if (!token) return false;
  if (/^(MY_|YOUR_|EXAMPLE_|TEST_|PLACEHOLDER)/i.test(token)) return false;
  return /^\d{5,}:[A-Za-z0-9_-]{15,}$/.test(token);
}
function getTokenSourceLabel(source) {
  if (source === "override") return "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0623\u062F\u0645\u0646";
  if (source === "env") return "\u0645\u062A\u063A\u064A\u0631 \u0627\u0644\u0628\u064A\u0626\u0629 TELEGRAM_BOT_TOKEN";
  return "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F";
}
function formatTelegramTokenError(status, description, source = "none", token) {
  const desc = String(description || "").trim();
  const sourceSuffix = source !== "none" ? ` (\u0627\u0644\u0645\u0635\u062F\u0631: ${getTokenSourceLabel(source)}${token ? ` \xB7 ${maskToken(token)}` : ""})` : "";
  if (status === 404 || /not found/i.test(desc)) {
    return `\u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D \u0623\u0648 \u0645\u062D\u0630\u0648\u0641 (404 Not Found)${sourceSuffix} \u2014 \u062A\u0623\u0643\u062F \u0645\u0646 \u0646\u0633\u062E \u0627\u0644\u062A\u0648\u0643\u0646 \u0627\u0644\u0635\u062D\u064A\u062D \u0645\u0646 @BotFather \u0648\u0625\u0636\u0627\u0641\u062A\u0647 \u0641\u064A \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0623\u062F\u0645\u0646 \u0623\u0648 \u0645\u062A\u063A\u064A\u0631 TELEGRAM_BOT_TOKEN \u0628\u062F\u0648\u0646 \u0643\u0644\u0645\u0629 bot \u0623\u0648 \u0645\u0633\u0627\u0641\u0627\u062A.`;
  }
  if (status === 401 || /unauthorized/i.test(desc)) {
    return `\u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D \u0623\u0648 \u0645\u0644\u063A\u0649 (401 Unauthorized)${sourceSuffix} \u2014 \u064A\u0631\u062C\u0649 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062A\u0648\u0643\u0646 \u0645\u0646 @BotFather.`;
  }
  return desc || `HTTP ${status}`;
}
function getEnvBotToken() {
  return normalizeBotToken(process.env.TELEGRAM_BOT_TOKEN || "");
}
function getEnvBotUsername() {
  return (process.env.TELEGRAM_BOT_USERNAME || "MenuPlus_bot").trim().replace(/^@+/, "") || "MenuPlus_bot";
}
var ENV_BOT_USERNAME = getEnvBotUsername();
var DATA_DIR = path3.resolve(process.cwd(), "data");
var TELEGRAM_USERS_FILE = path3.resolve(DATA_DIR, "telegram-users.json");
var TELEGRAM_CONFIG_FILE = path3.resolve(DATA_DIR, "telegram-config.json");
var TELEGRAM_POLL_STATE_FILE = path3.resolve(DATA_DIR, "telegram-poll-state.json");
var TELEGRAM_CONFIG_KV_KEY = "settings/telegram_config";
var TELEGRAM_POLL_STATE_KV_KEY = "settings/telegram_poll_state";
var TELEGRAM_USERS_KV_PREFIX = "telegram_users_db/";
var TELEGRAM_PENDING_LINKS_KV_PREFIX = "telegram_order_links/";
var TELEGRAM_PENDING_CHAT_LINK_KV_PREFIX = "telegram_pending_chat_link/";
var TELEGRAM_MSG_LOCK_KV_PREFIX = "telegram_msg_lock/";
var telegramUsers = /* @__PURE__ */ new Map();
var DEFAULT_TELEGRAM_PROXY_URL = "https://t.me/proxy?server=heremit.larval.nonce.rubricate.textbook.watchpinoyteleserye.com&port=1250&secret=eeeaa279236535275f4071a1279335415773332e616d617a6f6e6177732e636f6d&bot=@mtpro_xyz_bot&channel=@mtpro_xyz";
function sanitizeTelegramProxyUrl(raw) {
  const s = String(raw ?? "").replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, "").trim();
  if (!s) return "";
  if (/^tg:\/\/proxy\?/i.test(s)) {
    const query = s.slice("tg://proxy?".length);
    const params = new URLSearchParams(query);
    if (!params.get("server")?.trim()) return "";
    return `tg://proxy?${query}`;
  }
  try {
    const normalizedInput = /^t\.me\/proxy\?/i.test(s) ? `https://${s}` : s;
    const parsed = new URL(normalizedInput);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    const host = parsed.hostname.toLowerCase();
    if (host !== "t.me" && host !== "telegram.me") return "";
    if (!parsed.pathname.toLowerCase().startsWith("/proxy")) return "";
    if (!parsed.searchParams.get("server")?.trim()) return "";
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return "";
  }
}
var DEFAULT_TELEGRAM_CONFIG = {
  enabled: true,
  botUsername: ENV_BOT_USERNAME || "MenuPlus_bot",
  botTokenOverride: "",
  proxyUrl: DEFAULT_TELEGRAM_PROXY_URL,
  welcomeSharePhoneText: "\u0623\u0647\u0644\u0627\u064B \u0628\u0643 \u0641\u064A \u0628\u0648\u062A \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0637\u0644\u0628\u0627\u062A.\n\u0644\u0627\u0633\u062A\u0644\u0627\u0645 \u0637\u0644\u0628\u0627\u062A \u0645\u062A\u062C\u0631\u0643 \u0645\u0628\u0627\u0634\u0631\u0629 \u0639\u0628\u0631 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645\u060C \u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0632\u0631 \xAB\u0645\u0634\u0627\u0631\u0643\u0629 \u0631\u0642\u0645 \u0647\u0627\u062A\u0641\u064A \u0644\u0627\u0633\u062A\u0642\u0628\u0627\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A\xBB \u0628\u0627\u0644\u0623\u0633\u0641\u0644.",
  verifiedSuccessText: "\u062A\u0645 \u0631\u0628\u0637 \u062D\u0633\u0627\u0628\u0643 \u0628\u0646\u062C\u0627\u062D \u2705\n\u0633\u062A\u0635\u0644\u0643 \u062C\u0645\u064A\u0639 \u0637\u0644\u0628\u0627\u062A \u0645\u062A\u062C\u0631\u0643 \u0623\u0648 \u0645\u0637\u0639\u0645\u0643 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 \u0647\u0646\u0627 \u0645\u0628\u0627\u0634\u0631\u0629 \u0641\u0648\u0631 \u0648\u0635\u0648\u0644\u0647\u0627.",
  orderHeaderText: "\u{1F514} \u0637\u0644\u0628 \u062C\u062F\u064A\u062F",
  orderFooterText: ""
};
var cachedTelegramConfig = { ...DEFAULT_TELEGRAM_CONFIG };
var hasLoadedConfigFromKv = false;
var lastPollError = "";
var lastSendError = "";
var lastSendErrorByRid = /* @__PURE__ */ new Map();
var lastTokenError = "";
var lastTokenErrorAt = 0;
var lastPollSuccessAt = 0;
var verifiedTokenHash = "";
var verifiedTokenUsername = "";
var verifiedTokenBotName = "";
var tokenIdentityCheckPromise = null;
function getTokenHash(token) {
  if (!token) return "";
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
}
function writeFileAtomicSync2(filePath, content) {
  if (!fs3.existsSync(DATA_DIR)) {
    fs3.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs3.writeFileSync(tmpPath, content, "utf-8");
  fs3.renameSync(tmpPath, filePath);
}
function isLegacyOtpTemplateText(text) {
  return /رمز التحقق|سيتم الآن إرسال رمز|أتممت خطوة التحقق|لإتمام تسجيل|لتسجيل الدخول|كود التحقق/i.test(text);
}
function isLegacyOrderHeaderText(text) {
  const clean = String(text || "").trim();
  return clean === "\u{1F6CE}\uFE0F \u0648\u0635\u0644 \u0637\u0644\u0628 \u062C\u062F\u064A\u062F!" || clean === "\u0648\u0635\u0644 \u0637\u0644\u0628 \u062C\u062F\u064A\u062F!" || clean === "\u{1F6CD}\uFE0F \u0637\u0644\u0628 \u062C\u062F\u064A\u062F \u0648\u0635\u0644\u0643 \u0639\u0628\u0631 \u0645\u0646\u064A\u0648 \u0628\u0644\u0633";
}
function sanitizeConfigObject(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const cleanUsername = String(src.botUsername || ENV_BOT_USERNAME || "MenuPlus_bot").trim().replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, "") || "MenuPlus_bot";
  const cleanToken = typeof src.botTokenOverride === "string" ? normalizeBotToken(src.botTokenOverride) : "";
  const rawWelcome = String(src.welcomeSharePhoneText || "").trim();
  const rawVerified = String(src.verifiedSuccessText || "").trim();
  const rawOrderHeader = String(src.orderHeaderText || "").trim();
  const rawProxyUrl = typeof src.proxyUrl === "string" ? sanitizeTelegramProxyUrl(src.proxyUrl) : "";
  return {
    enabled: src.enabled !== false,
    botUsername: cleanUsername,
    botTokenOverride: cleanToken,
    proxyUrl: rawProxyUrl || DEFAULT_TELEGRAM_PROXY_URL,
    welcomeSharePhoneText: !rawWelcome || isLegacyOtpTemplateText(rawWelcome) ? DEFAULT_TELEGRAM_CONFIG.welcomeSharePhoneText : rawWelcome,
    verifiedSuccessText: !rawVerified || isLegacyOtpTemplateText(rawVerified) ? DEFAULT_TELEGRAM_CONFIG.verifiedSuccessText : rawVerified,
    orderHeaderText: !rawOrderHeader || isLegacyOrderHeaderText(rawOrderHeader) ? DEFAULT_TELEGRAM_CONFIG.orderHeaderText : rawOrderHeader,
    orderFooterText: (() => {
      const rawFooter = String(src.orderFooterText || "").trim();
      return rawFooter === "\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u0632\u0628\u0648\u0646 \u0623\u0648 \u062A\u0627\u0628\u0639 \u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0637\u0644\u0628 \u0645\u0646 \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645." ? "" : rawFooter;
    })(),
    updatedAt: typeof src.updatedAt === "string" ? src.updatedAt : void 0
  };
}
function loadConfigFromDiskSync() {
  try {
    if (fs3.existsSync(TELEGRAM_CONFIG_FILE)) {
      const parsed = JSON.parse(fs3.readFileSync(TELEGRAM_CONFIG_FILE, "utf-8"));
      cachedTelegramConfig = sanitizeConfigObject(parsed);
    }
  } catch (err) {
    console.warn("[Telegram Config] Failed loading local config file:", err);
  }
}
async function loadTelegramConfigFromStore(force = false) {
  if (hasLoadedConfigFromKv && !force) {
    return cachedTelegramConfig;
  }
  try {
    const kvConfig = await getInternalStoreItem(TELEGRAM_CONFIG_KV_KEY);
    if (kvConfig && typeof kvConfig === "object") {
      const sanitized = sanitizeConfigObject(kvConfig);
      cachedTelegramConfig = sanitized;
      writeFileAtomicSync2(TELEGRAM_CONFIG_FILE, JSON.stringify(cachedTelegramConfig, null, 2));
      if (isLegacyOtpTemplateText(String(kvConfig.welcomeSharePhoneText || "")) || isLegacyOtpTemplateText(String(kvConfig.verifiedSuccessText || "")) || isLegacyOrderHeaderText(String(kvConfig.orderHeaderText || ""))) {
        void setInternalStoreItem(TELEGRAM_CONFIG_KV_KEY, cachedTelegramConfig).catch(() => {
        });
      }
    }
    hasLoadedConfigFromKv = true;
  } catch (err) {
    console.warn("[Telegram Config] Failed loading KV config:", err);
  }
  return cachedTelegramConfig;
}
function getEffectiveBotTokenInfo() {
  const override = normalizeBotToken(cachedTelegramConfig.botTokenOverride || "");
  const envToken = getEnvBotToken();
  if (override && isValidBotTokenFormat(override)) {
    return { token: override, source: "override" };
  }
  if (envToken && isValidBotTokenFormat(envToken)) {
    return {
      token: envToken,
      source: "env",
      ignoredInvalidOverride: Boolean(override)
    };
  }
  if (override) {
    return { token: override, source: "override" };
  }
  if (envToken) {
    return { token: envToken, source: "env" };
  }
  return { token: "", source: "none" };
}
function getEffectiveBotToken() {
  return getEffectiveBotTokenInfo().token;
}
function getEffectiveBotUsername() {
  return verifiedTokenUsername || String(cachedTelegramConfig.botUsername || getEnvBotUsername() || "MenuPlus_bot").trim().replace(/^@+/, "");
}
async function fetchTelegramGetMe(token) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    signal: AbortSignal.timeout(1e4)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok || !data.result) {
    return {
      ok: false,
      status: res.status,
      description: data.description || `HTTP ${res.status}`
    };
  }
  return {
    ok: true,
    status: res.status,
    username: String(data.result.username || "").trim().replace(/^@+/, ""),
    firstName: String(data.result.first_name || "").trim()
  };
}
async function syncVerifiedBotIdentity(tokenOverride, force = false) {
  const info = tokenOverride ? { token: normalizeBotToken(tokenOverride), source: "override" } : getEffectiveBotTokenInfo();
  const token = info.token;
  if (!token) {
    verifiedTokenHash = "";
    verifiedTokenUsername = "";
    verifiedTokenBotName = "";
    lastTokenError = "";
    lastTokenErrorAt = 0;
    return { ok: false, error: "\u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A \u063A\u064A\u0631 \u0645\u0636\u0627\u0641" };
  }
  if (!isValidBotTokenFormat(token)) {
    verifiedTokenHash = "";
    verifiedTokenUsername = "";
    verifiedTokenBotName = "";
    lastTokenError = `\u0635\u064A\u063A\u0629 \u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629 (\u0627\u0644\u0645\u0635\u062F\u0631: ${getTokenSourceLabel(info.source)} \xB7 ${maskToken(token)}) \u2014 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u0627\u0644\u0635\u064A\u063A\u0629 (123456789:ABC...) \u0645\u0646 @BotFather \u0628\u062F\u0648\u0646 \u0643\u0644\u0645\u0629 bot \u0623\u0648 \u0639\u0644\u0627\u0645\u0627\u062A \u0627\u0642\u062A\u0628\u0627\u0633.`;
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
      username: verifiedTokenUsername || void 0,
      firstName: verifiedTokenBotName || void 0,
      ...lastTokenError ? { error: lastTokenError } : {}
    };
  }
  let result = { ok: false };
  tokenIdentityCheckPromise = (async () => {
    try {
      const me = await fetchTelegramGetMe(token);
      if (!me.ok) {
        const errText = me.description || `HTTP ${me.status}`;
        const isAuthFailure = me.status === 401 || me.status === 404 || /not found|unauthorized/i.test(errText);
        if (isAuthFailure && !tokenOverride && info.source === "override") {
          const envToken = getEnvBotToken();
          if (envToken && envToken !== token && isValidBotTokenFormat(envToken)) {
            const envMe = await fetchTelegramGetMe(envToken).catch(() => null);
            if (envMe?.ok) {
              cachedTelegramConfig = sanitizeConfigObject({
                ...cachedTelegramConfig,
                botTokenOverride: "",
                ...envMe.username ? { botUsername: envMe.username } : {},
                updatedAt: (/* @__PURE__ */ new Date()).toISOString()
              });
              try {
                writeFileAtomicSync2(TELEGRAM_CONFIG_FILE, JSON.stringify(cachedTelegramConfig, null, 2));
              } catch {
              }
              void setInternalStoreItem(TELEGRAM_CONFIG_KV_KEY, cachedTelegramConfig).catch(() => {
              });
              lastTokenError = "";
              lastTokenErrorAt = 0;
              lastPollError = "";
              verifiedTokenHash = getTokenHash(envToken);
              verifiedTokenUsername = envMe.username || "";
              verifiedTokenBotName = envMe.firstName || "";
              console.warn(
                `[Telegram Bot] Cleared rejected DB botTokenOverride and switched to valid TELEGRAM_BOT_TOKEN (@${verifiedTokenUsername}).`
              );
              result = { ok: true, username: verifiedTokenUsername, firstName: verifiedTokenBotName };
              return;
            }
          }
        }
        if (isAuthFailure) {
          verifiedTokenHash = "";
          verifiedTokenUsername = "";
          verifiedTokenBotName = "";
          const friendly = formatTelegramTokenError(me.status, errText, info.source, token);
          lastTokenError = friendly;
          lastTokenErrorAt = Date.now();
          result = { ok: false, error: friendly };
          return;
        }
        result = { ok: false, error: errText };
        return;
      }
      lastTokenError = "";
      lastTokenErrorAt = 0;
      verifiedTokenHash = tokenHash;
      verifiedTokenUsername = me.username || "";
      verifiedTokenBotName = me.firstName || "";
      if (verifiedTokenUsername && cachedTelegramConfig.botUsername && cachedTelegramConfig.botUsername.toLowerCase() !== verifiedTokenUsername.toLowerCase()) {
        console.warn(
          `[Telegram Bot] Configured botUsername (@${cachedTelegramConfig.botUsername}) differs from token bot (@${verifiedTokenUsername}); using @${verifiedTokenUsername}.`
        );
      }
      result = { ok: true, username: verifiedTokenUsername, firstName: verifiedTokenBotName };
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0647\u0648\u064A\u0629 \u0627\u0644\u0628\u0648\u062A" };
    }
  })().finally(() => {
    tokenIdentityCheckPromise = null;
  });
  await tokenIdentityCheckPromise;
  return result;
}
function maskToken(token) {
  if (!token) return "";
  if (token.length <= 12) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  return `${token.slice(0, 6)}\u2022\u2022\u2022\u2022\u2022\u2022${token.slice(-4)}`;
}
var COMMON_COUNTRY_CODES = [
  "964",
  "966",
  "971",
  "965",
  "962",
  "20",
  "974",
  "968",
  "973",
  "961",
  "963",
  "970",
  "967",
  "212",
  "213",
  "218",
  "90"
];
function normalizePhoneKeys(phone) {
  const raw = String(phone || "").trim();
  let digits = raw.replace(/\D/g, "");
  const keys = /* @__PURE__ */ new Set();
  if (raw) keys.add(raw);
  if (!digits) return Array.from(keys);
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  keys.add(digits);
  keys.add(`+${digits}`);
  if (digits.startsWith("964")) {
    const local = digits.slice(3).replace(/^0+/, "");
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
  } else if (digits.startsWith("07") && digits.length === 11) {
    const local = digits.slice(1);
    keys.add(local);
    keys.add(`0${local}`);
    keys.add(`+964${local}`);
    keys.add(`964${local}`);
    keys.add(`00964${local}`);
    keys.add(`+964 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`);
  } else if (digits.startsWith("7") && digits.length === 10) {
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
        const local = digits.slice(cc.length).replace(/^0+/, "");
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
function phonesMatch(a, b) {
  const keysA = normalizePhoneKeys(a);
  if (keysA.length === 0) return false;
  const keysB = new Set(normalizePhoneKeys(b));
  return keysA.some((k) => keysB.has(k));
}
function getCanonicalPrimaryPhoneKey(phone) {
  const keys = normalizePhoneKeys(phone);
  const localIq = keys.find((k) => /^07\d{9}$/.test(k));
  if (localIq) return localIq;
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("9647") && digits.length === 13) return `0${digits.slice(3)}`;
  return digits || String(phone || "").trim();
}
function indexTelegramUserRecord(rec) {
  const normalizedRec = {
    ...rec,
    verifiedContact: rec.verifiedContact !== false
  };
  const keys = normalizePhoneKeys(normalizedRec.phone);
  for (const k of keys) {
    telegramUsers.set(k, normalizedRec);
  }
}
function loadTelegramUsers() {
  try {
    if (!fs3.existsSync(DATA_DIR)) {
      fs3.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs3.existsSync(TELEGRAM_USERS_FILE)) {
      const content = fs3.readFileSync(TELEGRAM_USERS_FILE, "utf-8");
      const records = JSON.parse(content);
      for (const rec of Object.values(records)) {
        if (rec && rec.chatId && rec.phone) {
          indexTelegramUserRecord({
            ...rec,
            verifiedContact: rec.verifiedContact !== false
          });
        }
      }
      console.log(`[Telegram Bot] Loaded ${telegramUsers.size} indexed user keys from ${TELEGRAM_USERS_FILE}`);
    }
  } catch (err) {
    console.warn("[Telegram Bot] Failed to load telegram users from file:", err);
  }
}
var hasSyncedTelegramUsers = false;
var lastTelegramSyncAt = 0;
var telegramUsersSyncPromise = null;
function persistUsersMapToFileFromMemory() {
  try {
    const uniqueByPrimary = /* @__PURE__ */ new Map();
    for (const rec of telegramUsers.values()) {
      if (!rec.phone || !rec.chatId) continue;
      const pk = rec.normalizedPhone || rec.phone.replace(/\D/g, "") || rec.phone;
      if (!uniqueByPrimary.has(pk) || (rec.linkedAt || 0) >= (uniqueByPrimary.get(pk)?.linkedAt || 0)) {
        uniqueByPrimary.set(pk, { ...rec, verifiedContact: rec.verifiedContact !== false });
      }
    }
    const obj = {};
    for (const [pk, rec] of uniqueByPrimary.entries()) {
      obj[pk] = rec;
    }
    writeFileAtomicSync2(TELEGRAM_USERS_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.warn("[Telegram Bot] Failed persisting users map:", err);
  }
}
async function syncTelegramUsersFromSupabase(force = false, ignoreThrottle = false) {
  if (hasLoadedConfigFromKv === false) {
    await loadTelegramConfigFromStore().catch(() => {
    });
  }
  if (hasSyncedTelegramUsers && !force) return;
  if (force && !ignoreThrottle && lastTelegramSyncAt && Date.now() - lastTelegramSyncAt < 3500) {
    return;
  }
  if (telegramUsersSyncPromise) return telegramUsersSyncPromise;
  telegramUsersSyncPromise = (async () => {
    try {
      const kvRes = await readPrefixFromStore(TELEGRAM_USERS_KV_PREFIX).catch(() => null);
      if (kvRes && Array.isArray(kvRes.items)) {
        for (const rec of kvRes.items) {
          if (rec && rec.phone && rec.chatId) {
            indexTelegramUserRecord({
              ...rec,
              verifiedContact: rec.verifiedContact !== false
            });
          }
        }
      }
      if (isSupabaseConfigured()) {
        try {
          const rows = await supabaseSelectAll("telegram_users", "*");
          if (rows.length > 0) {
            for (const row of rows) {
              if (!row || !row.phone || !row.chat_id) continue;
              const rec = {
                phone: row.phone,
                normalizedPhone: row.normalized_phone || row.phone.replace(/\D/g, "") || row.phone,
                chatId: row.chat_id,
                username: row.username || void 0,
                firstName: row.first_name || void 0,
                linkedAt: Number(row.linked_at) || Date.now(),
                lastSentAt: row.last_sent_at ? Number(row.last_sent_at) : void 0,
                verifiedContact: true
              };
              const existingChat = getVerifiedChatIdForPhone(rec.phone);
              if (!existingChat) {
                indexTelegramUserRecord(rec);
              }
            }
          } else if (telegramUsers.size > 0) {
            const uniqueByPrimary = /* @__PURE__ */ new Map();
            for (const rec of telegramUsers.values()) {
              if (rec.verifiedContact === false) continue;
              const pk = rec.normalizedPhone || rec.phone.replace(/\D/g, "") || rec.phone;
              uniqueByPrimary.set(pk, rec);
            }
            const seedRows = Array.from(uniqueByPrimary.entries()).map(([pk, rec]) => ({
              normalized_phone: pk,
              phone: rec.phone,
              chat_id: String(rec.chatId),
              username: rec.username || null,
              first_name: rec.firstName || null,
              linked_at: Number(rec.linkedAt) || Date.now(),
              last_sent_at: rec.lastSentAt ? Number(rec.lastSentAt) : null
            }));
            if (seedRows.length > 0) {
              await supabaseUpsert("telegram_users", seedRows, "normalized_phone").catch(
                () => {
                }
              );
            }
          }
        } catch (err) {
          if (!isSupabaseNetworkError(err)) {
            console.warn("[Telegram Bot] Supabase telegram_users sync warning:", formatSupabaseError(err));
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
async function listTelegramUsers(forceSync = true) {
  await syncTelegramUsersFromSupabase(forceSync);
  const unique = /* @__PURE__ */ new Map();
  for (const rec of telegramUsers.values()) {
    const pk = getCanonicalPrimaryPhoneKey(rec.phone || rec.normalizedPhone);
    const prev = unique.get(pk);
    if (!prev || (rec.linkedAt || 0) >= (prev.linkedAt || 0)) {
      unique.set(pk, {
        ...rec,
        normalizedPhone: rec.normalizedPhone || pk,
        verifiedContact: rec.verifiedContact !== false
      });
    }
  }
  return Array.from(unique.values()).sort((a, b) => (b.linkedAt || 0) - (a.linkedAt || 0));
}
async function deleteTelegramUserByPhone(phoneOrNormalized) {
  const clean = String(phoneOrNormalized || "").trim();
  const digits = clean.replace(/\D/g, "") || clean;
  const candidateKeys = /* @__PURE__ */ new Set([clean, digits, ...normalizePhoneKeys(clean)]);
  const primaryTargets = /* @__PURE__ */ new Set([digits, clean, getCanonicalPrimaryPhoneKey(clean)]);
  for (const k of candidateKeys) {
    const rec = telegramUsers.get(k);
    if (rec?.normalizedPhone) primaryTargets.add(rec.normalizedPhone);
    if (rec?.phone) {
      primaryTargets.add(rec.phone.replace(/\D/g, "") || rec.phone);
      primaryTargets.add(getCanonicalPrimaryPhoneKey(rec.phone));
    }
    telegramUsers.delete(k);
  }
  try {
    if (fs3.existsSync(TELEGRAM_USERS_FILE)) {
      const existingMap = JSON.parse(fs3.readFileSync(TELEGRAM_USERS_FILE, "utf-8"));
      let fileChanged = false;
      for (const [k, rec] of Object.entries(existingMap)) {
        if (primaryTargets.has(k) || rec?.normalizedPhone && primaryTargets.has(rec.normalizedPhone) || rec?.phone && (candidateKeys.has(rec.phone) || phonesMatch(rec.phone, clean))) {
          delete existingMap[k];
          fileChanged = true;
        }
      }
      if (fileChanged) {
        writeFileAtomicSync2(TELEGRAM_USERS_FILE, JSON.stringify(existingMap, null, 2));
      }
    }
  } catch (err) {
    console.warn("[Telegram Bot] Failed to delete user from local file:", err);
  }
  await Promise.all(
    Array.from(primaryTargets).filter(Boolean).map((target) => deleteInternalStoreItem(`${TELEGRAM_USERS_KV_PREFIX}${target}`).catch(() => {
    }))
  );
  if (isSupabaseConfigured()) {
    let deletedCount = 0;
    try {
      for (const target of primaryTargets) {
        if (!target) continue;
        const rows = await supabaseDeleteWhere("telegram_users", "normalized_phone", target);
        deletedCount += rows.length;
      }
      return { ok: true, deletedFromSupabase: deletedCount > 0 };
    } catch (err) {
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
function saveTelegramUser(data) {
  const canonicalPhone = getCanonicalPrimaryPhoneKey(data.phone) || String(data.phone || "").trim();
  const digits = canonicalPhone.replace(/\D/g, "") || String(data.phone || "").replace(/\D/g, "");
  const now = Date.now();
  const isVerified = data.verifiedContact !== false;
  const existing = telegramUsers.get(canonicalPhone) || telegramUsers.get(String(data.phone || "").trim());
  const linkedAt = existing?.linkedAt || now;
  for (const [key, rec] of Array.from(telegramUsers.entries())) {
    if (String(rec.chatId) === String(data.chatId) && !phonesMatch(rec.phone, canonicalPhone)) {
      telegramUsers.delete(key);
      const stalePk = rec.normalizedPhone || rec.phone.replace(/\D/g, "");
      if (stalePk) {
        void deleteInternalStoreItem(`${TELEGRAM_USERS_KV_PREFIX}${stalePk}`).catch(() => {
        });
      }
    }
  }
  const record = {
    phone: canonicalPhone,
    normalizedPhone: digits,
    chatId: data.chatId,
    username: data.username || existing?.username,
    firstName: data.firstName || existing?.firstName,
    linkedAt,
    lastSentAt: now,
    verifiedContact: isVerified
  };
  indexTelegramUserRecord(record);
  persistUsersMapToFileFromMemory();
  const primaryKey = digits || canonicalPhone;
  void setInternalStoreItem(`${TELEGRAM_USERS_KV_PREFIX}${primaryKey}`, record).catch(() => {
  });
  if (isSupabaseConfigured() && isVerified) {
    void supabaseUpsert(
      "telegram_users",
      [
        {
          normalized_phone: primaryKey,
          phone: canonicalPhone,
          chat_id: String(data.chatId),
          username: record.username || null,
          first_name: record.firstName || null,
          linked_at: linkedAt,
          last_sent_at: now
        }
      ],
      "normalized_phone"
    ).catch((err) => {
      if (!isSupabaseNetworkError(err)) {
        console.warn("[Telegram Bot] Failed persisting user to Supabase telegram_users:", formatSupabaseError(err));
      }
    });
  }
  return record;
}
function getVerifiedTelegramUserForPhone(phone) {
  const cleanPhone = String(phone || "").trim();
  const keys = normalizePhoneKeys(cleanPhone);
  for (const k of keys) {
    const rec = telegramUsers.get(k);
    if (rec && rec.chatId && rec.verifiedContact !== false && phonesMatch(rec.phone, cleanPhone)) {
      return rec;
    }
  }
  return null;
}
function getVerifiedChatIdForPhone(phone) {
  return getVerifiedTelegramUserForPhone(phone)?.chatId || null;
}
function findVerifiedPhoneForChatId(chatId) {
  for (const rec of telegramUsers.values()) {
    if (String(rec.chatId) === String(chatId) && rec.verifiedContact !== false && rec.phone) {
      return rec.phone;
    }
  }
  return null;
}
function recordMessageSent(phone) {
  const cleanPhone = String(phone || "").trim();
  const keys = normalizePhoneKeys(cleanPhone);
  const now = Date.now();
  let matchedRec;
  for (const k of keys) {
    const rec = telegramUsers.get(k);
    if (rec) {
      rec.lastSentAt = now;
      matchedRec = rec;
    }
  }
  if (matchedRec) {
    persistUsersMapToFileFromMemory();
    const primaryKey = matchedRec.normalizedPhone || matchedRec.phone.replace(/\D/g, "") || matchedRec.phone;
    void setInternalStoreItem(`${TELEGRAM_USERS_KV_PREFIX}${primaryKey}`, matchedRec).catch(() => {
    });
    if (isSupabaseConfigured()) {
      void supabaseUpsert(
        "telegram_users",
        [
          {
            normalized_phone: primaryKey,
            phone: matchedRec.phone,
            chat_id: String(matchedRec.chatId),
            username: matchedRec.username || null,
            first_name: matchedRec.firstName || null,
            linked_at: matchedRec.linkedAt || now,
            last_sent_at: now
          }
        ],
        "normalized_phone"
      ).catch(() => {
      });
    }
  }
}
async function sendTelegramMessage(chatId, text, replyMarkup, tokenOverride) {
  const token = (tokenOverride || getEffectiveBotToken()).trim();
  if (!token) {
    lastSendError = "\u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A \u063A\u064A\u0631 \u0645\u0647\u064A\u0623 \u0644\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0626\u0644";
    return false;
  }
  const dispatch = async (markup, parseMode = "HTML", bodyText = text) => {
    const payload = {
      chat_id: chatId,
      text: bodyText,
      link_preview_options: { is_disabled: true }
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }
    if (markup) {
      payload.reply_markup = markup;
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15e3)
    });
    const rawText = await res.text().catch(() => "");
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { ok: false, description: rawText || `HTTP ${res.status}` };
    }
    return {
      ok: Boolean(data.ok),
      status: res.status,
      description: data.description,
      retryAfterSec: data.parameters?.retry_after
    };
  };
  const stripHtmlTags = (html) => html.replace(/<\/?(?:code|b|strong|i|em|u|s|pre|a)\b[^>]*>/gi, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  try {
    const first = await dispatch(replyMarkup, "HTML");
    if (first.ok) {
      lastSendError = "";
      return true;
    }
    lastSendError = first.description || `HTTP ${first.status}`;
    if (first.status === 429 || first.status >= 500) {
      const waitMs = Math.min(3500, Math.max(450, (first.retryAfterSec || 1) * 1e3));
      await new Promise((r) => setTimeout(r, waitMs));
    }
    if (replyMarkup) {
      const noMarkup = await dispatch(void 0, "HTML");
      if (noMarkup.ok) {
        lastSendError = "";
        return true;
      }
      lastSendError = noMarkup.description || `HTTP ${noMarkup.status}`;
    }
    const plainFallback = await dispatch(void 0, void 0, stripHtmlTags(text));
    if (plainFallback.ok) {
      lastSendError = "";
      return true;
    }
    lastSendError = plainFallback.description || `HTTP ${plainFallback.status}`;
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : "";
    lastSendError = msg;
    if (errName === "TimeoutError" || errName === "AbortError" || /timeout|abort/i.test(msg)) {
      return false;
    }
    try {
      await new Promise((r) => setTimeout(r, 450));
      const retry = await dispatch(void 0, void 0, stripHtmlTags(text));
      if (retry.ok) {
        lastSendError = "";
        return true;
      }
    } catch {
    }
    return false;
  }
}
function buildRequestContactKeyboard() {
  return {
    keyboard: [[{ text: "\u{1F4F1} \u0645\u0634\u0627\u0631\u0643\u0629 \u0631\u0642\u0645 \u0647\u0627\u062A\u0641\u064A \u0644\u0627\u0633\u062A\u0642\u0628\u0627\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}
function escapeHtml(val) {
  return String(val ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatMoney(num) {
  const n = Number(num || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US");
}
async function savePendingOrderLink(link) {
  pendingOrderLinks.set(link.token, link);
  await setInternalStoreItem(`${TELEGRAM_PENDING_LINKS_KV_PREFIX}${link.token}`, link).catch(() => {
  });
}
async function getPendingOrderLink(token) {
  const clean = String(token || "").trim();
  if (!clean) return null;
  const mem = pendingOrderLinks.get(clean);
  if (mem) return mem;
  const kv = await getInternalStoreItem(`${TELEGRAM_PENDING_LINKS_KV_PREFIX}${clean}`).catch(() => null);
  if (kv && kv.token && kv.rid) {
    pendingOrderLinks.set(clean, kv);
    return kv;
  }
  return null;
}
async function savePendingLinkForChat(chatKey, token) {
  const entry = { token, requestedAt: Date.now() };
  pendingLinkTokenByChatId.set(chatKey, entry);
  await setInternalStoreItem(`${TELEGRAM_PENDING_CHAT_LINK_KV_PREFIX}${chatKey}`, entry).catch(() => {
  });
}
async function takePendingLinkForChat(chatKey) {
  const mem = pendingLinkTokenByChatId.get(chatKey);
  pendingLinkTokenByChatId.delete(chatKey);
  const kv = await getInternalStoreItem(
    `${TELEGRAM_PENDING_CHAT_LINK_KV_PREFIX}${chatKey}`
  ).catch(() => null);
  if (kv) {
    void deleteInternalStoreItem(`${TELEGRAM_PENDING_CHAT_LINK_KV_PREFIX}${chatKey}`).catch(() => {
    });
  }
  if (mem && (!kv || mem.requestedAt >= kv.requestedAt)) {
    return mem.token;
  }
  return kv?.token || null;
}
function isPhoneLikeCandidate(val) {
  const s = String(val || "").trim();
  if (!s || s.includes("@")) return "";
  const digits = s.replace(/\D/g, "");
  return digits.length >= 7 ? s : "";
}
function collectRestaurantPhoneCandidates(rid, rest, allData) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const add = (val) => {
    const clean = isPhoneLikeCandidate(val);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  };
  add(rest.telegramPhone);
  if (rid === "demo") {
    return out;
  }
  add(rest.ph);
  if (rest.social && typeof rest.social === "object") {
    add(rest.social.whatsapp);
  }
  for (const [k, v] of Object.entries(allData)) {
    if (!k.startsWith("accounts/") || !v || typeof v !== "object") continue;
    const acc = v;
    if (k.startsWith("accounts/acc_admin_") || k === "accounts/acc_menu_demo" || acc.admin === true || acc.r === "admin") {
      continue;
    }
    if (String(acc.rid || "").trim() !== rid) continue;
    add(acc.telegramPhone);
    add(acc.phone);
    add(acc.projectPhone);
    add(acc.ph);
    add(acc.em);
    add(acc.username);
  }
  return out;
}
async function autoLinkRestaurantsByPhone(phone, chatId, username, forceRelink = true) {
  const allData = await readAll(false);
  const linked = [];
  for (const [k, v] of Object.entries(allData)) {
    if (!k.startsWith("restaurants/") || k.slice("restaurants/".length).includes("/") || !v || typeof v !== "object") {
      continue;
    }
    const rid = k.slice("restaurants/".length);
    if (rid === "demo") continue;
    const rest = v;
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
    const alreadyBound = String(rest.telegramChatId || "").trim() === String(chatId) && phonesMatch(String(rest.telegramPhone || ""), preferredPhone) && rest.telegramNotificationsEnabled !== false && rest.telegramUnlinkedManually !== true;
    if (!alreadyBound) {
      await bindRestaurantToTelegram(rid, {
        phone: preferredPhone,
        chatId,
        username,
        enabled: rest.telegramNotificationsEnabled !== false
      });
    }
    linked.push({ rid, name: String(rest.n || rid).trim() || rid });
  }
  return linked;
}
async function bindRestaurantToTelegram(rid, data) {
  const cleanRid = String(rid || "").trim();
  if (!cleanRid) return false;
  const allData = await readAll(false);
  const rest = allData[`restaurants/${cleanRid}`];
  if (!rest || typeof rest !== "object") return false;
  const updated = {
    ...rest,
    telegramPhone: data.phone,
    telegramChatId: String(data.chatId),
    telegramUsername: data.username || rest.telegramUsername || "",
    telegramNotificationsEnabled: data.enabled !== false,
    telegramUnlinkedManually: false,
    orderChannel: data.enabled !== false && rest.orderChannel === "whatsapp" ? "both" : rest.orderChannel || (data.enabled !== false ? "both" : "whatsapp")
  };
  await applyChanges({ put: { [`restaurants/${cleanRid}`]: updated } }, false);
  return true;
}
async function initTelegramOrderLink(rid, phone) {
  await loadTelegramConfigFromStore();
  await syncTelegramUsersFromSupabase(true, true);
  const cleanRid = String(rid || "").trim();
  const cleanPhone = String(phone || "").trim();
  const botUsername = getEffectiveBotUsername();
  if (!cleanRid) {
    return {
      ok: false,
      linked: false,
      botUrl: `https://t.me/${botUsername}`,
      botUsername,
      telegramPhone: cleanPhone,
      message: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u062A\u062C\u0631 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D."
    };
  }
  if (!cleanPhone || cleanPhone.replace(/\D/g, "").length < 7) {
    return {
      ok: false,
      linked: false,
      botUrl: `https://t.me/${botUsername}`,
      botUsername,
      telegramPhone: cleanPhone,
      message: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0642\u0645 \u0647\u0627\u062A\u0641 \u0635\u062D\u064A\u062D \u0623\u0648\u0644\u0627\u064B."
    };
  }
  const verifiedUser = getVerifiedTelegramUserForPhone(cleanPhone);
  if (verifiedUser && verifiedUser.chatId) {
    await bindRestaurantToTelegram(cleanRid, {
      phone: cleanPhone,
      chatId: verifiedUser.chatId,
      username: verifiedUser.username,
      enabled: true
    });
    return {
      ok: true,
      linked: true,
      botUrl: `https://t.me/${botUsername}`,
      botUsername,
      telegramPhone: cleanPhone,
      telegramUsername: verifiedUser.username || "",
      message: "\u062A\u0645 \u0631\u0628\u0637 \u0631\u0642\u0645\u0643 \u0645\u0639 \u0627\u0644\u0628\u0648\u062A \u0628\u0646\u062C\u0627\u062D! \u0633\u062A\u0635\u0644\u0643 \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0632\u0628\u0627\u0626\u0646 \u0639\u0644\u0649 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u0645\u0628\u0627\u0634\u0631\u0629 \u2713"
    };
  }
  const linkToken = `ord_${crypto.randomBytes(5).toString("hex")}`;
  await savePendingOrderLink({
    token: linkToken,
    rid: cleanRid,
    phone: cleanPhone,
    createdAt: Date.now()
  });
  const allData = await readAll(false);
  const rest = allData[`restaurants/${cleanRid}`];
  if (rest && typeof rest === "object") {
    await applyChanges(
      {
        put: {
          [`restaurants/${cleanRid}`]: {
            ...rest,
            telegramPhone: cleanPhone,
            telegramChatId: "",
            telegramUsername: "",
            telegramUnlinkedManually: false
          }
        }
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
    message: "\u0627\u0641\u062A\u062D \u0627\u0644\u0628\u0648\u062A \u0641\u064A \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u0648\u0627\u0636\u063A\u0637 Start \u062B\u0645 \u0634\u0627\u0631\u0643 \u0631\u0642\u0645 \u0647\u0627\u062A\u0641\u0643 \u0644\u062A\u0641\u0639\u064A\u0644 \u0627\u0633\u062A\u0644\u0627\u0645 \u0627\u0644\u0637\u0644\u0628\u0627\u062A."
  };
}
function resolveRestaurantOrderChannel(rest) {
  const raw = String(rest?.orderChannel || "").trim();
  if (raw === "both" || raw === "telegram" || raw === "whatsapp") {
    return raw;
  }
  if (rest && rest.telegramNotificationsEnabled === false) {
    return "whatsapp";
  }
  return "both";
}
async function getTelegramOrderLinkStatus(rid) {
  await loadTelegramConfigFromStore();
  await syncTelegramUsersFromSupabase();
  const tokenInfo = getEffectiveBotTokenInfo();
  const effectiveToken = tokenInfo.token;
  const shouldRecheckError = Boolean(lastTokenError && Date.now() - lastTokenErrorAt > 1e4);
  if (effectiveToken && (!verifiedTokenUsername || shouldRecheckError)) {
    await syncVerifiedBotIdentity(void 0, shouldRecheckError).catch(() => {
    });
  }
  const cleanRid = String(rid || "").trim();
  const botUsername = getEffectiveBotUsername();
  const allData = await readAll(false);
  const rest = allData[`restaurants/${cleanRid}`] || {};
  let telegramPhone = String(rest.telegramPhone || "").trim();
  let telegramChatId = String(rest.telegramChatId || "").trim();
  let telegramUsername = String(rest.telegramUsername || "").trim();
  const orderChannel = resolveRestaurantOrderChannel(rest);
  const enabled = orderChannel !== "whatsapp" && rest.telegramNotificationsEnabled !== false;
  if (!telegramChatId && rest.telegramUnlinkedManually !== true) {
    const candidates = telegramPhone ? [telegramPhone, ...collectRestaurantPhoneCandidates(cleanRid, rest, allData)] : collectRestaurantPhoneCandidates(cleanRid, rest, allData);
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
          enabled
        });
        break;
      }
    }
  }
  const botEnabled = cachedTelegramConfig.enabled !== false;
  const botConfigured = Boolean(effectiveToken);
  const botTokenValid = Boolean(effectiveToken && !lastTokenError);
  const socialObj = rest.social && typeof rest.social === "object" ? rest.social : {};
  const whatsappConfigured = Boolean(String(socialObj.whatsapp || rest.ph || "").trim());
  const pollingHealthy = Boolean(isPollingActive && !lastPollError && (lastPollSuccessAt > 0 || !consecutiveAuthErrors));
  const storeSendError = lastSendErrorByRid.get(cleanRid) || "";
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
    proxyUrl: cachedTelegramConfig.proxyUrl || DEFAULT_TELEGRAM_PROXY_URL
  };
}
async function toggleTelegramForRestaurant(rid, enabled) {
  const cleanRid = String(rid || "").trim();
  if (!cleanRid) return false;
  const allData = await readAll(false);
  const rest = allData[`restaurants/${cleanRid}`];
  if (!rest || typeof rest !== "object") return false;
  const currentChannel = resolveRestaurantOrderChannel(rest);
  const nextChannel = enabled ? currentChannel === "whatsapp" ? "both" : currentChannel : "whatsapp";
  await applyChanges(
    {
      put: {
        [`restaurants/${cleanRid}`]: {
          ...rest,
          telegramNotificationsEnabled: Boolean(enabled),
          orderChannel: nextChannel
        }
      }
    },
    false
  );
  return true;
}
async function unlinkTelegramForRestaurant(rid) {
  const cleanRid = String(rid || "").trim();
  if (!cleanRid) return false;
  const allData = await readAll(false);
  const rest = allData[`restaurants/${cleanRid}`];
  if (!rest || typeof rest !== "object") return false;
  await applyChanges(
    {
      put: {
        [`restaurants/${cleanRid}`]: {
          ...rest,
          telegramChatId: "",
          telegramUsername: "",
          telegramUnlinkedManually: true
        }
      }
    },
    false
  );
  return true;
}
var ORDER_TYPE_AR = {
  delivery: "\u062A\u0648\u0635\u064A\u0644",
  pickup: "\u0627\u0633\u062A\u0644\u0627\u0645 \u0630\u0627\u062A\u064A",
  table: "\u0637\u0644\u0628 \u0637\u0627\u0648\u0644\u0629"
};
function formatIraqOrderDateTime(tsRaw) {
  const numericTs = Number(tsRaw || Date.now());
  const dateObj = Number.isFinite(numericTs) && numericTs > 0 ? new Date(numericTs) : /* @__PURE__ */ new Date();
  const timeZone = "Asia/Baghdad";
  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).formatToParts(dateObj);
  const hour = timeParts.find((p) => p.type === "hour")?.value || "12";
  const minute = timeParts.find((p) => p.type === "minute")?.value || "00";
  const dayPeriod = timeParts.find((p) => p.type === "dayPeriod")?.value || "";
  const arPeriod = /pm/i.test(dayPeriod) ? "\u0645" : "\u0635";
  const timeStr = `${hour}:${minute} ${arPeriod}`;
  const dayNameAr = new Intl.DateTimeFormat("ar-IQ", {
    timeZone,
    weekday: "long"
  }).format(dateObj);
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(dateObj);
  return { timeStr, dayNameAr, dateStr };
}
function formatOrderTelegramMessage(restaurant, order, isTest = false) {
  const rawHeader = cachedTelegramConfig.orderHeaderText || DEFAULT_TELEGRAM_CONFIG.orderHeaderText;
  const header = isLegacyOrderHeaderText(rawHeader) ? DEFAULT_TELEGRAM_CONFIG.orderHeaderText : rawHeader;
  const footer = cachedTelegramConfig.orderFooterText || DEFAULT_TELEGRAM_CONFIG.orderFooterText;
  const storeName = escapeHtml(restaurant.n || "\u0627\u0644\u0645\u062A\u062C\u0631");
  const currency = escapeHtml(restaurant.currency || "\u062F.\u0639");
  const rawSeq = Number(order.seq ?? order.orderSeq ?? 0);
  const seqNumber = Number.isFinite(rawSeq) && rawSeq > 0 ? rawSeq : Math.max(1, (Number(restaurant.o || 0) || 0) + (isTest ? 1 : 0));
  const { timeStr, dateStr } = formatIraqOrderDateTime(order.at);
  const cu = order.cu && typeof order.cu === "object" ? order.cu : {};
  const customerName = escapeHtml(cu.n || order.name || "\u0632\u0628\u0648\u0646");
  const customerPhone = escapeHtml(cu.ph || order.phone || "\u2014");
  const rawType = String(cu.orderType || order.type || "delivery");
  const typeLabel = ORDER_TYPE_AR[rawType] || rawType;
  const tableNum = cu.table || order.table;
  const area = cu.area ? String(cu.area).trim() : "";
  const city = cu.city ? String(cu.city).trim() : "";
  const address = String(cu.address || order.address || "").trim();
  const notes = String(cu.nt || order.notes || "").trim();
  const deliveryFee = Number(cu.deliveryFee || 0);
  const serviceFee = Number(order.serviceFee || 0);
  const discount = Number(order.discount || 0);
  const total = Number(order.tot ?? order.total ?? 0);
  const lat = cu.lat !== void 0 && cu.lat !== null && cu.lat !== "" ? Number(cu.lat) : void 0;
  const lng = cu.lng !== void 0 && cu.lng !== null && cu.lng !== "" ? Number(cu.lng) : void 0;
  const itemsList = Array.isArray(order.items) ? order.items : [];
  let computedOrigSubtotal = 0;
  let computedSubtotal = 0;
  const itemLines = itemsList.map((it) => {
    const qty = Math.max(1, Number(it.q || 1));
    const price = Number(it.p || 0);
    const origPrice = Number(it.origPrice ?? it.origP ?? 0);
    const hasItemDiscount = origPrice > price && origPrice > 0;
    const pct = Number(it.discountPct || 0) || (hasItemDiscount ? Math.max(1, Math.round((origPrice - price) / origPrice * 100)) : 0);
    computedSubtotal += qty * price;
    computedOrigSubtotal += qty * (hasItemDiscount ? origPrice : price);
    const parts = [
      it.size ? String(it.size) : "",
      ...Array.isArray(it.choices) ? it.choices.map(String) : [],
      ...Array.isArray(it.extras) ? it.extras.map(String) : []
    ].filter(Boolean);
    const optsText = parts.length > 0 ? ` <i>(${escapeHtml(parts.join("\u060C "))})</i>` : "";
    const itemNote = String(it.notes || "").trim();
    const noteLine = itemNote ? `
   \u21B3 <i>${escapeHtml(itemNote)}</i>` : "";
    const unitDiscountPart = hasItemDiscount ? ` \xB7 <s>${formatMoney(origPrice)}</s> (<b>\u062E\u0635\u0645 ${pct}%</b>)` : "";
    return `\u2022 <b>${escapeHtml(it.n || "\u0645\u0646\u062A\u062C")}</b>${optsText} \xD7 ${qty} \u2014 \u0633\u0639\u0631 \u0627\u0644\u0637\u0628\u0642: ${formatMoney(price)} ${currency}${unitDiscountPart} = <b>${formatMoney(qty * price)} ${currency}</b>${noteLine}`;
  });
  const divider = "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";
  const lines = [];
  const cleanHeader = header.replace(/^🔔\s*/, "").trim() || "\u0637\u0644\u0628 \u062C\u062F\u064A\u062F";
  lines.push(`\u{1F514} <b>${escapeHtml(cleanHeader)}</b> \u2014 ${storeName}`);
  if (isTest) {
    lines.push("<i>\u0637\u0644\u0628 \u062A\u062C\u0631\u064A\u0628\u064A \u0644\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0631\u0628\u0637</i>");
  }
  lines.push(`<b>\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628:</b> <code>#${seqNumber}</code>`);
  lines.push(`<b>\u0627\u0644\u0646\u0648\u0639:</b> ${escapeHtml(typeLabel)}${tableNum ? ` (\u0637\u0627\u0648\u0644\u0629 ${escapeHtml(tableNum)})` : ""}`);
  lines.push(`<b>\u0627\u0644\u0648\u0642\u062A:</b> <code>${escapeHtml(timeStr)}</code> \xB7 <code>${escapeHtml(dateStr)}</code>`);
  lines.push(divider);
  lines.push(`<b>\u0627\u0644\u0632\u0628\u0648\u0646:</b> ${customerName}`);
  lines.push(`<b>\u0627\u0644\u0647\u0627\u062A\u0641:</b> <code>${customerPhone}</code>`);
  if (area || city || address) {
    const rawLocParts = [city, area, address].filter(Boolean);
    const dedupedLoc = [];
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
    lines.push(`<b>\u0627\u0644\u0639\u0646\u0648\u0627\u0646:</b> ${escapeHtml(dedupedLoc.join(" \u2014 "))}`);
  }
  if (itemLines.length > 0) {
    lines.push(divider);
    lines.push(...itemLines);
  }
  const freeGiftName = String(order.freeGiftName || "").trim();
  const scheduledSlot = String(order.scheduledSlot || "").trim();
  const tipAmount = Number(order.tipAmount || 0);
  const firstOrderDiscount = Number(order.firstOrderDiscount || 0);
  const spinRewardLabel = String(order.spinRewardLabel || "").trim();
  const spinDiscount = Number(order.spinDiscount || 0);
  const pickupDiscount = Number(order.pickupDiscount || 0);
  const pickupDiscountLabel = String(order.pickupDiscountLabel || "\u062E\u0635\u0645 \u0627\u0644\u0627\u0633\u062A\u0644\u0627\u0645 \u0627\u0644\u0641\u0648\u0631\u064A").trim();
  const menuDiscountLabel = String(order.menuDiscountLabel || "").trim();
  const origSubtotal = Number(order.origSubtotal || 0) || computedOrigSubtotal;
  const itemsDiscountTotal = Number(order.itemsDiscountTotal || 0) || Math.max(0, origSubtotal - computedSubtotal);
  const orderLevelDiscountTotal = discount + firstOrderDiscount + spinDiscount + pickupDiscount;
  const totalDiscount = itemsDiscountTotal + orderLevelDiscountTotal;
  const couponCode = String(order.couponCode || "").trim();
  lines.push(divider);
  if (origSubtotal > 0 && totalDiscount > 0) {
    lines.push(`<b>\u0627\u0644\u0645\u062C\u0645\u0648\u0639 \u0642\u0628\u0644 \u0627\u0644\u062E\u0635\u0645:</b> ${formatMoney(origSubtotal)} ${currency}`);
  } else if (computedSubtotal > 0) {
    lines.push(`<b>\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u0623\u0637\u0628\u0627\u0642:</b> ${formatMoney(computedSubtotal)} ${currency}`);
  }
  if (itemsDiscountTotal > 0) {
    lines.push(
      `<b>\u062E\u0635\u0645 \u0639\u0644\u0649 \u0627\u0644\u0623\u0637\u0628\u0627\u0642${menuDiscountLabel ? ` (${escapeHtml(menuDiscountLabel)})` : ""}:</b> -${formatMoney(itemsDiscountTotal)} ${currency}`
    );
  }
  if (deliveryFee > 0) {
    lines.push(`<b>\u0627\u0644\u062A\u0648\u0635\u064A\u0644:</b> ${formatMoney(deliveryFee)} ${currency}`);
  }
  if (serviceFee > 0) {
    lines.push(`<b>\u0631\u0633\u0648\u0645 \u0627\u0644\u062E\u062F\u0645\u0629:</b> ${formatMoney(serviceFee)} ${currency}`);
  }
  if (tipAmount > 0) {
    lines.push(`<b>\u0625\u0643\u0631\u0627\u0645\u064A\u0629:</b> ${formatMoney(tipAmount)} ${currency}`);
  }
  if (discount > 0) {
    lines.push(`<b>\u062E\u0635\u0645 \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628${couponCode ? ` (${escapeHtml(couponCode)})` : ""}:</b> -${formatMoney(discount)} ${currency}`);
  }
  if (firstOrderDiscount > 0) {
    lines.push(`<b>\u062E\u0635\u0645 \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628 (\u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0623\u0648\u0644):</b> -${formatMoney(firstOrderDiscount)} ${currency}`);
  }
  if (spinDiscount > 0) {
    lines.push(`<b>\u062E\u0635\u0645 \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628 (\u0645\u0643\u0627\u0641\u0623\u0629${spinRewardLabel ? ` ${escapeHtml(spinRewardLabel)}` : ""}):</b> -${formatMoney(spinDiscount)} ${currency}`);
  }
  if (pickupDiscount > 0) {
    lines.push(`<b>\u062E\u0635\u0645 \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628 (${escapeHtml(pickupDiscountLabel)}):</b> -${formatMoney(pickupDiscount)} ${currency}`);
  }
  if (totalDiscount > 0) {
    lines.push(`<b>\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u062E\u0635\u0645:</b> -${formatMoney(totalDiscount)} ${currency}`);
  }
  if (freeGiftName) {
    lines.push(`<b>\u0647\u062F\u064A\u0629 \u0645\u062C\u0627\u0646\u064A\u0629:</b> ${escapeHtml(freeGiftName)}`);
  }
  if (order.needCutlery === true) {
    lines.push("<b>\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0637\u0639\u0627\u0645:</b> \u0645\u0637\u0644\u0648\u0628\u0629");
  } else if (order.needCutlery === false) {
    lines.push("<b>\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0637\u0639\u0627\u0645:</b> \u063A\u064A\u0631 \u0645\u0637\u0644\u0648\u0628\u0629");
  }
  if (scheduledSlot) {
    lines.push(`<b>\u0627\u0644\u0645\u0648\u0639\u062F:</b> ${escapeHtml(scheduledSlot)}`);
  }
  lines.push(`<b>\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0646\u0647\u0627\u0626\u064A: ${formatMoney(total)} ${currency}</b>`);
  if (notes) {
    lines.push(`<b>\u0645\u0644\u0627\u062D\u0638\u0627\u062A:</b> ${escapeHtml(notes)}`);
  }
  if (lat !== void 0 && lng !== void 0 && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    lines.push(divider);
    lines.push("\u{1F4CD} <b>\u0627\u0644\u0645\u0648\u0642\u0639:</b>");
    lines.push(`Google Maps: <a href="${escapeHtml(googleMapsUrl)}">${escapeHtml(googleMapsUrl)}</a>`);
    lines.push(`Waze: <a href="${escapeHtml(wazeUrl)}">${escapeHtml(wazeUrl)}</a>`);
  }
  if (footer && footer !== "\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u0632\u0628\u0648\u0646 \u0623\u0648 \u062A\u0627\u0628\u0639 \u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0637\u0644\u0628 \u0645\u0646 \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645.") {
    lines.push("");
    lines.push(`<i>${escapeHtml(footer)}</i>`);
  }
  return lines.join("\n");
}
async function sendOrderNotificationToTelegram(restaurant, order) {
  await loadTelegramConfigFromStore();
  if (!cachedTelegramConfig.enabled) {
    return { sent: false, reason: "bot_disabled" };
  }
  const token = getEffectiveBotToken();
  if (!token) {
    return { sent: false, reason: "no_token" };
  }
  if (!restaurant) {
    return { sent: false, reason: "no_restaurant" };
  }
  const channel = resolveRestaurantOrderChannel(restaurant);
  if (channel === "whatsapp") {
    return { sent: false, reason: "channel_whatsapp_only" };
  }
  if (channel !== "telegram" && restaurant.telegramNotificationsEnabled === false) {
    return { sent: false, reason: "store_notifications_disabled" };
  }
  await syncTelegramUsersFromSupabase();
  const rid = String(restaurant.id || "").trim();
  let chatId = String(restaurant.telegramChatId || "").trim() || null;
  let storePhone = String(restaurant.telegramPhone || "").trim();
  if (!chatId && restaurant.telegramUnlinkedManually !== true) {
    const allData = rid ? await readAll(false) : {};
    const candidates = rid ? collectRestaurantPhoneCandidates(rid, restaurant, allData) : [storePhone, isPhoneLikeCandidate(restaurant.ph)].filter(Boolean);
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
            enabled: restaurant.telegramNotificationsEnabled !== false
          }).catch(() => {
          });
        }
        break;
      }
    }
  }
  if (!chatId) {
    return { sent: false, reason: "no_chat_id" };
  }
  const text = formatOrderTelegramMessage(restaurant, order, false);
  const ok = await sendTelegramMessage(chatId, text);
  if (ok) {
    if (rid) lastSendErrorByRid.delete(rid);
    if (storePhone) recordMessageSent(storePhone);
  } else {
    if (rid) lastSendErrorByRid.set(rid, lastSendError || "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0639\u0628\u0631 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645");
    console.warn(`[Telegram Order] Failed sending order #${String(order.id || "").slice(-6)} to chatId=${chatId}: ${lastSendError || "unknown"}`);
  }
  return { sent: ok, ...ok ? {} : { reason: lastSendError || "telegram_send_failed" } };
}
async function sendPartnerTestOrderNotification(rid) {
  await loadTelegramConfigFromStore();
  const status = await getTelegramOrderLinkStatus(rid);
  if (!status.botConfigured) {
    return { ok: false, message: "\u0628\u0648\u062A \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u063A\u064A\u0631 \u0645\u0647\u064A\u0623 \u062D\u0627\u0644\u064A\u0627\u064B \u0645\u0646 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0646\u0635\u0629." };
  }
  if (!status.botEnabled) {
    return { ok: false, message: "\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0639\u0628\u0631 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u0645\u062A\u0648\u0642\u0641 \u062D\u0627\u0644\u064A\u0627\u064B \u0645\u0646 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0646\u0635\u0629." };
  }
  if (!status.linked) {
    return { ok: false, message: "\u0644\u0645 \u064A\u062A\u0645 \u0631\u0628\u0637 \u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0628\u0627\u0644\u0628\u0648\u062A \u0628\u0639\u062F. \u0634\u0627\u0631\u0643 \u0631\u0642\u0645\u0643 \u0641\u064A \u0627\u0644\u0628\u0648\u062A \u0623\u0648\u0644\u0627\u064B." };
  }
  const allData = await readAll(false);
  const rest = allData[`restaurants/${rid}`] || { n: "\u0645\u062A\u062C\u0631\u064A", currency: "\u062F.\u0639" };
  const chatId = String(rest.telegramChatId || getVerifiedChatIdForPhone(status.telegramPhone) || "").trim();
  if (!chatId) {
    return { ok: false, message: "\u062A\u0639\u0630\u0631 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u062D\u0627\u062F\u062B\u0629 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u0627\u0644\u0645\u0631\u0628\u0648\u0637\u0629." };
  }
  const nowTs = Date.now();
  const nextSeq = Math.max(1, (Number(rest.o || 0) || 0) + 1);
  const sampleOrder = {
    id: `test_${nowTs}`,
    at: nowTs,
    seq: nextSeq,
    orderSeq: nextSeq,
    type: "delivery",
    tot: 15e3,
    cu: {
      n: "\u0632\u0628\u0648\u0646 \u062A\u062C\u0631\u064A\u0628\u064A",
      ph: status.telegramPhone || "07700000000",
      address: "\u0628\u063A\u062F\u0627\u062F \u2014 \u0627\u0644\u0645\u0646\u0635\u0648\u0631",
      orderType: "delivery",
      deliveryFee: 3e3,
      lat: 33.3152,
      lng: 44.3661,
      nt: "\u0631\u0633\u0627\u0644\u0629 \u062A\u062C\u0631\u0628\u0629 \u0644\u0627\u0633\u062A\u0644\u0627\u0645 \u0627\u0644\u0637\u0644\u0628\u0627\u062A"
    },
    items: [
      { n: "\u0648\u062C\u0628\u0629 \u062A\u062C\u0631\u064A\u0628\u064A\u0629", q: 1, p: 12e3 }
    ]
  };
  const text = formatOrderTelegramMessage(rest, sampleOrder, true);
  const sent = await sendTelegramMessage(chatId, text);
  if (!sent) {
    lastSendErrorByRid.set(rid, lastSendError || "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A (\u062A\u0623\u0643\u062F \u0645\u0646 \u0623\u0646\u0643 \u0644\u0645 \u062A\u062D\u0638\u0631 \u0627\u0644\u0628\u0648\u062A).");
    return { ok: false, message: "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A (\u062A\u0623\u0643\u062F \u0645\u0646 \u0623\u0646\u0643 \u0644\u0645 \u062A\u062D\u0638\u0631 \u0627\u0644\u0628\u0648\u062A)." };
  }
  lastSendErrorByRid.delete(rid);
  if (status.telegramPhone) recordMessageSent(status.telegramPhone);
  return { ok: true, message: "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628 \u062A\u062C\u0631\u064A\u0628\u064A \u0625\u0644\u0649 \u062D\u0633\u0627\u0628\u0643 \u0641\u064A \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u2713" };
}
async function claimIncomingMessageLock(chatId, messageId) {
  if (!messageId) return true;
  const msgKey = `${chatId}_${messageId}`;
  if (processedMessageKeys.has(msgKey)) {
    return false;
  }
  processedMessageKeys.add(msgKey);
  if (processedMessageKeys.size > 2e3) {
    const firstKey = processedMessageKeys.values().next().value;
    if (firstKey) processedMessageKeys.delete(firstKey);
  }
  const lockKey = `${TELEGRAM_MSG_LOCK_KV_PREFIX}${msgKey}`;
  const existing = await getInternalStoreItem(lockKey).catch(() => null);
  if (existing && existing.claimedAt) {
    return false;
  }
  const claimId = crypto.randomBytes(5).toString("hex");
  await setInternalStoreItem(lockKey, { claimedAt: Date.now(), claimId }).catch(() => {
  });
  const verified = await getInternalStoreItem(lockKey).catch(() => null);
  if (verified && verified.claimId && verified.claimId !== claimId) {
    return false;
  }
  return true;
}
async function handleIncomingTelegramMessage(msg) {
  await loadTelegramConfigFromStore();
  const chatId = msg.chat.id;
  const chatKey = String(chatId);
  const text = (msg.text || "").trim();
  const msgAgeSec = msg.date ? Math.floor(Date.now() / 1e3) - msg.date : 0;
  if (msgAgeSec > 1800) {
    console.warn(`[Telegram Bot] Skipping stale message (${msgAgeSec}s old) from chat=${chatId}`);
    return;
  }
  if (!await claimIncomingMessageLock(chatId, msg.message_id)) {
    return;
  }
  console.log(`[Telegram Bot] Processing message from chat=${chatId}: ${msg.contact ? "[contact]" : JSON.stringify(text)}`);
  await syncTelegramUsersFromSupabase();
  if (msg.contact && msg.contact.phone_number) {
    const contactUserId = msg.contact.user_id;
    const senderUserId = msg.from?.id;
    if (contactUserId === void 0 || senderUserId === void 0 || Number(contactUserId) !== Number(senderUserId)) {
      await sendTelegramMessage(
        chatId,
        "\u0639\u0630\u0631\u0627\u064B\u060C \u064A\u0631\u062C\u0649 \u0645\u0634\u0627\u0631\u0643\u0629 \u0631\u0642\u0645 \u0647\u0627\u062A\u0641 \u062D\u0633\u0627\u0628\u0643 \u0627\u0644\u0634\u062E\u0635\u064A \u0639\u0628\u0631 \u0627\u0644\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0644\u0632\u0631 \u0628\u0627\u0644\u0623\u0633\u0641\u0644 \u0641\u0642\u0637.",
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
      verifiedContact: true
    });
    const pendingToken = await takePendingLinkForChat(chatKey);
    let linkedCount = 0;
    if (pendingToken) {
      const pendingLink = await getPendingOrderLink(pendingToken);
      if (pendingLink) {
        if (!phonesMatch(verifiedContactPhone, pendingLink.phone)) {
          await sendTelegramMessage(
            chatId,
            `\u0631\u0642\u0645 \u0647\u0627\u062A\u0641 \u062D\u0633\u0627\u0628 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u0647\u0630\u0627 (${verifiedContactPhone}) \u064A\u062E\u062A\u0644\u0641 \u0639\u0646 \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0645\u062F\u062E\u0644 \u0641\u064A \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 (${pendingLink.phone}).
\u064A\u0631\u062C\u0649 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0631\u0642\u0645 \u0641\u064A \u0642\u0633\u0645 \xAB\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u062A\u0644\u064A\u062C\u0631\u0627\u0645\xBB \u0641\u064A \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0623\u0648 \u0641\u062A\u062D \u0627\u0644\u0628\u0648\u062A \u0645\u0646 \u0627\u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0637\u0627\u0628\u0642.`,
            { remove_keyboard: true }
          );
          return;
        }
        const ok = await bindRestaurantToTelegram(pendingLink.rid, {
          phone: pendingLink.phone,
          chatId,
          username: msg.from?.username,
          enabled: true
        });
        if (ok) linkedCount++;
      }
    }
    const autoLinkedStores = await autoLinkRestaurantsByPhone(
      verifiedContactPhone,
      chatId,
      msg.from?.username,
      true
    );
    const totalLinked = linkedCount + autoLinkedStores.length;
    let replyText;
    if (totalLinked > 0) {
      const storeNames = autoLinkedStores.map((s) => `\u2022 ${s.name}`).join("\n");
      replyText = `${cachedTelegramConfig.verifiedSuccessText || DEFAULT_TELEGRAM_CONFIG.verifiedSuccessText}

\u{1F4F1} \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0645\u062D\u0641\u0648\u0638: <code>${escapeHtml(verifiedContactPhone)}</code>` + (storeNames ? `
\u{1F3EA} \u0627\u0644\u0645\u062A\u0627\u062C\u0631 \u0627\u0644\u0645\u0631\u0628\u0648\u0637\u0629:
${escapeHtml(storeNames)}` : "");
    } else {
      replyText = `\u2705 \u062A\u0645 \u062D\u0641\u0638 \u0631\u0642\u0645\u0643 (<code>${escapeHtml(verifiedContactPhone)}</code>) \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0628\u0646\u062C\u0627\u062D.

\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u062A\u062C\u0631 \u0645\u0633\u062C\u0644 \u0628\u0647\u0630\u0627 \u0627\u0644\u0631\u0642\u0645 \u062D\u0627\u0644\u064A\u0627\u064B \u2014 \u0641\u0648\u0631 \u062A\u0633\u062C\u064A\u0644 \u0645\u062A\u062C\u0631\u0643 \u0628\u0646\u0641\u0633 \u0627\u0644\u0631\u0642\u0645 \u0623\u0648 \u0625\u062F\u062E\u0627\u0644\u0647 \u0641\u064A \xAB\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u062A\u0644\u064A\u062C\u0631\u0627\u0645\xBB \u0628\u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0633\u064A\u062A\u0645 \u0627\u0644\u062A\u0639\u0631\u0641 \u0639\u0644\u064A\u0643 \u0648\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0647\u0646\u0627 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B.`;
    }
    const sent = await sendTelegramMessage(chatId, replyText, { remove_keyboard: true });
    if (!sent) console.warn(`[Telegram Bot] Failed replying after contact share to chat=${chatId}: ${lastSendError}`);
    return;
  }
  const startMatch = text.match(/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s+([a-zA-Z0-9_-]+))?/i);
  const param = startMatch ? startMatch[1]?.trim() : void 0;
  let knownVerifiedPhone = findVerifiedPhoneForChatId(chatId);
  if (!knownVerifiedPhone) {
    await syncTelegramUsersFromSupabase(true, true);
    knownVerifiedPhone = findVerifiedPhoneForChatId(chatId);
  }
  if (param && param.startsWith("ord_")) {
    const pendingLink = await getPendingOrderLink(param);
    if (!pendingLink) {
      const sent2 = await sendTelegramMessage(
        chatId,
        "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0631\u0627\u0628\u0637 \u0627\u0644\u0631\u0628\u0637\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0639\u0648\u062F\u0629 \u0625\u0644\u0649 \u0642\u0633\u0645 \xAB\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u062A\u0644\u064A\u062C\u0631\u0627\u0645\xBB \u0641\u064A \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0648\u0627\u0644\u0636\u063A\u0637 \u0639\u0644\u0649 \u0632\u0631 \u0627\u0644\u0631\u0628\u0637 \u0645\u062C\u062F\u062F\u0627\u064B.",
        { remove_keyboard: true }
      );
      if (!sent2) console.warn(`[Telegram Bot] Failed replying to expired ord_ link for chat=${chatId}: ${lastSendError}`);
      return;
    }
    if (knownVerifiedPhone && phonesMatch(knownVerifiedPhone, pendingLink.phone)) {
      await bindRestaurantToTelegram(pendingLink.rid, {
        phone: pendingLink.phone,
        chatId,
        username: msg.from?.username,
        enabled: true
      });
      const sent2 = await sendTelegramMessage(
        chatId,
        cachedTelegramConfig.verifiedSuccessText || DEFAULT_TELEGRAM_CONFIG.verifiedSuccessText,
        { remove_keyboard: true }
      );
      if (!sent2) console.warn(`[Telegram Bot] Failed replying verified ord_ link for chat=${chatId}: ${lastSendError}`);
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
      const storeNames = matchedStores.map((s) => `\u2022 ${s.name}`).join("\n");
      const sent = await sendTelegramMessage(
        chatId,
        `\u062D\u0633\u0627\u0628\u0643 \u0645\u0631\u0628\u0648\u0637 \u0648\u0645\u064F\u0641\u0639\u0651\u0644 \u0644\u0627\u0633\u062A\u0642\u0628\u0627\u0644 \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0639\u0628\u0631 \u0645\u0646\u064A\u0648 \u0628\u0644\u0633 \u2705

\u{1F4F1} \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0645\u062D\u0641\u0648\u0638: <code>${escapeHtml(
          knownVerifiedPhone
        )}</code>
\u{1F3EA} \u0627\u0644\u0645\u062A\u0627\u062C\u0631 \u0627\u0644\u0645\u0631\u0628\u0648\u0637\u0629:
${escapeHtml(storeNames)}`,
        { remove_keyboard: true }
      );
      if (!sent) console.warn(`[Telegram Bot] Failed sending active confirmation to chat=${chatId}: ${lastSendError}`);
    } else {
      const sent = await sendTelegramMessage(
        chatId,
        `\u0631\u0642\u0645\u0643 (<code>${escapeHtml(
          knownVerifiedPhone
        )}</code>) \u0645\u062D\u0641\u0648\u0638 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A\u060C \u0644\u0643\u0646 \u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u062A\u062C\u0631 \u0645\u0637\u0627\u0628\u0642 \u0644\u0647 \u062D\u0627\u0644\u064A\u0627\u064B.
\u064A\u0645\u0643\u0646\u0643 \u0645\u0634\u0627\u0631\u0643\u0629 \u0631\u0642\u0645 \u0622\u062E\u0631 \u0628\u0627\u0644\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0644\u0632\u0631 \u0628\u0627\u0644\u0623\u0633\u0641\u0644 \u0623\u0648 \u062A\u0633\u062C\u064A\u0644 \u0645\u062A\u062C\u0631\u0643 \u0628\u0646\u0641\u0633 \u0627\u0644\u0631\u0642\u0645 \u0644\u062A\u0635\u0644\u0643 \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B.`,
        buildRequestContactKeyboard()
      );
      if (!sent) console.warn(`[Telegram Bot] Failed sending re-share keyboard to chat=${chatId}: ${lastSendError}`);
    }
  }
}
var isPollingActive = false;
var lastUpdateId = 0;
var consecutiveAuthErrors = 0;
var pollingGeneration = 0;
var pollingStartPromise = null;
function loadPollStateFromDisk(expectedTokenHash) {
  try {
    if (fs3.existsSync(TELEGRAM_POLL_STATE_FILE)) {
      const parsed = JSON.parse(fs3.readFileSync(TELEGRAM_POLL_STATE_FILE, "utf-8"));
      if (expectedTokenHash && parsed?.tokenHash && parsed.tokenHash !== expectedTokenHash) {
        lastUpdateId = 0;
        return;
      }
      if (typeof parsed?.lastUpdateId === "number" && parsed.lastUpdateId > lastUpdateId) {
        lastUpdateId = parsed.lastUpdateId;
      }
    }
  } catch {
  }
}
async function loadPollStateFromStore(expectedTokenHash) {
  loadPollStateFromDisk(expectedTokenHash);
  try {
    const kvState = await getInternalStoreItem(
      TELEGRAM_POLL_STATE_KV_KEY
    );
    if (expectedTokenHash && kvState?.tokenHash && kvState.tokenHash !== expectedTokenHash) {
      lastUpdateId = 0;
      return;
    }
    if (typeof kvState?.lastUpdateId === "number" && kvState.lastUpdateId > lastUpdateId) {
      lastUpdateId = kvState.lastUpdateId;
    }
  } catch {
  }
}
function persistPollState(updateId, tokenHash) {
  if (!updateId) return;
  const payload = { lastUpdateId: updateId, ...tokenHash ? { tokenHash } : {}, updatedAt: Date.now() };
  try {
    writeFileAtomicSync2(TELEGRAM_POLL_STATE_FILE, JSON.stringify(payload));
  } catch {
  }
  void setInternalStoreItem(TELEGRAM_POLL_STATE_KV_KEY, payload).catch(() => {
  });
}
function stopTelegramBotPolling() {
  pollingGeneration++;
  isPollingActive = false;
}
async function restartTelegramBotPolling() {
  stopTelegramBotPolling();
  await new Promise((r) => setTimeout(r, 250));
  await startTelegramBotPolling();
}
async function startTelegramBotPolling() {
  if (isPollingActive) return;
  if (pollingStartPromise) return pollingStartPromise;
  pollingStartPromise = (async () => {
    await loadTelegramConfigFromStore();
    if (isPollingActive) return;
    const initialInfo = getEffectiveBotTokenInfo();
    if (!initialInfo.token) {
      lastPollError = "";
      console.log("[Telegram Bot] Bot token not configured; polling disabled.");
      return;
    }
    const identity = await syncVerifiedBotIdentity(void 0, true);
    const activeInfo = getEffectiveBotTokenInfo();
    const token = activeInfo.token;
    if (!identity.ok && identity.error && /401|404|غير صالح|غير صحيحة|Not Found/i.test(identity.error)) {
      lastPollError = identity.error;
      isPollingActive = false;
      console.warn("[Telegram Bot] Invalid/rejected bot token:", identity.error);
      return;
    }
    const activeTokenHash = getTokenHash(token);
    await loadPollStateFromStore(activeTokenHash);
    const botUsername = getEffectiveBotUsername();
    const myGen = ++pollingGeneration;
    isPollingActive = true;
    lastPollError = "";
    lastPollSuccessAt = 0;
    console.log(`[Telegram Bot] Initializing polling for @${botUsername} (source=${activeInfo.source}, offset=${lastUpdateId})...`);
    try {
      const delRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`, {
        signal: AbortSignal.timeout(1e4)
      });
      const delJson = await delRes.json().catch(() => ({}));
      if (!delJson.ok && delJson.description) {
        console.warn("[Telegram Bot] deleteWebhook notice:", delJson.description);
      }
    } catch {
    }
    let lastLoggedErrAt = 0;
    let consecutivePollNetworkErrors = 0;
    let isFirstPollCycle = true;
    const encodedAllowedUpdates = encodeURIComponent(JSON.stringify(["message"]));
    async function pollLoop() {
      while (isPollingActive && pollingGeneration === myGen) {
        const currentInfo = getEffectiveBotTokenInfo();
        const currentToken = currentInfo.token;
        if (!currentToken) {
          isPollingActive = false;
          lastPollError = "";
          break;
        }
        const currentHash = getTokenHash(currentToken);
        const pollTimeoutSec = isFirstPollCycle ? 0 : 10;
        isFirstPollCycle = false;
        try {
          const url = `https://api.telegram.org/bot${currentToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=${pollTimeoutSec}&allowed_updates=${encodedAllowedUpdates}`;
          const res = await fetch(url, {
            signal: AbortSignal.timeout(pollTimeoutSec === 0 ? 1e4 : 15e3)
          });
          const rawText = await res.text().catch(() => "");
          let data = {};
          try {
            data = rawText ? JSON.parse(rawText) : {};
          } catch {
            data = { ok: false, description: rawText || `HTTP ${res.status}` };
          }
          if (res.status === 401 || res.status === 404) {
            consecutiveAuthErrors++;
            const friendly = formatTelegramTokenError(res.status, data.description, currentInfo.source, currentToken);
            lastPollError = friendly;
            lastTokenError = friendly;
            lastTokenErrorAt = Date.now();
            verifiedTokenHash = "";
            verifiedTokenUsername = "";
            verifiedTokenBotName = "";
            if (consecutiveAuthErrors === 1) {
              console.warn(`[Telegram Bot] ${res.status} rejected bot token (${currentInfo.source}). Polling backoff active.`);
            }
            await new Promise((r) => setTimeout(r, 3e4));
            continue;
          }
          if (res.status === 409) {
            const desc = String(data.description || "");
            if (/webhook/i.test(desc)) {
              lastPollError = "";
              await fetch(`https://api.telegram.org/bot${currentToken}/deleteWebhook?drop_pending_updates=false`, {
                signal: AbortSignal.timeout(8e3)
              }).catch(() => {
              });
              await new Promise((r) => setTimeout(r, 1500));
            } else {
              consecutivePollNetworkErrors = 0;
              lastPollError = "";
              if (!lastPollSuccessAt) {
                lastPollSuccessAt = Date.now();
              }
              const nowTs = Date.now();
              if (nowTs - lastLoggedErrAt > 12e4) {
                lastLoggedErrAt = nowTs;
                console.log("[Telegram Bot] Shared polling active on sibling instance; keeping user sync & sending active.");
              }
              await syncTelegramUsersFromSupabase().catch(() => {
              });
              await new Promise((r) => setTimeout(r, 12e3));
            }
            continue;
          }
          consecutiveAuthErrors = 0;
          if (!res.ok || !data.ok) {
            consecutivePollNetworkErrors++;
            if (consecutivePollNetworkErrors >= 3) {
              lastPollError = data.description || `HTTP ${res.status}`;
            }
            await new Promise((r) => setTimeout(r, 4e3));
            continue;
          }
          consecutivePollNetworkErrors = 0;
          lastPollError = "";
          lastTokenError = "";
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
              if (processedUpdateIds.size > 2e3) {
                const firstUpd = processedUpdateIds.values().next().value;
                if (firstUpd !== void 0) processedUpdateIds.delete(firstUpd);
              }
              const msg = update.message;
              if (!msg) continue;
              await handleIncomingTelegramMessage(msg);
            }
          }
        } catch (err) {
          const msg = err?.message || String(err);
          consecutivePollNetworkErrors++;
          if (consecutivePollNetworkErrors >= 3) {
            lastPollError = msg;
          }
          const nowTs = Date.now();
          if (nowTs - lastLoggedErrAt > 3e4) {
            lastLoggedErrAt = nowTs;
            console.warn("[Telegram Bot] Polling error:", msg);
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
function getTelegramBotStatus() {
  const uniquePhones = /* @__PURE__ */ new Set();
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
    provider: "telegram"
  };
}
async function getAdminTelegramConfig() {
  await loadTelegramConfigFromStore();
  await syncTelegramUsersFromSupabase();
  const tokenInfo = getEffectiveBotTokenInfo();
  const effectiveToken = tokenInfo.token;
  const shouldRecheck = Boolean(lastTokenError && Date.now() - lastTokenErrorAt > 1e4);
  if (effectiveToken && (!verifiedTokenUsername || shouldRecheck)) {
    await syncVerifiedBotIdentity(void 0, shouldRecheck).catch(() => {
    });
  }
  const freshTokenInfo = getEffectiveBotTokenInfo();
  const status = getTelegramBotStatus();
  return {
    enabled: cachedTelegramConfig.enabled,
    botUsername: getEffectiveBotUsername(),
    configuredBotUsername: cachedTelegramConfig.botUsername,
    verifiedBotUsername: verifiedTokenUsername || null,
    hasBotTokenOverride: Boolean(normalizeBotToken(cachedTelegramConfig.botTokenOverride || "")),
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
      lastPollSuccessAt: lastPollSuccessAt || null
    }
  };
}
async function updateAdminTelegramConfig(patch) {
  await loadTelegramConfigFromStore();
  const prevToken = getEffectiveBotToken();
  let nextOverride = cachedTelegramConfig.botTokenOverride;
  if (patch.clearTokenOverride) {
    nextOverride = "";
  } else if (typeof patch.botTokenOverride === "string" && patch.botTokenOverride.trim()) {
    const rawDraft = patch.botTokenOverride.trim();
    if (!rawDraft.includes("\u2022") && !rawDraft.includes("*")) {
      const normalizedDraft = normalizeBotToken(rawDraft);
      if (!normalizedDraft || !isValidBotTokenFormat(normalizedDraft)) {
        throw new Error(
          "\u0635\u064A\u063A\u0629 \u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A \u0627\u0644\u0645\u062F\u062E\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629 \u2014 \u0627\u0646\u0633\u062E \u0627\u0644\u062A\u0648\u0643\u0646 \u0645\u0646 @BotFather \u0628\u0627\u0644\u0635\u064A\u063A\u0629 (123456789:ABC...) \u0628\u062F\u0648\u0646 \u0643\u0644\u0645\u0629 bot \u0623\u0648 \u0639\u0644\u0627\u0645\u0627\u062A \u0627\u0642\u062A\u0628\u0627\u0633."
        );
      }
      nextOverride = normalizedDraft;
    }
  }
  if (typeof patch.proxyUrl === "string" && patch.proxyUrl.trim()) {
    const validProxy = sanitizeTelegramProxyUrl(patch.proxyUrl);
    if (!validProxy) {
      throw new Error(
        "\u0635\u064A\u063A\u0629 \u0631\u0627\u0628\u0637 \u0628\u0631\u0648\u0643\u0633\u064A \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629 \u2014 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u0627\u0644\u0635\u064A\u063A\u0629 https://t.me/proxy?server=... \u0623\u0648 tg://proxy?server=..."
      );
    }
    patch = { ...patch, proxyUrl: validProxy };
  } else if (typeof patch.proxyUrl === "string" && !patch.proxyUrl.trim()) {
    patch = { ...patch, proxyUrl: DEFAULT_TELEGRAM_PROXY_URL };
  }
  cachedTelegramConfig = sanitizeConfigObject({
    ...cachedTelegramConfig,
    ...patch,
    botTokenOverride: nextOverride,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  const nextToken = getEffectiveBotToken();
  if (nextToken && (nextToken !== prevToken || lastTokenError)) {
    if (nextToken !== prevToken) {
      lastUpdateId = 0;
      lastPollSuccessAt = 0;
      try {
        if (fs3.existsSync(TELEGRAM_POLL_STATE_FILE)) fs3.unlinkSync(TELEGRAM_POLL_STATE_FILE);
      } catch {
      }
      void deleteInternalStoreItem(TELEGRAM_POLL_STATE_KV_KEY).catch(() => {
      });
    }
    lastPollError = "";
    lastSendError = "";
    lastTokenError = "";
    lastTokenErrorAt = 0;
    const identity = await syncVerifiedBotIdentity(void 0, true);
    if (identity.ok && identity.username) {
      cachedTelegramConfig.botUsername = identity.username;
    }
  } else if (!nextToken) {
    verifiedTokenHash = "";
    verifiedTokenUsername = "";
    verifiedTokenBotName = "";
    lastTokenError = "";
    lastTokenErrorAt = 0;
  }
  writeFileAtomicSync2(TELEGRAM_CONFIG_FILE, JSON.stringify(cachedTelegramConfig, null, 2));
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
async function verifyTelegramBotLive(rid) {
  await loadTelegramConfigFromStore(true);
  const token = getEffectiveBotToken();
  if (!token) {
    return {
      ok: false,
      diagnosticMessage: "\u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u0641\u064A \u0627\u0644\u0645\u0646\u0635\u0629 (TELEGRAM_BOT_TOKEN \u0623\u0648 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0623\u062F\u0645\u0646).",
      status: await getTelegramOrderLinkStatus(rid)
    };
  }
  const identity = await syncVerifiedBotIdentity(void 0, true);
  if (!identity.ok) {
    lastPollError = identity.error || "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062A\u0648\u0643\u0646";
    return {
      ok: false,
      diagnosticMessage: identity.error || "\u0641\u0634\u0644 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A.",
      status: await getTelegramOrderLinkStatus(rid)
    };
  }
  const resolvedToken = getEffectiveBotToken();
  let webhookCleared = false;
  try {
    const whRes = await fetch(`https://api.telegram.org/bot${resolvedToken}/getWebhookInfo`, {
      signal: AbortSignal.timeout(8e3)
    });
    const whData = await whRes.json();
    if (whData?.result?.url) {
      await fetch(`https://api.telegram.org/bot${resolvedToken}/deleteWebhook?drop_pending_updates=false`, {
        signal: AbortSignal.timeout(8e3)
      });
      webhookCleared = true;
    }
  } catch {
  }
  if (!isPollingActive) {
    await restartTelegramBotPolling();
    await new Promise((r) => setTimeout(r, 900));
  } else {
    lastPollError = "";
  }
  lastSendErrorByRid.delete(String(rid || "").trim());
  const freshStatus = await getTelegramOrderLinkStatus(rid);
  if (freshStatus.lastPollError) {
    return {
      ok: false,
      diagnosticMessage: freshStatus.lastPollError,
      status: freshStatus
    };
  }
  return {
    ok: true,
    diagnosticMessage: `\u0627\u0644\u0628\u0648\u062A @${freshStatus.botUsername} \u0645\u062A\u0635\u0644 \u0648\u064A\u0633\u062A\u0642\u0628\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0628\u0634\u0643\u0644 \u0633\u0644\u064A\u0645 \u2713${webhookCleared ? " (\u062A\u0645\u062A \u0625\u0632\u0627\u0644\u0629 Webhook \u0639\u0627\u0644\u0642)" : ""}`,
    status: freshStatus
  };
}
async function testTelegramBotConnection(customToken) {
  await loadTelegramConfigFromStore(true);
  const rawCustom = String(customToken || "").trim();
  const tokenInfo = rawCustom ? { token: normalizeBotToken(rawCustom), source: "override" } : getEffectiveBotTokenInfo();
  const token = tokenInfo.token;
  if (!token) {
    return { ok: false, error: "\u0644\u0645 \u064A\u062A\u0645 \u062A\u0639\u064A\u064A\u0646 \u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A \u0628\u0639\u062F." };
  }
  if (!isValidBotTokenFormat(token)) {
    return {
      ok: false,
      error: `\u0635\u064A\u063A\u0629 \u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629 (\u0627\u0644\u0645\u0635\u062F\u0631: ${getTokenSourceLabel(tokenInfo.source)} \xB7 ${maskToken(token)}) \u2014 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u0627\u0644\u0635\u064A\u063A\u0629 (123456789:ABC...) \u0645\u0646 @BotFather \u0628\u062F\u0648\u0646 \u0643\u0644\u0645\u0629 bot \u0623\u0648 \u0639\u0644\u0627\u0645\u0627\u062A \u0627\u0642\u062A\u0628\u0627\u0633.`
    };
  }
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(1e4)
    });
    const meData = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !meData.ok || !meData.result) {
      return {
        ok: false,
        error: meRes.status === 401 || meRes.status === 404 ? formatTelegramTokenError(meRes.status, meData.description, tokenInfo.source, token) : meData.description || "\u0641\u0634\u0644 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A \u0639\u0628\u0631 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645."
      };
    }
    let webhookUrl = "";
    try {
      const whRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
        signal: AbortSignal.timeout(8e3)
      });
      const whData = await whRes.json();
      webhookUrl = whData?.result?.url || "";
      if (webhookUrl) {
        await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`, {
          signal: AbortSignal.timeout(8e3)
        });
      }
    } catch {
    }
    return {
      ok: true,
      bot: meData.result,
      webhookUrl
    };
  } catch (err) {
    return { ok: false, error: err?.message || "\u062A\u0639\u0630\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u062E\u0648\u0627\u062F\u0645 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645." };
  }
}
async function sendTelegramTestMessage(targetPhoneOrChatId, customText) {
  await loadTelegramConfigFromStore();
  await syncTelegramUsersFromSupabase();
  const token = getEffectiveBotToken();
  if (!token) {
    return { ok: false, message: "\u062A\u0648\u0643\u0646 \u0627\u0644\u0628\u0648\u062A \u063A\u064A\u0631 \u0645\u0647\u064A\u0623." };
  }
  const rawTarget = String(targetPhoneOrChatId || "").trim();
  if (!rawTarget) {
    return { ok: false, message: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0642\u0645 \u0647\u0627\u062A\u0641 \u0645\u0631\u0628\u0648\u0637 \u0623\u0648 Chat ID." };
  }
  let resolvedChatId = getVerifiedChatIdForPhone(rawTarget);
  if (!resolvedChatId && /^-?\d{5,16}$/.test(rawTarget)) {
    resolvedChatId = rawTarget;
  }
  if (!resolvedChatId) {
    return {
      ok: false,
      message: "\u0647\u0630\u0627 \u0627\u0644\u0631\u0642\u0645 \u063A\u064A\u0631 \u0645\u0631\u0628\u0648\u0637 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u0628\u0639\u062F\u060C \u0623\u0648 \u0623\u062F\u062E\u0644 Chat ID \u0631\u0642\u0645\u064A \u0645\u0628\u0627\u0634\u0631."
    };
  }
  const body = String(customText || "").trim() || "\u0631\u0633\u0627\u0644\u0629 \u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0646 \u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0645\u0646\u064A\u0648 \u0628\u0644\u0633 \u2705 \u2014 \u0627\u0644\u0628\u0648\u062A \u064A\u0639\u0645\u0644 \u0648\u064A\u0631\u0633\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0628\u0646\u062C\u0627\u062D.";
  const sent = await sendTelegramMessage(resolvedChatId, body);
  if (!sent) {
    return {
      ok: false,
      chatId: String(resolvedChatId),
      message: "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0625\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628 (\u062A\u0623\u0643\u062F \u0645\u0646 \u0627\u0644\u062A\u0648\u0643\u0646 \u0648\u0623\u0646 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0644\u0645 \u064A\u062D\u0638\u0631 \u0627\u0644\u0628\u0648\u062A)."
    };
  }
  return {
    ok: true,
    chatId: String(resolvedChatId),
    message: `\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629 \u0628\u0646\u062C\u0627\u062D \u0625\u0644\u0649 (${resolvedChatId}) \u2713`
  };
}

// server/auth.ts
import crypto2 from "node:crypto";
import fs4 from "node:fs";
import path4 from "node:path";
var PASSWORD_SALT = "menuplus_secure_salt_2026";
var AUTH_SECRET_FILE = path4.resolve(process.cwd(), "data/.auth-secret");
var AUTH_COOKIE_NAME = "mp_sid";
var SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
var cachedAuthSecret = "";
function getAuthSecret() {
  if (cachedAuthSecret) return cachedAuthSecret;
  const fromEnv = String(process.env.SESSION_SECRET || "").trim();
  if (fromEnv && fromEnv.length >= 16) {
    cachedAuthSecret = fromEnv;
    return cachedAuthSecret;
  }
  try {
    const dir = path4.dirname(AUTH_SECRET_FILE);
    if (!fs4.existsSync(dir)) fs4.mkdirSync(dir, { recursive: true });
    if (fs4.existsSync(AUTH_SECRET_FILE)) {
      const saved = fs4.readFileSync(AUTH_SECRET_FILE, "utf-8").trim();
      if (saved.length >= 32) {
        cachedAuthSecret = saved;
        return cachedAuthSecret;
      }
    }
    const generated = crypto2.randomBytes(32).toString("hex");
    fs4.writeFileSync(AUTH_SECRET_FILE, generated, { mode: 384 });
    cachedAuthSecret = generated;
    return cachedAuthSecret;
  } catch {
    cachedAuthSecret = crypto2.randomBytes(32).toString("hex");
    return cachedAuthSecret;
  }
}
function hashLegacySha256(identifier, pw) {
  const raw = `${identifier.trim().toLowerCase()}::${pw.trim().toLowerCase()}::${PASSWORD_SALT}`;
  return crypto2.createHash("sha256").update(raw, "utf8").digest("hex");
}
function hashPasswordScrypt(password) {
  const salt = crypto2.randomBytes(16).toString("hex");
  const derived = crypto2.scryptSync(password.trim(), salt, 64).toString("hex");
  return `$scrypt$${salt}$${derived}`;
}
function safeTimingEqual(a, b) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto2.timingSafeEqual(aBuf, bBuf);
}
function verifyStoredCredential(storedHash, candidateIdentifiers, plainPassword, allowPlainFallback = false) {
  const stored = String(storedHash || "").trim();
  const pw = String(plainPassword || "").trim();
  if (!stored || !pw) return false;
  if (stored.startsWith("$scrypt$")) {
    const parts = stored.split("$");
    if (parts.length !== 4) return false;
    const [, , salt, expectedHex] = parts;
    if (!salt || !expectedHex) return false;
    try {
      const derivedLower = crypto2.scryptSync(pw.toLowerCase(), salt, 64).toString("hex");
      if (safeTimingEqual(derivedLower, expectedHex)) return true;
      const derivedExact = crypto2.scryptSync(pw, salt, 64).toString("hex");
      return safeTimingEqual(derivedExact, expectedHex);
    } catch {
      return false;
    }
  }
  for (const cand of candidateIdentifiers) {
    const idStr = String(cand || "").trim();
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
function signSid(sid) {
  const sig = crypto2.createHmac("sha256", getAuthSecret()).update(sid).digest("base64url");
  return `${sid}.${sig}`;
}
function verifySignedSid(cookieVal) {
  const val = String(cookieVal || "").trim();
  if (!val) return null;
  const dotIdx = val.indexOf(".");
  if (dotIdx <= 0) {
    return null;
  }
  const sid = val.slice(0, dotIdx);
  const sig = val.slice(dotIdx + 1);
  if (!/^[a-zA-Z0-9_-]{12,96}$/.test(sid) || !sig) return null;
  const expected = crypto2.createHmac("sha256", getAuthSecret()).update(sid).digest("base64url");
  return safeTimingEqual(sig, expected) ? sid : null;
}
function parseRequestCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
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
function setAuthCookie(res, req, sid) {
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  const signed = sid ? signSid(sid) : "";
  const parts = [
    `${AUTH_COOKIE_NAME}=${signed ? encodeURIComponent(signed) : ""}`,
    "Path=/",
    "HttpOnly",
    isHttps ? "SameSite=None" : "SameSite=Lax"
  ];
  if (isHttps) parts.push("Secure", "Partitioned");
  if (sid) {
    parts.push(`Max-Age=${Math.floor(SESSION_TTL_MS / 1e3)}`);
  } else {
    parts.push("Max-Age=0");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}
function extractRequestSid(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    const sidFromBearer = verifySignedSid(token);
    if (sidFromBearer) return sidFromBearer;
  }
  const headerToken = String(req.headers["x-session-token"] || "").trim();
  if (headerToken) {
    const sidFromHeader = verifySignedSid(headerToken);
    if (sidFromHeader) return sidFromHeader;
  }
  const cookies = parseRequestCookies(req.headers.cookie);
  const rawCookie = cookies[AUTH_COOKIE_NAME] || "";
  return verifySignedSid(rawCookie);
}
var FULL_OWNER_PERMISSIONS = {
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
  canManageDatabase: true
};
function normalizeHierarchicalPermissions(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const canManageRestaurants = Boolean(src.canManageRestaurants || src.canManageUsers);
  const canManageSettings = src.canManageSettings !== void 0 ? Boolean(src.canManageSettings) : Boolean(src.canManagePlans);
  return {
    canViewAnalytics: Boolean(src.canViewAnalytics),
    canViewHome: src.canViewHome !== void 0 ? Boolean(src.canViewHome) : Boolean(src.canViewAnalytics ?? true),
    canManageRestaurants,
    canCreatePartner: src.canCreatePartner !== void 0 ? Boolean(src.canCreatePartner) : canManageRestaurants,
    canEditPartnerPlan: Boolean(src.canEditPartnerPlan || src.canExtendSubscription),
    canSuspendPartner: src.canSuspendPartner !== void 0 ? Boolean(src.canSuspendPartner) : canManageRestaurants,
    canEditPartnerProfile: src.canEditPartnerProfile !== void 0 ? Boolean(src.canEditPartnerProfile) : canManageRestaurants,
    canEditPartnerLinks: src.canEditPartnerLinks !== void 0 ? Boolean(src.canEditPartnerLinks) : canManageRestaurants,
    canImpersonatePartner: Boolean(src.canImpersonatePartner),
    canDeletePartner: Boolean(src.canDeletePartner),
    canEditDemoMenu: Boolean(src.canEditDemoMenu),
    canUseNotes: src.canUseNotes === void 0 ? true : Boolean(src.canUseNotes),
    canViewReports: src.canViewReports === void 0 ? true : Boolean(src.canViewReports),
    canManagePlans: Boolean(src.canManagePlans),
    canManageStaff: Boolean(src.canManageStaff),
    canManageSettings,
    canEditHomePage: src.canEditHomePage !== void 0 ? Boolean(src.canEditHomePage) : canManageSettings,
    canEditTabLabels: src.canEditTabLabels !== void 0 ? Boolean(src.canEditTabLabels) : canManageSettings,
    canReorderTabs: src.canReorderTabs !== void 0 ? Boolean(src.canReorderTabs) : canManageSettings,
    canManageThemeMode: src.canManageThemeMode !== void 0 ? Boolean(src.canManageThemeMode) : canManageSettings,
    canManageSubdomains: src.canManageSubdomains !== void 0 ? Boolean(src.canManageSubdomains) : canManageSettings,
    canRunMaintenance: src.canRunMaintenance !== void 0 ? Boolean(src.canRunMaintenance) : canManageSettings,
    canManageFinance: Boolean(src.canManageFinance),
    canManageDatabase: Boolean(src.canManageDatabase)
  };
}
async function createServerAuthSession(req, res, payload) {
  const sid = `mp_s_${crypto2.randomBytes(18).toString("hex")}`;
  const now = Date.now();
  const full = {
    ...payload,
    sid,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  };
  await setInternalStoreItem(`user_sessions/${sid}`, {
    session: full,
    updatedAt: now,
    expiresAt: full.expiresAt
  });
  setAuthCookie(res, req, sid);
  req.authSession = full;
  return full;
}
async function updateServerAuthSession(sid, nextSession) {
  const now = Date.now();
  await setInternalStoreItem(`user_sessions/${sid}`, {
    session: nextSession,
    updatedAt: now,
    expiresAt: nextSession.expiresAt || now + SESSION_TTL_MS
  });
}
async function destroyServerAuthSession(req, res) {
  const sidFromAuth = extractRequestSid(req);
  const cookies = parseRequestCookies(req.headers.cookie);
  const sidFromCookie = verifySignedSid(cookies[AUTH_COOKIE_NAME] || "");
  const sidsToDestroy = Array.from(new Set([sidFromAuth, sidFromCookie].filter((x) => Boolean(x))));
  for (const sid of sidsToDestroy) {
    await deleteInternalStoreItem(`user_sessions/${sid}`).catch(() => {
    });
  }
  setAuthCookie(res, req, null);
  req.authSession = null;
}
async function clearAuthSessionsByTarget(targetRid, targetAccountId) {
  try {
    const res = await readPrefixFromStore("user_sessions/");
    for (const item of res.items) {
      const ses = item.session;
      if (!ses) continue;
      if (targetRid && ses.rid === targetRid || targetAccountId && ses.accountId === targetAccountId) {
        await deleteInternalStoreItem(`user_sessions/${item.id}`).catch(() => {
        });
      }
    }
  } catch {
  }
}
function sanitizeAuthSessionForClient(ses) {
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
    menuLoggedOut: ses.menuLoggedOut ? true : void 0
  };
}
async function attachAuthSession(req, _res, next) {
  try {
    const sid = extractRequestSid(req);
    if (!sid) {
      req.authSession = null;
      return next();
    }
    const record = await getInternalStoreItem(`user_sessions/${sid}`);
    if (!record || !record.session || record.expiresAt && Date.now() > record.expiresAt) {
      if (record) {
        void deleteInternalStoreItem(`user_sessions/${sid}`);
      }
      req.authSession = null;
      return next();
    }
    const ses = record.session;
    if (ses.role === "staff" && ses.staffId) {
      const staffRec = await getInternalStoreItem(`staff/${ses.staffId}`);
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
    } else if (ses.role === "owner" || ses.admin && !ses.staffId) {
      if (ses.accountId) {
        const acc = await getInternalStoreItem(`accounts/${ses.accountId}`);
        if (!acc || acc.active === false) {
          void deleteInternalStoreItem(`user_sessions/${sid}`);
          req.authSession = null;
          return next();
        }
      }
      ses.permissions = FULL_OWNER_PERMISSIONS;
      req.authPermissions = FULL_OWNER_PERMISSIONS;
    } else if (ses.role === "partner") {
      if (ses.accountId) {
        const acc = await getInternalStoreItem(`accounts/${ses.accountId}`);
        if (!acc || acc.active === false) {
          void deleteInternalStoreItem(`user_sessions/${sid}`);
          req.authSession = null;
          return next();
        }
      }
      if (ses.rid && ses.rid !== "demo") {
        const rest = await getInternalStoreItem(`restaurants/${ses.rid}`);
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
function requireAdminOrStaff(permKey) {
  return (req, res, next) => {
    const ses = req.authSession;
    if (!ses || !ses.admin) {
      return res.status(401).json({
        success: false,
        error: "\u064A\u062A\u0637\u0644\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0628\u0635\u0644\u0627\u062D\u064A\u0629 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u0635\u0629"
      });
    }
    const perms = ses.role === "owner" || !ses.staffId ? FULL_OWNER_PERMISSIONS : req.authPermissions || normalizeHierarchicalPermissions(ses.permissions);
    if (permKey && !perms[permKey]) {
      return res.status(403).json({
        success: false,
        error: "\u0644\u064A\u0633\u062A \u0644\u062F\u064A\u0643 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0644\u0627\u0632\u0645\u0629 \u0644\u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621"
      });
    }
    return next();
  };
}
function matchesPhoneCandidates(a, b) {
  const s1 = String(a || "").trim();
  const s2 = String(b || "").trim();
  if (!s1 || !s2) return false;
  if (s1.toLowerCase() === s2.toLowerCase()) return true;
  if (s1.includes("@") || s2.includes("@")) return false;
  const k1 = new Set(normalizePhoneKeys(s1));
  const k2 = normalizePhoneKeys(s2);
  return k2.some((k) => k1.has(k));
}

// server/admin-routes.ts
import crypto3 from "node:crypto";
import { Router } from "express";

// server/subdomain.ts
import express from "express";
var SYSTEM_RESERVED_SUBDOMAINS = /* @__PURE__ */ new Set([
  "www",
  "admin",
  "api",
  "app",
  "mail",
  "smtp",
  "ftp",
  "cpanel",
  "webmail",
  "ns1",
  "ns2",
  "cdn",
  "static",
  "assets",
  "public",
  "dashboard",
  "login",
  "signup",
  "forgot",
  "onboard",
  "billing",
  "support",
  "help",
  "status",
  "menu",
  "home",
  "services",
  "steps",
  "demo",
  "pricing",
  "faq",
  "about",
  "root",
  "localhost"
]);
var MENU_CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
function isValidSixCharCode(slug) {
  return /^[a-z0-9]{6}$/.test(String(slug || "").trim().toLowerCase());
}
function collectTakenMenuSlugs(restaurants) {
  const taken = /* @__PURE__ */ new Set();
  for (const r of restaurants) {
    const s1 = sanitizeSubdomainValue(String(r.slug || ""));
    const s2 = sanitizeSubdomainValue(String(r.subdomain || ""));
    if (s1) taken.add(s1);
    if (s2) taken.add(s2);
  }
  return taken;
}
function generateUniqueMenuCode(takenSlugs) {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += MENU_CODE_CHARS.charAt(Math.floor(Math.random() * MENU_CODE_CHARS.length));
    }
    if (!SYSTEM_RESERVED_SUBDOMAINS.has(code) && !takenSlugs.has(code)) {
      takenSlugs.add(code);
      return code;
    }
  }
  const fallback = `m${Date.now().toString(36).slice(-5)}`.toLowerCase();
  takenSlugs.add(fallback);
  return fallback;
}
var DEFAULT_SUBDOMAIN_RULES = {
  enabled: false,
  baseDomain: String(process.env.BASE_DOMAIN || "menuplus.io").toLowerCase().trim(),
  maxLength: 32,
  blockedKeywords: [
    "admin",
    "www",
    "api",
    "mail",
    "root",
    "support",
    "menu",
    "app",
    "dashboard",
    "billing",
    "staff"
  ],
  allowHyphens: true
};
function sanitizeSubdomainValue(raw) {
  return String(raw || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
function normalizeSubdomainRules(site) {
  const raw = site?.subdomainRules && typeof site.subdomainRules === "object" ? site.subdomainRules : {};
  const baseDomain = String(raw.baseDomain || DEFAULT_SUBDOMAIN_RULES.baseDomain).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "menuplus.io";
  const maxLengthRaw = Number(raw.maxLength);
  const maxLength = Number.isFinite(maxLengthRaw) ? Math.min(63, Math.max(6, Math.round(maxLengthRaw))) : DEFAULT_SUBDOMAIN_RULES.maxLength;
  const blockedSource = Array.isArray(raw.blockedKeywords) ? raw.blockedKeywords : typeof raw.blockedKeywords === "string" ? raw.blockedKeywords.split(/[,\n]/) : DEFAULT_SUBDOMAIN_RULES.blockedKeywords;
  const blockedKeywords = Array.from(
    new Set(
      blockedSource.map((k) => sanitizeSubdomainValue(String(k))).filter(Boolean)
    )
  );
  return {
    enabled: raw.enabled === true,
    baseDomain,
    maxLength,
    blockedKeywords: blockedKeywords.length > 0 ? blockedKeywords : DEFAULT_SUBDOMAIN_RULES.blockedKeywords,
    allowHyphens: raw.allowHyphens !== false
  };
}
async function getSubdomainRulesFromStore() {
  const site = await getInternalStoreItem("settings/site");
  return normalizeSubdomainRules(site);
}
function extractPlansList(storedPlans) {
  if (Array.isArray(storedPlans)) {
    return storedPlans;
  }
  if (storedPlans && typeof storedPlans === "object" && Array.isArray(storedPlans.list)) {
    return storedPlans.list;
  }
  return [];
}
function getRequestHostHeader(req) {
  return String(
    req.headers["x-forwarded-host"] || req.headers["x-original-host"] || req.headers["x-host"] || req.headers.host || req.hostname || ""
  );
}
function extractSubdomainFromHost(hostHeader, baseDomain = DEFAULT_SUBDOMAIN_RULES.baseDomain) {
  const rawHost = String(hostHeader || "").split(",")[0].trim().toLowerCase().split(":")[0].replace(/\.+$/, "");
  if (!rawHost) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(rawHost) || rawHost.includes("[")) {
    return null;
  }
  if (rawHost === "localhost" || rawHost === "127.0.0.1" || rawHost.endsWith(".run.app") || rawHost.endsWith(".googleusercontent.com") || rawHost.endsWith(".web.app")) {
    if (rawHost.endsWith(".localhost")) {
      const candidate = rawHost.slice(0, -".localhost".length).replace(/^www\./, "");
      if (!candidate || candidate.includes(".") || SYSTEM_RESERVED_SUBDOMAINS.has(candidate)) {
        return null;
      }
      return candidate;
    }
    return null;
  }
  const cleanBase = baseDomain.toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
  if (rawHost === cleanBase || rawHost === `www.${cleanBase}`) {
    return null;
  }
  const suffix = `.${cleanBase}`;
  if (rawHost.endsWith(suffix)) {
    let sub = rawHost.slice(0, -suffix.length);
    if (sub.startsWith("www.")) {
      sub = sub.slice(4);
    }
    if (!sub || sub.includes(".") || SYSTEM_RESERVED_SUBDOMAINS.has(sub)) {
      return null;
    }
    return sub;
  }
  return null;
}
function validatePathSlugFormat(sub, rules) {
  const clean = String(sub || "").trim().toLowerCase();
  if (!clean || clean.length < 3 || clean.length > rules.maxLength) {
    return {
      valid: false,
      reason: "invalid_format",
      message: `\u064A\u062C\u0628 \u0623\u0646 \u064A\u062A\u0643\u0648\u0646 \u0627\u0633\u0645 \u0627\u0644\u0631\u0627\u0628\u0637 \u0645\u0646 3 \u0625\u0644\u0649 ${rules.maxLength} \u062D\u0631\u0641\u0627\u064B \u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0627\u064B \u0623\u0648 \u0631\u0642\u0645\u0627\u064B.`
    };
  }
  const pattern = rules.allowHyphens ? /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/ : /^[a-z0-9]+$/;
  if (!pattern.test(clean)) {
    return {
      valid: false,
      reason: "invalid_format",
      message: "\u064A\u064F\u0633\u0645\u062D \u0641\u0642\u0637 \u0628\u0627\u0644\u0623\u062D\u0631\u0641 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629 \u0627\u0644\u0635\u063A\u064A\u0631\u0629 \u0648\u0627\u0644\u0623\u0631\u0642\u0627\u0645 \u0648\u0627\u0644\u0634\u0631\u0637\u0629 (-)."
    };
  }
  if (SYSTEM_RESERVED_SUBDOMAINS.has(clean) || rules.blockedKeywords.includes(clean)) {
    return {
      valid: false,
      reason: "blocked_keyword",
      message: `\u0627\u0644\u0627\u0633\u0645 "${clean}" \u0645\u062D\u062C\u0648\u0632 \u0644\u0644\u0646\u0638\u0627\u0645\u060C \u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0633\u0645 \u0645\u062E\u062A\u0644\u0641.`
    };
  }
  return { valid: true };
}
function validateSubdomainFormat(sub, rules) {
  if (!rules.enabled) {
    return {
      valid: false,
      reason: "disabled",
      message: "\u0645\u064A\u0632\u0629 \u0627\u0644\u062F\u0648\u0645\u064A\u0646\u0627\u062A \u0627\u0644\u0641\u0631\u0639\u064A\u0629 \u0645\u0639\u0637\u0644\u0629 \u062D\u0627\u0644\u064A\u0627\u064B \u0645\u0646 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0625\u062F\u0627\u0631\u0629."
    };
  }
  return validatePathSlugFormat(sub, rules);
}
function isPaidPlanForRestaurant(rest, plansList) {
  if (!rest) return { isPaid: false, plan: null };
  const planId = String(rest.planId || "").trim();
  const planName = String(rest.p || "").trim();
  const matched = plansList.find((p) => planId && p.id === planId) || plansList.find((p) => planName && String(p.n || "").trim() === planName) || plansList.find((p) => planId && String(p.n || "").trim() === planId) || null;
  if (rest.id === "demo") {
    return { isPaid: true, plan: matched };
  }
  const explicitlyPaid = rest.isPaid === true;
  if (matched) {
    const customSlugFlag = matched.featuresMap?.customSlug;
    const price = Number(matched.pr || 0);
    const isPaid = explicitlyPaid || (customSlugFlag !== void 0 ? Boolean(customSlugFlag) : price > 0);
    return { isPaid, plan: matched };
  }
  return {
    isPaid: explicitlyPaid || Boolean(planId),
    plan: null
  };
}
async function resolveStoreBySubdomain(subdomainRaw) {
  const rules = await getSubdomainRulesFromStore();
  const subdomain = sanitizeSubdomainValue(subdomainRaw);
  const validation = validateSubdomainFormat(subdomain, rules);
  if (!validation.valid) {
    return {
      subdomain,
      rules,
      found: false,
      reason: validation.reason
    };
  }
  const [{ items: restaurants }, storedPlans] = await Promise.all([
    readPrefixFromStore("restaurants/"),
    getInternalStoreItem("settings/plans")
  ]);
  const plansList = extractPlansList(storedPlans);
  const matched = restaurants.find((r) => {
    const s1 = sanitizeSubdomainValue(String(r.slug || ""));
    const s2 = sanitizeSubdomainValue(String(r.subdomain || ""));
    return s1 === subdomain || s2 === subdomain;
  });
  if (!matched) {
    return { subdomain, rules, found: false, reason: "not_found" };
  }
  if (matched.a === 0) {
    return { subdomain, rules, found: false, reason: "inactive", restaurant: matched };
  }
  if (matched.e) {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (String(matched.e) < today) {
      return { subdomain, rules, found: false, reason: "expired", restaurant: matched };
    }
  }
  const { isPaid, plan } = isPaidPlanForRestaurant(matched, plansList);
  if (!isPaid) {
    return { subdomain, rules, found: false, reason: "unpaid_plan", restaurant: matched, plan };
  }
  return {
    subdomain,
    rules,
    found: true,
    restaurant: matched,
    plan
  };
}
function escapeHtml2(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderStoreNotFoundHtml(subdomain, baseDomain = "menuplus.io", reason) {
  const safeSub = escapeHtml2(subdomain || "store");
  const safeBase = escapeHtml2(baseDomain || "menuplus.io");
  const isUnpaidOrInactive = reason === "unpaid_plan" || reason === "inactive" || reason === "expired";
  const subtitleAr = isUnpaidOrInactive ? "\u0647\u0630\u0627 \u0627\u0644\u062F\u0648\u0645\u064A\u0646 \u0627\u0644\u0641\u0631\u0639\u064A \u063A\u064A\u0631 \u0645\u0641\u0639\u0644 \u062D\u0627\u0644\u064A\u0627\u064B \u0644\u0623\u0646 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0645\u0646\u062A\u0647\u064A \u0623\u0648 \u063A\u064A\u0631 \u0646\u0634\u0637." : `\u0644\u0645 \u0646\u062A\u0645\u0643\u0646 \u0645\u0646 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u062A\u062C\u0631 \u0623\u0648 \u0645\u0637\u0639\u0645 \u0645\u0633\u062C\u0644 \u0639\u0644\u0649 \u0627\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0641\u0631\u0639\u064A ${safeSub}.${safeBase}.`;
  const subtitleEn = isUnpaidOrInactive ? "This custom store subdomain is currently paused or requires an active paid subscription." : `Store not found for "${safeSub}.${safeBase}". It may have moved or is not activated yet.`;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Store not found | \u0627\u0644\u0645\u062A\u062C\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u2014 ${safeBase}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: radial-gradient(circle at top, #102a20 0%, #07130e 65%, #050b08 100%);
      color: #f3f7f5;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 480px;
      background: rgba(15, 31, 24, 0.92);
      border: 1.5px solid rgba(52, 211, 153, 0.25);
      border-radius: 22px;
      padding: 36px 28px;
      text-align: center;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    }
    .code {
      display: inline-block;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #34d399;
      background: rgba(52, 211, 153, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.28);
      padding: 6px 14px;
      border-radius: 999px;
      margin-bottom: 18px;
    }
    h1 { font-size: 26px; font-weight: 900; margin-bottom: 10px; }
    p { font-size: 14px; line-height: 1.7; color: #a7bab0; margin-bottom: 10px; }
    .en { font-size: 12.5px; color: #7e9489; direction: ltr; margin-bottom: 24px; }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      color: #fff;
      text-decoration: none;
      font-weight: 800;
      font-size: 14px;
      padding: 12px 24px;
      border-radius: 12px;
      transition: transform 0.15s ease;
    }
    .btn:hover { transform: translateY(-1px); }
  </style>
</head>
<body>
  <main class="card">
    <div class="code">404 \u2022 STORE NOT FOUND</div>
    <h1>\u0627\u0644\u0645\u062A\u062C\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F</h1>
    <p>${subtitleAr}</p>
    <p class="en">${subtitleEn}</p>
    <a class="btn" href="https://${safeBase}">\u0627\u0644\u0639\u0648\u062F\u0629 \u0625\u0644\u0649 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629 (${safeBase})</a>
  </main>
</body>
</html>`;
}
function injectSubdomainHtmlMeta(html, resolved) {
  const rest = resolved.restaurant;
  if (!rest) return html;
  const storeName = escapeHtml2(String(rest.n || resolved.subdomain));
  const isStore = String(rest.projectType || "").toLowerCase().trim() === "store";
  const rawTagline = String(rest.tagline || "").trim();
  const cleanTagline = isStore && rawTagline === "\u0623\u0634\u0647\u0649 \u0627\u0644\u0623\u0637\u0628\u0627\u0642 \u0627\u0644\u0645\u062D\u0636\u0631\u0629 \u064A\u0648\u0645\u064A\u0627\u064B \u0637\u0627\u0632\u062C\u0629 \u0628\u062C\u0648\u062F\u0629 \u0639\u0627\u0644\u064A\u0629" ? "" : rawTagline;
  const tagline = escapeHtml2(
    String(cleanTagline || rest.aboutText || `${storeName} \u2013 \u0627\u0644\u0645\u0646\u064A\u0648 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0627\u0644\u0630\u0643\u064A \u0648\u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0639\u0644\u0649 \u0648\u0627\u062A\u0633\u0627\u0628`)
  );
  const storeUrl = `https://${resolved.subdomain}.${resolved.rules.baseDomain}`;
  const bootstrapPayload = JSON.stringify({
    subdomain: resolved.subdomain,
    restaurantId: rest.id,
    name: rest.n || resolved.subdomain,
    baseDomain: resolved.rules.baseDomain
  }).replace(/</g, "\\u003c");
  const ldJson = JSON.stringify({
    "@context": "https://schema.org",
    "@type": isStore ? "Store" : "Restaurant",
    name: String(rest.n || resolved.subdomain),
    description: String(cleanTagline || rest.aboutText || `${rest.n || resolved.subdomain} Digital Menu & Ordering`),
    url: storeUrl,
    ...rest.ph ? { telephone: String(rest.ph) } : {},
    ...rest.logo && !String(rest.logo).startsWith("data:") ? { image: String(rest.logo) } : {},
    hasMenu: storeUrl,
    servesCuisine: "Arabic, Middle Eastern, Fast Food",
    acceptsReservations: "False"
  }).replace(/</g, "\\u003c");
  const embedImg = escapeHtml2(`${storeUrl}/assets/aistudio/icon_f95f5a07.png`);
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${storeName} \u2013 \u0627\u0644\u0645\u0646\u064A\u0648 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0627\u0644\u0630\u0643\u064A | Menu+</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${tagline}" />`
  );
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${storeName} \u2013 \u0627\u0644\u0645\u0646\u064A\u0648 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0627\u0644\u0630\u0643\u064A" />`
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${tagline}" />`
  );
  out = out.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${embedImg}" />`
  );
  out = out.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${embedImg}" />`
  );
  const extraTags = [
    `<link rel="canonical" href="${escapeHtml2(storeUrl)}" />`,
    `<meta property="og:url" content="${escapeHtml2(storeUrl)}" />`,
    `<meta name="twitter:title" content="${storeName}" />`,
    `<meta name="twitter:description" content="${tagline}" />`,
    `<script type="application/ld+json">${ldJson}</script>`,
    `<script>window.__MENUPLUS_SUBDOMAIN__=${bootstrapPayload};</script>`
  ].join("\n  ");
  if (out.includes("</head>")) {
    out = out.replace("</head>", `  ${extraTags}
  </head>`);
  } else {
    out = `${extraTags}
${out}`;
  }
  return out;
}
var STATIC_EXT_RE = /\.(?:js|mjs|css|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|json|txt|xml)$/i;
function subdomainMiddleware() {
  return async (req, res, next) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD" || req.path.startsWith("/api/") || req.path.startsWith("/assets/") || req.path.startsWith("/@") || req.path.startsWith("/node_modules/") || STATIC_EXT_RE.test(req.path)) {
        return next();
      }
      const rules = await getSubdomainRulesFromStore();
      const hostHeader = getRequestHostHeader(req);
      const subdomain = extractSubdomainFromHost(hostHeader, rules.baseDomain);
      if (!subdomain) {
        return next();
      }
      const resolved = await resolveStoreBySubdomain(subdomain);
      if (!resolved.found || !resolved.restaurant) {
        return res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").setHeader("Cache-Control", "no-store").send(renderStoreNotFoundHtml(subdomain, rules.baseDomain, resolved.reason));
      }
      res.locals.subdomainResolved = resolved;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
function createSubdomainRouter() {
  const router = express.Router();
  router.get("/api/resolve-subdomain", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const rules = await getSubdomainRulesFromStore();
      const explicit = String(req.query.subdomain || "").trim();
      const hostHeader = getRequestHostHeader(req);
      const subdomain = explicit ? sanitizeSubdomainValue(explicit) : extractSubdomainFromHost(hostHeader, rules.baseDomain);
      if (!subdomain) {
        return res.json({ isSubdomain: false, found: false, baseDomain: rules.baseDomain });
      }
      const resolved = await resolveStoreBySubdomain(subdomain);
      if (!resolved.found || !resolved.restaurant) {
        return res.status(404).json({
          isSubdomain: true,
          found: false,
          subdomain,
          reason: resolved.reason || "not_found",
          baseDomain: rules.baseDomain
        });
      }
      return res.json({
        isSubdomain: true,
        found: true,
        subdomain,
        restaurantId: resolved.restaurant.id,
        restaurantName: resolved.restaurant.n || subdomain,
        baseDomain: rules.baseDomain
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Subdomain resolution failed" });
    }
  });
  router.get("/api/subdomains/check", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const rawSlug = String(req.query.slug || "");
      const currentRid = String(req.query.rid || req.query.excludeRid || "").trim();
      const requestedPlanId = String(req.query.planId || "").trim();
      const rules = await getSubdomainRulesFromStore();
      const clean = sanitizeSubdomainValue(rawSlug);
      const [{ items: restaurants }, storedPlans] = await Promise.all([
        readPrefixFromStore("restaurants/"),
        getInternalStoreItem("settings/plans")
      ]);
      const plansList = extractPlansList(storedPlans);
      const currentRest = currentRid ? restaurants.find((r) => r.id === currentRid) : void 0;
      const effectivePlanId = requestedPlanId || String(currentRest?.planId || "starter");
      const { isPaid } = isPaidPlanForRestaurant(
        currentRest ? { ...currentRest, planId: effectivePlanId } : { id: currentRid || "new", planId: effectivePlanId },
        plansList
      );
      if (!isPaid) {
        return res.json({
          ok: false,
          available: false,
          paidRequired: true,
          subdomainEnabled: rules.enabled,
          slug: clean,
          baseDomain: rules.baseDomain,
          message: "\u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0633\u0645 \u062D\u0633\u0627\u0628 \u0645\u062E\u0635\u0635 \u0644\u0644\u0631\u0627\u0628\u0637 \u0645\u062A\u0627\u062D \u0641\u064A \u0627\u0644\u0628\u0627\u0642\u0627\u062A \u0627\u0644\u0645\u0641\u0639\u0651\u0644\u0629 \u0641\u0642\u0637."
        });
      }
      const validation = validatePathSlugFormat(clean, rules);
      if (!validation.valid) {
        return res.json({
          ok: false,
          available: false,
          paidRequired: false,
          subdomainEnabled: rules.enabled,
          slug: clean,
          baseDomain: rules.baseDomain,
          message: validation.message || "\u0627\u0633\u0645 \u0627\u0644\u0631\u0627\u0628\u0637 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D."
        });
      }
      const conflict = restaurants.find((r) => {
        if (currentRid && r.id === currentRid) return false;
        const s1 = sanitizeSubdomainValue(String(r.slug || ""));
        const s2 = sanitizeSubdomainValue(String(r.subdomain || ""));
        return s1 === clean || s2 === clean;
      });
      const resolvedUrl = rules.enabled ? `https://${clean}.${rules.baseDomain}` : `https://${rules.baseDomain}/${clean}`;
      return res.json({
        ok: true,
        available: !conflict,
        paidRequired: false,
        subdomainEnabled: rules.enabled,
        slug: clean,
        baseDomain: rules.baseDomain,
        fullUrl: resolvedUrl,
        publicUrl: `https://${rules.baseDomain}/${clean}`,
        message: conflict ? "\u0647\u0630\u0627 \u0627\u0644\u0631\u0627\u0628\u0637 \u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0646 \u0642\u0628\u0644 \u062D\u0633\u0627\u0628 \u0622\u062E\u0631\u060C \u0627\u062E\u062A\u0631 \u0627\u0633\u0645\u0627\u064B \u0645\u062E\u062A\u0644\u0641\u0627\u064B." : "\u0645\u062A\u0627\u062D \u0644\u0644\u062A\u0641\u0639\u064A\u0644!"
      });
    } catch (err) {
      return res.status(500).json({ ok: false, available: false, error: err?.message || "Check failed" });
    }
  });
  router.get("/api/admin/subdomains", requireAdminOrStaff("canManageSubdomains"), async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const rules = await getSubdomainRulesFromStore();
      const [{ items: restaurants, source }, storedPlans] = await Promise.all([
        readPrefixFromStore("restaurants/"),
        getInternalStoreItem("settings/plans")
      ]);
      const plansList = extractPlansList(storedPlans);
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const entries = restaurants.filter((r) => {
        const s = sanitizeSubdomainValue(String(r.slug || r.subdomain || ""));
        return s.length > 0 && !r.isBranch;
      }).map((r) => {
        const slug = sanitizeSubdomainValue(String(r.slug || r.subdomain || ""));
        const { isPaid, plan } = isPaidPlanForRestaurant(r, plansList);
        const isExpired = Boolean(r.e && String(r.e) < today);
        const isActive = r.a !== 0 && !isExpired;
        return {
          rid: r.id,
          name: String(r.n || r.id),
          owner: String(r.ow || ""),
          phone: String(r.ph || r.p || ""),
          slug,
          fullUrl: rules.enabled ? `https://${slug}.${rules.baseDomain}` : `https://${rules.baseDomain}/${slug}`,
          publicUrl: `https://${rules.baseDomain}/${slug}`,
          planId: String(r.planId || "starter"),
          planName: String(plan?.n || r.p || r.planId || "\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0627\u0642\u062A\u0635\u0627\u062F\u064A\u0629"),
          isPaidPlan: isPaid,
          active: isActive,
          subdomainEnabled: rules.enabled,
          subdomainActive: isActive && isPaid && rules.enabled,
          suspended: r.a === 0,
          expired: isExpired,
          expiresAt: r.e || null
        };
      }).sort((a, b) => a.slug.localeCompare(b.slug));
      return res.json({ ok: true, source, rules, subdomains: entries });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to list subdomains" });
    }
  });
  router.delete("/api/admin/subdomains/:rid", requireAdminOrStaff("canManageSubdomains"), async (req, res) => {
    try {
      const rid = String(req.params.rid || "").trim();
      const { items: restaurants } = await readPrefixFromStore("restaurants/");
      const existing = restaurants.find((r) => r.id === rid) || await getInternalStoreItem(`restaurants/${rid}`);
      if (!existing) {
        return res.status(404).json({ ok: false, error: "Restaurant not found" });
      }
      const taken = collectTakenMenuSlugs(restaurants.filter((r) => r.id !== rid));
      const fallbackCode = generateUniqueMenuCode(taken);
      const updated = { ...existing, slug: fallbackCode, subdomain: "" };
      const saved = await upsertRecordInStore(`restaurants/${rid}`, updated);
      return res.json({ ok: saved.ok, rid, slug: fallbackCode });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to revoke subdomain" });
    }
  });
  return router;
}

// server/admin-routes.ts
var PROTECTED_OWNER_ACCOUNT_ID = "acc_admin_owner";
function hashCredential(_identifier, password) {
  return hashPasswordScrypt(password);
}
function isValidRecordId(id) {
  return typeof id === "string" && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_.-]+$/.test(id);
}
function sanitizePermissions(input) {
  return normalizeHierarchicalPermissions(input);
}
function sanitizeSocialInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return void 0;
  const s = input;
  const cleanUrl = (v) => {
    const str = String(v || "").trim().slice(0, 300);
    if (!str) return "";
    if (/^(javascript|data|vbscript):/i.test(str)) return "";
    return str;
  };
  return {
    instagram: cleanUrl(s.instagram),
    facebook: cleanUrl(s.facebook),
    tiktok: cleanUrl(s.tiktok),
    x: cleanUrl(s.x),
    whatsapp: cleanUrl(s.whatsapp)
  };
}
function sanitizeStaffForClient(rec) {
  const { passwordHash, pw, ...rest } = rec;
  return {
    ...rest,
    id: rec.id,
    name: String(rec.name || "").trim(),
    email: String(rec.email || "").trim().toLowerCase(),
    phone: String(rec.phone || "").trim(),
    roleTitle: String(rec.roleTitle || "\u0645\u0634\u0631\u0641 \u0627\u0644\u062F\u0639\u0645 \u0648\u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A").trim(),
    active: rec.active !== false,
    permissions: sanitizePermissions(rec.permissions),
    createdAt: rec.createdAt || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    hasPassword: Boolean(passwordHash || pw)
  };
}
function todayIsoDate() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function addDaysFromDate(days, baseIso) {
  const safeDays = Math.max(1, Math.min(3650, Math.round(days)));
  const now = /* @__PURE__ */ new Date();
  const base = baseIso && /^\d{4}-\d{2}-\d{2}$/.test(baseIso) && baseIso > todayIsoDate() ? /* @__PURE__ */ new Date(`${baseIso}T00:00:00Z`) : now;
  base.setUTCDate(base.getUTCDate() + safeDays);
  return base.toISOString().slice(0, 10);
}
function generateStaffId() {
  return `stf_${Date.now().toString(36)}_${crypto3.randomBytes(3).toString("hex")}`;
}
function generateUid(prefix = "") {
  return `${prefix}${Date.now().toString(36)}${crypto3.randomBytes(3).toString("hex")}`;
}
function normalizePhoneMatchSet(phone) {
  const keys = normalizePhoneKeys(phone);
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits) keys.push(digits);
  return new Set(keys.filter(Boolean));
}
function formatRegistrationDate(val) {
  if (!val) return "";
  if (typeof val === "number" && Number.isFinite(val)) {
    return new Date(val).toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  if (/^\d{10,13}$/.test(str)) {
    const ms = str.length === 10 ? Number(str) * 1e3 : Number(str);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return str.slice(0, 10);
}
function resolveProjectTypeLabel(rawType, role, hasRestaurant) {
  if (role === "admin" && !hasRestaurant) return "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u0635\u0629";
  if (role === "demo") return "\u062A\u062C\u0631\u064A\u0628\u064A";
  if (role === "telegram_only") return "\u0645\u0633\u062C\u0644 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645";
  const t = String(rawType || "").trim().toLowerCase();
  switch (t) {
    case "restaurant":
      return "\u0645\u0637\u0639\u0645";
    case "store":
      return "\u0645\u062A\u062C\u0631 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A";
    case "cafe":
      return "\u0643\u0627\u0641\u064A\u0647 \u0648\u0645\u0634\u0631\u0648\u0628\u0627\u062A";
    case "sweets":
    case "bakery":
      return "\u062D\u0644\u0648\u064A\u0627\u062A \u0648\u0645\u062E\u0628\u0648\u0632\u0627\u062A";
    case "market":
      return "\u0633\u0648\u0628\u0631\u0645\u0627\u0631\u0643\u062A";
    case "other":
      return "\u0645\u0634\u0631\u0648\u0639 \u0622\u062E\u0631";
    default:
      return hasRestaurant ? "\u0645\u0637\u0639\u0645" : "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F";
  }
}
function buildAdminAccountsView(accounts, restaurants, telegramUsers2, options) {
  const restById = /* @__PURE__ */ new Map();
  for (const r of restaurants) {
    restById.set(r.id, r);
  }
  const tgByKey = /* @__PURE__ */ new Map();
  for (const tg of telegramUsers2) {
    for (const key of normalizePhoneMatchSet(tg.phone)) {
      if (!tgByKey.has(key)) {
        tgByKey.set(key, tg);
      }
    }
    if (tg.normalizedPhone && !tgByKey.has(tg.normalizedPhone)) {
      tgByKey.set(tg.normalizedPhone, tg);
    }
  }
  const matchedTelegramPrimaryKeys = /* @__PURE__ */ new Set();
  const matchedRestaurantIds = /* @__PURE__ */ new Set();
  const filteredAccounts = accounts.filter((acc) => {
    if (acc.id === "acc_menu_demo") return false;
    return true;
  });
  const accountEntries = filteredAccounts.map((acc) => {
    const rawPhone = String(acc.phone || acc.ph || acc.projectPhone || "").trim();
    const rawIdentifier = String(acc.em || acc.username || acc.e || acc.u || "").trim();
    const lookupPhone = rawPhone || (/^\+?\d[\d\s-]{6,}$/.test(rawIdentifier) ? rawIdentifier : "");
    let linkedTg;
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
    const rid = acc.rid ? String(acc.rid) : void 0;
    const linkedRest = rid ? restById.get(rid) : void 0;
    if (linkedRest && linkedRest.id !== "demo") {
      matchedRestaurantIds.add(linkedRest.id);
    }
    const isAdmin = Boolean(
      acc.admin === true || acc.r === "admin" || String(acc.id).startsWith("acc_admin_")
    );
    const isDemo = false;
    const isProtected = acc.id === PROTECTED_OWNER_ACCOUNT_ID;
    const isCurrentUser = Boolean(options?.currentAccountId && acc.id === options.currentAccountId);
    const counts = rid ? options?.countsByRid?.get(rid) : void 0;
    const itemsCount = counts?.items ?? 0;
    const catsCount = counts?.cats ?? 0;
    const ordersCount = counts?.orders ?? 0;
    const hasOwnedMenu = Boolean(!isAdmin && rid && rid !== "demo" && linkedRest);
    const isSelfRegisteredMenuOwner = Boolean(
      hasOwnedMenu && (acc.authMethod === "telegram_bot" || acc.telegramVerified === true || Boolean(linkedTg) || linkedRest?.done === 1 || itemsCount > 0)
    );
    const accountActive = acc.active !== false;
    const restActive = linkedRest ? linkedRest.a !== 0 : true;
    const isActive = accountActive && (isAdmin || restActive);
    const role = isAdmin ? "admin" : "partner";
    const roleLabel = isProtected ? "\u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629" : isAdmin ? "\u0645\u062F\u064A\u0631 \u0639\u0627\u0645" : "\u0634\u0631\u064A\u0643 \u0645\u062A\u062C\u0631";
    const registrationDate = formatRegistrationDate(acc.at || acc.created || acc.createdAt) || (linkedTg?.linkedAt ? formatRegistrationDate(linkedTg.linkedAt) : "");
    const rawProjectType = String(linkedRest?.projectType || acc.projectType || "").trim();
    const resolvedProjectName = String(
      linkedRest?.n || acc.projectName || (isAdmin && !linkedRest ? "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u0635\u0629" : "")
    ).trim();
    return {
      id: acc.id,
      source: "account",
      name: String(acc.n || acc.projectName || linkedRest?.n || acc.username || acc.em || "\u0645\u0633\u062A\u062E\u062F\u0645").trim(),
      phone: lookupPhone || rawIdentifier || "-",
      identifier: rawIdentifier || lookupPhone || acc.id,
      email: String(acc.em || acc.e || "").trim(),
      role,
      roleLabel,
      status: isActive ? "active" : "suspended",
      statusLabel: isActive ? "\u0641\u0639\u0651\u0627\u0644" : "\u0645\u0648\u0642\u0648\u0641",
      active: isActive,
      registrationDate,
      rid,
      done: linkedRest ? linkedRest.done === 1 ? 1 : 0 : 1,
      restaurantName: linkedRest?.n ? String(linkedRest.n) : void 0,
      projectName: resolvedProjectName || void 0,
      projectType: rawProjectType || (linkedRest ? "restaurant" : void 0),
      projectTypeLabel: resolveProjectTypeLabel(rawProjectType, role, Boolean(linkedRest)),
      planId: linkedRest?.planId ? String(linkedRest.planId) : void 0,
      planName: linkedRest?.p ? String(linkedRest.p) : void 0,
      isPaid: Boolean(linkedRest?.isPaid),
      expiresAt: linkedRest?.e ? String(linkedRest.e) : void 0,
      restaurantActive: linkedRest ? linkedRest.a !== 0 : void 0,
      slug: linkedRest?.slug ? String(linkedRest.slug) : linkedRest?.subdomain ? String(linkedRest.subdomain) : void 0,
      subdomain: linkedRest?.subdomain ? String(linkedRest.subdomain) : linkedRest?.slug ? String(linkedRest.slug) : void 0,
      social: linkedRest?.social || void 0,
      telegramLinked: Boolean(linkedTg || acc.telegramVerified),
      telegramUsername: linkedTg?.username || void 0,
      telegramChatId: linkedTg?.chatId ? String(linkedTg.chatId) : void 0,
      telegramLinkedAt: linkedTg?.linkedAt ? formatRegistrationDate(linkedTg.linkedAt) : void 0,
      lastSentAt: linkedTg?.lastSentAt ? formatRegistrationDate(linkedTg.lastSentAt) : void 0,
      hasPassword: Boolean(acc.pw),
      isProtected,
      isCurrentUser,
      authMethod: String(acc.authMethod || (linkedTg ? "telegram" : isAdmin ? "admin" : "manual")),
      itemsCount,
      catsCount,
      ordersCount,
      hasOwnedMenu,
      isSelfRegisteredMenuOwner,
      permissionsSummary: isProtected ? "\u0633\u064A\u0627\u062F\u0629 \u0643\u0627\u0645\u0644\u0629 (\u0627\u0644\u0645\u0627\u0644\u0643)" : isAdmin ? "\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0625\u062F\u0627\u0631\u064A\u0629 \u0643\u0627\u0645\u0644\u0629" : linkedRest ? `\u0625\u062F\u0627\u0631\u0629 \u0645\u062A\u062C\u0631: ${linkedRest.n || acc.rid}` : "\u062D\u0633\u0627\u0628 \u0634\u0631\u064A\u0643"
    };
  });
  const standaloneRestaurantEntries = restaurants.filter((r) => r.id !== "demo" && !r.isBranch && !r.parentRid && !matchedRestaurantIds.has(r.id)).map((r) => {
    const rPhone = String(r.ph || "").trim();
    let linkedTg;
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
    const rawProjectType = String(r.projectType || "restaurant").trim();
    const counts = options?.countsByRid?.get(r.id);
    const itemsCount = counts?.items ?? 0;
    const catsCount = counts?.cats ?? 0;
    const ordersCount = counts?.orders ?? 0;
    return {
      id: `rest_${r.id}`,
      source: "restaurant",
      name: String(r.ow || r.n || "\u0634\u0631\u064A\u0643").trim(),
      phone: rPhone || "-",
      identifier: rPhone || r.id,
      email: "",
      role: "partner",
      roleLabel: "\u0634\u0631\u064A\u0643 \u0645\u062A\u062C\u0631",
      status: isActive ? "active" : "suspended",
      statusLabel: isActive ? "\u0641\u0639\u0651\u0627\u0644" : "\u0645\u0648\u0642\u0648\u0641",
      active: isActive,
      registrationDate: formatRegistrationDate(r.createdAt || r.created) || "",
      rid: r.id,
      done: r.done === 1 ? 1 : 0,
      restaurantName: String(r.n || "").trim() || void 0,
      projectName: String(r.n || "").trim() || "\u0645\u0634\u0631\u0648\u0639 \u0628\u062F\u0648\u0646 \u0627\u0633\u0645",
      projectType: rawProjectType,
      projectTypeLabel: resolveProjectTypeLabel(rawProjectType, "partner", true),
      planId: r.planId ? String(r.planId) : void 0,
      planName: r.p ? String(r.p) : "\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0627\u0642\u062A\u0635\u0627\u062F\u064A\u0629",
      isPaid: Boolean(r.isPaid),
      expiresAt: r.e ? String(r.e) : void 0,
      restaurantActive: isActive,
      slug: r.slug ? String(r.slug) : r.subdomain ? String(r.subdomain) : void 0,
      subdomain: r.subdomain ? String(r.subdomain) : r.slug ? String(r.slug) : void 0,
      social: r.social || void 0,
      telegramLinked: Boolean(linkedTg),
      telegramUsername: linkedTg?.username || void 0,
      telegramChatId: linkedTg?.chatId ? String(linkedTg.chatId) : void 0,
      telegramLinkedAt: linkedTg?.linkedAt ? formatRegistrationDate(linkedTg.linkedAt) : void 0,
      lastSentAt: linkedTg?.lastSentAt ? formatRegistrationDate(linkedTg.lastSentAt) : void 0,
      hasPassword: false,
      isProtected: false,
      isCurrentUser: false,
      authMethod: linkedTg ? "telegram" : "manual",
      itemsCount,
      catsCount,
      ordersCount,
      hasOwnedMenu: true,
      isSelfRegisteredMenuOwner: Boolean(linkedTg || r.done === 1 || itemsCount > 0),
      permissionsSummary: `\u0625\u062F\u0627\u0631\u0629 \u0645\u062A\u062C\u0631: ${r.n || r.id}`
    };
  });
  const telegramOnlyEntries = telegramUsers2.filter((tg) => !matchedTelegramPrimaryKeys.has(tg.normalizedPhone || tg.phone)).map((tg) => {
    const pk = tg.normalizedPhone || tg.phone.replace(/\D/g, "") || tg.phone;
    return {
      id: `tg_${pk}`,
      source: "telegram_only",
      name: String(tg.firstName || (tg.username ? `@${tg.username}` : "\u0645\u0633\u062C\u0644 \u0639\u0628\u0631 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645")).trim(),
      phone: tg.phone,
      identifier: tg.phone,
      email: "",
      role: "telegram_only",
      roleLabel: "\u0645\u0633\u062C\u0644 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645",
      status: "telegram_verified",
      statusLabel: "\u0645\u0648\u062B\u0642 \u0628\u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645",
      active: true,
      registrationDate: formatRegistrationDate(tg.linkedAt),
      rid: void 0,
      done: 0,
      restaurantName: void 0,
      projectName: void 0,
      projectType: "telegram_only",
      projectTypeLabel: "\u0645\u0633\u062C\u0644 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645",
      planId: void 0,
      planName: void 0,
      isPaid: false,
      expiresAt: void 0,
      restaurantActive: void 0,
      telegramLinked: true,
      telegramUsername: tg.username || void 0,
      telegramChatId: String(tg.chatId),
      telegramLinkedAt: formatRegistrationDate(tg.linkedAt),
      lastSentAt: tg.lastSentAt ? formatRegistrationDate(tg.lastSentAt) : void 0,
      hasPassword: false,
      isProtected: false,
      isCurrentUser: false,
      authMethod: "telegram_bot",
      itemsCount: 0,
      catsCount: 0,
      ordersCount: 0,
      hasOwnedMenu: false,
      isSelfRegisteredMenuOwner: false,
      permissionsSummary: "\u0631\u0628\u0637 \u0628\u0648\u062A \u0627\u0644\u062A\u062D\u0642\u0642 (\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062A\u0633\u062C\u064A\u0644)"
    };
  });
  const combined = [...accountEntries, ...standaloneRestaurantEntries, ...telegramOnlyEntries].sort((a, b) => {
    if (a.isProtected && !b.isProtected) return -1;
    if (!a.isProtected && b.isProtected) return 1;
    return (b.registrationDate || "").localeCompare(a.registrationDate || "");
  });
  const todayStr = todayIsoDate();
  const stats = {
    total: combined.length,
    active: combined.filter((c) => c.active).length,
    suspended: combined.filter((c) => !c.active || c.expiresAt && c.expiresAt < todayStr).length,
    telegramVerified: combined.filter((c) => c.telegramLinked).length,
    admins: combined.filter((c) => c.role === "admin").length,
    partners: combined.filter((c) => c.role === "partner" || Boolean(c.rid && c.rid !== "demo")).length,
    paid: combined.filter((c) => c.isPaid && c.rid !== "demo").length
  };
  return { accounts: combined, stats };
}
function createAdminRouter() {
  const router = Router();
  router.get("/api/staff", requireAdminOrStaff("canManageStaff"), async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const { items, source, supabaseError } = await readPrefixFromStore("staff/");
      const staff = items.map(sanitizeStaffForClient).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") || a.name.localeCompare(b.name));
      return res.json({
        success: true,
        staff,
        total: staff.length,
        source,
        ...supabaseError ? { supabaseError } : {}
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u062C\u0644\u0628 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646";
      return res.status(500).json({ success: false, error: msg });
    }
  });
  router.post("/api/staff", requireAdminOrStaff("canManageStaff"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const body = req.body || {};
      const name = String(body.name || "").trim();
      const phone = String(body.phone || body.email || "").trim();
      const email = phone.toLowerCase();
      const roleTitle = String(body.roleTitle || "\u0645\u0634\u0631\u0641 \u0627\u0644\u062F\u0639\u0645 \u0648\u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A").trim();
      const password = String(body.password || "").trim();
      const active = body.active !== false;
      const permissions = sanitizePermissions(body.permissions);
      if (!name) {
        return res.status(400).json({ success: false, error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0637\u0644\u0648\u0628" });
      }
      if (!phone) {
        return res.status(400).json({ success: false, error: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0645\u0637\u0644\u0648\u0628" });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 8 \u062E\u0627\u0646\u0627\u062A \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 (\u0623\u0631\u0642\u0627\u0645 \u0623\u0648 \u0623\u062D\u0631\u0641 \u0623\u0648 \u0631\u0645\u0648\u0632)" });
      }
      const existingRes = await readPrefixFromStore("staff/");
      const phoneKeys = normalizePhoneMatchSet(phone);
      const duplicatePhone = existingRes.items.find((s) => {
        const candidates = [String(s.phone || ""), String(s.email || "")].filter(Boolean);
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
          error: "\u064A\u0648\u062C\u062F \u0645\u0648\u0638\u0641 \u0622\u062E\u0631 \u0645\u0633\u062C\u0644 \u0628\u0646\u0641\u0633 \u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641"
        });
      }
      const requestedId = String(body.id || "").trim();
      const id = requestedId && isValidRecordId(requestedId) ? requestedId : generateStaffId();
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const newRecord = {
        id,
        name,
        email,
        phone,
        roleTitle,
        active,
        permissions,
        passwordHash: hashCredential(phone, password),
        createdAt: todayIsoDate(),
        updatedAt: nowIso
      };
      const saveResult = await upsertRecordInStore(`staff/${id}`, newRecord);
      if (!saveResult.ok) {
        return res.status(502).json({
          success: false,
          error: saveResult.error || "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
        });
      }
      return res.status(201).json({
        success: true,
        staff: sanitizeStaffForClient({ ...newRecord, id }),
        persistedToSupabase: saveResult.persistedToSupabase,
        source: saveResult.source
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0638\u0641";
      return res.status(500).json({ success: false, error: msg });
    }
  });
  router.put("/api/staff/:id", requireAdminOrStaff("canManageStaff"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const id = String(req.params.id || "").trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u0648\u0638\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      const existingRes = await readPrefixFromStore("staff/");
      const existing = existingRes.items.find((s) => s.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "\u0627\u0644\u0645\u0648\u0638\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A" });
      }
      const body = req.body || {};
      const name = body.name !== void 0 ? String(body.name || "").trim() : existing.name;
      const phone = body.phone !== void 0 ? String(body.phone || "").trim() : body.email !== void 0 ? String(body.email || "").trim() : String(existing.phone || existing.email || "").trim();
      const roleTitle = body.roleTitle !== void 0 ? String(body.roleTitle || "").trim() : String(existing.roleTitle || "\u0645\u0634\u0631\u0641 \u0627\u0644\u062F\u0639\u0645 \u0648\u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A");
      const active = body.active !== void 0 ? Boolean(body.active) : existing.active !== false;
      const permissions = body.permissions !== void 0 ? sanitizePermissions(body.permissions) : sanitizePermissions(existing.permissions);
      const newPassword = body.password !== void 0 ? String(body.password || "").trim() : "";
      if (!name) {
        return res.status(400).json({ success: false, error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0637\u0644\u0648\u0628" });
      }
      if (!phone) {
        return res.status(400).json({ success: false, error: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0645\u0637\u0644\u0648\u0628" });
      }
      if (newPassword && newPassword.length < 8) {
        return res.status(400).json({ success: false, error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 8 \u062E\u0627\u0646\u0627\u062A \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 (\u0623\u0631\u0642\u0627\u0645 \u0623\u0648 \u0623\u062D\u0631\u0641 \u0623\u0648 \u0631\u0645\u0648\u0632)" });
      }
      const phoneKeys = normalizePhoneMatchSet(phone);
      const duplicatePhone = existingRes.items.find((s) => {
        if (s.id === id) return false;
        const candidates = [String(s.phone || ""), String(s.email || "")].filter(Boolean);
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
          error: "\u064A\u0648\u062C\u062F \u0645\u0648\u0638\u0641 \u0622\u062E\u0631 \u0645\u0633\u062C\u0644 \u0628\u0646\u0641\u0633 \u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641"
        });
      }
      const passwordHash = newPassword ? hashCredential(phone, newPassword) : existing.passwordHash || existing.pw;
      const nextEmail = newPassword ? phone.toLowerCase() : String(existing.email || phone).trim().toLowerCase();
      const updatedRecord = {
        ...existing,
        id,
        name,
        email: nextEmail,
        phone,
        roleTitle: roleTitle || existing.roleTitle,
        active,
        permissions,
        ...passwordHash ? { passwordHash } : {},
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const saveResult = await upsertRecordInStore(`staff/${id}`, updatedRecord);
      if (!saveResult.ok) {
        return res.status(502).json({
          success: false,
          error: saveResult.error || "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
        });
      }
      return res.json({
        success: true,
        staff: sanitizeStaffForClient({ ...updatedRecord, id }),
        persistedToSupabase: saveResult.persistedToSupabase,
        source: saveResult.source
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u062A\u0639\u062F\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641";
      return res.status(500).json({ success: false, error: msg });
    }
  });
  router.delete("/api/staff/:id", requireAdminOrStaff("canManageStaff"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const id = String(req.params.id || "").trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u0648\u0638\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      const deleteResult = await deleteRecordPhysicallyFromStore(`staff/${id}`);
      if (!deleteResult.ok) {
        return res.status(502).json({
          success: false,
          error: deleteResult.error || "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0633\u062C\u0644 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
        });
      }
      if (!deleteResult.deletedFromSupabase && !deleteResult.deletedFromLocal) {
        return res.status(404).json({
          success: false,
          error: "\u0627\u0644\u0645\u0648\u0638\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0623\u0648 \u062A\u0645 \u062D\u0630\u0641\u0647 \u0646\u0647\u0627\u0626\u064A\u0627\u064B \u0645\u0633\u0628\u0642\u0627\u064B"
        });
      }
      return res.json({
        success: true,
        deletedId: id,
        physicalDelete: true,
        deletedFromSupabase: deleteResult.deletedFromSupabase,
        deletedFromLocal: deleteResult.deletedFromLocal,
        source: deleteResult.source
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u062D\u0630\u0641 \u0633\u062C\u0644 \u0627\u0644\u0645\u0648\u0638\u0641";
      return res.status(500).json({ success: false, error: msg });
    }
  });
  router.get("/api/accounts", requireAdminOrStaff("canManageRestaurants"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const [accountsRes, restaurantsRes, catsRes, itemsRes, ordersRes, telegramUsers2] = await Promise.all([
        readPrefixFromStore("accounts/"),
        readPrefixFromStore("restaurants/"),
        readPrefixFromStore("cats/"),
        readPrefixFromStore("items/"),
        readPrefixFromStore("orders/"),
        listTelegramUsers(true)
      ]);
      const countsByRid = /* @__PURE__ */ new Map();
      const bump = (ridVal, field) => {
        const key = String(ridVal || "").trim();
        if (!key) return;
        const cur = countsByRid.get(key) || { items: 0, cats: 0, orders: 0 };
        cur[field] += 1;
        countsByRid.set(key, cur);
      };
      for (const c of catsRes.items) bump(c.rid, "cats");
      for (const it of itemsRes.items) bump(it.rid, "items");
      for (const o of ordersRes.items) bump(o.rid, "orders");
      const { accounts, stats } = buildAdminAccountsView(
        accountsRes.items,
        restaurantsRes.items,
        telegramUsers2,
        {
          currentAccountId: req.authSession?.accountId,
          countsByRid
        }
      );
      return res.json({
        success: true,
        accounts,
        stats,
        source: accountsRes.source,
        ...accountsRes.supabaseError ? { supabaseError: accountsRes.supabaseError } : {}
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u062C\u0644\u0628 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A";
      return res.status(500).json({ success: false, error: msg });
    }
  });
  router.post("/api/partners", requireAdminOrStaff("canCreatePartner"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const body = req.body || {};
      const projectName = String(body.projectName || body.name || "").trim();
      const ownerName = String(body.ownerName || projectName || "").trim();
      const phone = String(body.phone || "").trim();
      const projectType = String(body.projectType || "restaurant").trim() || "restaurant";
      const planId = String(body.planId || "").trim();
      const requestedPlanName = String(body.planName || "").trim();
      const durationDays = Math.max(1, Number(body.durationDays) || 30);
      const isPaidOverride = body.isPaid;
      const password = String(body.password || "").trim();
      if (!projectName) {
        return res.status(400).json({ success: false, error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0623\u0648 \u0627\u0644\u0645\u0637\u0639\u0645 \u0645\u0637\u0644\u0648\u0628" });
      }
      if (password && password.length < 8) {
        return res.status(400).json({ success: false, error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 8 \u062E\u0627\u0646\u0627\u062A \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 (\u0623\u0631\u0642\u0627\u0645 \u0623\u0648 \u0623\u062D\u0631\u0641 \u0623\u0648 \u0631\u0645\u0648\u0632)" });
      }
      const [plansRes, restaurantsRes, subRules] = await Promise.all([
        readPrefixFromStore("settings/plans"),
        readPrefixFromStore("restaurants/"),
        getSubdomainRulesFromStore()
      ]);
      const plansList = plansRes.items[0]?.list || [];
      const matchedPlan = plansList.find(
        (pl) => planId && pl.id === planId || requestedPlanName && pl.n === requestedPlanName
      ) || plansList[0];
      const resolvedPlanId = planId || matchedPlan?.id || "starter";
      const resolvedPlanName = requestedPlanName || matchedPlan?.n || "\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0627\u0642\u062A\u0635\u0627\u062F\u064A\u0629";
      const resolvedIsPaid = typeof isPaidOverride === "boolean" ? isPaidOverride : matchedPlan ? Number(matchedPlan.pr || 0) > 0 : true;
      const takenSlugs = collectTakenMenuSlugs(restaurantsRes.items);
      const requestedSlug = sanitizeSubdomainValue(String(body.slug || ""));
      const canUseCustomSlug = resolvedIsPaid && requestedSlug.length >= 3 && !SYSTEM_RESERVED_SUBDOMAINS.has(requestedSlug) && !takenSlugs.has(requestedSlug);
      const finalSlug = canUseCustomSlug ? requestedSlug : generateUniqueMenuCode(takenSlugs);
      const rid = generateUid("r_");
      const expiry = addDaysFromDate(durationDays);
      const newRest = {
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
        lay: "list",
        themeMode: "light",
        themePreset: "clean-light",
        color: "#059669",
        h: { m: "24" },
        isPaid: resolvedIsPaid,
        slug: finalSlug,
        subdomain: resolvedIsPaid && subRules.enabled ? finalSlug : "",
        createdAt: todayIsoDate()
      };
      const saveRest = await upsertRecordInStore(`restaurants/${rid}`, newRest);
      if (!saveRest.ok) {
        return res.status(502).json({
          success: false,
          error: saveRest.error || "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
        });
      }
      let createdAccount = null;
      if (phone) {
        const accId = generateUid("acc_");
        const accPayload = {
          id: accId,
          n: ownerName,
          phone,
          ph: phone,
          projectName,
          projectType,
          rid,
          r: "partner",
          admin: false,
          active: true,
          at: todayIsoDate(),
          created: todayIsoDate(),
          ...password ? { pw: hashCredential(phone, password), username: phone } : {}
        };
        const saveAcc = await upsertRecordInStore(`accounts/${accId}`, accPayload);
        if (saveAcc.ok) {
          createdAccount = accPayload;
        }
      }
      const telegramUsers2 = await listTelegramUsers(false);
      const { accounts } = buildAdminAccountsView(
        createdAccount ? [createdAccount] : [],
        [newRest],
        telegramUsers2
      );
      return res.status(201).json({
        success: true,
        account: accounts[0],
        persistedToSupabase: saveRest.persistedToSupabase,
        source: saveRest.source
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0634\u0631\u064A\u0643";
      return res.status(500).json({ success: false, error: msg });
    }
  });
  router.put("/api/accounts/:id", requireAdminOrStaff("canManageRestaurants"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const id = String(req.params.id || "").trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      const [accountsRes, restaurantsRes, plansRes, subRules] = await Promise.all([
        readPrefixFromStore("accounts/"),
        readPrefixFromStore("restaurants/"),
        readPrefixFromStore("settings/plans"),
        getSubdomainRulesFromStore()
      ]);
      const body = req.body || {};
      const perms = req.authPermissions || FULL_OWNER_PERMISSIONS;
      const plansList = plansRes.items[0]?.list || [];
      const hasPlanUpdate = body.planId !== void 0 || body.planName !== void 0 || body.durationDays !== void 0 || body.expiresAt !== void 0 || body.isPaid !== void 0;
      const hasLinkOrSocialUpdate = body.slug !== void 0 || body.subdomain !== void 0 || body.social !== void 0;
      if (hasPlanUpdate && !perms.canEditPartnerPlan) {
        return res.status(403).json({ success: false, error: "\u0644\u064A\u0633\u062A \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u062A\u0639\u062F\u064A\u0644 \u0628\u0627\u0642\u0629 \u0623\u0648 \u0645\u062F\u0629 \u0627\u0644\u0634\u0631\u064A\u0643" });
      }
      if (body.active !== void 0 && !perms.canSuspendPartner) {
        return res.status(403).json({ success: false, error: "\u0644\u064A\u0633\u062A \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0625\u064A\u0642\u0627\u0641 \u0623\u0648 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A" });
      }
      if (hasLinkOrSocialUpdate && !perms.canEditPartnerLinks) {
        return res.status(403).json({ success: false, error: "\u0644\u064A\u0633\u062A \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u062A\u0639\u062F\u064A\u0644 \u0631\u0648\u0627\u0628\u0637 \u0627\u0644\u0645\u0646\u064A\u0648 \u0623\u0648 \u0627\u0644\u0633\u0648\u0634\u064A\u0627\u0644" });
      }
      const validateUniqueSlug = (rawSlug, ownRid) => {
        const clean = sanitizeSubdomainValue(String(rawSlug || ""));
        if (!clean) return "";
        if (clean.length < 3) {
          throw new Error("\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0631\u0627\u0628\u0637 \u064A\u062C\u0628 \u0623\u0646 \u064A\u062A\u0643\u0648\u0646 \u0645\u0646 3 \u0623\u062D\u0631\u0641 \u0623\u0648 \u0623\u0631\u0642\u0627\u0645 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
        }
        if (SYSTEM_RESERVED_SUBDOMAINS.has(clean) || subRules.blockedKeywords.includes(clean)) {
          throw new Error(`\u0627\u0644\u0627\u0633\u0645 "${clean}" \u0645\u062D\u062C\u0648\u0632 \u0644\u0644\u0646\u0638\u0627\u0645\u060C \u0627\u062E\u062A\u0631 \u0627\u0633\u0645\u0627\u064B \u0645\u062E\u062A\u0644\u0641\u0627\u064B.`);
        }
        const conflict = restaurantsRes.items.find((r) => {
          if (ownRid && r.id === ownRid) return false;
          const s1 = sanitizeSubdomainValue(String(r.slug || ""));
          const s2 = sanitizeSubdomainValue(String(r.subdomain || ""));
          return s1 === clean || s2 === clean;
        });
        if (conflict) {
          throw new Error(`\u0627\u0644\u0631\u0627\u0628\u0637 "${clean}" \u0645\u062D\u062C\u0648\u0632 \u0644\u062D\u0633\u0627\u0628 \u0622\u062E\u0631\u060C \u0627\u062E\u062A\u0631 \u0627\u0633\u0645\u0627\u064B \u0645\u062E\u062A\u0644\u0641\u0627\u064B.`);
        }
        return clean;
      };
      const resolvePlanPayload = (currentRest) => {
        const reqPlanId = body.planId !== void 0 ? String(body.planId || "").trim() : void 0;
        const reqPlanName = body.planName !== void 0 ? String(body.planName || "").trim() : void 0;
        const matched = plansList.find(
          (pl) => reqPlanId && pl.id === reqPlanId || reqPlanName && pl.n === reqPlanName
        );
        const nextPlanId = reqPlanId || matched?.id || currentRest?.planId || "starter";
        const nextPlanName = reqPlanName || matched?.n || currentRest?.p || "\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0627\u0642\u062A\u0635\u0627\u062F\u064A\u0629";
        const nextIsPaid = typeof body.isPaid === "boolean" ? body.isPaid : matched ? Number(matched.pr || 0) > 0 : currentRest?.isPaid ?? true;
        let nextExpiresAt = currentRest?.e || addDaysFromDate(30);
        if (body.expiresAt !== void 0 && String(body.expiresAt).trim()) {
          nextExpiresAt = String(body.expiresAt).trim().slice(0, 10);
        } else if (body.durationDays !== void 0) {
          const days = Number(body.durationDays);
          if (Number.isFinite(days) && days > 0) {
            const extendFromCurrent = body.extendFromCurrent === true;
            nextExpiresAt = addDaysFromDate(days, extendFromCurrent ? currentRest?.e : void 0);
          }
        }
        return { nextPlanId, nextPlanName, nextIsPaid, nextExpiresAt };
      };
      if (id.startsWith("rest_")) {
        const rid = id.slice(5);
        const existingRest = restaurantsRes.items.find((r) => r.id === rid);
        if (!existingRest) {
          return res.status(404).json({ success: false, error: "\u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A" });
        }
        const nextActive2 = body.active !== void 0 ? Boolean(body.active) : existingRest.a !== 0;
        const nextProjectName2 = body.projectName !== void 0 ? String(body.projectName || "").trim() || existingRest.n : existingRest.n;
        const nextProjectType2 = body.projectType !== void 0 ? String(body.projectType || "").trim() || existingRest.projectType || "restaurant" : existingRest.projectType || "restaurant";
        const nextPhone2 = body.phone !== void 0 ? String(body.phone || "").trim() : String(existingRest.ph || "").trim();
        const nextOwner = body.name !== void 0 ? String(body.name || "").trim() : String(existingRest.ow || "").trim();
        const planFields = hasPlanUpdate ? resolvePlanPayload(existingRest) : null;
        const targetIsPaid = planFields ? planFields.nextIsPaid : Boolean(existingRest.isPaid);
        const takenOtherSlugs = collectTakenMenuSlugs(restaurantsRes.items.filter((r) => r.id !== rid));
        let nextSlug = sanitizeSubdomainValue(String(existingRest.slug || ""));
        let nextSubdomain = sanitizeSubdomainValue(String(existingRest.subdomain || ""));
        if (body.slug !== void 0 || body.subdomain !== void 0) {
          const rawInput = body.slug !== void 0 && String(body.slug).trim() ? body.slug : body.subdomain;
          const checked = validateUniqueSlug(rawInput, rid);
          if (checked) {
            nextSlug = checked;
            nextSubdomain = subRules.enabled && targetIsPaid ? checked : "";
          } else {
            nextSlug = generateUniqueMenuCode(takenOtherSlugs);
            nextSubdomain = "";
          }
        } else if (planFields && !planFields.nextIsPaid) {
          nextSlug = isValidSixCharCode(nextSlug) && !takenOtherSlugs.has(nextSlug) ? nextSlug : generateUniqueMenuCode(takenOtherSlugs);
          nextSubdomain = "";
        } else if (!nextSlug) {
          nextSlug = generateUniqueMenuCode(takenOtherSlugs);
          nextSubdomain = subRules.enabled && targetIsPaid ? nextSlug : "";
        } else if (!subRules.enabled) {
          nextSubdomain = "";
        }
        const nextSocial = body.social !== void 0 ? sanitizeSocialInput(body.social) : existingRest.social;
        const updatedRest = {
          ...existingRest,
          id: rid,
          ...nextProjectName2 ? { n: nextProjectName2 } : {},
          ...nextOwner ? { ow: nextOwner } : {},
          ph: nextPhone2,
          projectType: nextProjectType2,
          ...String(nextProjectType2).toLowerCase().trim() === "store" && String(existingRest.tagline || "").trim() === "\u0623\u0634\u0647\u0649 \u0627\u0644\u0623\u0637\u0628\u0627\u0642 \u0627\u0644\u0645\u062D\u0636\u0631\u0629 \u064A\u0648\u0645\u064A\u0627\u064B \u0637\u0627\u0632\u062C\u0629 \u0628\u062C\u0648\u062F\u0629 \u0639\u0627\u0644\u064A\u0629" ? { tagline: "" } : {},
          slug: nextSlug,
          subdomain: nextSubdomain,
          ...nextSocial !== void 0 ? { social: nextSocial } : {},
          a: planFields ? body.active !== void 0 ? nextActive2 ? 1 : 0 : 1 : nextActive2 ? 1 : 0,
          ...planFields ? {
            planId: planFields.nextPlanId,
            p: planFields.nextPlanName,
            isPaid: planFields.nextIsPaid,
            e: planFields.nextExpiresAt
          } : {}
        };
        const saveRestRes = await upsertRecordInStore(`restaurants/${rid}`, updatedRest);
        if (!saveRestRes.ok) {
          return res.status(502).json({
            success: false,
            error: saveRestRes.error || "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
          });
        }
        const telegramUsers3 = await listTelegramUsers(false);
        const { accounts: accounts2 } = buildAdminAccountsView([], [updatedRest], telegramUsers3);
        return res.json({
          success: true,
          account: accounts2[0],
          persistedToSupabase: saveRestRes.persistedToSupabase,
          source: saveRestRes.source
        });
      }
      if (id.startsWith("tg_")) {
        const tgUsers = await listTelegramUsers(true);
        const phoneSlug = id.slice(3);
        const matchedTg = tgUsers.find(
          (tg) => (tg.normalizedPhone || tg.phone.replace(/\D/g, "") || tg.phone) === phoneSlug
        );
        if (!matchedTg) {
          return res.status(404).json({ success: false, error: "\u0633\u062C\u0644 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
        }
        const nextName2 = String(body.name || matchedTg.firstName || matchedTg.phone).trim();
        const nextPhone2 = String(body.phone || matchedTg.phone).trim();
        const nextProjectName2 = String(body.projectName || nextName2).trim();
        const nextProjectType2 = String(body.projectType || "restaurant").trim();
        const newPassword2 = body.newPassword !== void 0 ? String(body.newPassword || "").trim() : "";
        if (newPassword2 && newPassword2.length < 8) {
          return res.status(400).json({ success: false, error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 8 \u062E\u0627\u0646\u0627\u062A \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 (\u0623\u0631\u0642\u0627\u0645 \u0623\u0648 \u0623\u062D\u0631\u0641 \u0623\u0648 \u0631\u0645\u0648\u0632)" });
        }
        const rid = generateUid("r_");
        const planFields = resolvePlanPayload();
        const takenSlugs = collectTakenMenuSlugs(restaurantsRes.items);
        const autoSlug = generateUniqueMenuCode(takenSlugs);
        const newRest = {
          id: rid,
          n: nextProjectName2,
          ow: nextName2,
          ph: nextPhone2,
          projectType: nextProjectType2,
          p: planFields.nextPlanName,
          planId: planFields.nextPlanId,
          e: planFields.nextExpiresAt,
          isPaid: planFields.nextIsPaid,
          slug: autoSlug,
          subdomain: "",
          a: body.active === false ? 0 : 1,
          o: 0,
          v: 0,
          done: 1,
          lay: "list",
          themeMode: "light",
          themePreset: "clean-light",
          color: "#059669",
          h: { m: "24" },
          createdAt: todayIsoDate()
        };
        const accId = generateUid("acc_");
        const newAcc = {
          id: accId,
          n: nextName2,
          phone: nextPhone2,
          ph: nextPhone2,
          projectName: nextProjectName2,
          projectType: nextProjectType2,
          rid,
          r: "partner",
          admin: false,
          active: body.active !== false,
          telegramVerified: true,
          at: todayIsoDate(),
          created: todayIsoDate(),
          ...newPassword2 ? { pw: hashCredential(nextPhone2, newPassword2), username: nextPhone2 } : {}
        };
        const [saveAccRes, saveRestRes] = await Promise.all([
          upsertRecordInStore(`accounts/${accId}`, newAcc),
          upsertRecordInStore(`restaurants/${rid}`, newRest)
        ]);
        if (!saveAccRes.ok || !saveRestRes.ok) {
          return res.status(502).json({
            success: false,
            error: saveAccRes.error || saveRestRes.error || "\u062A\u0639\u0630\u0631 \u062A\u0631\u0642\u064A\u0629 \u0633\u062C\u0644 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u0625\u0644\u0649 \u062D\u0633\u0627\u0628 \u0634\u0631\u064A\u0643"
          });
        }
        const { accounts: accounts2 } = buildAdminAccountsView([newAcc], [newRest], tgUsers);
        return res.json({
          success: true,
          account: accounts2[0],
          persistedToSupabase: saveAccRes.persistedToSupabase,
          source: saveAccRes.source
        });
      }
      const existing = accountsRes.items.find((a) => a.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A" });
      }
      const isProtectedOwner = id === PROTECTED_OWNER_ACCOUNT_ID;
      const nextName = body.name !== void 0 ? String(body.name || "").trim() : String(existing.n || "").trim();
      const nextPhone = body.phone !== void 0 ? String(body.phone || "").trim() : String(existing.phone || existing.ph || "").trim();
      const nextEmail = body.email !== void 0 ? String(body.email || "").trim().toLowerCase() : String(existing.em || existing.e || "").trim();
      const nextProjectName = body.projectName !== void 0 ? String(body.projectName || "").trim() : String(existing.projectName || "").trim();
      const nextProjectType = body.projectType !== void 0 ? String(body.projectType || "").trim() : String(existing.projectType || "").trim();
      let nextActive = existing.active !== false;
      if (body.active !== void 0) {
        if (isProtectedOwner && body.active === false) {
          return res.status(403).json({
            success: false,
            error: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u064A\u0642\u0627\u0641 \u062D\u0633\u0627\u0628 \u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A"
          });
        }
        nextActive = Boolean(body.active);
      }
      let nextAdmin = Boolean(existing.admin === true || existing.r === "admin");
      let nextRole = existing.r || (nextAdmin ? "admin" : "partner");
      if (body.role === "admin" || body.role === "partner") {
        if (isProtectedOwner && body.role !== "admin") {
          return res.status(403).json({
            success: false,
            error: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u063A\u064A\u064A\u0631 \u0635\u0644\u0627\u062D\u064A\u0629 \u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A"
          });
        }
        nextAdmin = body.role === "admin";
        nextRole = body.role;
      }
      const newPassword = body.newPassword !== void 0 ? String(body.newPassword || "").trim() : "";
      if (newPassword && newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 8 \u062E\u0627\u0646\u0627\u062A \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 (\u0623\u0631\u0642\u0627\u0645 \u0623\u0648 \u0623\u062D\u0631\u0641 \u0623\u0648 \u0631\u0645\u0648\u0632)"
        });
      }
      const hashIdentifier = String(existing.username || existing.em || nextEmail || nextPhone || id).trim();
      const nextPwHash = newPassword ? hashCredential(hashIdentifier, newPassword) : existing.pw;
      let targetRid = existing.rid ? String(existing.rid) : void 0;
      let updatedRestaurantsList = restaurantsRes.items;
      const shouldUpdateRestaurant = hasPlanUpdate || hasLinkOrSocialUpdate || body.projectName !== void 0 || body.projectType !== void 0 || body.active !== void 0 || body.phone !== void 0;
      if (shouldUpdateRestaurant && !isProtectedOwner && existing.id !== "acc_menu_demo") {
        let linkedRest = targetRid ? restaurantsRes.items.find((r) => r.id === targetRid) : void 0;
        if (!linkedRest && (hasPlanUpdate || hasLinkOrSocialUpdate || nextProjectName)) {
          targetRid = targetRid && targetRid !== "demo" ? targetRid : generateUid("r_");
          const takenSlugs = collectTakenMenuSlugs(restaurantsRes.items);
          const rawLinkInput = body.slug !== void 0 && String(body.slug).trim() ? body.slug : body.subdomain;
          const checkedSlug = body.slug !== void 0 || body.subdomain !== void 0 ? validateUniqueSlug(rawLinkInput, targetRid) : "";
          const nextSocial = body.social !== void 0 ? sanitizeSocialInput(body.social) : void 0;
          const planFields = resolvePlanPayload();
          const finalSlug = checkedSlug || generateUniqueMenuCode(takenSlugs);
          linkedRest = {
            id: targetRid,
            n: nextProjectName || nextName || "\u0645\u0634\u0631\u0648\u0639 \u062C\u062F\u064A\u062F",
            ow: nextName,
            ph: nextPhone,
            projectType: nextProjectType || "restaurant",
            p: planFields.nextPlanName,
            planId: planFields.nextPlanId,
            e: planFields.nextExpiresAt,
            isPaid: planFields.nextIsPaid,
            a: nextActive ? 1 : 0,
            o: 0,
            v: 0,
            done: 1,
            lay: "list",
            themeMode: "light",
            themePreset: "clean-light",
            color: "#059669",
            h: { m: "24" },
            slug: finalSlug,
            subdomain: subRules.enabled && planFields.nextIsPaid ? finalSlug : "",
            ...nextSocial ? { social: nextSocial } : {},
            createdAt: todayIsoDate()
          };
          await upsertRecordInStore(`restaurants/${targetRid}`, linkedRest);
          updatedRestaurantsList = [...restaurantsRes.items, linkedRest];
        } else if (linkedRest && linkedRest.id !== "demo") {
          const planFields = hasPlanUpdate ? resolvePlanPayload(linkedRest) : null;
          const targetIsPaid = planFields ? planFields.nextIsPaid : Boolean(linkedRest.isPaid);
          const takenOtherSlugs = collectTakenMenuSlugs(restaurantsRes.items.filter((r) => r.id !== linkedRest.id));
          let nextSlug = sanitizeSubdomainValue(String(linkedRest.slug || ""));
          let nextSubdomain = sanitizeSubdomainValue(String(linkedRest.subdomain || ""));
          if (body.slug !== void 0 || body.subdomain !== void 0) {
            const rawLinkInput = body.slug !== void 0 && String(body.slug).trim() ? body.slug : body.subdomain;
            const checked = validateUniqueSlug(rawLinkInput, linkedRest.id);
            if (checked) {
              nextSlug = checked;
              nextSubdomain = subRules.enabled && targetIsPaid ? checked : "";
            } else {
              nextSlug = generateUniqueMenuCode(takenOtherSlugs);
              nextSubdomain = "";
            }
          } else if (planFields && !planFields.nextIsPaid) {
            nextSlug = isValidSixCharCode(nextSlug) && !takenOtherSlugs.has(nextSlug) ? nextSlug : generateUniqueMenuCode(takenOtherSlugs);
            nextSubdomain = "";
          } else if (!nextSlug) {
            nextSlug = generateUniqueMenuCode(takenOtherSlugs);
            nextSubdomain = subRules.enabled && targetIsPaid ? nextSlug : "";
          } else if (!subRules.enabled) {
            nextSubdomain = "";
          }
          const nextSocial = body.social !== void 0 ? sanitizeSocialInput(body.social) : linkedRest.social;
          const nextRest = {
            ...linkedRest,
            id: linkedRest.id,
            ...nextProjectName ? { n: nextProjectName } : {},
            ...nextName ? { ow: nextName } : {},
            ...body.phone !== void 0 ? { ph: nextPhone } : {},
            ...nextProjectType ? { projectType: nextProjectType } : {},
            slug: nextSlug,
            subdomain: nextSubdomain,
            ...nextSocial !== void 0 ? { social: nextSocial } : {},
            ...body.active !== void 0 ? { a: nextActive ? 1 : 0 } : hasPlanUpdate ? { a: 1 } : {},
            ...planFields ? {
              planId: planFields.nextPlanId,
              p: planFields.nextPlanName,
              isPaid: planFields.nextIsPaid,
              e: planFields.nextExpiresAt
            } : {}
          };
          await upsertRecordInStore(`restaurants/${linkedRest.id}`, nextRest);
          updatedRestaurantsList = restaurantsRes.items.map(
            (r) => r.id === linkedRest.id ? nextRest : r
          );
        }
      }
      if (hasPlanUpdate && body.active === void 0 && !isProtectedOwner) {
        nextActive = true;
      }
      const updatedAccount = {
        ...existing,
        id,
        ...nextName ? { n: nextName } : {},
        ...nextPhone ? { phone: nextPhone, ph: nextPhone } : {},
        ...nextEmail ? { em: nextEmail } : {},
        ...nextProjectName ? { projectName: nextProjectName } : {},
        ...nextProjectType ? { projectType: nextProjectType } : {},
        ...targetRid ? { rid: targetRid } : {},
        admin: nextAdmin,
        r: nextRole,
        active: nextActive,
        ...nextPwHash ? { pw: nextPwHash } : {},
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const saveAccountRes = await upsertRecordInStore(`accounts/${id}`, updatedAccount);
      if (!saveAccountRes.ok) {
        return res.status(502).json({
          success: false,
          error: saveAccountRes.error || "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0627\u0644\u062D\u0633\u0627\u0628 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
        });
      }
      const telegramUsers2 = await listTelegramUsers(false);
      const { accounts } = buildAdminAccountsView(
        [updatedAccount],
        updatedRestaurantsList,
        telegramUsers2
      );
      return res.json({
        success: true,
        account: accounts[0],
        persistedToSupabase: saveAccountRes.persistedToSupabase,
        source: saveAccountRes.source
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u062A\u062D\u062F\u064A\u062B \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062D\u0633\u0627\u0628";
      return res.status(500).json({ success: false, error: msg });
    }
  });
  router.delete("/api/accounts/:id", requireAdminOrStaff("canDeletePartner"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const id = String(req.params.id || "").trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      if (id === PROTECTED_OWNER_ACCOUNT_ID) {
        return res.status(403).json({
          success: false,
          error: "\u062D\u0633\u0627\u0628 \u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A \u0645\u062D\u0645\u064A \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641\u0647"
        });
      }
      if (req.authSession?.accountId && id === req.authSession.accountId) {
        return res.status(403).json({
          success: false,
          error: "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u062D\u0630\u0641 \u062D\u0633\u0627\u0628\u0643 \u0627\u0644\u0646\u0634\u0637 \u0627\u0644\u0630\u064A \u062A\u0633\u062A\u062E\u062F\u0645\u0647 \u062D\u0627\u0644\u064A\u0627\u064B \u0641\u064A \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u0635\u0629"
        });
      }
      const deleteTelegramToo = false;
      const collectPhoneKeys = (vals) => Array.from(
        new Set(
          vals.filter((v) => typeof v === "string" && v.trim().length >= 5).map((v) => v.trim())
        )
      );
      const deleteRestaurantCascade = async (ridToRemove) => {
        if (!ridToRemove || ridToRemove === "demo") return [];
        const [restsRes, catsRes, itemsRes, ordersRes] = await Promise.all([
          readPrefixFromStore("restaurants/"),
          readPrefixFromStore("cats/"),
          readPrefixFromStore("items/"),
          readPrefixFromStore("orders/")
        ]);
        const targetRids = /* @__PURE__ */ new Set([ridToRemove]);
        const discoveredPhones = [];
        for (const r of restsRes.items) {
          if (r.id === ridToRemove || r.parentRid === ridToRemove) {
            targetRids.add(r.id);
            if (r.ph) discoveredPhones.push(String(r.ph));
            if (r.ow) discoveredPhones.push(String(r.ow));
          }
        }
        const keysToDelete = [];
        for (const rId of targetRids) {
          if (rId && rId !== "demo") keysToDelete.push(`restaurants/${rId}`);
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
          ...Array.from(targetRids).map((rId) => clearAuthSessionsByTarget(rId))
        ]);
        return discoveredPhones;
      };
      if (id.startsWith("tg_")) {
        const targetPhone = id.slice(3);
        const phoneSet = normalizePhoneMatchSet(targetPhone);
        const [accountsRes2, restsRes] = await Promise.all([
          readPrefixFromStore("accounts/"),
          readPrefixFromStore("restaurants/")
        ]);
        for (const acc of accountsRes2.items) {
          if (acc.id === PROTECTED_OWNER_ACCOUNT_ID || acc.id === req.authSession?.accountId || acc.admin) continue;
          const accPhones = [acc.phone, acc.ph, acc.projectPhone, acc.em, acc.username].filter((x) => Boolean(x)).flatMap((x) => Array.from(normalizePhoneMatchSet(x)));
          if (accPhones.some((k) => phoneSet.has(k))) {
            await deleteRecordPhysicallyFromStore(`accounts/${acc.id}`);
            await clearAuthSessionsByTarget(acc.rid && acc.rid !== "demo" ? acc.rid : void 0, acc.id);
            if (acc.rid && acc.rid !== "demo") await deleteRestaurantCascade(acc.rid);
          }
        }
        for (const r of restsRes.items) {
          if (r.id === "demo") continue;
          const rPhones = [r.ph, r.ow].filter((x) => Boolean(x)).flatMap((x) => Array.from(normalizePhoneMatchSet(x)));
          if (rPhones.some((k) => phoneSet.has(k))) {
            await deleteRestaurantCascade(r.id);
          }
        }
        const tgDel = await deleteTelegramUserByPhone(targetPhone);
        if (!tgDel.ok) {
          return res.status(502).json({
            success: false,
            error: tgDel.error || "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0631\u0628\u0637 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
          });
        }
        return res.json({
          success: true,
          deletedId: id,
          physicalDelete: true,
          deletedFromSupabase: tgDel.deletedFromSupabase,
          deletedTelegram: true
        });
      }
      if (id.startsWith("rest_")) {
        const rid = id.slice(5);
        const [restsRes, accountsRes2] = await Promise.all([
          readPrefixFromStore("restaurants/"),
          readPrefixFromStore("accounts/")
        ]);
        const existingRest = restsRes.items.find((r) => r.id === rid);
        if (!existingRest) {
          return res.status(404).json({
            success: false,
            error: "\u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0623\u0648 \u062A\u0645 \u062D\u0630\u0641\u0647 \u0646\u0647\u0627\u0626\u064A\u0627\u064B \u0645\u0633\u0628\u0642\u0627\u064B"
          });
        }
        const phonesToClear2 = collectPhoneKeys([existingRest.ph, existingRest.ow]);
        for (const acc of accountsRes2.items) {
          if (acc.id !== PROTECTED_OWNER_ACCOUNT_ID && acc.rid === rid) {
            phonesToClear2.push(...collectPhoneKeys([acc.phone, acc.ph, acc.projectPhone, acc.em, acc.username]));
            await deleteRecordPhysicallyFromStore(`accounts/${acc.id}`);
            await clearAuthSessionsByTarget(rid, acc.id);
          }
        }
        const branchPhones = await deleteRestaurantCascade(rid);
        phonesToClear2.push(...branchPhones);
        let deletedTelegram2 = false;
        if (deleteTelegramToo && phonesToClear2.length > 0) {
          for (const ph of Array.from(new Set(phonesToClear2))) {
            const tgRes = await deleteTelegramUserByPhone(ph);
            if (tgRes.ok) deletedTelegram2 = true;
          }
        }
        return res.json({
          success: true,
          deletedId: id,
          physicalDelete: true,
          deletedFromSupabase: true,
          deletedFromLocal: true,
          deletedTelegram: deletedTelegram2
        });
      }
      const accountsRes = await readPrefixFromStore("accounts/");
      const existing = accountsRes.items.find((a) => a.id === id);
      const deleteResult = await deleteRecordPhysicallyFromStore(`accounts/${id}`);
      if (!deleteResult.ok) {
        return res.status(502).json({
          success: false,
          error: deleteResult.error || "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
        });
      }
      if (!deleteResult.deletedFromSupabase && !deleteResult.deletedFromLocal) {
        return res.status(404).json({
          success: false,
          error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0623\u0648 \u062A\u0645 \u062D\u0630\u0641\u0647 \u0646\u0647\u0627\u0626\u064A\u0627\u064B \u0645\u0633\u0628\u0642\u0627\u064B"
        });
      }
      await clearAuthSessionsByTarget(
        existing?.rid && existing.rid !== "demo" ? String(existing.rid) : void 0,
        id
      );
      const phonesToClear = collectPhoneKeys([
        existing?.phone,
        existing?.ph,
        existing?.projectPhone,
        existing?.em,
        existing?.username
      ]);
      if (existing?.rid && existing.rid !== "demo") {
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
        source: deleteResult.source
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u062D\u0630\u0641 \u0627\u0644\u062D\u0633\u0627\u0628";
      return res.status(500).json({ success: false, error: msg });
    }
  });
  router.post("/api/maintenance/cleanup-images", requireAdminOrStaff("canRunMaintenance"), async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const allData = await readAll(false);
      const validRids = /* @__PURE__ */ new Set(["demo"]);
      for (const key of Object.keys(allData)) {
        if (key.startsWith("restaurants/") && !key.slice("restaurants/".length).includes("/")) {
          validRids.add(key.slice("restaurants/".length));
        }
      }
      const keysToDelete = [];
      let reclaimedBytes = 0;
      for (const [key, val] of Object.entries(allData)) {
        if (!val || typeof val !== "object") continue;
        const rec = val;
        if ((key.startsWith("cats/") || key.startsWith("items/") || key.startsWith("orders/")) && rec.rid && !validRids.has(String(rec.rid))) {
          keysToDelete.push(key);
          reclaimedBytes += Buffer.byteLength(JSON.stringify(rec), "utf8");
        } else if (key.startsWith("images/") || key.startsWith("uploads/")) {
          keysToDelete.push(key);
          reclaimedBytes += Buffer.byteLength(JSON.stringify(rec), "utf8");
        }
      }
      const logs = Object.entries(allData).filter(([k]) => k.startsWith("logs/")).map(([k, v]) => ({ k, at: Number(v?.at || 0), size: Buffer.byteLength(JSON.stringify(v), "utf8") })).sort((a, b) => b.at - a.at);
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
        message: keysToDelete.length > 0 ? `\u062A\u0645 \u062A\u0646\u0638\u064A\u0641 ${keysToDelete.length} \u0633\u062C\u0644 \u0648\u0635\u0648\u0631 \u064A\u062A\u064A\u0645\u0629 \u063A\u064A\u0631 \u0645\u0631\u062A\u0628\u0637\u0629 \u0648\u062A\u0648\u0641\u064A\u0631 ${(reclaimedBytes / 1024).toFixed(1)} \u0643\u064A\u0644\u0648\u0628\u0627\u064A\u062A` : "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0646\u0638\u064A\u0641\u0629 \u062D\u0627\u0644\u064A\u0627\u064B \u0648\u0644\u0627 \u062A\u0648\u062C\u062F \u0635\u0648\u0631 \u0623\u0648 \u0633\u062C\u0644\u0627\u062A \u064A\u062A\u064A\u0645\u0629 \u063A\u064A\u0631 \u0645\u0633\u062A\u062E\u062F\u0645\u0629."
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u062A\u0646\u0638\u064A\u0641 \u0627\u0644\u0635\u0648\u0631 \u0648\u0627\u0644\u0645\u0644\u0641\u0627\u062A"
      });
    }
  });
  router.get("/api/my-account", requireAdminOrStaff(), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const authSes = req.authSession;
      const staffId = authSes.role === "staff" ? String(authSes.staffId || "") : String(req.query.staffId || "").trim();
      const email = String(req.query.email || authSes.email || "").trim().toLowerCase();
      const phone = String(req.query.phone || authSes.phone || "").trim();
      if (staffId) {
        const staffRes = await readPrefixFromStore("staff/");
        const member = staffRes.items.find((s) => s.id === staffId);
        if (!member) {
          return res.status(404).json({ success: false, error: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0638\u0641" });
        }
        const staffPhone = String(member.phone || member.email || "").trim();
        return res.json({
          success: true,
          profile: {
            kind: "staff",
            id: member.id,
            name: String(member.name || "").trim(),
            email: staffPhone,
            phone: staffPhone,
            roleTitle: String(member.roleTitle || "\u0645\u0648\u0638\u0641 \u0625\u062F\u0627\u0631\u0629").trim(),
            createdAt: member.createdAt || todayIsoDate(),
            active: member.active !== false,
            isProtected: false,
            permissions: sanitizePermissions(member.permissions)
          },
          source: staffRes.source
        });
      }
      const accountsRes = await readPrefixFromStore("accounts/");
      const phoneSet = phone ? normalizePhoneMatchSet(phone) : /* @__PURE__ */ new Set();
      const matched = accountsRes.items.find((a) => {
        if (a.id === PROTECTED_OWNER_ACCOUNT_ID && (!email || email === "07711448594" || a.em?.toLowerCase() === email)) {
          return true;
        }
        if (email && (String(a.em || "").toLowerCase() === email || String(a.e || "").toLowerCase() === email || String(a.username || "").toLowerCase() === email)) {
          return true;
        }
        if (phoneSet.size > 0) {
          const accPhones = normalizePhoneMatchSet(String(a.phone || a.ph || ""));
          for (const k of accPhones) {
            if (phoneSet.has(k)) return true;
          }
        }
        return false;
      }) || accountsRes.items.find((a) => a.id === PROTECTED_OWNER_ACCOUNT_ID || a.admin === true || a.r === "admin");
      const ownerPhone = String(matched?.phone || matched?.ph || phone || matched?.em || "07711448594").trim();
      return res.json({
        success: true,
        profile: {
          kind: "owner",
          id: matched?.id || PROTECTED_OWNER_ACCOUNT_ID,
          name: String(matched?.n || "\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0635\u0629").trim(),
          email: ownerPhone,
          phone: ownerPhone,
          roleTitle: String(matched?.roleTitle || "\u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629 \u0648\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645").trim(),
          createdAt: formatRegistrationDate(matched?.created || matched?.at) || "\u0645\u0646\u0630 \u0627\u0644\u062A\u0623\u0633\u064A\u0633",
          active: true,
          isProtected: (matched?.id || PROTECTED_OWNER_ACCOUNT_ID) === PROTECTED_OWNER_ACCOUNT_ID,
          permissions: FULL_OWNER_PERMISSIONS
        },
        source: accountsRes.source
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u062C\u0644\u0628 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0634\u062E\u0635\u064A";
      return res.status(500).json({ success: false, error: msg });
    }
  });
  router.put("/api/my-account", requireAdminOrStaff(), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const authSes = req.authSession;
      const body = req.body || {};
      const staffId = authSes.role === "staff" ? String(authSes.staffId || "") : body.staffId ? String(body.staffId).trim() : "";
      const targetAccountId = authSes.role === "staff" ? "" : body.accountId ? String(body.accountId).trim() : "";
      const name = String(body.name || "").trim();
      const phone = String(body.phone || body.email || "").trim();
      const email = phone.toLowerCase();
      const roleTitle = String(body.roleTitle || "").trim();
      const newPassword = body.newPassword !== void 0 ? String(body.newPassword || "").trim() : "";
      if (!name) {
        return res.status(400).json({ success: false, error: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644 \u0645\u0637\u0644\u0648\u0628" });
      }
      if (!phone) {
        return res.status(400).json({ success: false, error: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0645\u0637\u0644\u0648\u0628" });
      }
      if (newPassword && newPassword.length < 8) {
        return res.status(400).json({ success: false, error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 8 \u062E\u0627\u0646\u0627\u062A \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 (\u0623\u0631\u0642\u0627\u0645 \u0623\u0648 \u0623\u062D\u0631\u0641 \u0623\u0648 \u0631\u0645\u0648\u0632)" });
      }
      if (staffId) {
        const staffRes = await readPrefixFromStore("staff/");
        const existing = staffRes.items.find((s) => s.id === staffId);
        if (!existing) {
          return res.status(404).json({ success: false, error: "\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0638\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A" });
        }
        const oldPhoneSet = normalizePhoneMatchSet(String(existing.phone || existing.email || ""));
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
            error: "\u0639\u0646\u062F \u062A\u063A\u064A\u064A\u0631 \u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641\u060C \u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 \u0644\u0644\u062D\u0641\u0627\u0638 \u0639\u0644\u0649 \u0635\u0644\u0627\u062D\u064A\u0629 \u062F\u062E\u0648\u0644\u0643"
          });
        }
        const duplicatePhone = staffRes.items.find((s) => {
          if (s.id === staffId) return false;
          const candidates = [String(s.phone || ""), String(s.email || "")].filter(Boolean);
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
            error: "\u064A\u0648\u062C\u062F \u0645\u0648\u0638\u0641 \u0622\u062E\u0631 \u0645\u0633\u062C\u0644 \u0628\u0646\u0641\u0633 \u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641"
          });
        }
        const passwordHash = newPassword ? hashCredential(phone, newPassword) : existing.passwordHash || existing.pw;
        const updatedStaff = {
          ...existing,
          id: staffId,
          name,
          email: newPassword ? email : String(existing.email || email),
          phone,
          roleTitle: roleTitle || existing.roleTitle || "\u0645\u0648\u0638\u0641 \u0625\u062F\u0627\u0631\u0629",
          ...passwordHash ? { passwordHash } : {},
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        const saveRes2 = await upsertRecordInStore(`staff/${staffId}`, updatedStaff);
        if (!saveRes2.ok) {
          return res.status(502).json({
            success: false,
            error: saveRes2.error || "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u062A\u0639\u062F\u064A\u0644\u0627\u062A \u062D\u0633\u0627\u0628\u0643 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
          });
        }
        return res.json({
          success: true,
          persistedToSupabase: saveRes2.persistedToSupabase,
          source: saveRes2.source,
          profile: {
            kind: "staff",
            id: updatedStaff.id,
            name: updatedStaff.name,
            email: updatedStaff.phone || updatedStaff.email,
            phone: updatedStaff.phone || "",
            roleTitle: updatedStaff.roleTitle,
            createdAt: updatedStaff.createdAt || todayIsoDate(),
            active: updatedStaff.active !== false,
            isProtected: false,
            permissions: sanitizePermissions(updatedStaff.permissions)
          },
          sessionPatch: {
            name: updatedStaff.name,
            email: updatedStaff.phone || updatedStaff.email,
            phone: updatedStaff.phone || "",
            roleTitle: updatedStaff.roleTitle
          }
        });
      }
      const accountsRes = await readPrefixFromStore("accounts/");
      const existingOwner = (targetAccountId ? accountsRes.items.find((a) => a.id === targetAccountId) : void 0) || accountsRes.items.find((a) => a.id === PROTECTED_OWNER_ACCOUNT_ID) || accountsRes.items.find((a) => a.admin === true || a.r === "admin");
      const accId = existingOwner?.id || PROTECTED_OWNER_ACCOUNT_ID;
      const normalizedDigits = phone.replace(/\D/g, "");
      const hashId = accId === PROTECTED_OWNER_ACCOUNT_ID && (normalizedDigits === "07711448594" || normalizedDigits === "9647711448594" || normalizedDigits === "7711448594") ? "07711448594" : phone;
      const updatedPw = newPassword ? hashCredential(hashId, newPassword) : existingOwner?.pw || hashCredential("07711448594", "admin");
      const updatedAcc = {
        ...existingOwner || {},
        id: accId,
        n: name,
        em: phone,
        e: phone,
        username: phone,
        phone,
        ph: phone,
        roleTitle: roleTitle || existingOwner?.roleTitle || "\u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629 \u0648\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645",
        pw: updatedPw,
        rid: existingOwner?.rid || "demo",
        r: "admin",
        admin: true,
        active: true,
        at: existingOwner?.at || todayIsoDate(),
        created: existingOwner?.created || todayIsoDate(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const saveRes = await upsertRecordInStore(`accounts/${accId}`, updatedAcc);
      if (!saveRes.ok) {
        return res.status(502).json({
          success: false,
          error: saveRes.error || "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062D\u0633\u0627\u0628 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
        });
      }
      return res.json({
        success: true,
        persistedToSupabase: saveRes.persistedToSupabase,
        source: saveRes.source,
        profile: {
          kind: "owner",
          id: accId,
          name: updatedAcc.n || name,
          email: updatedAcc.phone || phone,
          phone: updatedAcc.phone || phone,
          roleTitle: updatedAcc.roleTitle || "\u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629 \u0648\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645",
          createdAt: formatRegistrationDate(updatedAcc.created || updatedAcc.at) || "\u0645\u0646\u0630 \u0627\u0644\u062A\u0623\u0633\u064A\u0633",
          active: true,
          isProtected: accId === PROTECTED_OWNER_ACCOUNT_ID,
          permissions: FULL_OWNER_PERMISSIONS
        },
        sessionPatch: {
          name: updatedAcc.n || name,
          email: updatedAcc.phone || phone,
          phone: updatedAcc.phone || phone,
          roleTitle: updatedAcc.roleTitle || "\u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629 \u0648\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645"
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u062D\u0641\u0638 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0634\u062E\u0635\u064A";
      return res.status(500).json({ success: false, error: msg });
    }
  });
  const DEFAULT_FINANCE_SETTINGS = {
    exchangeRateIqdPerUsd: 1500,
    monthlyRevenueTargetIqd: 2e6,
    expensesReservePct: 25,
    marketingSalesPct: 25,
    emergencyGrowthPct: 15,
    ownerNetProfitPct: 35
  };
  function advanceDueDateIso(currentDue, cycle) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(currentDue) ? /* @__PURE__ */ new Date(`${currentDue}T00:00:00Z`) : /* @__PURE__ */ new Date();
    if (cycle === "monthly") {
      base.setUTCMonth(base.getUTCMonth() + 1);
    } else if (cycle === "quarterly") {
      base.setUTCMonth(base.getUTCMonth() + 3);
    } else if (cycle === "annual") {
      base.setUTCFullYear(base.getUTCFullYear() + 1);
    }
    return base.toISOString().slice(0, 10);
  }
  router.get("/api/admin/finance", requireAdminOrStaff("canManageFinance"), async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const [expRes, profRes, settingsRes, restsRes, plansRes] = await Promise.all([
        readPrefixFromStore("finance_expenses/"),
        readPrefixFromStore("finance_profits/"),
        readPrefixFromStore("settings/finance"),
        readPrefixFromStore("restaurants/"),
        readPrefixFromStore("settings/plans")
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
        ownerNetProfitPct: Math.max(0, Math.min(100, Number(rawSettings.ownerNetProfitPct ?? DEFAULT_FINANCE_SETTINGS.ownerNetProfitPct)))
      };
      const expenses = expRes.items.map((e) => ({ ...e, id: String(e.id || "") })).filter((e) => Boolean(e.id)).sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
      const profits = profRes.items.map((p) => ({ ...p, id: String(p.id || "") })).filter((p) => Boolean(p.id)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      const plansList = plansRes.items[0]?.list || [];
      const paidRests = restsRes.items.filter((r) => r.id !== "demo" && !r.isBranch && r.isPaid && r.a !== 0);
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
          estimatedMonthlyMrrIqd: estimatedMonthlyPartnerMrrIqd
        },
        source: expRes.source
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u0641\u0634\u0644 \u0641\u064A \u062C\u0644\u0628 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0635\u0627\u0631\u064A\u0641 \u0648\u0627\u0644\u0623\u0631\u0628\u0627\u062D"
      });
    }
  });
  router.post("/api/admin/finance/expenses", requireAdminOrStaff("canManageFinance"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const body = req.body || {};
      const title = String(body.title || "").trim().slice(0, 140);
      if (!title) {
        return res.status(400).json({ success: false, error: "\u064A\u0631\u062C\u0649 \u0643\u062A\u0627\u0628\u0629 \u0627\u0633\u0645 \u0627\u0644\u0645\u0635\u0631\u0648\u0641 \u0623\u0648 \u0627\u0644\u0627\u0644\u062A\u0632\u0627\u0645" });
      }
      const id = generateUid("exp_");
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const amount = Math.max(0, Number(body.amount) || 0);
      const currency = body.currency === "USD" ? "USD" : "IQD";
      const billingCycle = ["monthly", "quarterly", "annual", "one_time"].includes(String(body.billingCycle)) ? String(body.billingCycle) : "monthly";
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate || "").trim()) ? String(body.dueDate).trim() : todayIsoDate();
      const status = ["pending", "paid", "overdue"].includes(String(body.status)) ? String(body.status) : "pending";
      const record = {
        id,
        title,
        vendor: String(body.vendor || "").trim().slice(0, 100),
        category: String(body.category || "server").trim() || "server",
        amount,
        currency,
        billingCycle,
        dueDate,
        status,
        autoRenew: Boolean(body.autoRenew),
        reminderDays: Math.max(0, Math.min(60, Number(body.reminderDays ?? 5) || 0)),
        ...status === "paid" ? { paidAt: String(body.paidAt || todayIsoDate()) } : {},
        notes: String(body.notes || "").trim().slice(0, 500),
        createdAt: nowIso,
        updatedAt: nowIso
      };
      const saved = await upsertRecordInStore(`finance_expenses/${id}`, record);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0645\u0635\u0631\u0648\u0641" });
      }
      return res.status(201).json({ success: true, expense: record, source: saved.source });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0635\u0631\u0648\u0641"
      });
    }
  });
  router.put("/api/admin/finance/expenses/:id", requireAdminOrStaff("canManageFinance"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const id = String(req.params.id || "").trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: "\u0645\u0639\u0631\u0651\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      const expRes = await readPrefixFromStore("finance_expenses/");
      const existing = expRes.items.find((e) => e.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "\u0627\u0644\u0645\u0635\u0631\u0648\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      const body = req.body || {};
      const title = body.title !== void 0 ? String(body.title || "").trim().slice(0, 140) : String(existing.title || "");
      if (!title) {
        return res.status(400).json({ success: false, error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0635\u0631\u0648\u0641 \u0645\u0637\u0644\u0648\u0628" });
      }
      const nextStatus = body.status !== void 0 && ["pending", "paid", "overdue"].includes(String(body.status)) ? String(body.status) : String(existing.status || "pending");
      const updated = {
        ...existing,
        id,
        title,
        vendor: body.vendor !== void 0 ? String(body.vendor || "").trim().slice(0, 100) : existing.vendor,
        category: body.category !== void 0 ? String(body.category || "server") : existing.category,
        amount: body.amount !== void 0 ? Math.max(0, Number(body.amount) || 0) : existing.amount,
        currency: body.currency !== void 0 ? body.currency === "USD" ? "USD" : "IQD" : existing.currency,
        billingCycle: body.billingCycle !== void 0 && ["monthly", "quarterly", "annual", "one_time"].includes(String(body.billingCycle)) ? String(body.billingCycle) : existing.billingCycle,
        dueDate: body.dueDate !== void 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate).trim()) ? String(body.dueDate).trim() : existing.dueDate,
        status: nextStatus,
        autoRenew: body.autoRenew !== void 0 ? Boolean(body.autoRenew) : Boolean(existing.autoRenew),
        reminderDays: body.reminderDays !== void 0 ? Math.max(0, Math.min(60, Number(body.reminderDays) || 0)) : existing.reminderDays,
        paidAt: nextStatus === "paid" ? String(body.paidAt || existing.paidAt || todayIsoDate()) : void 0,
        notes: body.notes !== void 0 ? String(body.notes || "").trim().slice(0, 500) : existing.notes,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const saved = await upsertRecordInStore(`finance_expenses/${id}`, updated);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0635\u0631\u0648\u0641" });
      }
      return res.json({ success: true, expense: updated, source: saved.source });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0635\u0631\u0648\u0641"
      });
    }
  });
  router.post("/api/admin/finance/expenses/:id/pay", requireAdminOrStaff("canManageFinance"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const id = String(req.params.id || "").trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: "\u0645\u0639\u0631\u0651\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      const expRes = await readPrefixFromStore("finance_expenses/");
      const existing = expRes.items.find((e) => e.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "\u0627\u0644\u0645\u0635\u0631\u0648\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      const body = req.body || {};
      const advanceCycle = body.advanceCycle === true;
      const cycle = String(existing.billingCycle || "one_time");
      const currentDue = String(existing.dueDate || todayIsoDate());
      const updated = {
        ...existing,
        id,
        paidAt: todayIsoDate(),
        status: advanceCycle && cycle !== "one_time" ? "pending" : "paid",
        dueDate: advanceCycle && cycle !== "one_time" ? advanceDueDateIso(currentDue, cycle) : currentDue,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const saved = await upsertRecordInStore(`finance_expenses/${id}`, updated);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || "\u062A\u0639\u0630\u0631 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0633\u062F\u0627\u062F" });
      }
      return res.json({ success: true, expense: updated });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0633\u062F\u0627\u062F"
      });
    }
  });
  router.delete("/api/admin/finance/expenses/:id", requireAdminOrStaff("canManageFinance"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const id = String(req.params.id || "").trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: "\u0645\u0639\u0631\u0651\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      const delRes = await deleteRecordPhysicallyFromStore(`finance_expenses/${id}`);
      if (!delRes.ok) {
        return res.status(502).json({ success: false, error: delRes.error || "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0645\u0635\u0631\u0648\u0641" });
      }
      return res.json({ success: true, deletedId: id });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0645\u0635\u0631\u0648\u0641"
      });
    }
  });
  router.post("/api/admin/finance/profits", requireAdminOrStaff("canManageFinance"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const body = req.body || {};
      const title = String(body.title || "").trim().slice(0, 140);
      if (!title) {
        return res.status(400).json({ success: false, error: "\u064A\u0631\u062C\u0649 \u0643\u062A\u0627\u0628\u0629 \u0648\u0635\u0641 \u0627\u0644\u0625\u064A\u0631\u0627\u062F \u0623\u0648 \u0627\u0644\u0631\u0628\u062D" });
      }
      const id = generateUid("prf_");
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const record = {
        id,
        title,
        source: ["subscription", "setup", "ads_campaign", "custom_service", "other"].includes(String(body.source)) ? String(body.source) : "subscription",
        partnerName: String(body.partnerName || "").trim().slice(0, 100),
        rid: body.rid ? String(body.rid).trim() : void 0,
        amount: Math.max(0, Number(body.amount) || 0),
        currency: body.currency === "USD" ? "USD" : "IQD",
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "").trim()) ? String(body.date).trim() : todayIsoDate(),
        allocationNote: String(body.allocationNote || "").trim().slice(0, 200),
        notes: String(body.notes || "").trim().slice(0, 500),
        createdAt: nowIso,
        updatedAt: nowIso
      };
      const saved = await upsertRecordInStore(`finance_profits/${id}`, record);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0633\u062C\u0644 \u0627\u0644\u0631\u0628\u062D" });
      }
      return res.status(201).json({ success: true, profit: record, source: saved.source });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0631\u0628\u062D"
      });
    }
  });
  router.put("/api/admin/finance/profits/:id", requireAdminOrStaff("canManageFinance"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const id = String(req.params.id || "").trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: "\u0645\u0639\u0631\u0651\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      const profRes = await readPrefixFromStore("finance_profits/");
      const existing = profRes.items.find((p) => p.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "\u0633\u062C\u0644 \u0627\u0644\u0631\u0628\u062D \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      const body = req.body || {};
      const title = body.title !== void 0 ? String(body.title || "").trim().slice(0, 140) : String(existing.title || "");
      if (!title) {
        return res.status(400).json({ success: false, error: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0631\u0628\u062D \u0645\u0637\u0644\u0648\u0628" });
      }
      const updated = {
        ...existing,
        id,
        title,
        source: body.source !== void 0 && ["subscription", "setup", "ads_campaign", "custom_service", "other"].includes(String(body.source)) ? String(body.source) : existing.source,
        partnerName: body.partnerName !== void 0 ? String(body.partnerName || "").trim().slice(0, 100) : existing.partnerName,
        amount: body.amount !== void 0 ? Math.max(0, Number(body.amount) || 0) : existing.amount,
        currency: body.currency !== void 0 ? body.currency === "USD" ? "USD" : "IQD" : existing.currency,
        date: body.date !== void 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date).trim()) ? String(body.date).trim() : existing.date,
        allocationNote: body.allocationNote !== void 0 ? String(body.allocationNote || "").trim().slice(0, 200) : existing.allocationNote,
        notes: body.notes !== void 0 ? String(body.notes || "").trim().slice(0, 500) : existing.notes,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const saved = await upsertRecordInStore(`finance_profits/${id}`, updated);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0633\u062C\u0644 \u0627\u0644\u0631\u0628\u062D" });
      }
      return res.json({ success: true, profit: updated, source: saved.source });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062A\u0639\u062F\u064A\u0644 \u0633\u062C\u0644 \u0627\u0644\u0631\u0628\u062D"
      });
    }
  });
  router.delete("/api/admin/finance/profits/:id", requireAdminOrStaff("canManageFinance"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const id = String(req.params.id || "").trim();
      if (!isValidRecordId(id)) {
        return res.status(400).json({ success: false, error: "\u0645\u0639\u0631\u0651\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      const delRes = await deleteRecordPhysicallyFromStore(`finance_profits/${id}`);
      if (!delRes.ok) {
        return res.status(502).json({ success: false, error: delRes.error || "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0633\u062C\u0644" });
      }
      return res.json({ success: true, deletedId: id });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0633\u062C\u0644"
      });
    }
  });
  router.put("/api/admin/finance/settings", requireAdminOrStaff("canManageFinance"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const body = req.body || {};
      const existingRes = await readPrefixFromStore("settings/finance");
      const existing = existingRes.items[0] || {};
      const nextSettings = {
        ...DEFAULT_FINANCE_SETTINGS,
        ...existing,
        exchangeRateIqdPerUsd: Math.max(100, Number(body.exchangeRateIqdPerUsd ?? existing.exchangeRateIqdPerUsd) || 1500),
        monthlyRevenueTargetIqd: Math.max(0, Number(body.monthlyRevenueTargetIqd ?? existing.monthlyRevenueTargetIqd ?? 2e6)),
        expensesReservePct: Math.max(0, Math.min(100, Number(body.expensesReservePct ?? existing.expensesReservePct ?? 25))),
        marketingSalesPct: Math.max(0, Math.min(100, Number(body.marketingSalesPct ?? existing.marketingSalesPct ?? 25))),
        emergencyGrowthPct: Math.max(0, Math.min(100, Number(body.emergencyGrowthPct ?? existing.emergencyGrowthPct ?? 15))),
        ownerNetProfitPct: Math.max(0, Math.min(100, Number(body.ownerNetProfitPct ?? existing.ownerNetProfitPct ?? 35))),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const saved = await upsertRecordInStore("settings/finance", nextSettings);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629" });
      }
      return res.json({ success: true, settings: nextSettings, source: saved.source });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629"
      });
    }
  });
  const appendDbAuditLog = async (req, action, details, type = "system") => {
    try {
      const ses = req.authSession;
      const logId = `aud_${Date.now().toString(36)}_${crypto3.randomBytes(2).toString("hex")}`;
      await upsertRecordInStore(`logs/${logId}`, {
        id: logId,
        at: Date.now(),
        actor: ses?.phone || ses?.email || ses?.name || "\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0635\u0629",
        action,
        details,
        type
      });
    } catch {
    }
  };
  router.get("/api/admin/database/overview", requireAdminOrStaff("canManageDatabase"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const [allData, tgUsers] = await Promise.all([
        readAll(true),
        listTelegramUsers(true).catch(() => [])
      ]);
      const accounts = [];
      const staff = [];
      const restaurants = [];
      const categories = [];
      const items = [];
      const orders = [];
      const auditLogs = [];
      const userSessions = [];
      const settingsAndSystem = [];
      const rawRecords = [];
      const catsCountByRid = /* @__PURE__ */ new Map();
      const itemsCountByRid = /* @__PURE__ */ new Map();
      const ordersCountByRid = /* @__PURE__ */ new Map();
      const restNameByRid = /* @__PURE__ */ new Map();
      for (const [k, v] of Object.entries(allData)) {
        if (!v || typeof v !== "object") continue;
        const rec = v;
        if (k.startsWith("restaurants/") && !k.slice("restaurants/".length).includes("/")) {
          const ridKey = k.slice("restaurants/".length);
          restNameByRid.set(ridKey, String(rec.n || ridKey));
        }
        const rid = String(rec.rid || "");
        if (k.startsWith("cats/") && rid) catsCountByRid.set(rid, (catsCountByRid.get(rid) || 0) + 1);
        if (k.startsWith("items/") && rid) itemsCountByRid.set(rid, (itemsCountByRid.get(rid) || 0) + 1);
        if (k.startsWith("orders/") && rid) ordersCountByRid.set(rid, (ordersCountByRid.get(rid) || 0) + 1);
      }
      const tgByPhoneKey = /* @__PURE__ */ new Map();
      for (const tu of tgUsers) {
        for (const pk of normalizePhoneKeys(tu.phone || tu.normalizedPhone)) {
          tgByPhoneKey.set(pk, tu);
        }
      }
      const findTgForPhoneCandidates = (candidates) => {
        for (const c of candidates) {
          if (typeof c !== "string" || !c.trim()) continue;
          for (const pk of normalizePhoneKeys(c)) {
            const hit = tgByPhoneKey.get(pk);
            if (hit) return hit;
          }
        }
        return void 0;
      };
      const platformLinkedPhones = /* @__PURE__ */ new Map();
      const addPlatformPhoneLabel = (rawPhone, label) => {
        if (typeof rawPhone !== "string" || !rawPhone.trim()) return;
        for (const pk of normalizePhoneKeys(rawPhone)) {
          const arr = platformLinkedPhones.get(pk) || [];
          if (!arr.includes(label)) arr.push(label);
          platformLinkedPhones.set(pk, arr);
        }
      };
      const phoneMap = /* @__PURE__ */ new Map();
      const ensurePhoneEntry = (rawPhone) => {
        const clean = String(rawPhone || "").trim();
        if (!clean || clean.length < 7 || !/[\d]{7,}/.test(clean)) return null;
        const keys = normalizePhoneKeys(clean);
        const canonical = keys.find((k) => /^07\d{9}$/.test(k)) || keys.find((k) => /^\+964\d+$/.test(k)) || clean.replace(/\s+/g, "");
        let existingKey = null;
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
            telegramChatId: "",
            telegramUsername: "",
            protected: false
          });
        }
        return phoneMap.get(useKey);
      };
      const pushPhoneSource = (pEntry, kind, key, label) => {
        if (!pEntry.sources.some((s) => s.key === key && s.kind === kind)) {
          pEntry.sources.push({ kind, key, label });
        }
      };
      let totalBytes = 0;
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith("telegram_users_db/")) continue;
        let safeRawValue = value;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          if (key.startsWith("accounts/") || key.startsWith("staff/")) {
            const { pw: _pw, passwordHash: _ph, ...restVal } = value;
            safeRawValue = {
              ...restVal,
              hasPassword: Boolean(_pw || _ph)
            };
          } else if (key === "settings/telegram_config") {
            const cfg = value;
            safeRawValue = {
              ...cfg,
              botTokenOverride: cfg.botTokenOverride ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : ""
            };
          }
        }
        let jsonStr = "";
        try {
          jsonStr = JSON.stringify(safeRawValue);
        } catch {
          jsonStr = String(safeRawValue);
        }
        const sizeBytes = Buffer.byteLength(jsonStr, "utf8");
        totalBytes += sizeBytes;
        const rec = value && typeof value === "object" ? value : {};
        let summary = "";
        if (key.startsWith("accounts/")) {
          const id = key.slice("accounts/".length);
          const isProtected = id === PROTECTED_OWNER_ACCOUNT_ID || id === "acc_menu_demo";
          const linkedTg = findTgForPhoneCandidates([rec.phone, rec.ph, rec.projectPhone, rec.em, rec.username]);
          const accName = String(rec.projectName || rec.n || rec.phone || rec.em || rec.username || id);
          const item = {
            key,
            id,
            name: accName,
            phone: String(rec.phone || rec.ph || ""),
            projectPhone: String(rec.projectPhone || ""),
            email: String(rec.em || rec.email || ""),
            rid: String(rec.rid || ""),
            role: rec.admin === true || rec.r === "admin" ? "admin" : "partner",
            active: rec.active !== false,
            authMethod: String(rec.authMethod || "password"),
            telegramLinked: Boolean(linkedTg || rec.telegramVerified),
            telegramChatId: String(linkedTg?.chatId || rec.telegramChatId || ""),
            createdAt: String(rec.created || rec.createdAt || ""),
            protected: isProtected,
            raw: safeRawValue
          };
          accounts.push(item);
          summary = accName;
          for (const candidate of [rec.phone, rec.ph, rec.projectPhone, rec.em, rec.username, rec.e, rec.u]) {
            addPlatformPhoneLabel(candidate, accName);
            const pEntry = ensurePhoneEntry(candidate);
            if (pEntry) {
              pushPhoneSource(pEntry, "account", key, `\u062D\u0633\u0627\u0628: ${accName}`);
              if (id === PROTECTED_OWNER_ACCOUNT_ID) pEntry.protected = true;
            }
          }
        } else if (key.startsWith("staff/")) {
          const id = key.slice("staff/".length);
          const stName = String(rec.name || rec.email || rec.phone || id);
          staff.push({
            key,
            id,
            name: stName,
            phone: String(rec.phone || ""),
            email: String(rec.email || ""),
            roleTitle: String(rec.roleTitle || "\u0645\u0648\u0638\u0641"),
            active: rec.active !== false,
            createdAt: String(rec.createdAt || ""),
            raw: safeRawValue
          });
          summary = stName;
          for (const candidate of [rec.phone, rec.email]) {
            addPlatformPhoneLabel(candidate, `\u0645\u0648\u0638\u0641: ${stName}`);
            const pEntry = ensurePhoneEntry(candidate);
            if (pEntry) {
              pushPhoneSource(pEntry, "staff", key, `\u0645\u0648\u0638\u0641: ${stName}`);
            }
          }
        } else if (key.startsWith("restaurants/") && !key.slice("restaurants/".length).includes("/")) {
          const id = key.slice("restaurants/".length);
          const restName = String(rec.n || id);
          restaurants.push({
            key,
            id,
            name: restName,
            owner: String(rec.ow || ""),
            phone: String(rec.ph || ""),
            slug: String(rec.slug || rec.subdomain || ""),
            projectType: String(rec.projectType || "restaurant"),
            planName: String(rec.p || "\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0627\u0642\u062A\u0635\u0627\u062F\u064A\u0629"),
            planId: String(rec.planId || "starter"),
            active: rec.a !== 0,
            done: Number(rec.done || 0),
            isPaid: Boolean(rec.isPaid),
            expiresAt: String(rec.e || ""),
            createdAt: String(rec.createdAt || ""),
            catsCount: catsCountByRid.get(id) || 0,
            itemsCount: itemsCountByRid.get(id) || 0,
            ordersCount: ordersCountByRid.get(id) || 0,
            protected: id === "demo",
            raw: rec
          });
          summary = restName;
          for (const candidate of [rec.ph, rec.ow]) {
            addPlatformPhoneLabel(candidate, `\u0645\u0634\u0631\u0648\u0639: ${restName}`);
            const pEntry = ensurePhoneEntry(candidate);
            if (pEntry) {
              pushPhoneSource(pEntry, "restaurant", key, `\u0645\u0634\u0631\u0648\u0639: ${restName}`);
            }
          }
        } else if (key.startsWith("cats/")) {
          const id = key.slice("cats/".length);
          const rid = String(rec.rid || "");
          categories.push({
            key,
            id,
            rid,
            restaurantName: restNameByRid.get(rid) || rid || "\u2014",
            name: String(rec.n || id),
            extra: rec.published === false ? "\u0645\u062E\u0641\u064A" : "\u0638\u0627\u0647\u0631",
            raw: rec
          });
          summary = String(rec.n || id);
        } else if (key.startsWith("items/")) {
          const id = key.slice("items/".length);
          const rid = String(rec.rid || "");
          items.push({
            key,
            id,
            rid,
            restaurantName: restNameByRid.get(rid) || rid || "\u2014",
            name: String(rec.n || id),
            extra: `${Number(rec.pr ?? 0).toLocaleString("en-US")} \u062F.\u0639`,
            raw: rec
          });
          summary = `${String(rec.n || id)} (${String(rec.pr ?? 0)})`;
        } else if (key.startsWith("orders/")) {
          const id = key.slice("orders/".length);
          const rid = String(rec.rid || "");
          orders.push({
            key,
            id,
            rid,
            restaurantName: restNameByRid.get(rid) || rid || "\u2014",
            customerName: String(rec.cn || rec.customerName || "\u0632\u0628\u0648\u0646"),
            customerPhone: String(rec.cp || rec.customerPhone || ""),
            total: Number(rec.tot ?? rec.total ?? 0),
            status: String(rec.st || rec.status || "new"),
            createdAt: String(rec.at || rec.createdAt || ""),
            raw: rec
          });
          summary = `${String(rec.cn || rec.customerName || "\u0637\u0644\u0628")} \u2014 ${String(rec.tot ?? 0)}`;
        } else if (key.startsWith("logs/")) {
          const id = key.slice("logs/".length);
          auditLogs.push({
            key,
            id,
            ts: Number(rec.ts || rec.at || 0),
            actor: String(rec.actor || ""),
            action: String(rec.action || id),
            details: String(rec.details || ""),
            type: String(rec.type || "system")
          });
          summary = `${String(rec.action || id)} (${String(rec.actor || "")})`;
        } else if (key.startsWith("user_sessions/")) {
          const id = key.slice("user_sessions/".length);
          const sidVal = String(rec.sid || id);
          userSessions.push({
            key,
            sid: sidVal,
            role: String(rec.role || "partner"),
            name: String(rec.name || ""),
            phone: String(rec.phone || rec.email || ""),
            rid: String(rec.rid || ""),
            createdAt: rec.createdAt ? new Date(Number(rec.createdAt)).toISOString() : "",
            expiresAt: rec.expiresAt ? new Date(Number(rec.expiresAt)).toISOString() : "",
            isCurrent: Boolean(req.authSession?.sid && req.authSession.sid === sidVal)
          });
          summary = `${String(rec.role || "session")} \u2014 ${String(rec.phone || rec.email || rec.rid || id)}`;
        } else if (key.startsWith("telegram_otp_sessions/")) {
          continue;
        } else {
          summary = key.startsWith("settings/") ? key === "settings/telegram_config" ? "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0628\u0648\u062A \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645" : "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0646\u0635\u0629" : key.startsWith("migrations/") ? "\u0633\u062C\u0644 \u062A\u0631\u062D\u064A\u0644 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A" : key.startsWith("notes/") ? `\u0645\u0644\u0627\u062D\u0638\u0629: ${String(rec.title || key)}` : key;
          settingsAndSystem.push({
            key,
            prefix: key.includes("/") ? `${key.split("/")[0]}/` : key,
            sizeBytes,
            summary,
            value: safeRawValue
          });
        }
        rawRecords.push({
          key,
          prefix: key.includes("/") ? `${key.split("/")[0]}/` : key,
          sizeBytes,
          summary,
          protected: key === `accounts/${PROTECTED_OWNER_ACCOUNT_ID}` || key === "restaurants/demo" || key === "settings/telegram_config" || Boolean(req.authSession?.sid && key === `user_sessions/${req.authSession.sid}`),
          value: safeRawValue
        });
      }
      const formattedTelegramUsers = tgUsers.map((tu) => {
        const pEntry = ensurePhoneEntry(tu.phone || tu.normalizedPhone);
        if (pEntry) {
          pushPhoneSource(pEntry, "telegram", `telegram/${tu.normalizedPhone || tu.phone}`, "\u0645\u0648\u062B\u0642 \u0641\u064A \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645");
          pEntry.telegramLinked = true;
          pEntry.telegramChatId = String(tu.chatId || "");
          pEntry.telegramUsername = tu.username || "";
        }
        const linkedLabels = /* @__PURE__ */ new Set();
        for (const pk of normalizePhoneKeys(tu.phone || tu.normalizedPhone)) {
          for (const lbl of platformLinkedPhones.get(pk) || []) {
            linkedLabels.add(lbl);
          }
        }
        return {
          phone: tu.phone,
          normalizedPhone: tu.normalizedPhone || "",
          chatId: String(tu.chatId || ""),
          username: tu.username || "",
          firstName: tu.firstName || "",
          linkedAt: tu.linkedAt ? new Date(tu.linkedAt).toISOString() : "",
          lastSentAt: tu.lastSentAt ? new Date(tu.lastSentAt).toISOString() : "",
          hasPlatformAccount: linkedLabels.size > 0,
          linkedAccountNames: Array.from(linkedLabels)
        };
      });
      auditLogs.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
      userSessions.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      rawRecords.sort((a, b) => a.key.localeCompare(b.key));
      const phonesIndex = Array.from(phoneMap.values()).map((p) => ({
        phone: p.phone,
        sources: p.sources,
        telegramLinked: p.telegramLinked,
        telegramChatId: p.telegramChatId,
        telegramUsername: p.telegramUsername,
        protected: p.protected
      }));
      return res.json({
        success: true,
        meta: {
          driver: isSupabaseConfigured() ? "supabase" : "file-memory",
          connected: true,
          supabaseConfigured: isSupabaseConfigured(),
          supabaseConnected: isSupabaseConfigured(),
          totalKvRecords: rawRecords.length,
          totalBytes,
          fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
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
          settingsAndSystem: settingsAndSystem.length
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
          rawRecords
        }
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
      });
    }
  });
  router.delete("/api/admin/database/record", requireAdminOrStaff("canManageDatabase"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const key = String(req.body?.key || req.query.key || "").trim();
      const cascade = req.body?.cascade === true || req.query.cascade === "true";
      if (!key || !isSafeStoreKey(key)) {
        return res.status(400).json({ success: false, error: "\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      if (key === `accounts/${PROTECTED_OWNER_ACCOUNT_ID}`) {
        return res.status(403).json({ success: false, error: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0624\u0633\u0633 \u0627\u0644\u0631\u0626\u064A\u0633\u064A" });
      }
      if (req.authSession?.sid && key === `user_sessions/${req.authSession.sid}`) {
        return res.status(400).json({ success: false, error: "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u062D\u0630\u0641 \u062C\u0644\u0633\u0629 \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644\u0643 \u0627\u0644\u062D\u0627\u0644\u064A\u0629" });
      }
      const allData = await readAll(true);
      const targetVal = allData[key];
      const deletedExtra = [];
      if (isReservedInternalKey(key)) {
        await deleteInternalStoreItem(key);
      } else {
        await deleteRecordPhysicallyFromStore(key);
      }
      if (cascade && targetVal && typeof targetVal === "object") {
        if (key.startsWith("accounts/") || key.startsWith("restaurants/")) {
          const rid = key.startsWith("restaurants/") ? key.slice("restaurants/".length) : String(targetVal.rid || "");
          const accId = key.startsWith("accounts/") ? key.slice("accounts/".length) : "";
          if (rid && rid !== "demo") {
            if (key.startsWith("accounts/") && allData[`restaurants/${rid}`]) {
              await deleteRecordPhysicallyFromStore(`restaurants/${rid}`);
              deletedExtra.push(`restaurants/${rid}`);
            }
            for (const [k, v] of Object.entries(allData)) {
              if (!v || typeof v !== "object") continue;
              const rec = v;
              if ((k.startsWith("cats/") || k.startsWith("items/") || k.startsWith("orders/")) && String(rec.rid || "") === rid) {
                await deleteRecordPhysicallyFromStore(k);
                deletedExtra.push(k);
              } else if (k.startsWith("accounts/") && String(rec.rid || "") === rid && k !== key && k !== `accounts/${PROTECTED_OWNER_ACCOUNT_ID}`) {
                await deleteRecordPhysicallyFromStore(k);
                deletedExtra.push(k);
              }
            }
            await clearAuthSessionsByTarget(rid, accId || void 0).catch(() => {
            });
          }
        }
      }
      await appendDbAuditLog(
        req,
        "\u062D\u0630\u0641 \u0633\u062C\u0644 \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A",
        `\u0627\u0644\u0645\u0641\u062A\u0627\u062D: ${key}${deletedExtra.length > 0 ? ` (+${deletedExtra.length} \u0633\u062C\u0644 \u0645\u0631\u062A\u0628\u0637)` : ""}`,
        "system"
      );
      return res.json({
        success: true,
        deletedKey: key,
        deletedKeys: [key, ...deletedExtra],
        deletedCount: 1 + deletedExtra.length,
        deletedExtraCount: deletedExtra.length
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0633\u062C\u0644"
      });
    }
  });
  router.put("/api/admin/database/record", requireAdminOrStaff("canManageDatabase"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const key = String(req.body?.key || "").trim();
      const value = req.body?.value;
      if (!key || !isSafeStoreKey(key) || isReservedInternalKey(key)) {
        return res.status(400).json({ success: false, error: "\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D \u0623\u0648 \u0645\u062D\u062C\u0648\u0632" });
      }
      if (value === void 0) {
        return res.status(400).json({ success: false, error: "\u0642\u064A\u0645\u0629 \u0627\u0644\u0633\u062C\u0644 \u0645\u0637\u0644\u0648\u0628\u0629" });
      }
      const saved = await upsertRecordInStore(key, value);
      if (!saved.ok) {
        return res.status(502).json({ success: false, error: saved.error || "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0633\u062C\u0644" });
      }
      await appendDbAuditLog(req, "\u062A\u0639\u062F\u064A\u0644 \u0633\u062C\u0644 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A", `\u0627\u0644\u0645\u0641\u062A\u0627\u062D: ${key}`, "system");
      return res.json({ success: true, key, source: saved.source });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0633\u062C\u0644"
      });
    }
  });
  router.delete("/api/admin/database/phone/:phone", requireAdminOrStaff("canManageDatabase"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const phone = decodeURIComponent(String(req.params.phone || "")).trim();
      const phoneKeys = new Set(normalizePhoneKeys(phone));
      if (phoneKeys.size === 0) {
        return res.status(400).json({ success: false, error: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      const matches = (val) => typeof val === "string" && val.trim() !== "" && normalizePhoneKeys(val).some((k) => phoneKeys.has(k));
      const allData = await readAll(true);
      const deletedKeys = [];
      const updatedRests = {};
      for (const [k, v] of Object.entries(allData)) {
        if (!v || typeof v !== "object") continue;
        const rec = v;
        if (k.startsWith("accounts/")) {
          const id = k.slice("accounts/".length);
          if (id === PROTECTED_OWNER_ACCOUNT_ID || rec.admin === true || rec.r === "admin") continue;
          if (matches(rec.phone) || matches(rec.projectPhone) || matches(rec.em) || matches(rec.username) || matches(rec.e) || matches(rec.u)) {
            await deleteRecordPhysicallyFromStore(k);
            deletedKeys.push(k);
            if (rec.rid && rec.rid !== "demo") {
              await clearAuthSessionsByTarget(String(rec.rid), id).catch(() => {
              });
            }
          }
        } else if (k.startsWith("staff/")) {
          if (matches(rec.phone) || matches(rec.email)) {
            await deleteRecordPhysicallyFromStore(k);
            deletedKeys.push(k);
          }
        } else if (k.startsWith("restaurants/") && !k.slice("restaurants/".length).includes("/")) {
          if (matches(rec.ph) || matches(rec.ow)) {
            const nextR = {
              ...rec,
              ...matches(rec.ph) ? { ph: "" } : {},
              ...matches(rec.ow) ? { ow: "" } : {}
            };
            updatedRests[k] = nextR;
          }
        } else if (k.startsWith("user_sessions/") && matches(rec.phone)) {
          if (req.authSession?.sid && k === `user_sessions/${req.authSession.sid}`) continue;
          await deleteInternalStoreItem(k).catch(() => {
          });
          deletedKeys.push(k);
        }
      }
      if (Object.keys(updatedRests).length > 0) {
        await applyChanges({ put: updatedRests }, false);
      }
      await deleteTelegramUserByPhone(phone).catch(() => {
      });
      await appendDbAuditLog(
        req,
        "\u062D\u0630\u0641 \u0631\u0642\u0645 \u0645\u0646 \u062C\u0630\u0648\u0631\u0647",
        `\u0627\u0644\u0631\u0642\u0645: ${phone} \xB7 \u0627\u0644\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0645\u062D\u0630\u0648\u0641\u0629: ${deletedKeys.length}`,
        "system"
      );
      return res.json({
        success: true,
        phone,
        deletedKeysCount: deletedKeys.length,
        clearedRestaurantsCount: Object.keys(updatedRests).length
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0631\u0642\u0645 \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A"
      });
    }
  });
  router.delete("/api/admin/database/telegram-user/:phone", requireAdminOrStaff("canManageDatabase"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const phone = decodeURIComponent(String(req.params.phone || "")).trim();
      if (!phone) return res.status(400).json({ success: false, error: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0645\u0637\u0644\u0648\u0628" });
      await deleteTelegramUserByPhone(phone);
      await appendDbAuditLog(req, "\u062D\u0630\u0641 \u0631\u0628\u0637 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645", `\u0627\u0644\u0631\u0642\u0645: ${phone}`, "system");
      return res.json({ success: true, phone });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0631\u0628\u0637 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645"
      });
    }
  });
  router.post("/api/admin/database/bulk-delete", requireAdminOrStaff("canManageDatabase"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const rawKeys = Array.isArray(req.body?.keys) ? req.body.keys : [];
      const keys = rawKeys.map((k) => String(k || "").trim()).filter((k) => isSafeStoreKey(k) && k !== `accounts/${PROTECTED_OWNER_ACCOUNT_ID}`);
      if (keys.length === 0) {
        return res.status(400).json({ success: false, error: "\u0644\u0645 \u064A\u062A\u0645 \u062A\u062D\u062F\u064A\u062F \u0633\u062C\u0644\u0627\u062A \u0635\u0627\u0644\u062D\u0629 \u0644\u0644\u062D\u0630\u0641" });
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
      await appendDbAuditLog(req, "\u062D\u0630\u0641 \u062C\u0645\u0627\u0639\u064A \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A", `\u062A\u0645 \u062D\u0630\u0641 ${deletedCount} \u0633\u062C\u0644`, "system");
      return res.json({
        success: true,
        deletedCount,
        deletedKeys: keys,
        skippedKeys: []
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062D\u0630\u0641 \u0627\u0644\u062C\u0645\u0627\u0639\u064A"
      });
    }
  });
  router.get("/api/admin/telegram/settings", requireAdminOrStaff("canManageSettings"), async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const config = await getAdminTelegramConfig();
      return res.json({ success: true, config });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645"
      });
    }
  });
  router.put("/api/admin/telegram/settings", requireAdminOrStaff("canManageSettings"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const body = req.body || {};
      const config = await updateAdminTelegramConfig({
        enabled: body.enabled !== false,
        botUsername: typeof body.botUsername === "string" ? body.botUsername : void 0,
        botTokenOverride: typeof body.botTokenOverride === "string" ? body.botTokenOverride : void 0,
        clearTokenOverride: body.clearTokenOverride === true,
        proxyUrl: typeof body.proxyUrl === "string" ? body.proxyUrl : void 0,
        welcomeSharePhoneText: typeof body.welcomeSharePhoneText === "string" ? body.welcomeSharePhoneText : void 0,
        verifiedSuccessText: typeof body.verifiedSuccessText === "string" ? body.verifiedSuccessText : void 0,
        orderHeaderText: typeof body.orderHeaderText === "string" ? body.orderHeaderText : void 0,
        orderFooterText: typeof body.orderFooterText === "string" ? body.orderFooterText : void 0
      });
      await appendDbAuditLog(req, "\u062A\u062D\u062F\u064A\u062B \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0628\u0648\u062A \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645", `\u0627\u0644\u0645\u0639\u0631\u0641: @${config.botUsername}`, "system");
      return res.json({ success: true, config });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645"
      });
    }
  });
  router.post("/api/admin/telegram/test-connection", requireAdminOrStaff("canManageSettings"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const customToken = typeof req.body?.botToken === "string" ? req.body.botToken : void 0;
      const result = await testTelegramBotConnection(customToken);
      return res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0628\u0648\u062A"
      });
    }
  });
  router.post("/api/admin/telegram/send-test", requireAdminOrStaff("canManageSettings"), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const target = String(req.body?.target || "").trim();
      const message = typeof req.body?.message === "string" ? req.body.message : void 0;
      const result = await sendTelegramTestMessage(target, message);
      return res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        message: err instanceof Error ? err.message : "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629"
      });
    }
  });
  return router;
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path5.dirname(__filename);
var app = express2();
var rawPort = String(process.env.PORT || "3000").trim();
var PORT = /^\d+$/.test(rawPort) ? Number(rawPort) : rawPort;
var isProduction = process.env.NODE_ENV === "production" || __filename.endsWith(".js");
var BASE_DOMAIN = String(process.env.BASE_DOMAIN || "menuplus.io").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "menuplus.io";
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use((req, _res, next) => {
  if (req.url.startsWith("//")) {
    req.url = req.url.replace(/^\/{2,}/, "/");
  }
  next();
});
app.use(express2.json({ limit: "15mb" }));
app.use(express2.urlencoded({ extended: true, limit: "15mb" }));
var COMPRESSIBLE_CONTENT_TYPE_RE = /^(text\/|application\/(?:json|javascript|ecmascript|xml|manifest\+json)|image\/svg\+xml)/i;
app.use((req, res, next) => {
  if (req.method === "HEAD") return next();
  const acceptEncoding = String(req.headers["accept-encoding"] || "");
  if (!/\bgzip\b/i.test(acceptEncoding)) return next();
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  let decided = false;
  let gzipStream = null;
  const canCompressResponse = () => {
    if (res.statusCode < 200 || res.statusCode === 204 || res.statusCode === 304) return false;
    if (res.getHeader("Content-Encoding")) return false;
    const cacheControl = String(res.getHeader("Cache-Control") || "");
    if (cacheControl.includes("no-transform")) return false;
    const ct = String(res.getHeader("Content-Type") || "");
    return COMPRESSIBLE_CONTENT_TYPE_RE.test(ct);
  };
  const enableGzipHeaders = () => {
    res.removeHeader("Content-Length");
    res.setHeader("Content-Encoding", "gzip");
    const prevVary = String(res.getHeader("Vary") || "");
    if (!/\baccept-encoding\b/i.test(prevVary)) {
      res.setHeader("Vary", prevVary ? `${prevVary}, Accept-Encoding` : "Accept-Encoding");
    }
  };
  const toBuffer = (chunk, encoding) => {
    if (Buffer.isBuffer(chunk)) return chunk;
    if (typeof chunk === "string") return Buffer.from(chunk, encoding || "utf8");
    if (chunk instanceof Uint8Array) return Buffer.from(chunk);
    return Buffer.from(String(chunk), encoding || "utf8");
  };
  res.write = function(chunk, encodingOrCb, cb) {
    const encoding = typeof encodingOrCb === "string" ? encodingOrCb : void 0;
    const callback = typeof encodingOrCb === "function" ? encodingOrCb : cb;
    if (!decided) {
      decided = true;
      if (canCompressResponse()) {
        enableGzipHeaders();
        gzipStream = zlib.createGzip({ level: 6 });
        gzipStream.on("data", (compressedChunk) => {
          origWrite(compressedChunk);
        });
        gzipStream.on("error", () => {
          gzipStream = null;
        });
      }
    }
    if (gzipStream) {
      return gzipStream.write(chunk, encoding, callback);
    }
    return origWrite(chunk, encodingOrCb, cb);
  };
  res.end = function(chunkOrCb, encodingOrCb, cb) {
    const hasChunk = chunkOrCb !== void 0 && chunkOrCb !== null && typeof chunkOrCb !== "function";
    const encoding = typeof encodingOrCb === "string" ? encodingOrCb : void 0;
    const callback = typeof chunkOrCb === "function" ? chunkOrCb : typeof encodingOrCb === "function" ? encodingOrCb : cb;
    if (!decided) {
      decided = true;
      if (hasChunk && canCompressResponse()) {
        const buf = toBuffer(chunkOrCb, encoding);
        if (buf.length >= 1024) {
          enableGzipHeaders();
          zlib.gzip(buf, { level: 6 }, (err, compressed) => {
            if (err || !compressed) {
              origEnd(buf, callback);
              return;
            }
            if (!res.headersSent) {
              res.setHeader("Content-Length", String(compressed.length));
            }
            origEnd(compressed, callback);
          });
          return res;
        }
      }
      return origEnd(chunkOrCb, encodingOrCb, cb);
    }
    if (gzipStream) {
      const gs = gzipStream;
      gzipStream = null;
      gs.once("end", () => {
        origEnd(callback);
      });
      if (hasChunk) {
        gs.end(chunkOrCb, encoding);
      } else {
        gs.end();
      }
      return res;
    }
    return origEnd(chunkOrCb, encodingOrCb, cb);
  };
  next();
});
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=()");
  const origin = String(req.headers.origin || "").trim();
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.toLowerCase();
      if (originHost === BASE_DOMAIN || originHost.endsWith(`.${BASE_DOMAIN}`) || originHost === "localhost" || originHost.endsWith(".localhost")) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Id, X-Admin-Key");
      }
    } catch {
    }
  }
  next();
});
var otpRateWindowMs = 6e4;
var otpRateMaxRequests = 25;
var otpRateBuckets = /* @__PURE__ */ new Map();
var loginRateMaxRequests = 20;
var loginRateBuckets = /* @__PURE__ */ new Map();
var otpCleanupTimer = setInterval(() => {
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
function otpRateLimiter(req, res, next) {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const cutoff = now - otpRateWindowMs;
  const recent = (otpRateBuckets.get(clientIp) || []).filter((ts) => ts > cutoff);
  if (recent.length >= otpRateMaxRequests) {
    return res.status(429).json({
      success: false,
      error: "\u0637\u0644\u0628\u0627\u062A \u0643\u062B\u064A\u0631\u0629 \u062C\u062F\u0627\u064B\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u062F\u0642\u064A\u0642\u0629 \u0648\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649."
    });
  }
  recent.push(now);
  otpRateBuckets.set(clientIp, recent);
  return next();
}
function loginRateLimiter(req, res, next) {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const cutoff = now - otpRateWindowMs;
  const recent = (loginRateBuckets.get(clientIp) || []).filter((ts) => ts > cutoff);
  if (recent.length >= loginRateMaxRequests) {
    return res.status(429).json({
      ok: false,
      error: "\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u062F\u062E\u0648\u0644 \u0643\u062B\u064A\u0631\u0629 \u062C\u062F\u0627\u064B\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u062F\u0642\u064A\u0642\u0629 \u0648\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649."
    });
  }
  recent.push(now);
  loginRateBuckets.set(clientIp, recent);
  return next();
}
app.use(attachAuthSession);
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    status: "healthy",
    env: isProduction ? "production" : "development",
    uptime: Math.round(process.uptime())
  });
});
function sanitizeRecordSecrets(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  const copy = { ...record };
  if ("telegramChatId" in copy || "telegramPhone" in copy || "telegramLinked" in copy) {
    const hasChat = Boolean(String(copy.telegramChatId || "").trim());
    const hasPhone = Boolean(String(copy.telegramPhone || "").trim()) && copy.telegramUnlinkedManually !== true;
    copy.telegramLinked = hasChat || hasPhone || Boolean(copy.telegramLinked);
  }
  delete copy.pw;
  delete copy.passwordHash;
  delete copy.jwtToken;
  delete copy.telegramChatId;
  return copy;
}
function getOwnedPartnerRids(allData, ownerRid) {
  const owned = /* @__PURE__ */ new Set();
  if (!ownerRid) return owned;
  owned.add(ownerRid);
  for (const [k, v] of Object.entries(allData)) {
    if (!k.startsWith("restaurants/") || k.slice("restaurants/".length).includes("/")) continue;
    const rec = v;
    if (rec && String(rec.parentRid || "") === ownerRid) {
      owned.add(k.slice("restaurants/".length));
    }
  }
  return owned;
}
function collectTakenSlugsFromAllData(allData, excludeRid) {
  const taken = /* @__PURE__ */ new Set();
  for (const [k, v] of Object.entries(allData)) {
    if (!k.startsWith("restaurants/") || k.slice("restaurants/".length).includes("/") || !v || typeof v !== "object") {
      continue;
    }
    const rid = k.slice("restaurants/".length);
    if (excludeRid && rid === excludeRid) continue;
    const rec = v;
    const s1 = sanitizeSubdomainValue(String(rec.slug || ""));
    const s2 = sanitizeSubdomainValue(String(rec.subdomain || ""));
    if (s1) taken.add(s1);
    if (s2) taken.add(s2);
  }
  return taken;
}
function todayIsoDate2() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
app.get("/api/db", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const allData = await readAll(false);
    const ses = req.authSession;
    const out = {};
    if (ses?.admin) {
      const perms = ses.role === "owner" || !ses.staffId ? FULL_OWNER_PERMISSIONS : { ...FULL_OWNER_PERMISSIONS, ...req.authPermissions };
      for (const [k, v] of Object.entries(allData)) {
        if (k.startsWith("accounts/")) {
          if (perms.canManageRestaurants || ses.accountId === k.slice("accounts/".length)) {
            out[k] = sanitizeRecordSecrets(v);
          }
        } else if (k.startsWith("staff/")) {
          if (perms.canManageStaff || ses.staffId === k.slice("staff/".length)) {
            out[k] = sanitizeRecordSecrets(v);
          }
        } else if (k.startsWith("notes/")) {
          if (perms.canUseNotes) {
            out[k] = v;
          }
        } else if (k.startsWith("reports/")) {
          if (perms.canViewReports !== false) {
            out[k] = v;
          }
        } else if (k.startsWith("finance_expenses/") || k.startsWith("finance_profits/") || k === "settings/finance") {
          if (perms.canManageFinance) {
            out[k] = v;
          }
        } else if (k.startsWith("custom_font_files/")) {
          continue;
        } else {
          out[k] = sanitizeRecordSecrets(v);
        }
      }
      return res.json(out);
    }
    if (ses && ses.role === "partner") {
      const ownerRid = ses.personalRid || ses.rid;
      const ownedRids = getOwnedPartnerRids(allData, ownerRid);
      for (const [k, v] of Object.entries(allData)) {
        if (k.startsWith("settings/") && k !== "settings/finance" || k.startsWith("restaurants/") || k.startsWith("cats/") || k.startsWith("items/") || k === "initialized_v6" || k.startsWith("migrations/")) {
          out[k] = sanitizeRecordSecrets(v);
        } else if (k.startsWith("orders/") || k.startsWith("reports/")) {
          const rec = v;
          if (rec && ownedRids.has(String(rec.rid || ""))) {
            out[k] = sanitizeRecordSecrets(v);
          }
        } else if (ses.accountId && k === `accounts/${ses.accountId}`) {
          out[k] = sanitizeRecordSecrets(v);
        }
      }
      return res.json(out);
    }
    for (const [k, v] of Object.entries(allData)) {
      if (k.startsWith("settings/") && k !== "settings/finance" || k.startsWith("restaurants/") || k.startsWith("cats/") || k.startsWith("items/") || k === "initialized_v6" || k.startsWith("migrations/")) {
        out[k] = sanitizeRecordSecrets(v);
      }
    }
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Database error" });
  }
});
app.post("/api/db", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Invalid database payload" });
    }
    const payload = body;
    const allData = await readAll(false);
    const ses = req.authSession || null;
    const filteredPut = {};
    const filteredDel = [];
    const checkKeyWritable = (key, val, isDelete) => {
      if (!isSafeStoreKey(key)) return false;
      if (!ses) {
        if (isDelete || !key.startsWith("orders/")) return false;
        if (Object.prototype.hasOwnProperty.call(allData, key)) return false;
        if (!val || typeof val !== "object" || Array.isArray(val)) return false;
        const ord = val;
        const rid = String(ord.rid || "").trim();
        if (!rid || !allData[`restaurants/${rid}`]) return false;
        const tot = Number(ord.tot ?? ord.total ?? 0);
        if (!Number.isFinite(tot) || tot < 0) return false;
        return true;
      }
      if (!ses.admin) {
        const ownerRid = ses.personalRid || ses.rid;
        const ownedRids = getOwnedPartnerRids(allData, ownerRid);
        if (key.startsWith("restaurants/") && !key.slice("restaurants/".length).includes("/")) {
          const rid = key.slice("restaurants/".length);
          if (isDelete) {
            return rid !== ownerRid && ownedRids.has(rid);
          }
          if (!val || typeof val !== "object" || Array.isArray(val)) return false;
          const existing = allData[key];
          const nextObj = { ...val };
          const plansList = extractPlansList(allData["settings/plans"]);
          const subRules = normalizeSubdomainRules(allData["settings/site"] || null);
          const takenSlugs = collectTakenSlugsFromAllData(allData, rid);
          if (existing) {
            if (!ownedRids.has(rid)) return false;
            nextObj.planId = existing.planId;
            nextObj.p = existing.p;
            nextObj.e = existing.e;
            nextObj.isPaid = existing.isPaid;
            nextObj.a = existing.a;
            if (existing.parentRid) nextObj.parentRid = existing.parentRid;
            if (existing.isBranch !== void 0) nextObj.isBranch = existing.isBranch;
            if (!nextObj.telegramChatId && existing.telegramChatId) nextObj.telegramChatId = existing.telegramChatId;
            if (!nextObj.telegramPhone && existing.telegramPhone) nextObj.telegramPhone = existing.telegramPhone;
            if (!nextObj.telegramUsername && existing.telegramUsername) nextObj.telegramUsername = existing.telegramUsername;
            if (nextObj.orderChannel === "both" || nextObj.orderChannel === "telegram" || nextObj.orderChannel === "whatsapp") {
              nextObj.telegramNotificationsEnabled = nextObj.orderChannel !== "whatsapp";
            } else if (existing.orderChannel) {
              nextObj.orderChannel = existing.orderChannel;
            }
            if (nextObj.telegramNotificationsEnabled === void 0 && existing.telegramNotificationsEnabled !== void 0) {
              nextObj.telegramNotificationsEnabled = existing.telegramNotificationsEnabled;
            }
            const { isPaid } = isPaidPlanForRestaurant(existing, plansList);
            const existingSlug = sanitizeSubdomainValue(String(existing.slug || ""));
            const requestedSlug = sanitizeSubdomainValue(String(nextObj.slug || ""));
            if (!isPaid) {
              nextObj.slug = existingSlug && isValidSixCharCode(existingSlug) && !takenSlugs.has(existingSlug) ? existingSlug : existingSlug || generateUniqueMenuCode(takenSlugs);
              nextObj.subdomain = "";
            } else if (requestedSlug && requestedSlug !== existingSlug) {
              const check = validatePathSlugFormat(requestedSlug, subRules);
              if (check.valid && !takenSlugs.has(requestedSlug)) {
                nextObj.slug = requestedSlug;
                nextObj.subdomain = subRules.enabled ? requestedSlug : "";
              } else {
                nextObj.slug = existingSlug || generateUniqueMenuCode(takenSlugs);
                nextObj.subdomain = subRules.enabled ? String(nextObj.slug) : "";
              }
            } else {
              nextObj.slug = existingSlug || generateUniqueMenuCode(takenSlugs);
              nextObj.subdomain = subRules.enabled ? String(nextObj.slug) : "";
            }
            filteredPut[key] = nextObj;
            return false;
          } else {
            if (!ownerRid || String(nextObj.parentRid || "") !== ownerRid) return false;
            const parentRest = allData[`restaurants/${ownerRid}`];
            if (!parentRest) return false;
            nextObj.parentRid = ownerRid;
            nextObj.isBranch = true;
            nextObj.planId = parentRest.planId;
            nextObj.p = parentRest.p;
            nextObj.e = parentRest.e;
            nextObj.isPaid = parentRest.isPaid;
            nextObj.a = parentRest.a;
            const { isPaid } = isPaidPlanForRestaurant(parentRest, plansList);
            const requestedSlug = sanitizeSubdomainValue(String(nextObj.slug || ""));
            const check = requestedSlug ? validatePathSlugFormat(requestedSlug, subRules) : { valid: false };
            if (isPaid && requestedSlug && check.valid && !takenSlugs.has(requestedSlug)) {
              nextObj.slug = requestedSlug;
              nextObj.subdomain = subRules.enabled ? requestedSlug : "";
            } else {
              nextObj.slug = generateUniqueMenuCode(takenSlugs);
              nextObj.subdomain = "";
            }
            filteredPut[key] = nextObj;
            return false;
          }
        }
        if (key.startsWith("cats/") || key.startsWith("items/") || key.startsWith("orders/")) {
          if (isDelete) {
            const existing = allData[key];
            return Boolean(existing && ownedRids.has(String(existing.rid || "")));
          }
          if (!val || typeof val !== "object" || Array.isArray(val)) return false;
          const rec = val;
          return ownedRids.has(String(rec.rid || ""));
        }
        if (key.startsWith("reports/")) {
          if (isDelete || Object.prototype.hasOwnProperty.call(allData, key)) return false;
          if (!val || typeof val !== "object" || Array.isArray(val)) return false;
          const rep = val;
          const rid = String(rep.rid || "").trim();
          const msg = String(rep.message || "").trim();
          return Boolean(rid && ownedRids.has(rid) && msg.length > 0);
        }
        if (key.startsWith("logs/") && !isDelete) {
          return true;
        }
        return false;
      }
      const perms = ses.role === "owner" || !ses.staffId ? FULL_OWNER_PERMISSIONS : { ...FULL_OWNER_PERMISSIONS, ...req.authPermissions };
      if (key === "settings/finance" || key.startsWith("finance_expenses/") || key.startsWith("finance_profits/")) {
        return Boolean(perms.canManageFinance);
      }
      if (key === "settings/plans") {
        return Boolean(perms.canManagePlans);
      }
      if (key === "settings/theme") {
        return Boolean(perms.canManageSettings || perms.canManageThemeMode || perms.canEditHomePage);
      }
      if (key.startsWith("settings/")) {
        return Boolean(perms.canManageSettings || perms.canEditTabLabels || perms.canReorderTabs || perms.canManageThemeMode || perms.canManageSubdomains || perms.canEditHomePage);
      }
      if (key === "restaurants/demo") {
        return Boolean(perms.canEditDemoMenu || perms.canManageRestaurants);
      }
      if (key.startsWith("restaurants/")) {
        if (isDelete) return Boolean(perms.canDeletePartner || perms.canManageRestaurants);
        if (!(perms.canManageRestaurants || perms.canEditDemoMenu)) return false;
        if (val && typeof val === "object" && !Array.isArray(val)) {
          const existing = allData[key];
          const nextObj = { ...val };
          if (existing) {
            if (!nextObj.telegramChatId && existing.telegramChatId) nextObj.telegramChatId = existing.telegramChatId;
            if (!nextObj.telegramPhone && existing.telegramPhone) nextObj.telegramPhone = existing.telegramPhone;
            if (!nextObj.telegramUsername && existing.telegramUsername) nextObj.telegramUsername = existing.telegramUsername;
            if (nextObj.orderChannel === "both" || nextObj.orderChannel === "telegram" || nextObj.orderChannel === "whatsapp") {
              nextObj.telegramNotificationsEnabled = nextObj.orderChannel !== "whatsapp";
            } else if (existing.orderChannel) {
              nextObj.orderChannel = existing.orderChannel;
            }
            if (nextObj.telegramNotificationsEnabled === void 0 && existing.telegramNotificationsEnabled !== void 0) {
              nextObj.telegramNotificationsEnabled = existing.telegramNotificationsEnabled;
            }
          }
          filteredPut[key] = nextObj;
          return false;
        }
        return true;
      }
      if (key.startsWith("cats/") || key.startsWith("items/")) {
        const rec = isDelete ? allData[key] : val;
        const targetRid = String(rec?.rid || "");
        if (targetRid === "demo") return Boolean(perms.canEditDemoMenu || perms.canManageRestaurants);
        return Boolean(perms.canManageRestaurants);
      }
      if (key.startsWith("orders/")) {
        return Boolean(perms.canManageRestaurants || perms.canViewAnalytics);
      }
      if (key.startsWith("accounts/")) {
        if (isDelete) return Boolean(perms.canDeletePartner && ses.role === "owner");
        if (ses.role !== "owner") return false;
        const existing = allData[key];
        if (val && typeof val === "object" && !Array.isArray(val)) {
          const nextObj = { ...val };
          if (!nextObj.pw && existing?.pw) nextObj.pw = existing.pw;
          filteredPut[key] = nextObj;
        }
        return false;
      }
      if (key.startsWith("staff/")) {
        if (!perms.canManageStaff) return false;
        if (!isDelete && val && typeof val === "object" && !Array.isArray(val)) {
          const existing = allData[key];
          const nextObj = { ...val };
          if (!nextObj.passwordHash && existing?.passwordHash) nextObj.passwordHash = existing.passwordHash;
          filteredPut[key] = nextObj;
          return false;
        }
        return true;
      }
      if (key.startsWith("notes/")) {
        return Boolean(perms.canUseNotes);
      }
      if (key.startsWith("reports/")) {
        return Boolean(perms.canViewReports !== false || perms.canManageRestaurants);
      }
      if (key.startsWith("logs/")) {
        return true;
      }
      if (key === "initialized_v6" || key.startsWith("migrations/")) {
        return Boolean(perms.canManageSettings || ses.role === "owner");
      }
      return false;
    };
    if (payload.put && typeof payload.put === "object" && !Array.isArray(payload.put)) {
      for (const [k, v] of Object.entries(payload.put)) {
        if (checkKeyWritable(k, v, false)) {
          filteredPut[k] = v;
        }
      }
    }
    if (Array.isArray(payload.del)) {
      for (const k of payload.del) {
        if (typeof k === "string" && checkKeyWritable(k, void 0, true)) {
          filteredDel.push(k);
        }
      }
    }
    const hasFilteredWrites = Object.keys(filteredPut).length > 0 || filteredDel.length > 0;
    const requestedWrites = (payload.put ? Object.keys(payload.put).length : 0) + (Array.isArray(payload.del) ? payload.del.length : 0);
    if (requestedWrites > 0 && !hasFilteredWrites) {
      return res.status(ses ? 403 : 401).json({
        ok: false,
        error: ses ? "\u0644\u064A\u0633\u062A \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0644\u062A\u0639\u062F\u064A\u0644 \u0647\u0630\u0647 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A." : "\u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0625\u062C\u0631\u0627\u0621 \u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629."
      });
    }
    const newOrderEvents = [];
    if (hasFilteredWrites) {
      const ridOrderSeqTracker = /* @__PURE__ */ new Map();
      const countStoreOrders = (targetRid) => {
        let count = 0;
        for (const [ak, av] of Object.entries(allData)) {
          if (ak.startsWith("orders/") && av && typeof av === "object" && !Array.isArray(av) && String(av.rid || "").trim() === targetRid) {
            count++;
          }
        }
        return count;
      };
      for (const [k, v] of Object.entries(filteredPut)) {
        if (k.startsWith("orders/") && !Object.prototype.hasOwnProperty.call(allData, k) && v && typeof v === "object" && !Array.isArray(v)) {
          const ord = v;
          const rid = String(ord.rid || "").trim();
          const currentRest = filteredPut[`restaurants/${rid}`] || allData[`restaurants/${rid}`];
          if (currentRest) {
            const baseCount = ridOrderSeqTracker.has(rid) ? ridOrderSeqTracker.get(rid) : Math.max(Number(currentRest.o || 0) || 0, countStoreOrders(rid));
            const nextSeq = baseCount + 1;
            ridOrderSeqTracker.set(rid, nextSeq);
            const updatedOrder = {
              ...ord,
              seq: nextSeq,
              orderSeq: nextSeq
            };
            filteredPut[k] = updatedOrder;
            const updatedRest = {
              ...currentRest,
              o: Math.max(Number(currentRest.o || 0) || 0, nextSeq)
            };
            filteredPut[`restaurants/${rid}`] = updatedRest;
            newOrderEvents.push({ rest: updatedRest, ord: updatedOrder, rid });
          }
        }
      }
    }
    const newReportEvents = [];
    if (hasFilteredWrites) {
      let maxReportSeq = 0;
      for (const [ak, av] of Object.entries(allData)) {
        if (ak.startsWith("reports/") && av && typeof av === "object" && !Array.isArray(av)) {
          const rec = av;
          const s = Number(rec.reportSeq || rec.seq || 0);
          if (Number.isFinite(s) && s > maxReportSeq) maxReportSeq = s;
        }
      }
      const existingReportsCount = Object.keys(allData).filter((ak) => ak.startsWith("reports/")).length;
      let nextReportSeqCursor = Math.max(maxReportSeq, existingReportsCount);
      for (const [k, v] of Object.entries(filteredPut)) {
        if (k.startsWith("reports/") && !Object.prototype.hasOwnProperty.call(allData, k) && v && typeof v === "object" && !Array.isArray(v)) {
          const rep = v;
          nextReportSeqCursor += 1;
          const updatedReport = {
            ...rep,
            seq: nextReportSeqCursor,
            reportSeq: nextReportSeqCursor
          };
          filteredPut[k] = updatedReport;
          newReportEvents.push({ rep: updatedReport });
        }
      }
    }
    const result = hasFilteredWrites ? await applyChanges({ put: filteredPut, del: filteredDel }, false) : { persistedToSupabase: false };
    let telegramDispatch;
    if (newOrderEvents.length > 0) {
      for (const ev of newOrderEvents) {
        const tgRes = await sendOrderNotificationToTelegram(
          { ...ev.rest, id: ev.rest.id || ev.rid },
          ev.ord
        ).catch((err) => ({ sent: false, reason: err instanceof Error ? err.message : "error" }));
        telegramDispatch = tgRes;
        if (!tgRes.sent && tgRes.reason && tgRes.reason !== "channel_whatsapp_only" && tgRes.reason !== "store_notifications_disabled") {
          console.warn(`[Telegram Order] Store ${ev.rid} order #${String(ev.ord.orderSeq || ev.ord.seq || "").trim() || String(ev.ord.id || "").slice(-6)} not sent: ${tgRes.reason}`);
        }
      }
    }
    const assignedOrderSeqs = newOrderEvents.length > 0 ? Object.fromEntries(
      newOrderEvents.map((ev) => [String(ev.ord.id || ""), Number(ev.ord.orderSeq || 0)]).filter(([id, seq]) => Boolean(id) && seq > 0)
    ) : void 0;
    const assignedReportSeqs = newReportEvents.length > 0 ? Object.fromEntries(
      newReportEvents.map((ev) => [String(ev.rep.id || ""), Number(ev.rep.reportSeq || 0)]).filter(([id, seq]) => Boolean(id) && seq > 0)
    ) : void 0;
    return res.json({
      ok: true,
      driver: isSupabaseConfigured() ? "supabase" : "file-memory",
      persistedToSupabase: result.persistedToSupabase,
      ...assignedOrderSeqs ? { assignedOrderSeqs } : {},
      ...assignedReportSeqs ? { assignedReportSeqs } : {},
      ...telegramDispatch ? { telegramDispatch } : {}
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Database error" });
  }
});
app.get("/api/public/popular-items/:rid", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const rid = String(req.params.rid || "").trim();
    if (!rid) {
      return res.json({ ok: true, counts: {}, totalOrders: 0 });
    }
    const allData = await readAll(false);
    const counts = {};
    let totalOrders = 0;
    for (const [k, v] of Object.entries(allData)) {
      if (!k.startsWith("orders/") || !v || typeof v !== "object") continue;
      const rec = v;
      if (String(rec.rid || "") !== rid) continue;
      if (rec.st === "cancelled" || rec.status === "cancelled") continue;
      totalOrders += 1;
      const items = Array.isArray(rec.items) ? rec.items : [];
      for (const rawLine of items) {
        if (!rawLine || typeof rawLine !== "object") continue;
        const line = rawLine;
        const nameKey = String(line.n || line.name || "").trim().toLowerCase();
        if (!nameKey) continue;
        const qty = Math.max(1, Number(line.q ?? line.qty ?? 1) || 1);
        counts[nameKey] = (counts[nameKey] || 0) + qty;
      }
    }
    return res.json({ ok: true, counts, totalOrders });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Database error", counts: {}, totalOrders: 0 });
  }
});
app.get("/api/db-status", async (req, res) => {
  try {
    const supabaseHealth = await checkSupabaseHealth();
    const databaseUrl = getDatabaseUrlInfo();
    if (!req.authSession?.admin) {
      return res.json({
        connected: supabaseHealth.configured ? supabaseHealth.connected : true,
        status: !supabaseHealth.configured || supabaseHealth.connected ? "operational" : "degraded"
      });
    }
    const all = await readAll();
    const count = Object.keys(all).length;
    return res.json({
      connected: supabaseHealth.configured ? supabaseHealth.connected : true,
      driver: isSupabaseConfigured() ? "supabase" : "file-memory",
      supabase: supabaseHealth,
      databaseUrl,
      recordsCount: count,
      status: !supabaseHealth.configured || supabaseHealth.connected ? "operational" : "degraded"
    });
  } catch (err) {
    return res.status(500).json({
      connected: false,
      error: req.authSession?.admin ? err?.message || "Database error" : "Database unavailable"
    });
  }
});
app.get("/api/auth/supabase-public-config", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const publicCfg = getSupabasePublicConfig();
  return res.json({
    ok: true,
    configured: Boolean(publicCfg),
    googleAuthEnabled: false,
    ...publicCfg ? { url: publicCfg.url, anonKey: publicCfg.anonKey } : {}
  });
});
app.get("/api/auth/me", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    ok: true,
    authenticated: Boolean(req.authSession),
    session: sanitizeAuthSessionForClient(req.authSession || null),
    ...req.authSession?.sid ? { token: signSid(req.authSession.sid) } : {}
  });
});
app.post("/api/auth/login", loginRateLimiter, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = req.body || {};
    const identifier = String(body.identifier || "").trim();
    const fullPhone = String(body.fullPhone || "").trim();
    const password = String(body.password || "").trim();
    if (!identifier || !password) {
      return res.status(400).json({ ok: false, error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0623\u0648 \u0627\u0644\u0645\u0639\u0631\u0641 \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631." });
    }
    const allData = await readAll(false);
    const idCandidates = Array.from(new Set([identifier, fullPhone].filter(Boolean)));
    const matchesAnyId = (val) => {
      if (typeof val !== "string" || !val.trim()) return false;
      return idCandidates.some((c) => matchesPhoneCandidates(val, c));
    };
    const isOwnerPhone = idCandidates.some((c) => matchesPhoneCandidates("07711448594", c));
    let matchedAnyAccount = isOwnerPhone;
    if (isOwnerPhone && !allData["accounts/acc_admin_owner"] && password.toLowerCase() === "admin") {
      const ownerAcc = {
        id: "acc_admin_owner",
        username: "07711448594",
        em: "07711448594",
        phone: "+9647711448594",
        pw: hashPasswordScrypt("admin"),
        rid: "demo",
        admin: true,
        active: true,
        at: todayIsoDate2(),
        created: todayIsoDate2()
      };
      await applyChanges({ put: { "accounts/acc_admin_owner": ownerAcc } }, false);
      const ses = await createServerAuthSession(req, res, {
        role: "owner",
        admin: true,
        accountId: "acc_admin_owner",
        rid: "demo",
        personalRid: "demo",
        name: "\u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629",
        phone: "+9647711448594",
        email: "07711448594",
        roleTitle: "\u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629 \u0648\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645",
        permissions: FULL_OWNER_PERMISSIONS
      });
      return res.json({ ok: true, token: signSid(ses.sid), session: sanitizeAuthSessionForClient(ses), restaurant: allData["restaurants/demo"] || null });
    }
    for (const [key, val] of Object.entries(allData)) {
      if (!key.startsWith("staff/") || !val || typeof val !== "object") continue;
      const stf = val;
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
        return res.status(403).json({ ok: false, error: "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0646 \u0642\u0628\u0644 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u0635\u0629." });
      }
      const staffId = key.slice("staff/".length);
      const perms = stf.permissions || {};
      const ses = await createServerAuthSession(req, res, {
        role: "staff",
        admin: true,
        staffId,
        rid: "demo",
        personalRid: "demo",
        name: String(stf.name || "\u0645\u0648\u0638\u0641 \u0625\u062F\u0627\u0631\u0629"),
        email: String(stf.email || stf.phone || ""),
        phone: String(stf.phone || ""),
        roleTitle: String(stf.roleTitle || "\u0645\u0648\u0638\u0641 \u0625\u062F\u0627\u0631\u0629"),
        permissions: perms
      });
      return res.json({ ok: true, token: signSid(ses.sid), session: sanitizeAuthSessionForClient(ses), restaurant: allData["restaurants/demo"] || null });
    }
    const accountEntries = Object.entries(allData).filter(([key, val]) => key.startsWith("accounts/") && Boolean(val) && typeof val === "object").sort(([kA, vA], [kB, vB]) => {
      const aRec = vA;
      const bRec = vB;
      const aIsAdmin = aRec.admin === true || aRec.r === "admin" || kA.startsWith("accounts/acc_admin_") ? 0 : 1;
      const bIsAdmin = bRec.admin === true || bRec.r === "admin" || kB.startsWith("accounts/acc_admin_") ? 0 : 1;
      return aIsAdmin - bIsAdmin;
    });
    for (const [key, val] of accountEntries) {
      const acc = val;
      const accId = key.slice("accounts/".length);
      if (!matchesAnyId(acc.email) && !matchesAnyId(acc.phone) && !matchesAnyId(acc.projectPhone) && !matchesAnyId(acc.em) && !matchesAnyId(acc.username) && !matchesAnyId(acc.e) && !matchesAnyId(acc.u)) {
        continue;
      }
      matchedAnyAccount = true;
      const credOk = verifyStoredCredential(
        acc.pw,
        [acc.email, acc.username, acc.em, acc.phone, acc.e, acc.u, identifier, fullPhone, "07711448594"],
        password,
        accId === "acc_menu_demo"
      );
      if (!credOk) continue;
      if (acc.active === false) {
        return res.status(403).json({ ok: false, error: "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0646 \u0642\u0628\u0644 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u0635\u0629." });
      }
      const isAdmin = Boolean(acc.admin === true || acc.r === "admin" || accId.startsWith("acc_admin_"));
      const rid = String(acc.rid || (isAdmin ? "demo" : "")).trim() || "demo";
      const linkedRest = allData[`restaurants/${rid}`];
      if (!isAdmin && linkedRest && linkedRest.a === 0) {
        return res.status(403).json({ ok: false, error: "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0647\u0630\u0627 \u0627\u0644\u0645\u062A\u062C\u0631 \u0645\u0624\u0642\u062A\u0627\u064B\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A." });
      }
      if (isAdmin) {
        const ses2 = await createServerAuthSession(req, res, {
          role: "owner",
          admin: true,
          accountId: accId,
          rid,
          personalRid: rid,
          name: String(acc.n || "\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0635\u0629"),
          email: String(acc.em || acc.phone || identifier),
          phone: String(acc.phone || acc.ph || ""),
          roleTitle: String(acc.roleTitle || "\u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629 \u0648\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645"),
          permissions: FULL_OWNER_PERMISSIONS
        });
        return res.json({ ok: true, token: signSid(ses2.sid), session: sanitizeAuthSessionForClient(ses2), restaurant: linkedRest || null });
      }
      const ses = await createServerAuthSession(req, res, {
        role: "partner",
        admin: false,
        accountId: accId,
        rid,
        personalRid: rid,
        name: String(acc.n || acc.projectName || linkedRest?.n || "\u0634\u0631\u064A\u0643"),
        email: String(acc.em || acc.phone || ""),
        phone: String(acc.phone || acc.ph || "")
      });
      return res.json({ ok: true, token: signSid(ses.sid), session: sanitizeAuthSessionForClient(ses), restaurant: linkedRest || null });
    }
    return res.status(401).json({
      ok: false,
      error: matchedAnyAccount ? "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629." : "\u0644\u0627 \u064A\u0648\u062C\u062F \u062D\u0633\u0627\u0628 \u0628\u0647\u0630\u0627 \u0627\u0644\u0631\u0642\u0645."
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "\u062A\u0639\u0630\u0631 \u0625\u062A\u0645\u0627\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644." });
  }
});
app.post("/api/onboard/profile", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const ses = req.authSession;
    if (!ses) {
      return res.status(401).json({ ok: false, error: "\u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0644\u0645\u062A\u0627\u0628\u0639\u0629." });
    }
    const body = req.body || {};
    const allData = await readAll(false);
    const ownerRid = ses.personalRid || ses.rid;
    const ownedRids = ses.admin ? null : getOwnedPartnerRids(allData, ownerRid);
    const rid = String(body.rid || ses.rid || ownerRid || "").trim();
    if (!rid || ownedRids && !ownedRids.has(rid)) {
      return res.status(403).json({ ok: false, error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0628\u062A\u0639\u062F\u064A\u0644 \u0647\u0630\u0627 \u0627\u0644\u0645\u0634\u0631\u0648\u0639." });
    }
    const existingRest = allData[`restaurants/${rid}`] || { id: rid };
    const nextRest = { ...existingRest };
    if (typeof body.n === "string" && body.n.trim()) {
      nextRest.n = body.n.trim().slice(0, 120);
      nextRest.ow = nextRest.n;
    }
    if (body.ph !== void 0) {
      nextRest.ph = String(body.ph || "").trim().slice(0, 32);
    }
    if (body.projectType === "restaurant" || body.projectType === "store") {
      nextRest.projectType = body.projectType;
    }
    if (typeof body.logo === "string" && body.logo.length <= 45e4) {
      nextRest.logo = body.logo;
    }
    if (Array.isArray(body.coverImages)) {
      nextRest.coverImages = body.coverImages.filter((x) => typeof x === "string" && x.length <= 65e4).slice(0, 5);
    }
    if (typeof body.tagline === "string") {
      nextRest.tagline = body.tagline.trim().slice(0, 220);
    }
    if (typeof body.aboutText === "string") {
      nextRest.aboutText = body.aboutText.trim().slice(0, 800);
    }
    if (body.themeMode === "light" || body.themeMode === "dark" || body.themeMode === "auto") {
      nextRest.themeMode = body.themeMode;
    }
    if (typeof body.themePreset === "string" && body.themePreset.trim()) {
      nextRest.themePreset = body.themePreset.trim().slice(0, 48);
    }
    if (typeof body.themeShape === "string" && body.themeShape.trim()) {
      nextRest.themeShape = body.themeShape.trim().slice(0, 32);
    }
    if (typeof body.color === "string" && /^#[0-9a-f]{3,8}$/i.test(body.color.trim())) {
      nextRest.color = body.color.trim();
    }
    if (body.lay === "list" || body.lay === "grid" || body.lay === "grid3" || body.lay === "grid4" || body.lay === "cards") {
      nextRest.lay = body.lay;
    }
    if (nextRest.projectType === "store") {
      nextRest.themeMode = "light";
      nextRest.themePreset = "estore";
      nextRest.themeShape = "estore";
      nextRest.color = "#f15a29";
      delete nextRest.bgColor;
      if (String(nextRest.tagline || "").trim() === "\u0623\u0634\u0647\u0649 \u0627\u0644\u0623\u0637\u0628\u0627\u0642 \u0627\u0644\u0645\u062D\u0636\u0631\u0629 \u064A\u0648\u0645\u064A\u0627\u064B \u0637\u0627\u0632\u062C\u0629 \u0628\u062C\u0648\u062F\u0629 \u0639\u0627\u0644\u064A\u0629") {
        nextRest.tagline = "";
      }
    }
    if (body.h && typeof body.h === "object" && !Array.isArray(body.h)) {
      nextRest.h = body.h;
    }
    if (body.done === 0 || body.done === 1) {
      nextRest.done = body.done;
    }
    if (body.on === 0 || body.on === 1) {
      nextRest.on = body.on;
    }
    const plansList = extractPlansList(allData["settings/plans"]);
    const subRules = normalizeSubdomainRules(allData["settings/site"] || null);
    const takenSlugs = collectTakenSlugsFromAllData(allData, rid);
    const { isPaid: restIsPaid } = isPaidPlanForRestaurant(nextRest, plansList);
    const canUseCustomSlug = Boolean(ses.admin) || restIsPaid;
    if (!canUseCustomSlug) {
      const curSlug = sanitizeSubdomainValue(String(nextRest.slug || ""));
      if (!isValidSixCharCode(curSlug) || takenSlugs.has(curSlug)) {
        nextRest.slug = generateUniqueMenuCode(takenSlugs);
      } else {
        nextRest.slug = curSlug;
      }
      nextRest.subdomain = "";
    } else {
      if (!nextRest.slug || !sanitizeSubdomainValue(String(nextRest.slug))) {
        nextRest.slug = generateUniqueMenuCode(takenSlugs);
      }
      if (typeof body.slug === "string" && body.slug.trim()) {
        const cleanSlug = sanitizeSubdomainValue(body.slug);
        const validation = validatePathSlugFormat(cleanSlug, subRules);
        if (validation.valid && !takenSlugs.has(cleanSlug)) {
          nextRest.slug = cleanSlug;
          nextRest.subdomain = subRules.enabled ? cleanSlug : "";
        }
      } else if (!subRules.enabled) {
        nextRest.subdomain = "";
      }
    }
    const putMap = {
      [`restaurants/${rid}`]: nextRest
    };
    if (ses.accountId && allData[`accounts/${ses.accountId}`]) {
      const existingAcc = allData[`accounts/${ses.accountId}`];
      putMap[`accounts/${ses.accountId}`] = {
        ...existingAcc,
        ...nextRest.n ? { projectName: nextRest.n, n: nextRest.n } : {},
        ...nextRest.projectType ? { projectType: nextRest.projectType } : {},
        ...body.ph !== void 0 ? { projectPhone: nextRest.ph } : {}
      };
      if (nextRest.n) {
        await updateServerAuthSession(ses.sid, { ...ses, name: nextRest.n }).catch(() => {
        });
      }
    }
    putMap[`logs/aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`] = {
      id: `aud_${Date.now().toString(36)}`,
      ts: Date.now(),
      actor: ses.phone || ses.name || nextRest.n || "\u0634\u0631\u064A\u0643",
      action: "\u062A\u062D\u062F\u064A\u062B \u0645\u0644\u0641 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0648\u0627\u0644\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0623\u0648\u0644\u064A",
      details: `\u0627\u0644\u0645\u0634\u0631\u0648\u0639: ${nextRest.n || rid} (${rid})`,
      type: "restaurant"
    };
    await applyChanges({ put: putMap }, false);
    return res.json({ ok: true, restaurant: nextRest });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0648\u0639." });
  }
});
app.post("/api/auth/impersonate", requireAdminOrStaff(), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const ses = req.authSession;
    const rawRid = req.body?.rid;
    const requestedRid = rawRid === null || rawRid === void 0 ? "" : String(rawRid).trim();
    const exitToOwn = !requestedRid || requestedRid === "__exit__";
    const nextRid = exitToOwn ? ses.personalRid || "demo" : requestedRid;
    if (!exitToOwn) {
      const perms = ses.role === "owner" || !ses.staffId ? FULL_OWNER_PERMISSIONS : req.authPermissions || {};
      if (nextRid === "demo") {
        if (!perms.canEditDemoMenu && !perms.canImpersonatePartner) {
          return res.status(403).json({ ok: false, error: "\u0644\u064A\u0633\u062A \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0646\u064A\u0648 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A." });
        }
      } else if (!perms.canImpersonatePartner) {
        return res.status(403).json({ ok: false, error: "\u0644\u064A\u0633\u062A \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0627\u0644\u0634\u0631\u0643\u0627\u0621." });
      }
      const targetRest = await getInternalStoreItem(`restaurants/${nextRid}`);
      if (!targetRest) {
        return res.status(404).json({ ok: false, error: "\u0627\u0644\u0645\u062A\u062C\u0631 \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
      }
    }
    const updated = {
      ...ses,
      rid: nextRid,
      personalRid: exitToOwn ? ses.personalRid || "demo" : ses.personalRid || nextRid,
      impersonating: !exitToOwn && nextRid !== (ses.personalRid || "demo"),
      menuLoggedOut: false
    };
    await updateServerAuthSession(ses.sid, updated);
    req.authSession = updated;
    return res.json({ ok: true, token: signSid(updated.sid), session: sanitizeAuthSessionForClient(updated) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "\u062A\u0639\u0630\u0631 \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u062C\u0644\u0633\u0629." });
  }
});
app.post("/api/auth/logout", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const body = req.body || {};
  const scope = String(body.scope || "all").trim();
  const ses = req.authSession;
  if (scope === "menu" && ses && ses.admin && !ses.menuLoggedOut) {
    const updated = {
      ...ses,
      rid: void 0,
      personalRid: void 0,
      impersonating: false,
      menuLoggedOut: true
    };
    await updateServerAuthSession(ses.sid, updated);
    req.authSession = updated;
    return res.json({
      ok: true,
      partial: true,
      token: signSid(updated.sid),
      session: sanitizeAuthSessionForClient(updated)
    });
  }
  await destroyServerAuthSession(req, res);
  return res.json({ ok: true, partial: false });
});
app.post("/api/reviews", otpRateLimiter, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = req.body || {};
    const rid = String(body.rid || "").trim();
    const name = String(body.name || "\u0632\u0628\u0648\u0646").trim().slice(0, 60) || "\u0632\u0628\u0648\u0646";
    const rate = Math.max(1, Math.min(5, Math.round(Number(body.rate || 5))));
    const comment = String(body.comment || "").trim().slice(0, 500);
    if (!rid || !comment) {
      return res.status(400).json({ ok: false, error: "\u064A\u0631\u062C\u0649 \u0643\u062A\u0627\u0628\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0642\u0628\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644." });
    }
    const rest = await getInternalStoreItem(`restaurants/${rid}`);
    if (!rest) {
      return res.status(404).json({ ok: false, error: "\u0627\u0644\u0645\u062A\u062C\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    }
    const existingReviews = Array.isArray(rest.reviews) ? rest.reviews : [];
    const newReview = {
      id: `rev_${Date.now().toString(36)}_${crypto4.randomBytes(2).toString("hex")}`,
      name,
      rate,
      comment,
      at: Date.now()
    };
    const nextReviews = [newReview, ...existingReviews].slice(0, 200);
    await applyChanges({ put: { [`restaurants/${rid}`]: { ...rest, reviews: nextReviews } } }, false);
    return res.json({ ok: true, reviews: nextReviews });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u062A\u0642\u064A\u064A\u0645." });
  }
});
app.get("/api/session", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    sessionId: req.authSession?.sid || null,
    session: sanitizeAuthSessionForClient(req.authSession || null)
  });
});
app.post("/api/session", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const ses = req.authSession;
  if (!ses) {
    return res.status(401).json({ ok: false, error: "\u064A\u062A\u0637\u0644\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0639\u0628\u0631 /api/auth/login." });
  }
  const reqSes = req.body?.session;
  const targetRid = reqSes?.rid ? String(reqSes.rid).trim() : "";
  if (!targetRid || targetRid === ses.rid) {
    return res.json({ ok: true, sessionId: ses.sid });
  }
  if (ses.admin) {
    const updated2 = { ...ses, rid: targetRid, menuLoggedOut: false };
    await updateServerAuthSession(ses.sid, updated2);
    req.authSession = updated2;
    return res.json({ ok: true, sessionId: ses.sid });
  }
  const allData = await readAll(false);
  const owned = getOwnedPartnerRids(allData, ses.personalRid || ses.rid);
  if (!owned.has(targetRid)) {
    return res.status(403).json({ ok: false, error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0628\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0645\u062A\u062C\u0631." });
  }
  const updated = { ...ses, rid: targetRid };
  await updateServerAuthSession(ses.sid, updated);
  req.authSession = updated;
  return res.json({ ok: true, sessionId: ses.sid });
});
app.delete("/api/session", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  await destroyServerAuthSession(req, res);
  return res.json({ ok: true });
});
app.get("/api/telegram-status", (_req, res) => {
  res.json(getTelegramBotStatus());
});
async function resolvePartnerTelegramAccess(req, requestedRid) {
  const ses = req.authSession;
  if (!ses) {
    return { ok: false, status: 401, error: "\u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0644\u0645\u062A\u0627\u0628\u0639\u0629." };
  }
  const targetRid = String(requestedRid || ses.rid || "").trim();
  if (!targetRid) {
    return { ok: false, status: 400, error: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u062A\u062C\u0631 \u0645\u0637\u0644\u0648\u0628." };
  }
  if (ses.admin) {
    return { ok: true, rid: targetRid };
  }
  const allData = await readAll(false);
  const owned = getOwnedPartnerRids(allData, ses.personalRid || ses.rid);
  if (!owned.has(targetRid)) {
    return { ok: false, status: 403, error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0628\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0645\u062A\u062C\u0631." };
  }
  return { ok: true, rid: targetRid };
}
app.get("/api/dashboard/telegram/status", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const auth = await resolvePartnerTelegramAccess(req, req.query.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const status = await getTelegramOrderLinkStatus(auth.rid);
    return res.json(status);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u062D\u0627\u0644\u0629 \u0627\u0644\u0631\u0628\u0637." });
  }
});
app.post("/api/dashboard/telegram/link", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = req.body || {};
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const result = await initTelegramOrderLink(auth.rid, String(body.phone || ""));
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "\u062A\u0639\u0630\u0631 \u0628\u062F\u0621 \u0631\u0628\u0637 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645." });
  }
});
app.post("/api/dashboard/telegram/toggle", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = req.body || {};
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const enabled = body.enabled !== false;
    const ok = await toggleTelegramForRestaurant(auth.rid, enabled);
    if (!ok) return res.status(404).json({ ok: false, error: "\u0627\u0644\u0645\u062A\u062C\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return res.json({ ok: true, enabled });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062A\u0641\u0639\u064A\u0644." });
  }
});
app.post("/api/dashboard/telegram/unlink", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = req.body || {};
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const ok = await unlinkTelegramForRestaurant(auth.rid);
    if (!ok) return res.status(404).json({ ok: false, error: "\u0627\u0644\u0645\u062A\u062C\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "\u062A\u0639\u0630\u0631 \u0641\u0643 \u0627\u0644\u0631\u0628\u0637." });
  }
});
app.post("/api/dashboard/telegram/test", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = req.body || {};
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const result = await sendPartnerTestOrderNotification(auth.rid);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A." });
  }
});
app.post("/api/dashboard/telegram/verify", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = req.body || {};
    const auth = await resolvePartnerTelegramAccess(req, body.rid);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    const result = await verifyTelegramBotLive(auth.rid);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      diagnosticMessage: err?.message || "\u062A\u0639\u0630\u0631 \u0641\u062D\u0635 \u0627\u062A\u0635\u0627\u0644 \u0628\u0648\u062A \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645."
    });
  }
});
app.post("/api/telegram/webhook", async (req, res) => {
  try {
    const body = req.body || {};
    if (body?.message && body.message.chat?.id) {
      await handleIncomingTelegramMessage(body.message);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.warn("[Telegram Webhook] Error:", err?.message || err);
    return res.json({ ok: true });
  }
});
var CUST_PROFILE_COOKIE = "mp_cust_id";
var CUST_PROFILE_KV_PREFIX = "customer_profiles/";
function setCustomerProfileCookie(res, req, custId) {
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  const reqHost = String(req.hostname || "").toLowerCase().trim();
  const sharesSubdomains = BASE_DOMAIN && (reqHost === BASE_DOMAIN || reqHost.endsWith(`.${BASE_DOMAIN}`));
  const parts = [
    `${CUST_PROFILE_COOKIE}=${encodeURIComponent(custId)}`,
    "Path=/",
    "HttpOnly",
    isHttps ? "SameSite=None" : "SameSite=Lax",
    `Max-Age=${365 * 24 * 60 * 60}`
  ];
  if (sharesSubdomains) parts.push(`Domain=.${BASE_DOMAIN}`);
  if (isHttps) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}
app.get("/api/customer-profile", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const cookies = parseRequestCookies(req.headers.cookie);
    const custId = String(cookies[CUST_PROFILE_COOKIE] || req.headers["x-customer-profile-id"] || "").trim();
    if (!custId || !/^[a-zA-Z0-9_-]{8,64}$/.test(custId)) {
      return res.json({ ok: true, profile: null });
    }
    const profile = await getInternalStoreItem(`${CUST_PROFILE_KV_PREFIX}${custId}`).catch(() => null);
    return res.json({ ok: true, custId, profile: profile || null });
  } catch {
    return res.json({ ok: true, profile: null });
  }
});
app.post("/api/customer-profile", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const cookies = parseRequestCookies(req.headers.cookie);
    let custId = String(cookies[CUST_PROFILE_COOKIE] || req.headers["x-customer-profile-id"] || "").trim();
    if (!custId || !/^[a-zA-Z0-9_-]{8,64}$/.test(custId)) {
      custId = `cust_${crypto4.randomBytes(12).toString("hex")}`;
    }
    const body = req.body || {};
    const existing = await getInternalStoreItem(`${CUST_PROFILE_KV_PREFIX}${custId}`).catch(() => null);
    const nextProfile = {
      name: String(body.name ?? existing?.name ?? "").trim().slice(0, 120),
      phone: String(body.phone ?? existing?.phone ?? "").trim().slice(0, 40),
      address: String(body.address ?? existing?.address ?? "").trim().slice(0, 400),
      notes: String(body.notes ?? existing?.notes ?? "").trim().slice(0, 400),
      updatedAt: Date.now()
    };
    await setInternalStoreItem(`${CUST_PROFILE_KV_PREFIX}${custId}`, nextProfile);
    setCustomerProfileCookie(res, req, custId);
    return res.json({ ok: true, custId, profile: nextProfile });
  } catch {
    return res.status(500).json({ ok: false });
  }
});
app.post("/api/dashboard/media/delete-file", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const ses = req.authSession;
    if (!ses) {
      return res.status(401).json({ ok: false, error: "\u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644." });
    }
    const url = String((req.body || {}).url || "").trim();
    if (!url || !url.startsWith("/uploads/")) {
      return res.json({ ok: true, deletedFile: false });
    }
    const allData = await readAll(false);
    const serialized = JSON.stringify(allData);
    if (serialized.includes(url)) {
      return res.json({ ok: true, deletedFile: false });
    }
    const uploadsRoot = path5.resolve(process.cwd(), "public", "uploads");
    const relPath = url.replace(/^\/uploads\//, "");
    const resolvedTarget = path5.resolve(uploadsRoot, relPath);
    if (resolvedTarget.startsWith(uploadsRoot + path5.sep) && fs5.existsSync(resolvedTarget) && fs5.statSync(resolvedTarget).isFile()) {
      fs5.unlinkSync(resolvedTarget);
      return res.json({ ok: true, deletedFile: true });
    }
    return res.json({ ok: true, deletedFile: false });
  } catch {
    return res.json({ ok: true, deletedFile: false });
  }
});
app.all("/api/notes", requireAdminOrStaff("canUseNotes"), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const db = await readAll().catch(() => ({}));
    const seedNotes = Object.entries(db).filter(([k]) => k.startsWith("notes/")).map(([, v]) => v).filter((v) => v && typeof v === "object" && v.id);
    if (req.method === "GET") {
      const result = readNotesDocument(seedNotes);
      if (seedNotes.length > 0 && isSupabaseConfigured()) {
        return res.json({ ...result, notes: seedNotes });
      }
      return res.json(result);
    }
    if (req.method === "POST") {
      const body = req.body || {};
      if (body.action === "delete" && body.id) {
        const noteId = String(body.id);
        const result = deleteNoteFromFile(noteId, seedNotes);
        await applyChanges({ del: [`notes/${noteId}`] }, false);
        return res.json({ ok: true, ...result });
      }
      if (body.action === "replaceAll" && Array.isArray(body.notes)) {
        const result = replaceAllNotesInFile(body.notes);
        const oldNoteKeys = Object.keys(db).filter((k) => k.startsWith("notes/"));
        const putMap = {};
        for (const n of result.notes) {
          putMap[`notes/${n.id}`] = n;
        }
        const delKeys = oldNoteKeys.filter((k) => !Object.prototype.hasOwnProperty.call(putMap, k));
        await applyChanges({ put: putMap, del: delKeys }, false);
        return res.json({ ok: true, ...result });
      }
      if (body.note && typeof body.note === "object" && body.note.id) {
        const result = saveNoteToFile(body.note, seedNotes);
        await applyChanges({ put: { [`notes/${result.savedNote.id}`]: result.savedNote } }, false);
        return res.json({ ok: true, ...result });
      }
      return res.status(400).json({ error: "Invalid notes payload" });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Notes error" });
  }
});
app.get("/api/search-images", async (req, res) => {
  const q = String(req.query.q || "").slice(0, 120);
  const limit = Math.min(24, Math.max(4, Number(req.query.limit || "16") || 16));
  const offset = Math.max(0, Math.min(80, Number(req.query.offset || "0") || 0));
  const seed = Math.max(0, Math.min(50, Number(req.query.seed || "0") || 0));
  const excludeRaw = String(req.query.exclude || "");
  const exclude = excludeRaw ? excludeRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 48) : [];
  const images = await searchWebImages(q, limit, offset, seed, exclude);
  res.json({ query: q, images });
});
app.get("/api/proxy-image", async (req, res) => {
  const target = String(req.query.url || "");
  const result = await proxyExternalImage(target);
  res.status(result.status);
  res.setHeader("Content-Type", result.contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (result.status === 200 && result.buffer) {
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(result.buffer);
  }
  return res.json({ error: result.error || "Proxy error" });
});
app.use(createAdminRouter());
app.use(createSubdomainRouter());
var FONTS_DISK_DIR = path5.resolve(process.cwd(), "data/fonts");
function detectFontFormatAndMime(fileName, buf) {
  const lower = String(fileName || "").toLowerCase();
  const magic4 = buf.subarray(0, 4);
  const magicStr = magic4.toString("ascii");
  const isOtfMagic = magicStr === "OTTO";
  const isTtfMagic = magic4[0] === 0 && magic4[1] === 1 && magic4[2] === 0 && magic4[3] === 0 || magicStr === "true" || magicStr === "typ1";
  const isWoffMagic = magicStr === "wOFF";
  const isWoff2Magic = magicStr === "wOF2";
  if (lower.endsWith(".otf") && (isOtfMagic || isTtfMagic)) {
    return { ext: "otf", format: "opentype", mime: "font/otf" };
  }
  if (lower.endsWith(".ttf") && (isTtfMagic || isOtfMagic)) {
    return { ext: "ttf", format: "truetype", mime: "font/ttf" };
  }
  if (lower.endsWith(".woff2") && isWoff2Magic) {
    return { ext: "woff2", format: "woff2", mime: "font/woff2" };
  }
  if (lower.endsWith(".woff") && isWoffMagic) {
    return { ext: "woff", format: "woff", mime: "font/woff" };
  }
  if (isOtfMagic) return { ext: "otf", format: "opentype", mime: "font/otf" };
  if (isWoff2Magic) return { ext: "woff2", format: "woff2", mime: "font/woff2" };
  if (isWoffMagic) return { ext: "woff", format: "woff", mime: "font/woff" };
  if (isTtfMagic) return { ext: "ttf", format: "truetype", mime: "font/ttf" };
  return null;
}
app.post("/api/admin/fonts/upload", requireAdminOrStaff(), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const ses = req.authSession;
    const perms = ses.role === "owner" || !ses.staffId ? FULL_OWNER_PERMISSIONS : { ...FULL_OWNER_PERMISSIONS, ...req.authPermissions };
    if (!perms.canManageSettings && !perms.canManageThemeMode && !perms.canEditHomePage) {
      return res.status(403).json({ ok: false, error: "\u0644\u064A\u0633\u062A \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0631\u0641\u0639 \u0648\u062A\u0639\u062F\u064A\u0644 \u062E\u0637\u0648\u0637 \u0627\u0644\u0645\u0646\u0635\u0629" });
    }
    const { fileName, dataBase64, weight } = req.body || {};
    const rawName = String(fileName || "custom-font.otf").trim();
    const rawB64 = String(dataBase64 || "").trim().replace(/^data:[^;]+;base64,/i, "");
    if (!rawB64) {
      return res.status(400).json({ ok: false, error: "\u0645\u0644\u0641 \u0627\u0644\u062E\u0637 \u0641\u0627\u0631\u063A \u0623\u0648 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
    }
    const buf = Buffer.from(rawB64, "base64");
    if (buf.length < 32 || buf.length > 8 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: "\u062D\u062C\u0645 \u0645\u0644\u0641 \u0627\u0644\u062E\u0637 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u064A\u0646 32 \u0628\u0627\u064A\u062A \u0648 8 \u0645\u064A\u063A\u0627\u0628\u0627\u064A\u062A" });
    }
    const detected = detectFontFormatAndMime(rawName, buf);
    if (!detected) {
      return res.status(400).json({
        ok: false,
        error: "\u0635\u064A\u063A\u0629 \u0645\u0644\u0641 \u0627\u0644\u062E\u0637 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629. \u064A\u0631\u062C\u0649 \u0631\u0641\u0639 \u0645\u0644\u0641 \u062E\u0637 \u0628\u0635\u064A\u063A\u0629 .otf \u0623\u0648 .ttf \u0623\u0648 .woff2 \u0623\u0648 .woff"
      });
    }
    const fileId = `font_${Date.now().toString(36)}_${crypto4.randomBytes(4).toString("hex")}`;
    const numericWeight = Number(weight) === 0 ? 0 : Math.min(900, Math.max(100, Number(weight) || 400));
    if (!fs5.existsSync(FONTS_DISK_DIR)) {
      fs5.mkdirSync(FONTS_DISK_DIR, { recursive: true });
    }
    const diskPath = path5.join(FONTS_DISK_DIR, `${fileId}.${detected.ext}`);
    fs5.writeFileSync(diskPath, buf);
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
            dataBase64: buf.toString("base64"),
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        }
      },
      false
    );
    return res.json({
      ok: true,
      fileId,
      url: `/api/fonts/file/${fileId}.${detected.ext}`,
      format: detected.format,
      ext: detected.ext,
      sizeBytes: buf.length
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "\u0641\u0634\u0644 \u0631\u0641\u0639 \u0645\u0644\u0641 \u0627\u0644\u062E\u0637" });
  }
});
app.get("/api/fonts/file/:fileParam", async (req, res) => {
  try {
    const rawParam = String(req.params.fileParam || "").trim();
    const match = /^([a-zA-Z0-9_-]+)(?:\.(otf|ttf|woff2|woff))?$/i.exec(rawParam);
    if (!match) {
      return res.status(400).send("Invalid font id");
    }
    const fileId = match[1];
    for (const ext2 of ["otf", "ttf", "woff2", "woff"]) {
      const candidate = path5.join(FONTS_DISK_DIR, `${fileId}.${ext2}`);
      if (fs5.existsSync(candidate)) {
        const mime2 = ext2 === "otf" ? "font/otf" : ext2 === "ttf" ? "font/ttf" : ext2 === "woff2" ? "font/woff2" : "font/woff";
        res.setHeader("Content-Type", mime2);
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.sendFile(candidate);
      }
    }
    const stored = await getInternalStoreItem(`custom_font_files/${fileId}`);
    if (!stored || !stored.dataBase64) {
      return res.status(404).send("Font not found");
    }
    const buf = Buffer.from(stored.dataBase64, "base64");
    const ext = stored.ext || "otf";
    const mime = stored.mime || "font/otf";
    try {
      if (!fs5.existsSync(FONTS_DISK_DIR)) fs5.mkdirSync(FONTS_DISK_DIR, { recursive: true });
      fs5.writeFileSync(path5.join(FONTS_DISK_DIR, `${fileId}.${ext}`), buf);
    } catch {
    }
    res.setHeader("Content-Type", mime);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.send(buf);
  } catch {
    return res.status(500).send("Failed to load font");
  }
});
app.delete("/api/admin/fonts/:fileId", requireAdminOrStaff(), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const ses = req.authSession;
    const perms = ses.role === "owner" || !ses.staffId ? FULL_OWNER_PERMISSIONS : { ...FULL_OWNER_PERMISSIONS, ...req.authPermissions };
    if (!perms.canManageSettings && !perms.canManageThemeMode && !perms.canEditHomePage) {
      return res.status(403).json({ ok: false, error: "\u0644\u064A\u0633\u062A \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u062D\u0630\u0641 \u062E\u0637\u0648\u0637 \u0627\u0644\u0645\u0646\u0635\u0629" });
    }
    const fileId = String(req.params.fileId || "").trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return res.status(400).json({ ok: false, error: "\u0645\u0639\u0631\u0641 \u0627\u0644\u062E\u0637 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
    }
    for (const ext of ["otf", "ttf", "woff2", "woff"]) {
      const p = path5.join(FONTS_DISK_DIR, `${fileId}.${ext}`);
      if (fs5.existsSync(p)) {
        fs5.unlinkSync(p);
      }
    }
    await applyChanges({ del: [`custom_font_files/${fileId}`] }, false);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "\u0641\u0634\u0644 \u062D\u0630\u0641 \u0645\u0644\u0641 \u0627\u0644\u062E\u0637" });
  }
});
app.options("/api/*", (_req, res) => {
  res.status(204).end();
});
app.all("/api/*", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});
app.use((err, _req, res, _next) => {
  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ error: "Invalid JSON request body" });
  }
  console.error("[Server Error]", err?.message || err);
  return res.status(500).json({ error: "Internal server error" });
});
var ASSET_EXTENSION_RE = /\.(?:js|mjs|css|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|eot|json|txt|xml)$/i;
var SEO_RESERVED_SEGMENTS = /* @__PURE__ */ new Set([
  "login",
  "signup",
  "forgot",
  "onboard",
  "dashboard",
  "admin",
  "menu",
  "services",
  "steps",
  "pricing",
  "faq",
  "demo",
  "about",
  "api",
  "assets"
]);
function resolveRequestOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || BASE_DOMAIN).split(",")[0].trim();
  return `${proto}://${host}`;
}
function escapeSeoAttr(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function xmlEscape(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
var DEFAULT_SEO_FAQS = [
  {
    q: "\u0634\u0648 \u064A\u0639\u0646\u064A \u0645\u0646\u064A\u0648 \u0648\u0643\u062A\u0627\u0644\u0648\u062C \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0630\u0643\u064A\u061F",
    a: "\u0647\u0648 \u0631\u0627\u0628\u0637 \u062E\u0627\u0635 \u0648\u0628\u0627\u0631\u0643\u0648\u062F QR \u0628\u0627\u0633\u0645 \u0645\u0634\u0631\u0648\u0639\u0643 \u064A\u0641\u062A\u062D\u0647 \u0627\u0644\u0632\u0628\u0648\u0646 \u0641\u0648\u0631\u0627\u064B \u0645\u0646 \u0645\u062A\u0635\u0641\u062D \u0647\u0627\u062A\u0641\u0647 \u0628\u062F\u0648\u0646 \u062A\u062D\u0645\u064A\u0644 \u0623\u064A \u062A\u0637\u0628\u064A\u0642\u061B \u064A\u062A\u0635\u0641\u062D \u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0648\u0627\u0644\u0648\u062C\u0628\u0627\u062A \u0623\u0648 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0628\u0627\u0644\u0635\u0648\u0631 \u0648\u0627\u0644\u0623\u0633\u0639\u0627\u0631\u060C \u064A\u0636\u064A\u0641 \u0644\u0644\u0633\u0644\u0629\u060C \u0648\u064A\u0631\u0633\u0644 \u0644\u0643 \u0627\u0644\u0637\u0644\u0628 \u0645\u0631\u062A\u0628\u0627\u064B \u0628\u0627\u0644\u0643\u0627\u0645\u0644 \u0639\u0644\u0649 \u0627\u0644\u0648\u0627\u062A\u0633\u0627\u0628."
  },
  {
    q: "\u0647\u0644 \u0645\u0646\u064A\u0648 \u0628\u0644\u0633 \u0645\u0646\u0627\u0633\u0628 \u0644\u0645\u0637\u0639\u0645\u064A \u0623\u0648 \u0645\u062A\u062C\u0631\u064A\u061F",
    a: "\u0646\u0639\u0645\u060C \u0627\u0644\u0645\u0646\u0635\u0629 \u0645\u0635\u0645\u0645\u0629 \u0628\u0645\u0631\u0648\u0646\u0629 \u0643\u0627\u0645\u0644\u0629 \u0644\u062A\u0646\u0627\u0633\u0628 \u0627\u0644\u0645\u0637\u0627\u0639\u0645\u060C \u0627\u0644\u0643\u0627\u0641\u064A\u0647\u0627\u062A\u060C \u0645\u062D\u0644\u0627\u062A \u0627\u0644\u062D\u0644\u0648\u064A\u0627\u062A \u0648\u0627\u0644\u0639\u0635\u0627\u0626\u0631\u060C \u0648\u0643\u0630\u0644\u0643 \u0627\u0644\u0645\u062A\u0627\u062C\u0631 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629 \u0648\u0645\u062D\u0644\u0627\u062A \u0627\u0644\u0639\u0637\u0648\u0631 \u0648\u0627\u0644\u0645\u0644\u0627\u0628\u0633 \u0648\u0627\u0644\u0625\u0643\u0633\u0633\u0648\u0627\u0631\u0627\u062A."
  },
  {
    q: "\u0628\u0642\u062F\u0631 \u0623\u0633\u062A\u062E\u062F\u0645 \u0627\u0633\u0645\u064A \u0648\u0634\u0639\u0627\u0631\u064A \u0648\u0623\u063A\u064A\u0651\u0631 \u0627\u0644\u0623\u0644\u0648\u0627\u0646 \u0648\u0627\u0644\u0645\u0638\u0647\u0631\u061F",
    a: "\u0623\u0643\u064A\u062F! \u062A\u0642\u062F\u0631 \u062A\u0631\u0641\u0639 \u0634\u0639\u0627\u0631 \u0645\u0634\u0631\u0648\u0639\u0643 \u0648\u0635\u0648\u0631\u0629 \u0627\u0644\u063A\u0644\u0627\u0641\u060C \u0648\u062A\u062E\u062A\u0627\u0631 \u0628\u064A\u0646 \u0627\u0644\u0645\u0638\u0647\u0631 \u0627\u0644\u0646\u0647\u0627\u0631\u064A \u0627\u0644\u0641\u0627\u062A\u062D \u0648\u0627\u0644\u0645\u0638\u0647\u0631 \u0627\u0644\u0644\u064A\u0644\u064A \u0627\u0644\u063A\u0627\u0645\u0642 \u0645\u0639 \u0642\u0648\u0627\u0644\u0628 \u0623\u0644\u0648\u0627\u0646 \u0627\u062D\u062A\u0631\u0627\u0641\u064A\u0629 \u0648\u0631\u0627\u0628\u0637 \u0645\u062E\u0635\u0635 \u0628\u0627\u0633\u0645 \u0645\u0634\u0631\u0648\u0639\u0643."
  },
  {
    q: "\u0647\u0644 \u062A\u0627\u062E\u0630\u0648\u0646 \u0646\u0633\u0628\u0629 \u0623\u0648 \u0639\u0645\u0648\u0644\u0629 \u0639\u0644\u0649 \u0645\u0628\u064A\u0639\u0627\u062A\u064A \u0648\u0637\u0644\u0628\u0627\u062A\u064A\u061F",
    a: "\u0644\u0627\u060C 0% \u0639\u0645\u0648\u0644\u0629 \u0639\u0644\u0649 \u0645\u0628\u064A\u0639\u0627\u062A\u0643 \u0644\u0644\u0623\u0628\u062F. \u0643\u0644 \u0623\u0631\u0628\u0627\u062D \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u062A\u0648\u0635\u064A\u0644 \u0648\u0627\u0644\u0627\u0633\u062A\u0644\u0627\u0645 \u0648\u0627\u0644\u0637\u0627\u0648\u0644\u0627\u062A \u062A\u0628\u0642\u0649 \u0644\u0643 \u0628\u0627\u0644\u0643\u0627\u0645\u0644 \u0648\u062A\u0633\u062A\u0644\u0645\u0647\u0627 \u0645\u0628\u0627\u0634\u0631\u0629 \u0639\u0644\u0649 \u0631\u0642\u0645 \u0627\u0644\u0648\u0627\u062A\u0633\u0627\u0628 \u0627\u0644\u062E\u0627\u0635 \u0628\u0643."
  },
  {
    q: "\u0643\u064A\u0641 \u064A\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u0645\u0627 \u0647\u064A \u0627\u0644\u0628\u0627\u0642\u0627\u062A \u0627\u0644\u0645\u062A\u0648\u0641\u0631\u0629\u061F",
    a: "\u0646\u0648\u0641\u0631 3 \u0628\u0627\u0642\u0627\u062A \u0645\u0631\u0646\u0629 (\u0627\u0644\u0627\u0642\u062A\u0635\u0627\u062F\u064A\u0629\u060C \u0627\u0644\u0627\u062D\u062A\u0631\u0627\u0641\u064A\u0629\u060C \u0648\u0628\u0627\u0642\u0629 \u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0634\u0627\u0645\u0644\u0629) \u0628\u0627\u0634\u062A\u0631\u0627\u0643 \u0634\u0647\u0631\u064A \u0623\u0648 \u0633\u0646\u0648\u064A \u0628\u062F\u0648\u0646 \u0623\u064A \u0639\u0645\u0648\u0644\u0627\u062A \u0639\u0644\u0649 \u0645\u0628\u064A\u0639\u0627\u062A\u0643\u060C \u0648\u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u062A\u0631\u0642\u064A\u0629 \u0628\u064A\u0646 \u0627\u0644\u0628\u0627\u0642\u0627\u062A \u0641\u064A \u0623\u064A \u0648\u0642\u062A."
  },
  {
    q: "\u0647\u0644 \u0623\u0642\u062F\u0631 \u0623\u0641\u0639\u0651\u0644 \u0646\u0634\u0627\u0637\u064A \u0648\u0623\u0639\u062F\u0651\u0644 \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0622\u0646\u061F",
    a: "\u0646\u0639\u0645\u060C \u062E\u0644\u0627\u0644 \u062F\u0642\u0627\u0626\u0642 \u0645\u0639\u062F\u0648\u062F\u0629 \u062A\u0633\u062C\u0651\u0644 \u0628\u0631\u0642\u0645 \u0647\u0627\u062A\u0641\u0643\u060C \u062A\u0636\u064A\u0641 \u0623\u0642\u0633\u0627\u0645\u0643 \u0648\u0645\u0646\u062A\u062C\u0627\u062A\u0643\u060C \u0648\u062A\u0637\u0628\u0639 \u0643\u0648\u062F \u0627\u0644\u0640 QR \u0648\u062A\u0628\u062F\u0623 \u0628\u0627\u0633\u062A\u0642\u0628\u0627\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0641\u0648\u0631\u0627\u064B."
  }
];
async function injectSeoMetaIntoHtml(html, req) {
  try {
    const origin = resolveRequestOrigin(req);
    const cleanPath = req.path === "/" ? "/" : req.path.replace(/\/+$/, "");
    const canonicalUrl = `${origin}${cleanPath === "/" ? "" : cleanPath}`;
    const allData = await readAll(false).catch(() => ({}));
    let pageTitle = "\u0645\u0646\u064A\u0648 \u0628\u0644\u0633 | \u0623\u0630\u0643\u0649 \u0645\u0646\u0635\u0629 \u0645\u0646\u064A\u0648 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A QR \u0648\u0643\u062A\u0627\u0644\u0648\u062C \u0637\u0644\u0628\u0627\u062A \u0648\u0627\u062A\u0633\u0627\u0628 \u0644\u0644\u0645\u0637\u0627\u0639\u0645 \u0648\u0627\u0644\u0645\u062A\u0627\u062C\u0631";
    let pageDesc = "\u0623\u0646\u0634\u0626 \u0645\u0646\u064A\u0648 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A QR \u0627\u062D\u062A\u0631\u0627\u0641\u064A \u0644\u0645\u0637\u0639\u0645\u0643 \u0623\u0648 \u0645\u062A\u062C\u0631\u0643 \u062E\u0644\u0627\u0644 \u062F\u0642\u0627\u0626\u0642 \u0648\u0627\u0633\u062A\u0642\u0628\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0645\u0628\u0627\u0634\u0631\u0629 \u0639\u0644\u0649 \u0648\u0627\u062A\u0633\u0627\u0628 \u0628\u0640 0% \u0639\u0645\u0648\u0644\u0629. \u062A\u0635\u0645\u064A\u0645 \u0645\u062A\u0643\u0627\u0645\u0644\u060C \u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0633\u062D\u0627\u0628\u064A\u0629\u060C \u0648\u062B\u064A\u0645\u0627\u062A \u0646\u0647\u0627\u0631\u064A\u0629 \u0648\u0644\u064A\u0644\u064A\u0629.";
    let noIndex = false;
    const jsonLdBlocks = [];
    if (cleanPath.startsWith("/admin") || cleanPath.startsWith("/dashboard") || cleanPath === "/login" || cleanPath === "/signup" || cleanPath === "/forgot" || cleanPath === "/onboard") {
      noIndex = true;
    }
    const segs = cleanPath.replace(/^\/+/, "").split("/").filter(Boolean);
    let targetSlugOrId = "";
    if (segs[0] === "menu" && segs[1]) {
      targetSlugOrId = decodeURIComponent(segs[1]);
    } else if (segs.length === 1 && !SEO_RESERVED_SEGMENTS.has(segs[0].toLowerCase())) {
      targetSlugOrId = decodeURIComponent(segs[0]);
    }
    if (targetSlugOrId) {
      const targetLower = targetSlugOrId.toLowerCase();
      let matchedRest;
      if (allData[`restaurants/${targetSlugOrId}`]) {
        matchedRest = allData[`restaurants/${targetSlugOrId}`];
      } else {
        for (const [k, v] of Object.entries(allData)) {
          if (!k.startsWith("restaurants/") || !v || typeof v !== "object") continue;
          const r = v;
          if (String(r.slug || "").toLowerCase() === targetLower || String(r.subdomain || "").toLowerCase() === targetLower) {
            matchedRest = r;
            break;
          }
        }
      }
      if (matchedRest) {
        const restName = String(matchedRest.n || "\u0627\u0644\u0645\u0646\u064A\u0648 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A");
        const rawTagline = String(matchedRest.tagline || "").trim();
        const isMatchedStore = String(matchedRest.projectType || "").toLowerCase().trim() === "store";
        const cleanTagline = isMatchedStore && rawTagline === "\u0623\u0634\u0647\u0649 \u0627\u0644\u0623\u0637\u0628\u0627\u0642 \u0627\u0644\u0645\u062D\u0636\u0631\u0629 \u064A\u0648\u0645\u064A\u0627\u064B \u0637\u0627\u0632\u062C\u0629 \u0628\u062C\u0648\u062F\u0629 \u0639\u0627\u0644\u064A\u0629" ? "" : rawTagline;
        const restAbout = String(cleanTagline || matchedRest.aboutText || "").trim();
        pageTitle = `${restName} \u2013 \u0627\u0644\u0645\u0646\u064A\u0648 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0648\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0648\u0627\u062A\u0633\u0627\u0628 | \u0645\u0646\u064A\u0648 \u0628\u0644\u0633`;
        pageDesc = restAbout ? `${restName}: ${restAbout.slice(0, 130)} \u2014 \u062A\u0635\u0641\u062D \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0648\u0627\u0637\u0644\u0628 \u0627\u0644\u0622\u0646 \u0639\u0628\u0631 \u0645\u0646\u064A\u0648 \u0628\u0644\u0633.` : `\u062A\u0635\u0641\u062D \u0642\u0627\u0626\u0645\u0629 \u0637\u0639\u0627\u0645 \u0648\u0645\u0646\u062A\u062C\u0627\u062A ${restName} \u0645\u0639 \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0648\u0627\u0644\u0635\u0648\u0631 \u0648\u0627\u0637\u0644\u0628 \u0645\u0628\u0627\u0634\u0631\u0629 \u0639\u0628\u0631 \u0648\u0627\u062A\u0633\u0627\u0628 \u0639\u0644\u0649 \u0645\u0646\u0635\u0629 \u0645\u0646\u064A\u0648 \u0628\u0644\u0633.`;
        jsonLdBlocks.push({
          "@context": "https://schema.org",
          "@type": matchedRest.projectType === "store" ? "Store" : "Restaurant",
          name: restName,
          description: pageDesc,
          url: canonicalUrl,
          ...matchedRest.ph ? { telephone: String(matchedRest.ph) } : {},
          ...matchedRest.logo && !String(matchedRest.logo).startsWith("data:") ? { image: String(matchedRest.logo) } : {},
          hasMenu: canonicalUrl
        });
      }
    } else if (!noIndex) {
      const homeDoc = allData["settings/home"];
      const faqItems = (homeDoc?.faq?.items && homeDoc.faq.items.length > 0 ? homeDoc.faq.items.filter((f) => f.visible !== false && f.q && f.a) : DEFAULT_SEO_FAQS).map((f) => ({
        "@type": "Question",
        name: String(f.q),
        acceptedAnswer: {
          "@type": "Answer",
          text: String(f.a)
        }
      }));
      jsonLdBlocks.push({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "\u0645\u0646\u064A\u0648 \u0628\u0644\u0633 \u2013 Menu+",
        alternateName: ["Menu Plus", "Menu+", "\u0645\u0646\u064A\u0648 \u0628\u0644\u0633 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A"],
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, iOS, Android",
        inLanguage: ["ar", "en", "ku"],
        url: origin,
        description: pageDesc,
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "IQD",
          lowPrice: "9000",
          highPrice: "29000",
          offerCount: "3"
        }
      });
      if (faqItems.length > 0 && homeDoc?.faq?.enabled !== false) {
        jsonLdBlocks.push({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqItems
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
    const seoTags = [
      `<link rel="canonical" href="${safeCanonical}" />`,
      `<meta property="og:url" content="${safeCanonical}" />`,
      `<meta name="robots" content="${noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1"}" />`,
      ...jsonLdBlocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b).replace(/</g, "\\u003c")}</script>`)
    ];
    if (out.includes("</head>")) {
      out = out.replace("</head>", `  ${seoTags.join("\n  ")}
  </head>`);
    }
    return out;
  } catch {
    return html;
  }
}
app.get("/robots.txt", (req, res) => {
  const origin = resolveRequestOrigin(req);
  res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8").setHeader("Cache-Control", "public, max-age=3600").send(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /admin/",
      "Disallow: /dashboard",
      "Disallow: /dashboard/",
      "Disallow: /login",
      "Disallow: /signup",
      "Disallow: /forgot",
      "Disallow: /onboard",
      "Disallow: /api/",
      `Sitemap: ${origin}/sitemap.xml`
    ].join("\n")
  );
});
app.get("/sitemap.xml", async (req, res) => {
  try {
    const origin = resolveRequestOrigin(req);
    const allData = await readAll(false).catch(() => ({}));
    const nowIso = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const demoRest = allData["restaurants/demo"];
    const demoSlug = sanitizeSubdomainValue(String(demoRest?.slug || "")) || "cap-burger";
    const entries = [
      { loc: `${origin}/`, priority: "1.0", changefreq: "daily" },
      { loc: `${origin}/services`, priority: "0.9", changefreq: "weekly" },
      { loc: `${origin}/steps`, priority: "0.8", changefreq: "weekly" },
      { loc: `${origin}/pricing`, priority: "0.9", changefreq: "weekly" },
      { loc: `${origin}/faq`, priority: "0.8", changefreq: "weekly" },
      { loc: `${origin}/${encodeURIComponent(demoSlug)}`, priority: "0.85", changefreq: "daily" }
    ];
    const seen = new Set(entries.map((e) => e.loc));
    for (const [k, v] of Object.entries(allData)) {
      if (!k.startsWith("restaurants/") || !v || typeof v !== "object") continue;
      const r = v;
      const id = String(r.id || k.slice("restaurants/".length));
      if (!id || id === "demo" || r.a === 0) continue;
      const slug = sanitizeSubdomainValue(String(r.slug || r.subdomain || "")) || id;
      const loc = `${origin}/${encodeURIComponent(slug)}`;
      if (!seen.has(loc)) {
        seen.add(loc);
        entries.push({ loc, priority: "0.75", changefreq: "daily" });
      }
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
` + entries.map(
      (e) => `  <url>
    <loc>${xmlEscape(e.loc)}</loc>
    <lastmod>${nowIso}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
    ).join("\n") + `
</urlset>`;
    return res.status(200).setHeader("Content-Type", "application/xml; charset=utf-8").setHeader("Cache-Control", "public, max-age=1800").send(xml);
  } catch {
    return res.status(500).setHeader("Content-Type", "text/plain").send("Failed to generate sitemap");
  }
});
app.use(subdomainMiddleware());
async function runStartupMigrations() {
  const allData = await readAll(false).catch(() => ({}));
  const putData = {};
  const delKeys = [];
  if (!allData["migrations/purged_7833239944_v3"]) {
    const targetKeys = new Set(normalizePhoneKeys("07833239944"));
    const matchesTarget = (val) => typeof val === "string" && val.trim() !== "" && normalizePhoneKeys(val).some((k) => targetKeys.has(k));
    for (const [k, v] of Object.entries(allData)) {
      if (!v || typeof v !== "object") continue;
      const rec = v;
      if (k.startsWith("accounts/")) {
        const isProtectedAdmin = k === "accounts/acc_admin_owner" || rec.admin === true || rec.r === "admin";
        if (!isProtectedAdmin && (matchesTarget(rec.phone) || matchesTarget(rec.projectPhone) || matchesTarget(rec.em) || matchesTarget(rec.username) || matchesTarget(rec.e) || matchesTarget(rec.u))) {
          delKeys.push(k);
          if (rec.rid && rec.rid !== "demo") {
            await clearAuthSessionsByTarget(String(rec.rid), k.slice("accounts/".length)).catch(() => {
            });
          }
        }
      } else if (k.startsWith("staff/")) {
        if (matchesTarget(rec.phone) || matchesTarget(rec.email)) {
          delKeys.push(k);
        }
      } else if (k.startsWith("restaurants/") && !k.slice("restaurants/".length).includes("/")) {
        if (matchesTarget(rec.ph) || matchesTarget(rec.ow)) {
          putData[k] = {
            ...rec,
            ...matchesTarget(rec.ph) ? { ph: "" } : {},
            ...matchesTarget(rec.ow) ? { ow: "" } : {}
          };
        }
      }
    }
    await deleteTelegramUserByPhone("07833239944").catch(() => {
    });
    await deleteTelegramUserByPhone("9647833239944").catch(() => {
    });
    putData["migrations/purged_7833239944_v3"] = true;
  }
  if (!allData["migrations/default_light_platform_v1"]) {
    const existingSite = allData["settings/site"] && typeof allData["settings/site"] === "object" ? allData["settings/site"] : {};
    const existingTheme = allData["settings/theme"] && typeof allData["settings/theme"] === "object" ? allData["settings/theme"] : {};
    putData["settings/site"] = {
      ...existingSite,
      homeThemeMode: "light"
    };
    putData["settings/theme"] = {
      c1: "#0F766E",
      c2: "#FFFFFF",
      c3: "#059669",
      bg: "#F8FAFC",
      mode: "light",
      c4: "#F1F5F9",
      c5: "#0F766E",
      font: existingTheme.font && !String(existingTheme.font).toLowerCase().startsWith("thmanyah") ? existingTheme.font : "tajawal",
      ...existingTheme.typography ? { typography: existingTheme.typography } : {},
      preset: "clean_light"
    };
    putData["migrations/default_light_platform_v1"] = true;
  }
  if (!allData["migrations/hero_iraq_copy_v1"]) {
    const existingHome = allData["settings/home"] && typeof allData["settings/home"] === "object" ? allData["settings/home"] : {};
    const existingHero = existingHome.hero && typeof existingHome.hero === "object" ? existingHome.hero : {};
    putData["settings/home"] = {
      ...existingHome,
      hero: {
        ...existingHero,
        titleLine1: "\u0627\u0644\u0645\u0646\u064A\u0648 \u0627\u0644\u0623\u0630\u0643\u0649 \u0628\u0627\u0644\u0639\u0631\u0627\u0642",
        titleLine2: "\u0644\u0645\u062A\u062C\u0631\u0643 \u0623\u0648 \u0645\u0637\u0639\u0645\u0643",
        title: "\u0627\u0644\u0645\u0646\u064A\u0648 \u0627\u0644\u0623\u0630\u0643\u0649 \u0628\u0627\u0644\u0639\u0631\u0627\u0642 \u2014 \u0644\u0645\u062A\u062C\u0631\u0643 \u0623\u0648 \u0645\u0637\u0639\u0645\u0643",
        lead: "\u0623\u0637\u0644\u0642 \u0645\u062A\u062C\u0631\u0643 \u0627\u0644\u0622\u0646 \u0648\u0627\u0633\u062A\u0642\u0628\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A"
      }
    };
    putData["migrations/hero_iraq_copy_v1"] = true;
  }
  if (!allData["migrations/root_codes_and_disable_google_subdomain_v1"]) {
    const existingSite = putData["settings/site"] && typeof putData["settings/site"] === "object" ? putData["settings/site"] : allData["settings/site"] && typeof allData["settings/site"] === "object" ? allData["settings/site"] : {};
    const normalizedSubRules = normalizeSubdomainRules(existingSite);
    putData["settings/site"] = {
      ...existingSite,
      googleAuthEnabled: false,
      subdomainRules: {
        ...normalizedSubRules,
        enabled: false
      }
    };
    const existingHome = putData["settings/home"] && typeof putData["settings/home"] === "object" ? putData["settings/home"] : allData["settings/home"] && typeof allData["settings/home"] === "object" ? allData["settings/home"] : null;
    if (existingHome) {
      const existingHero = existingHome.hero && typeof existingHome.hero === "object" ? existingHome.hero : {};
      const curCta1 = String(existingHero.cta1Link || "").trim();
      if (!curCta1 || curCta1 === "/menu/demo") {
        putData["settings/home"] = {
          ...existingHome,
          hero: {
            ...existingHero,
            cta1Link: "/cap-burger"
          }
        };
      }
    }
    const plansList = extractPlansList(allData["settings/plans"]);
    if (allData["settings/plans"] && typeof allData["settings/plans"] === "object") {
      const rawPlansDoc = allData["settings/plans"];
      if (Array.isArray(rawPlansDoc.list)) {
        putData["settings/plans"] = {
          ...rawPlansDoc,
          list: rawPlansDoc.list.map((pl) => ({
            ...pl,
            featuresMap: {
              ...pl.featuresMap || {},
              customSlug: !(pl.id === "free" && Number(pl.pr || 0) <= 0)
            }
          }))
        };
      }
    }
    const takenSlugs = /* @__PURE__ */ new Set();
    const restEntries = [];
    for (const [k, v] of Object.entries(allData)) {
      if (!k.startsWith("restaurants/") || k.slice("restaurants/".length).includes("/") || !v || typeof v !== "object") {
        continue;
      }
      const rec = putData[k] || v;
      restEntries.push([k, rec]);
    }
    for (const [k, rec] of restEntries) {
      const rid = k.slice("restaurants/".length);
      if (rid === "demo") {
        takenSlugs.add("cap-burger");
        continue;
      }
      const { isPaid } = isPaidPlanForRestaurant(rec, plansList);
      if (isPaid) {
        const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ""));
        if (curSlug && curSlug.length >= 3 && !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug) && !takenSlugs.has(curSlug)) {
          takenSlugs.add(curSlug);
        }
      }
    }
    for (const [k, rec] of restEntries) {
      const rid = k.slice("restaurants/".length);
      if (rid === "demo") {
        const demoSlug = sanitizeSubdomainValue(String(rec.slug || "")) || "cap-burger";
        putData[k] = {
          ...rec,
          slug: demoSlug,
          subdomain: "",
          isPaid: true
        };
        continue;
      }
      const { isPaid } = isPaidPlanForRestaurant(rec, plansList);
      const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ""));
      let nextSlug;
      if (isPaid) {
        if (curSlug && curSlug.length >= 3 && !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
          nextSlug = curSlug;
          takenSlugs.add(curSlug);
        } else {
          nextSlug = generateUniqueMenuCode(takenSlugs);
        }
      } else {
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
        subdomain: ""
      };
    }
    putData["migrations/root_codes_and_disable_google_subdomain_v1"] = true;
  }
  if (!allData["migrations/branches_and_links_v2"]) {
    const existingSite = putData["settings/site"] && typeof putData["settings/site"] === "object" ? putData["settings/site"] : allData["settings/site"] && typeof allData["settings/site"] === "object" ? allData["settings/site"] : {};
    const subRules = normalizeSubdomainRules(existingSite);
    const plansList = extractPlansList(allData["settings/plans"]);
    const curHome = putData["settings/home"] && typeof putData["settings/home"] === "object" ? putData["settings/home"] : allData["settings/home"] && typeof allData["settings/home"] === "object" ? allData["settings/home"] : null;
    if (curHome?.hero && (String(curHome.hero.cta1Link || "").includes("/menu/") || !curHome.hero.cta1Link)) {
      putData["settings/home"] = {
        ...curHome,
        hero: {
          ...curHome.hero,
          cta1Link: "/cap-burger"
        }
      };
    }
    const takenSlugs = /* @__PURE__ */ new Set(["cap-burger"]);
    const restItems = [];
    for (const [k, v] of Object.entries(allData)) {
      if (!k.startsWith("restaurants/") || k.slice("restaurants/".length).includes("/") || !v || typeof v !== "object") {
        continue;
      }
      const rec = putData[k] || v;
      restItems.push([k, rec]);
      const rid = k.slice("restaurants/".length);
      if (rid === "demo") continue;
      const parentRec = rec.parentRid ? allData[`restaurants/${rec.parentRid}`] : void 0;
      const { isPaid } = isPaidPlanForRestaurant(parentRec || rec, plansList);
      const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ""));
      if (isPaid && curSlug && curSlug.length >= 3 && !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
        takenSlugs.add(curSlug);
      } else if (!isPaid && isValidSixCharCode(curSlug) && !SYSTEM_RESERVED_SUBDOMAINS.has(curSlug)) {
        takenSlugs.add(curSlug);
      }
    }
    for (const [k, rec] of restItems) {
      const rid = k.slice("restaurants/".length);
      if (rid === "demo") continue;
      const parentRec = rec.parentRid ? allData[`restaurants/${rec.parentRid}`] : void 0;
      const { isPaid } = isPaidPlanForRestaurant(parentRec || rec, plansList);
      const curSlug = sanitizeSubdomainValue(String(rec.slug || rec.subdomain || ""));
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
      const nextSubdomain = subRules.enabled && isPaid ? nextSlug : "";
      if (rec.slug !== nextSlug || (rec.subdomain || "") !== nextSubdomain || Boolean(rec.isPaid) !== isPaid) {
        putData[k] = {
          ...rec,
          isPaid,
          slug: nextSlug,
          subdomain: nextSubdomain
        };
      }
    }
    putData["migrations/branches_and_links_v2"] = true;
  }
  if (!allData["migrations/home_phone_demo_off_v1"]) {
    const curHome = putData["settings/home"] && typeof putData["settings/home"] === "object" ? putData["settings/home"] : allData["settings/home"] && typeof allData["settings/home"] === "object" ? allData["settings/home"] : {};
    const curSections = curHome.sections && typeof curHome.sections === "object" ? curHome.sections : {};
    const { phoneDemo: _legacyPhoneDemo, ...restHome } = curHome;
    putData["settings/home"] = {
      ...restHome,
      sections: {
        hero: curSections.hero !== false,
        services: curSections.services !== false,
        faq: curSections.faq !== false,
        pricing: curSections.pricing !== false,
        footer: curSections.footer !== false
      }
    };
    putData["migrations/home_phone_demo_off_v1"] = true;
  }
  if (!allData["migrations/cap_burger_phone_07833239944_v1"]) {
    const curDemo = putData["restaurants/demo"] && typeof putData["restaurants/demo"] === "object" ? putData["restaurants/demo"] : allData["restaurants/demo"] && typeof allData["restaurants/demo"] === "object" ? allData["restaurants/demo"] : null;
    if (curDemo) {
      putData["restaurants/demo"] = {
        ...curDemo,
        ph: "07724799679"
      };
    }
    putData["migrations/cap_burger_phone_07833239944_v1"] = true;
  }
  if (!allData["migrations/platform_phone_07724799679_v1"]) {
    const curSite = putData["settings/site"] && typeof putData["settings/site"] === "object" ? putData["settings/site"] : allData["settings/site"] && typeof allData["settings/site"] === "object" ? allData["settings/site"] : {};
    const oldPlaceholders = /* @__PURE__ */ new Set(["", "07833239944", "9647833239944", "+9647833239944", "07701234567"]);
    const curWa = String(curSite.wa || "").trim();
    const curSupportWa = String(curSite.supportWhatsapp || "").trim();
    if (oldPlaceholders.has(curWa) || oldPlaceholders.has(curSupportWa)) {
      putData["settings/site"] = {
        ...curSite,
        wa: oldPlaceholders.has(curWa) ? "07724799679" : curWa,
        supportWhatsapp: oldPlaceholders.has(curSupportWa) ? "07724799679" : curSupportWa
      };
    }
    const curDemo = putData["restaurants/demo"] && typeof putData["restaurants/demo"] === "object" ? putData["restaurants/demo"] : allData["restaurants/demo"] && typeof allData["restaurants/demo"] === "object" ? allData["restaurants/demo"] : null;
    if (curDemo) {
      const curSocial = curDemo.social && typeof curDemo.social === "object" ? curDemo.social : {};
      const curDemoSocialWa = String(curSocial.whatsapp || "").trim();
      putData["restaurants/demo"] = {
        ...curDemo,
        ph: "07724799679",
        social: {
          ...curSocial,
          whatsapp: !curDemoSocialWa || curDemoSocialWa === "9647711448594" || curDemoSocialWa.includes("7833239944") ? "9647724799679" : curDemoSocialWa
        }
      };
    }
    putData["migrations/platform_phone_07724799679_v1"] = true;
  }
  if (!allData["migrations/disable_signup_default_v1"]) {
    const curSite = putData["settings/site"] && typeof putData["settings/site"] === "object" ? putData["settings/site"] : allData["settings/site"] && typeof allData["settings/site"] === "object" ? allData["settings/site"] : {};
    putData["settings/site"] = {
      ...curSite,
      signupEnabled: false,
      su: 0
    };
    putData["migrations/disable_signup_default_v1"] = true;
  }
  if (!allData["migrations/remove_thmanyah_default_tajawal_v1"]) {
    const curTheme = putData["settings/theme"] && typeof putData["settings/theme"] === "object" ? putData["settings/theme"] : allData["settings/theme"] && typeof allData["settings/theme"] === "object" ? allData["settings/theme"] : {};
    const curTypo = curTheme.typography && typeof curTheme.typography === "object" ? { ...curTheme.typography } : {};
    delete curTypo.thmanyahFamily;
    const rawKey = String(curTypo.fontKey || curTheme.font || "").trim().toLowerCase();
    const normalizedKey = rawKey === "firjar" ? "firjar" : rawKey === "alan_sans" || rawKey === "alansans" || rawKey === "alan sans" ? "alan_sans" : "tajawal";
    putData["settings/theme"] = {
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
        fontStretch: curTypo.fontStretch ?? 100
      }
    };
    putData["migrations/curated_google_fonts_cleanup_v1"] = true;
    putData["migrations/remove_thmanyah_default_tajawal_v1"] = true;
  }
  if (allData["migrations/thmanyah_serif_display_headings_v1"]) {
    delKeys.push("migrations/thmanyah_serif_display_headings_v1");
  }
  if (!allData["migrations/demo_platform_admin_07711448594_v1"] || !allData["accounts/acc_admin_demo"]) {
    putData["accounts/acc_admin_demo"] = {
      id: "acc_admin_demo",
      n: "\u0645\u062F\u064A\u0631 \u0645\u0646\u0635\u0629 \u062A\u062C\u0631\u064A\u0628\u064A",
      roleTitle: "\u0645\u062F\u064A\u0631 \u0645\u0646\u0635\u0629 \u062A\u062C\u0631\u064A\u0628\u064A",
      em: "07711448594",
      username: "07711448594",
      phone: "+9647711448594",
      pw: "29a217776b53a000d9a17f20587c7983ab7749f3d03a566b0aac9684cec5cbd4",
      rid: "demo",
      admin: true,
      active: true,
      at: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
    };
    putData["migrations/demo_platform_admin_07711448594_v1"] = true;
  }
  if (allData["migrations/telegram_otp_off_v1"]) {
    const curSite = putData["settings/site"] && typeof putData["settings/site"] === "object" ? { ...putData["settings/site"] } : allData["settings/site"] && typeof allData["settings/site"] === "object" ? { ...allData["settings/site"] } : null;
    if (curSite && "telegramAuthEnabled" in curSite) {
      delete curSite.telegramAuthEnabled;
      putData["settings/site"] = curSite;
    }
    await updateAdminTelegramConfig({ enabled: true }).catch(() => {
    });
    delKeys.push("migrations/telegram_otp_off_v1");
  }
  if (!allData["migrations/remove_free_plan_v1"]) {
    const existingPlans = allData["settings/plans"] && typeof allData["settings/plans"] === "object" ? allData["settings/plans"] : null;
    if (existingPlans && Array.isArray(existingPlans.list)) {
      const nextList = existingPlans.list.filter(
        (pl) => pl && pl.id !== "free" && Number(pl.pr) > 0
      );
      putData["settings/plans"] = {
        ...existingPlans,
        list: nextList,
        planNoFreeV8: true
      };
    }
    const existingHome = allData["settings/home"] && typeof allData["settings/home"] === "object" ? { ...allData["settings/home"] } : null;
    if (existingHome) {
      if (existingHome.nav && typeof existingHome.nav === "object") {
        existingHome.nav = { ...existingHome.nav };
        if (existingHome.nav.modalSignup === "\u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0645\u062C\u0627\u0646\u064A") {
          existingHome.nav.modalSignup = "\u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628";
        }
      }
      if (existingHome.hero && typeof existingHome.hero === "object") {
        existingHome.hero = { ...existingHome.hero };
        if (typeof existingHome.hero.cta1 === "string" && /مجانا|مجاناً/i.test(existingHome.hero.cta1)) {
          existingHome.hero.cta1 = "\u062C\u0631\u0628 \u0627\u0644\u0645\u0646\u064A\u0648 \u0627\u0644\u0627\u0646";
        }
      }
      if (existingHome.pricing && typeof existingHome.pricing === "object") {
        const nextPricing = { ...existingHome.pricing };
        delete nextPricing.freeBadge;
        delete nextPricing.freeCta;
        if (typeof nextPricing.sub !== "string" || /مجان|مجانية|تجريبية/i.test(nextPricing.sub)) {
          nextPricing.sub = "\u0627\u0634\u062A\u0631\u0643 \u0628\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0645\u0634\u0631\u0648\u0639\u0643 \u0628\u062F\u0648\u0646 \u0623\u064A \u0639\u0645\u0648\u0644\u0629 \u0639\u0644\u0649 \u0645\u0628\u064A\u0639\u0627\u062A\u0643\u060C \u0648\u0637\u0648\u0651\u0631 \u0628\u0627\u0642\u062A\u0643 \u0641\u064A \u0623\u064A \u0648\u0642\u062A \u0645\u0639 \u0646\u0645\u0648 \u0637\u0644\u0628\u0627\u062A\u0643.";
        }
        existingHome.pricing = nextPricing;
      }
      if (existingHome.faq && Array.isArray(existingHome.faq.items)) {
        existingHome.faq = {
          ...existingHome.faq,
          items: existingHome.faq.items.map(
            (item) => item?.id === "faq_5" || /الباقة المجانية|أبدأ مجاناً/i.test(`${item?.q || ""} ${item?.a || ""}`) ? {
              ...item,
              q: "\u0643\u064A\u0641 \u064A\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u0645\u0627 \u0647\u064A \u0627\u0644\u0628\u0627\u0642\u0627\u062A \u0627\u0644\u0645\u062A\u0648\u0641\u0631\u0629\u061F",
              a: "\u0646\u0648\u0641\u0631 3 \u0628\u0627\u0642\u0627\u062A \u0645\u0631\u0646\u0629 (\u0627\u0644\u0627\u0642\u062A\u0635\u0627\u062F\u064A\u0629\u060C \u0627\u0644\u0627\u062D\u062A\u0631\u0627\u0641\u064A\u0629\u060C \u0648\u0628\u0627\u0642\u0629 \u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0634\u0627\u0645\u0644\u0629) \u0628\u0627\u0634\u062A\u0631\u0627\u0643 \u0634\u0647\u0631\u064A \u0623\u0648 \u0633\u0646\u0648\u064A \u0628\u062F\u0648\u0646 \u0623\u064A \u0639\u0645\u0648\u0644\u0627\u062A \u0639\u0644\u0649 \u0645\u0628\u064A\u0639\u0627\u062A\u0643\u060C \u0648\u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u062A\u0631\u0642\u064A\u0629 \u0628\u064A\u0646 \u0627\u0644\u0628\u0627\u0642\u0627\u062A \u0641\u064A \u0623\u064A \u0648\u0642\u062A."
            } : item
          )
        };
      }
      putData["settings/home"] = existingHome;
    }
    for (const [k, v] of Object.entries(allData)) {
      if (!k.startsWith("restaurants/") || k.slice("restaurants/".length).includes("/") || !v || typeof v !== "object") {
        continue;
      }
      const r = v;
      const planStr = String(r.p || "").trim();
      if (r.planId === "free" || planStr === "\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0645\u062C\u0627\u0646\u064A\u0629" || planStr === "\u0627\u0644\u0628\u062F\u0627\u064A\u0629 \u0627\u0644\u0645\u062C\u0627\u0646\u064A\u0629") {
        putData[k] = {
          ...r,
          planId: "starter",
          p: "\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u0627\u0642\u062A\u0635\u0627\u062F\u064A\u0629",
          isPaid: true
        };
      }
    }
    putData["migrations/remove_free_plan_v1"] = true;
  }
  for (const k of Object.keys(allData)) {
    if (k.startsWith("promo_codes/")) {
      delKeys.push(k);
    } else if (k.startsWith("items/")) {
      const itemRec = allData[k];
      if (itemRec && typeof itemRec.img === "string" && itemRec.img.includes("1576107232684-1279f3908594")) {
        putData[k] = {
          ...itemRec,
          img: "/uploads/hmo/item_046.jpg"
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
    console.warn("[Startup Migration] Failed:", err);
  });
  if (isProduction) {
    const localDist = path5.resolve(__dirname, "dist");
    const cwdDist = path5.resolve(process.cwd(), "dist");
    const distDir = fs5.existsSync(path5.join(localDist, "index.html")) ? localDist : cwdDist;
    const distAssetsDir = path5.join(distDir, "assets");
    const indexHtmlPath = path5.join(distDir, "index.html");
    if (fs5.existsSync(distAssetsDir)) {
      app.use(
        "/assets",
        express2.static(distAssetsDir, {
          maxAge: "1y",
          immutable: true,
          index: false
        })
      );
    }
    app.use(
      express2.static(distDir, {
        maxAge: "7d",
        index: false
      })
    );
    const cachedProdHtml = fs5.existsSync(indexHtmlPath) ? fs5.readFileSync(indexHtmlPath, "utf-8") : null;
    app.get("*", async (req, res, next) => {
      if (req.path.startsWith("/assets/") || ASSET_EXTENSION_RE.test(req.path)) {
        return res.status(404).end();
      }
      const rawHtml = cachedProdHtml || (fs5.existsSync(indexHtmlPath) ? fs5.readFileSync(indexHtmlPath, "utf-8") : null);
      if (!rawHtml) {
        return res.status(500).send("Build output not found. Run npm run build first.");
      }
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      try {
        const subdomainResolved = res.locals.subdomainResolved;
        if (subdomainResolved?.found) {
          const injected = injectSubdomainHtmlMeta(rawHtml, subdomainResolved);
          return res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(injected);
        }
        const seoInjected = await injectSeoMetaIntoHtml(rawHtml, req);
        return res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(seoInjected);
      } catch (err) {
        return next(err);
      }
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== "true" },
      appType: "spa"
    });
    app.get("*", async (req, res, next) => {
      if (req.path.startsWith("/@") || req.path.startsWith("/src/") || req.path.startsWith("/node_modules/") || ASSET_EXTENSION_RE.test(req.path)) {
        return next();
      }
      try {
        const rawTemplate = fs5.readFileSync(path5.resolve(process.cwd(), "index.html"), "utf-8");
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawTemplate);
        const subdomainResolved = res.locals.subdomainResolved;
        if (subdomainResolved?.found) {
          const injected = injectSubdomainHtmlMeta(transformed, subdomainResolved);
          return res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(injected);
        }
        const seoInjected = await injectSeoMetaIntoHtml(transformed, req);
        return res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(seoInjected);
      } catch (err) {
        return next(err);
      }
    });
    app.use(vite.middlewares);
  }
  const onListening = () => {
    const addr = typeof PORT === "number" ? `http://0.0.0.0:${PORT}` : String(PORT);
    console.log(`Menu+ server running on ${addr} (${isProduction ? "production" : "development"})`);
    const dbInfo = getDatabaseUrlInfo();
    if (dbInfo.configured && dbInfo.valid) {
      console.log(`[Database] DATABASE_URL configured (${dbInfo.host}:${dbInfo.port}/${dbInfo.database})`);
    } else if (dbInfo.configured && !dbInfo.valid) {
      console.warn(`[Database] DATABASE_URL invalid: ${dbInfo.error}`);
    } else {
      console.warn("[Database] DATABASE_URL is not set.");
    }
    startTelegramBotPolling().catch((err) => {
      console.warn("[Telegram Bot] Failed to start polling:", err);
    });
  };
  const server = typeof PORT === "number" ? app.listen(PORT, "0.0.0.0", onListening) : app.listen(PORT, onListening);
  const shutdown = (signal) => {
    console.log(`[Server] Received ${signal}, shutting down gracefully...`);
    stopTelegramBotPolling();
    clearInterval(otpCleanupTimer);
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5e3).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
