/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ActivityLog,
  AdminNote,
  Category,
  CustomFontItem,
  FontTypographyConfig,
  HomeSettings,
  MenuItem,
  MenuLayout,
  MenuThemeShape,
  PricingPlan,
  Restaurant,
  RestaurantHours,
  Session,
  SiteSettings,
  StaffMember,
  StaffPermissions,
  ThemePreset,
  ThemeSettings,
} from '../types';
import { DEFAULT_PLANS_V2 } from './plans';
import {
  ensureRestaurantDefaults,
  generateRandomMenuCode,
  isReservedSlug,
  isValidSixCharCode,
  sanitizeSlug,
} from './businessDefaults';
import { parsePathRoute } from './router';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Calculates remaining days and generates an Arabic description
 */
export function getExpiryDetails(eDate?: string): { days: number; text: string; isExp: boolean } {
  if (!eDate) {
    return {
      days: 0,
      text: 'غير محدد',
      isExp: false,
    };
  }
  const target = new Date(eDate).getTime();
  const now = new Date(today()).getTime();
  const diffDays = Math.round((target - now) / 86400000);
  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return {
      days: diffDays,
      text: `منتهي منذ ${absDays} يوم (${eDate})`,
      isExp: true,
    };
  }
  if (diffDays === 0) {
    return {
      days: 0,
      text: `ينتهي اليوم (${eDate})`,
      isExp: false,
    };
  }
  if (diffDays > 30) {
    const months = Math.floor(diffDays / 30);
    const remDays = diffDays % 30;
    const mText = months === 1 ? 'شهر' : months === 2 ? 'شهرين' : `${months} أشهر`;
    const dText = remDays > 0 ? ` و ${remDays} يوم` : '';
    return { days: diffDays, text: `باقي ${mText}${dText} (${eDate})`, isExp: false };
  }
  return {
    days: diffDays,
    text: `باقي ${diffDays} يوماً (${eDate})`,
    isExp: false,
  };
}

/**
 * Cleans and formats phone numbers, converting standard Iraqi numbers
 * (e.g. 0770..., 0780..., 0750...) to international WhatsApp format (9647...).
 */
export function waNum(p: string): string {
  let clean = String(p || '').replace(/\D/g, '');
  if (clean.startsWith('00')) {
    clean = clean.slice(2);
  } else if (clean.startsWith('0')) {
    clean = '964' + clean.slice(1);
  } else if (
    !clean.startsWith('964') &&
    (clean.startsWith('77') || clean.startsWith('78') || clean.startsWith('75') || clean.startsWith('79'))
  ) {
    clean = '964' + clean;
  }
  return clean;
}

export function waLink(p: string, t?: string): string {
  return `https://wa.me/${waNum(p)}${t ? `?text=${encodeURIComponent(t)}` : ''}`;
}

export function formatNumber(n: number | string): string {
  return Number(n || 0).toLocaleString('en-US');
}

export function parseMinutes(s?: string): number {
  const parts = String(s || '0:0').split(':');
  return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
}

export function isOpen(h?: RestaurantHours): boolean {
  if (!h || h.m !== 'c') return true;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const from = parseMinutes(h.f || '09:00');
  const to = parseMinutes(h.t || '23:00');
  return from <= to
    ? currentMinutes >= from && currentMinutes < to
    : currentMinutes >= from || currentMinutes < to;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function isRestaurantOpenNow(rest?: Restaurant): boolean {
  if (!rest) return true;
  if (rest.weeklyHours && Object.keys(rest.weeklyHours).length > 0) {
    const todayKey = DAY_KEYS[new Date().getDay()];
    const dayCfg = rest.weeklyHours[todayKey];
    if (dayCfg) {
      if (!dayCfg.open) return false;
      const now = new Date();
      const cur = now.getHours() * 60 + now.getMinutes();
      const from = parseMinutes(dayCfg.from || '09:00');
      const to = parseMinutes(dayCfg.to || '23:59');
      return from <= to ? cur >= from && cur <= to : cur >= from || cur <= to;
    }
  }
  return isOpen(rest.h);
}

const SALT = 'menuplus_secure_salt_2026';

export async function hash(identifier: string, pw: string): Promise<string> {
  const str = `${identifier.trim().toLowerCase()}::${pw.trim().toLowerCase()}::${SALT}`;
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function generateVerificationCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export function sanitizeText(text: string): string {
  return String(text || '').trim();
}

export function compressImage(
  file: File,
  variant: 'logo' | 'banner' | 'item' = 'item'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = variant === 'logo' ? 280 : variant === 'banner' ? 1000 : 640;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(e.target?.result as string);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.76));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export interface SuggestedImageItem {
  id: string;
  thumb: string;
  url: string;
  title: string;
  source?: string;
}

export async function searchSuggestedImages(
  query: string,
  limit = 16,
  offset = 0,
  seed = 0,
  excludeUrls: string[] = []
): Promise<SuggestedImageItem[]> {
  const clean = query.trim();
  if (!clean) return [];
  try {
    const params = new URLSearchParams({
      q: clean,
      limit: String(limit),
      offset: String(offset),
      seed: String(seed),
    });
    if (excludeUrls.length > 0) {
      params.set('exclude', excludeUrls.slice(0, 40).join(','));
    }
    const res = await fetch(`/api/search-images?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { images?: SuggestedImageItem[] };
    return Array.isArray(data.images) ? data.images : [];
  } catch {
    return [];
  }
}

export async function fetchAndCompressImageUrl(
  primaryUrl: string,
  fallbackUrl?: string,
  maxDim = 680
): Promise<string> {
  const candidates = [primaryUrl, fallbackUrl].filter((u): u is string => Boolean(u && u.startsWith('https://')));

  for (const target of candidates) {
    try {
      const proxiedUrl = `/api/proxy-image?url=${encodeURIComponent(target)}`;
      const loaded = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let w = img.naturalWidth || img.width || maxDim;
            let h = img.naturalHeight || img.height || maxDim;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('No canvas context'));
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = proxiedUrl;
      });
      if (loaded) return loaded;
    } catch {
      // Try next candidate
    }
  }

  return fallbackUrl || primaryUrl;
}

export function isDarkHex(hex: string): boolean {
  const clean = String(hex || '#000000').replace('#', '');
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

/**
 * Default Theme: Clean Calm Light (النهار النقي الهادئ)
 */
export const DEFAULT_THEME: ThemeSettings = {
  c1: '#0F766E', // Restrained Teal primary CTA & accent
  c2: '#FFFFFF', // Crisp surface
  c3: '#059669', // Clean Emerald accent
  bg: '#F8FAFC', // Soft Slate White canvas
  mode: 'light',
  c4: '#F1F5F9', // Soft subtle surface tint
  c5: '#0F766E',
  font: 'tajawal',
  preset: 'clean_light',
};

/**
 * Curated Color Templates with Custom Background
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'clean_light',
    name: '1. النهار النقي (الافتراضي الهادئ)',
    desc: 'أبيض مريح #F8FAFC + بطاقات نقية #FFFFFF + لمسة فيروزية هادئة #0F766E',
    theme: {
      c1: '#0F766E',
      c2: '#FFFFFF',
      c3: '#059669',
      bg: '#F8FAFC',
      mode: 'light',
      c4: '#F1F5F9',
      c5: '#0F766E',
      font: 'tajawal',
      preset: 'clean_light',
    },
  },
  {
    id: 'aura_emerald',
    name: '2. الداكن المتزن (سلايت مع لمسة زمردية)',
    desc: 'خلفية سلايت داكنة #0F1419 + سطح #161B22 + لمسة #0F766E',
    theme: {
      c1: '#0F766E',
      c2: '#161B22',
      c3: '#10B981',
      bg: '#0F1419',
      mode: 'dark',
      c4: '#1C222B',
      c5: '#0F766E',
      font: 'tajawal',
      preset: 'aura_emerald',
    },
  },
  {
    id: 'baghdad_royal_gold',
    name: '2. كحلي بغدادي وذهب ملكي',
    desc: 'ذهبي #D97706 + كحلي ليلي #0B192C + سماوي #38BDF8 | خلفية #07111E',
    theme: {
      c1: '#D97706',
      c2: '#0B192C',
      c3: '#38BDF8',
      bg: '#07111E',
      mode: 'dark',
      font: 'firjar',
      preset: 'baghdad_royal_gold',
    },
  },
  {
    id: 'ocean_cyan',
    name: '3. أزرق المحيط والسيان',
    desc: 'سيان عميق #00B4D8 + كحلي مائي #03045E + أصفر شمس #FFB703 | خلفية #020C1B',
    theme: {
      c1: '#00B4D8',
      c2: '#03045E',
      c3: '#FFB703',
      bg: '#020C1B',
      mode: 'dark',
      font: 'alan_sans',
      preset: 'ocean_cyan',
    },
  },
  {
    id: 'ruby_crimson',
    name: '4. الياقوت القرمزي والسبج',
    desc: 'ياقوتي ملكي #E11D48 + سبج داكن #1E1B2E + وردي ناعم #F472B6 | خلفية #0F0A18',
    theme: {
      c1: '#E11D48',
      c2: '#1E1B2E',
      c3: '#F472B6',
      bg: '#0F0A18',
      mode: 'dark',
      font: 'tajawal',
      preset: 'ruby_crimson',
    },
  },
  {
    id: 'emerald_forest',
    name: '5. زمرد الغابة والنقاء',
    desc: 'زمردي نضر #10B981 + زيتي عميق #064E3B + ذهبي #F59E0B | خلفية #051A14',
    theme: {
      c1: '#10B981',
      c2: '#064E3B',
      c3: '#F59E0B',
      bg: '#051A14',
      mode: 'dark',
      font: 'alexandria',
      preset: 'emerald_forest',
    },
  },
  {
    id: 'imperial_violet',
    name: '6. البنفسجي الإمبراطوري والكريستال',
    desc: 'أرجواني ساطع #8B5CF6 + كحلي بنفسجي #1E1535 + كهرمان #FBBF24 | خلفية #0B081A',
    theme: {
      c1: '#8B5CF6',
      c2: '#1E1535',
      c3: '#FBBF24',
      bg: '#0B081A',
      mode: 'dark',
      font: 'alan_sans',
      preset: 'imperial_violet',
    },
  },
  {
    id: 'sunrise_amber',
    name: '7. شروق الشمس والكهرمان',
    desc: 'برتقالي مشمس #F97316 + رمادي دافئ #1C1917 + سماوي #0EA5E9 | خلفية #0C0A09',
    theme: {
      c1: '#F97316',
      c2: '#1C1917',
      c3: '#0EA5E9',
      bg: '#0C0A09',
      mode: 'dark',
      font: 'tajawal',
      preset: 'sunrise_amber',
    },
  },
  {
    id: 'arctic_glacier',
    name: '8. الفيروزي الجليدي والرمادي',
    desc: 'فيروزي مثلج #06B6D4 + كحلي ثلجي #0F2038 + ذهبي #F59E0B | خلفية #081324',
    theme: {
      c1: '#06B6D4',
      c2: '#0F2038',
      c3: '#F59E0B',
      bg: '#081324',
      mode: 'dark',
      font: 'alexandria',
      preset: 'arctic_glacier',
    },
  },
  {
    id: 'arabian_mocha',
    name: '9. القهوة العربية والكراميل',
    desc: 'كراميل #B45309 + بني ملكي #271C19 + أصفر زعفران #FDE047 | خلفية #160F0D',
    theme: {
      c1: '#B45309',
      c2: '#271C19',
      c3: '#FDE047',
      bg: '#160F0D',
      mode: 'dark',
      font: 'firjar',
      preset: 'arabian_mocha',
    },
  },
  {
    id: 'obsidian_aurora',
    name: '10. الأسود السبج والأورورا',
    desc: 'أخضر نيون #22C55E + أسود قطبي #111827 + أزرق أورورا #38BDF8 | خلفية #030712',
    theme: {
      c1: '#22C55E',
      c2: '#111827',
      c3: '#38BDF8',
      bg: '#030712',
      mode: 'dark',
      font: 'alexandria',
      preset: 'obsidian_aurora',
    },
  },
  {
    id: 'cobalt_silver',
    name: '11. الأزرق الكوبالتي والفضة',
    desc: 'كوبالت #2563EB + كحلي غامق #0C1E3C + فضي لامع #E2E8F0 | خلفية #061124',
    theme: {
      c1: '#2563EB',
      c2: '#0C1E3C',
      c3: '#E2E8F0',
      bg: '#061124',
      mode: 'dark',
      font: 'alan_sans',
      preset: 'cobalt_silver',
    },
  },
  {
    id: 'golden_saffron',
    name: '12. الزعفران الذهبي والنيفي',
    desc: 'زعفراني مشرق #EAB308 + كحلي داكن #0F172A + أحمر قرمزي #EF4444 | خلفية #090E17',
    theme: {
      c1: '#EAB308',
      c2: '#0F172A',
      c3: '#EF4444',
      bg: '#090E17',
      mode: 'dark',
      font: 'firjar',
      preset: 'golden_saffron',
    },
  },
  {
    id: 'blush_graphite',
    name: '13. الوردي الأنيق والغرافيت',
    desc: 'وردي بودري #FB7185 + رمادي غرافيت #18181B + ذهبي #FBBF24 | خلفية #0E0E11',
    theme: {
      c1: '#FB7185',
      c2: '#18181B',
      c3: '#FBBF24',
      bg: '#0E0E11',
      mode: 'dark',
      font: 'tajawal',
      preset: 'blush_graphite',
    },
  },
  {
    id: 'neon_midnight',
    name: '14. البرتقالي النيون والليل',
    desc: 'برتقالي ناري #FB923C + ميدنايت #0B0F19 + أزرق كهربائي #38BDF8 | خلفية #050811',
    theme: {
      c1: '#FB923C',
      c2: '#0B0F19',
      c3: '#38BDF8',
      bg: '#050811',
      mode: 'dark',
      font: 'tajawal',
      preset: 'neon_midnight',
    },
  },
  {
    id: 'apple_pure_light',
    name: '15. آبل الفاتح الهادئ (Light)',
    desc: 'أزرق آبل #0284C7 + كحلي نصوص #0F172A + ذهبي #F59E0B | خلفية #F8FAFC',
    theme: {
      c1: '#0284C7',
      c2: '#0F172A',
      c3: '#F59E0B',
      bg: '#F8FAFC',
      mode: 'light',
      c4: '#FFFFFF',
      c5: '#F59E0B',
      font: 'alan_sans',
      preset: 'apple_pure_light',
    },
  },
  {
    id: 'sage_ivory',
    name: '16. الأخضر المريمي والعاجي (Light)',
    desc: 'مريمي هادئ #059669 + زيتي لطيف #1E2E28 + خوخي #FDBA74 | خلفية #F0FDF4',
    theme: {
      c1: '#059669',
      c2: '#1E2E28',
      c3: '#FDBA74',
      bg: '#F0FDF4',
      mode: 'light',
      font: 'alexandria',
      preset: 'sage_ivory',
    },
  },
  {
    id: 'desert_sand',
    name: '17. الرمل الذهبي والأرز (Light)',
    desc: 'رمال الصحراء #CA8A04 + بني أرز #292524 + تركواز #14B8A6 | خلفية #FAFAF9',
    theme: {
      c1: '#CA8A04',
      c2: '#292524',
      c3: '#14B8A6',
      bg: '#FAFAF9',
      mode: 'light',
      font: 'firjar',
      preset: 'desert_sand',
    },
  },
  {
    id: 'cyber_cyan',
    name: '18. السيان الفضائي والفحم',
    desc: 'سيان فاقع #06B6D4 + فحمي عميق #18181B + ليموني #A3E635 | خلفية #09090B',
    theme: {
      c1: '#06B6D4',
      c2: '#18181B',
      c3: '#A3E635',
      bg: '#09090B',
      mode: 'dark',
      font: 'alan_sans',
      preset: 'cyber_cyan',
    },
  },
  {
    id: 'warm_peach',
    name: '19. الخوخي الدافئ والأزرق',
    desc: 'خوخي غني #F43F5E + أزرق داكن #1E293B + أصفر مشرق #FACC15 | خلفية #0F172A',
    theme: {
      c1: '#F43F5E',
      c2: '#1E293B',
      c3: '#FACC15',
      bg: '#0F172A',
      mode: 'dark',
      font: 'tajawal',
      preset: 'warm_peach',
    },
  },
  {
    id: 'luxury_bronze',
    name: '20. البرونز الملكي والميدنايت (الافتراضي)',
    desc: 'برونزي لامع #C2410C + أسود فاخر #121212 + ذهبي #F59E0B | خلفية #0A0A0A',
    theme: {
      c1: '#C2410C',
      c2: '#121212',
      c3: '#F59E0B',
      bg: '#0A0A0A',
      mode: 'dark',
      c4: '#18181B',
      c5: '#F59E0B',
      font: 'tajawal',
      preset: 'luxury_bronze',
    },
  },
];

export interface PlatformFontMeta {
  key: 'tajawal' | 'firjar' | 'alexandria' | 'alan_sans';
  label: string;
  englishName: string;
  category: string;
  sourceLabel: string;
  desc: string;
  stack: string;
  headingStack?: string;
  weights: number[];
  hasVariableWidth?: boolean;
}

export const PLATFORM_FONT_CATALOG: PlatformFontMeta[] = [
  {
    key: 'tajawal',
    label: 'خط تجوال',
    englishName: 'Tajawal',
    category: 'حديث',
    sourceLabel: 'Google Fonts · الافتراضي',
    desc: 'خط عربي متوازن وهادئ بسبعة أوزان متعددة (200–900)، مناسب للمطاعم والمتاجر.',
    stack: '"Tajawal", sans-serif',
    weights: [200, 300, 400, 500, 700, 800, 900],
  },
  {
    key: 'firjar',
    label: 'خط فرجار',
    englishName: 'Firjar',
    category: 'هندسي',
    sourceLabel: 'Google Fonts · Variable',
    desc: 'خط عربي ولاتيني معاصر بلمسة كوفية هندسية، يدعم أوزان 100–800 وعرض الحرف المتغير (75–125).',
    stack: '"Firjar", sans-serif',
    weights: [100, 200, 300, 400, 500, 600, 700, 800],
    hasVariableWidth: true,
  },
  {
    key: 'alexandria',
    label: 'خط الإسكندرية',
    englishName: 'Alexandria',
    category: 'حديث',
    sourceLabel: 'Google Fonts · Variable',
    desc: 'خط هندسي متغير واضح جداً للشاشات والمنيوهات بأوزان كاملة من 100 إلى 900.',
    stack: '"Alexandria", sans-serif',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    key: 'alan_sans',
    label: 'خط آلان سانس',
    englishName: 'Alan Sans',
    category: 'حديث',
    sourceLabel: 'Google Fonts · Variable',
    desc: 'خط إنساني مرن بحواف دائرية لطيفة، يدعم الأوزان المتغيرة من 300 إلى 900.',
    stack: '"Alan Sans", sans-serif',
    weights: [300, 400, 500, 600, 700, 800, 900],
  },
];

export const FONTS: Record<string, [string, string]> = Object.fromEntries(
  PLATFORM_FONT_CATALOG.map((f) => [f.key, [`${f.label} (${f.englishName})`, f.stack]])
);

export function getLocalizedFontCatalog(): PlatformFontMeta[] {
  return PLATFORM_FONT_CATALOG;
}

export const DEFAULT_TYPOGRAPHY: Required<Omit<FontTypographyConfig, 'customFonts'>> & {
  customFonts: CustomFontItem[];
} = {
  fontKey: 'tajawal',
  separateHeadingFont: false,
  headingFontKey: 'tajawal',
  bodyFontKey: 'tajawal',
  headingScale: 100,
  bodySize: 15,
  descSize: 13.5,
  headingWeight: 800,
  subHeadingWeight: 700,
  bodyWeight: 400,
  descWeight: 400,
  headingLineHeight: 1.28,
  bodyLineHeight: 1.7,
  letterSpacing: 0,
  fontStretch: 100,
  customFonts: [],
};

export function normalizePlatformFontKey(fontKey?: string): PlatformFontMeta['key'] {
  const raw = String(fontKey || '').trim().toLowerCase();
  if (raw === 'firjar') return 'firjar';
  if (raw === 'alexandria') return 'alexandria';
  if (raw === 'alan_sans' || raw === 'alansans' || raw === 'alan sans') return 'alan_sans';
  if (raw === 'tajawal' || raw === 'taj') return 'tajawal';
  return 'tajawal';
}

export function resolveFontCssStack(
  fontKey: string | undefined,
  customFonts: CustomFontItem[] = [],
  role: 'heading' | 'body' = 'body'
): string {
  const rawKey = String(fontKey || '').trim();
  const custom = customFonts.find((cf) => cf.id === rawKey);
  if (custom && custom.family) {
    return `"${custom.family.replace(/"/g, '')}", "Tajawal", sans-serif`;
  }
  const normalized = normalizePlatformFontKey(rawKey);
  const meta = PLATFORM_FONT_CATALOG.find((f) => f.key === normalized) || PLATFORM_FONT_CATALOG[0];
  return role === 'heading' && meta.headingStack ? meta.headingStack : meta.stack;
}

