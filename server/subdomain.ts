/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import {
  getInternalStoreItem,
  readPrefixFromStore,
  upsertRecordInStore,
} from './neon-store.ts';
import { requireAdminOrStaff } from './auth.ts';

export interface SubdomainRules {
  enabled: boolean;
  baseDomain: string;
  maxLength: number;
  blockedKeywords: string[];
  allowHyphens: boolean;
}

export interface StoreRecord {
  id: string;
  n?: string;
  ow?: string;
  ph?: string;
  planId?: string;
  e?: string;
  a?: number;
  slug?: string;
  subdomain?: string;
  logo?: string;
  coverImages?: string[];
  tagline?: string;
  aboutText?: string;
  language?: string;
  isBranch?: boolean;
  parentRid?: string;
  [key: string]: unknown;
}

export interface PlanRecord {
  id: string;
  n?: string;
  pr?: number;
  featuresMap?: {
    customSlug?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ResolvedSubdomainResult {
  subdomain: string;
  rules: SubdomainRules;
  found: boolean;
  reason?: 'disabled' | 'blocked_keyword' | 'invalid_format' | 'not_found' | 'inactive' | 'expired' | 'unpaid_plan';
  restaurant?: StoreRecord;
  plan?: PlanRecord | null;
}

export const SYSTEM_RESERVED_SUBDOMAINS = new Set([
  'www',
  'admin',
  'api',
  'app',
  'mail',
  'smtp',
  'ftp',
  'cpanel',
  'webmail',
  'ns1',
  'ns2',
  'cdn',
  'static',
  'assets',
  'public',
  'dashboard',
  'login',
  'signup',
  'forgot',
  'onboard',
  'billing',
  'support',
  'help',
  'status',
  'menu',
  'home',
  'services',
  'steps',
  'demo',
  'pricing',
  'faq',
  'about',
  'root',
  'localhost',
]);

const MENU_CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function isValidSixCharCode(slug: string): boolean {
  return /^[a-z0-9]{6}$/.test(String(slug || '').trim().toLowerCase());
}

export function collectTakenMenuSlugs(restaurants: StoreRecord[]): Set<string> {
  const taken = new Set<string>();
  for (const r of restaurants) {
    const s1 = sanitizeSubdomainValue(String(r.slug || ''));
    const s2 = sanitizeSubdomainValue(String(r.subdomain || ''));
    if (s1) taken.add(s1);
    if (s2) taken.add(s2);
  }
  return taken;
}

export function generateUniqueMenuCode(takenSlugs: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
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

export const DEFAULT_SUBDOMAIN_RULES: SubdomainRules = {
  enabled: false,
  baseDomain: String(process.env.BASE_DOMAIN || 'menuplus.io').toLowerCase().trim(),
  maxLength: 32,
  blockedKeywords: [
    'admin',
    'www',
    'api',
    'mail',
    'root',
    'support',
    'menu',
    'app',
    'dashboard',
    'billing',
    'staff',
  ],
  allowHyphens: true,
};

export function sanitizeSubdomainValue(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeSubdomainRules(site?: Record<string, unknown> | null): SubdomainRules {
  const raw = (site?.subdomainRules && typeof site.subdomainRules === 'object'
    ? site.subdomainRules
    : {}) as Record<string, unknown>;

  const baseDomain =
    String(raw.baseDomain || DEFAULT_SUBDOMAIN_RULES.baseDomain)
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '') || 'menuplus.io';

  const maxLengthRaw = Number(raw.maxLength);
  const maxLength = Number.isFinite(maxLengthRaw)
    ? Math.min(63, Math.max(6, Math.round(maxLengthRaw)))
    : DEFAULT_SUBDOMAIN_RULES.maxLength;

  const blockedSource = Array.isArray(raw.blockedKeywords)
    ? raw.blockedKeywords
    : typeof raw.blockedKeywords === 'string'
      ? raw.blockedKeywords.split(/[,\n]/)
      : DEFAULT_SUBDOMAIN_RULES.blockedKeywords;

  const blockedKeywords = Array.from(
    new Set(
      blockedSource
        .map((k) => sanitizeSubdomainValue(String(k)))
        .filter(Boolean)
    )
  );

  return {
    enabled: raw.enabled === true,
    baseDomain,
    maxLength,
    blockedKeywords: blockedKeywords.length > 0 ? blockedKeywords : DEFAULT_SUBDOMAIN_RULES.blockedKeywords,
    allowHyphens: raw.allowHyphens !== false,
  };
}

export async function getSubdomainRulesFromStore(): Promise<SubdomainRules> {
  const site = await getInternalStoreItem<Record<string, unknown>>('settings/site');
  return normalizeSubdomainRules(site);
}

export function extractPlansList(storedPlans: unknown): PlanRecord[] {
  if (Array.isArray(storedPlans)) {
    return storedPlans as PlanRecord[];
  }
  if (storedPlans && typeof storedPlans === 'object' && Array.isArray((storedPlans as { list?: unknown }).list)) {
    return (storedPlans as { list: PlanRecord[] }).list;
  }
  return [];
}

export function getRequestHostHeader(req: Request): string {
  return String(
    req.headers['x-forwarded-host'] ||
      req.headers['x-original-host'] ||
      req.headers['x-host'] ||
      req.headers.host ||
      req.hostname ||
      ''
  );
}

/**
 * Extracts the tenant subdomain from `req.headers['x-forwarded-host'] || req.headers.host`.
 * Returns null for bare main domain (`menuplus.io`), `www`, `admin`, `api`, preview hosts, or IP addresses.
 */
export function extractSubdomainFromHost(
  hostHeader: string | undefined,
  baseDomain = DEFAULT_SUBDOMAIN_RULES.baseDomain
): string | null {
  const rawHost = String(hostHeader || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .split(':')[0]
    .replace(/\.+$/, '');

  if (!rawHost) return null;

  // Ignore bare IPv4 / IPv6 addresses
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(rawHost) || rawHost.includes('[')) {
    return null;
  }

  // Ignore platform preview domains (e.g., *.run.app, *.aistudio.google.com, etc.)
  if (
    rawHost === 'localhost' ||
    rawHost === '127.0.0.1' ||
    rawHost.endsWith('.run.app') ||
    rawHost.endsWith('.googleusercontent.com') ||
    rawHost.endsWith('.web.app')
  ) {
    // Support local dev subdomain testing via `<store>.localhost`
    if (rawHost.endsWith('.localhost')) {
      const candidate = rawHost.slice(0, -'.localhost'.length).replace(/^www\./, '');
      if (!candidate || candidate.includes('.') || SYSTEM_RESERVED_SUBDOMAINS.has(candidate)) {
        return null;
      }
      return candidate;
    }
    return null;
  }

  const cleanBase = baseDomain.toLowerCase().replace(/^www\./, '').replace(/\.+$/, '');
  if (rawHost === cleanBase || rawHost === `www.${cleanBase}`) {
    return null;
  }

  const suffix = `.${cleanBase}`;
  if (rawHost.endsWith(suffix)) {
    let sub = rawHost.slice(0, -suffix.length);
    if (sub.startsWith('www.')) {
      sub = sub.slice(4);
    }
    if (!sub || sub.includes('.') || SYSTEM_RESERVED_SUBDOMAINS.has(sub)) {
      return null;
    }
    return sub;
  }

  return null;
}

export function validatePathSlugFormat(
  sub: string,
  rules: SubdomainRules
): { valid: boolean; reason?: 'blocked_keyword' | 'invalid_format'; message?: string } {
  const clean = String(sub || '').trim().toLowerCase();
  if (!clean || clean.length < 3 || clean.length > rules.maxLength) {
    return {
      valid: false,
      reason: 'invalid_format',
      message: `يجب أن يتكون اسم الرابط من 3 إلى ${rules.maxLength} حرفاً إنجليزياً أو رقماً.`,
    };
  }

  const pattern = rules.allowHyphens ? /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/ : /^[a-z0-9]+$/;
  if (!pattern.test(clean)) {
    return {
      valid: false,
      reason: 'invalid_format',
      message: 'يُسمح فقط بالأحرف الإنجليزية الصغيرة والأرقام والشرطة (-).',
    };
  }

  if (SYSTEM_RESERVED_SUBDOMAINS.has(clean) || rules.blockedKeywords.includes(clean)) {
    return {
      valid: false,
      reason: 'blocked_keyword',
      message: `الاسم "${clean}" محجوز للنظام، يرجى اختيار اسم مختلف.`,
    };
  }

  return { valid: true };
}

export function validateSubdomainFormat(
  sub: string,
  rules: SubdomainRules
): { valid: boolean; reason?: 'disabled' | 'blocked_keyword' | 'invalid_format'; message?: string } {
  if (!rules.enabled) {
    return {
      valid: false,
      reason: 'disabled',
      message: 'ميزة الدومينات الفرعية معطلة حالياً من إعدادات الإدارة.',
    };
  }

  return validatePathSlugFormat(sub, rules);
}

export function isPaidPlanForRestaurant(
  rest: StoreRecord | undefined | null,
  plansList: PlanRecord[]
): { isPaid: boolean; plan: PlanRecord | null } {
  if (!rest) return { isPaid: false, plan: null };
  const planId = String(rest.planId || '').trim();
  const planName = String(rest.p || '').trim();
  const matched =
    plansList.find((p) => planId && p.id === planId) ||
    plansList.find((p) => planName && String(p.n || '').trim() === planName) ||
    plansList.find((p) => planId && String(p.n || '').trim() === planId) ||
    null;

  // Demo account
  if (rest.id === 'demo') {
    return { isPaid: true, plan: matched };
  }

  const explicitlyPaid = rest.isPaid === true;

  if (matched) {
    const customSlugFlag = matched.featuresMap?.customSlug;
    const price = Number(matched.pr || 0);
    const isPaid = explicitlyPaid || (customSlugFlag !== undefined ? Boolean(customSlugFlag) : price > 0);
    return { isPaid, plan: matched };
  }

  // Fallback when plan record not matched
  return {
    isPaid: explicitlyPaid || Boolean(planId),
    plan: null,
  };
}

export async function resolveStoreBySubdomain(subdomainRaw: string): Promise<ResolvedSubdomainResult> {
  const rules = await getSubdomainRulesFromStore();
  const subdomain = sanitizeSubdomainValue(subdomainRaw);
  const validation = validateSubdomainFormat(subdomain, rules);
  if (!validation.valid) {
    return {
      subdomain,
      rules,
      found: false,
      reason: validation.reason,
    };
  }

  const [{ items: restaurants }, storedPlans] = await Promise.all([
    readPrefixFromStore<StoreRecord>('restaurants/'),
    getInternalStoreItem<unknown>('settings/plans'),
  ]);
  const plansList = extractPlansList(storedPlans);

  const matched = restaurants.find((r) => {
    const s1 = sanitizeSubdomainValue(String(r.slug || ''));
    const s2 = sanitizeSubdomainValue(String(r.subdomain || ''));
    return s1 === subdomain || s2 === subdomain;
  });

  if (!matched) {
    return { subdomain, rules, found: false, reason: 'not_found' };
  }

  if (matched.a === 0) {
    return { subdomain, rules, found: false, reason: 'inactive', restaurant: matched };
  }

  if (matched.e) {
    const today = new Date().toISOString().slice(0, 10);
    if (String(matched.e) < today) {
      return { subdomain, rules, found: false, reason: 'expired', restaurant: matched };
    }
  }

  const { isPaid, plan } = isPaidPlanForRestaurant(matched, plansList);
  if (!isPaid) {
    return { subdomain, rules, found: false, reason: 'unpaid_plan', restaurant: matched, plan };
  }

  return {
    subdomain,
    rules,
    found: true,
    restaurant: matched,
    plan,
  };
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderStoreNotFoundHtml(subdomain: string, baseDomain = 'menuplus.io', reason?: string): string {
  const safeSub = escapeHtml(subdomain || 'store');
  const safeBase = escapeHtml(baseDomain || 'menuplus.io');
  const isUnpaidOrInactive = reason === 'unpaid_plan' || reason === 'inactive' || reason === 'expired';
  const subtitleAr = isUnpaidOrInactive
    ? 'هذا الدومين الفرعي غير مفعل حالياً لأن الاشتراك منتهي أو غير نشط.'
    : `لم نتمكن من العثور على متجر أو مطعم مسجل على النطاق الفرعي ${safeSub}.${safeBase}.`;
  const subtitleEn = isUnpaidOrInactive
    ? 'This custom store subdomain is currently paused or requires an active paid subscription.'
    : `Store not found for "${safeSub}.${safeBase}". It may have moved or is not activated yet.`;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Store not found | المتجر غير موجود — ${safeBase}</title>
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
    <div class="code">404 • STORE NOT FOUND</div>
    <h1>المتجر غير موجود</h1>
    <p>${subtitleAr}</p>
    <p class="en">${subtitleEn}</p>
    <a class="btn" href="https://${safeBase}">العودة إلى الرئيسية (${safeBase})</a>
  </main>
</body>
</html>`;
}

export function injectSubdomainHtmlMeta(
  html: string,
  resolved: ResolvedSubdomainResult
): string {
  const rest = resolved.restaurant;
  if (!rest) return html;

  const storeName = escapeHtml(String(rest.n || resolved.subdomain));
  const isStore = String(rest.projectType || '').toLowerCase().trim() === 'store';
  const rawTagline = String(rest.tagline || '').trim();
  const cleanTagline =
    isStore && rawTagline === 'أشهى الأطباق المحضرة يومياً طازجة بجودة عالية' ? '' : rawTagline;
  const tagline = escapeHtml(
    String(cleanTagline || rest.aboutText || `${storeName} – المنيو الإلكتروني الذكي والطلب المباشر على واتساب`)
  );
  const storeUrl = `https://${resolved.subdomain}.${resolved.rules.baseDomain}`;
  const bootstrapPayload = JSON.stringify({
    subdomain: resolved.subdomain,
    restaurantId: rest.id,
    name: rest.n || resolved.subdomain,
    baseDomain: resolved.rules.baseDomain,
  }).replace(/</g, '\\u003c');

  const ldJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': isStore ? 'Store' : 'Restaurant',
    name: String(rest.n || resolved.subdomain),
    description: String(cleanTagline || rest.aboutText || `${rest.n || resolved.subdomain} Digital Menu & Ordering`),
    url: storeUrl,
    ...(rest.ph ? { telephone: String(rest.ph) } : {}),
    ...(rest.logo && !String(rest.logo).startsWith('data:') ? { image: String(rest.logo) } : {}),
    hasMenu: storeUrl,
    servesCuisine: 'Arabic, Middle Eastern, Fast Food',
    acceptsReservations: 'False',
  }).replace(/</g, '\\u003c');

  const embedImg = escapeHtml(`${storeUrl}/assets/aistudio/icon_f95f5a07.png`);
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${storeName} – المنيو الإلكتروني الذكي | Menu+</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${tagline}" />`
  );
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${storeName} – المنيو الإلكتروني الذكي" />`
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
    `<link rel="canonical" href="${escapeHtml(storeUrl)}" />`,
    `<meta property="og:url" content="${escapeHtml(storeUrl)}" />`,
    `<meta name="twitter:title" content="${storeName}" />`,
    `<meta name="twitter:description" content="${tagline}" />`,
    `<script type="application/ld+json">${ldJson}</script>`,
    `<script>window.__MENUPLUS_SUBDOMAIN__=${bootstrapPayload};</script>`,
  ].join('\n  ');

