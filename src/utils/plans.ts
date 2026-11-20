/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PlanComparisonItemConfig, PlanFeaturesMap, PricingPlan, Restaurant, SupportedLanguage } from '../types';
import { AddonKey } from '../data/addonsCatalog';
import { trByLang } from './i18n';

export interface MenuThemePalette {
  brand: string;
  accent?: string;
  bg: string;
  surface: string;
  surfaceSoft: string;
  text: string;
  muted: string;
  line: string;
}

export interface MenuThemeDefinition extends MenuThemePalette {
  id: string;
  name: string;
  subtitle: string;
  category?: 'classic' | 'girly' | 'cyber' | 'seasonal';
  seasonal?: boolean;
  storeOnly?: boolean;
  mode: 'dark' | 'light';
  minTierIndex: number; // 0-1 = Starter (4), 2 = Pro (7), 3 = VIP (all 10)
  lightPalette: MenuThemePalette;
  darkPalette: MenuThemePalette;
}

export interface MenuShapeDefinition {
  id:
    | 'modern'
    | 'silk'
    | 'editorial'
    | 'velvet'
    | 'luxe'
    | 'toters'
    | 'glass'
    | 'cartoon'
    | 'dreamy'
    | 'pill'
    | 'sharp'
    | 'bordered'
    | 'soft'
    | 'ramadan'
    | 'eid'
    | 'newyear';
  name: string;
  subtitle: string;
  badge?: string;
}

export const MENU_SHAPES: MenuShapeDefinition[] = [
  {
    id: 'modern',
    name: 'عصري ناعم',
    subtitle: 'زوايا متوازنة وظلال مريحة لكل الصفحة والبطاقات',
  },
  {
    id: 'silk',
    name: 'حريري انسيابي',
    subtitle: 'انحناءات حريرية انسيابية ولمعة هادئة وتمرير سلس للبطاقات والبنر',
    badge: 'جديد ✨',
  },
  {
    id: 'editorial',
    name: 'تحريري فاخر',
    subtitle: 'تنسيق مجلات راقٍ بخط جانبي أنيق وإطار متزن للمطاعم والكافيهات الفاخرة',
    badge: 'احترافي ✦',
  },
  {
    id: 'velvet',
    name: 'مخملي راقٍ',
    subtitle: 'عمق مخملي متعدد الطبقات مع إضاءة علوية ناعمة وهالة دائرية للشعار',
    badge: 'أنيق 💎',
  },
  {
    id: 'luxe',
    name: 'مينيمال راقٍ',
    subtitle: 'بساطة عصرية فائقة النظافة بخطوط رفيعة وانتقالات هادئة ومريحة للعين',
    badge: 'سلس ⚡',
  },
  {
    id: 'toters',
    name: 'مظهر توترز',
    subtitle: 'تصميم توترز الكامل: بطاقة المتجر العائمة، التصنيفات المسطحة، الرفوف الأفقية، والسلة المميزة',
    badge: 'توترز ✨',
  },
  {
    id: 'glass',
    name: 'زجاجي شفاف',
    subtitle: 'ألواح زجاجية ضبابية وإضاءة عصرية للبنر والبطاقات',
  },
  {
    id: 'cartoon',
    name: 'رسوم',
    subtitle: 'حواف كرتونية جريئة وظل بارز ونمط منقط مرح',
  },
  {
    id: 'dreamy',
    name: 'أحلام',
    subtitle: 'هالة حالمة متوهجة وزوايا سحابية ناعمة لكل الصفحة',
  },
  {
    id: 'pill',
    name: 'دائري مرن',
    subtitle: 'صورة دائرية وانحناءات كبسولية انسيابية لكل العناصر',
  },
  {
    id: 'sharp',
    name: 'هندسي حاد',
    subtitle: 'زوايا حادة وإطارات معمارية مرتبة بطابع فاخر',
  },
  {
    id: 'bordered',
    name: 'إطار بارز',
    subtitle: 'إطارات مزدوجة وحواف ثلاثية الأبعاد واضحة ومميزة',
  },
  {
    id: 'soft',
    name: 'منقوش ناعم',
    subtitle: 'خلفية بنقاط هندسية وبطاقات بارزة بلا حدود حادة',
  },
  {
    id: 'ramadan',
    name: 'مظهر رمضان 🌙',
    subtitle: 'فوانيس معلقة متحركة، هلال ونجوم، وإطارات ذهبية رمضانية',
    badge: 'رمضان 🏮',
  },
  {
    id: 'eid',
    name: 'مظهر العيد 🎉',
    subtitle: 'زينة العيد، بالونات ونجوم متطايرة، وإطارات احتفالية مبهجة',
    badge: 'العيد ✨',
  },
  {
    id: 'newyear',
    name: 'مظهر رأس السنة 🎆',
    subtitle: 'ألعاب نارية متلألئة، ثلوج متساقطة، وبريق ذهبي فاخر',
    badge: 'رأس السنة ❄️',
  },
];

export function getContrastInk(hex: string): string {
  const clean = String(hex || '').replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return '#ffffff';
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0f172a' : '#ffffff';
}