export function injectCustomFontFaces(customFonts: CustomFontItem[] = []): void {
  if (typeof document === 'undefined') return;
  const styleId = 'menuplus-custom-fonts-style';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!customFonts || customFonts.length === 0) {
    if (styleEl) styleEl.textContent = '';
    return;
  }
  const rules: string[] = [];
  for (const cf of customFonts) {
    if (!cf || !cf.family || !Array.isArray(cf.weights) || cf.weights.length === 0) continue;
    const safeFamily = cf.family.replace(/"/g, '');
    const sorted = [...cf.weights].sort((a, b) => a.weight - b.weight);
    const hasSingleUnified = sorted.length === 1;
    for (const wf of sorted) {
      if (!wf.url) continue;
      const fmt = wf.format || 'opentype';
      const weightRule = hasSingleUnified || wf.weight === 0 ? '100 900' : String(wf.weight || 400);
      rules.push(
        `@font-face {\n  font-family: "${safeFamily}";\n  src: url("${wf.url}") format("${fmt}");\n  font-weight: ${weightRule};\n  font-style: normal;\n  font-display: swap;\n}`
      );
    }
  }
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = rules.join('\n');
}

export function applyPlatformTypography(t?: ThemeSettings): void {
  if (typeof document === 'undefined') return;
  const theme = t || getTheme();
  const root = document.documentElement.style;
  const typo: FontTypographyConfig = {
    ...DEFAULT_TYPOGRAPHY,
    ...(theme.typography || {}),
  };
  const customFonts = Array.isArray(typo.customFonts) ? typo.customFonts : [];
  injectCustomFontFaces(customFonts);

  const primaryKey = normalizePlatformFontKey(typo.fontKey || theme.font);
  const headingKey = typo.separateHeadingFont && typo.headingFontKey ? typo.headingFontKey : primaryKey;
  const bodyKey = typo.separateHeadingFont && typo.bodyFontKey ? typo.bodyFontKey : primaryKey;

  const headingStack = resolveFontCssStack(headingKey, customFonts, 'heading');
  const bodyStack = resolveFontCssStack(bodyKey, customFonts, 'body');

  const headingScalePct = Math.min(140, Math.max(75, Number(typo.headingScale) || 100));
  const bodySizePx = Math.min(22, Math.max(12, Number(typo.bodySize) || 15));
  const descSizePx = Math.min(20, Math.max(11, Number(typo.descSize) || 13.5));
  const headingWeight = Math.min(900, Math.max(100, Number(typo.headingWeight) || 800));
  const subHeadingWeight = Math.min(900, Math.max(100, Number(typo.subHeadingWeight) || 700));
  const bodyWeight = Math.min(900, Math.max(100, Number(typo.bodyWeight) || 400));
  const descWeight = Math.min(900, Math.max(100, Number(typo.descWeight) || 400));
  const headingLh = Math.min(1.8, Math.max(1.0, Number(typo.headingLineHeight) || 1.28));
  const bodyLh = Math.min(2.2, Math.max(1.25, Number(typo.bodyLineHeight) || 1.7));
  const trackingEm = Math.min(0.08, Math.max(-0.05, Number(typo.letterSpacing) || 0));
  const fontStretchPct =
    primaryKey === 'firjar' ? Math.min(125, Math.max(75, Number(typo.fontStretch) || 100)) : 100;

  root.setProperty('--font', bodyStack);
  root.setProperty('--font-body', bodyStack);
  root.setProperty('--font-heading', headingStack);
  root.setProperty('--font-sans', bodyStack);
  root.setProperty('--default-font-family', bodyStack);
  root.setProperty('--font-serif', headingStack);
  root.setProperty('--font-scale', (headingScalePct / 100).toFixed(3));
  root.setProperty('--font-desc-scale', (descSizePx / 13.5).toFixed(3));
  root.setProperty('--font-body-size', `${bodySizePx}px`);
  root.setProperty('--font-desc-size', `${descSizePx}px`);
  root.setProperty('--font-heading-weight', String(headingWeight));
  root.setProperty('--font-subheading-weight', String(subHeadingWeight));
  root.setProperty('--font-body-weight', String(bodyWeight));
  root.setProperty('--font-desc-weight', String(descWeight));
  root.setProperty('--font-heading-lh', String(headingLh));
  root.setProperty('--font-body-lh', String(bodyLh));
  root.setProperty('--font-tracking', `${trackingEm}em`);
  root.setProperty('--font-stretch', `${fontStretchPct}%`);

  document.documentElement.style.fontFamily = bodyStack;
  if (document.body) {
    document.body.style.fontFamily = bodyStack;
  }
}

export const DEFAULT_PLANS: PricingPlan[] = DEFAULT_PLANS_V2;

export const DEFAULT_SITE: SiteSettings = {
  name: 'منيو بلس',
  wa: '07724799679',
  supportWhatsapp: '07724799679',
  em: 'support@menuplus.io',
  su: 0,
  tr: 30,
  bn: '',
  logoText: 'منيو بلس',
  enablePaidPlans: true,
  googleAuthEnabled: false,
  signupEnabled: false,
  subdomainRules: {
    enabled: false,
    baseDomain: 'menuplus.io',
    maxLength: 32,
    blockedKeywords: ['admin', 'www', 'api', 'mail', 'root', 'support', 'menu', 'app', 'dashboard', 'billing', 'staff'],
    allowHyphens: true,
  },
  defaultCountry: 'العراق',
  defaultCurrency: 'د.ع',
  homeThemeMode: 'light',
  adminThemeMode: 'light',
};

export const DEFAULT_HOME: HomeSettings = {
  sections: {
    hero: true,
    services: true,
    faq: true,
    pricing: true,
    footer: true,
  },
  nav: {
    home: 'الرئيسية',
    services: 'المميزات',
    faq: 'الأسئلة الشائعة',
    pricing: 'الأسعار',
    enterNow: 'ادخل الآن',
    dashboard: 'لوحة التحكم',
    adminDashboard: 'لوحة تحكم الإدارة',
    modalLogin: 'تسجيل الدخول',
    modalSignup: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    login: 'تسجيل الدخول',
    demo: 'جرب المنيو الان',
  },
  hero: {
    titleLine1: 'المنيو الأذكى بالعراق',
    titleLine2: 'لمتجرك أو مطعمك',
    title: 'المنيو الأذكى بالعراق لمتجرك أو مطعمك',
    lead: 'أطلق متجرك الآن واستقبل الطلبات',
    cta1: 'جرب المنيو الان',
    cta1Link: '/cap-burger',
    cta1Visible: true,
    cta2: 'جرب المنيو الان',
  },
  services: {
    badge: '✨ مميزاتنا',
    title: 'كل ما يحتاجه مطعمك أو متجرك لبيع أكثر',
    sub: 'منيو سريع يفتح بلمسة واحدة، وطلبات تصل منظمة مباشرة لواتسابك بدون تعقيد.',
    list: [
      {
        i: '💸',
        t: 'صفر عمولة.. وأرباحك 100% لك',
        d: 'استقبل مئات الطلبات يومياً بدون اقتطاع أي نسبة مئوية أو رسوم خفية؛ كل دينار يدخل حسابك بالكامل.',
      },
      {
        i: '📲',
        t: 'طلبات مرتبة على واتسابك بلحظة',
        d: 'يتصفح الزبون الصور ويضيف للسلة ويرسل لك فاتورة جاهزة بالأسعار والعنوان وموقع GPS فوراً.',
      },
      {
        i: '⚡',
        t: 'تحكم فوري بالأسعار والأصناف',
        d: 'نفدت وجبة أو تغيّر سعر؟ عدّل الأسعار وأخفِ الأصناف أو أطلق خصماً من موبايلك بنفس الثانية.',
      },
      {
        i: '📷',
        t: 'باركود QR خاص لطاولاتك وإعلاناتك',
        d: 'باركود بتصميم أنيق وشعار مطعمك، يمسحه الزبون بكاميرا هاتفه ليفتح المنيو فوراً دون تحميل تطبيق.',
      },
      {
        i: '🎯',
        t: 'أدوات ذكية تضاعف قيمة الفاتورة',
        d: 'عجلة حظ، كوبونات خصم، ومقترحات إضافية داخل السلة تشجّع الزبون على زيادة طلبه تلقائياً.',
      },
      {
        i: '📊',
        t: 'لوحة مبيعات وتقارير لحظية',
        d: 'تعرّف على عدد الزوار، أكثر الأصناف طلباً، وأوقات الذروة بوضوح لتتخذ قرارات تزيد مبيعاتك.',
      },
    ],
  },
  steps: {
    title: 'كيف تبدأ مع منيو بلس؟',
    sub: 'أربع خطوات بسيطة وسريعة لتستقبل الطلبات خلال دقائق:',
    list: [
      {
        t: '1. سجّل حسابك',
        d: 'أنشئ حساب مطعمك أو متجرك برقم هاتفك واسم مشروعك في ثوانٍ معدودة وبدون أي تعقيد.',
      },
      {
        t: '2. أضف منتجاتك وأسعارك',
        d: 'رتّب أقسامك وأضف الوجبات والمنتجات مع الصور والأسعار بدقة.',
      },
      {
        t: '3. انشر الرابط وكود الـ QR',
        d: 'اطبع كود الـ QR أو شارك الرابط لزبائنك على منصات التواصل الاجتماعي.',
      },
      {
        t: '4. استقبل الطلبات بالواتساب مع إحصائيات كاملة',
        d: 'يصلك الطلب فوراً ومفصلاً بالواتساب، مع متابعة دقيقة لمبيعاتك وتقارير أرباحك.',
      },
    ],
  },
  demo: {
    title: 'نبذة عن منيو بلس',
    sub: 'معاينة تفاعلية حية تحاكي هاتف الزبون: تصفح الأطباق والمنتجات، أضف للسلة، وجرب إرسال الطلب للواتساب.',
    btn: 'احصل على المنيو الآن 🚀',
    items: [
      { e: '🍢', n: 'نفر كباب لحم عراقي', d: 'مشوي على الفحم مع خبز حار وطماطم وبصل مشوي', p: 12000 },
      { e: '🍔', n: 'برجر لحم فاخر دبل تشيز', d: 'لحم أنجوس طازج مع شيدر وبصل مكرمل وصوص خاص', p: 7500 },
      { e: '🍕', n: 'بيتزا بيبروني إيطالية', d: 'عجينة رقيقة متخمرة مع موتزاريلا وبيبروني فاخر', p: 10000 },
      { e: '🌯', n: 'شاورما لحم عراقي صاج', d: 'خبز صاج مع ثومية ومخلل وبطاطا مقرمشة', p: 4500 },
      { e: '🥤', n: 'موهيتو باشن فروت منعش', d: 'ليمون ونعناع وصودا باردة مع باشن فروت طبيعي', p: 3500 },
    ],
  },
  pricing: {
    badge: '💎 الأسعار والباقات',
    title: 'اختر الباقة المناسبة لمشروعك',
    sub: 'اشترك بالباقة المناسبة لمشروعك بدون أي عمولة على مبيعاتك، وطوّر باقتك في أي وقت مع نمو طلباتك.',
    monthlyLabel: 'اشتراك شهري',
    annualLabel: 'اشتراك سنوي',
    annualBadge: 'احصل على شهر مجاني',
    hotBadge: 'الأكثر اختياراً 🔥',
    vipBadge: 'شاملة بلا حدود 👑',
    growthBadge: 'باقة متنامية',
    paidCtaPrefix: 'اشترك في',
    helpText: 'هل تحتاج مساعدة في اختيار الباقة الأنسب أو لديك استفسار عن خدماتنا؟',
    whatsappBtnText: 'تواصل معنا مباشرة للاستفسار عن الباقات والخدمات',
  },
  faq: {
    enabled: true,
    title: 'أسئلة ممكن تجي في بالك',
    sub: 'تفاصيل تساعدك تختار التجربة المناسبة لنشاطك.',
    items: [
      {
        id: 'faq_1',
        q: 'شو يعني منيو وكتالوج إلكتروني ذكي؟',
        a: 'هو رابط خاص وباركود QR باسم مشروعك يفتحه الزبون فوراً من متصفح هاتفه بدون تحميل أي تطبيق؛ يتصفح الأقسام والوجبات أو المنتجات بالصور والأسعار، يضيف للسلة، ويرسل لك الطلب مرتباً بالكامل على الواتساب.',
        visible: true,
      },
      {
        id: 'faq_2',
        q: 'هل منيو بلس مناسب لمطعمي أو متجري؟',
        a: 'نعم، المنصة مصممة بمرونة كاملة لتناسب المطاعم، الكافيهات، محلات الحلويات والعصائر، وكذلك المتاجر الإلكترونية ومحلات العطور والملابس والإكسسوارات مع تغيير المصطلحات والأقسام تلقائياً حسب نوع نشاطك.',
        visible: true,
      },
      {
        id: 'faq_3',
        q: 'بقدر أستخدم اسمي وشعاري وأغيّر الألوان والمظهر؟',
        a: 'أكيد! تقدر ترفع شعار مشروعك وصورة الغلاف، وتختار بين المظهر النهاري الفاتح والمظهر الليلي الغامق مع قوالب ألوان احترافية ورابط مخصص باسم مشروعك ليعكس هويتك بالكامل.',
        visible: true,
      },
      {
        id: 'faq_4',
        q: 'هل تاخذون نسبة أو عمولة على مبيعاتي وطلباتي؟',
        a: 'لا، 0% عمولة على مبيعاتك للأبد. كل أرباح طلبات التوصيل والاستلام والطاولات تبقى لك بالكامل وتستلمها مباشرة على رقم الواتساب الخاص بك.',
        visible: true,
      },
      {
        id: 'faq_5',
        q: 'كيف يتم تفعيل الاشتراك وما هي الباقات المتوفرة؟',
        a: 'نوفر 3 باقات مرنة (الاقتصادية، الاحترافية، وباقة الأعمال الشاملة) باشتراك شهري أو سنوي بدون أي عمولات على مبيعاتك، ويمكنك الترقية بين الباقات في أي وقت.',
        visible: true,
      },
      {
        id: 'faq_6',
        q: 'هل أقدر أفعّل نشاطي وأعدّل الأسعار الآن؟',
        a: 'نعم، خلال دقائق معدودة تسجّل برقم هاتفك، تضيف أقسامك ومنتجاتك، وتطبع كود الـ QR وتبدأ باستقبال الطلبات فوراً مع إمكانية تعديل الأسعار وإيقاف أي صنف بلمسة واحدة.',
        visible: true,
      },
    ],
  },
  footer: '© منيو بلس (Menu+) – المنصة الأحدث للمطاعم والمتاجر في العراق والوطن العربي',
};

