/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import estoreHeroPromoImg from '../assets/images/store_editorial_hero_1795175538078.jpg';
import estorePhonesImg from '../assets/images/estore_cat_phones_1795173985624.jpg';
import estoreLaptopsImg from '../assets/images/estore_cat_laptops_1795173985797.jpg';
import estoreAudioImg from '../assets/images/estore_cat_audio_1795173986397.jpg';
import estoreWatchesImg from '../assets/images/estore_cat_watches_1795173986726.jpg';
import estoreChargersImg from '../assets/images/estore_cat_chargers_1795173988592.jpg';
import estoreGamingImg from '../assets/images/estore_cat_gaming_1795173988533.jpg';
import estoreSmarthomeImg from '../assets/images/estore_cat_smarthome_1795173988718.jpg';
import { Category, MediaLibraryItem, MenuItem, Restaurant } from '../types';
import { getCollection, getItem, putItem, putManyAndSync, uid } from '../utils/storage';
import { DEFAULT_MEDIA_ASSETS } from '../utils/businessDefaults';

export const ESTORE_HERO_PROMO_IMG = estoreHeroPromoImg;

export const ESTORE_MEDIA_PRESETS: Array<{ id: string; name: string; url: string }> = [
  { id: 'estore_preset_hero', name: 'واجهة عرض المتجر الرئيسية', url: estoreHeroPromoImg },
  { id: 'estore_preset_phones', name: 'هواتف ذكية حديثة', url: estorePhonesImg },
  { id: 'estore_preset_laptops', name: 'لابتوبات وأجهزة لوحية', url: estoreLaptopsImg },
  { id: 'estore_preset_audio', name: 'سماعات صوتية عازلة للضوضاء', url: estoreAudioImg },
  { id: 'estore_preset_watches', name: 'ساعات ذكية وأساور رياضية', url: estoreWatchesImg },
  { id: 'estore_preset_chargers', name: 'شواحن سريعة وبنوك طاقة', url: estoreChargersImg },
  { id: 'estore_preset_gaming', name: 'أجهزة ألعاب وملحقات احترافية', url: estoreGamingImg },
  { id: 'estore_preset_smarthome', name: 'أجهزة المنزل الذكي والكاميرات', url: estoreSmarthomeImg },
];

interface SeedCategoryDef {
  key: string;
  n: string;
  subtitle: string;
  img: string;
}

interface SeedProductDef {
  catKey: string;
  n: string;
  prIqd: number;
  beforePriceIqd?: number;
  d: string;
  img: string;
  allergens?: string;
  badge?: { type: 'red' | 'gold' | 'green' | 'accent'; text: string };
  sizes?: Array<{ n: string; pIqd: number }>;
  extras?: Array<{ n: string; pIqd: number }>;
  choices?: string[];
}

const STORE_CATEGORIES_TEMPLATE: SeedCategoryDef[] = [
  {
    key: 'phones',
    n: 'الهواتف الذكية',
    subtitle: 'أحدث أجهزة الفئة الرائدة بضمان رسمي',
    img: estorePhonesImg,
  },
  {
    key: 'laptops',
    n: 'اللابتوبات والأجهزة اللوحية',
    subtitle: 'أداء احترافي للعمل والدراسة والتصميم',
    img: estoreLaptopsImg,
  },
  {
    key: 'audio',
    n: 'السماعات والصوتيات',
    subtitle: 'عزل ضوضاء فائق وصوت ستيريو نقي',
    img: estoreAudioImg,
  },
  {
    key: 'watches',
    n: 'الساعات الذكية',
    subtitle: 'تتبع الصحة واللياقة وشاشات AMOLED',
    img: estoreWatchesImg,
  },
  {
    key: 'chargers',
    n: 'الشواحن والإكسسوارات',
    subtitle: 'شواحن GaN سريعة وباور بانك عالي السعة',
    img: estoreChargersImg,
  },
  {
    key: 'gaming',
    n: 'الألعاب والمنزل الذكي',
    subtitle: 'كنترولرز احترافية وكاميرات مراقبة ذكية',
    img: estoreGamingImg,
  },
];

