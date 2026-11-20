/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Restaurant, RestaurantAddons, SupportedLanguage } from '../types';
import { isStoreProject } from '../utils/terminology';
import estoreHeroPromoImg from '../assets/images/store_editorial_hero_1795175538078.jpg';

export type AddonKey = keyof RestaurantAddons;
export type AddonCategoryFilter = 'all' | 'marketing' | 'sales' | 'experience' | 'orders';

export interface AddonMetaItem {
  key: AddonKey;
  category: Exclude<AddonCategoryFilter, 'all'>;
  icon: string;
  title: string;
  desc: string;
}

export const ADDON_CATEGORY_TABS: Array<{ id: AddonCategoryFilter; label: string }> = [
  { id: 'all', label: 'جميع الميزات (20)' },
  { id: 'marketing', label: 'التسويق والعروض' },
  { id: 'sales', label: 'زيادة المبيعات والسلة' },
  { id: 'experience', label: 'تجربة الزبون والتفاعل' },
  { id: 'orders', label: 'إدارة الطلبات والتشغيل' },
];

export function getLocalizedAddonTabs(lang: SupportedLanguage = 'ar'): Array<{ id: AddonCategoryFilter; label: string }> {
  if (lang === 'en') {
    return [
      { id: 'all', label: 'All Features (20)' },
      { id: 'marketing', label: 'Marketing & Offers' },
      { id: 'sales', label: 'Sales & Cart Boost' },
      { id: 'experience', label: 'Customer Experience' },
      { id: 'orders', label: 'Orders & Operations' },
    ];
  }
  if (lang === 'ku') {
    return [
      { id: 'all', label: 'هەموو تایبەتمەندییەکان (٢٠)' },
      { id: 'marketing', label: 'بازرگانی و ئۆفەرەکان' },
      { id: 'sales', label: 'زیادکردنی فرۆش و سەبەتە' },
      { id: 'experience', label: 'ئەزموونی کڕیار و کارلێک' },
      { id: 'orders', label: 'بەڕێوەبردنی داواکاری' },
    ];
  }
  return ADDON_CATEGORY_TABS;
}