export const MENU_THEMES: MenuThemeDefinition[] = [
  {
    id: 'emerald-dark',
    name: 'الزمرد الكلاسيكي',
    subtitle: 'أخضر زمردي متوازن ومريح للعين',
    category: 'classic',
    mode: 'dark',
    brand: '#10B981',
    accent: '#34D399',
    bg: '#08100d',
    surface: '#0e1915',
    surfaceSoft: '#13241e',
    text: '#f8fafc',
    muted: '#94a3b8',
    line: 'rgba(16, 185, 129, 0.22)',
    minTierIndex: 0,
    darkPalette: {
      brand: '#10B981',
      accent: '#34D399',
      bg: '#08100d',
      surface: '#0e1915',
      surfaceSoft: '#13241e',
      text: '#f8fafc',
      muted: '#94a3b8',
      line: 'rgba(16, 185, 129, 0.22)',
    },
    lightPalette: {
      brand: '#059669',
      accent: '#10B981',
      bg: '#f2f7f5',
      surface: '#ffffff',
      surfaceSoft: '#e4f2ec',
      text: '#0f172a',
      muted: '#475569',
      line: 'rgba(5, 150, 105, 0.16)',
    },
  },
  {
    id: 'clean-light',
    name: 'الأبيض والرمادي النقي',
    subtitle: 'تصميم نقي وبسيط واضح لكل الأصناف',
    category: 'classic',
    mode: 'light',
    brand: '#0F766E',
    accent: '#14B8A6',
    bg: '#f4f7f6',
    surface: '#ffffff',
    surfaceSoft: '#eaf2ee',
    text: '#0f172a',
    muted: '#475569',
    line: 'rgba(15, 23, 42, 0.11)',
    minTierIndex: 0,
    lightPalette: {
      brand: '#0F766E',
      accent: '#14B8A6',
      bg: '#f4f7f6',
      surface: '#ffffff',
      surfaceSoft: '#eaf2ee',
      text: '#0f172a',
      muted: '#475569',
      line: 'rgba(15, 23, 42, 0.11)',
    },
    darkPalette: {
      brand: '#14B8A6',
      accent: '#2DD4BF',
      bg: '#0b1014',
      surface: '#121920',
      surfaceSoft: '#19232d',
      text: '#f8fafc',
      muted: '#94a3b8',
      line: 'rgba(148, 163, 184, 0.18)',
    },
  },
  {
    id: 'toters',
    name: 'توترز',
    subtitle: 'ألوان توترز الرسمية بالفيروزي والأبيض النقي مع القوائم الكاملة',
    category: 'classic',
    mode: 'light',
    brand: '#00B286',
    accent: '#00C897',
    bg: '#F7F8FA',
    surface: '#FFFFFF',
    surfaceSoft: '#EEF2F6',
    text: '#111827',
    muted: '#6B7280',
    line: 'rgba(17, 24, 39, 0.08)',
    minTierIndex: 0,
    lightPalette: {
      brand: '#00B286',
      accent: '#00C897',
      bg: '#F7F8FA',
      surface: '#FFFFFF',
      surfaceSoft: '#EEF2F6',
      text: '#111827',
      muted: '#6B7280',
      line: 'rgba(17, 24, 39, 0.08)',
    },
    darkPalette: {
      brand: '#00C897',
      accent: '#34D399',
      bg: '#0B1110',
      surface: '#131D1B',
      surfaceSoft: '#1B2926',
      text: '#F8FAFC',
      muted: '#94A3B8',
      line: 'rgba(255, 255, 255, 0.1)',
    },
  },
  {
    id: 'royal-amber',
    name: 'العنبر الملكي الذهبي',
    subtitle: 'فخامة دافئة للمطاعم والمشويات والكافيهات',
    category: 'classic',
    mode: 'dark',
    brand: '#F59E0B',
    accent: '#FBBF24',
    bg: '#120d08',
    surface: '#1c140c',
    surfaceSoft: '#281d12',
    text: '#fafaf9',
    muted: '#d6d3d1',
    line: 'rgba(245, 158, 11, 0.25)',
    minTierIndex: 1,
    darkPalette: {
      brand: '#F59E0B',
      accent: '#FBBF24',
      bg: '#120d08',
      surface: '#1c140c',
      surfaceSoft: '#281d12',
      text: '#fafaf9',
      muted: '#d6d3d1',
      line: 'rgba(245, 158, 11, 0.25)',
    },
    lightPalette: {
      brand: '#D97706',
      accent: '#F59E0B',
      bg: '#fdf8f0',
      surface: '#ffffff',
      surfaceSoft: '#fef0d7',
      text: '#291e12',
      muted: '#78624b',
      line: 'rgba(217, 119, 6, 0.18)',
    },
  },
  {
    id: 'cream-espresso',
    name: 'كريم إسبريسو دافئ',
    subtitle: 'درجات القهوة الدافئة للمقاهي والمخبوزات',
    category: 'classic',
    mode: 'light',
    brand: '#92400E',
    accent: '#B45309',
    bg: '#faf6f0',
    surface: '#ffffff',
    surfaceSoft: '#f2e8dc',
    text: '#292524',
    muted: '#6b5e54',
    line: 'rgba(146, 64, 14, 0.16)',
    minTierIndex: 1,
    lightPalette: {
      brand: '#92400E',
      accent: '#B45309',
      bg: '#faf6f0',
      surface: '#ffffff',
      surfaceSoft: '#f2e8dc',
      text: '#292524',
      muted: '#6b5e54',
      line: 'rgba(146, 64, 14, 0.16)',
    },
    darkPalette: {
      brand: '#D97706',
      accent: '#F59E0B',
      bg: '#140f0c',
      surface: '#1f1713',
      surfaceSoft: '#2b201a',
      text: '#faf5f0',
      muted: '#c7b8ae',
      line: 'rgba(217, 119, 6, 0.22)',
    },
  },
  {
    id: 'sakura-strawberry',
    name: 'حليب الفراولة والساكورا 🌸',
    subtitle: 'وردي أنيق للحلويات والورود والعطور',
    category: 'girly',
    mode: 'light',
    brand: '#EC4899',
    accent: '#F472B6',
    bg: '#fff5f8',
    surface: '#ffffff',
    surfaceSoft: '#ffe4ef',
    text: '#3b0724',
    muted: '#834b67',
    line: 'rgba(236, 72, 153, 0.2)',
    minTierIndex: 2,
    lightPalette: {
      brand: '#EC4899',
      accent: '#F472B6',
      bg: '#fff5f8',
      surface: '#ffffff',
      surfaceSoft: '#ffe4ef',
      text: '#3b0724',
      muted: '#834b67',
      line: 'rgba(236, 72, 153, 0.2)',
    },
    darkPalette: {
      brand: '#F472B6',
      accent: '#F9A8D4',
      bg: '#160911',
      surface: '#22101a',
      surfaceSoft: '#301725',
      text: '#fff1f7',
      muted: '#dba9c1',
      line: 'rgba(244, 114, 182, 0.24)',
    },
  },
  {
    id: 'lavender-dream',
    name: 'حلم اللافندر الباستيل 💜',
    subtitle: 'بنفسجي ناعم لمحلات التجميل والكافيهات',
    category: 'girly',
    mode: 'light',
    brand: '#8B5CF6',
    accent: '#A78BFA',
    bg: '#f7f4ff',
    surface: '#ffffff',
    surfaceSoft: '#ede9fe',
    text: '#2e1065',
    muted: '#6b5b95',
    line: 'rgba(139, 92, 246, 0.18)',
    minTierIndex: 2,
    lightPalette: {
      brand: '#8B5CF6',
      accent: '#A78BFA',
      bg: '#f7f4ff',
      surface: '#ffffff',
      surfaceSoft: '#ede9fe',
      text: '#2e1065',
      muted: '#6b5b95',
      line: 'rgba(139, 92, 246, 0.18)',
    },
    darkPalette: {
      brand: '#A78BFA',
      accent: '#C4B5FD',
      bg: '#0f0b1a',
      surface: '#181229',
      surfaceSoft: '#221a38',
      text: '#f5f3ff',
      muted: '#bfb5e3',
      line: 'rgba(167, 139, 250, 0.24)',
    },
  },
  {
    id: 'rose-gold-glam',
    name: 'روز غولد والكشمير ✨',
    subtitle: 'فخامة مرجانية ناعمة بلمعة راقية',
    category: 'girly',
    mode: 'dark',
    brand: '#FB7185',
    accent: '#FDA4AF',
    bg: '#160d12',
    surface: '#22141c',
    surfaceSoft: '#301b27',
    text: '#fff1f5',
    muted: '#e4b8c7',
    line: 'rgba(251, 113, 133, 0.26)',
    minTierIndex: 2,
    darkPalette: {
      brand: '#FB7185',
      accent: '#FDA4AF',
      bg: '#160d12',
      surface: '#22141c',
      surfaceSoft: '#301b27',
      text: '#fff1f5',
      muted: '#e4b8c7',
      line: 'rgba(251, 113, 133, 0.26)',
    },
    lightPalette: {
      brand: '#E11D48',
      accent: '#FB7185',
      bg: '#fff4f6',
      surface: '#ffffff',
      surfaceSoft: '#ffe4e8',
      text: '#3b0b18',
      muted: '#884f5e',
      line: 'rgba(225, 29, 72, 0.16)',
    },
  },
  {
    id: 'cyber-neon-matrix',
    name: 'سايبر نيون ماتريكس ⚡',
    subtitle: 'إضاءة نيون خضراء جريئة للبرجر والألعاب',
    category: 'cyber',
    mode: 'dark',
    brand: '#22C55E',
    accent: '#00F5A0',
    bg: '#05080b',
    surface: '#0b1218',
    surfaceSoft: '#111d26',
    text: '#f0fdf4',
    muted: '#94a3b8',
    line: 'rgba(0, 245, 160, 0.28)',
    minTierIndex: 3,
    darkPalette: {
      brand: '#22C55E',
      accent: '#00F5A0',
      bg: '#05080b',
      surface: '#0b1218',
      surfaceSoft: '#111d26',
      text: '#f0fdf4',
      muted: '#94a3b8',
      line: 'rgba(0, 245, 160, 0.28)',
    },
    lightPalette: {
      brand: '#16A34A',
      accent: '#22C55E',
      bg: '#f0fdf4',
      surface: '#ffffff',
      surfaceSoft: '#dcfce7',
      text: '#052e16',
      muted: '#3f6250',
      line: 'rgba(22, 163, 74, 0.2)',
    },
  },
  {
    id: 'synthwave-violet',
    name: 'سايبر سينثويف البنفسجي 👾',
    subtitle: 'طابع مستقبلي فريد بدرجات الفوشيا',
    category: 'cyber',
    mode: 'dark',
    brand: '#D946EF',
    accent: '#F0ABFC',
    bg: '#0b0616',
    surface: '#140b27',
    surfaceSoft: '#1f113b',
    text: '#fdf4ff',
    muted: '#c4b5fd',
    line: 'rgba(217, 70, 239, 0.28)',
    minTierIndex: 3,
    darkPalette: {
      brand: '#D946EF',
      accent: '#F0ABFC',
      bg: '#0b0616',
      surface: '#140b27',
      surfaceSoft: '#1f113b',
      text: '#fdf4ff',
      muted: '#c4b5fd',
      line: 'rgba(217, 70, 239, 0.28)',
    },
    lightPalette: {
      brand: '#C026D3',
      accent: '#D946EF',
      bg: '#fdf4ff',
      surface: '#ffffff',
      surfaceSoft: '#fae8ff',
      text: '#3b0764',
      muted: '#7c5394',
      line: 'rgba(192, 38, 211, 0.18)',
    },
  },
  {
    id: 'cyber-cyan-obsidian',
    name: 'سايبر سيان السماوي 💠',
    subtitle: 'هوية تقنية حديثة بالأزرق السماوي',
    category: 'cyber',
    mode: 'dark',
    brand: '#06B6D4',
    accent: '#22D3EE',
    bg: '#040b12',
    surface: '#0a1624',
    surfaceSoft: '#102236',
    text: '#ecfeff',
    muted: '#93c5fd',
    line: 'rgba(34, 211, 238, 0.28)',
    minTierIndex: 3,
    darkPalette: {
      brand: '#06B6D4',
      accent: '#22D3EE',
      bg: '#040b12',
      surface: '#0a1624',
      surfaceSoft: '#102236',
      text: '#ecfeff',
      muted: '#93c5fd',
      line: 'rgba(34, 211, 238, 0.28)',
    },
    lightPalette: {
      brand: '#0284C7',
      accent: '#0EA5E9',
      bg: '#f0f9ff',
      surface: '#ffffff',
      surfaceSoft: '#e0f2fe',
      text: '#082f49',
      muted: '#4b6b84',
      line: 'rgba(2, 132, 199, 0.18)',
    },
  },
  {
    id: 'ramadan-royal',
    name: 'مظهر رمضان الذهبي 🌙',
    subtitle: 'كحلي ليلي ملكي مع ذهبي الفوانيس والهلال المتوهج',
    category: 'seasonal',
    seasonal: true,
    mode: 'dark',
    brand: '#F59E0B',
    accent: '#FDE047',
    bg: '#090d1f',
    surface: '#111834',
    surfaceSoft: '#192248',
    text: '#fefce8',
    muted: '#cbd5e1',
    line: 'rgba(245, 158, 11, 0.34)',
    minTierIndex: 0,
    darkPalette: {
      brand: '#F59E0B',
      accent: '#FDE047',
      bg: '#090d1f',
      surface: '#111834',
      surfaceSoft: '#192248',
      text: '#fefce8',
      muted: '#cbd5e1',
      line: 'rgba(245, 158, 11, 0.34)',
    },
    lightPalette: {
      brand: '#B45309',
      accent: '#F59E0B',
      bg: '#fdf8ec',
      surface: '#ffffff',
      surfaceSoft: '#fef0c7',
      text: '#1e1b4b',
      muted: '#6b4f1d',
      line: 'rgba(180, 83, 9, 0.24)',
    },
  },
  {
    id: 'eid-joy',
    name: 'مظهر العيد الاحتفالي 🎉',
    subtitle: 'زمردي مبهج مع ذهبي ولمسات احتفالية مشرقة',
    category: 'seasonal',
    seasonal: true,
    mode: 'dark',
    brand: '#10B981',
    accent: '#FBBF24',
    bg: '#071b16',
    surface: '#0e2922',
    surfaceSoft: '#153a30',
    text: '#f0fdf4',
    muted: '#a7f3d0',
    line: 'rgba(251, 191, 36, 0.34)',
    minTierIndex: 0,
    darkPalette: {
      brand: '#10B981',
      accent: '#FBBF24',
      bg: '#071b16',
      surface: '#0e2922',
      surfaceSoft: '#153a30',
      text: '#f0fdf4',
      muted: '#a7f3d0',
      line: 'rgba(251, 191, 36, 0.34)',
    },
    lightPalette: {
      brand: '#059669',
      accent: '#EC4899',
      bg: '#f2fbf7',
      surface: '#ffffff',
      surfaceSoft: '#dcfce7',
      text: '#064e3b',
      muted: '#3b6e5c',
      line: 'rgba(5, 150, 105, 0.22)',
    },
  },
  {
    id: 'newyear-gala',
    name: 'مظهر رأس السنة 🎆',
    subtitle: 'ليلي فاخر مع ذهبي الألعاب النارية وبريق جليدي',
    category: 'seasonal',
    seasonal: true,
    mode: 'dark',
    brand: '#FBBF24',
    accent: '#38BDF8',
    bg: '#070913',
    surface: '#101428',
    surfaceSoft: '#19203d',
    text: '#f8fafc',
    muted: '#94a3b8',
    line: 'rgba(56, 189, 248, 0.32)',
    minTierIndex: 0,
    darkPalette: {
      brand: '#FBBF24',
      accent: '#38BDF8',
      bg: '#070913',
      surface: '#101428',
      surfaceSoft: '#19203d',
      text: '#f8fafc',
      muted: '#94a3b8',
      line: 'rgba(56, 189, 248, 0.32)',
    },
    lightPalette: {
      brand: '#1D4ED8',
      accent: '#F59E0B',
      bg: '#f1f5ff',
      surface: '#ffffff',
      surfaceSoft: '#e0eaff',
      text: '#0f172a',
      muted: '#475569',
      line: 'rgba(29, 78, 216, 0.22)',
    },
  },
  {
    id: 'estore',
    name: 'مظهر المتجر الموحد',
    subtitle: 'تصميم متاجر إلكترونية متكامل باللون الأبيض والرمادي الفحمي بلمسة عصرية',
    category: 'classic',
    storeOnly: true,
    mode: 'light',
    brand: '#222222',
    accent: '#000000',
    bg: '#ffffff',
    surface: '#ffffff',
    surfaceSoft: '#f8f8f8',
    text: '#222222',
    muted: '#7e7e7e',
    line: '#eaeaea',
    minTierIndex: 0,
    lightPalette: {
      brand: '#222222',
      accent: '#000000',
      bg: '#ffffff',
      surface: '#ffffff',
      surfaceSoft: '#f8f8f8',
      text: '#222222',
      muted: '#7e7e7e',
      line: '#eaeaea',
    },
    darkPalette: {
      brand: '#222222',
      accent: '#000000',
      bg: '#ffffff',
      surface: '#ffffff',
      surfaceSoft: '#f8f8f8',
      text: '#222222',
      muted: '#7e7e7e',
      line: '#eaeaea',
    },
  },
];