export const DEFAULT_STAFF_PERMISSIONS: StaffPermissions = {
  canViewAnalytics: true,
  canViewHome: true,
  canManageFinance: false,
  canManageRestaurants: true,
  canCreatePartner: true,
  canEditPartnerPlan: true,
  canSuspendPartner: true,
  canEditPartnerProfile: true,
  canEditPartnerLinks: true,
  canImpersonatePartner: true,
  canDeletePartner: false,
  canEditDemoMenu: true,
  canUseNotes: true,
  canViewReports: true,
  canManagePlans: false,
  canManageStaff: false,
  canManageSettings: false,
  canEditTabLabels: false,
  canReorderTabs: false,
  canManageThemeMode: false,
  canManageSubdomains: false,
  canRunMaintenance: false,
  canEditHomePage: false,
};

export function ink(hex: string): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#071B2B' : '#ffffff';
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveEffectiveThemeMode(pref?: 'light' | 'dark' | 'auto' | null): 'light' | 'dark' {
  if (pref === 'dark') return 'dark';
  if (pref === 'auto') return getSystemPrefersDark() ? 'dark' : 'light';
  return 'light';
}

export function buildThemeForMode(mode: 'light' | 'dark' | 'auto', base?: ThemeSettings): ThemeSettings {
  const cur = base || getTheme();
  const isDark = resolveEffectiveThemeMode(mode) === 'dark';
  return {
    ...cur,
    mode: isDark ? 'dark' : 'light',
    bg: isDark ? '#0F1419' : '#F8FAFC',
    c2: isDark ? '#161B22' : '#FFFFFF',
    c4: isDark ? '#1C222B' : '#F1F5F9',
    preset: isDark ? 'aura_emerald' : 'clean_light',
  };
}

export function applyScopedTheme(pathname?: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const path = (pathname ?? window.location.pathname ?? '/').toLowerCase();
  const host = (window.location.hostname || '').toLowerCase();

  const parsedRoute = parsePathRoute(path);
  // Do not override public storefront / QR menu colors, but ALWAYS apply platform typography/fonts
  if (parsedRoute.page === 'menu' || Boolean((window as any).__MENUPLUS_SUBDOMAIN__)) {
    applyPlatformTypography(getTheme());
    return;
  }

  let mode: 'light' | 'dark' = 'light';
  if (path.startsWith('/admin')) {
    const curSite = getSite();
    mode = resolveEffectiveThemeMode(curSite.adminThemeMode || 'light');
  } else if (path.startsWith('/dashboard')) {
    const curSes = getSession();
    const curRest = curSes?.rid ? getItem<Restaurant>(`restaurants/${curSes.rid}`) : null;
    const curSite = getSite();
    const storePref = curRest?.dashboardThemeMode;
    const effectivePref =
      storePref === 'light' || storePref === 'dark' || storePref === 'auto'
        ? storePref
        : curSite.dashboardThemeMode || 'light';
    mode = resolveEffectiveThemeMode(effectivePref);
  } else {
    // Public site pages (/ , /login, /signup, /forgot, /onboard) use homeThemeMode only
    const curSite = getSite();
    mode = resolveEffectiveThemeMode(curSite.homeThemeMode || 'light');
  }
  void host;
  applyTheme(buildThemeForMode(mode, getTheme()), { silent: true });
}

export function applyTheme(t?: ThemeSettings, opts?: { silent?: boolean }) {
  const theme = t || getTheme();
  const root = document.documentElement.style;

  let bg = theme.bg || DEFAULT_THEME.bg;
  const isDark = theme.mode === 'light' ? false : theme.mode === 'dark' ? true : isDarkHex(bg);

  if (!isDark && isDarkHex(bg)) {
    bg = '#F8FAFC';
  } else if (isDark && (!isDarkHex(bg) || bg.toUpperCase() === '#050807')) {
    bg = '#0F1419';
  }

  const c1 = theme.c1 || DEFAULT_THEME.c1;
  const c2 = isDark ? (theme.c2 && theme.c2.toUpperCase() !== '#0D3B2E' ? theme.c2 : '#161B22') : '#FFFFFF';
  const c3 = theme.c3 || DEFAULT_THEME.c3;
  const c4 = isDark
    ? (theme.c4 && theme.c4.toUpperCase() !== '#0A120F' ? theme.c4 : '#1C222B')
    : '#F1F5F9';
  const c5 = theme.c5 || '#F59E0B';

  // Set explicit theme attributes so mobile browsers never override
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme-mode', theme.mode || (isDark ? 'dark' : 'light'));
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  document.documentElement.style.backgroundColor = bg;

  root.setProperty('--c1', c1);
  root.setProperty('--c2', c2);
  root.setProperty('--c3', c3);
  root.setProperty('--bg', bg);
  root.setProperty('--c4', c4);
  root.setProperty('--c5', c5);

  root.setProperty('--on-c1', ink(c1));
  root.setProperty('--on-c2', isDark ? ink(c2) : '#0F172A');
  root.setProperty('--on-c3', ink(c3));
  root.setProperty('--on-bg', isDark ? '#F8FAFC' : '#0F172A');

  const brandIsDark = isDarkHex(c1);
  const accentIsBright = c3 ? !isDarkHex(c3) : false;
  const brandInk = isDark
    ? brandIsDark
      ? accentIsBright
        ? c3
        : '#34D399'
      : c1
    : '#0F766E';

  root.setProperty('--brand', c1);
  root.setProperty('--brand-ink', brandInk);
  root.setProperty('--on-brand', ink(c1));
  root.setProperty('--navy', c2);
  root.setProperty('--on-navy', isDark ? ink(c2) : '#0F172A');
  root.setProperty('--accent', c3);
  root.setProperty('--on-accent', ink(c3));

  // Adaptive background, surfaces, calm hairline neutral borders, and crisp contrast
  root.setProperty('--surface', isDark ? '#161B22' : '#FFFFFF');
  root.setProperty('--panel', isDark ? '#1C222B' : '#F8FAFC');
  root.setProperty('--ink', isDark ? '#F8FAFC' : '#0F172A');
  root.setProperty('--muted', isDark ? '#94A3B8' : '#475569');
  root.setProperty('--line', isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1');
  root.setProperty('--sel', isDark ? 'rgba(255, 255, 255, 0.08)' : '#EEF2F6');
  root.setProperty('--soft', isDark ? 'rgba(15, 118, 110, 0.14)' : 'rgba(15, 118, 110, 0.08)');

  applyPlatformTypography(theme);

  if (typeof document !== 'undefined' && document.body) {
    document.body.style.backgroundColor = bg;
    document.body.style.color = isDark ? '#F8FAFC' : '#0F172A';
  }

  if (typeof window !== 'undefined' && !opts?.silent) {
    window.dispatchEvent(new CustomEvent('menuplus_theme_changed', { detail: theme }));
  }
}

// Session is cached locally and synced with server-side Supabase storage (/api/session).
const SESSION_KEY = 'menuplus_ses_v3';
const SESSION_ID_KEY = 'menuplus_sid_v1';
const AUTH_TOKEN_KEY = 'menuplus_auth_token_v1';

export function getAuthToken(): string {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) || '' : '';
  } catch {
    return '';
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (token && token.trim()) {
      localStorage.setItem(AUTH_TOKEN_KEY, token.trim());
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

export function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface StoreData {
  [key: string]: unknown;
}

const LOCAL_STORAGE_KEY = 'menuplus_standalone_db_v1';
let memoryDb: StoreData | null = null;

export function loadStore(): StoreData {
  if (memoryDb) return memoryDb;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        memoryDb = JSON.parse(raw);
        return memoryDb!;
      }
    }
  } catch {
    // fallback to memory
  }
  memoryDb = {};
  return memoryDb;
}

export function saveStore(store: StoreData) {
  memoryDb = store;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
    }
  } catch {
    // storage fallback
  }
}

const recentLocalWriteTs = new Map<string, number>();
let isPushRunning = false;
let activePushKeys = new Set<string>();
let queuedPut: Record<string, unknown> = {};
let queuedDel = new Set<string>();
let queuedWaiters: Array<{
  resolve: (val: { assignedOrderSeqs?: Record<string, number>; assignedReportSeqs?: Record<string, number> }) => void;
}> = [];
let activePushPromise: Promise<unknown> | null = null;
const DB_FETCH_TIMEOUT_MS = 8000;

const syncChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('menuplus_sync') : null;

function broadcastLocalDiff(put?: Record<string, unknown>, del?: string[]) {
  if (!syncChannel) return;
  try {
    syncChannel.postMessage({ type: 'diff', put, del });
  } catch {
    // ignore closed/unavailable channel
  }
}

function markLocalWriteKeys(put?: Record<string, unknown>, del?: string[]) {
  const now = Date.now();
  if (put) {
    for (const k of Object.keys(put)) {
      recentLocalWriteTs.set(k, now);
    }
  }
  if (del) {
    for (const k of del) {
      recentLocalWriteTs.set(k, now);
    }
  }
  if (recentLocalWriteTs.size > 150) {
    for (const [k, ts] of recentLocalWriteTs.entries()) {
      if (now - ts > 30000) recentLocalWriteTs.delete(k);
    }
  }
}

function collectDiffKeys(diff: { put?: Record<string, unknown>; del?: string[] }): Set<string> {
  const keys = new Set<string>();
  if (diff.put) {
    for (const k of Object.keys(diff.put)) keys.add(k);
  }
  if (diff.del) {
    for (const k of diff.del) keys.add(k);
  }
  return keys;
}

async function performPushDbDiff(diff: {
  put?: Record<string, unknown>;
  del?: string[];
}): Promise<{ assignedOrderSeqs?: Record<string, number>; assignedReportSeqs?: Record<string, number> }> {
  if (typeof fetch === 'undefined') return {};
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId =
    controller && typeof window !== 'undefined'
      ? window.setTimeout(() => controller.abort(), DB_FETCH_TIMEOUT_MS)
      : null;
  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify(diff),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as {
        assignedOrderSeqs?: Record<string, number>;
        assignedReportSeqs?: Record<string, number>;
      } | null;
      const store = loadStore();
      let mutated = false;
      if (data?.assignedOrderSeqs && typeof data.assignedOrderSeqs === 'object') {
        for (const [ordId, seqNum] of Object.entries(data.assignedOrderSeqs)) {
          const orderKey = `orders/${ordId}`;
          const existing = store[orderKey] as Record<string, unknown> | undefined;
          if (existing && typeof existing === 'object' && seqNum > 0) {
            store[orderKey] = { ...existing, seq: seqNum, orderSeq: seqNum };
            const rid = String(existing.rid || '').trim();
            if (rid && store[`restaurants/${rid}`] && typeof store[`restaurants/${rid}`] === 'object') {
              const rObj = store[`restaurants/${rid}`] as Record<string, unknown>;
              store[`restaurants/${rid}`] = {
                ...rObj,
                o: Math.max(Number(rObj.o || 0) || 0, seqNum),
              };
            }
            mutated = true;
          }
        }
      }
      if (data?.assignedReportSeqs && typeof data.assignedReportSeqs === 'object') {
        for (const [repId, seqNum] of Object.entries(data.assignedReportSeqs)) {
          const repKey = `reports/${repId}`;
          const existing = store[repKey] as Record<string, unknown> | undefined;
          if (existing && typeof existing === 'object' && seqNum > 0) {
            store[repKey] = { ...existing, seq: seqNum, reportSeq: seqNum };
            mutated = true;
          }
        }
      }
      if (mutated) {
        saveStore(store);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('menuplus_db_updated'));
        }
      }
      if (data?.assignedOrderSeqs || data?.assignedReportSeqs) {
        return {
          ...(data?.assignedOrderSeqs ? { assignedOrderSeqs: data.assignedOrderSeqs } : {}),
          ...(data?.assignedReportSeqs ? { assignedReportSeqs: data.assignedReportSeqs } : {}),
        };
      }
    }
  } catch {
    // offline standalone fallback or timeout
  } finally {
    if (timeoutId !== null && typeof window !== 'undefined') {
      window.clearTimeout(timeoutId);
    }
  }
  return {};
}

async function drainQueuedDiffs() {
  while (Object.keys(queuedPut).length > 0 || queuedDel.size > 0) {
    const batchPut = queuedPut;
    const batchDel = Array.from(queuedDel);
    const waiters = queuedWaiters;
    queuedPut = {};
    queuedDel = new Set<string>();
    queuedWaiters = [];

    const payload: { put?: Record<string, unknown>; del?: string[] } = {};
    if (Object.keys(batchPut).length > 0) payload.put = batchPut;
    if (batchDel.length > 0) payload.del = batchDel;
    activePushKeys = collectDiffKeys(payload);

    let result: { assignedOrderSeqs?: Record<string, number>; assignedReportSeqs?: Record<string, number> } = {};
    try {
      result = await performPushDbDiff(payload);
    } catch {
      result = {};
    }
    for (const w of waiters) {
      w.resolve(result);
    }
  }
}