export const ADDON_CATALOG: AddonMetaItem[] = [
  {
    key: 'freeDeliveryProgress',
    category: 'sales',
    icon: '🚚',
    title: 'الحد الأدنى للتوصيل المجاني + شريط التقدم',
    desc: 'تحديد الحد الأدنى للتوصيل المجاني وعرض شريط تقدم تحفيزي للزبون في السلة لزيادة قيمة الطلب.',
  },
  {
    key: 'offerPopup',
    category: 'marketing',
    icon: '📢',
    title: 'البوب اب الإعلاني المنبثق',
    desc: 'نافذة ترحيبية منبثقة تظهر للزبائن فور دخول المنيو للإعلان عن عرض أو طبق خاص.',
  },
  {
    key: 'announcementBar',
    category: 'marketing',
    icon: '📣',
    title: 'شريط الإعلانات أعلى المنيو',
    desc: 'شريط ملون بارز أعلى القائمة لعرض التنبيهات وأهم العروض اليومية للزوار.',
  },
  {
    key: 'minOrder',
    category: 'sales',
    icon: '🛒',
    title: 'الحد الأدنى لقيمة الطلب',
    desc: 'تحديد أقل مبلغ مسموح به لإتمام طلب التوصيل داخل السلة لضمان جدوى الطلبات.',
  },
  {
    key: 'countdownTimer',
    category: 'marketing',
    icon: '⏳',
    title: 'مؤقت العروض التنازلي + خصم فوري',
    desc: 'عدّاد وقت تنازلي مباشر في أعلى المنيو يطبق نسبة أو مبلغ خصم تلقائياً على جميع أسعار القائمة.',
  },
  {
    key: 'happyHour',
    category: 'marketing',
    icon: '☀️',
    title: 'ساعة السعادة (Happy Hour)',
    desc: 'تفعيل خصم تلقائي خاص يومياً خلال ساعات الهدوء (مثلاً 2 إلى 5 عصراً) لتحفيز الطلبات.',
  },
  {
    key: 'limitedTimeDiscount',
    category: 'marketing',
    icon: '🏷️',
    title: 'خصم لمدة محدودة',
    desc: 'تفعيل نسبة خصم تلقائية لمدة يوم أو يومين (أو مدة محددة) على القائمة دون عرض المدة أو العداد للزبائن.',
  },
  {
    key: 'whatsappSupportFloat',
    category: 'experience',
    icon: '💬',
    title: 'زر واتساب الاستفسار العائم',
    desc: 'أيقونة واتساب عائمة لتواصل الزبون السريع بشأن العزائم والحجوزات والاستفسارات الخاصة.',
  },
  {
    key: 'cartUpsell',
    category: 'sales',
    icon: '🍟',
    title: 'مقترحات زيادة السلة (Upsell)',
    desc: 'عرض أطباق ومشروبات مقترحة بضغطة زر داخل سلة الطلبات لرفع قيمة متوسط الفاتورة.',
  },
  {
    key: 'audioBell',
    category: 'orders',
    icon: '🔔',
    title: 'رنين الجرس الصوتي للطلبات',
    desc: 'تشغيل تنبيه صوتي فوري في لوحة التحكم عند وصول أي طلب جديد.',
  },
  {
    key: 'firstOrderDiscount',
    category: 'marketing',
    icon: '🎁',
    title: 'خصم ترحيبي للطلب الأول',
    desc: 'خصم أوتوماتيكي داخل السلة للزبائن الجدد في أول طلب لهم لتشجيعهم على الشراء الأول.',
  },
  {
    key: 'freeGiftThreshold',
    category: 'sales',
    icon: '🎀',
    title: 'هدية مجانية عند تجاوز مبلغ',
    desc: 'منح هدية مجانية (مشروب أو بطاطا) عند وصول الطلب لمبلغ محدد مع شريط تقدم تحفيزي في السلة.',
  },
  {
    key: 'spinWheelPromo',
    category: 'marketing',
    icon: '🎡',
    title: 'عجلة الحظ والمكافآت التفاعلية',
    desc: 'لعبة عجلة حظ عائمة للزبائن تمنحهم خصماً فورياً أو توصيلاً مجانياً يُطبق مباشرة في السلة.',
  },
  {
    key: 'loyaltyPoints',
    category: 'sales',
    icon: '💎',
    title: 'نظام نقاط الولاء للزبائن',
    desc: 'احتساب نقاط ولاء تلقائية للزبون مع كل طلب وعرض رصيده لتشجيعه على العودة باستمرار.',
  },
  {
    key: 'customerReviews',
    category: 'experience',
    icon: '⭐',
    title: 'تقييمات وآراء الزبائن',
    desc: 'عرض تقييمات الزبائن في المنيو وإتاحة نموذج إضافة تقييم وتجربة جديدة.',
  },
  {
    key: 'cutleryOption',
    category: 'orders',
    icon: '🍴',
    title: 'خيار أدوات الطعام والمناديل',
    desc: 'مفتاح اختياري داخل السلة يسأل الزبون إن كان يحتاج ملاعق ومناديل لتقليل الهدر.',
  },
  {
    key: 'groupOrderBillSplit',
    category: 'orders',
    icon: '👥',
    title: 'حاسبة تقسيم الفاتورة للمجموعات',
    desc: 'أداة ذكية داخل السلة للأصدقاء والعوائل لحساب حصة كل شخص من الفاتورة فوراً.',
  },
  {
    key: 'moodMealFinder',
    category: 'experience',
    icon: '🧠',
    title: 'مستشار المزاج والوجبة الذكي',
    desc: 'اختبار سريع من 3 ثوانٍ يختار فيه الزبون مزاجه وميزانيته ليرشح له المنيو أنسب 3 أطباق فوراً.',
  },
  {
    key: 'curbsidePickupCar',
    category: 'orders',
    icon: '🚗',
    title: 'الاستلام من السيارة (Drive-Up)',
    desc: 'إدخال نوع ولون السيارة عند الاستلام مع زر "وصلت أمام المطعم" لإرسال إشعار فوري بالواتساب.',
  },
  {
    key: 'pickupInstantDiscount',
    category: 'marketing',
    icon: '🏃',
    title: 'خصم الاستلام الذاتي الفوري',
    desc: 'تطبيق خصم تلقائي لمن يحضر لاستلام طلبه بنفسه من المطعم لتخفيف ضغط التوصيل.',
  },
];

