/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HomeFaqItem, SupportedLanguage } from '../types';

export interface HomeLanguageItem {
  code: SupportedLanguage;
  name: string;
  flagCode: string;
  isRtl: boolean;
}

// Exactly 3 Home languages in strict required order:
// 1. Arabic (العربية) first
// 2. Kurdish (کوردی) second
// 3. English (English) third
export const HOME_LANGUAGES: HomeLanguageItem[] = [
  { code: 'ar', name: 'العربية', flagCode: 'iq', isRtl: true },
  { code: 'ku', name: 'کوردی', flagCode: 'ku', isRtl: true },
  { code: 'en', name: 'English', flagCode: 'gb', isRtl: false },
];

export function trByLang(
  lang: SupportedLanguage | string | undefined,
  ar: string,
  ku: string,
  en: string
): string {
  if (lang === 'en') return en;
  if (lang === 'ku') return ku;
  return ar;
}

export function getLocalizedCurrencyUnit(currency: string | undefined, lang: SupportedLanguage): string {
  const clean = String(currency || 'د.ع').trim();
  if (lang === 'en' && (clean === 'د.ع' || clean === 'د.ع.')) return 'IQD';
  return clean;
}

export interface LocalizedFaqText {
  q: string;
  a: string;
}

export const FAQ_ITEM_I18N: Record<string, { ku: LocalizedFaqText; en: LocalizedFaqText }> = {
  faq_1: {
    ku: {
      q: 'مینیۆ و کەتەلۆگی دیجیتاڵی زیرەک چییە؟',
      a: 'لینکێکی تایبەت و بارکۆدی QR بە ناوی پڕۆژەکەتە کە کڕیار بەبێ داگرتنی هیچ ئەپێک لە براوزەری مۆبایلەکەیەوە دەیکاتەوە؛ بەشەکان و خواردن یان بەرهەمەکان بە وێنە و نرخەوە دەبینێت، زیادی دەکات بۆ سەبەتە، و داواکارییەکە بە ڕێکوپێکی دەنێرێت بۆ واتسئاپت.',
    },
    en: {
      q: 'What is a smart digital QR menu & catalog?',
      a: 'It is your business’s branded web link and QR code that customers open right from their phone browser with no app required. They browse categories and items with photos and prices, add to cart, and send formatted orders directly to your WhatsApp.',
    },
  },
  faq_2: {
    ku: {
      q: 'ئایا مینیۆ پڵەس بۆ چێشتخانە یان فرۆشگاکەم گونجاوە؟',
      a: 'بەڵێ، پلاتفۆرمەکە بە نەرمی تەواو دیزاین کراوە بۆ چێشتخانە، کافێ، شیرینی و شەربەتخانەکان، هەروەها فرۆشگای ئەلیکترۆنی، بۆن، جلوبەرگ و ئێکسسوارات، لەگەڵ گۆڕینی خۆکار بۆ دەستەواژە و بەشەکان بەپێی جۆری کارەکەت.',
    },
    en: {
      q: 'Is Menu+ suitable for my restaurant or retail store?',
      a: 'Yes! Menu+ adapts seamlessly to restaurants, cafés, bakeries, dessert shops, and online retail stores (perfumes, fashion, electronics, and more), automatically adjusting terminology and storefront sections to match your business.',
    },
  },
  faq_3: {
    ku: {
      q: 'دەتوانم ناو و لۆگۆی خۆم بەکاربهێنم و ڕەنگ و ڕووکار بگۆڕم؟',
      a: 'بە دڵنیاییەوە! دەتوانیت لۆگۆی پڕۆژەکەت و وێنەی بەرگ بار بکەیت، و لە نێوان دۆخی ڕووناک و تاریکدا هەڵبژێریت لەگەڵ پاکێجی ڕەنگی پڕۆفیشناڵ و لینکێکی تایبەت بە ناوی پڕۆژەکەت بۆ پیشاندانی ناسنامەی تەواوت.',
    },
    en: {
      q: 'Can I use my own logo, brand colors, and theme style?',
      a: 'Absolutely! Upload your business logo and cover banner, switch between dark and light themes, pick custom color palettes, and launch a branded link that reflects your identity.',
    },
  },
  faq_4: {
    ku: {
      q: 'ئایا هیچ ڕێژە یان عمولەیەک لەسەر فرۆشتن و داواکارییەکانم وەردەگرن؟',
      a: 'نەخێر، ٠٪ عمولە بۆ هەمیشە. تەواوی قازانجی داواکارییەکانی گەیاندن، وەرگرتن و سەر مێز بۆ خۆت دەمێنێتەوە و ڕاستەوخۆ لە ڕێگەی ژمارەی واتسئاپی خۆتەوە وەریان دەگریت.',
    },
    en: {
      q: 'Do you take any commission or fee per order?',
      a: 'Never — 0% sales commission forever. Every dinar from delivery, pickup, and dine-in table orders stays 100% yours and goes straight to your WhatsApp.',
    },
  },
  faq_5: {
    ku: {
      q: 'چۆن بەشداری چالاک دەکرێت و چ پاکێجێک هەیە؟',
      a: 'ئێمە ٣ پاکێجی نەرممان هەیە (ئابووری، پڕۆفیشناڵ، و کاروباری گشتی) بە بەشداری مانگانە یان ساڵانە بەبێ هیچ عمولەیەک، و دەتوانیت هەر کاتێک بتەوێت پاکێجەکەت بەرز بکەیتەوە.',
    },
    en: {
      q: 'How is my plan activated and what packages are available?',
      a: 'We offer 3 flexible tiers (Economy, Pro, and VIP Business) with monthly or annual billing and zero sales commission. You can upgrade your plan anytime as you grow.',
    },
  },
  faq_6: {
    ku: {
      q: 'ئایا دەتوانم ئێستا کارەکەم چالاک بکەم و نرخەکان دەستکاری بکەم؟',
      a: 'بەڵێ، لە ماوەی چەند خولەکێکدا بە ژمارەی مۆبایلەکەت تۆمار دەبیت، بەش و بەرهەمەکانت زیاد دەکەیت، کۆدی QR چاپ دەکەیت و دەستبەجێ دەست دەکەیت بە وەرگرتنی داواکاری لەگەڵ گۆڕینی نرخ بە یەک کلیک.',
    },
    en: {
      q: 'Can I launch my menu and update prices immediately?',
      a: 'Yes! Within minutes you can register with your phone, add categories and items, download your print-ready QR code, and start taking orders with instant one-tap price and availability updates.',
    },
  },
};