export function pushDbDiff(diff: {
  put?: Record<string, unknown>;
  del?: string[];
}): Promise<{ assignedOrderSeqs?: Record<string, number>; assignedReportSeqs?: Record<string, number> }> {
  markLocalWriteKeys(diff.put, diff.del);

  if (!isPushRunning) {
    isPushRunning = true;
    activePushKeys = collectDiffKeys(diff);
    const runPromise = (async () => {
      try {
        return await performPushDbDiff(diff);
      } finally {
        try {
          await drainQueuedDiffs();
        } finally {
          activePushKeys = new Set<string>();
          isPushRunning = false;
          activePushPromise = null;
          if (queuedWaiters.length > 0) {
            const strayWaiters = queuedWaiters;
            queuedWaiters = [];
            for (const w of strayWaiters) w.resolve({});
          }
        }
      }
    })();
    activePushPromise = runPromise;
    return runPromise;
  }

  // Coalesce concurrent writes into a single batched follow-up request
  if (diff.put) {
    for (const [k, v] of Object.entries(diff.put)) {
      queuedPut[k] = v;
      queuedDel.delete(k);
    }
  }
  if (diff.del) {
    for (const k of diff.del) {
      queuedDel.add(k);
      delete queuedPut[k];
    }
  }

  return new Promise((resolve) => {
    queuedWaiters.push({ resolve });
  });
}

export async function flushPendingDbSync(): Promise<void> {
  if (activePushPromise) {
    try {
      await activePushPromise;
    } catch {
      // ignore transient flush error
    }
  }
}

export async function flushRemoteSync(): Promise<void> {
  // Synchronous localStorage persistence + async server sync
  const store = loadStore();
  await pushDbDiff({ put: store });
}

function replaceBrandTextDeep<T>(val: T): T {
  if (typeof val === 'string') {
    return val
      .replace(/إي منيو|اي منيو/g, 'منيو بلس')
      .replace(/ئی مینیۆ/g, 'مینیۆ پڵەس')
      .replace(/eMenu/gi, 'Menu+')
      .replace(/support@emenu\.iq/gi, 'support@menuplus.io') as unknown as T;
  }
  if (Array.isArray(val)) {
    return val.map((item) => replaceBrandTextDeep(item)) as unknown as T;
  }
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = replaceBrandTextDeep(v);
    }
    return out as T;
  }
  return val;
}