export const VIP_ALL_ADDONS_LIST: string[] = [
  'بوب آب إعلاني وشريط الإعلانات العلوي',
  'ساعة السعادة ومؤقت العروض التنازلي',
  'عجلة الحظ وخصم الطلب الأول والهدايا',
  'خصم الاستلام الذاتي الفوري ومقترحات السلة',
  'شريط التوصيل المجاني والحد الأدنى للطلب',
  'نظام نقاط الولاء ومستشار المزاج والوجبة الذكي',
  'خيار أدوات الطعام والمناديل وتقسيم الفاتورة',
  'الاستلام من السيارة وتقييمات الزبائن',
  'زر واتساب العائم ورنين الجرس الصوتي للطلبات',
];

export function getLocalizedVipAddonsList(lang: SupportedLanguage = 'ar'): string[] {
  if (lang === 'en') {
    return [
      'Promotional popup & top announcement banner',
      'Happy hour schedule & countdown flash offers',
      'Lucky spin wheel, first-order & threshold gifts',
      'Instant self-pickup discount & in-cart upsells',
      'Free delivery progress bar & minimum order guard',
      'Loyalty points system & smart mood meal finder',
      'Cutlery option & group order bill splitter',
      'Curbside car pickup & customer reviews',
      'Floating WhatsApp support & live order bell',
    ];
  }
  if (lang === 'ku') {
    return [
      'پۆپئاپی ڕێکلامی و شریتی ڕاگەیاندنی سەرەوە',
      'کاتژمێری دڵخۆشی و ژمێرەری کاتی داشکاندن',
      'چەرخی بەخت و داشکاندنی یەکەم داواکاری و دیاری',
      'داشکاندنی وەرگرتنی خودی و پێشنیاری ناو سەبەتە',
      'شریتی گەیاندنی بێبەرامبەر و کەمترین بڕی داواکاری',
      'سیستەمی خاڵی دڵسۆزی و ڕاوێژکاری مەزاجی خواردن',
      'بژاردەی کەوچک و کلێنس و دابەشکردنی وەسڵی گروپ',
      'وەرگرتن لە ناو ئۆتۆمبێل و هەڵسەنگاندنی کڕیاران',
      'واتسئاپی سەرئاوکەوتوو و زەنگی دەنگی داواکاری',
    ];
  }
  return VIP_ALL_ADDONS_LIST;
}