export const STORE_ADDON_CATALOG: AddonMetaItem[] = ADDON_CATALOG.map((item) => {
  switch (item.key) {
    case 'offerPopup':
      return {
        ...item,
        desc: 'نافذة ترحيبية منبثقة تظهر للزبائن فور دخول المتجر للإعلان عن عرض أو منتج مميز.',
      };
    case 'announcementBar':
      return {
        ...item,
        title: 'شريط الإعلانات أعلى المتجر',
        desc: 'شريط ملون بارز أعلى واجهة المتجر لعرض التنبيهات وأهم العروض والتخفيضات للزوار.',
      };
    case 'countdownTimer':
      return {
        ...item,
        desc: 'عدّاد وقت تنازلي مباشر في أعلى المتجر يطبق نسبة أو مبلغ خصم تلقائياً على جميع أسعار المنتجات.',
      };
    case 'whatsappSupportFloat':
      return {
        ...item,
        desc: 'أيقونة واتساب عائمة لتواصل المتسوق السريع بشأن المنتجات والضمان والطلبات الخاصة.',
      };
    case 'cartUpsell':
      return {
        ...item,
        icon: '🎧',
        title: 'ملحقات وإكسسوارات مقترحة (Upsell)',
        desc: 'عرض منتجات وإكسسوارات مقترحة بضغطة زر داخل سلة التسوق لرفع متوسط قيمة الطلب.',
      };
    case 'freeGiftThreshold':
      return {
        ...item,
        desc: 'منح هدية مجانية (ملحق أو إكسسوار) عند وصول الطلب لمبلغ محدد مع شريط تقدم تحفيزي في السلة.',
      };
    case 'loyaltyPoints':
      return {
        ...item,
        desc: 'احتساب نقاط ولاء تلقائية للمتسوق مع كل طلب وعرض رصيده لتشجيعه على الشراء مجدداً.',
      };
    case 'customerReviews':
      return {
        ...item,
        desc: 'عرض تقييمات المتسوقين في المتجر وإتاحة نموذج إضافة تقييم وتجربة شراء جديدة.',
      };
    case 'cutleryOption':
      return {
        ...item,
        icon: '🎁',
        title: 'خيار تغليف هدية وفاتورة',
        desc: 'مفتاح اختياري داخل السلة يسأل الزبون إن كان يرغب بتغليف هدية أو فاتورة مطبوعة مع الطلب.',
      };
    case 'moodMealFinder':
      return {
        ...item,
        icon: '🛍️',
        title: 'مستشار التسوق الذكي',
        desc: 'اختبار سريع من 3 ثوانٍ يختار فيه الزبون احتياجه ليرشح له المتجر أنسب 3 منتجات فوراً.',
      };
    case 'curbsidePickupCar':
      return {
        ...item,
        desc: 'إدخال نوع ولون السيارة عند الاستلام مع زر "وصلت أمام المتجر" لإرسال إشعار فوري بالواتساب.',
      };
    case 'pickupInstantDiscount':
      return {
        ...item,
        title: 'خصم الاستلام من المعرض',
        desc: 'تطبيق خصم تلقائي لمن يحضر لاستلام طلبه بنفسه من المتجر لتخفيف ضغط التوصيل.',
      };
    default:
      return item;
  }
});