export function migrateBrandInStore(store: StoreData, syncRemote = false): void {
  const site = store['settings/site'] as SiteSettings | undefined;
  const home = store['settings/home'] as HomeSettings | undefined;
  let changed = false;
  const diffPut: Record<string, unknown> = {};

  if (site) {
    const nextSite = replaceBrandTextDeep(site);
    if (JSON.stringify(nextSite) !== JSON.stringify(site)) {
      store['settings/site'] = nextSite;
      diffPut['settings/site'] = nextSite;
      changed = true;
    }
  }
  if (home) {
    const nextHome = replaceBrandTextDeep(home);
    if (JSON.stringify(nextHome) !== JSON.stringify(home)) {
      store['settings/home'] = nextHome;
      diffPut['settings/home'] = nextHome;
      changed = true;
    }
  }

  const savedPlans = store['settings/plans'] as
    | {
        list?: PricingPlan[];
        planSchemaV2?: boolean;
        planPriceV2?: boolean;
        planCardV3?: boolean;
        planAnnual11V4?: boolean;
        planMultiBranchV5?: boolean;
        planNamesV6?: boolean;
        planThemesV7?: boolean;
        planNoFreeV8?: boolean;
      }
    | undefined;
  const officialPlanNamesById: Record<string, string> = {
    starter: 'الباقة الاقتصادية',
    pro: 'الباقة الاحترافية',
    vip: 'باقة الاعمال الشاملة',
  };
  if (!savedPlans || !savedPlans.planSchemaV2 || !Array.isArray(savedPlans.list) || savedPlans.list.length < 3) {
    const nextPlansDoc = {
      list: DEFAULT_PLANS_V2,
      planSchemaV2: true,
      planPriceV2: true,
      planCardV3: true,
      planAnnual11V4: true,
      planMultiBranchV5: true,
      planNamesV6: true,
      planThemesV7: true,
      planNoFreeV8: true,
    };
    store['settings/plans'] = nextPlansDoc;
    diffPut['settings/plans'] = nextPlansDoc;
    changed = true;
  } else if (
    !savedPlans.planPriceV2 ||
    !savedPlans.planCardV3 ||
    !savedPlans.planAnnual11V4 ||
    !savedPlans.planMultiBranchV5 ||
    !savedPlans.planNamesV6 ||
    !savedPlans.planThemesV7 ||
    !savedPlans.planNoFreeV8 ||
    savedPlans.list.some((pl) => pl.id === 'free' || Number(pl.pr) <= 0)
  ) {
    const priceUpdates: Record<string, { pr: number; annualPr: number; oldPrs: number[]; oldAnnuals: number[] }> = {
      starter: { pr: 9000, annualPr: 99000, oldPrs: [15000], oldAnnuals: [86000, 144000] },
      pro: { pr: 20000, annualPr: 220000, oldPrs: [21000, 29000], oldAnnuals: [192000, 201000, 278000] },
      vip: { pr: 29000, annualPr: 319000, oldPrs: [49000], oldAnnuals: [278000, 470000] },
    };
    const filteredList = savedPlans.list.filter((pl) => pl.id !== 'free' && Number(pl.pr) > 0);
    const baseList = filteredList.length > 0 ? filteredList : DEFAULT_PLANS_V2;
    const nextList = baseList.map((pl) => {
      const def = DEFAULT_PLANS_V2.find((d) => d.id === pl.id);
      const target = priceUpdates[pl.id];
      const shouldUpdatePrice = target && target.oldPrs.includes(Number(pl.pr));
      const shouldUpdateAnnual =
        target &&
        (shouldUpdatePrice ||
          target.oldAnnuals.includes(Number(pl.annualPr)) ||
          Number(pl.annualPr) === Math.round((Number(pl.pr) || 0) * 12 * 0.8));
      const nextFeatures = {
        ...(def?.featuresMap || {}),
        ...(pl.featuresMap || {}),
        ...(def && !savedPlans.planMultiBranchV5 && pl.featuresMap?.customSlug === undefined
          ? { customSlug: def.featuresMap?.customSlug }
          : {}),
      };
      const officialName = !savedPlans.planNamesV6 && officialPlanNamesById[pl.id] ? officialPlanNamesById[pl.id] : pl.n;
      const upgradedThemeCount =
        !savedPlans.planThemesV7 && def
          ? {
              maxThemes: def.maxThemes,
              ...(pl.id === 'starter' || pl.id === 'pro' ? { f: def.f } : {}),
            }
          : {};
      return {
        ...pl,
        n: officialName,
        ...(shouldUpdatePrice ? { pr: target.pr } : {}),
        ...(shouldUpdateAnnual
          ? { annualPr: shouldUpdatePrice ? target.annualPr : Math.round((Number(pl.pr) || 0) * 11) }
          : {}),
        ...(def && !savedPlans.planCardV3
          ? {
              tagline: def.tagline,
              f: def.f,
              ...(def.addonsHighlights ? { addonsHighlights: def.addonsHighlights } : {}),
            }
          : {}),
        ...(def && typeof pl.maxBranches !== 'number' ? { maxBranches: def.maxBranches } : {}),
        ...upgradedThemeCount,
        featuresMap: nextFeatures,
      };
    });
    const nextPlansDoc = {
      ...savedPlans,
      list: nextList,
      planPriceV2: true,
      planCardV3: true,
      planAnnual11V4: true,
      planMultiBranchV5: true,
      planNamesV6: true,
      planThemesV7: true,
      planNoFreeV8: true,
    };
    store['settings/plans'] = nextPlansDoc;
    diffPut['settings/plans'] = nextPlansDoc;
    changed = true;
  }

  const legacyPlanNameMap: Record<string, string> = {
    'البداية المجانية': 'الباقة الاقتصادية',
    'الباقة المجانية': 'الباقة الاقتصادية',
    'باقة الأعمال': 'الباقة الاقتصادية',
    'الأعمال الفضية': 'الباقة الاقتصادية',
    'الباقة الشاملة VIP': 'باقة الاعمال الشاملة',
    'الـ VIP الذهبية': 'باقة الاعمال الشاملة',
  };

  // Ensure every existing restaurant has default logo, coverImages, bio, and official plan names
  for (const key of Object.keys(store)) {
    if (key.startsWith('restaurants/') && !key.slice('restaurants/'.length).includes('/')) {
      const rest = store[key] as Restaurant | undefined;
      if (rest && typeof rest === 'object') {
        const mappedPlanName = rest.p && legacyPlanNameMap[rest.p.trim()] ? legacyPlanNameMap[rest.p.trim()] : rest.p;
        const isFreePlanId = rest.planId === 'free' || (rest.p && rest.p.trim() === 'الباقة المجانية');
        const patchedRest: Restaurant = {
          ...rest,
          ...(mappedPlanName !== rest.p ? { p: mappedPlanName } : {}),
          ...(isFreePlanId
            ? {
                planId: 'starter',
                p: mappedPlanName || 'الباقة الاقتصادية',
                isPaid: true,
              }
            : {}),
        };
        const normalized = ensureRestaurantDefaults(patchedRest);
        if (
          normalized.p !== rest.p ||
          normalized.planId !== rest.planId ||
          normalized.isPaid !== rest.isPaid ||
          normalized.logo !== rest.logo ||
          JSON.stringify(normalized.coverImages) !== JSON.stringify(rest.coverImages) ||
          normalized.aboutText !== rest.aboutText ||
          normalized.tagline !== rest.tagline
        ) {
          store[key] = normalized;
          diffPut[key] = normalized;
          changed = true;
        }
      }
    }
  }

  const demoRest = store['restaurants/demo'] as Restaurant | undefined;
  const needCapBurgerPhoneFix = !store['migrations/cap_burger_phone_07833239944_v1'];
  if (
    demoRest &&
    (demoRest.planId !== 'vip' ||
      demoRest.p !== 'باقة الاعمال الشاملة' ||
      demoRest.slug !== 'cap-burger' ||
      (needCapBurgerPhoneFix && demoRest.ph !== '07724799679'))
  ) {
    const nextDemo: Restaurant = {
      ...demoRest,
      planId: 'vip',
      p: 'باقة الاعمال الشاملة',
      isPaid: true,
      slug: demoRest.slug || 'cap-burger',
      ...(needCapBurgerPhoneFix ? { ph: '07724799679' } : {}),
    };
    store['restaurants/demo'] = nextDemo;
    diffPut['restaurants/demo'] = nextDemo;
    changed = true;
  }
  if (needCapBurgerPhoneFix && demoRest) {
    store['migrations/cap_burger_phone_07833239944_v1'] = true;
    diffPut['migrations/cap_burger_phone_07833239944_v1'] = true;
    changed = true;
  }

  if (!store['migrations/platform_phone_07724799679_v1']) {
    const curSite =
      store['settings/site'] && typeof store['settings/site'] === 'object'
        ? (store['settings/site'] as SiteSettings)
        : ({ ...DEFAULT_SITE } as SiteSettings);
    const oldPlaceholders = new Set(['', '07833239944', '9647833239944', '+9647833239944', '07701234567']);
    const curWa = String(curSite.wa || '').trim();
    const curSupportWa = String(curSite.supportWhatsapp || '').trim();
    if (oldPlaceholders.has(curWa) || oldPlaceholders.has(curSupportWa)) {
      const nextSite: SiteSettings = {
        ...curSite,
        wa: oldPlaceholders.has(curWa) ? '07724799679' : curWa,
        supportWhatsapp: oldPlaceholders.has(curSupportWa) ? '07724799679' : curSupportWa,
      };
      store['settings/site'] = nextSite;
      diffPut['settings/site'] = nextSite;
    }

    const curDemo = store['restaurants/demo'] as Restaurant | undefined;
    if (curDemo) {
      const curDemoSocialWa = String(curDemo.social?.whatsapp || '').trim();
      const nextDemo: Restaurant = {
        ...curDemo,
        ph: '07724799679',
        social: {
          ...(curDemo.social || {}),
          whatsapp:
            !curDemoSocialWa || curDemoSocialWa === '9647711448594' || curDemoSocialWa.includes('7833239944')
              ? '9647724799679'
              : curDemoSocialWa,
        },
      };
      store['restaurants/demo'] = nextDemo;
      diffPut['restaurants/demo'] = nextDemo;
    }

    store['migrations/platform_phone_07724799679_v1'] = true;
    diffPut['migrations/platform_phone_07724799679_v1'] = true;
    changed = true;
  }

  if (!store['migrations/disable_signup_default_v1']) {
    const curSite =
      store['settings/site'] && typeof store['settings/site'] === 'object'
        ? (store['settings/site'] as SiteSettings)
        : ({ ...DEFAULT_SITE } as SiteSettings);
    const nextSite: SiteSettings = {
      ...curSite,
      signupEnabled: false,
      su: 0,
    };
    store['settings/site'] = nextSite;
    store['migrations/disable_signup_default_v1'] = true;
    diffPut['settings/site'] = nextSite;
    diffPut['migrations/disable_signup_default_v1'] = true;
    changed = true;
  }

  const samplePartnerKeys = [
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
  const sampleRestaurantNames = new Set([
    'مطعم الأصالة العراقي',
    'برجر هاوس بغداد',
    'شاورما الشام والأصيل',
    'مطعم وكباب السندباد',
    'كافيه ومقهى ريحان',
    'مطعم دجلة للمأكولات البحرية',
  ]);
  const samplePartnerPhones = new Set([
    '07701234567',
    '07802345678',
    '07713456789',
    '07814567890',
    '07725678901',
    '07826789012',
  ]);
  const normDigits = (v: unknown) => {
    const d = String(v || '').replace(/\D/g, '');
    return d.startsWith('964') && d.length >= 13 ? `0${d.slice(3)}` : d;
  };
  const purgedRids = new Set<string>(['1', '2', '3', '4', '5', '6']);
  const keysToPurge = new Set<string>(samplePartnerKeys);
  for (const [k, v] of Object.entries(store)) {
    if (!v || typeof v !== 'object') continue;
    const rec = v as Record<string, unknown>;
    if (k.startsWith('restaurants/') && !k.slice('restaurants/'.length).includes('/')) {
      const rid = k.slice('restaurants/'.length);
      if (rid === 'demo') continue;
      if (sampleRestaurantNames.has(String(rec.n || '').trim()) || samplePartnerPhones.has(normDigits(rec.ph || rec.ow || ''))) {
        keysToPurge.add(k);
        purgedRids.add(rid);
      }
    }
  }
  for (const [k, v] of Object.entries(store)) {
    if (!v || typeof v !== 'object') continue;
    const rec = v as Record<string, unknown>;
    if (k.startsWith('accounts/')) {
      const id = k.slice('accounts/'.length);
      if (id.startsWith('acc_admin_') || id === 'acc_menu_demo') continue;
      const rid = String(rec.rid || '');
      const projectName = String(rec.projectName || rec.n || '').trim();
      const ph = normDigits(rec.phone || rec.ph || rec.projectPhone || rec.em || rec.username || '');
      if (purgedRids.has(rid) || sampleRestaurantNames.has(projectName) || samplePartnerPhones.has(ph)) {
        keysToPurge.add(k);
      }
    } else if ((k.startsWith('cats/') || k.startsWith('items/') || k.startsWith('orders/')) && purgedRids.has(String(rec.rid || ''))) {
      keysToPurge.add(k);
    }
  }
  const deletedSampleKeys: string[] = [];
  for (const sk of keysToPurge) {
    if (Object.prototype.hasOwnProperty.call(store, sk)) {
      delete store[sk];
      deletedSampleKeys.push(sk);
      changed = true;
    }
  }
  if (!store['migrations/purged_sample_partners_v8']) {
    store['migrations/purged_sample_partners_v8'] = true;
    diffPut['migrations/purged_sample_partners_v8'] = true;
    changed = true;
  }

  if (!store['migrations/default_light_platform_v1']) {
    const existingSite =
      store['settings/site'] && typeof store['settings/site'] === 'object'
        ? (store['settings/site'] as SiteSettings)
        : ({ ...DEFAULT_SITE } as SiteSettings);
    const nextSite: SiteSettings = { ...existingSite, homeThemeMode: 'light' };
    const existingTheme =
      store['settings/theme'] && typeof store['settings/theme'] === 'object'
        ? (store['settings/theme'] as ThemeSettings)
        : ({ ...DEFAULT_THEME } as ThemeSettings);
    const nextTheme: ThemeSettings = {
      ...DEFAULT_THEME,
      font: existingTheme.font || DEFAULT_THEME.font,
    };
    store['settings/site'] = nextSite;
    store['settings/theme'] = nextTheme;
    store['migrations/default_light_platform_v1'] = true;
    diffPut['settings/site'] = nextSite;
    diffPut['settings/theme'] = nextTheme;
    diffPut['migrations/default_light_platform_v1'] = true;
    changed = true;
  }

  if (!store['migrations/purged_7833239944_v3']) {
    const isTargetPhone7833 = (val: unknown): boolean => {
      const d = String(val || '').replace(/\D/g, '');
      const normalized = d.startsWith('964') && d.length >= 13 ? `0${d.slice(3)}` : d;
      return normalized === '07833239944' || normalized === '7833239944' || normalized === '9647833239944';
    };
    for (const [k, v] of Object.entries(store)) {
      if (!v || typeof v !== 'object') continue;
      const rec = v as Record<string, unknown>;
      if (k.startsWith('accounts/')) {
        const isProtectedAdmin =
          k === 'accounts/acc_admin_owner' || rec.admin === true || rec.r === 'admin';
        if (
          !isProtectedAdmin &&
          (isTargetPhone7833(rec.phone) ||
            isTargetPhone7833(rec.projectPhone) ||
            isTargetPhone7833(rec.em) ||
            isTargetPhone7833(rec.username) ||
            isTargetPhone7833(rec.e) ||
            isTargetPhone7833(rec.u))
        ) {
          delete store[k];
          changed = true;
        }
      } else if (k.startsWith('staff/')) {
        if (isTargetPhone7833(rec.phone) || isTargetPhone7833(rec.email)) {
          delete store[k];
          changed = true;
        }
      } else if (k.startsWith('restaurants/') && !k.slice('restaurants/'.length).includes('/')) {
        if (isTargetPhone7833(rec.ph) || isTargetPhone7833(rec.ow)) {
          store[k] = {
            ...rec,
            ...(isTargetPhone7833(rec.ph) ? { ph: '' } : {}),
            ...(isTargetPhone7833(rec.ow) ? { ow: '' } : {}),
          };
          changed = true;
        }
      }
    }
    store['migrations/purged_7833239944_v3'] = true;
    changed = true;
  }

  if (!store['migrations/hero_iraq_copy_v1']) {
    const existingHome = (store['settings/home'] as HomeSettings | undefined) || DEFAULT_HOME;
    const existingHero = existingHome.hero || DEFAULT_HOME.hero;
    const nextHome: HomeSettings = {
      ...existingHome,
      hero: {
        ...existingHero,
        titleLine1: 'المنيو الأذكى بالعراق',
        titleLine2: 'لمتجرك أو مطعمك',
        title: 'المنيو الأذكى بالعراق لمتجرك أو مطعمك',
        lead: 'أطلق متجرك الآن واستقبل الطلبات',
      },
    };
    store['settings/home'] = nextHome;
    store['migrations/hero_iraq_copy_v1'] = true;
    diffPut['settings/home'] = nextHome;
    diffPut['migrations/hero_iraq_copy_v1'] = true;
    changed = true;
  }

  if (!store['migrations/home_features_2col_v2']) {
    const existingHome = (store['settings/home'] as HomeSettings | undefined) || DEFAULT_HOME;
    const nextHome: HomeSettings = {
      ...DEFAULT_HOME,
      ...existingHome,
      hero: {
        ...DEFAULT_HOME.hero,
        ...(existingHome.hero || {}),
        cta1: 'جرب المنيو الان',
        cta1Link: existingHome.hero?.cta1Link === '/menu/demo' ? '/cap-burger' : (existingHome.hero?.cta1Link || '/cap-burger'),
        cta1Visible: true,
      },
      services: DEFAULT_HOME.services,
    };
    store['settings/home'] = nextHome;
    store['migrations/home_features_2col_v2'] = true;
    diffPut['settings/home'] = nextHome;
    diffPut['migrations/home_features_2col_v2'] = true;
    changed = true;
  }

  if (!store['migrations/root_codes_and_disable_google_subdomain_v1']) {
    const curSite =
      store['settings/site'] && typeof store['settings/site'] === 'object'
        ? (store['settings/site'] as SiteSettings)
        : ({ ...DEFAULT_SITE } as SiteSettings);
    const nextSite: SiteSettings = {
      ...curSite,
      googleAuthEnabled: false,
      subdomainRules: {
        enabled: false,
        baseDomain: curSite.subdomainRules?.baseDomain || 'menuplus.io',
        maxLength: curSite.subdomainRules?.maxLength || 32,
        blockedKeywords:
          curSite.subdomainRules?.blockedKeywords?.length
            ? curSite.subdomainRules.blockedKeywords
            : ['admin', 'www', 'api', 'mail', 'root', 'support', 'menu', 'app', 'dashboard', 'billing', 'staff'],
        allowHyphens: curSite.subdomainRules?.allowHyphens !== false,
      },
    };
    store['settings/site'] = nextSite;

    const curHome = (store['settings/home'] as HomeSettings | undefined) || DEFAULT_HOME;
    if (curHome?.hero?.cta1Link === '/menu/demo') {
      store['settings/home'] = {
        ...curHome,
        hero: { ...curHome.hero, cta1Link: '/cap-burger' },
      };
    }

    const takenSlugs = new Set<string>(['cap-burger']);
    for (const [k, v] of Object.entries(store)) {
      if (!k.startsWith('restaurants/') || k.slice('restaurants/'.length).includes('/') || !v || typeof v !== 'object') {
        continue;
      }
      const r = v as Restaurant;
      const rid = k.slice('restaurants/'.length);
      if (rid === 'demo') continue;
      const isFree = r.planId === 'free' || (!r.planId && !r.isPaid);
      const s = sanitizeSlug(r.slug || r.subdomain || '');
      if (!isFree && s && s.length >= 3 && !isReservedSlug(s)) {
        takenSlugs.add(s);
      }
    }
    for (const [k, v] of Object.entries(store)) {
      if (!k.startsWith('restaurants/') || k.slice('restaurants/'.length).includes('/') || !v || typeof v !== 'object') {
        continue;
      }
      const r = v as Restaurant;
      const rid = k.slice('restaurants/'.length);
      if (rid === 'demo') {
        store[k] = { ...r, slug: sanitizeSlug(r.slug || '') || 'cap-burger', subdomain: '', isPaid: true };
        continue;
      }
      const isFree = r.planId === 'free' || (!r.planId && !r.isPaid);
      const s = sanitizeSlug(r.slug || r.subdomain || '');
      let nextSlug = s;
      if (isFree) {
        nextSlug = isValidSixCharCode(s) && !isReservedSlug(s) && !takenSlugs.has(s) ? s : generateRandomMenuCode(takenSlugs);
      } else if (!s || s.length < 3 || isReservedSlug(s)) {
        nextSlug = generateRandomMenuCode(takenSlugs);
      }
      takenSlugs.add(nextSlug);
      store[k] = { ...r, isPaid: !isFree, slug: nextSlug, subdomain: '' };
    }

    store['migrations/root_codes_and_disable_google_subdomain_v1'] = true;
    changed = true;
  }

  if (!store['migrations/remove_thmanyah_default_tajawal_v1']) {
    const curTheme =
      store['settings/theme'] && typeof store['settings/theme'] === 'object'
        ? (store['settings/theme'] as ThemeSettings)
        : ({ ...DEFAULT_THEME } as ThemeSettings);
    const curTypo =
      curTheme.typography && typeof curTheme.typography === 'object'
        ? { ...(curTheme.typography as Record<string, any>) }
        : {};
    delete curTypo.thmanyahFamily;
    const rawKey = String(curTypo.fontKey || curTheme.font || '').trim().toLowerCase();
    // Migrate any thmanyah or previous default alexandria to tajawal; keep explicit firjar/alan_sans/tajawal
    const nextKey =
      rawKey === 'firjar' || rawKey === 'alan_sans' || rawKey === 'tajawal'
        ? rawKey
        : 'tajawal';
    const nextTheme: ThemeSettings = {
      ...curTheme,
      font: nextKey,
      typography: {
        ...DEFAULT_TYPOGRAPHY,
        ...curTypo,
        fontKey: nextKey,
        separateHeadingFont: false,
        headingFontKey: nextKey,
        bodyFontKey: nextKey,
      },
    };
    store['settings/theme'] = nextTheme;
    store['migrations/curated_google_fonts_cleanup_v1'] = true;
    store['migrations/remove_thmanyah_default_tajawal_v1'] = true;
    delete store['migrations/thmanyah_serif_display_headings_v1'];
    diffPut['settings/theme'] = nextTheme;
    diffPut['migrations/curated_google_fonts_cleanup_v1'] = true;
    diffPut['migrations/remove_thmanyah_default_tajawal_v1'] = true;
    changed = true;
  }

  if (!store['migrations/demo_platform_admin_07711448594_v1'] || !store['accounts/acc_admin_demo']) {
    const demoAdminAcc = {
      id: 'acc_admin_demo',
      n: 'مدير منصة تجريبي',
      roleTitle: 'مدير منصة تجريبي',
      username: '07711448594',
      em: '07711448594',
      phone: '+9647711448594',
      pw: '29a217776b53a000d9a17f20587c7983ab7749f3d03a566b0aac9684cec5cbd4',
      rid: 'demo',
      admin: true,
      active: true,
      at: today(),
    };
    store['accounts/acc_admin_demo'] = demoAdminAcc;
    store['migrations/demo_platform_admin_07711448594_v1'] = true;
    changed = true;
  }

  if (!store['migrations/remove_free_plan_v1']) {
    const curHome = (store['settings/home'] as HomeSettings | undefined) || DEFAULT_HOME;
    const curPricing = { ...(curHome.pricing || DEFAULT_HOME.pricing) } as Record<string, unknown>;
    delete curPricing.freeBadge;
    delete curPricing.freeCta;
    if (typeof curPricing.sub !== 'string' || /مجان|مجانية/i.test(curPricing.sub)) {
      curPricing.sub = DEFAULT_HOME.pricing.sub;
    }
    const curNav = { ...(curHome.nav || DEFAULT_HOME.nav) };
    if (curNav.modalSignup === 'إنشاء حساب مجاني') {
      curNav.modalSignup = 'إنشاء حساب';
    }
    const curHero = { ...(curHome.hero || DEFAULT_HOME.hero) };
    if (typeof curHero.cta1 === 'string' && /مجانا|مجاناً/i.test(curHero.cta1)) {
      curHero.cta1 = 'جرب المنيو الان';
    }
    const curFaqItems = Array.isArray(curHome.faq?.items)
      ? curHome.faq.items.map((item) =>
          item.id === 'faq_5' || /الباقة المجانية|أبدأ مجاناً/i.test(`${item.q || ''} ${item.a || ''}`)
            ? {
                ...item,
                q: DEFAULT_HOME.faq!.items[4].q,
                a: DEFAULT_HOME.faq!.items[4].a,
              }
            : item
        )
      : DEFAULT_HOME.faq!.items;
    const nextHome: HomeSettings = {
      ...curHome,
      nav: curNav,
      hero: curHero,
      pricing: curPricing as HomeSettings['pricing'],
      faq: {
        enabled: curHome.faq?.enabled !== false,
        title: curHome.faq?.title || DEFAULT_HOME.faq!.title,
        sub: curHome.faq?.sub || DEFAULT_HOME.faq!.sub,
        items: curFaqItems,
      },
    };
    store['settings/home'] = nextHome;
    diffPut['settings/home'] = nextHome;
    store['migrations/remove_free_plan_v1'] = true;
    diffPut['migrations/remove_free_plan_v1'] = true;
    changed = true;
  }

  if (changed) {
    saveStore(store);
    if (diffPut['settings/theme'] && typeof document !== 'undefined') {
      applyScopedTheme();
    }
    if (syncRemote) {
      void pushDbDiff({
        ...(Object.keys(diffPut).length > 0 ? { put: diffPut } : {}),
        ...(deletedSampleKeys.length > 0 ? { del: deletedSampleKeys } : {}),
      });
    }
  }
}

let inFlightSyncPromise: Promise<boolean> | null = null;
let lastServerSyncAt = 0;

export async function syncFromServer(force = false): Promise<boolean> {
  if (!force && inFlightSyncPromise) {
    return inFlightSyncPromise;
  }
  if (!force && lastServerSyncAt > 0 && Date.now() - lastServerSyncAt < 1500 && !activePushPromise) {
    return true;
  }

  const runSync = (async (): Promise<boolean> => {
    await flushPendingDbSync();
    const fetchStartedAt = Date.now();
    const local = loadStore();
    if (typeof fetch !== 'undefined') {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId =
        controller && typeof window !== 'undefined'
          ? window.setTimeout(() => controller.abort(), DB_FETCH_TIMEOUT_MS)
          : null;
      try {
        const res = await fetch('/api/db', {
          cache: 'no-store',
          credentials: 'include',
          headers: getAuthHeaders(),
          ...(controller ? { signal: controller.signal } : {}),
        });
        if (res.ok) {
          const remote = (await res.json()) as StoreData;
          if (remote && typeof remote === 'object' && Object.keys(remote).length > 0) {
            const curSes = getSession();
            const latestLocal = loadStore();
            const cleanedLocal: StoreData = { ...latestLocal };
            // Unauthenticated /api/db intentionally omits private accounts/* & staff/*;
            // purge stale cached partner accounts/staff from localStorage so deleted users never linger
            if (!curSes) {
              for (const k of Object.keys(cleanedLocal)) {
                if (
                  (k.startsWith('accounts/') &&
                    !k.startsWith('accounts/acc_admin_') &&
                    k !== 'accounts/acc_menu_demo') ||
                  k.startsWith('staff/')
                ) {
                  delete cleanedLocal[k];
                }
              }
            }
            const merged: StoreData = { ...cleanedLocal, ...remote };
            // Protect any key written locally right before/during GET /api/db or still queued/in-flight
            for (const [k, writeTs] of recentLocalWriteTs.entries()) {
              const isQueuedOrInFlight =
                activePushKeys.has(k) ||
                Object.prototype.hasOwnProperty.call(queuedPut, k) ||
                queuedDel.has(k);
              if (isQueuedOrInFlight || writeTs >= fetchStartedAt - 6000) {
                if (Object.prototype.hasOwnProperty.call(cleanedLocal, k)) {
                  merged[k] = cleanedLocal[k];
                } else {
                  delete merged[k];
                }
              }
            }
            // Preserve newer demoVersion locally if remote has older demo schema
            const localDemo = local['restaurants/demo'] as Restaurant | undefined;
            const remoteDemo = remote['restaurants/demo'] as Restaurant | undefined;
            if (
              localDemo?.demoVersion === 'cap_burger_v13' &&
              remoteDemo?.demoVersion !== 'cap_burger_v13'
            ) {
              merged['restaurants/demo'] = localDemo;
            }
            memoryDb = merged;
            saveStore(merged);
            lastServerSyncAt = Date.now();
          }
        }
      } catch {
        // standalone offline mode or timeout
      } finally {
        if (timeoutId !== null && typeof window !== 'undefined') {
          window.clearTimeout(timeoutId);
        }
      }
    }
    migrateBrandInStore(loadStore(), Boolean(getSession()));
    ensureDemoRestaurant();
    applyScopedTheme();
    return true;
  })().finally(() => {
    if (inFlightSyncPromise === runSync) {
      inFlightSyncPromise = null;
    }
  });

  inFlightSyncPromise = runSync;
  return runSync;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LOCAL_STORAGE_KEY && e.newValue) {
      try {
        memoryDb = JSON.parse(e.newValue);
        window.dispatchEvent(new CustomEvent('menuplus_db_updated'));
      } catch {
        // ignore parse error
      }
    }
  });
}