  if (out.includes('</head>')) {
    out = out.replace('</head>', `  ${extraTags}\n  </head>`);
  } else {
    out = `${extraTags}\n${out}`;
  }
  return out;
}

const STATIC_EXT_RE = /\.(?:js|mjs|css|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|json|txt|xml)$/i;

/**
 * Express middleware that intercepts incoming tenant subdomain requests,
 * validates against Supabase (`restaurants/*`) + plan tier + admin rules,
 * and either sets `res.locals.subdomainResolved` or immediately returns 404 HTML.
 */
export function subdomainMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip non-GET/HEAD requests, API endpoints, Vite HMR internals, and static media/assets
      if (
        (req.method !== 'GET' && req.method !== 'HEAD') ||
        req.path.startsWith('/api/') ||
        req.path.startsWith('/assets/') ||
        req.path.startsWith('/@') ||
        req.path.startsWith('/node_modules/') ||
        STATIC_EXT_RE.test(req.path)
      ) {
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
        return res
          .status(404)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .setHeader('Cache-Control', 'no-store')
          .send(renderStoreNotFoundHtml(subdomain, rules.baseDomain, resolved.reason));
      }

      res.locals.subdomainResolved = resolved;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * JSON endpoints for frontend domain validation, live subdomain resolution, and Admin dashboard overview.
 */