export const PLAN_FEATURE_TOGGLE_LABELS: Array<{
  key: keyof PlanFeaturesMap;
  label: string;
}> = [
  { key: 'priceProductControl', label: 'التحكم بالأسعار والمنتجات' },
  { key: 'deliveryOrders', label: 'استقبال طلبات التوصيل' },
  { key: 'pickupOrders', label: 'استقبال طلبات الحجز / الاستلام' },
  { key: 'tableOrders', label: 'استقبال طلبات الطاولات داخل الصالة' },
  { key: 'qrCode', label: 'رمز الاستجابة السريعة (QR Code)' },
  { key: 'customSlug', label: 'رابط مخصص باسم المشروع' },
  { key: 'lightDarkMode', label: 'اختيار المظهر الغامق والفاتح' },
  { key: 'analytics', label: 'إحصائيات احترافية للمبيعات والطلبات' },
  { key: 'itemDiscounts', label: 'إضافة خصومات على العناصر (قبل/بعد)' },
  { key: 'popupAd', label: 'البوب آب الإعلاني المنبثق' },
  { key: 'happyHourDiscount', label: 'خصم بساعات محددة ومؤقت العروض' },
  { key: 'customColors', label: 'تخصيص الألوان والهوية البصرية بالكامل' },
  { key: 'allAddons', label: 'تفعيل كافة الإضافات التسويقية (20 إضافة)' },
];

export function getLocalizedPlanName(plan: Pick<PricingPlan, 'id' | 'n'>, lang: SupportedLanguage = 'ar'): string {
  const id = String(plan.id || '').toLowerCase();
  const n = String(plan.n || '').trim();
  if (lang === 'ar') return n;
  if (id === 'starter' || n.includes('اقتصادية')) {
    return trByLang(lang, n || 'الباقة الاقتصادية', 'پاکێجی ئابووری', 'Economy Plan');
  }
  if (id === 'pro' || n.includes('احترافية')) {
    return trByLang(lang, n || 'الباقة الاحترافية', 'پاکێجی پڕۆفیشناڵ', 'Pro Plan');
  }
  if (id === 'vip' || id === 'gold_vip' || n.includes('الشاملة') || n.toLowerCase().includes('vip')) {
    return trByLang(lang, n || 'باقة الاعمال الشاملة', 'پاکێجی بزنس تەواو (VIP)', 'VIP Business Plan');
  }
  return n;
}

export function getLocalizedPlanTagline(plan: Pick<PricingPlan, 'id' | 'tagline'>, lang: SupportedLanguage = 'ar'): string {
  const raw = String(plan.tagline || '').trim();
  if (lang === 'ar') return raw;
  const id = String(plan.id || '').toLowerCase();
  if (id === 'starter') {
    return trByLang(lang, raw, 'بۆ چێشتخانە و کافێ چالاکەکانی ڕۆژانە', 'For active daily restaurants & cafés');
  }
  if (id === 'pro') {
    return trByLang(lang, raw, 'کۆنترۆڵی پێشکەوتووی ئۆفەر و مێزەکان و ٢ لق', 'Advanced offers, dine-in tables & 2 branches');
  }
  if (id === 'vip' || id === 'gold_vip') {
    return trByLang(lang, raw, 'تایبەتمەندی و لقی بێسنوور لەگەڵ ناسنامەی تایبەت', 'Unlimited branches, add-ons & custom branding');
  }
  return raw;
}