const STORE_PRODUCTS_TEMPLATE: SeedProductDef[] = [
  // 1. Smartphones
  {
    catKey: 'phones',
    n: 'هاتف Pro Max Ultra 5G (نسخة الشرق الأوسط)',
    prIqd: 1490000,
    beforePriceIqd: 1620000,
    d: 'شاشة LTPO OLED مقاس 6.9 إنش بتردد 120Hz، كاميرا ثلاثية بدقة 48MP، معالج رائد وشحن سريع.',
    img: estorePhonesImg,
    allergens: 'ضمان رسمي لمدة 12 شهراً • يشمل الشاحن والكيبل الأصلي داخل العلبة',
    badge: { type: 'red', text: 'الأكثر مبيعاً' },
    sizes: [
      { n: '256GB', pIqd: 1490000 },
      { n: '512GB', pIqd: 1680000 },
      { n: '1TB', pIqd: 1890000 },
    ],
    extras: [
      { n: 'كفر حماية شفاف + لاصق زجاجي', pIqd: 20000 },
      { n: 'شاحن أصلي 35W فائق السرعة', pIqd: 35000 },
    ],
    choices: ['تيتانيوم طبيعي', 'أسود فاحم', 'فضي معدني'],
  },
  {
    catKey: 'phones',
    n: 'هاتف Galaxy S25 Ultra بالذكاء الاصطناعي',
    prIqd: 1320000,
    beforePriceIqd: 1450000,
    d: 'هيكل تيتانيوم متين مع قلم S-Pen مدمج، كاميرا 200MP وتقريب بصري فائق وبطارية تدوم طوال اليوم.',
    img: estorePhonesImg,
    allergens: 'كفالة وكيل رسمية لمدة سنة • شريحتين + eSIM',
    badge: { type: 'accent', text: 'عرض خاص' },
    sizes: [
      { n: '256GB / 12GB RAM', pIqd: 1320000 },
      { n: '512GB / 12GB RAM', pIqd: 1490000 },
    ],
    extras: [
      { n: 'كفر حماية ضد الصدمات', pIqd: 18000 },
      { n: 'تغليف هدية فاخر مع كارت تهنئة', pIqd: 8000 },
    ],
    choices: ['رمادي تيتانيوم', 'أسود فولاذي', 'أزرق ثلجي'],
  },
  {
    catKey: 'phones',
    n: 'هاتف Redmi Note Pro Plus الاقتصادي',
    prIqd: 415000,
    d: 'شاشة AMOLED منحنية 120Hz، شحن خارق 120W يشحن البطارية بالكامل خلال 19 دقيقة، ومقاومة للماء.',
    img: estorePhonesImg,
    allergens: 'ضمان استبدال فوري خلال 14 يوماً + صيانة سنة',
    badge: { type: 'green', text: 'جديد' },
    sizes: [
      { n: '256GB / 8GB RAM', pIqd: 415000 },
      { n: '512GB / 12GB RAM', pIqd: 475000 },
    ],
    choices: ['أسود ليلي', 'بنفسجي معدني'],
  },

  // 2. Laptops & Tablets
  {
    catKey: 'laptops',
    n: 'لابتوب Ultrabook M3 Air مقاس 13.6 إنش',
    prIqd: 1580000,
    beforePriceIqd: 1710000,
    d: 'تصميم ألمنيوم فائق النحافة وخفيف الوزن ببطارية تدوم حتى 18 ساعة وشاشة Liquid Retina عالية الدقة.',
    img: estoreLaptopsImg,
    allergens: 'ضمان دولي معتمد لمدة سنة • كيبورد عربي / إنجليزي أصلي',
    badge: { type: 'red', text: 'الأكثر مبيعاً' },
    sizes: [
      { n: '16GB RAM / 256GB SSD', pIqd: 1580000 },
      { n: '16GB RAM / 512GB SSD', pIqd: 1820000 },
    ],
    extras: [
      { n: 'حقيبة لابتوب مبطنة مضادة للماء', pIqd: 30000 },
      { n: 'ماوس لاسلكي صامت + قاعدة USB-C', pIqd: 38000 },
    ],
    choices: ['فضي كلاسيكي', 'رمادي فلكي', 'أزرق داكن'],
  },
  {
    catKey: 'laptops',
    n: 'تابلت Pro Studio Display 11 إنش للرسم والدراسة',
    prIqd: 890000,
    d: 'شاشة عالية السطوع 120Hz، يدعم القلم الذكي والكيبورد المغناطيسي مع 4 سماعات ستيريو.',
    img: estoreLaptopsImg,
    allergens: 'ضمان الوكيل لمدة سنة كاملة',
    sizes: [
      { n: '128GB Wi-Fi', pIqd: 890000 },
      { n: '256GB Wi-Fi + 5G', pIqd: 1090000 },
    ],
    extras: [
      { n: 'قلم رسم ذكي حساس للضغط', pIqd: 85000 },
      { n: 'كفر حماية دوّار مع حافظة قلم', pIqd: 22000 },
    ],
    choices: ['رمادي فضائي', 'فضي'],
  },

  // 3. Audio & Headphones
  {
    catKey: 'audio',
    n: 'سماعة رأس لاسلكية Studio ANC احترافية',
    prIqd: 285000,
    beforePriceIqd: 340000,
    d: 'عزل ضوضاء نشط متعدد المستويات (ANC)، بطارية حتى 40 ساعة تشغيل متواصل وشحن سريع USB-C.',
    img: estoreAudioImg,
    allergens: 'كفالة حقيقية لمدة 12 شهراً ضد العيوب المصنعية',
    badge: { type: 'accent', text: 'عرض خاص' },
    extras: [
      { n: 'حقيبة حمل صلبة للحماية', pIqd: 15000 },
    ],
    choices: ['أسود مطفي', 'رمادي دافئ'],
  },
  {
    catKey: 'audio',
    n: 'سماعات أذن TWS Pro الجيل الجديد',
    prIqd: 145000,
    beforePriceIqd: 175000,
    d: 'صوت محيطي مكاني، مقاومة للتعرق والماء IPX4، علبة شحن لاسلكي وتوافق تام مع جميع الهواتف.',
    img: estoreAudioImg,
    allergens: 'ضمان 6 أشهر استبدال فوري',
    badge: { type: 'red', text: 'الأكثر مبيعاً' },
    extras: [
      { n: 'كفر سيليكون مع حلقة تعليق', pIqd: 7000 },
    ],
    choices: ['أبيض لؤلؤي', 'أسود كربوني'],
  },

  // 4. Smartwatches
  {
    catKey: 'watches',
    n: 'ساعة ذكية Watch Ultra Titanium 49mm',
    prIqd: 265000,
    beforePriceIqd: 315000,
    d: 'شاشة AMOLED ساطعة جداً، قياس نبض القلب والأكسجين والرياضات المائية، ومكالمات بلوتوث واضحة.',
    img: estoreWatchesImg,
    allergens: 'ضمان سنة + سير إضافي هدية داخل العلبة',
    badge: { type: 'gold', text: 'كفالة رسمية' },
    extras: [
      { n: 'سير معدني ستانلس ستيل إضافي', pIqd: 16000 },
      { n: 'واقي شاشة شفاف 3D', pIqd: 6000 },
    ],
    choices: ['برتقالي رياضي', 'أسود كربوني', 'رمادي تيتانيوم'],
  },
  {
    catKey: 'watches',
    n: 'سوار رياضي ذكي FitBand 9 مقاوم للماء',
    prIqd: 65000,
    d: 'وزن خفيف جداً، بطارية تدوم 14 يوماً بشحنة واحدة، وتتبع دقيق للنوم والسعرات وإشعارات الهاتف.',
    img: estoreWatchesImg,
    allergens: 'ضمان 6 أشهر',
    badge: { type: 'green', text: 'جديد' },
    choices: ['أسود', 'كحلي', 'وردي رملي'],
  },

  // 5. Chargers & Accessories
  {
    catKey: 'chargers',
    n: 'شاحن جداري GaN فائق السرعة 65W بـ 3 منافذ',
    prIqd: 45000,
    beforePriceIqd: 58000,
    d: 'يشحن اللابتوب والهاتف والسماعة في وقت واحد بأمان حراري كامل وتقنية GaN المصغرة.',
    img: estoreChargersImg,
    allergens: 'ضمان استبدال مباشر لمدة 18 شهراً',
    badge: { type: 'accent', text: 'عرض خاص' },
    extras: [
      { n: 'كيبل Type-C إلى Type-C بقدرة 100W', pIqd: 12000 },
    ],
    choices: ['أسود مطفي', 'أبيض'],
  },
  {
    catKey: 'chargers',
    n: 'باور بانك MagSafe لاسلكي 10,000mAh مع ستاند',
    prIqd: 55000,
    d: 'التصاق مغناطيسي قوي بالهاتف، شحن لاسلكي 15W + منفذ USB-C سريع 20W وشاشة عرض نسبة الشحن.',
    img: estoreChargersImg,
    allergens: 'ضمان سنة كاملة • آمن للسفر والطيران',
    choices: ['رمادي معدني', 'أزرق داكن'],
  },
  {
    catKey: 'chargers',
    n: 'كيبل مضفّر فائق المتانة Type-C 100W (طول 2 متر)',
    prIqd: 18000,
    d: 'رأس ألمنيوم مضاد للقطع يتحمل أكثر من 25,000 ثنية مع شريحة ذكية لحماية البطارية.',
    img: estoreChargersImg,
    allergens: 'ضمان 12 شهراً',
    choices: ['2 متر - أسود', '1.2 متر - رمادي'],
  },

  // 6. Gaming & Smart Home
  {
    catKey: 'gaming',
    n: 'ذراع تحكم لاسلكي Pro DualSense مع حقيبة',
    prIqd: 115000,
    beforePriceIqd: 135000,
    d: 'استجابة اهتزاز تفاعلية عالية الدقة، متوافق مع منصات الألعاب والحاسوب والهاتف عبر البلوتوث.',
    img: estoreGamingImg,
    allergens: 'نسخة أصلية بضمان 6 أشهر',
    badge: { type: 'red', text: 'الأكثر مبيعاً' },
    extras: [
      { n: 'قاعدة شحن مزدوجة RGB', pIqd: 28000 },
    ],
    choices: ['أبيض كلاسيكي', 'أسود منتصف الليل', 'أزرق كوبالت'],
  },
  {
    catKey: 'gaming',
    n: 'كاميرا مراقبة ذكية Wi-Fi بدقة 2K ودوران 360°',
    prIqd: 68000,
    d: 'رؤية ليلية ملونة، تتبع تلقائي للحركة، تنبيه فوري للهاتف وصوت ثنائي الاتجاه مع فتحة ذاكرة.',
    img: estoreSmarthomeImg,
    allergens: 'ضمان سنة • تطبيق سهل بالعربي والإنجليزي',
    badge: { type: 'green', text: 'جديد' },
    extras: [
      { n: 'كرت ذاكرة SanDisk 64GB الأصلي', pIqd: 15000 },
    ],
  },
];