if (syncChannel) {
  syncChannel.onmessage = (ev: MessageEvent) => {
    const msg = ev?.data as { type?: string; put?: Record<string, unknown>; del?: string[] } | undefined;
    if (!msg || msg.type !== 'diff') return;
    const store = loadStore();
    let changed = false;
    if (msg.put && typeof msg.put === 'object') {
      for (const [k, v] of Object.entries(msg.put)) {
        store[k] = v;
        changed = true;
      }
    }
    if (Array.isArray(msg.del)) {
      for (const k of msg.del) {
        if (k in store) {
          delete store[k];
          changed = true;
        }
      }
    }
    if (changed) {
      saveStore(store);
      if (msg.put && 'settings/theme' in msg.put && typeof document !== 'undefined') {
        applyScopedTheme();
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('menuplus_db_updated'));
      }
    }
  };
}

export function getItem<T>(path: string): T | undefined {
  const store = loadStore();
  return store[path] as T;
}

export function putItem<T>(path: string, val: T): T {
  const store = loadStore();
  let finalVal = val;
  if (
    path.startsWith('restaurants/') &&
    !path.slice('restaurants/'.length).includes('/') &&
    val &&
    typeof val === 'object'
  ) {
    finalVal = ensureRestaurantDefaults(val as unknown as Restaurant) as unknown as T;
  }
  store[path] = finalVal;
  saveStore(store);
  broadcastLocalDiff({ [path]: finalVal });
  if (path === 'settings/theme' && typeof document !== 'undefined') {
    applyScopedTheme();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('menuplus_db_updated'));
  }
  void pushDbDiff({ put: { [path]: finalVal } });
  return finalVal;
}

export async function putItemAndSync<T>(path: string, val: T): Promise<T> {
  const store = loadStore();
  let finalVal = val;
  if (
    path.startsWith('restaurants/') &&
    !path.slice('restaurants/'.length).includes('/') &&
    val &&
    typeof val === 'object'
  ) {
    finalVal = ensureRestaurantDefaults(val as unknown as Restaurant) as unknown as T;
  }
  store[path] = finalVal;
  saveStore(store);
  broadcastLocalDiff({ [path]: finalVal });
  if (path === 'settings/theme' && typeof document !== 'undefined') {
    applyScopedTheme();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('menuplus_db_updated'));
  }
  const syncRes = await pushDbDiff({ put: { [path]: finalVal } });
  if (
    path.startsWith('orders/') &&
    syncRes?.assignedOrderSeqs &&
    finalVal &&
    typeof finalVal === 'object'
  ) {
    const orderId = path.slice('orders/'.length);
    const assignedSeq = syncRes.assignedOrderSeqs[orderId];
    if (assignedSeq && assignedSeq > 0) {
      finalVal = {
        ...(finalVal as Record<string, unknown>),
        seq: assignedSeq,
        orderSeq: assignedSeq,
      } as unknown as T;
    }
  }
  return finalVal;
}

export async function putManyAndSync(entries: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(entries);
  if (keys.length === 0) return;
  const store = loadStore();
  const normalizedPut: Record<string, unknown> = {};
  let hasThemeUpdate = false;

  for (const path of keys) {
    let finalVal = entries[path];
    if (
      path.startsWith('restaurants/') &&
      !path.slice('restaurants/'.length).includes('/') &&
      finalVal &&
      typeof finalVal === 'object'
    ) {
      finalVal = ensureRestaurantDefaults(finalVal as unknown as Restaurant);
    }
    store[path] = finalVal;
    normalizedPut[path] = finalVal;
    if (path === 'settings/theme') hasThemeUpdate = true;
  }

  saveStore(store);
  broadcastLocalDiff(normalizedPut);
  if (hasThemeUpdate && typeof document !== 'undefined') {
    applyScopedTheme();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('menuplus_db_updated'));
  }
  await pushDbDiff({ put: normalizedPut });
}

export function deleteItem(path: string) {
  const store = loadStore();
  delete store[path];
  saveStore(store);
  broadcastLocalDiff(undefined, [path]);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('menuplus_db_updated'));
  }
  void pushDbDiff({ del: [path] });
}

export async function deleteItemAndSync(path: string): Promise<void> {
  const store = loadStore();
  delete store[path];
  saveStore(store);
  broadcastLocalDiff(undefined, [path]);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('menuplus_db_updated'));
  }
  await pushDbDiff({ del: [path] });
}

export function getCollection<T>(collection: string): (T & { id: string })[] {
  const store = loadStore();
  const prefix = collection + '/';
  const result: (T & { id: string })[] = [];
  for (const k of Object.keys(store)) {
    if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
      const item = store[k] as T;
      if (item && typeof item === 'object') {
        result.push({
          ...item,
          id: k.slice(prefix.length),
        });
      }
    }
  }
  return result;
}

export function resolveRestaurantByIdOrSlug(idOrSlug: string): (Restaurant & { id: string }) | undefined {
  const target = String(idOrSlug || '').trim();
  if (!target) return undefined;
  const direct = getItem<Restaurant>(`restaurants/${target}`);
  if (direct) return { ...direct, id: target };
  const normalized = sanitizeSlug(target);
  if (!normalized) return undefined;
  const all = getCollection<Restaurant>('restaurants');
  const matched = all.find(
    (r) =>
      (r.slug && sanitizeSlug(r.slug) === normalized) ||
      (r.subdomain && sanitizeSlug(r.subdomain) === normalized)
  );
  if (matched) return matched;

  if (normalized === 'cap-burger' || normalized === 'demo' || normalized === 'capburger') {
    let demo = getItem<Restaurant>('restaurants/demo');
    if (!demo) {
      ensureDemoRestaurant();
      demo = getItem<Restaurant>('restaurants/demo');
    }
    if (demo) {
      return { ...demo, id: 'demo', slug: demo.slug || 'cap-burger' };
    }
  }
  return undefined;
}

export function isSlugAvailable(slug: string, excludeRid?: string): boolean {
  const normalized = sanitizeSlug(slug);
  if (!normalized || normalized.length < 3 || isReservedSlug(normalized)) return false;
  const all = getCollection<Restaurant>('restaurants');
  return !all.some(
    (r) =>
      r.id !== excludeRid &&
      ((r.slug && sanitizeSlug(r.slug) === normalized) ||
        (r.subdomain && sanitizeSlug(r.subdomain) === normalized))
  );
}

export function getTheme(): ThemeSettings {
  const saved = getItem<ThemeSettings>('settings/theme');
  return { ...DEFAULT_THEME, ...(saved || {}) };
}

export function getSite(): SiteSettings {
  const saved = getItem<SiteSettings>('settings/site');
  return { ...DEFAULT_SITE, ...(saved || {}) };
}

export function getPlans(): PricingPlan[] {
  const saved = getItem<{ list: PricingPlan[]; planSchemaV2?: boolean }>('settings/plans');
  if (saved && saved.planSchemaV2 && Array.isArray(saved.list) && saved.list.length > 0) {
    return saved.list;
  }
  return DEFAULT_PLANS_V2;
}

export function getHome(): HomeSettings {
  const saved = getItem<Partial<HomeSettings>>('settings/home');
  const savedFaq = saved?.faq;
  const defaultFaq = DEFAULT_HOME.faq!;
  return {
    ...DEFAULT_HOME,
    ...(saved || {}),
    sections: {
      ...DEFAULT_HOME.sections,
      ...(saved?.sections || {}),
    },
    nav: { ...DEFAULT_HOME.nav, ...(saved?.nav || {}) },
    hero: { ...DEFAULT_HOME.hero, ...(saved?.hero || {}) },
    services: {
      ...DEFAULT_HOME.services,
      ...(saved?.services || {}),
      list:
        Array.isArray(saved?.services?.list) && saved.services.list.length > 0
          ? saved.services.list
          : DEFAULT_HOME.services.list,
    },
    steps: { ...DEFAULT_HOME.steps, ...(saved?.steps || {}) },
    demo: { ...DEFAULT_HOME.demo, ...(saved?.demo || {}) },
    pricing: { ...DEFAULT_HOME.pricing, ...(saved?.pricing || {}) },
    footerConfig: { ...(saved?.footerConfig || {}) },
    faq: {
      enabled: savedFaq?.enabled !== undefined ? savedFaq.enabled : defaultFaq.enabled,
      title: savedFaq?.title || defaultFaq.title,
      sub: savedFaq?.sub || defaultFaq.sub,
      items: Array.isArray(savedFaq?.items) ? savedFaq.items : defaultFaq.items,
    },
  };
}

function getStoredSessionId(): string {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_ID_KEY) || '' : '';
  } catch {
    return '';
  }
}

function setStoredSessionId(sid: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (sid) {
      localStorage.setItem(SESSION_ID_KEY, sid);
    } else {
      localStorage.removeItem(SESSION_ID_KEY);
    }
  } catch {
    // ignore
  }
}

async function syncSessionToServer(s: Session | null): Promise<void> {
  if (typeof fetch === 'undefined') return;
  const sid = getStoredSessionId();
  try {
    if (s) {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: getAuthHeaders({
          'Content-Type': 'application/json',
          ...(sid ? { 'X-Session-Id': sid } : {}),
        }),
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ session: s }),
      });
      if (res.ok) {
        const data = (await res.json()) as { sessionId?: string };
        if (data?.sessionId) {
          setStoredSessionId(data.sessionId);
        }
      }
    } else {
      await fetch('/api/session', {
        method: 'DELETE',
        headers: getAuthHeaders(sid ? { 'X-Session-Id': sid } : {}),
        credentials: 'include',
        cache: 'no-store',
      });
      setStoredSessionId(null);
    }
  } catch {
    // offline standalone fallback
  }
}

export async function syncSessionFromServer(): Promise<Session | null> {
  const localSes = getSession();
  if (typeof fetch === 'undefined') return localSes;
  const sid = getStoredSessionId();

  try {
    const res = await fetch('/api/session', {
      method: 'GET',
      headers: getAuthHeaders(sid ? { 'X-Session-Id': sid } : {}),
      credentials: 'include',
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as { sessionId?: string; session?: Session | null };
      if (data?.sessionId) {
        setStoredSessionId(data.sessionId);
      }
      if (data?.session && typeof data.session === 'object') {
        const normalizedRemote = normalizeSessionRecord(data.session);
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify(normalizedRemote));
        } catch {
          // ignore
        }
        return normalizedRemote;
      }
      if (localSes) {
        await syncSessionToServer(localSes);
      }
    }
  } catch {
    // standalone offline fallback
  }
  return localSes;
}

function normalizeSessionRecord(s: Session | null): Session | null {
  if (!s || typeof s !== 'object') return null;
  if (s.admin) {
    if (s.menuLoggedOut) {
      return {
        ...s,
        menuLoggedOut: true,
        rid: undefined,
        personalRid: undefined,
        impersonating: false,
      };
    }
    const personalRid = s.personalRid || 'demo';
    return {
      ...s,
      personalRid,
      rid: s.rid || personalRid,
    };
  }
  return s;
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    return normalizeSessionRecord(parsed);
  } catch {
    return null;
  }
}

function setLocalSessionOnly(s: Session | null): Session | null {
  const normalized = normalizeSessionRecord(s);
  try {
    if (normalized) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('menuplus_session_changed', { detail: normalized }));
  }
  return normalized;
}

export async function fetchAuthMe(): Promise<Session | null> {
  if (typeof fetch === 'undefined') return getSession();
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as { authenticated?: boolean; token?: string; session?: Session | null };
      if (data.authenticated && data.session) {
        if (data.token) setAuthToken(data.token);
        return setLocalSessionOnly(data.session);
      }
      if (data.authenticated === false) {
        setAuthToken(null);
        setLocalSessionOnly(null);
        return null;
      }
    }
  } catch {
    // offline fallback
  }
  return getSession();
}

export async function loginWithServer(payload: {
  identifier: string;
  fullPhone?: string;
  password: string;
}): Promise<{ ok: boolean; session?: Session; restaurant?: Restaurant | null; error?: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    token?: string;
    session?: Session;
    restaurant?: Restaurant | null;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.session) {
    return { ok: false, error: data.error || 'بيانات الدخول غير صحيحة.' };
  }
  if (data.token) setAuthToken(data.token);
  const normalized = setLocalSessionOnly(data.session)!;
  if (data.restaurant && data.restaurant.id) {
    const store = loadStore();
    store[`restaurants/${data.restaurant.id}`] = ensureRestaurantDefaults(data.restaurant);
    saveStore(store);
  }
  await syncFromServer(true).catch(() => false);
  return { ok: true, session: normalized, restaurant: data.restaurant || null };
}

export async function saveOnboardProfileToServer(payload: {
  rid: string;
  n?: string;
  ph?: string;
  projectType?: 'restaurant' | 'store';
  logo?: string;
  coverImages?: string[];
  slug?: string;
  tagline?: string;
  aboutText?: string;
  themeMode?: 'light' | 'dark';
  themePreset?: string;
  themeShape?: MenuThemeShape;
  color?: string;
  lay?: MenuLayout;
  h?: Restaurant['h'];
  done?: number;
  on?: number;
}): Promise<{ ok: boolean; restaurant?: Restaurant; error?: string }> {
  const res = await fetch('/api/onboard/profile', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    restaurant?: Restaurant;
    error?: string;
  };
  if (res.ok && data.ok && data.restaurant && payload.rid) {
    const store = loadStore();
    store[`restaurants/${payload.rid}`] = ensureRestaurantDefaults(data.restaurant);
    saveStore(store);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('menuplus_db_updated'));
    }
    return { ok: true, restaurant: data.restaurant };
  }
  return { ok: false, error: data.error || 'تعذر حفظ بيانات المشروع.' };
}

export async function impersonateWithServer(targetRid: string | null): Promise<{
  ok: boolean;
  session?: Session;
  error?: string;
}> {
  const res = await fetch('/api/auth/impersonate', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid: targetRid }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    token?: string;
    session?: Session;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.session) {
    return { ok: false, error: data.error || 'غير مصرح بفتح لوحة التحكم.' };
  }
  if (data.token) setAuthToken(data.token);
  const normalized = setLocalSessionOnly(data.session)!;
  const store = loadStore();
  const hasCachedTarget = Boolean(targetRid && store[`restaurants/${targetRid}`]);
  if (hasCachedTarget) {
    void syncFromServer(true).catch(() => false);
  } else {
    await syncFromServer(true).catch(() => false);
  }
  return { ok: true, session: normalized };
}

export async function logoutFromServer(
  scope: 'menu' | 'all' = 'all'
): Promise<{ partial: boolean; session: Session | null }> {
  const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
  const currentLocal = getSession();

  if (scope === 'menu' && currentLocal?.admin && !currentLocal.menuLoggedOut) {
    let nextSes: Session = {
      ...currentLocal,
      menuLoggedOut: true,
      rid: undefined,
      personalRid: undefined,
      impersonating: false,
    };
    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch('/api/auth/logout', {
          method: 'POST',
          headers,
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({ scope: 'menu' }),
        });
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            partial?: boolean;
            token?: string;
            session?: Session | null;
          };
          if (data.token) setAuthToken(data.token);
          if (data.session) nextSes = data.session;
        }
      } catch {
        // fallback to local menu logout
      }
    }
    const saved = setLocalSessionOnly(nextSes);
    return { partial: true, session: saved };
  }

  setAuthToken(null);
  setLocalSessionOnly(null);
  setStoredSessionId(null);
  if (typeof window !== 'undefined') {
    import('../lib/supabase')
      .then(({ getSupabaseBrowserClient }) => getSupabaseBrowserClient())
      .then((sb) => sb?.auth.signOut())
      .catch(() => {});
  }
  if (typeof fetch !== 'undefined') {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({ scope: 'all' }),
    }).catch(() => {});
  }
  return { partial: false, session: null };
}