export interface PlanComparisonRow {
  key: string;
  label: string;
  included: boolean;
}

export const DEFAULT_COMPARISON_KEY_ORDER: string[] = [
  'items',
  'cats',
  'slug',
  'orders',
  'themes',
  'qr',
  'analytics',
  'branches',
  'tables',
  'discounts',
  'popup',
  'happyHour',
  'addons',
];

export const COMPARISON_FEATURE_KEY_MAP: Record<string, keyof PlanFeaturesMap> = {
  slug: 'customSlug',
  qr: 'qrCode',
  analytics: 'analytics',
  tables: 'tableOrders',
  discounts: 'itemDiscounts',
  popup: 'popupAd',
  happyHour: 'happyHourDiscount',
  addons: 'allAddons',
};

export function getDefaultComparisonRows(
  plan: PricingPlan,
  lang: 'ar' | 'ku' | 'en' | string = 'ar'
): PlanComparisonRow[] {
  const fm = plan.featuresMap || {};
  const maxItems = fm.unlimitedItems ? -1 : typeof plan.maxItems === 'number' ? plan.maxItems : 20;
  const maxCats = fm.unlimitedItems ? -1 : typeof plan.maxCats === 'number' ? plan.maxCats : 5;
  const maxThemes = fm.customColors ? -1 : typeof plan.maxThemes === 'number' ? plan.maxThemes : 2;
  const maxBranches =
    typeof plan.maxBranches === 'number'
      ? plan.maxBranches
      : inferTierIndexFromPlan(plan, 0, 4) >= 3
      ? -1
      : inferTierIndexFromPlan(plan, 0, 4) === 2
      ? 2
      : 0;

  if (lang === 'en') {
    const itemsLabel = maxItems === -1 ? 'Unlimited items & products' : `Up to ${maxItems} items`;
    const catsLabel = maxCats === -1 ? 'Unlimited categories' : `Up to ${maxCats} categories`;
    const themesLabel =
      maxThemes === -1
        ? 'All themes + custom brand colors'
        : maxThemes >= 3
        ? `${maxThemes} menu themes`
        : 'Basic Dark & Light mode';
    const branchesLabel =
      maxBranches === -1
        ? 'Unlimited branches management'
        : maxBranches > 0
        ? `Multi-branch (${maxBranches} branches)`
        : 'Multi-branch management';

    return [
      { key: 'items', label: itemsLabel, included: true },
      { key: 'cats', label: catsLabel, included: true },
      { key: 'slug', label: 'Custom branded business link', included: Boolean(fm.customSlug) },
      { key: 'orders', label: 'Delivery & Pickup orders', included: fm.deliveryOrders !== false || fm.pickupOrders !== false },
      { key: 'themes', label: themesLabel, included: true },
      { key: 'qr', label: 'Print-ready QR Code', included: fm.qrCode !== false },
      { key: 'analytics', label: 'Pro Sales & Order Analytics', included: Boolean(fm.analytics) },
      { key: 'branches', label: branchesLabel, included: maxBranches !== 0 },
      { key: 'tables', label: 'Dine-in & Table ordering', included: Boolean(fm.tableOrders) },
      { key: 'discounts', label: 'Product discounts', included: Boolean(fm.itemDiscounts) },
      { key: 'popup', label: 'Promotional popup ad', included: Boolean(fm.popupAd) },
      { key: 'happyHour', label: 'Happy hour & timers', included: Boolean(fm.happyHourDiscount) },
      { key: 'addons', label: 'All 20 Marketing Add-ons', included: Boolean(fm.allAddons) },
    ];
  }

  if (lang === 'ku') {
    const itemsLabel = maxItems === -1 ? 'بەرهەم و خواردنی بێسنوور' : `هەتا ${maxItems} بەرهەم`;
    const catsLabel = maxCats === -1 ? 'بەش و پۆلی بێسنوور' : `هەتا ${maxCats} بەش`;
    const themesLabel =
      maxThemes === -1
        ? 'هەموو ڕووکارەکان + ڕەنگی تایبەت'
        : maxThemes >= 3
        ? `${maxThemes} ڕووکاری مینیۆ`
        : 'ڕووکاری سەرەکی (تاریک و ڕووناک)';
    const branchesLabel =
      maxBranches === -1
        ? 'بەڕێوەبردنی لقی بێسنوور'
        : maxBranches > 0
        ? `بەڕێوەبردنی فرە لق (${maxBranches} لق)`
        : 'بەڕێوەبردنی فرە لق';

    return [
      { key: 'items', label: itemsLabel, included: true },
      { key: 'cats', label: catsLabel, included: true },
      { key: 'slug', label: 'لینکی تایبەت بە ناوی پرۆژە', included: Boolean(fm.customSlug) },
      { key: 'orders', label: 'داواکاری گەیاندن و وەرگرتن', included: fm.deliveryOrders !== false || fm.pickupOrders !== false },
      { key: 'themes', label: themesLabel, included: true },
      { key: 'qr', label: 'کۆدی QR ئامادە بۆ چاپ', included: fm.qrCode !== false },
      { key: 'analytics', label: 'ئاماری پڕۆفیشناڵی فرۆش', included: Boolean(fm.analytics) },
      { key: 'branches', label: branchesLabel, included: maxBranches !== 0 },
      { key: 'tables', label: 'داواکاری سەر مێز و هۆڵ', included: Boolean(fm.tableOrders) },
      { key: 'discounts', label: 'داشکاندن لەسەر بەرهەمەکان', included: Boolean(fm.itemDiscounts) },
      { key: 'popup', label: 'پۆپئاپی ڕێکلامی', included: Boolean(fm.popupAd) },
      { key: 'happyHour', label: 'داشکاندنی کاتژمێری دیاریکراو', included: Boolean(fm.happyHourDiscount) },
      { key: 'addons', label: '٢٠ تایبەتمەندی بازرگانی تەواو', included: Boolean(fm.allAddons) },
    ];
  }

  const itemsLabel = maxItems === -1 ? 'عناصر ومنتجات لانهائية' : `حتى ${maxItems} عنصر ومنتج`;
  const catsLabel = maxCats === -1 ? 'أقسام وتصنيفات لانهائية' : `حتى ${maxCats} أقسام وتصنيفات`;
  const themesLabel =
    maxThemes === -1
      ? 'كل المظاهر + ألوان مخصصة'
      : maxThemes >= 6
      ? `${maxThemes} مظاهر للمنيو`
      : maxThemes >= 3
      ? `${maxThemes} مظاهر للمنيو`
      : 'مظهر أساسي (غامق وفاتح)';
  const branchesLabel =
    maxBranches === -1
      ? 'إدارة عدة أفرع (أفرع لانهائية)'
      : maxBranches > 0
      ? `إدارة عدة أفرع (${maxBranches} فرعين)`
      : 'إدارة عدة أفرع';

  return [
    { key: 'items', label: itemsLabel, included: true },
    { key: 'cats', label: catsLabel, included: true },
    { key: 'slug', label: 'رابط مخصص باسم المشروع', included: Boolean(fm.customSlug) },
    {
      key: 'orders',
      label: 'طلبات التوصيل والحجز',
      included: fm.deliveryOrders !== false || fm.pickupOrders !== false,
    },
    { key: 'themes', label: themesLabel, included: true },
    { key: 'qr', label: 'كود QR جاهز للطباعة', included: fm.qrCode !== false },
    { key: 'analytics', label: 'إحصائيات احترافية للمبيعات', included: Boolean(fm.analytics) },
    { key: 'branches', label: branchesLabel, included: maxBranches !== 0 },
    { key: 'tables', label: 'طلبات الطاولات والصالة', included: Boolean(fm.tableOrders) },
    { key: 'discounts', label: 'خصومات على العناصر', included: Boolean(fm.itemDiscounts) },
    { key: 'popup', label: 'بوب آب إعلاني منبثق', included: Boolean(fm.popupAd) },
    { key: 'happyHour', label: 'خصم بساعات محددة', included: Boolean(fm.happyHourDiscount) },
    { key: 'addons', label: '20 إضافة تسويقية وذكية شاملة', included: Boolean(fm.allAddons) },
  ];
}