const ADDON_I18N: Record<AddonKey, { kuTitle: string; kuDesc: string; enTitle: string; enDesc: string }> = {
  freeDeliveryProgress: {
    kuTitle: 'کەمترین بڕ بۆ گەیاندنی بێبەرامبەر + شریتی پێشکەوتن',
    kuDesc: 'دیاریکردنی کەمترین بڕ بۆ گەیاندنی خۆڕایی لەگەڵ شریتی هاندەر لە سەبەتەدا بۆ زیادکردنی نرخی داواکاری.',
    enTitle: 'Free Delivery Threshold + Progress Bar',
    enDesc: 'Set a minimum order for free delivery and show a live progress bar in the cart to boost order value.',
  },
  offerPopup: {
    kuTitle: 'پۆپئاپی ڕێکلامی سەرەتا',
    kuDesc: 'پەنجەرەیەکی پێشوازی لە کاتی کردنەوەی مینیۆدا دەردەکەوێت بۆ ڕاگەیاندنی ئۆفەرە نوێیەکان.',
    enTitle: 'Promotional Welcome Popup',
    enDesc: 'Show an eye-catching promo popup as soon as customers open your menu.',
  },
  announcementBar: {
    kuTitle: 'شریتی ڕاگەیاندن لە سەرەوەی مینیۆ',
    kuDesc: 'شریتێکی ڕەنگاوڕەنگ لە سەرەوەی لیستەکە بۆ پیشاندانی ئاگاداری و ئۆفەرەکانی ڕۆژانە.',
    enTitle: 'Top Announcement Ticker Bar',
    enDesc: 'Highlight daily offers or key notices in a vivid banner pinned at the top of your menu.',
  },
  minOrder: {
    kuTitle: 'کەمترین بڕی نرخی داواکاری',
    kuDesc: 'دیاریکردنی کەمترین بڕی ڕێگەپێدراو بۆ تەواوکردنی داواکاری گەیاندن لە سەبەتەدا.',
    enTitle: 'Minimum Order Amount',
    enDesc: 'Require a minimum subtotal in the cart before checkout to ensure profitable deliveries.',
  },
  countdownTimer: {
    kuTitle: 'ژمێرەری کاتی ئۆفەر + داشکاندنی خێرا',
    kuDesc: 'کاتژمێری ژمێرەر لە سەرەوەی مینیۆ کە ڕاستەوخۆ ڕێژە یان بڕێکی داشکاندن دەخاتە سەر هەموو نرخەکان.',
    enTitle: 'Flash Countdown Timer + Auto Discount',
    enDesc: 'Display a live countdown banner that automatically discounts every item price.',
  },
  happyHour: {
    kuTitle: 'کاتژمێری دڵخۆشی (Happy Hour)',
    kuDesc: 'چالاککردنی داشکاندنی خۆکار ڕۆژانە لە کاتژمێرە دیاریکراوەکاندا بۆ هاندانی داواکاری.',
    enTitle: 'Daily Happy Hour Discount',
    enDesc: 'Automatically apply a menu-wide discount during specific daily quiet hours.',
  },
  limitedTimeDiscount: {
    kuTitle: 'داشکاندن بۆ ماوەیەکی دیاریکراو',
    kuDesc: 'چالاککردنی ڕێژەی داشکاندن بۆ ماوەی یەک یان دوو ڕۆژ بەبێ پیشاندانی کات بە کڕیاران.',
    enTitle: 'Limited-Time Discount',
    enDesc: 'Set a percentage discount for a selected number of days without showing any countdown or duration to customers.',
  },
  whatsappSupportFloat: {
    kuTitle: 'دوگمەی سەرئاوکەوتووی واتسئاپ',
    kuDesc: 'ئایکۆنی واتسئاپ بۆ پەیوەندیکردنی خێرای کڕیار دەربارەی میوانداری و پرسیارە تایبەتەکان.',
    enTitle: 'Floating WhatsApp Support Button',
    enDesc: 'Persistent floating WhatsApp chat icon for instant inquiries, events, and bookings.',
  },
  cartUpsell: {
    kuTitle: 'پێشنیاری ناو سەبەتە (Upsell)',
    kuDesc: 'پیشاندانی خواردن و خواردنەوەی پێشنیارکراو لە ناو سەبەتەدا بۆ زیادکردنی نرخی وەسڵ.',
    enTitle: 'In-Cart Upsell Suggestions',
    enDesc: 'Recommend sides and drinks right inside the cart to grow average ticket size.',
  },
  audioBell: {
    kuTitle: 'زەنگی دەنگی بۆ داواکارییە نوێیەکان',
    kuDesc: 'لێدانی زەنگێکی دەنگی خێرا لە پانێڵدا کاتێک هەر داواکارییەکی نوێ دەگات.',
    enTitle: 'Live Order Audio Bell',
    enDesc: 'Play an instant sound notification in the dashboard whenever a new order arrives.',
  },
  firstOrderDiscount: {
    kuTitle: 'داشکاندنی پێشوازی بۆ یەکەم داواکاری',
    kuDesc: 'داشکاندنی خۆکار لە سەبەتەدا بۆ کڕیارە نوێیەکان لە یەکەم داواکاریاندا.',
    enTitle: 'First-Order Welcome Discount',
    enDesc: 'Automatically reward new customers with an instant discount on their first checkout.',
  },
  freeGiftThreshold: {
    kuTitle: 'دیاری بێبەرامبەر لەسەر بڕی دیاریکراو',
    kuDesc: 'پێدانی دیاری خۆڕایی (خواردنەوە یان فرایز) کاتێک داواکاری دەگاتە بڕێکی دیاریکراو.',
    enTitle: 'Free Gift at Spend Threshold',
    enDesc: 'Unlock a complimentary gift item once the customer cart reaches your target spend.',
  },
  spinWheelPromo: {
    kuTitle: 'چەرخی بەخت و خەڵاتی کارلێکەر',
    kuDesc: 'چەرخی بەخت کە داشکاندنی خێرا یان گەیاندنی بێبەرامبەر دەبەخشێتە کڕیاران.',
    enTitle: 'Interactive Spin-the-Wheel Promo',
    enDesc: 'Playful floating reward wheel granting instant cart discounts or free delivery.',
  },
  loyaltyPoints: {
    kuTitle: 'سیستەمی خاڵی دڵسۆزی کڕیاران',
    kuDesc: 'هەژمارکردنی خاڵی خۆکار لەگەڵ هەر داواکارییەک بۆ هاندانی گەڕانەوەی کڕیار.',
    enTitle: 'Customer Loyalty Points',
    enDesc: 'Automatically award points per order and display customer balance.',
  },
  customerReviews: {
    kuTitle: 'هەڵسەنگاندن و پێداچوونەوەی کڕیاران',
    kuDesc: 'پیشاندانی ڕای کڕیاران لە مینیۆدا لەگەڵ فۆڕمی زیادکردنی هەڵسەنگاندنی نوێ.',
    enTitle: 'Verified Customer Reviews',
    enDesc: 'Display customer ratings on your storefront and accept live feedback submissions.',
  },
  cutleryOption: {
    kuTitle: 'بژاردەی کەوچک و کلێنس',
    kuDesc: 'پرسیاری سادە لە سەبەتەدا بۆ کەمکردنەوەی بەفیڕۆچوونی پلاستیک و کلێنس.',
    enTitle: 'Eco Cutlery & Napkins Toggle',
    enDesc: 'Let guests opt in or out of disposable utensils directly in their cart.',
  },
  groupOrderBillSplit: {
    kuTitle: 'هەژمارکەری دابەشکردنی وەسڵی گروپ',
    kuDesc: 'ئامرازی زیرەک لە ناو سەبەتەدا بۆ هاوڕێیان تا بزانن بەشی هەر کەسێک چەندە.',
    enTitle: 'Group Order Bill Splitter',
    enDesc: 'Built-in cart calculator dividing the total per person for groups and offices.',
  },
  moodMealFinder: {
    kuTitle: 'ڕاوێژکاری مەزاج و ژەمی زیرەک',
    kuDesc: 'تاقیکردنەوەی خێرای ٣ چرکەیی بۆ پێشنیارکردنی ٣ گونجاوترین خواردن بەپێی مەزاج.',
    enTitle: 'Smart Mood Meal Finder',
    enDesc: 'Quick interactive quiz matching customer cravings to your top 3 dishes.',
  },
  curbsidePickupCar: {
    kuTitle: 'وەرگرتن لە ناو ئۆتۆمبێل (Drive-Up)',
    kuDesc: 'نووسینی جۆر و ڕەنگی ئۆتۆمبێل لەگەڵ دوگمەی "گەیشتم" بۆ ئاگادارکردنەوەی ستاف.',
    enTitle: 'Curbside Car Pickup',
    enDesc: 'Collect car model/plate info with an instant "I Have Arrived" WhatsApp ping.',
  },
  pickupInstantDiscount: {
    kuTitle: 'داشکاندنی خێرا بۆ وەرگرتنی خودی',
    kuDesc: 'داشکاندنی خۆکار بۆ ئەوانەی خۆیان دێن داواکارییەکەیان لە لق وەردەگرن.',
    enTitle: 'Instant Self-Pickup Discount',
    enDesc: 'Incentivize branch pickup orders with an automatic discount percentage.',
  },
};