export function getLocalizedFaqItem(item: HomeFaqItem, lang: SupportedLanguage): LocalizedFaqText {
  if (lang === 'ar') return { q: item.q, a: item.a };
  if (lang === 'ku' && item.qKu?.trim() && item.aKu?.trim()) {
    return { q: item.qKu.trim(), a: item.aKu.trim() };
  }
  if (lang === 'en' && item.qEn?.trim() && item.aEn?.trim()) {
    return { q: item.qEn.trim(), a: item.aEn.trim() };
  }
  const preset = FAQ_ITEM_I18N[item.id];
  if (preset) {
    return lang === 'en' ? preset.en : preset.ku;
  }
  return { q: item.q, a: item.a };
}

export const TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  ar: {
    appName: 'منيو بلس',
    tagline: 'المنيو والكتالوج الإلكتروني الذكي لمطعمك أو متجرك، والطلبات تصلك فوراً على الواتساب',
    heroTitle: 'المنيو الأذكى بالعراق',
    heroTitleLine2: 'لمتجرك أو مطعمك',
    heroSubtitle: 'أطلق متجرك الآن واستقبل الطلبات',
    enterNow: 'ادخل الآن',
    completeSetup: 'إكمال الإعداد',
    home: 'الرئيسية',
    features: 'المميزات',
    faqNav: 'الأسئلة الشائعة',
    pricing: 'الأسعار',
    login: 'تسجيل الدخول',
    dashboard: 'لوحة التحكم',
    adminDashboard: 'لوحة تحكم الإدارة',
    logout: 'تسجيل الخروج',
    whyTitle: 'كل ما يحتاجه مطعمك أو متجرك لبيع أكثر',
    whyLead: 'منيو سريع يفتح بلمسة واحدة، وطلبات تصل منظمة مباشرة لواتسابك بدون تعقيد.',
    feature1Title: 'صفر عمولة.. وأرباحك 100% لك',
    feature1Desc: 'استقبل مئات الطلبات يومياً بدون اقتطاع أي نسبة مئوية أو رسوم خفية؛ كل دينار يدخل حسابك بالكامل.',
    feature2Title: 'طلبات مرتبة على واتسابك بلحظة',
    feature2Desc: 'يتصفح الزبون الصور ويضيف للسلة ويرسل لك فاتورة جاهزة بالأسعار والعنوان وموقع GPS فوراً.',
    feature3Title: 'تحكم فوري بالأسعار والأصناف',
    feature3Desc: 'نفدت وجبة أو تغيّر سعر؟ عدّل الأسعار وأخفِ الأصناف أو أطلق خصماً من موبايلك بنفس الثانية.',
    feature4Title: 'باركود QR خاص لطاولاتك وإعلاناتك',
    feature4Desc: 'باركود بتصميم أنيق وشعار مطعمك، يمسحه الزبون بكاميرا هاتفه ليفتح المنيو فوراً دون تحميل تطبيق.',
    feature5Title: 'أدوات ذكية تضاعف قيمة الفاتورة',
    feature5Desc: 'عجلة حظ، كوبونات خصم، ومقترحات إضافية داخل السلة تشجّع الزبون على زيادة طلبه تلقائياً.',
    feature6Title: 'لوحة مبيعات وتقارير لحظية',
    feature6Desc: 'تعرّف على عدد الزوار، أكثر الأصناف طلباً، وأوقات الذروة بوضوح لتتخذ قرارات تزيد مبيعاتك.',
    monthlyBilling: 'اشتراك شهري',
    annualBilling: 'اشتراك سنوي',
    allRightsReserved: 'جميع الحقوق محفوظة',
  },
  ku: {
    appName: 'مینیۆ پڵەس',
    tagline: 'مینیۆ و کەتەلۆگی دیجیتاڵی زیرەک بۆ چێشتخانە یان فرۆشگاکەت، داواکارییەکان ڕاستەوخۆ دەگەنە واتسئاپ',
    heroTitle: 'زیرەکترین مینیۆ لە عێراق',
    heroTitleLine2: 'بۆ فرۆشگا یان چێشتخانەکەت',
    heroSubtitle: 'ئێستا فرۆشگاکەت بخە کار و داواکاری وەرگرە',
    enterNow: 'ئێستا بچۆ ژوورەوە',
    completeSetup: 'تەواوکردنی ڕێکخستن',
    home: 'سەرەکی',
    features: 'تایبەتمەندییەکان',
    faqNav: 'پرسیارە باوەکان',
    pricing: 'نرخەکان',
    login: 'چوونەژوورەوە',
    dashboard: 'کۆنتڕۆڵ پانێڵ',
    adminDashboard: 'پانێڵی بەڕێوەبەری پلاتفۆرم',
    logout: 'چوونەدەرەوە',
    whyTitle: 'هەموو ئەوەی چێشتخانە یان فرۆشگاکەت پێویستیەتی بۆ فرۆشتنی زیاتر',
    whyLead: 'مینیۆیەکی خێرا بە یەک دەستلێدان دەکرێتەوە و داواکارییەکان ڕێکخراو دەگەنە واتسئاپ.',
    feature1Title: '٠٪ عمولە.. تەواوی قازانج بۆ خۆتە',
    feature1Desc: 'ڕۆژانە سەدان داواکاری وەربگرە بەبێ هیچ ڕێژە یان تێچوویەکی شاراوە.',
    feature2Title: 'داواکاری ڕێکخراو لە واتسئاپ لە چرکەیەکدا',
    feature2Desc: 'کڕیار وێنەکان دەبینێت و وەسڵی تەواو بە نرخ و ناونیشان و نەخشەی GPS دەنێرێت یەکسەر.',
    feature3Title: 'کۆنترۆڵی خێرای نرخ و بەرهەمەکان',
    feature3Desc: 'خواردن تەواوبوو یان نرخ گۆڕا؟ نرخەکان بگۆڕە یان بەرهەم بشارەوە و داشکاندن بکە لە هەمان چرکەدا.',
    feature4Title: 'کۆدی QR ی تایبەت بۆ مێز و ڕیکلام',
    feature4Desc: 'کۆد بە دیزاینی جوان و لۆگۆی خۆت؛ کڕیار بە کامێرا سکانی دەکات بەبێ داگرتنی ئەپ.',
    feature5Title: 'ئامرازی زیرەک بۆ زیادکردنی وەسڵ',
    feature5Desc: 'چەرخی بەخت، کۆدی داشکاندن و پێشنیاری ناو سەبەتە فرۆشتنت زیاد دەکەن.',
    feature6Title: 'ئاماری فرۆشتن و ڕاپۆرتی خێرا',
    feature6Desc: 'ژمارەی سەردان، پڕفرۆشترین بەرهەمەکان و کاتە قەرەباڵغەکان ببینە بۆ بڕیاری دروست.',
    monthlyBilling: 'مانگانە',
    annualBilling: 'ساڵانە',
    allRightsReserved: 'هەموو مافەکان پارێزراون',
  },
  en: {
    appName: 'Menu+',
    tagline: 'Smart QR digital menu & product catalog for restaurants, cafés, and online stores',
    heroTitle: 'The Smartest Menu in Iraq',
    heroTitleLine2: 'For Your Store or Restaurant',
    heroSubtitle: 'Launch your store now and start receiving orders',
    enterNow: 'Enter Now',
    completeSetup: 'Complete Setup',
    home: 'Home',
    features: 'Features',
    faqNav: 'FAQ',
    pricing: 'Pricing',
    login: 'Log In',
    dashboard: 'Dashboard',
    adminDashboard: 'Platform Admin Dashboard',
    logout: 'Log Out',
    whyTitle: 'Everything Your Business Needs to Sell More',
    whyLead: 'A lightning-fast digital menu that opens in one tap and sends clean orders straight to WhatsApp.',
    feature1Title: '0% Commission — 100% Yours',
    feature1Desc: 'Receive unlimited daily orders with zero percentage fees or hidden cuts; every dinar stays with you.',
    feature2Title: 'Instant Formatted WhatsApp Orders',
    feature2Desc: 'Customers browse photos, add to cart, and send itemized bills with address & GPS location in one tap.',
    feature3Title: 'Real-Time Price & Menu Control',
    feature3Desc: 'Out of stock or launching a deal? Update prices, hide dishes, or launch offers straight from your phone.',
    feature4Title: 'Branded QR Codes Ready to Print',
    feature4Desc: 'Sleek custom QR codes with your logo—customers scan with any camera to open instantly without an app.',
    feature5Title: 'Smart Tools That Boost Order Size',
    feature5Desc: 'Spin-the-wheel rewards, promo coupons, and cart upsells naturally increase your average ticket.',
    feature6Title: 'Live Sales & Top-Item Analytics',
    feature6Desc: 'Track daily visitors, top-selling dishes, and peak hours clearly to grow your revenue faster.',
    monthlyBilling: 'Monthly',
    annualBilling: 'Annual',
    allRightsReserved: 'All rights reserved',
  },
};

const HOME_LANG_STORAGE_KEY = 'menuplus_lang';

export function getStoredLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'ar';
  try {
    const saved = localStorage.getItem(HOME_LANG_STORAGE_KEY) as SupportedLanguage | null;
    if (saved === 'ar' || saved === 'ku' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  return 'ar';
}

export function setStoredLanguage(lang: SupportedLanguage): void {
  if (typeof window === 'undefined') return;
  try {
    const validLang: SupportedLanguage = lang === 'ku' || lang === 'en' ? lang : 'ar';
    localStorage.setItem(HOME_LANG_STORAGE_KEY, validLang);
    window.dispatchEvent(new CustomEvent('menuplus_lang_changed', { detail: validLang }));
  } catch {
    // ignore
  }
}