export interface EditablePlanComparisonItem {
  key: string;
  defaultLabel: string;
  customLabel?: string;
  included: boolean;
  visible: boolean;
  isCustom: boolean;
}

function resolveBuiltInIncluded(
  plan: PricingPlan,
  item: PlanComparisonItemConfig | undefined,
  defaultIncluded: boolean
): boolean {
  const key = item?.key || '';
  if (key in COMPARISON_FEATURE_KEY_MAP || key === 'orders') {
    return defaultIncluded;
  }
  return item?.included !== undefined ? Boolean(item.included) : defaultIncluded;
}

export function getEditablePlanComparisonItems(plan: PricingPlan): EditablePlanComparisonItem[] {
  const defaultRows = getDefaultComparisonRows(plan, 'ar');
  const defaultMap = new Map(defaultRows.map((r) => [r.key, r]));
  const saved = Array.isArray(plan.comparisonItems) && plan.comparisonItems.length > 0
    ? plan.comparisonItems
    : DEFAULT_COMPARISON_KEY_ORDER.map((k) => ({ key: k, visible: true } as PlanComparisonItemConfig));

  const seen = new Set<string>();
  const result: EditablePlanComparisonItem[] = [];

  for (const cfg of saved) {
    if (!cfg || !cfg.key || seen.has(cfg.key)) continue;
    seen.add(cfg.key);
    const def = defaultMap.get(cfg.key);
    if (def) {
      result.push({
        key: cfg.key,
        defaultLabel: def.label,
        customLabel: cfg.label && cfg.label.trim() ? cfg.label : undefined,
        included: resolveBuiltInIncluded(plan, cfg, def.included),
        visible: cfg.visible !== false,
        isCustom: false,
      });
    } else {
      result.push({
        key: cfg.key,
        defaultLabel: cfg.label || 'ميزة جديدة',
        customLabel: cfg.label ?? '',
        included: cfg.included !== false,
        visible: cfg.visible !== false,
        isCustom: true,
      });
    }
  }

  for (const def of defaultRows) {
    if (!seen.has(def.key)) {
      result.push({
        key: def.key,
        defaultLabel: def.label,
        included: def.included,
        visible: true,
        isCustom: false,
      });
    }
  }

  return result;
}

export function buildPlanComparisonRows(
  plan: PricingPlan,
  lang: 'ar' | 'ku' | 'en' | string = 'ar'
): PlanComparisonRow[] {
  const defaultRows = getDefaultComparisonRows(plan, lang);
  const defaultMap = new Map(defaultRows.map((r) => [r.key, r]));

  if (!Array.isArray(plan.comparisonItems) || plan.comparisonItems.length === 0) {
    return defaultRows;
  }

  const seen = new Set<string>();
  const ordered: PlanComparisonRow[] = [];

  for (const cfg of plan.comparisonItems) {
    if (!cfg || !cfg.key || seen.has(cfg.key)) continue;
    seen.add(cfg.key);
    const def = defaultMap.get(cfg.key);
    if (cfg.visible === false) continue;

    if (def) {
      const customText = cfg.label?.trim();
      ordered.push({
        key: cfg.key,
        label: lang === 'ar' && customText ? customText : def.label,
        included: resolveBuiltInIncluded(plan, cfg, def.included),
      });
    } else {
      const label = (cfg.label || '').trim();
      if (!label) continue;
      ordered.push({
        key: cfg.key,
        label,
        included: cfg.included !== false,
      });
    }
  }

  for (const def of defaultRows) {
    if (!seen.has(def.key)) {
      ordered.push(def);
    }
  }

  return ordered;
}

export function syncPlanComparisonOrderToAll(
  plans: PricingPlan[],
  sourcePlan: PricingPlan
): PricingPlan[] {
  const sourceItems = getEditablePlanComparisonItems(sourcePlan);
  return plans.map((targetPlan) => {
    const targetEditable = getEditablePlanComparisonItems(targetPlan);
    const targetMap = new Map(targetEditable.map((item) => [item.key, item]));

    const nextItems: PlanComparisonItemConfig[] = sourceItems.map((src) => {
      const existing = targetMap.get(src.key);
      if (existing) {
        const cfg: PlanComparisonItemConfig = {
          key: src.key,
          visible: src.visible,
        };
        if (existing.customLabel !== undefined && existing.customLabel.trim()) {
          cfg.label = existing.customLabel.trim();
        } else if (existing.isCustom) {
          cfg.label = existing.defaultLabel;
        }
        if (!(src.key in COMPARISON_FEATURE_KEY_MAP) && src.key !== 'orders') {
          cfg.included = existing.included;
        }
        return cfg;
      }
      return {
        key: src.key,
        label: src.customLabel ?? src.defaultLabel,
        included: src.included,
        visible: src.visible,
      };
    });

    const syncedLabels = nextItems
      .filter((it) => it.visible !== false)
      .map((it) => {
        const row = targetMap.get(it.key);
        return it.label || row?.defaultLabel || '';
      })
      .filter(Boolean);

    return {
      ...targetPlan,
      comparisonItems: nextItems,
      ...(syncedLabels.length > 0 ? { f: syncedLabels } : {}),
    };
  });
}