export function createSubdomainRouter() {
  const router = express.Router();

  // Resolve current host's subdomain dynamically
  router.get('/api/resolve-subdomain', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const rules = await getSubdomainRulesFromStore();
      const explicit = String(req.query.subdomain || '').trim();
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
          reason: resolved.reason || 'not_found',
          baseDomain: rules.baseDomain,
        });
      }

      return res.json({
        isSubdomain: true,
        found: true,
        subdomain,
        restaurantId: resolved.restaurant.id,
        restaurantName: resolved.restaurant.n || subdomain,
        baseDomain: rules.baseDomain,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Subdomain resolution failed' });
    }
  });

  // Check custom account handle availability, rules compliance & paid-plan eligibility
  router.get('/api/subdomains/check', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const rawSlug = String(req.query.slug || '');
      const currentRid = String(req.query.rid || req.query.excludeRid || '').trim();
      const requestedPlanId = String(req.query.planId || '').trim();
      const rules = await getSubdomainRulesFromStore();
      const clean = sanitizeSubdomainValue(rawSlug);

      const [{ items: restaurants }, storedPlans] = await Promise.all([
        readPrefixFromStore<StoreRecord>('restaurants/'),
        getInternalStoreItem<unknown>('settings/plans'),
      ]);
      const plansList = extractPlansList(storedPlans);
      const currentRest = currentRid ? restaurants.find((r) => r.id === currentRid) : undefined;
      const effectivePlanId = requestedPlanId || String(currentRest?.planId || 'starter');
      const { isPaid } = isPaidPlanForRestaurant(
        currentRest ? { ...currentRest, planId: effectivePlanId } : { id: currentRid || 'new', planId: effectivePlanId },
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
          message: 'اختيار اسم حساب مخصص للرابط متاح في الباقات المفعّلة فقط.',
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
          message: validation.message || 'اسم الرابط غير صالح.',
        });
      }

      const conflict = restaurants.find((r) => {
        if (currentRid && r.id === currentRid) return false;
        const s1 = sanitizeSubdomainValue(String(r.slug || ''));
        const s2 = sanitizeSubdomainValue(String(r.subdomain || ''));
        return s1 === clean || s2 === clean;
      });

      const resolvedUrl = rules.enabled
        ? `https://${clean}.${rules.baseDomain}`
        : `https://${rules.baseDomain}/${clean}`;

      return res.json({
        ok: true,
        available: !conflict,
        paidRequired: false,
        subdomainEnabled: rules.enabled,
        slug: clean,
        baseDomain: rules.baseDomain,
        fullUrl: resolvedUrl,
        publicUrl: `https://${rules.baseDomain}/${clean}`,
        message: conflict ? 'هذا الرابط مستخدم من قبل حساب آخر، اختر اسماً مختلفاً.' : 'متاح للتفعيل!',
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, available: false, error: err?.message || 'Check failed' });
    }
  });

  // Admin overview: list all registered menu links / subdomains
  router.get('/api/admin/subdomains', requireAdminOrStaff('canManageSubdomains'), async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const rules = await getSubdomainRulesFromStore();
      const [{ items: restaurants, source }, storedPlans] = await Promise.all([
        readPrefixFromStore<StoreRecord>('restaurants/'),
        getInternalStoreItem<unknown>('settings/plans'),
      ]);
      const plansList = extractPlansList(storedPlans);
      const today = new Date().toISOString().slice(0, 10);

      const entries = restaurants
        .filter((r) => {
          const s = sanitizeSubdomainValue(String(r.slug || r.subdomain || ''));
          return s.length > 0 && !r.isBranch;
        })
        .map((r) => {
          const slug = sanitizeSubdomainValue(String(r.slug || r.subdomain || ''));
          const { isPaid, plan } = isPaidPlanForRestaurant(r, plansList);
          const isExpired = Boolean(r.e && String(r.e) < today);
          const isActive = r.a !== 0 && !isExpired;
          return {
            rid: r.id,
            name: String(r.n || r.id),
            owner: String(r.ow || ''),
            phone: String(r.ph || r.p || ''),
            slug,
            fullUrl: rules.enabled ? `https://${slug}.${rules.baseDomain}` : `https://${rules.baseDomain}/${slug}`,
            publicUrl: `https://${rules.baseDomain}/${slug}`,
            planId: String(r.planId || 'starter'),
            planName: String(plan?.n || r.p || r.planId || 'الباقة الاقتصادية'),
            isPaidPlan: isPaid,
            active: isActive,
            subdomainEnabled: rules.enabled,
            subdomainActive: isActive && isPaid && rules.enabled,
            suspended: r.a === 0,
            expired: isExpired,
            expiresAt: r.e || null,
          };
        })
        .sort((a, b) => a.slug.localeCompare(b.slug));

      return res.json({ ok: true, source, rules, subdomains: entries });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to list subdomains' });
    }
  });

  // Admin quick action: clear/revoke a store's custom subdomain and revert slug to 6-char random code
  router.delete('/api/admin/subdomains/:rid', requireAdminOrStaff('canManageSubdomains'), async (req, res) => {
    try {
      const rid = String(req.params.rid || '').trim();
      const { items: restaurants } = await readPrefixFromStore<StoreRecord>('restaurants/');
      const existing = restaurants.find((r) => r.id === rid) || (await getInternalStoreItem<StoreRecord>(`restaurants/${rid}`));
      if (!existing) {
        return res.status(404).json({ ok: false, error: 'Restaurant not found' });
      }
      const taken = collectTakenMenuSlugs(restaurants.filter((r) => r.id !== rid));
      const fallbackCode = generateUniqueMenuCode(taken);
      const updated: StoreRecord = { ...existing, slug: fallbackCode, subdomain: '' };
      const saved = await upsertRecordInStore(`restaurants/${rid}`, updated);
      return res.json({ ok: saved.ok, rid, slug: fallbackCode });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to revoke subdomain' });
    }
  });

  return router;
}