export async function submitReviewToServer(
  rid: string,
  review: { name: string; rate: number; comment: string }
): Promise<{ ok: boolean; reviews?: any[]; error?: string }> {
  const res = await fetch('/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid, ...review }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reviews?: any[]; error?: string };
  return { ok: Boolean(res.ok && data.ok), reviews: data.reviews, error: data.error };
}

export function setSession(s: Session | null) {
  const normalized = setLocalSessionOnly(s);
  void syncSessionToServer(normalized);
}

// Activity Logging
export function logActivity(
  actor: string,
  action: string,
  details?: string,
  type: ActivityLog['type'] = 'system'
) {
  const logId = uid();
  const log: ActivityLog = {
    id: logId,
    at: Date.now(),
    actor: actor || 'مدير المنصة',
    action,
    details,
    type,
  };
  putItem(`logs/${logId}`, log);
}

export function getActivityLogs(limit = 80): ActivityLog[] {
  const logs = getCollection<ActivityLog>('logs');
  return logs.sort((a, b) => b.at - a.at).slice(0, limit);
}

// Notes & Ideas Management (Document-backed inside data/notes-document.md & .json)
export interface NotesDocumentPayload {
  notes: AdminNote[];
  filePath: string;
  jsonPath?: string;
  documentText: string;
  plainCopyText: string;
}

function syncNotesIntoMemory(notes: AdminNote[]) {
  const store = loadStore();
  for (const k of Object.keys(store)) {
    if (k.startsWith('notes/')) {
      delete store[k];
    }
  }
  for (const n of notes) {
    store[`notes/${n.id}`] = n;
  }
  memoryDb = store;
  saveStore(store);
}

export function getAdminNotes(): AdminNote[] {
  const notes = getCollection<AdminNote>('notes');
  return notes.sort((a, b) => {
    const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinDiff !== 0) return pinDiff;
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });
}

export async function fetchNotesDocument(): Promise<NotesDocumentPayload | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch('/api/notes', { cache: 'no-store', credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as NotesDocumentPayload;
    if (Array.isArray(data.notes)) {
      syncNotesIntoMemory(data.notes);
    }
    return data;
  } catch {
    return null;
  }
}

export async function saveNoteToDocument(note: AdminNote): Promise<NotesDocumentPayload | null> {
  const store = loadStore();
  store[`notes/${note.id}`] = note;
  memoryDb = store;
  saveStore(store);

  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({ action: 'save', note }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NotesDocumentPayload;
    if (Array.isArray(data.notes)) {
      syncNotesIntoMemory(data.notes);
    }
    return data;
  } catch {
    return null;
  }
}

export async function deleteNoteFromDocument(id: string): Promise<NotesDocumentPayload | null> {
  const store = loadStore();
  delete store[`notes/${id}`];
  memoryDb = store;
  saveStore(store);

  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({ action: 'delete', id }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NotesDocumentPayload;
    if (Array.isArray(data.notes)) {
      syncNotesIntoMemory(data.notes);
    }
    return data;
  } catch {
    return null;
  }
}

export function saveAdminNote(note: AdminNote) {
  putItem(`notes/${note.id}`, note);
  void saveNoteToDocument(note);
}

export function deleteAdminNote(id: string) {
  deleteItem(`notes/${id}`);
  void deleteNoteFromDocument(id);
}

export async function copyTextReliable(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }
  } catch {
    // ignore
  }
  return false;
}

// Staff Management
export function getStaffList(): StaffMember[] {
  return getCollection<StaffMember>('staff');
}

export function saveStaffMember(staff: StaffMember) {
  putItem(`staff/${staff.id}`, staff);
}

export function deleteStaffMember(id: string) {
  deleteItem(`staff/${id}`);
}

export function replaceCollectionCache<T extends { id: string }>(collection: string, items: T[]) {
  const store = loadStore();
  const prefix = `${collection}/`;
  for (const k of Object.keys(store)) {
    if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
      delete store[k];
    }
  }
  for (const item of items) {
    if (item && item.id) {
      store[`${prefix}${item.id}`] = item;
    }
  }
  saveStore(store);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('menuplus_db_updated'));
  }
}

// Full Database Export / Import
export function exportDatabaseJson(): string {
  const store = loadStore();
  return JSON.stringify(store, null, 2);
}

export function importDatabaseJson(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const safeStore: StoreData = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        safeStore[k] = v;
      }
      saveStore(safeStore);
      void flushRemoteSync();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Dedicated Demo Restaurant Seeding (Cap Burger Full Menu Showcase)
export function ensureDemoRestaurant() {
  const store = loadStore();
  const demoRest = store['restaurants/demo'] as Restaurant | undefined;

  if (demoRest && (!demoRest.slug || demoRest.a === 0)) {
    store['restaurants/demo'] = {
      ...demoRest,
      slug: demoRest.slug || 'cap-burger',
      a: 1,
    };
    saveStore(store);
  }

  if (!demoRest || demoRest.demoVersion !== 'cap_burger_v13') {
    // Clean legacy demo categories & items
    for (const key of Object.keys(store)) {
      if (key.startsWith('cats/')) {
        const c = store[key] as Category | undefined;
        if (c?.rid === 'demo' || key.startsWith('cats/cb_') || key.startsWith('cats/cat_')) {
          delete store[key];
        }
      } else if (key.startsWith('items/')) {
        const it = store[key] as MenuItem | undefined;
        if (it?.rid === 'demo' || key.startsWith('items/cb_') || key.startsWith('items/it_')) {
          delete store[key];
        }
      }
    }

    store['restaurants/demo'] = {
      id: 'demo',
      slug: 'cap-burger',
      demoVersion: 'cap_burger_v13',
      n: 'كاب برجر',
      tagline: 'متخصصون بألذ السماش برجر الطازج والدجاج الكريسبي والمشروبات الباردة',
      p: 'باقة الاعمال الشاملة',
      planId: 'vip',
      e: '2030-01-01',
      projectType: 'restaurant',
      a: 1,
      o: 48,
      v: 840,
      done: 1,
      lay: 'list',
      h: { m: 'c', f: '10:00', t: '23:59' },
      ph: '07724799679',
      isPaid: true,
      color: '#1B5E4A',
      currency: 'د.ع',
      country: 'العراق',
      region: 'بغداد',
      language: 'ar',
      logo: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80',
      coverImages: [
        'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
      ],
      taxNote: 'الأسعار شاملة الضريبة والتغليف الحراري',
      aboutText:
        'أهلاً بكم في كاب برجر – نُحضر يومياً أشهى وجبات السماش برجر بلحم الأنجوس الطازج، برجر الدجاج الكريسبي المقرمش، والبطاطا بالجبن مع تشكيلة صوصاتنا السرية والمشروبات الباردة.',
      aboutImage: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
      mapUrl: 'https://maps.app.goo.gl/9V6PoRmdn4wCPxpU8',
      googleReviewUrl: 'https://maps.app.goo.gl/9V6PoRmdn4wCPxpU8',
      acceptOrdersWhenClosed: true,
      weeklyHours: {
        sat: { open: true, from: '10:00', to: '23:59' },
        sun: { open: true, from: '10:00', to: '23:59' },
        mon: { open: true, from: '10:00', to: '23:59' },
        tue: { open: true, from: '10:00', to: '23:59' },
        wed: { open: true, from: '10:00', to: '23:59' },
        thu: { open: true, from: '10:00', to: '23:59' },
        fri: { open: true, from: '13:00', to: '23:59' },
      },
      enabledOrderTypes: { delivery: true, pickup: true },
      freeDeliveryMin: 0,
      deliveryZones: [
        {
          area: 'بغداد الرصافة',
          cities: [
            { name: 'الكرادة', fee: 3000, eta: '25 - 35 دقيقة' },
            { name: 'الجادرية', fee: 3000, eta: '20 - 30 دقيقة' },
            { name: 'زيونة', fee: 4000, eta: '30 - 45 دقيقة' },
            { name: 'شارع فلسطين', fee: 4000, eta: '30 - 45 دقيقة' },
          ],
        },
        {
          area: 'بغداد الكرخ',
          cities: [
            { name: 'المنصور', fee: 4000, eta: '30 - 45 دقيقة' },
            { name: 'اليرموك', fee: 4000, eta: '30 - 45 دقيقة' },
            { name: 'الحارثية', fee: 4000, eta: '25 - 40 دقيقة' },
          ],
        },
      ],
      offerPopup: {
        enabled: false,
        mode: 'ad',
        title: 'توصيل مجاني عند طلبك بـ 25,000 د.ع وأكثر',
        subtitle: 'استمتع بأشهى وجبات كاب برجر مع توصيل سريع لجميع مناطق بغداد',
        image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80',
        buttonText: 'إغلاق',
      },
      addons: {
        offerPopup: {
          enabled: false,
          mode: 'ad',
          title: 'عرض خاص ومميز لا يفوتك!',
          subtitle: 'احصل على خصم 15% عند الطلب عبر الواتساب اليوم',
          image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80',
          buttonText: 'إغلاق',
        },
        announcementBar: {
          enabled: false,
          text: 'توصيل مجاني لجميع الطلبات فوق 25,000 د.ع طوال هذا الأسبوع!',
          bgColor: '#EA580C',
          textColor: '#ffffff',
        },
        countdownTimer: {
          enabled: false,
          title: 'عرض الساعة الذهبية',
          discountText: 'خصم 15% لفترة محدودة',
          endHour: 23,
        },
        customerReviews: {
          enabled: false,
          showOnMenu: false,
          allowSubmit: false,
        },
        minOrder: {
          enabled: false,
          amount: 10000,
          message: 'الحد الأدنى للطلب هو',
        },
        audioBell: {
          enabled: true,
          tone: 'bell',
        },
      },
      social: {
        facebook: 'https://facebook.com/',
        x: 'https://x.com/',
        instagram: 'https://instagram.com/',
        whatsapp: '9647724799679',
      },
      reviews: [
        {
          id: 'rev_1',
          name: 'كرار البغدادي',
          rate: 5,
          comment: 'برجر كاب ترافل والسماش كلاسيك طعم خرافي والبطاطا مقرمشة جداً!',
          at: Date.now() - 86400000 * 2,
        },
        {
          id: 'rev_2',
          name: 'زينب الموسوي',
          rate: 5,
          comment: 'أفضل تجربة منيو إلكتروني وسهولة الطلب بالواتساب، الكريسبي والموهيتو روعة.',
          at: Date.now() - 86400000,
        },
      ],
    } as Restaurant;

    const demoCats: Category[] = [
      {
        id: 'cat_beef_burger',
        rid: 'demo',
        n: 'سماش برجر اللحم',
        emoji: '🍔',
        img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
        o: 0,
        date: 'منشور',
        published: true,
      },
      {
        id: 'cat_special_burger',
        rid: 'demo',
        n: 'برجر سبيشال الشيف',
        emoji: '🔥',
        img: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=400&q=80',
        o: 1,
        date: 'منشور',
        published: true,
      },
      {
        id: 'cat_chicken_burger',
        rid: 'demo',
        n: 'برجر الدجاج والكرسبي',
        emoji: '🍗',
        img: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=400&q=80',
        o: 2,
        date: 'منشور',
        published: true,
      },
      {
        id: 'cat_wraps',
        rid: 'demo',
        n: 'التورتيلا والراب',
        emoji: '🌯',
        img: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=400&q=80',
        o: 3,
        date: 'منشور',
        published: true,
      },
      {
        id: 'cat_fries',
        rid: 'demo',
        n: 'البطاطا والمقبلات',
        emoji: '🍟',
        img: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=400&q=80',
        o: 4,
        date: 'منشور',
        published: true,
      },
      {
        id: 'cat_sauces',
        rid: 'demo',
        n: 'الصوصات الخاصة',
        emoji: '🥣',
        img: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?auto=format&fit=crop&w=400&q=80',
        o: 5,
        date: 'منشور',
        published: true,
      },
      {
        id: 'cat_drinks',
        rid: 'demo',
        n: 'المشروبات الغازية والعصائر',
        emoji: '🥤',
        img: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80',
        o: 6,
        date: 'منشور',
        published: true,
      },
      {
        id: 'cat_boxes',
        rid: 'demo',
        n: 'البوكسات والعروض',
        emoji: '📦',
        img: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=400&q=80',
        o: 7,
        date: 'منشور',
        published: true,
      },
    ];
    demoCats.forEach((c) => {
      store[`cats/${c.id}`] = c;
    });

    const demoItems: MenuItem[] = [
      // 1. Beef Smash Burgers (with Sizes, Choices & Extras)
      {
        id: 'cb_1',
        rid: 'demo',
        cat: 'cat_beef_burger',
        n: 'كاب كلاسيك سماش برجر',
        pr: 6500,
        d: 'شريحة لحم أنجوس سماش مشوية مع جبنة شيدر أمريكية ذائبة، بصل مكرمل، خيار مخلل وصوص كاب السري داخل خبز البريوش الطري.',
        img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
        o: 0,
        published: true,
        available: true,
        prepTime: '12 دقيقة',
        sizes: [
          { n: 'سنجل (شريحة واحدة)', p: 6500 },
          { n: 'دبل (شريحتين)', p: 9000 },
          { n: 'تربل (3 شرائح)', p: 11500 },
        ],
        choices: ['خبز بريوش ذهبي', 'خبز بطاطا طري'],
        extras: [
          { n: 'شريحة جبنة شيدر إضافية', p: 1000 },
          { n: 'لحم بيكون بقري مدخن', p: 2000 },
          { n: 'فلفل هلابينو حار', p: 500 },
          { n: 'صوص كاب إضافي', p: 500 },
        ],
      },
      {
        id: 'cb_2',
        rid: 'demo',
        cat: 'cat_beef_burger',
        n: 'أوكلاهوما أونيون سماش برجر',
        pr: 7000,
        d: 'لحم بقري مهروس مع شرائح البصل الرفيعة المشوية على الصاج وجبنة الشيدر المضاعفة مع صوص الماسترد بالعسل.',
        img: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80',
        o: 1,
        published: true,
        available: true,
        prepTime: '12 دقيقة',
        sizes: [
          { n: 'سنجل', p: 7000 },
          { n: 'دبل', p: 9500 },
        ],
        extras: [
          { n: 'جبنة شيدر إضافية', p: 1000 },
          { n: 'بطاطا مقرمشة جانبية', p: 2000 },
        ],
      },
      {
        id: 'cb_3',
        rid: 'demo',
        cat: 'cat_beef_burger',
        n: 'تشيز برجر أولد سكول',
        pr: 6000,
        d: 'لحم بقري طازج مع جبنة شيدر، خس آيسبيرغ، طماطم طازجة، بصل أحمر وكاتشب ومايونيز كلاسيك.',
        img: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=600&q=80',
        o: 2,
        published: true,
        available: true,
        prepTime: '10 دقائق',
      },

      // 2. Special Chef Burgers
      {
        id: 'cb_4',
        rid: 'demo',
        cat: 'cat_special_burger',
        n: 'برجر ترافل ومشروم سبيشال',
        pr: 8500,
        beforePrice: 10000,
        d: 'لحم أنجوس فاخر مع فطر طازج سوتيه، جبنة سويسرية ذائبة وصوص الكمأة السوداء (الترافل) الغني.',
        img: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=600&q=80',
        o: 3,
        published: true,
        available: true,
        prepTime: '15 دقيقة',
        badges: [{ type: 'gold', text: 'توقيع الشيف' }],
        sizes: [
          { n: 'سنجل', p: 8500 },
          { n: 'دبل', p: 11000 },
        ],
        extras: [
          { n: 'صوص ترافل إضافي', p: 1000 },
          { n: 'جبنة سويسرية إضافية', p: 1500 },
        ],
      },
      {
        id: 'cb_5',
        rid: 'demo',
        cat: 'cat_special_burger',
        n: 'برجر سموكي باربكيو وبصل مقرمش',
        pr: 8000,
        d: 'دبل شريحة سماش مع حلقات البصل المقرمشة، بيكون بقري مدخن، جبنة شيدر وصوص الباربكيو الأمريكي المدخن.',
        img: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=600&q=80',
        o: 4,
        published: true,
        available: true,
        prepTime: '14 دقيقة',
        sizes: [
          { n: 'سنجل', p: 8000 },
          { n: 'دبل', p: 10500 },
        ],
        extras: [
          { n: 'حلقات بصل مقرمشة إضافية', p: 1000 },
          { n: 'شريحة جبنة شيدر', p: 1000 },
        ],
      },

      // 3. Chicken & Crispy Burgers
      {
        id: 'cb_6',
        rid: 'demo',
        cat: 'cat_chicken_burger',
        n: 'كاب كريسبي زنجر برجر',
        pr: 6000,
        d: 'صدر دجاج طازج متبل ومقلي بخلطة القرمشة الذهبية مع سلطة كولسلو، جبنة شيدر وصوص الديناميت.',
        img: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=600&q=80',
        o: 5,
        published: true,
        available: true,
        prepTime: '10 دقائق',
        badges: [{ type: 'red', text: 'مقرمش' }],
        choices: ['عادي (بارد)', 'سبايسي حار 🔥'],
        sizes: [
          { n: 'ساندويش فقط', p: 6000 },
          { n: 'وجبة مع بطاطا ومشروب غازي', p: 8500 },
        ],
        extras: [
          { n: 'جبنة شيدر', p: 1000 },
          { n: 'صوص ديناميت حار', p: 750 },
        ],
      },
      {
        id: 'cb_7',
        rid: 'demo',
        cat: 'cat_chicken_burger',
        n: 'ناشفيل هوت تشيكن برجر',
        pr: 7000,
        d: 'صدر دجاج مقرمش مغطى بزيت التوابل الحارة على طريقة ناشفيل، مع مخلل الخيار وصوص الرانش البارد.',
        img: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=600&q=80',
        o: 6,
        published: true,
        available: true,
        prepTime: '12 دقيقة',
        choices: ['حرارة متوسطة', 'حرارة نار 🔥'],
      },
      {
        id: 'cb_8',
        rid: 'demo',
        cat: 'cat_chicken_burger',
        n: 'ستربس دجاج مقرمش (5 قطع)',
        pr: 7000,
        d: '5 قطع فيليه دجاج مقرمش يقدم مع بطاطا مقلية، خبز توست محمص وصوص الرانش وثومية.',
        img: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=600&q=80',
        o: 7,
        published: true,
        available: true,
        prepTime: '10 دقائق',
      },

      // 4. Wraps & Tortilla
      {
        id: 'cb_9',
        rid: 'demo',
        cat: 'cat_wraps',
        n: 'راب دجاج كريسبي وتورتيلا',
        pr: 5500,
        d: 'قطع دجاج كريسبي مع خس طازج، جبنة شيدر وصوص الرانش والثومية ملفوفة بخبز التورتيلا المحمص.',
        img: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80',
        o: 8,
        published: true,
        available: true,
        prepTime: '8 دقائق',
        choices: ['بارد', 'سبايسي'],
        extras: [
          { n: 'إضافة جبنة موزاريلا', p: 1000 },
          { n: 'بطاطا داخل الراب', p: 750 },
        ],
      },
      {
        id: 'cb_10',
        rid: 'demo',
        cat: 'cat_wraps',
        n: 'تورتيلا سماش لحم بالجبن',
        pr: 6000,
        d: 'لحم سماش مفروم طازج مع فلفل ألوان، بصل مشوي، جبنة شيدر ذائبة وصوص الشيبوتلي.',
        img: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=600&q=80',
        o: 9,
        published: true,
        available: true,
        prepTime: '10 دقائق',
      },

      // 5. Fries & Appetizers (Mostly direct quick-add items!)
      {
        id: 'cb_11',
        rid: 'demo',
        cat: 'cat_fries',
        n: 'بطاطا فرايز مقرمشة',
        pr: 2500,
        d: 'أصابع بطاطا هولندية ذهبية مقرمشة متبلة بملح البحر وبهارات كاب الخاصة.',
        img: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80',
        o: 10,
        published: true,
        available: true,
        prepTime: '5 دقائق',
      },
      {
        id: 'cb_12',
        rid: 'demo',
        cat: 'cat_fries',
        n: 'لوديد فرايز بالجبن والهلابينو',
        pr: 5000,
        d: 'بطاطا مقرمشة مغطاة بجبنة الشيدر الساخنة، قطع الدجاج المقرمش، الهلابينو وصوص الرانش.',
        img: '/uploads/hmo/item_046.jpg',
        o: 11,
        published: true,
        available: true,
        prepTime: '7 دقائق',
        badges: [{ type: 'gold', text: 'مميز' }],
      },
      {
        id: 'cb_13',
        rid: 'demo',
        cat: 'cat_fries',
        n: 'أصابع موزاريلا مقرمشة (5 قطع)',
        pr: 4000,
        d: 'أصابع جبنة موزاريلا ذائبة مغلفة بالبقسماط المقرمش وتقدم مع صوص المارينارا.',
        img: 'https://images.unsplash.com/photo-1531749668029-2db88e4276c7?auto=format&fit=crop&w=600&q=80',
        o: 12,
        published: true,
        available: true,
        prepTime: '6 دقائق',
      },
      {
        id: 'cb_14',
        rid: 'demo',
        cat: 'cat_fries',
        n: 'حلقات بصل مقرمشة (7 قطع)',
        pr: 3000,
        d: 'حلقات بصل طازجة مقلية بعجينة ذهبية مقرمشة وتقدم ساخنة مع صوص الباربكيو.',
        img: 'https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=600&q=80',
        o: 13,
        published: true,
        available: true,
        prepTime: '5 دقائق',
      },

      // 6. Sauces (Direct quick-add items!)
      {
        id: 'cb_15',
        rid: 'demo',
        cat: 'cat_sauces',
        n: 'صوص كاب السري',
        pr: 750,
        d: 'الخلطة الخاصة بمطعم كاب برجر الكريمية المدخنة للبرجر والبطاطا.',
        img: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?auto=format&fit=crop&w=600&q=80',
        o: 14,
        published: true,
        available: true,
      },
      {
        id: 'cb_16',
        rid: 'demo',
        cat: 'cat_sauces',
        n: 'صوص جبن شيدر ساخن',
        pr: 1000,
        d: 'كوب صوص جبنة شيدر أمريكية كريمية ساخنة.',
        img: 'https://images.unsplash.com/photo-1607532941433-304659e8198a?auto=format&fit=crop&w=600&q=80',
        o: 15,
        published: true,
        available: true,
      },
      {
        id: 'cb_17',
        rid: 'demo',
        cat: 'cat_sauces',
        n: 'صوص ديناميت حار',
        pr: 1000,
        d: 'صوص كريمي بنكهة السيراتشا الحارة والتوابل اليابانية.',
        img: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?auto=format&fit=crop&w=600&q=80',
        o: 16,
        published: true,
        available: true,
      },

      // 7. Cold Sodas & Drinks (Direct quick-add!)
      {
        id: 'cb_18',
        rid: 'demo',
        cat: 'cat_drinks',
        n: 'بيبسي مثلج (330 مل)',
        pr: 1000,
        d: 'علبة بيبسي باردة ومنعشة.',
        img: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80',
        o: 17,
        published: true,
        available: true,
      },
      {
        id: 'cb_19',
        rid: 'demo',
        cat: 'cat_drinks',
        n: 'سفن أب / ميرندا بارد',
        pr: 1000,
        d: 'مشروب غازي بارد مثلج (سفن أب ليمون أو ميرندا برتقال).',
        img: 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=600&q=80',
        o: 18,
        published: true,
        available: true,
        choices: ['سفن أب 7Up', 'ميرندا برتقال', 'بيبسي دايت'],
      },
      {
        id: 'cb_20',
        rid: 'demo',
        cat: 'cat_drinks',
        n: 'موهيتو بلو بيري والنعناع',
        pr: 3500,
        d: 'مزيج منعش من الليمون الطازج، أوراق النعناع، صودا باردة وسيروب التوت الأزرق.',
        img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
        o: 19,
        published: true,
        available: true,
        prepTime: '3 دقائق',
      },
      {
        id: 'cb_21',
        rid: 'demo',
        cat: 'cat_drinks',
        n: 'مياه معدنية باردة',
        pr: 500,
        d: 'قنينة ماء شرب نقي بارد (500 مل).',
        img: 'https://images.unsplash.com/photo-1560023907-5f339617ea30?auto=format&fit=crop&w=600&q=80',
        o: 20,
        published: true,
        available: true,
      },

      // 8. Family & Combo Boxes (with Choices & Extras)
      {
        id: 'cb_22',
        rid: 'demo',
        cat: 'cat_boxes',
        n: 'بوكس كاب العائلي (4 وجبات برجر)',
        pr: 26000,
        beforePrice: 31000,
        d: '4 سندويشات برجر (2 كلاسيك سماش + 2 كريسبي دجاج) مع علبة بطاطا كبيرة، 4 صوصات منوعة و4 مشروبات غازية.',
        img: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=600&q=80',
        o: 21,
        published: true,
        available: true,
        prepTime: '20 دقيقة',
        badges: [{ type: 'green', text: 'توفير 5,000 د.ع' }],
        choices: ['مشروبات: بيبسي', 'مشروبات: سفن أب وميرندا مشكلة'],
        extras: [
          { n: 'إضافة بوكس أصابع موزاريلا', p: 3500 },
          { n: 'ترقية للبطاطا بالجبن الشيدر', p: 2500 },
        ],
      },
    ];

    demoItems.forEach((it) => {
      store[`items/${it.id}`] = it;
    });

    store['accounts/acc_menu_demo'] = {
      id: 'acc_menu_demo',
      username: 'menu',
      em: 'menu',
      phone: '07700000000',
      pw: 'menu',
      rid: 'demo',
      at: today(),
    };

    saveStore(store);
  }
}