export const DEFAULT_PLANS_V2: PricingPlan[] = [
  {
    id: 'starter',
    n: 'الباقة الاقتصادية',
    tagline: 'للمطاعم والكافيهات النشطة يومياً',
    pr: 9000,
    annualPr: 99000,
    discountPercent: 0,
    hot: 0,
    maxItems: 100,
    maxCats: 10,
    maxThemes: 4,
    maxBranches: 0,
    f: [
      'حتى 100 عنصر و 10 أقسام',
      'رابط مخصص باسم المشروع',
      'طلبات التوصيل والحجز',
      '4 مظاهر للمنيو + كود QR',
      'إحصائيات احترافية كاملة',
    ],
    featuresMap: {
      priceProductControl: true,
      deliveryOrders: true,
      pickupOrders: true,
      tableOrders: false,
      qrCode: true,
      customSlug: true,
      lightDarkMode: true,
      analytics: true,
      itemDiscounts: false,
      popupAd: false,
      happyHourDiscount: false,
      customColors: false,
      allAddons: false,
      unlimitedItems: false,
      whatsappOrders: true,
      customQr: true,
    },
  },
  {
    id: 'pro',
    n: 'الباقة الاحترافية',
    tagline: 'تحكم متقدم بالعروض وطلبات الطاولات وفرعين',
    pr: 20000,
    annualPr: 220000,
    discountPercent: 0,
    hot: 1,
    maxItems: 200,
    maxCats: 20,
    maxThemes: 7,
    maxBranches: 2,
    f: [
      'حتى 200 عنصر و 20 قسم',
      'رابط مخصص باسم المشروع + فرعين',
      'طلبات التوصيل والحجز والطاولات',
      '7 مظاهر للمنيو (تشمل البناتية) + إحصائيات',
      'خصومات العناصر وبوب آب إعلاني',
      'خصم بساعات محددة',
    ],
    featuresMap: {
      priceProductControl: true,
      deliveryOrders: true,
      pickupOrders: true,
      tableOrders: true,
      qrCode: true,
      customSlug: true,
      lightDarkMode: true,
      analytics: true,
      itemDiscounts: true,
      popupAd: true,
      happyHourDiscount: true,
      customColors: false,
      allAddons: false,
      unlimitedItems: false,
      whatsappOrders: true,
      customQr: true,
    },
  },
  {
    id: 'vip',
    n: 'باقة الاعمال الشاملة',
    tagline: 'مزايا وأفرع بلا حدود وهوية مخصصة بالكامل',
    pr: 29000,
    annualPr: 319000,
    discountPercent: 0,
    hot: 0,
    maxItems: -1,
    maxCats: -1,
    maxThemes: -1,
    maxBranches: -1,
    f: [
      'عناصر وأقسام وأفرع لانهائية',
      'رابط مخصص لكل فرع باسم المشروع',
      'طلبات التوصيل والحجز والطاولات',
      'كل المظاهر + تخصيص الألوان',
      '20 إضافة تسويقية وتشغيلية وذكية شاملة',
    ],
    addonsHighlights: VIP_ALL_ADDONS_LIST,
    featuresMap: {
      priceProductControl: true,
      deliveryOrders: true,
      pickupOrders: true,
      tableOrders: true,
      qrCode: true,
      customSlug: true,
      lightDarkMode: true,
      analytics: true,
      itemDiscounts: true,
      popupAd: true,
      happyHourDiscount: true,
      customColors: true,
      allAddons: true,
      prioritySupport: true,
      unlimitedItems: true,
      whatsappOrders: true,
      customQr: true,
    },
  },
];

export interface ResolvedPlanInfo {
  plan: PricingPlan;
  tierIndex: number;
  maxItems: number; // -1 means unlimited
  maxCats: number; // -1 means unlimited
  maxThemes: number; // -1 means unlimited
  maxBranches: number; // 0 = disabled, N = up to N extra branches, -1 = unlimited
  perms: Required<Pick<
    PlanFeaturesMap,
    | 'deliveryOrders'
    | 'pickupOrders'
    | 'tableOrders'
    | 'priceProductControl'
    | 'qrCode'
    | 'customSlug'
    | 'lightDarkMode'
    | 'analytics'
    | 'itemDiscounts'
    | 'popupAd'
    | 'happyHourDiscount'
    | 'customColors'
    | 'allAddons'
  >>;
}

function inferTierIndexFromPlan(plan: PricingPlan, idx: number, total: number): number {
  const id = String(plan.id || '').toLowerCase();
  const n = String(plan.n || '').toLowerCase();
  if (id === 'vip' || id === 'gold_vip' || n.includes('الشاملة') || n.includes('الذهبية') || n.includes('vip')) return 3;
  if (id === 'pro' || n.includes('الاحترافية') || n.includes('pro')) return 2;
  if (id === 'starter' || id === 'silver' || n.includes('الاقتصادية') || n.includes('الأعمال') || n.includes('الاعمال') || n.includes('فضية')) return 1;
  if (idx >= total - 1 && total >= 3) return 3;
  return Math.min(3, Math.max(1, idx + 1));
}

export function resolveRestaurantPlan(
  rest: Restaurant | undefined | null,
  plans: PricingPlan[]
): ResolvedPlanInfo {
  const rawList = plans && plans.length > 0 ? plans : DEFAULT_PLANS_V2;
  const filtered = rawList.filter((p) => p.id !== 'free');
  const list = filtered.length > 0 ? filtered : DEFAULT_PLANS_V2;

  // Demo restaurant always gets VIP unless explicitly overridden
  if (rest?.id === 'demo' && !rest?.planId) {
    const vipPlan = list.find((p) => p.id === 'vip' || p.id === 'gold_vip') || list[list.length - 1];
    return buildResolvedFromPlan(vipPlan, list.indexOf(vipPlan), list.length);
  }

  let matchedIndex = -1;
  if (rest?.planId && rest.planId !== 'free') {
    matchedIndex = list.findIndex((p) => p.id === rest.planId);
  }

  if (matchedIndex === -1 && rest?.p) {
    const rawName = rest.p.trim();
    matchedIndex = list.findIndex((p) => p.n.trim() === rawName);
    if (matchedIndex === -1) {
      const lower = rawName.toLowerCase();
      if (lower.includes('vip') || lower.includes('الذهبية') || lower.includes('الشاملة')) {
        matchedIndex = Math.max(0, list.length - 1);
      } else if (lower.includes('احترافية') || lower.includes('pro')) {
        matchedIndex = Math.min(1, list.length - 1);
      } else if (lower.includes('اقتصادية') || lower.includes('أعمال') || lower.includes('اعمال') || lower.includes('فضية') || lower.includes('starter')) {
        matchedIndex = 0;
      }
    }
  }

  if (matchedIndex === -1) {
    matchedIndex = 0;
  }

  const matchedPlan = list[matchedIndex] || list[0];
  return buildResolvedFromPlan(matchedPlan, matchedIndex, list.length);
}