function scaleStorePrice(priceIqd: number, currency: string): number {
  const cleanCurr = String(currency || '').trim();
  if (cleanCurr === '$' || /usd/i.test(cleanCurr)) {
    return Math.max(1, Math.round(priceIqd / 1500));
  }
  if (cleanCurr === 'ر.س' || cleanCurr === 'د.إ' || cleanCurr === 'ر.ق') {
    return Math.max(1, Math.round((priceIqd / 1500) * 3.75));
  }
  return priceIqd;
}

export function seedStoreCatalogForAccount(
  rid: string,
  currency = 'د.ع',
  mode: 'if_empty' | 'append_missing' = 'if_empty'
): { catsAdded: number; itemsAdded: number } {
  if (!rid) return { catsAdded: 0, itemsAdded: 0 };

  const existingCats = getCollection<Category>('cats')
    .filter((c) => c.rid === rid)
    .sort((a, b) => (a.o || 0) - (b.o || 0));
  const existingItems = getCollection<MenuItem>('items').filter((it) => it.rid === rid);

  if (mode === 'if_empty' && (existingCats.length > 0 || existingItems.length > 0)) {
    return { catsAdded: 0, itemsAdded: 0 };
  }

  const batch: Record<string, unknown> = {};
  const todayStr = new Date().toLocaleDateString('ar-IQ-u-nu-latn');
  const catIdByKey = new Map<string, string>();
  const existingCatByName = new Map(existingCats.map((c) => [c.n.trim().toLowerCase(), c]));
  let catsAdded = 0;

  STORE_CATEGORIES_TEMPLATE.forEach((tpl, idx) => {
    const matched = existingCatByName.get(tpl.n.trim().toLowerCase());
    if (matched) {
      catIdByKey.set(tpl.key, matched.id);
      return;
    }
    const newCatId = 'cat_' + uid();
    catIdByKey.set(tpl.key, newCatId);
    catsAdded++;
    batch[`cats/${newCatId}`] = {
      id: newCatId,
      rid,
      n: tpl.n,
      subtitle: tpl.subtitle,
      img: tpl.img,
      date: todayStr,
      published: true,
      o: existingCats.length + idx,
    } as Category;
  });

  const existingItemNames = new Set(existingItems.map((it) => it.n.trim().toLowerCase()));
  let itemsAdded = 0;

  STORE_PRODUCTS_TEMPLATE.forEach((tpl, idx) => {
    if (existingItemNames.has(tpl.n.trim().toLowerCase())) {
      return;
    }
    const catId = catIdByKey.get(tpl.catKey) || existingCats[0]?.id || 'default_cat';
    const newItemId = 'item_' + uid();
    itemsAdded++;
    const scaledSizes = tpl.sizes?.map((s) => ({
      n: s.n,
      p: scaleStorePrice(s.pIqd, currency),
    }));
    const scaledExtras = tpl.extras?.map((ex) => ({
      n: ex.n,
      p: scaleStorePrice(ex.pIqd, currency),
    }));
    const basePr = scaleStorePrice(tpl.prIqd, currency);
    const beforePr = tpl.beforePriceIqd ? scaleStorePrice(tpl.beforePriceIqd, currency) : undefined;

    batch[`items/${newItemId}`] = {
      id: newItemId,
      rid,
      cat: catId,
      n: tpl.n,
      pr: scaledSizes && scaledSizes.length > 0 ? Math.min(...scaledSizes.map((s) => s.p)) : basePr,
      ...(beforePr ? { beforePrice: beforePr } : {}),
      d: tpl.d,
      img: tpl.img,
      sizes: scaledSizes || [],
      extras: scaledExtras || [],
      choices: tpl.choices || [],
      maxChoices: tpl.choices && tpl.choices.length > 0 ? 1 : undefined,
      allergens: tpl.allergens,
      available: true,
      published: true,
      badges: tpl.badge ? [tpl.badge] : [],
      date: todayStr,
      o: existingItems.length + idx,
    } as MenuItem;
  });

  const latestRest = getItem<Restaurant>(`restaurants/${rid}`);
  if (latestRest) {
    const curCover = latestRest.coverImages?.[0] || '';
    const isDefaultCover =
      !curCover ||
      curCover === DEFAULT_MEDIA_ASSETS.restaurant.banner ||
      curCover === DEFAULT_MEDIA_ASSETS.store.banner;
    const existingMedia: MediaLibraryItem[] = Array.isArray(latestRest.mediaLibrary)
      ? [...latestRest.mediaLibrary]
      : [];
    const mediaUrls = new Set(existingMedia.map((m) => m.url));
    const addedMedia: MediaLibraryItem[] = ESTORE_MEDIA_PRESETS.filter((p) => !mediaUrls.has(p.url)).map(
      (p) => ({
        id: p.id,
        name: p.name,
        url: p.url,
        createdAt: Date.now(),
      })
    );

    if (isDefaultCover || addedMedia.length > 0) {
      batch[`restaurants/${rid}`] = {
        ...latestRest,
        ...(isDefaultCover ? { coverImages: [estoreHeroPromoImg] } : {}),
        ...(addedMedia.length > 0 ? { mediaLibrary: [...addedMedia, ...existingMedia] } : {}),
      } as Restaurant;
    }
  }

  if (Object.keys(batch).length > 0) {
    Object.entries(batch).forEach(([path, val]) => {
      putItem(path, val);
    });
    void putManyAndSync(batch);
  }

  return { catsAdded, itemsAdded };
}