export function getLocalizedAddonCatalog(lang: SupportedLanguage = 'ar', isStore = false): AddonMetaItem[] {
  const baseCatalog = isStore ? STORE_ADDON_CATALOG : ADDON_CATALOG;
  if (lang === 'ar') return baseCatalog;
  return baseCatalog.map((item) => {
    const tr = ADDON_I18N[item.key];
    if (!tr) return item;
    return {
      ...item,
      title: lang === 'ku' ? tr.kuTitle : tr.enTitle,
      desc: lang === 'ku' ? tr.kuDesc : tr.enDesc,
    };
  });
}

export function getContextualAddonCatalog(isStore: boolean, lang: SupportedLanguage = 'ar'): AddonMetaItem[] {
  return getLocalizedAddonCatalog(lang, isStore);
}

export function buildDefaultAddons(rest?: Restaurant): RestaurantAddons {
  const isStore = isStoreProject(rest?.projectType);
  const saved = (rest?.addons || {}) as Record<string, any>;
  const isCfg = (key: string, legacyEnabled = false) =>
    Boolean(saved[key]?.configured || saved[key]?.enabled || legacyEnabled);
  const popupMode: 'ad' | 'dish' =
    saved.offerPopup?.mode === 'dish' || rest?.offerPopup?.mode === 'dish' ? 'dish' : 'ad';
  const rawPopupBtn = String(saved.offerPopup?.buttonText || rest?.offerPopup?.buttonText || '').trim();
  const resolvedPopupBtn =
    !rawPopupBtn ||
    rawPopupBtn === 'تصفح المنيو واطلب الآن' ||
    rawPopupBtn === 'تصفح المنيو' ||
    rawPopupBtn === 'تصفح المتجر واطلب الآن'
      ? popupMode === 'dish'
        ? 'إضافة إلى السلة'
        : 'إغلاق'
      : popupMode === 'ad' && rawPopupBtn === 'إضافة إلى السلة'
      ? 'إغلاق'
      : rawPopupBtn;

  return {
    offerPopup: {
      configured: isCfg('offerPopup', Boolean(rest?.offerPopup?.enabled)),
      enabled: saved.offerPopup?.enabled ?? rest?.offerPopup?.enabled ?? false,
      mode: popupMode,
      itemId: popupMode === 'dish' ? (saved.offerPopup?.itemId || rest?.offerPopup?.itemId || '') : '',
      specialPrice:
        popupMode === 'dish' &&
        saved.offerPopup?.specialPrice === undefined &&
        rest?.offerPopup?.specialPrice === undefined
          ? undefined
          : popupMode === 'dish'
          ? (saved.offerPopup?.specialPrice ?? rest?.offerPopup?.specialPrice)
          : undefined,
      badgeText: saved.offerPopup?.badgeText || rest?.offerPopup?.badgeText || '',
      title: saved.offerPopup?.title || rest?.offerPopup?.title || 'عرض خاص ومميز لا يفوتك!',
      subtitle: saved.offerPopup?.subtitle || rest?.offerPopup?.subtitle || 'احصل على خصم 15% عند الطلب عبر الواتساب اليوم',
      image:
        saved.offerPopup?.image ||
        rest?.offerPopup?.image ||
        (isStore
          ? estoreHeroPromoImg
          : 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=700&q=80'),
      buttonText: resolvedPopupBtn,
    },
    announcementBar: {
      configured: isCfg('announcementBar'),
      enabled: saved.announcementBar?.enabled ?? false,
      text: saved.announcementBar?.text || 'توصيل مجاني لجميع الطلبات فوق 25,000 د.ع طوال هذا الأسبوع!',
      bgColor: saved.announcementBar?.bgColor || '#C2410C',
      textColor: saved.announcementBar?.textColor || '#ffffff',
    },
    countdownTimer: {
      configured: isCfg('countdownTimer'),
      enabled: saved.countdownTimer?.enabled ?? false,
      title: saved.countdownTimer?.title || 'عرض الساعة الذهبية',
      discountType: saved.countdownTimer?.discountType || 'percent',
      discountValue: saved.countdownTimer?.discountValue ?? 15,
      discountText:
        saved.countdownTimer?.discountText ||
        (isStore ? 'خصم 15% لفترة محدودة على كل المتجر' : 'خصم 15% لفترة محدودة على كل المنيو'),
      endHour: saved.countdownTimer?.endHour ?? 23,
    },
    customerReviews: {
      configured: isCfg('customerReviews'),
      enabled: saved.customerReviews?.enabled ?? false,
      showOnMenu: saved.customerReviews?.showOnMenu ?? true,
      allowSubmit: saved.customerReviews?.allowSubmit ?? true,
    },
    minOrder: {
      configured: isCfg('minOrder'),
      enabled: saved.minOrder?.enabled ?? false,
      amount: saved.minOrder?.amount ?? 10000,
      message: saved.minOrder?.message || 'الحد الأدنى للطلب هو',
    },
    audioBell: {
      configured: Boolean(saved.audioBell?.configured || saved.audioBell?.enabled || !saved.audioBell?.mutedByUser),
      enabled: saved.audioBell?.mutedByUser ? false : Boolean(saved.audioBell?.enabled ?? true),
      tone: saved.audioBell?.tone || 'bell',
      ...(saved.audioBell?.mutedByUser ? { mutedByUser: true } : {}),
    },
    happyHour: {
      configured: isCfg('happyHour'),
      enabled: saved.happyHour?.enabled ?? false,
      title: saved.happyHour?.title || 'ساعة السعادة الذهبية',
      startHour: saved.happyHour?.startHour ?? 14,
      endHour: saved.happyHour?.endHour ?? 17,
      discountPercent: saved.happyHour?.discountPercent ?? 15,
    },
    limitedTimeDiscount: {
      configured: isCfg('limitedTimeDiscount'),
      enabled: saved.limitedTimeDiscount?.enabled ?? false,
      discountPercent: saved.limitedTimeDiscount?.discountPercent ?? 15,
      durationDays: saved.limitedTimeDiscount?.durationDays ?? 1,
      startsAt: saved.limitedTimeDiscount?.startsAt,
      expiresAt: saved.limitedTimeDiscount?.expiresAt,
    },
    freeGiftThreshold: {
      configured: isCfg('freeGiftThreshold'),
      enabled: saved.freeGiftThreshold?.enabled ?? false,
      minAmount: saved.freeGiftThreshold?.minAmount ?? 25000,
      giftName:
        saved.freeGiftThreshold?.giftName ||
        (isStore ? 'كفر حماية مجاني + كيبل شحن' : 'بيبسي مجاني + صوص خاص'),
    },
    cartUpsell: {
      configured: isCfg('cartUpsell'),
      enabled: saved.cartUpsell?.enabled ?? false,
      title:
        saved.cartUpsell?.title ||
        (isStore ? 'أكمل طلبك بهذه الإكسسوارات والمنتجات' : 'أكمل وجبتك بهذه الإضافات اللذيذة'),
      maxItems: saved.cartUpsell?.maxItems ?? 4,
    },
    spinWheelPromo: {
      configured: isCfg('spinWheelPromo'),
      enabled: saved.spinWheelPromo?.enabled ?? false,
      title: saved.spinWheelPromo?.title || 'جرّب حظك واربح خصماً فورياً!',
      prizesText: saved.spinWheelPromo?.prizesText || 'خصم 5%\nخصم 10%\nخصم 15%\nتوصيل مجاني',
    },
    loyaltyPoints: {
      configured: isCfg('loyaltyPoints'),
      enabled: saved.loyaltyPoints?.enabled ?? false,
      pointsPerThousand: saved.loyaltyPoints?.pointsPerThousand ?? 1,
      rewardNote:
        saved.loyaltyPoints?.rewardNote ||
        (isStore
          ? 'اجمع نقاطك مع كل طلب للحصول على خصومات وهدايا حصرية'
          : 'اجمع نقاطك مع كل طلب للحصول على وجبات مجانية'),
    },
    cutleryOption: {
      configured: isCfg('cutleryOption'),
      enabled: saved.cutleryOption?.enabled ?? false,
      label:
        saved.cutleryOption?.label ||
        (isStore ? 'أحتاج تغليف هدية / فاتورة مطبوعة' : 'أحتاج أدوات طعام ومناديل مع الطلب'),
    },
    firstOrderDiscount: {
      configured: isCfg('firstOrderDiscount'),
      enabled: saved.firstOrderDiscount?.enabled ?? false,
      discountPercent: saved.firstOrderDiscount?.discountPercent ?? 10,
      title: saved.firstOrderDiscount?.title || 'هدية الترحيب لطلبك الأول',
    },
    freeDeliveryProgress: {
      configured: isCfg('freeDeliveryProgress'),
      enabled: saved.freeDeliveryProgress?.enabled ?? false,
      label: saved.freeDeliveryProgress?.label || 'شريط التوصيل المجاني',
      minAmount:
        saved.freeDeliveryProgress?.minAmount !== undefined
          ? Math.max(0, Number(saved.freeDeliveryProgress.minAmount) || 0)
          : rest?.freeDeliveryMin && rest.freeDeliveryMin > 0
          ? rest.freeDeliveryMin
          : 25000,
    },
    whatsappSupportFloat: {
      configured: isCfg('whatsappSupportFloat'),
      enabled: saved.whatsappSupportFloat?.enabled ?? false,
      label: saved.whatsappSupportFloat?.label || 'تواصل معنا',
      prefillText:
        saved.whatsappSupportFloat?.prefillText ||
        (isStore ? 'مرحباً، لدي استفسار عن المنتجات والطلبات' : 'مرحباً، لدي استفسار عن المنيو والطلبات'),
    },
    groupOrderBillSplit: {
      configured: isCfg('groupOrderBillSplit'),
      enabled: saved.groupOrderBillSplit?.enabled ?? false,
      maxPeople: saved.groupOrderBillSplit?.maxPeople ?? 10,
    },
    pickupInstantDiscount: {
      configured: isCfg('pickupInstantDiscount'),
      enabled: saved.pickupInstantDiscount?.enabled ?? false,
      title:
        saved.pickupInstantDiscount?.title ||
        (isStore ? 'خصم خاص للاستلام الذاتي من المعرض' : 'خصم خاص للاستلام الذاتي من المطعم'),
      discountPercent: saved.pickupInstantDiscount?.discountPercent ?? 10,
    },
    moodMealFinder: {
      configured: isCfg('moodMealFinder'),
      enabled: saved.moodMealFinder?.enabled ?? false,
      title:
        saved.moodMealFinder?.title ||
        (isStore ? 'مستشار التسوق الذكي — اختر الأنسب لاحتياجك!' : 'محتار شتاكل؟ خلّي مستشار المزاج يختارلك!'),
      buttonText:
        saved.moodMealFinder?.buttonText ||
        (isStore ? 'رشّح لي أفضل المنتجات ✨' : 'اختر لي وجبة حسب مزاجي ✨'),
    },
    curbsidePickupCar: {
      configured: isCfg('curbsidePickupCar'),
      enabled: saved.curbsidePickupCar?.enabled ?? false,
      instructions:
        saved.curbsidePickupCar?.instructions ||
        (isStore
          ? 'اركن سيارتك أمام المتجر واضغط وصلت ليخرج الموظف بتغليف طلبك'
          : 'اركن سيارتك أمام البوابة واضغط وصلت ليخرج الموظف إليك'),
      allowArrivedPing: saved.curbsidePickupCar?.allowArrivedPing ?? true,
    },
  };
}

export interface ActiveMenuDiscount {
  active: boolean;
  type: 'percent' | 'fixed';
  value: number;
  sourceLabel: string;
  sourceType?: 'countdown' | 'limitedTime' | 'happyHour';
}

export function getActiveMenuDiscount(
  addons?: RestaurantAddons,
  nowMs = Date.now()
): ActiveMenuDiscount {
  // 1. Countdown flash offer takes precedence if discountValue > 0
  if (addons?.countdownTimer?.enabled) {
    const val = Number(addons.countdownTimer.discountValue ?? 0);
    if (val > 0) {
      return {
        active: true,
        type: addons.countdownTimer.discountType === 'fixed' ? 'fixed' : 'percent',
        value: val,
        sourceLabel: addons.countdownTimer.title || 'عرض المؤقت',
        sourceType: 'countdown',
      };
    }
  }

  // 2. Limited-time discount (duration is hidden from customers)
  if (addons?.limitedTimeDiscount?.enabled) {
    const cfg = addons.limitedTimeDiscount;
    const pct = Math.min(95, Math.max(0, Number(cfg.discountPercent ?? 0)));
    if (pct > 0) {
      const days = Math.max(1, Number(cfg.durationDays ?? 1) || 1);
      const startsAt = Number(cfg.startsAt || 0);
      const expiresAt = Number(cfg.expiresAt || 0) || (startsAt > 0 ? startsAt + days * 86400000 : 0);
      if (!expiresAt || nowMs < expiresAt) {
        return {
          active: true,
          type: 'percent',
          value: pct,
          sourceLabel: 'خصم لمدة محدودة',
          sourceType: 'limitedTime',
        };
      }
    }
  }

  // 3. Happy Hour automatic time-window discount
  if (addons?.happyHour?.enabled) {
    const pct = Number(addons.happyHour.discountPercent ?? 0);
    if (pct > 0) {
      const hr = new Date(nowMs).getHours();
      const start = Number(addons.happyHour.startHour ?? 14);
      const end = Number(addons.happyHour.endHour ?? 17);
      const inWindow = start <= end ? hr >= start && hr < end : hr >= start || hr < end;
      if (inWindow) {
        return {
          active: true,
          type: 'percent',
          value: pct,
          sourceLabel: addons.happyHour.title || 'ساعة السعادة',
          sourceType: 'happyHour',
        };
      }
    }
  }

  return { active: false, type: 'percent', value: 0, sourceLabel: '' };
}

export function applyMenuPriceDiscount(rawPrice: number, discount: ActiveMenuDiscount): number {
  const base = Number(rawPrice) || 0;
  if (!discount.active || discount.value <= 0 || base <= 0) return base;
  if (discount.type === 'fixed') {
    return Math.max(0, base - discount.value);
  }
  return Math.max(0, Math.round(base * (1 - Math.min(95, discount.value) / 100)));
}