function buildResolvedFromPlan(plan: PricingPlan, idx: number, total: number): ResolvedPlanInfo {
  const tierIndex = inferTierIndexFromPlan(plan, idx, total);
  const fm = plan.featuresMap || {};
  const fallbackPlan =
    DEFAULT_PLANS_V2.find((p) => p.id === plan.id) ||
    DEFAULT_PLANS_V2[Math.min(DEFAULT_PLANS_V2.length - 1, Math.max(0, tierIndex - 1))] ||
    DEFAULT_PLANS_V2[0];
  const fallbackFm = fallbackPlan.featuresMap || {};

  const allAddons = fm.allAddons !== undefined ? Boolean(fm.allAddons) : Boolean(fallbackFm.allAddons);
  const unlimited = fm.unlimitedItems === true;

  const maxItems =
    unlimited
      ? -1
      : typeof plan.maxItems === 'number'
      ? plan.maxItems
      : fallbackPlan.maxItems ?? 100;

  const maxCats =
    unlimited
      ? -1
      : typeof plan.maxCats === 'number'
      ? plan.maxCats
      : fallbackPlan.maxCats ?? 10;

  const maxThemes =
    typeof plan.maxThemes === 'number'
      ? plan.maxThemes
      : fallbackPlan.maxThemes ?? 4;

  const maxBranches =
    typeof plan.maxBranches === 'number'
      ? plan.maxBranches
      : fallbackPlan.maxBranches ?? 0;

  return {
    plan,
    tierIndex,
    maxItems,
    maxCats,
    maxThemes,
    maxBranches,
    perms: {
      deliveryOrders: fm.deliveryOrders !== undefined ? Boolean(fm.deliveryOrders) : Boolean(fallbackFm.deliveryOrders),
      pickupOrders: fm.pickupOrders !== undefined ? Boolean(fm.pickupOrders) : Boolean(fallbackFm.pickupOrders),
      tableOrders: fm.tableOrders !== undefined ? Boolean(fm.tableOrders) : Boolean(fallbackFm.tableOrders),
      priceProductControl: fm.priceProductControl !== undefined ? Boolean(fm.priceProductControl) : true,
      qrCode: fm.qrCode !== undefined ? Boolean(fm.qrCode) : true,
      customSlug: fm.customSlug !== undefined ? Boolean(fm.customSlug) : true,
      lightDarkMode: fm.lightDarkMode !== undefined ? Boolean(fm.lightDarkMode) : true,
      analytics: fm.analytics !== undefined ? Boolean(fm.analytics) : Boolean(fallbackFm.analytics),
      itemDiscounts: fm.itemDiscounts !== undefined ? Boolean(fm.itemDiscounts) : Boolean(fallbackFm.itemDiscounts),
      popupAd: fm.popupAd !== undefined ? Boolean(fm.popupAd) : Boolean(fallbackFm.popupAd),
      happyHourDiscount: fm.happyHourDiscount !== undefined ? Boolean(fm.happyHourDiscount) : Boolean(fallbackFm.happyHourDiscount),
      customColors: fm.customColors !== undefined ? Boolean(fm.customColors) : Boolean(fallbackFm.customColors),
      allAddons,
    },
  };
}

export function calcDiscountedPlanPrice(basePrice: number, discountPercent?: number): number {
  const pct = Math.min(95, Math.max(0, Number(discountPercent) || 0));
  if (!basePrice || basePrice <= 0 || pct <= 0) return Math.max(0, Math.round(basePrice || 0));
  return Math.max(0, Math.round(basePrice * (1 - pct / 100)));
}

export function isAddonAllowedForPlan(addonKey: AddonKey | string, resolved: ResolvedPlanInfo): boolean {
  if (resolved.perms.allAddons) return true;
  if (addonKey === 'freeDeliveryProgress') return resolved.perms.deliveryOrders;
  if (addonKey === 'offerPopup') return resolved.perms.popupAd;
  if (addonKey === 'happyHour' || addonKey === 'countdownTimer' || addonKey === 'limitedTimeDiscount') {
    return resolved.perms.happyHourDiscount;
  }
  return false;
}

export function getAddonRequiredPlanTier(addonKey: AddonKey | string): 'pro' | 'vip' {
  if (
    addonKey === 'offerPopup' ||
    addonKey === 'happyHour' ||
    addonKey === 'countdownTimer' ||
    addonKey === 'limitedTimeDiscount'
  ) {
    return 'pro';
  }
  return 'vip';
}

export function getAddonRequiredPlanLabel(addonKey: AddonKey | string): string {
  if (getAddonRequiredPlanTier(addonKey) === 'pro') {
    return 'الباقة الاحترافية أو باقة الاعمال الشاملة';
  }
  return 'باقة الاعمال الشاملة';
}

export function getAllowedThemesForPlan(resolved: ResolvedPlanInfo): MenuThemeDefinition[] {
  const restaurantThemes = MENU_THEMES.filter((t) => !t.storeOnly);
  if (resolved.maxThemes === -1 || resolved.perms.customColors) {
    return restaurantThemes;
  }
  const limit = Math.max(2, resolved.maxThemes || 2);
  const regular = restaurantThemes.filter((t) => !t.seasonal && t.id !== 'toters').slice(0, limit);
  const totersTheme = restaurantThemes.filter((t) => t.id === 'toters');
  const seasonal = restaurantThemes.filter((t) => t.seasonal);
  return [...regular, ...totersTheme, ...seasonal];
}

export function getSeasonalPairedShape(presetId?: string): 'toters' | 'ramadan' | 'eid' | 'newyear' | null {
  if (presetId === 'toters') return 'toters';
  if (presetId === 'ramadan-royal') return 'ramadan';
  if (presetId === 'eid-joy') return 'eid';
  if (presetId === 'newyear-gala') return 'newyear';
  return null;
}

export function getSeasonalPairedTheme(shapeId?: string): string | null {
  if (shapeId === 'toters') return 'toters';
  if (shapeId === 'ramadan') return 'ramadan-royal';
  if (shapeId === 'eid') return 'eid-joy';
  if (shapeId === 'newyear') return 'newyear-gala';
  return null;
}

export function getAllowedLayoutsCount(resolved: ResolvedPlanInfo): number {
  if (resolved.tierIndex <= 1) return 2; // Starter: list & grid
  return 3; // Pro & VIP: all layouts (grid3, grid, list)
}

export function resolveMenuThemeEffectiveMode(mode?: 'dark' | 'light' | 'auto'): 'dark' | 'light' {
  if (mode === 'auto') {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
    return 'light';
  }
  return mode === 'dark' ? 'dark' : 'light';
}

export function getMenuThemeById(presetId?: string, mode?: 'dark' | 'light' | 'auto'): MenuThemeDefinition {
  if (presetId === 'estore') {
    const estoreTheme = MENU_THEMES.find((t) => t.id === 'estore')!;
    return {
      ...estoreTheme,
      ...estoreTheme.lightPalette,
      mode: 'light',
    };
  }
  const effectiveMode: 'dark' | 'light' | undefined =
    mode ? resolveMenuThemeEffectiveMode(mode) : undefined;

  const base =
    (presetId ? MENU_THEMES.find((t) => t.id === presetId && !t.storeOnly) : undefined) ||
    (effectiveMode === 'dark' ? MENU_THEMES[0] : MENU_THEMES[1]);

  const targetMode: 'dark' | 'light' = effectiveMode || base.mode;
  const palette = targetMode === 'dark' ? base.darkPalette : base.lightPalette;

  return {
    ...base,
    ...palette,
    mode: targetMode,
  };
}