export async function ensureOwnerAdminAccount() {
  const store = loadStore();
  let updated = false;
  if (!store['accounts/acc_admin_owner']) {
    const ownerPw = await hash('07711448594', 'admin');
    store['accounts/acc_admin_owner'] = {
      id: 'acc_admin_owner',
      username: '07711448594',
      em: '07711448594',
      phone: '+9647711448594',
      pw: ownerPw,
      rid: 'demo',
      admin: true,
      at: today(),
    };
    updated = true;
  }
  if (!store['accounts/acc_admin_demo']) {
    const demoAdminPw = await hash('07711448594', '11111111');
    store['accounts/acc_admin_demo'] = {
      id: 'acc_admin_demo',
      n: 'مدير منصة تجريبي',
      roleTitle: 'مدير منصة تجريبي',
      username: '07711448594',
      em: '07711448594',
      phone: '+9647711448594',
      pw: demoAdminPw,
      rid: 'demo',
      admin: true,
      active: true,
      at: today(),
    };
    updated = true;
  }
  if (updated) {
    saveStore(store);
  }
}

// Initial Data Seeding
export async function seedInitialData() {
  await Promise.all([syncFromServer(), syncSessionFromServer()]);
  const store = loadStore();
  ensureDemoRestaurant();
  await ensureOwnerAdminAccount();
  migrateBrandInStore(store, false);

  if (store['initialized_v6']) return;

  // Site Settings
  store['settings/site'] = DEFAULT_SITE;
  store['settings/home'] = DEFAULT_HOME;
  store['settings/plans'] = {
    list: DEFAULT_PLANS_V2,
    planSchemaV2: true,
    planPriceV2: true,
    planCardV3: true,
    planAnnual11V4: true,
    planMultiBranchV5: true,
    planNamesV6: true,
    planThemesV7: true,
    planNoFreeV8: true,
  };
  store['settings/theme'] = DEFAULT_THEME;

  // Seed sample initial staff member: "علي الكرخي" (مشرف العمليات والدعم)
  const staffPw = await hash('ali@emenu.iq', '12345678');
  store['staff/stf_1'] = {
    id: 'stf_1',
    name: 'علي الكرخي',
    email: 'ali@emenu.iq',
    phone: '07705544332',
    passwordHash: staffPw,
    roleTitle: 'مشرف العمليات ودعم المطاعم',
    active: true,
    permissions: {
      ...DEFAULT_STAFF_PERMISSIONS,
    },
    createdAt: today(),
    lastLogin: today(),
  };

  // Seed initial notes
  const noteId1 = uid();
  store[`notes/${noteId1}`] = {
    id: noteId1,
    title: 'توفير تكامل مباشر مع بوابات الدفع زين كاش وسوبركي',
    content: 'طلب من شركاء مطاعم الكرادّة لتفعيل الدفع الإلكتروني المباشر داخل سلة الطلبات.',
    author: 'المدير العام',
    category: 'idea',
    priority: 'high',
    status: 'in_progress',
    createdAt: Date.now() - 3600000 * 24,
  };

  const noteId2 = uid();
  store[`notes/${noteId2}`] = {
    id: noteId2,
    title: 'طباعة كروت ستاند QR ثلاثية الأبعاد لطاولات المطاعم',
    content: 'توفير قوالب PDF مجانية جاهزة للمطابع بالأبعاد القياسية A5 و A6.',
    author: 'علي الكرخي (مشرف)',
    category: 'task',
    priority: 'med',
    status: 'pending',
    createdAt: Date.now() - 3600000 * 12,
  };

  // Seed initial activity logs
  const now = Date.now();
  store['logs/l1'] = {
    id: 'l1',
    at: now - 3600000 * 5,
    actor: 'مدير المنصة الرئيسي',
    action: 'تهيئة هوية آبل ليكويد غلاس الافتراضية وخماسي الألوان',
    details: 'تفعيل باليت الألوان المعتمد مع خلفية مريحة جداً',
    type: 'theme',
  };
  store['logs/l2'] = {
    id: 'l2',
    at: now - 3600000 * 3,
    actor: 'مدير المنصة الرئيسي',
    action: 'إضافة موظف جديد: علي الكرخي',
    details: 'صلاحيات: إدارة الشركاء وتعديل المنيو التجريبي والتحليلات',
    type: 'staff',
  };

  // Seed Admin Accounts
  const ownerAdminPw = await hash('07711448594', 'admin');
  const demoAdminPw = await hash('07711448594', '11111111');
  const adminPw = await hash('admin', 'admin');
  const userAdminPw = await hash('hhhhooohhhh2000@gmail.com', 'admin');
  const emailAdminPw = await hash('admin@emenu.iq', 'admin');

  store['accounts/acc_admin_owner'] = {
    id: 'acc_admin_owner',
    username: '07711448594',
    em: '07711448594',
    phone: '+9647711448594',
    pw: ownerAdminPw,
    rid: 'demo',
    admin: true,
    at: today(),
  };

  store['accounts/acc_admin_demo'] = {
    id: 'acc_admin_demo',
    n: 'مدير منصة تجريبي',
    roleTitle: 'مدير منصة تجريبي',
    username: '07711448594',
    em: '07711448594',
    phone: '+9647711448594',
    pw: demoAdminPw,
    rid: 'demo',
    admin: true,
    active: true,
    at: today(),
  };

  store['accounts/acc_admin_user'] = {
    id: 'acc_admin_user',
    em: 'admin',
    pw: adminPw,
    rid: 'demo',
    admin: true,
    at: today(),
  };

  store['accounts/acc_admin_email'] = {
    id: 'acc_admin_email',
    em: 'admin@emenu.iq',
    pw: emailAdminPw,
    rid: 'demo',
    admin: true,
    at: today(),
  };

  store['accounts/acc_admin_personal'] = {
    id: 'acc_admin_personal',
    em: 'hhhhooohhhh2000@gmail.com',
    pw: userAdminPw,
    rid: 'demo',
    admin: true,
    at: today(),
  };

  const menuPw = await hash('menu', 'menu');
  store['accounts/acc_menu_demo'] = {
    id: 'acc_menu_demo',
    username: 'menu',
    em: 'menu',
    phone: '07700000000',
    pw: menuPw,
    rid: 'demo',
    at: today(),
  };

  store['initialized_v6'] = true;
  store['migrations/purged_sample_partners_v8'] = true;
  saveStore(store);
  await flushRemoteSync();
}
