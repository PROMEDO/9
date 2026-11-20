/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Car,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  Flame,
  Gift,
  GitBranch,
  Info,
  LayoutGrid,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Smile,
  Sparkles,
  Star,
  Store,
  Trash2,
  Truck,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import {
  Category,
  MenuItem,
  MenuItemBadge,
  MenuItemExtra,
  MenuItemSize,
  MenuThemeShape,
  Order,
  OrderItem,
  OrderType,
  Restaurant,
  RestaurantAddons,
  RestaurantReview,
  Session,
  WorkDayKey,
} from '../types';
import {
  applyPlatformTypography,
  formatNumber,
  getCollection,
  getItem,
  getPlans,
  getSite,
  getTheme,
  isRestaurantOpenNow,
  putItem,
  putItemAndSync,
  submitReviewToServer,
  syncFromServer,
  uid,
  waLink,
} from '../utils/storage';
import { ensureRestaurantDefaults } from '../utils/businessDefaults';
import { getBusinessTerms } from '../utils/terminology';
import { AppLogo } from '../components/AppLogo';
import { SeasonalHeroRibbon, SeasonalMenuOverlay } from '../components/SeasonalMenuDecor';

const ShareMenuModal = lazy(() =>
  import('../components/ShareMenuModal').then((m) => ({ default: m.ShareMenuModal }))
);
const EstoreStorefront = lazy(() =>
  import('../components/storefront/EstoreStorefront').then((m) => ({ default: m.EstoreStorefront }))
);
import {
  ActiveMenuDiscount,
  applyMenuPriceDiscount,
  getActiveMenuDiscount,
} from '../data/addonsCatalog';
import {
  MENU_THEMES,
  getContrastInk,
  getMenuThemeById,
  isAddonAllowedForPlan,
  resolveRestaurantPlan,
} from '../utils/plans';
import {
  CategoryAvailabilityResult,
  ItemAvailabilityResult,
  evaluateCategoryAvailability,
  evaluateItemAvailability,
  formatTime12,
} from '../utils/availability';

interface PublicMenuViewProps {
  restaurantId: string;
  session: Session | null;
  onNavigate: (hash: string) => void;
  showToast: (msg: string) => void;
}

interface PublicMenuContentProps extends PublicMenuViewProps {
  hasMultipleBranches: boolean;
  branchShortLabel: string;
  onOpenBranchPicker: () => void;
}

interface CartLine {
  key: string;
  itemId: string;
  name: string;
  catName?: string;
  unitPrice: number;
  origUnitPrice?: number;
  qty: number;
  size?: string;
  choices: string[];
  extras: string[];
  img?: string;
  notes?: string;
}

const DAY_LABELS: Array<{ key: WorkDayKey; label: string }> = [
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الإثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
  { key: 'sat', label: 'السبت' },
];

function getOptionPrice(opt: any): number {
  const val = Number(opt?.p ?? opt?.pr ?? opt?.price ?? 0);
  return Number.isFinite(val) ? val : 0;
}

function getSizeLabel(sz: any): string {
  if (typeof sz === 'string') return sz.trim();
  return String(sz?.n || sz?.label || sz?.name || '').trim();
}

function getChoiceLabel(ch: any): string {
  if (typeof ch === 'string') return ch.trim();
  return String(ch?.n || ch?.label || ch?.name || '').trim();
}

function getExtraLabel(ex: any): string {
  if (typeof ex === 'string') return ex.trim();
  return String(ex?.n || ex?.label || ex?.name || '').trim();
}

function formatMoneyValue(amount: number, currency: string): string {
  return `${formatNumber(amount)} ${currency}`;
}

function getPriceDisplay(
  it: MenuItem,
  currency: string,
  activeDiscount: ActiveMenuDiscount = { active: false, type: 'percent', value: 0, sourceLabel: '' },
  allowItemDiscounts = true
) {
  const validSizes = (it.sizes || []).filter((s) => getSizeLabel(s));
  if (validSizes.length > 0) {
    const rawPrices = validSizes.map((s) => getOptionPrice(s));
    const rawMin = Math.min(...rawPrices);
    const rawMax = Math.max(...rawPrices);
    const min = applyMenuPriceDiscount(rawMin, activeDiscount);
    const max = applyMenuPriceDiscount(rawMax, activeDiscount);
    const main =
      min !== max
        ? `${formatNumber(min)} - ${formatNumber(max)} ${currency}`
        : formatMoneyValue(min, currency);
    return {
      main,
      min,
      rawBefore: activeDiscount.active && min < rawMin ? rawMin : 0,
      savings: activeDiscount.active ? Math.max(0, rawMin - min) : 0,
    };
  }
  const rawPrice = Number(it.pr) || 0;
  const finalPrice = applyMenuPriceDiscount(rawPrice, activeDiscount);
  const compareBefore =
    activeDiscount.active && finalPrice < rawPrice
      ? Math.max(rawPrice, allowItemDiscounts ? Number(it.beforePrice) || 0 : 0)
      : allowItemDiscounts && it.beforePrice && it.beforePrice > rawPrice
      ? it.beforePrice
      : 0;
  const savings = compareBefore > finalPrice ? compareBefore - finalPrice : 0;
  return {
    main: formatMoneyValue(finalPrice, currency),
    min: finalPrice,
    rawBefore: compareBefore,
    savings,
  };
}

function parseCaloriesNum(raw?: string | number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const m = String(raw || '').match(/\d+/);
  return m ? Math.max(0, parseInt(m[0], 10)) : 0;
}

function renderBadge(badge: MenuItemBadge, idx: number) {
  const cls =
    badge.type === 'red'
      ? 'pm-badge red'
      : badge.type === 'gold'
      ? 'pm-badge gold'
      : badge.type === 'green'
      ? 'pm-badge green'
      : 'pm-badge accent';
  return (
    <span key={`${badge.text}-${idx}`} className={cls}>
      {badge.type === 'red' && <Flame size={11} />}
      {badge.type === 'gold' && <Sparkles size={11} />}
      {badge.text}
    </span>
  );
}

function getReadableAccent(hex: string): string {
  const clean = (hex || '').trim().replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance < 0.36) return '#34D399';
  }
  return hex || '#34D399';
}

function getTableFromUrl(): string {
  try {
    const searchTable = new URLSearchParams(window.location.search).get('table');
    if (searchTable) return searchTable;
    const hashMatch = window.location.hash.match(/table=([^&]+)/);
    if (hashMatch) return decodeURIComponent(hashMatch[1]);
  } catch {
    // ignore malformed URL
  }
  return '';
}

const PublicMenuContent: React.FC<PublicMenuContentProps> = ({
  restaurantId,
  session,
  onNavigate,
  showToast,
  hasMultipleBranches,
  branchShortLabel,
  onOpenBranchPicker,
}) => {
  const [syncTick, setSyncTick] = useState(0);

  useEffect(() => {
    let active = true;
    const refreshFromServer = () => {
      void syncFromServer().then((ok) => {
        if (ok && active) {
          applyPlatformTypography(getTheme());
          setSyncTick((prev) => prev + 1);
        }
      });
    };
    const handleDbUpdated = () => {
      if (active) {
        applyPlatformTypography(getTheme());
        setSyncTick((prev) => prev + 1);
      }
    };
    const handleFocus = () => {
      if (active) {
        setSyncTick((prev) => prev + 1);
        refreshFromServer();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };

    refreshFromServer();
    window.addEventListener('menuplus_db_updated', handleDbUpdated);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    const handleSchemeChange = () => {
      if (active) setSyncTick((prev) => prev + 1);
    };
    if (mq) {
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handleSchemeChange);
      else mq.addListener(handleSchemeChange);
    }

    return () => {
      active = false;
      window.removeEventListener('menuplus_db_updated', handleDbUpdated);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (mq) {
        if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', handleSchemeChange);
        else mq.removeListener(handleSchemeChange);
      }
    };
  }, [restaurantId]);

  const rawRest = getItem<Restaurant>(`restaurants/${restaurantId}`);
  const rest = rawRest ? ensureRestaurantDefaults(rawRest) : undefined;
  const resolvedPlan = resolveRestaurantPlan(rest, getPlans());
  const terms = getBusinessTerms(rest?.projectType);
  const ORDER_TYPE_META: Record<OrderType, { label: string; icon: React.ReactNode }> = {
    delivery: { label: 'توصيل', icon: <Truck size={15} /> },
    pickup: { label: terms.pickupLabel, icon: <Store size={15} /> },
    table: { label: terms.dineInOrBranchNote, icon: <Utensils size={15} /> },
  };
  const isEstore = terms.isStore;
  const activeTheme = getMenuThemeById(
    isEstore ? 'estore' : rest?.themePreset,
    isEstore ? 'light' : rest?.themeMode
  );
  const activeShape: MenuThemeShape = isEstore
    ? 'estore'
    : rest?.themeShape === 'silk' ||
      rest?.themeShape === 'editorial' ||
      rest?.themeShape === 'velvet' ||
      rest?.themeShape === 'luxe' ||
      rest?.themeShape === 'toters' ||
      rest?.themeShape === 'glass' ||
      rest?.themeShape === 'cartoon' ||
      rest?.themeShape === 'dreamy' ||
      rest?.themeShape === 'pill' ||
      rest?.themeShape === 'sharp' ||
      rest?.themeShape === 'bordered' ||
      rest?.themeShape === 'soft' ||
      rest?.themeShape === 'ramadan' ||
      rest?.themeShape === 'eid' ||
      rest?.themeShape === 'newyear'
    ? rest.themeShape
    : 'modern';
  const isToters = !isEstore && activeShape === 'toters';
  const isCustomPreset = !isEstore && rest?.themePreset === 'custom' && resolvedPlan.perms.customColors;
  const hasKnownPreset = Boolean(
    !isEstore &&
    rest?.themePreset &&
    rest.themePreset !== 'custom' &&
    MENU_THEMES.some((t) => t.id === rest.themePreset)
  );
  const currency = String(rest?.currency || 'د.ع').trim();
  const brandColor = isEstore
    ? '#222222'
    : isCustomPreset
    ? (rest?.color || activeTheme.brand)
    : hasKnownPreset
    ? activeTheme.brand
    : (resolvedPlan.perms.customColors && rest?.color ? rest.color : activeTheme.brand);
  const customBgColor = isEstore
    ? '#ffffff'
    : isCustomPreset && rest?.bgColor
    ? rest.bgColor
    : rest?.themeMode === 'auto'
    ? activeTheme.bg
    : resolvedPlan.perms.customColors && rest?.bgColor
    ? rest.bgColor
    : activeTheme.bg;
  const isLightMenu = isEstore
    ? true
    : isCustomPreset && rest?.bgColor
    ? getContrastInk(rest.bgColor) === '#0f172a'
    : activeTheme.mode === 'light';
  const effectiveSurface = isEstore
    ? '#ffffff'
    : isCustomPreset && rest?.bgColor
    ? isLightMenu
      ? `color-mix(in srgb, ${customBgColor} 35%, #ffffff)`
      : `color-mix(in srgb, ${customBgColor} 80%, #ffffff)`
    : activeTheme.surface;
  const effectiveSurfaceSoft = isEstore
    ? '#f8f8f8'
    : isCustomPreset && rest?.bgColor
    ? isLightMenu
      ? `color-mix(in srgb, ${customBgColor} 88%, #0f172a)`
      : `color-mix(in srgb, ${customBgColor} 88%, #ffffff)`
    : activeTheme.surfaceSoft;
  const effectiveInk = isEstore
    ? '#222222'
    : isCustomPreset && rest?.bgColor
    ? isLightMenu
      ? '#0f172a'
      : '#f8fafc'
    : activeTheme.text;
  const effectiveMuted = isEstore
    ? '#7e7e7e'
    : isCustomPreset && rest?.bgColor
    ? isLightMenu
      ? '#475569'
      : '#94a3b8'
    : activeTheme.muted;
  const effectiveLine = isEstore
    ? '#eaeaea'
    : isCustomPreset && rest?.bgColor
    ? isLightMenu
      ? 'rgba(15, 23, 42, 0.14)'
      : 'rgba(255, 255, 255, 0.15)'
    : activeTheme.line;
  const accentText = isEstore ? '#222222' : isLightMenu ? brandColor : getReadableAccent(brandColor);
  const brandInk = isEstore ? '#ffffff' : getContrastInk(brandColor);

  const rawAddons = rest?.addons || {};
  const addons = useMemo<RestaurantAddons>(() => {
    const filtered: Record<string, any> = {};
    Object.keys(rawAddons).forEach((k) => {
      if (isAddonAllowedForPlan(k, resolvedPlan) || (isToters && k === 'loyaltyPoints')) {
        filtered[k] = (rawAddons as Record<string, any>)[k];
      }
    });
    return filtered as RestaurantAddons;
  }, [rawAddons, resolvedPlan, isToters]);

  // Available order types (gated by plan permissions + restaurant toggles)
  const enabledTypes = useMemo<OrderType[]>(() => {
    const cfg = rest?.enabledOrderTypes;
    const list: OrderType[] = [];
    if (resolvedPlan.perms.deliveryOrders && cfg?.delivery !== false) list.push('delivery');
    if (resolvedPlan.perms.pickupOrders && cfg?.pickup !== false) list.push('pickup');
    if (resolvedPlan.perms.tableOrders && cfg?.table === true) list.push('table');
    if (list.length === 0) {
      if (resolvedPlan.perms.deliveryOrders) list.push('delivery');
      else if (resolvedPlan.perms.pickupOrders) list.push('pickup');
      else if (resolvedPlan.perms.tableOrders) list.push('table');
      else list.push('delivery');
    }
    return list;
  }, [
    rest?.enabledOrderTypes,
    resolvedPlan.perms.deliveryOrders,
    resolvedPlan.perms.pickupOrders,
    resolvedPlan.perms.tableOrders,
  ]);

  const [orderType, setOrderType] = useState<OrderType>('delivery');

  useEffect(() => {
    if (!enabledTypes.includes(orderType)) {
      setOrderType(enabledTypes[0]);
    }
  }, [enabledTypes, orderType]);

  // Storefront SEO: Dynamic title, meta description, canonical & Schema.org Restaurant + Menu JSON-LD
  useEffect(() => {
    if (typeof document === 'undefined' || !rest) return;
    const storeName = rest.n || 'منيو إلكتروني';
    const title = `${storeName} – المنيو الإلكتروني | منيو بلس`;
    const desc =
      (rest.tagline || rest.aboutText || '').trim() ||
      `تصفح قائمة الطعام والمنتجات لـ ${storeName} واطلب مباشرة عبر واتساب بسرعة وسهولة.`;
    document.title = title;

    const upsertMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    upsertMeta('name', 'description', desc);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', desc);
    const embedIconUrl = `${window.location.origin}/assets/aistudio/icon_f95f5a07.png`;
    upsertMeta('property', 'og:image', embedIconUrl);
    upsertMeta('name', 'twitter:image', embedIconUrl);

    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const restCats = getCollection<Category>('cats').filter((c) => c.rid === restaurantId && c.published !== false);
    const restItems = getCollection<MenuItem>('items').filter(
      (i) => i.rid === restaurantId && i.published !== false && i.available !== false
    );

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: storeName,
      description: desc,
      url: canonicalUrl,
      ...(rest.logo ? { image: rest.logo } : {}),
      ...(rest.ph ? { telephone: rest.ph } : {}),
      hasMenu: {
        '@type': 'Menu',
        name: `قائمة ${storeName}`,
        hasMenuSection: restCats.slice(0, 10).map((cat) => ({
          '@type': 'MenuSection',
          name: cat.n,
          hasMenuItem: restItems
            .filter((it) => it.cat === cat.id)
            .slice(0, 12)
            .map((it) => ({
              '@type': 'MenuItem',
              name: it.n,
              ...(it.d ? { description: it.d } : {}),
              offers: {
                '@type': 'Offer',
                price: String(Number(it.pr) || 0),
                priceCurrency: currency === 'د.ع' ? 'IQD' : 'USD',
              },
            })),
        })),
      },
    };

    let ldEl = document.getElementById('mp-store-jsonld') as HTMLScriptElement | null;
    if (!ldEl) {
      ldEl = document.createElement('script');
      ldEl.id = 'mp-store-jsonld';
      ldEl.type = 'application/ld+json';
      document.head.appendChild(ldEl);
    }
    ldEl.textContent = JSON.stringify(schema);
  }, [rest?.id, rest?.n, rest?.tagline, rest?.aboutText, rest?.logo, rest?.ph, currency, restaurantId]);

  // Carousel banner index
  const [bannerIdx, setBannerIdx] = useState(0);
  const coverImages = (rest?.coverImages || []).filter(Boolean);
  useEffect(() => {
    if (coverImages.length <= 1) return;
    const timer = setInterval(() => {
      setBannerIdx((i) => (i + 1) % coverImages.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [coverImages.length]);

  // Live countdown timer, Happy Hour & scheduled item/category availability tick
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasScheduledMenuEntries = useMemo(() => {
    const hasScheduledCat = getCollection<Category>('cats').some(
      (c) => c.rid === restaurantId && c.availabilitySchedule?.enabled
    );
    if (hasScheduledCat) return true;
    return getCollection<MenuItem>('items').some(
      (i) => i.rid === restaurantId && i.availabilitySchedule?.enabled
    );
  }, [restaurantId, rest?.id]);

  useEffect(() => {
    const fastTick = Boolean(addons.countdownTimer?.enabled || addons.happyHour?.enabled);
    if (!fastTick && !hasScheduledMenuEntries) return;
    const timer = setInterval(() => setNowMs(Date.now()), fastTick ? 1000 : 20000);
    return () => clearInterval(timer);
  }, [addons.countdownTimer?.enabled, addons.happyHour?.enabled, hasScheduledMenuEntries]);

  // Interactive Addons State (Spin Wheel, Cutlery, Bill Split, Mood Finder, Curbside)
  const [hasOrderedBefore, setHasOrderedBefore] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`emenu_ordered_${restaurantId}`) === '1';
    } catch {
      return false;
    }
  });
  const [loyaltyBalance, setLoyaltyBalance] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(`emenu_points_${restaurantId}`) || 0);
    } catch {
      return 0;
    }
  });
  const [lastSavedOrderCart, setLastSavedOrderCart] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(`emenu_last_order_${restaurantId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [needCutlery, setNeedCutlery] = useState(true);
  const [splitPeople, setSplitPeople] = useState(1);
  const [moodModalOpen, setMoodModalOpen] = useState(false);
  const [selectedMood, setSelectedMood] = useState<'fast' | 'light' | 'spicy' | 'sweet'>('fast');
  const [curbsideCarInfo, setCurbsideCarInfo] = useState('');

  // Spin Wheel Modal State
  const [spinModalOpen, setSpinModalOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelDeg, setWheelDeg] = useState(0);
  const [spinWonReward, setSpinWonReward] = useState<{ label: string; percent: number; freeDelivery: boolean } | null>(() => {
    try {
      const raw = sessionStorage.getItem(`emenu_spin_${restaurantId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Modals & Popups state
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [catsModalOpen, setCatsModalOpen] = useState(false);
  const [orderTypeModalOpen, setOrderTypeModalOpen] = useState(false);
  const [workModalOpen, setWorkModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [rateModalOpen, setRateModalOpen] = useState(false);

  // Offer popup (shown on every page refresh when enabled)
  const offerPopupCfg = addons.offerPopup || rest?.offerPopup;
  const offerPopupMode: 'ad' | 'dish' = offerPopupCfg?.mode === 'dish' ? 'dish' : 'ad';
  const offerPopupItemId = offerPopupMode === 'dish' ? String(offerPopupCfg?.itemId || '').trim() : '';
  const offerPopupBadge = String(offerPopupCfg?.badgeText || '').trim();
  const offerPopupSpecialPrice =
    offerPopupMode === 'dish' &&
    offerPopupCfg?.specialPrice !== undefined &&
    offerPopupCfg?.specialPrice !== null &&
    String(offerPopupCfg.specialPrice).trim() !== '' &&
    Number.isFinite(Number(offerPopupCfg.specialPrice))
      ? Math.max(0, Number(offerPopupCfg.specialPrice))
      : undefined;
  const offerPopupLinkedItem = useMemo(() => {
    if (offerPopupMode !== 'dish' || !offerPopupItemId) return null;
    return (
      getCollection<MenuItem>('items').find(
        (it) => it.id === offerPopupItemId && it.rid === restaurantId && it.published !== false && it.available !== false
      ) || null
    );
  }, [offerPopupMode, offerPopupItemId, restaurantId, rest?.id]);
  const offerPopupTitle =
    offerPopupCfg?.title || (offerPopupMode === 'dish' ? offerPopupLinkedItem?.n : '') || '';
  const offerPopupSubtitle =
    offerPopupCfg?.subtitle || (offerPopupMode === 'dish' ? offerPopupLinkedItem?.d : '') || '';
  const offerPopupImage =
    offerPopupCfg?.image || (offerPopupMode === 'dish' ? offerPopupLinkedItem?.img : '') || '';
  const rawOfferPopupBtnText = String(offerPopupCfg?.buttonText || '').trim();
  const offerPopupBtnText =
    offerPopupMode === 'dish'
      ? !rawOfferPopupBtnText ||
        rawOfferPopupBtnText === 'إغلاق' ||
        rawOfferPopupBtnText === 'تصفح المنيو واطلب الآن' ||
        rawOfferPopupBtnText === 'تصفح المنيو'
        ? 'إضافة إلى السلة'
        : rawOfferPopupBtnText
      : !rawOfferPopupBtnText ||
        rawOfferPopupBtnText === 'إضافة إلى السلة' ||
        rawOfferPopupBtnText === 'تصفح المنيو واطلب الآن' ||
        rawOfferPopupBtnText === 'تصفح المنيو'
      ? 'إغلاق'
      : rawOfferPopupBtnText;
  const offerPopupEnabled =
    resolvedPlan.perms.popupAd &&
    (addons.offerPopup ? addons.offerPopup.enabled === true : rest?.offerPopup?.enabled === true);

  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const shownOfferOnMountRef = useRef<string>('');
  useEffect(() => {
    if (!offerPopupEnabled || !offerPopupTitle) {
      setOfferModalOpen(false);
      return;
    }
    if (shownOfferOnMountRef.current === restaurantId) return;
    shownOfferOnMountRef.current = restaurantId;
    const timer = setTimeout(() => {
      setOfferModalOpen(true);
    }, 320);
    return () => clearTimeout(timer);
  }, [restaurantId, offerPopupEnabled, offerPopupTitle]);

  // Active category tracking
  const [activeCatId, setActiveCatId] = useState<string>('');
  const [estoreCatFilter, setEstoreCatFilter] = useState<string>('all');

  // Auto-update active category highlight on scroll and bring active chip into view without scrolling the whole page
  useEffect(() => {
    const onScroll = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>('section[id^="mc-"]'));
      if (sections.length === 0) return;
      let currentId = sections[0].id.replace('mc-', '');
      for (const sec of sections) {
        const rect = sec.getBoundingClientRect();
        if (rect.top <= 165) {
          currentId = sec.id.replace('mc-', '');
        }
      }
      setActiveCatId((prev) => (prev === currentId ? prev : currentId));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!activeCatId) return;
    const strip = document.querySelector<HTMLElement>('.pm-cat-strip');
    const chip = document.querySelector<HTMLElement>(`.pm-cat-chip[data-cat-id="${activeCatId}"]`);
    if (strip && chip) {
      const chipLeft = chip.offsetLeft;
      const chipWidth = chip.offsetWidth;
      const stripWidth = strip.clientWidth;
      strip.scrollTo({
        left: chipLeft - stripWidth / 2 + chipWidth / 2,
        behavior: 'smooth',
      });
    }
  }, [activeCatId]);

  // Product Detail Modal State
  const [activeProduct, setActiveProduct] = useState<MenuItem | null>(null);
  const [selectedSize, setSelectedSize] = useState<MenuItemSize | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
  const [selectedExtras, setSelectedExtras] = useState<MenuItemExtra[]>([]);
  const [modalQty, setModalQty] = useState(1);
  const [modalItemNote, setModalItemNote] = useState('');
  const [allergensOpen, setAllergensOpen] = useState(false);

  // Cart & Checkout State (Persisted in localStorage so cart items are never lost)
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const saved = localStorage.getItem(`menuplus_cart_${restaurantId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback to empty
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(`menuplus_cart_${restaurantId}`, JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart, restaurantId]);

  useEffect(() => {
    if (orderType === 'table') return;
    const dineInOnlyIds = new Set(
      getCollection<MenuItem>('items')
        .filter((i) => i.rid === restaurantId && i.dineInOnly)
        .map((i) => i.id)
    );
    if (dineInOnlyIds.size === 0) return;
    setCart((prev) => {
      const next = prev.filter((line) => !dineInOnlyIds.has(line.itemId));
      return next.length === prev.length ? prev : next;
    });
  }, [orderType, restaurantId, syncTick]);

  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'details' | 'done'>('cart');
  const [selectedAreaIdx, setSelectedAreaIdx] = useState<number>(0);
  const [selectedCityIdx, setSelectedCityIdx] = useState<number>(0);

  // Cross-menu saved customer details (auto-filled across all restaurant menus; GPS stays live per visit)
  const readSharedCustomerProfile = () => {
    const out = { name: '', phone: '', address: '', notes: '' };
    if (typeof window === 'undefined') return out;
    try {
      const rawCookie = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('mp_cust_profile='));
      if (rawCookie) {
        const parsedCookie = JSON.parse(decodeURIComponent(rawCookie.slice('mp_cust_profile='.length)));
        if (parsedCookie && typeof parsedCookie === 'object') {
          if (typeof parsedCookie.name === 'string') out.name = parsedCookie.name;
          if (typeof parsedCookie.phone === 'string') out.phone = parsedCookie.phone;
          if (typeof parsedCookie.address === 'string') out.address = parsedCookie.address;
          if (typeof parsedCookie.notes === 'string') out.notes = parsedCookie.notes;
        }
      }
    } catch {
      // ignore cookie parse error
    }
    try {
      const rawLocal = localStorage.getItem('menuplus_shared_customer_profile_v1');
      if (rawLocal) {
        const parsedLocal = JSON.parse(rawLocal);
        if (parsedLocal && typeof parsedLocal === 'object') {
          if (!out.name && typeof parsedLocal.name === 'string') out.name = parsedLocal.name;
          if (!out.phone && typeof parsedLocal.phone === 'string') out.phone = parsedLocal.phone;
          if (!out.address && typeof parsedLocal.address === 'string') out.address = parsedLocal.address;
          if (!out.notes && typeof parsedLocal.notes === 'string') out.notes = parsedLocal.notes;
        }
      }
    } catch {
      // ignore storage error
    }
    return out;
  };

  const initialSharedProfile = useMemo(() => readSharedCustomerProfile(), []);
  const [customerName, setCustomerName] = useState(initialSharedProfile.name);
  const [customerPhone, setCustomerPhone] = useState(initialSharedProfile.phone);
  const [customerAddress, setCustomerAddress] = useState(initialSharedProfile.address);
  const [customerNotes, setCustomerNotes] = useState(initialSharedProfile.notes);
  const [profileAutoFilled, setProfileAutoFilled] = useState(() =>
    Boolean(initialSharedProfile.name || initialSharedProfile.phone || initialSharedProfile.address)
  );
  const profileSyncTimerRef = useRef<number | null>(null);
  const persistSharedProfile = useCallback(
    (profile: { name: string; phone: string; address: string; notes: string }, syncServerNow = false) => {
      const clean = {
        name: profile.name.trim(),
        phone: profile.phone.trim(),
        address: profile.address.trim(),
        notes: profile.notes.trim(),
      };
      try {
        localStorage.setItem('menuplus_shared_customer_profile_v1', JSON.stringify(clean));
      } catch {
        // ignore storage error
      }
      try {
        const siteBase = getSite().baseDomain?.trim().toLowerCase() || '';
        const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
        const domainAttr =
          siteBase && (host === siteBase || host.endsWith(`.${siteBase}`))
            ? `; Domain=.${siteBase}`
            : '';
        const secureAttr = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `mp_cust_profile=${encodeURIComponent(
          JSON.stringify(clean)
        )}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${domainAttr}${secureAttr}`;
      } catch {
        // ignore cookie error
      }
      if (syncServerNow) {
        void fetch('/api/customer-profile', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clean),
        }).catch(() => {});
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    void fetch('/api/customer-profile', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { profile?: { name?: string; phone?: string; address?: string; notes?: string } | null } | null) => {
        if (!active || !data?.profile) return;
        const p = data.profile;
        let filledAny = false;
        if (p.name) {
          setCustomerName((prev) => prev || p.name || '');
          filledAny = true;
        }
        if (p.phone) {
          setCustomerPhone((prev) => prev || p.phone || '');
          filledAny = true;
        }
        if (p.address) {
          setCustomerAddress((prev) => prev || p.address || '');
          filledAny = true;
        }
        if (p.notes) {
          setCustomerNotes((prev) => prev || p.notes || '');
        }
        if (filledAny) setProfileAutoFilled(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!customerName && !customerPhone && !customerAddress && !customerNotes) return;
    if (profileSyncTimerRef.current !== null) {
      window.clearTimeout(profileSyncTimerRef.current);
    }
    const snapshot = {
      name: customerName,
      phone: customerPhone,
      address: customerAddress,
      notes: customerNotes,
    };
    persistSharedProfile(snapshot, false);
    profileSyncTimerRef.current = window.setTimeout(() => {
      profileSyncTimerRef.current = null;
      persistSharedProfile(snapshot, true);
    }, 550);
    return () => {
      if (profileSyncTimerRef.current !== null) {
        window.clearTimeout(profileSyncTimerRef.current);
      }
    };
  }, [customerName, customerPhone, customerAddress, customerNotes, persistSharedProfile]);

  const [selectedTable, setSelectedTable] = useState<string>(() => getTableFromUrl());
  const [gpsCoords, setGpsCoords] = useState<{ lat: string; lng: string } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [lastOrderSummary, setLastOrderSummary] = useState<{
    id: string;
    orderSeq?: number;
    waUrl: string;
    total: number;
    items: OrderItem[];
    channel?: 'both' | 'telegram' | 'whatsapp';
  } | null>(null);

  // Rating Form State
  const [revName, setRevName] = useState('');
  const [revPhone, setRevPhone] = useState('');
  const [revRate, setRevRate] = useState(5);
  const [revComment, setRevComment] = useState('');

  // Only show owner controls if logged in as the menu owner (including demo/admin previewing their menu or any child branch)
  const isOwner = Boolean(
    session &&
    (
      (session.admin && !session.menuLoggedOut) ||
      session.rid === restaurantId ||
      session.personalRid === restaurantId ||
      (rest?.parentRid && (session.rid === rest.parentRid || session.personalRid === rest.parentRid))
    )
  );

  if (!rest || (rest.a === 0 && !isOwner)) {
    return (
      <div className="wz" dir="rtl" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h1 style={{ fontSize: '26px', marginBottom: '10px' }}>
          {isEstore ? 'المتجر غير متاح' : 'المنيو غير متاح'}
        </h1>
        <p className="muted" style={{ marginBottom: '20px' }}>
          {isEstore
            ? 'هذا المتجر غير موجود أو موقوف حالياً من قِبل الإدارة.'
            : 'هذا المنيو غير موجود أو موقوف حالياً من قِبل الإدارة.'}
        </p>
        <button type="button" className="btn p" onClick={() => onNavigate('/')}>
          العودة للرئيسية
        </button>
      </div>
    );
  }

  const orderChannel: 'both' | 'telegram' | 'whatsapp' =
    rest.orderChannel === 'both' || rest.orderChannel === 'telegram' || rest.orderChannel === 'whatsapp'
      ? rest.orderChannel
      : rest.telegramNotificationsEnabled === false
      ? 'whatsapp'
      : 'both';
  const useWhatsapp = orderChannel === 'both' || orderChannel === 'whatsapp';

  const nowDate = new Date(nowMs);
  const rawCatsForRest = getCollection<Category>('cats')
    .filter((c) => c.rid === restaurantId && c.published !== false)
    .filter((c) => {
      if (orderType === 'delivery' && c.noDelivery) return false;
      if (orderType === 'pickup' && c.noPickup) return false;
      return true;
    })
    .sort((a, b) => (a.o || 0) - (b.o || 0));

  const rawCatById = new Map<string, Category>(rawCatsForRest.map((c) => [c.id, c]));
  const categoryEvalMap = new Map<string, CategoryAvailabilityResult>();
  rawCatsForRest.forEach((c) => {
    categoryEvalMap.set(c.id, evaluateCategoryAvailability(c, nowDate));
  });

  const allCategories = rawCatsForRest.filter((c) => !categoryEvalMap.get(c.id)?.hidden);

  const rawItemsForRest = getCollection<MenuItem>('items')
    .filter((i) => i.rid === restaurantId && i.published !== false && i.available !== false)
    .filter((i) => {
      if (i.dineInOnly) return true;
      if (orderType === 'delivery' && i.noDelivery) return false;
      if (orderType === 'pickup' && i.noPickup) return false;
      return true;
    })
    .sort((a, b) => (a.o || 0) - (b.o || 0));

  const itemEvalMap = new Map<string, ItemAvailabilityResult>();
  const allItems = rawItemsForRest.filter((i) => {
    const parentCat = rawCatById.get(i.cat);
    const evalRes = evaluateItemAvailability(i, parentCat, nowDate);
    itemEvalMap.set(i.id, evalRes);
    return !evalRes.hidden;
  });

  const openNow = isRestaurantOpenNow(rest);
  const canOrderNow = openNow || Boolean(rest.acceptOrdersWhenClosed);
  const rawLay = rest.lay;
  const layout: 'grid4' | 'grid3' | 'grid' | 'list' =
    rawLay === 'grid4' || rawLay === 'cards'
      ? 'grid4'
      : rawLay === 'grid3'
      ? 'grid3'
      : rawLay === 'grid'
      ? 'grid'
      : 'list';

  // Active automatic menu discount (Countdown Timer discount OR Happy Hour discount)
  const activeMenuDiscount = useMemo(() => getActiveMenuDiscount(addons, nowMs), [addons, nowMs]);

  const [serverPopularCounts, setServerPopularCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    if (!restaurantId) {
      setServerPopularCounts({});
      return;
    }
    fetch(`/api/public/popular-items/${encodeURIComponent(restaurantId)}`, {
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data || typeof data.counts !== 'object' || !data.counts) return;
        setServerPopularCounts(data.counts as Record<string, number>);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [restaurantId, syncTick, lastOrderSummary?.id]);

  // Real order frequency map per item name strictly from database orders
  const itemOrderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    Object.entries(serverPopularCounts).forEach(([k, val]) => {
      const key = String(k || '').trim().toLowerCase();
      const qty = Math.max(0, Number(val) || 0);
      if (key && qty > 0) counts.set(key, qty);
    });

    const localCounts = new Map<string, number>();
    const restOrders = getCollection<Order>('orders').filter(
      (o) => o.rid === restaurantId && o.st !== 'cancelled' && o.status !== 'cancelled'
    );
    restOrders.forEach((o) => {
      (o.items || []).forEach((line) => {
        const key = String(line.n || '').trim().toLowerCase();
        if (!key) return;
        localCounts.set(key, (localCounts.get(key) || 0) + Math.max(1, Number(line.q) || 1));
      });
    });

    localCounts.forEach((qty, key) => {
      const existing = counts.get(key) || 0;
      if (qty > existing) counts.set(key, qty);
    });

    return counts;
  }, [restaurantId, serverPopularCounts, syncTick, lastOrderSummary?.id]);

  // Real database-backed most-ordered ranking (only items with actual DB orders)
  const { mostOrderedItems, popularItemIds } = useMemo(() => {
    const ranked = allItems
      .map((it) => ({
        it,
        qty: itemOrderCounts.get(it.n.trim().toLowerCase()) || 0,
      }))
      .filter((entry) => entry.qty > 0)
      .sort((a, b) => b.qty - a.qty);

    const topIds = new Set<string>();
    if (ranked.length > 0) {
      const cutoffIdx = Math.min(2, ranked.length - 1);
      const minTopQty = ranked[cutoffIdx].qty;
      ranked.forEach((entry, idx) => {
        if (idx <= cutoffIdx || entry.qty >= minTopQty) {
          topIds.add(entry.it.id);
        }
      });
    }

    return {
      mostOrderedItems: ranked.map((entry) => entry.it),
      popularItemIds: topIds,
    };
  }, [allItems, itemOrderCounts]);

  // Cart totals, discounts, minOrder & Free delivery calculation
  const totalCount = cart.reduce((s, line) => s + line.qty, 0);
  const subtotal = cart.reduce((s, line) => s + line.unitPrice * line.qty, 0);

  const deliveryZones = rest.deliveryZones || [];
  const safeAreaIdx = Math.min(Math.max(0, selectedAreaIdx), Math.max(0, deliveryZones.length - 1));
  const activeZone = deliveryZones[safeAreaIdx];
  const zoneCities = activeZone?.cities || [];
  const safeCityIdx = Math.min(Math.max(0, selectedCityIdx), Math.max(0, zoneCities.length - 1));
  const activeCity = zoneCities[safeCityIdx];
  const hasMultipleSubCities =
    zoneCities.length > 1 ||
    (zoneCities.length === 1 && zoneCities[0].name.trim() !== activeZone?.area?.trim());
  const rawDeliveryFee =
    orderType === 'delivery' && activeZone
      ? Number(activeCity?.fee ?? (activeZone as { fee?: number }).fee ?? 0) || 0
      : 0;

  const freeDeliveryEnabled = Boolean(addons.freeDeliveryProgress?.enabled);
  const freeDeliveryMin = freeDeliveryEnabled
    ? Math.max(0, Number(addons.freeDeliveryProgress?.minAmount ?? 0) || 0)
    : 0;
  const spinFreeDelivery = Boolean(addons.spinWheelPromo?.enabled && spinWonReward?.freeDelivery);
  const qualifiesFreeDelivery =
    orderType === 'delivery' &&
    ((freeDeliveryEnabled && freeDeliveryMin > 0 && subtotal >= freeDeliveryMin) || spinFreeDelivery);
  const effectiveDeliveryFee = qualifiesFreeDelivery ? 0 : rawDeliveryFee;

  // First-order discount & Spin wheel percent discount
  const firstOrderPct =
    addons.firstOrderDiscount?.enabled && !hasOrderedBefore
      ? Math.max(0, Math.min(90, Number(addons.firstOrderDiscount.discountPercent) || 0))
      : 0;
  const firstOrderDiscountAmt =
    firstOrderPct > 0 ? Math.round((subtotal * firstOrderPct) / 100) : 0;

  const spinPct =
    addons.spinWheelPromo?.enabled && spinWonReward && spinWonReward.percent > 0
      ? spinWonReward.percent
      : 0;
  const spinDiscountAmt =
    spinPct > 0
      ? Math.round((Math.max(0, subtotal - firstOrderDiscountAmt) * spinPct) / 100)
      : 0;

  // Free Gift Threshold
  const freeGiftEnabled = Boolean(addons.freeGiftThreshold?.enabled && addons.freeGiftThreshold.giftName);
  const freeGiftMin = Number(addons.freeGiftThreshold?.minAmount || 0);
  const qualifiesFreeGift = freeGiftEnabled && subtotal >= freeGiftMin;
  const freeGiftPct = freeGiftMin > 0 ? Math.min(100, Math.round((subtotal / freeGiftMin) * 100)) : 100;

  // Loyalty points
  const earnedLoyaltyPoints = addons.loyaltyPoints?.enabled
    ? Math.max(1, Math.floor((subtotal / 1000) * (Number(addons.loyaltyPoints.pointsPerThousand) || 1)))
    : 0;

  // Min order addon
  const minOrderEnabled =
    addons.minOrder?.enabled === true && Number(addons.minOrder.amount) > 0;
  const minOrderAmount = minOrderEnabled ? Number(addons.minOrder?.amount) || 0 : 0;
  const belowMinOrder = minOrderEnabled && subtotal < minOrderAmount;

  const fmtMoney = (amt: number) => formatMoneyValue(amt, currency);

  // Pickup Instant Discount
  const pickupPct =
    addons.pickupInstantDiscount?.enabled && orderType === 'pickup'
      ? Math.max(0, Math.min(60, Number(addons.pickupInstantDiscount.discountPercent) || 10))
      : 0;
  const pickupDiscountAmt =
    pickupPct > 0
      ? Math.round((Math.max(0, subtotal - firstOrderDiscountAmt - spinDiscountAmt) * pickupPct) / 100)
      : 0;

  const finalTotal =
    Math.max(
      0,
      subtotal -
        firstOrderDiscountAmt -
        spinDiscountAmt -
        pickupDiscountAmt
    ) +
    effectiveDeliveryFee;

  const freeDeliveryRemaining = Math.max(0, freeDeliveryMin - subtotal);
  const freeDeliveryPct =
    freeDeliveryMin > 0 ? Math.min(100, Math.round((subtotal / freeDeliveryMin) * 100)) : 0;

  const reviewsEnabled = addons.customerReviews?.enabled === true;
  const reviewsAllowSubmit = reviewsEnabled && addons.customerReviews?.allowSubmit !== false;
  const reviewsShowOnMenu = reviewsEnabled && addons.customerReviews?.showOnMenu !== false;
  const restaurantReviews = rest.reviews || [];

  // Live countdown timer string
  const countdownDisplay = useMemo(() => {
    if (!addons.countdownTimer?.enabled) return null;
    const endHour = Math.min(23, Math.max(0, Number(addons.countdownTimer.endHour ?? 23)));
    const target = new Date(nowMs);
    target.setHours(endHour, 59, 59, 999);
    if (target.getTime() <= nowMs) {
      target.setDate(target.getDate() + 1);
    }
    const diffSec = Math.max(0, Math.floor((target.getTime() - nowMs) / 1000));
    const hrs = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [addons.countdownTimer?.enabled, addons.countdownTimer?.endHour, nowMs]);

  // Helpers
  const getItemCartQty = (itemId: string) =>
    cart.filter((c) => c.itemId === itemId).reduce((s, c) => s + c.qty, 0);

  const isDisplayOnlyItem = (it: MenuItem) => Boolean(it.dineInOnly && orderType !== 'table');

  const getItemOriginalBaseUnit = (it: MenuItem, sizeOpt?: MenuItemSize | null): number => {
    if (sizeOpt) {
      return getOptionPrice(sizeOpt);
    }
    const rawBase = Number(it.pr) || 0;
    if (resolvedPlan.perms.itemDiscounts && it.beforePrice && Number(it.beforePrice) > rawBase) {
      return Number(it.beforePrice);
    }
    return rawBase;
  };

  const openProductModal = (it: MenuItem) => {
    const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, rawCatById.get(it.cat), nowDate);
    if (!itemEval.available && !isDisplayOnlyItem(it)) {
      showToast(itemEval.reasonText || 'هذا الصنف غير متوفر حالياً');
      return;
    }
    const validSizes = (it.sizes || [])
      .map((s) => ({ ...s, n: getSizeLabel(s), p: getOptionPrice(s) }))
      .filter((s) => s.n);
    setActiveProduct(it);
    setSelectedSize(validSizes.length > 0 ? validSizes[0] : null);
    setSelectedChoices([]);
    setSelectedExtras([]);
    setModalQty(1);
    setModalItemNote('');
    setAllergensOpen(false);
  };

  const quickAddOrOpenModal = (it: MenuItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isDisplayOnlyItem(it)) {
      return;
    }
    const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, rawCatById.get(it.cat), nowDate);
    if (!itemEval.available) {
      showToast(itemEval.reasonText || 'هذا الصنف غير متوفر حالياً');
      return;
    }
    const hasSizes = (it.sizes || []).some((s) => Boolean(getSizeLabel(s)));
    const hasChoices = (it.choices || []).some((c) => Boolean(getChoiceLabel(c)));
    const hasExtras = (it.extras || []).some((x) => Boolean(getExtraLabel(x)));
    if (hasSizes || hasChoices || hasExtras) {
      openProductModal(it);
      return;
    }
    const catObj = allCategories.find((c) => c.id === it.cat);
    const key = `${it.id}|||`;
    const discountedUnit = applyMenuPriceDiscount(Number(it.pr) || 0, activeMenuDiscount);
    const origUnit = getItemOriginalBaseUnit(it, null);
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      if (idx >= 0) {
        return prev.map((x, i) =>
          i === idx ? { ...x, qty: x.qty + 1, unitPrice: discountedUnit, origUnitPrice: origUnit } : x
        );
      }
      return [
        ...prev,
        {
          key,
          itemId: it.id,
          name: it.n,
          catName: catObj?.n,
          unitPrice: discountedUnit,
          origUnitPrice: origUnit,
          qty: 1,
          choices: [],
          extras: [],
          img: it.img,
        },
      ];
    });
    showToast(`تمت إضافة "${it.n}" للسلة`);
  };

  const decrementItemFromCart = (itemId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCart((prev) => {
      let targetIdx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].itemId === itemId) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx === -1) return prev;
      const target = prev[targetIdx];
      if (target.qty <= 1) {
        return prev.filter((_, i) => i !== targetIdx);
      }
      return prev.map((line, i) => (i === targetIdx ? { ...line, qty: line.qty - 1 } : line));
    });
  };

  const addSpecialCustomLine = (id: string, name: string, price: number, notes?: string, img?: string) => {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.key === id);
      if (idx >= 0) {
        return prev.map((x, i) => (i === idx ? { ...x, qty: x.qty + 1, unitPrice: price } : x));
      }
      return [
        ...prev,
        {
          key: id,
          itemId: id,
          name,
          unitPrice: price,
          origUnitPrice: price,
          qty: 1,
          choices: [],
          extras: [],
          img,
          notes,
        },
      ];
    });
    showToast(`تمت إضافة "${name}" للسلة ✓`);
  };

  const modalBaseRaw = activeProduct
    ? selectedSize
      ? getOptionPrice(selectedSize)
      : Number(activeProduct.pr) || 0
    : 0;
  const modalBaseDiscounted = applyMenuPriceDiscount(modalBaseRaw, activeMenuDiscount);
  const modalExtrasSum = selectedExtras.reduce((sum, ex) => sum + getOptionPrice(ex), 0);
  const modalUnitPrice = activeProduct ? modalBaseDiscounted + modalExtrasSum : 0;

  const handleAddConfiguredToCart = () => {
    if (!activeProduct || isDisplayOnlyItem(activeProduct)) return;
    const validSizes = (activeProduct.sizes || []).filter((s) => getSizeLabel(s));
    if (validSizes.length > 0 && !selectedSize) {
      showToast('يرجى اختيار الحجم أولاً');
      return;
    }
    const catObj = allCategories.find((c) => c.id === activeProduct.cat);
    const sizeName = selectedSize ? getSizeLabel(selectedSize) : '';
    const chSorted = [...selectedChoices].sort();
    const exSorted = [...selectedExtras].map((e) => getExtraLabel(e)).sort();
    const cleanNote = modalItemNote.trim();
    const key = cleanNote
      ? `${activeProduct.id}|${sizeName}|${chSorted.join(',')}|${exSorted.join(',')}|${cleanNote}`
      : `${activeProduct.id}|${sizeName}|${chSorted.join(',')}|${exSorted.join(',')}`;
    const origUnit = getItemOriginalBaseUnit(activeProduct, selectedSize) + modalExtrasSum;

    setCart((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      if (idx >= 0) {
        return prev.map((x, i) =>
          i === idx
            ? { ...x, qty: x.qty + modalQty, unitPrice: modalUnitPrice, origUnitPrice: origUnit }
            : x
        );
      }
      return [
        ...prev,
        {
          key,
          itemId: activeProduct.id,
          name: activeProduct.n,
          catName: catObj?.n,
          unitPrice: modalUnitPrice,
          origUnitPrice: origUnit,
          qty: modalQty,
          size: sizeName || undefined,
          choices: selectedChoices,
          extras: selectedExtras.map((e) => getExtraLabel(e)),
          img: activeProduct.img,
          notes: cleanNote || undefined,
        },
      ];
    });

    showToast(`تمت إضافة ${modalQty} × ${activeProduct.n} للسلة`);
    setActiveProduct(null);
  };

  const updateCartLineQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => (line.key === key ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0)
    );
  };

  const updateCartLineNotes = (key: string, notes: string) => {
    setCart((prev) =>
      prev.map((line) => (line.key === key ? { ...line, notes } : line))
    );
  };

  const handleGetGps = () => {
    if (!navigator.geolocation) {
      showToast('المتصفح لا يدعم تحديد الموقع التلقائي');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
        setGpsLoading(false);
        showToast('تم تحديد موقعك على الخريطة ✓');
      },
      () => {
        setGpsLoading(false);
        showToast('تعذر الوصول للموقع، يرجى كتابة العنوان يدوياً');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSpinWheel = () => {
    if (isSpinning) return;
    const defaultPrizes = 'خصم 5%\nخصم 10%\nخصم 15%\nتوصيل مجاني';
    const prizes = (addons.spinWheelPromo?.prizesText || defaultPrizes)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (prizes.length === 0) return;
    setIsSpinning(true);
    const chosenIdx = Math.floor(Math.random() * prizes.length);
    const sliceDeg = 360 / prizes.length;
    const extraTurns = 360 * 5 + (360 - chosenIdx * sliceDeg);
    setWheelDeg((prev) => prev + extraTurns);

    setTimeout(() => {
      const label = prizes[chosenIdx];
      const isFreeDel = /توصيل|گەیاندن|free\s*delivery|delivery/i.test(label);
      const pctMatch = label.match(/(\d+)/);
      const pct = isFreeDel ? 0 : pctMatch ? Math.min(50, Number(pctMatch[1])) : 10;
      const reward = { label, percent: pct, freeDelivery: isFreeDel };
      setSpinWonReward(reward);
      try {
        sessionStorage.setItem(`emenu_spin_${restaurantId}`, JSON.stringify(reward));
      } catch {
        // ignore
      }
      setIsSpinning(false);
      showToast(`مبروك! ربحت "${label}" وسيُطبق في السلة تلقائياً`);
    }, 3400);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingOrder) return;
    if (!canOrderNow) {
      showToast('مغلق حالياً ولا يستقبل الطلبات');
      return;
    }
    if (cart.length === 0) return;

    if (belowMinOrder) {
      showToast(
        `${addons.minOrder?.message || 'الحد الأدنى للطلب هو'} ${formatNumber(minOrderAmount)} ${currency}`
      );
      return;
    }

    if (customerName.trim().length < 2) {
      showToast('يرجى إدخال الاسم للتواصل');
      return;
    }

    if (!customerPhone.trim() || customerPhone.trim().length < 7) {
      showToast('يرجى إدخال رقم هاتف صحيح للتواصل');
      return;
    }

    if (orderType === 'delivery' && customerAddress.trim().length < 3) {
      showToast('يرجى إدخال العنوان التفصيلي للتوصيل');
      return;
    }

    setIsSubmittingOrder(true);
    try {
      const targetWaPhone = rest.ph || rest.social?.whatsapp || '';
      const orderId = uid();
      const tableVal = orderType === 'table' ? selectedTable.trim() || '1' : undefined;
      const resolvedCartLines = cart.map((line) => {
        const matchedMenuItem = allItems.find((m) => m.id === line.itemId);
        const fallbackOrigUnit = matchedMenuItem
          ? (() => {
              const matchedSize = line.size
                ? (matchedMenuItem.sizes || []).find((s) => getSizeLabel(s) === line.size) || null
                : null;
              const origBase = getItemOriginalBaseUnit(matchedMenuItem, matchedSize);
              const extrasSum = (line.extras || []).reduce((sum, exName) => {
                const exObj = (matchedMenuItem.extras || []).find((ex) => getExtraLabel(ex) === exName);
                return sum + (exObj ? getOptionPrice(exObj) : 0);
              }, 0);
              return origBase + extrasSum;
            })()
          : line.unitPrice;
        const origUnitPrice =
          typeof line.origUnitPrice === 'number' && line.origUnitPrice > line.unitPrice
            ? line.origUnitPrice
            : fallbackOrigUnit > line.unitPrice
            ? fallbackOrigUnit
            : line.unitPrice;
        const hasDisc = origUnitPrice > line.unitPrice && origUnitPrice > 0;
        const discPct = hasDisc
          ? Math.max(1, Math.round(((origUnitPrice - line.unitPrice) / origUnitPrice) * 100))
          : 0;
        const discAmt = hasDisc ? (origUnitPrice - line.unitPrice) * line.qty : 0;
        return {
          ...line,
          origUnitPrice,
          hasDisc,
          discPct,
          discAmt,
        };
      });

      const orderItems: OrderItem[] = resolvedCartLines.map((line) => ({
        n: line.name,
        q: line.qty,
        p: line.unitPrice,
        origPrice: line.hasDisc ? line.origUnitPrice : undefined,
        discountPct: line.hasDisc ? line.discPct : undefined,
        discountAmt: line.hasDisc ? line.discAmt : undefined,
        c: line.catName,
        size: line.size,
        choices: line.choices.length ? line.choices : undefined,
        extras: line.extras.length ? line.extras : undefined,
        notes: line.notes?.trim() || undefined,
      }));

      const origSubtotal = resolvedCartLines.reduce((s, line) => s + line.origUnitPrice * line.qty, 0);
      const itemsDiscountTotal = Math.max(0, origSubtotal - subtotal);
      const orderLevelDiscountTotal = firstOrderDiscountAmt + spinDiscountAmt + pickupDiscountAmt;
      const totalDiscount = itemsDiscountTotal + orderLevelDiscountTotal;
      const pickupLabelText = addons.pickupInstantDiscount?.title || 'خصم الاستلام الفوري';
      const menuDiscountLabelText =
        itemsDiscountTotal > 0 ? activeMenuDiscount.sourceLabel || 'خصم على الأطباق' : undefined;

      const cu = {
        n: customerName.trim(),
        ph: customerPhone.trim(),
        nt: customerNotes.trim(),
        orderType,
        area: orderType === 'delivery' ? activeZone?.area : undefined,
        city: orderType === 'delivery' ? activeCity?.name : undefined,
        deliveryFee: orderType === 'delivery' ? effectiveDeliveryFee : 0,
        address: orderType === 'delivery' ? customerAddress.trim() : undefined,
        lat: gpsCoords?.lat,
        lng: gpsCoords?.lng,
        table: tableVal,
      };

      const nowTs = Date.now();
      const existingOrdersCount = getCollection<Order>('orders').filter((o) => o.rid === restaurantId).length;
      const fallbackOrderSeq = Math.max(Number(rest.o || 0) || 0, existingOrdersCount) + 1;

      const extraOrderNotes: string[] = [];
      if (cu.nt) extraOrderNotes.push(cu.nt);
      if (addons.curbsidePickupCar?.enabled && orderType === 'pickup' && curbsideCarInfo.trim()) {
        extraOrderNotes.push(`🚗 سيارة الاستلام: ${curbsideCarInfo.trim()}`);
      }
      const combinedNotes = extraOrderNotes.join(' | ');

      const savedOrder = await putItemAndSync<Order>(`orders/${orderId}`, {
        id: orderId,
        rid: restaurantId,
        at: nowTs,
        createdAt: new Date(nowTs).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' }),
        items: orderItems,
        origSubtotal: origSubtotal > subtotal ? origSubtotal : undefined,
        itemsDiscountTotal: itemsDiscountTotal > 0 ? itemsDiscountTotal : undefined,
        menuDiscountLabel: menuDiscountLabelText,
        tot: finalTotal,
        total: finalTotal,
        cu: { ...cu, nt: combinedNotes },
        type: orderType,
        name: cu.n,
        phone: cu.ph,
        address: cu.address,
        notes: combinedNotes || undefined,
        table: tableVal,
        firstOrderDiscount: firstOrderDiscountAmt > 0 ? firstOrderDiscountAmt : undefined,
        firstOrderDiscountPct: firstOrderDiscountAmt > 0 ? firstOrderPct : undefined,
        spinDiscount: spinDiscountAmt > 0 ? spinDiscountAmt : undefined,
        spinRewardLabel: spinDiscountAmt > 0 && spinWonReward ? spinWonReward.label : undefined,
        pickupDiscount: pickupDiscountAmt > 0 ? pickupDiscountAmt : undefined,
        pickupDiscountLabel: pickupDiscountAmt > 0 ? pickupLabelText : undefined,
        totalDiscount: totalDiscount > 0 ? totalDiscount : undefined,
        freeGiftName: qualifiesFreeGift && addons.freeGiftThreshold?.giftName ? addons.freeGiftThreshold.giftName : undefined,
        needCutlery: addons.cutleryOption?.enabled ? needCutlery : undefined,
        st: 'new',
        status: 'pending',
      });

      const resolvedOrderSeq =
        Number(savedOrder?.orderSeq || savedOrder?.seq || 0) || fallbackOrderSeq;

      const itemLines = resolvedCartLines.map((x) => {
        const parts = [x.size, ...(x.choices || []), ...(x.extras || [])].filter(Boolean);
        const optsStr = parts.length ? ` (${parts.join(', ')})` : '';
        const noteStr = x.notes?.trim() ? `\n   ↳ ملاحظة: ${x.notes.trim()}` : '';
        const discPart = x.hasDisc
          ? ` (بدلاً من ${formatNumber(x.origUnitPrice)} · خصم ${x.discPct}%)`
          : '';
        return `• ${x.name}${optsStr} × ${x.qty} — سعر الطبق: ${formatNumber(x.unitPrice)} ${currency}${discPart} = ${formatNumber(x.qty * x.unitPrice)} ${currency}${noteStr}`;
      });

      const typeLabel = ORDER_TYPE_META[orderType].label;
      const lines = [
        `طلب جديد — ${rest.n}`,
        `رقم الطلب: #${resolvedOrderSeq}`,
        `النوع: ${typeLabel}`,
        ...(tableVal ? [`الطاولة: ${tableVal}`] : []),
        '----------------',
        ...itemLines,
        '----------------',
        ...(origSubtotal > subtotal || totalDiscount > 0
          ? [`المجموع قبل الخصم: ${formatNumber(origSubtotal)} ${currency}`]
          : [`مجموع الأطباق: ${formatNumber(subtotal)} ${currency}`]),
      ];

      if (itemsDiscountTotal > 0) {
        lines.push(`خصم على الأطباق${menuDiscountLabelText ? ` (${menuDiscountLabelText})` : ''}: -${formatNumber(itemsDiscountTotal)} ${currency}`);
      }
      if (firstOrderDiscountAmt > 0) {
        lines.push(`خصم على الطلب (الطلب الأول ${firstOrderPct}%): -${formatNumber(firstOrderDiscountAmt)} ${currency}`);
      }
      if (spinDiscountAmt > 0 && spinWonReward) {
        lines.push(`خصم على الطلب (مكافأة ${spinWonReward.label}): -${formatNumber(spinDiscountAmt)} ${currency}`);
      }
      if (pickupDiscountAmt > 0) {
        lines.push(`خصم على الطلب (${pickupLabelText} ${pickupPct}%): -${formatNumber(pickupDiscountAmt)} ${currency}`);
      }
      if (totalDiscount > 0) {
        lines.push(`إجمالي الخصم: -${formatNumber(totalDiscount)} ${currency}`);
      }
      if (qualifiesFreeGift && addons.freeGiftThreshold?.giftName) {
        lines.push(`هدية مجانية: ${addons.freeGiftThreshold.giftName}`);
      }
      if (addons.cutleryOption?.enabled) {
        lines.push(`أدوات الطعام: ${needCutlery ? 'مطلوبة' : 'غير مطلوبة'}`);
      }

      if (orderType === 'delivery') {
        const areaText =
          activeZone?.area && activeCity?.name && activeZone.area !== activeCity.name && !activeZone.area.includes(activeCity.name)
            ? `${activeZone.area} - ${activeCity.name}`
            : activeZone?.area || activeCity?.name || '';
        lines.push(
          `التوصيل${areaText ? ` (${areaText})` : ''}: ${
            qualifiesFreeDelivery
              ? spinFreeDelivery
                ? 'مجاني (مكافأة)'
                : 'مجاني'
              : `${formatNumber(effectiveDeliveryFee)} ${currency}`
          }`
        );
        if (customerAddress.trim()) lines.push(`العنوان: ${customerAddress.trim()}`);
        if (gpsCoords) {
          lines.push(`📍 الموقع (Google Maps):\nhttps://www.google.com/maps?q=${gpsCoords.lat},${gpsCoords.lng}`);
          lines.push(`🚗 الموقع (Waze):\nhttps://waze.com/ul?ll=${gpsCoords.lat},${gpsCoords.lng}&navigate=yes`);
        }
      }

      lines.push(`الإجمالي: ${formatNumber(finalTotal)} ${currency}`);
      if (cu.n) lines.push(`الزبون: ${cu.n}`);
      if (cu.ph) lines.push(`الهاتف: ${cu.ph}`);
      if (combinedNotes) lines.push(`ملاحظات: ${combinedNotes}`);

      persistSharedProfile(
        {
          name: cu.n,
          phone: cu.ph,
          address: customerAddress,
          notes: customerNotes,
        },
        true
      );

      const waUrl = useWhatsapp && targetWaPhone ? waLink(targetWaPhone, lines.join('\n')) : '';

      // Directly trigger WhatsApp in new tab without window.open when WhatsApp channel is active
      if (waUrl) {
        const a = document.createElement('a');
        a.href = waUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      // Persist Quick Reorder, First Order & Loyalty Points
      try {
        localStorage.setItem(`emenu_last_order_${restaurantId}`, JSON.stringify(cart));
        setLastSavedOrderCart(cart);
        localStorage.setItem(`emenu_ordered_${restaurantId}`, '1');
        setHasOrderedBefore(true);
        if (earnedLoyaltyPoints > 0) {
          const nextPts = loyaltyBalance + earnedLoyaltyPoints;
          localStorage.setItem(`emenu_points_${restaurantId}`, String(nextPts));
          setLoyaltyBalance(nextPts);
        }
        localStorage.removeItem(`menuplus_cart_${restaurantId}`);
      } catch {
        // ignore
      }

      setLastOrderSummary({ id: orderId, orderSeq: resolvedOrderSeq, waUrl, total: finalTotal, items: orderItems, channel: orderChannel });
      setCart([]);
      setCheckoutStep('done');
      showToast(
        orderChannel === 'telegram'
          ? 'تم إرسال الطلب مباشرة إلى المتجر وتيليجرام ✓'
          : 'تم إرسال الطلب وحفظه في قائمة الطلبات ✓'
      );
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revName.trim() || !revComment.trim()) {
      showToast('يرجى كتابة الاسم والتعليق');
      return;
    }
    const newRev: RestaurantReview = {
      id: uid(),
      name: revName.trim(),
      phone: revPhone.trim() || undefined,
      rate: revRate,
      comment: revComment.trim(),
      at: Date.now(),
    };
    const nextReviews = [newRev, ...(rest.reviews || [])];
    putItem<Restaurant>(`restaurants/${restaurantId}`, {
      ...rest,
      reviews: nextReviews,
    });
    void submitReviewToServer(restaurantId, {
      name: newRev.name,
      rate: revRate,
      comment: newRev.comment,
    });
    setRevName('');
    setRevPhone('');
    setRevComment('');
    setRevRate(5);
    setRateModalOpen(false);
    showToast('شكراً لتقييمك! تم تسجيل رأيك بنجاح ★');
    setSyncTick((t) => t + 1);
  };

  const handleShareMenu = () => {
    setMenuDrawerOpen(false);
    setShareModalOpen(true);
  };

  const searchResults = searchQuery.trim()
    ? allItems.filter(
        (it) =>
          it.n.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          (it.d || '').toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : [];

  return (
    <div
      className={`pm-page ${isLightMenu ? 'pm-light' : ''} ${isEstore ? 'pm-estore-page' : ''}`}
      data-shape={activeShape}
      data-storefront={isEstore ? 'estore' : undefined}
      dir="rtl"
      style={{
        '--pm-brand': brandColor,
        '--brand': brandColor,
        '--pm-on-brand': brandInk,
        '--pm-bg': customBgColor,
        '--pm-card': effectiveSurface,
        '--pm-soft': effectiveSurfaceSoft,
        '--pm-ink': effectiveInk,
        '--pm-muted': effectiveMuted,
        '--pm-line': effectiveLine,
        backgroundColor: customBgColor,
        color: effectiveInk,
      } as React.CSSProperties}
    >
      {!isEstore && <SeasonalMenuOverlay shape={activeShape} isLight={isLightMenu} />}
      {/* Announcement Bar Addon */}
      {addons.announcementBar?.enabled && addons.announcementBar.text && (
        <div
          style={{
            background: addons.announcementBar.bgColor || brandColor,
            color: addons.announcementBar.textColor || '#ffffff',
            padding: '8px 14px',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: 800,
          }}
        >
          {addons.announcementBar.text}
        </div>
      )}

      {/* Owner Preview Top Bar: ONLY 'Back to Edit' button */}
      {isOwner && (
        <div className="pm-owner-preview-bar">
          <button
            type="button"
            className="pm-owner-back-btn"
            style={{
              background: brandColor,
              color: brandInk,
            }}
            onClick={() => {
              let target = '/dashboard/home';
              try {
                const saved = window.sessionStorage.getItem('mp_last_dash_path');
                if (saved && saved.startsWith('/dashboard')) target = saved;
              } catch {
                // ignore storage errors
              }
              onNavigate(target);
            }}
          >
            <ArrowRight size={15} />
            <span>عد للتعديل</span>
          </button>
        </div>
      )}

      {/* Demo Platform Top Notice Bar (for public visitors only, hidden for owner) */}
      {restaurantId === 'demo' && !isOwner && (
        <div
          style={{
            background: 'var(--pm-card)',
            borderBottom: '1px solid var(--pm-line)',
            color: 'var(--pm-ink)',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '12.5px',
          }}
        >
          <span>
            <b>معاينة المنيو التجريبي (كاب برجر)</b> — هكذا يظهر منيو مطعمك للزبائن
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => onNavigate('/signup')}
              style={{
                background: brandColor,
                color: brandInk,
                border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                borderRadius: '8px',
                padding: '4px 11px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              امتلك منيو لمشروعك
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/')}
              style={{
                background: 'var(--pm-soft)',
                color: 'var(--pm-ink)',
                border: '1px solid var(--pm-line)',
                borderRadius: '8px',
                padding: '4px 10px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              ← العودة للرئيسية
            </button>
          </div>
        </div>
      )}

      {isEstore ? (
        <Suspense
          fallback={
            <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }} aria-hidden="true">
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  border: '3px solid var(--line, rgba(15, 23, 42, 0.12))',
                  borderTopColor: brandColor || 'var(--brand, #059669)',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
            </div>
          }
        >
          <EstoreStorefront
            rest={rest}
            currency={currency}
            allCategories={allCategories}
            allItems={allItems}
            categoryEvalMap={categoryEvalMap}
            itemEvalMap={itemEvalMap}
            getPriceInfo={(it) =>
              getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts)
            }
            formatMoney={fmtMoney}
            activeMenuDiscount={activeMenuDiscount}
            addons={addons}
            countdownDisplay={countdownDisplay}
            coverImages={coverImages}
            bannerIdx={bannerIdx}
            setBannerIdx={setBannerIdx}
            openNow={openNow}
            orderType={orderType}
            enabledTypes={enabledTypes}
            orderTypeMeta={ORDER_TYPE_META}
            hasMultipleBranches={hasMultipleBranches}
            branchShortLabel={branchShortLabel}
            onOpenBranchPicker={onOpenBranchPicker}
            totalCount={totalCount}
            subtotal={subtotal}
            freeDeliveryEnabled={freeDeliveryEnabled}
            freeDeliveryMin={freeDeliveryMin}
            freeDeliveryRemaining={freeDeliveryRemaining}
            freeDeliveryPct={freeDeliveryPct}
            qualifiesFreeDelivery={qualifiesFreeDelivery}
            getItemCartQty={getItemCartQty}
            isDisplayOnlyItem={isDisplayOnlyItem}
            openProductModal={openProductModal}
            quickAddOrOpenModal={quickAddOrOpenModal}
            decrementItemFromCart={decrementItemFromCart}
            openCart={() => {
              setCheckoutStep('cart');
              setCartOpen(true);
            }}
            openMenuDrawer={() => setMenuDrawerOpen(true)}
            openCatsModal={() => setCatsModalOpen(true)}
            openOrderTypeModal={() => setOrderTypeModalOpen(true)}
            openWorkModal={() => setWorkModalOpen(true)}
            openAboutModal={() => setAboutModalOpen(true)}
            openRateModal={() => setRateModalOpen(true)}
            openShareModal={handleShareMenu}
            openMoodModal={() => setMoodModalOpen(true)}
            openSpinModal={() => setSpinModalOpen(true)}
            spinWonLabel={spinWonReward?.label || null}
            reviewsShowOnMenu={reviewsShowOnMenu}
            reviewsAllowSubmit={reviewsAllowSubmit}
            restaurantReviews={restaurantReviews}
            onNavigate={onNavigate}
            selectedCatId={estoreCatFilter}
            onSelectCatId={setEstoreCatFilter}
          />
        </Suspense>
      ) : (
        <>
          {isToters ? (
        <>
          {/* TOTERS FULL-BLEED COVER HERO + FLOATING STORE CARD */}
          <div className="pm-toters-hero-wrap">
            <div className={`pm-toters-hero-banner ${coverImages.length === 0 ? 'no-img' : ''}`}>
              {coverImages.length > 0 ? (
                <>
                  <img
                    src={coverImages[bannerIdx % coverImages.length]}
                    alt={rest.n}
                    referrerPolicy="no-referrer"
                  />
                  <div className="pm-toters-hero-scrim" />
                </>
              ) : (
                <div className="pm-toters-hero-fallback" />
              )}

              {/* Overlaid Circular Action Bar (Matching Toters RTL Layout) */}
              <div className="pm-toters-hero-controls">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="pm-toters-circle-btn"
                    onClick={() => setMenuDrawerOpen(true)}
                    aria-label="قائمة المطعم"
                  >
                    <Menu size={19} />
                  </button>

                  <button
                    type="button"
                    className="pm-toters-mode-pill"
                    onClick={() => setOrderTypeModalOpen(true)}
                  >
                    <span style={{ color: brandColor, display: 'inline-flex' }}>{ORDER_TYPE_META[orderType].icon}</span>
                    <span>{ORDER_TYPE_META[orderType].label}</span>
                    <ChevronDown size={13} />
                  </button>

                  {hasMultipleBranches && (
                    <button
                      type="button"
                      className="pm-toters-mode-pill pm-branch-pill"
                      onClick={onOpenBranchPicker}
                      title={`تبديل الفرع — الحالي: ${branchShortLabel}`}
                      aria-label="تبديل الفرع"
                    >
                      <GitBranch size={13} style={{ color: brandColor, flexShrink: 0 }} />
                      <span className="pm-branch-pill-label">تبديل الفرع</span>
                      <ChevronDown size={12} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="pm-toters-circle-btn"
                    onClick={handleShareMenu}
                    aria-label="مشاركة المنيو"
                    title="مشاركة المنيو"
                  >
                    <Share2 size={17} />
                  </button>
                  <button
                    type="button"
                    className="pm-toters-circle-btn"
                    onClick={() => setSearchOpen(true)}
                    aria-label="بحث في المنيو"
                  >
                    <Search size={18} />
                  </button>
                </div>
              </div>

              {coverImages.length > 1 && (
                <div className="pm-hero-dots" style={{ bottom: '52px' }}>
                  {coverImages.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`بنر ${i + 1}`}
                      className={`pm-hero-dot ${i === bannerIdx ? 'active' : ''}`}
                      onClick={() => setBannerIdx(i)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pm-container">
            <SeasonalHeroRibbon shape={activeShape} />

            {/* Toters Floating Overlapping Store Info Card */}
            <section className="pm-toters-store-card">
              <div className="pm-toters-store-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                  <div className="pm-toters-logo-badge">
                    {rest.logo ? (
                      <img src={rest.logo} alt={rest.n} referrerPolicy="no-referrer" />
                    ) : (
                      <span>{(rest.n || 'M').slice(0, 2)}</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h1 className="pm-toters-store-title">{rest.n}</h1>
                      <button
                        type="button"
                        onClick={() => setWorkModalOpen(true)}
                        className={`pm-toters-status-tag ${openNow ? 'open' : 'closed'}`}
                      >
                        {openNow ? 'مفتوح' : 'مغلق'}
                      </button>
                    </div>
                    {rest.tagline && (
                      <p className="pm-toters-store-tagline">{rest.tagline}</p>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  {rest.ph && (
                    <a
                      href={waLink(rest.ph, `مرحباً ${rest.n}، أود الاستفسار عن المنيو`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pm-toters-info-icon"
                      title="واتساب"
                      style={{ color: accentText }}
                    >
                      <MessageCircle size={18} />
                    </a>
                  )}
                  <button
                    type="button"
                    className="pm-toters-info-icon"
                    onClick={() => setMenuDrawerOpen(true)}
                    aria-label="معلومات المتجر"
                    title="معلومات المتجر"
                  >
                    <Store size={18} />
                  </button>
                </div>
              </div>
            </section>

            {/* Toters Horizontal Promo Ticket Cards */}
            {(() => {
              const tickets: Array<{
                id: string;
                badgeIcon: React.ReactNode;
                badgeBg: string;
                eyebrow: string;
                title: string;
                footer: string;
                onClick?: () => void;
              }> = [];

              if (freeDeliveryEnabled && freeDeliveryMin > 0 && orderType === 'delivery') {
                tickets.push({
                  id: 'fd-ticket',
                  badgeIcon: <Truck size={12} />,
                  badgeBg: '#ef4444',
                  eyebrow: `عند الطلب بـ ${fmtMoney(freeDeliveryMin)}`,
                  title: 'توصيل مجاني',
                  footer: qualifiesFreeDelivery ? 'مُفعّل لطلبك ✓' : 'يُطبق تلقائياً',
                });
              }

              if (firstOrderPct > 0) {
                tickets.push({
                  id: 'first-order-ticket',
                  badgeIcon: <Sparkles size={12} />,
                  badgeBg: brandColor,
                  eyebrow: 'على طلبك الأول',
                  title: `خصم ${firstOrderPct}%`,
                  footer: 'يُطبق تلقائياً',
                });
              }

              if (addons.loyaltyPoints?.enabled) {
                tickets.push({
                  id: 'loyalty-ticket',
                  badgeIcon: <Gift size={12} />,
                  badgeBg: brandColor,
                  eyebrow: 'برنامج نقاط الولاء',
                  title: `اكسب ${addons.loyaltyPoints.pointsPerThousand || 1} نقطة / 1,000`,
                  footer:
                    loyaltyBalance > 0
                      ? `رصيدك الحالي: ${loyaltyBalance} نقطة`
                      : addons.loyaltyPoints.rewardNote || 'تُضاف نقاطك تلقائياً بعد كل طلب',
                });
              }

              if (tickets.length === 0) return null;

              return (
                <div className="pm-toters-tickets-strip" aria-label="العروض والخصومات">
                  {tickets.map((tk) => (
                    <button
                      key={tk.id}
                      type="button"
                      className="pm-toters-ticket"
                      onClick={tk.onClick}
                      style={{ cursor: tk.onClick ? 'pointer' : 'default' }}
                    >
                      <span className="pm-toters-ticket-icon" style={{ background: tk.badgeBg }}>
                        {tk.badgeIcon}
                      </span>
                      <span className="pm-toters-ticket-eyebrow">{tk.eyebrow}</span>
                      <strong className="pm-toters-ticket-title">{tk.title}</strong>
                      <span className="pm-toters-ticket-divider" aria-hidden="true" />
                      <span className="pm-toters-ticket-footer">{tk.footer}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </>
      ) : (
        <>
          {/* Top Sticky Action Bar (Standard Shapes) */}
          <header className="pm-topbar">
            <div className="pm-topbar-inner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="pm-icon-btn"
                  onClick={() => setMenuDrawerOpen(true)}
                  aria-label="قائمة المطعم"
                >
                  <Menu size={20} />
                </button>

                <button
                  type="button"
                  className="pm-order-type-pill"
                  onClick={() => setOrderTypeModalOpen(true)}
                >
                  <span style={{ color: accentText }}>{ORDER_TYPE_META[orderType].icon}</span>
                  <span>{ORDER_TYPE_META[orderType].label}</span>
                  <ChevronDown size={14} style={{ color: 'var(--pm-muted)' }} />
                </button>

                {hasMultipleBranches && (
                  <button
                    type="button"
                    className="pm-order-type-pill pm-branch-pill"
                    onClick={onOpenBranchPicker}
                    title={`تبديل الفرع — الحالي: ${branchShortLabel}`}
                    aria-label="تبديل الفرع"
                  >
                    <GitBranch size={14} style={{ color: accentText, flexShrink: 0 }} />
                    <span className="pm-branch-pill-label">تبديل الفرع</span>
                    <ChevronDown size={13} style={{ color: 'var(--pm-muted)', flexShrink: 0 }} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="pm-icon-btn"
                  onClick={handleShareMenu}
                  aria-label="مشاركة المنيو"
                  title="مشاركة المنيو"
                >
                  <Share2 size={18} />
                </button>
                <button
                  type="button"
                  className="pm-icon-btn"
                  onClick={() => setSearchOpen(true)}
                  aria-label="بحث في المنيو"
                >
                  <Search size={18} />
                </button>
              </div>
            </div>
          </header>

          <div className="pm-container">
            <SeasonalHeroRibbon shape={activeShape} />
            {/* Hero Cover Carousel (only shown if merchant uploaded banners) */}
            {coverImages.length > 0 && (
              <div className="pm-hero-carousel">
                <img
                  src={coverImages[bannerIdx % coverImages.length]}
                  alt={rest.n}
                  referrerPolicy="no-referrer"
                />
                {coverImages.length > 1 && (
                  <div className="pm-hero-dots">
                    {coverImages.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`بنر ${i + 1}`}
                        className={`pm-hero-dot ${i === bannerIdx ? 'active' : ''}`}
                        onClick={() => setBannerIdx(i)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Restaurant Identity Card */}
            <section className={`pm-profile-card ${coverImages.length > 0 ? 'has-banner' : ''}`}>
              <div className="pm-logo-box">
                {rest.logo ? (
                  <img src={rest.logo} alt={rest.n} referrerPolicy="no-referrer" />
                ) : (
                  <span>{(rest.n || 'M').slice(0, 2)}</span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: '17.5px', fontWeight: 800, color: 'var(--pm-ink)' }}>
                    {rest.n}
                  </h1>
                  <button
                    type="button"
                    className="pm-shape-pill"
                    onClick={() => setWorkModalOpen(true)}
                    style={{
                      border: openNow ? '1px solid rgba(52, 211, 153, 0.36)' : '1px solid rgba(248, 113, 113, 0.36)',
                      padding: '3px 10px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: openNow ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                      color: openNow ? (isLightMenu ? '#047857' : '#34D399') : (isLightMenu ? '#B91C1C' : '#FCA5A5'),
                    }}
                  >
                    {openNow ? 'مفتوح الآن' : 'مغلق'}
                  </button>
                </div>

                {rest.tagline && (
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--pm-muted)', fontWeight: 500 }}>
                    {rest.tagline}
                  </p>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                    marginTop: '8px',
                    fontSize: '12px',
                    color: 'var(--pm-muted)',
                  }}
                >
                  {freeDeliveryEnabled && freeDeliveryMin > 0 && orderType === 'delivery' ? (
                    <span style={{ color: accentText, fontWeight: 700 }}>
                      توصيل مجاني فوق {fmtMoney(freeDeliveryMin)}
                    </span>
                  ) : null}
                  {!openNow && rest.acceptOrdersWhenClosed && (
                    <span style={{ color: isLightMenu ? '#b45309' : '#FCD34D' }}>
                      · نستقبل الطلبات المسبقة
                    </span>
                  )}
                </div>
              </div>

              {rest.ph && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                  <a
                    href={waLink(
                      rest.ph,
                      `مرحباً ${rest.n}، أود الاستفسار عن المنيو`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-icon-btn"
                    title="واتساب"
                    style={{
                      color: isLightMenu ? '#047857' : '#34D399',
                      borderColor: 'rgba(16, 185, 129, 0.35)',
                      background: 'rgba(16, 185, 129, 0.14)',
                    }}
                  >
                    <MessageCircle size={18} />
                  </a>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <div className="pm-container">
        {!isToters && <SeasonalHeroRibbon shape={activeShape} />}

        {/* Happy Hour Banner Addon */}
        {addons.happyHour?.enabled && activeMenuDiscount.sourceLabel === (addons.happyHour.title || 'ساعة السعادة') && (
          <div
            className="pm-addon-card"
            style={{
              marginTop: '10px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#ffffff',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              fontSize: '13px',
              fontWeight: 800,
            }}
          >
            <span>
              {addons.happyHour.title || 'ساعة السعادة'} مفعّلة الآن
            </span>
            <span>
              {`خصم ${addons.happyHour.discountPercent || 15}% على كل المنيو`}
            </span>
          </div>
        )}

        {/* Countdown Timer Addon — Actually Applies Live Discount Across All Prices */}
        {addons.countdownTimer?.enabled && countdownDisplay && (
          <div
            className="pm-addon-card"
            style={{
              marginTop: '10px',
              color: 'var(--pm-ink)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 800 }}>
              ⏳ {addons.countdownTimer.title || 'عرض لفترة محدودة'}
              {(addons.countdownTimer.discountValue ?? 0) > 0 && (
                <span
                  className="pm-shape-pill"
                  style={{
                    background: '#10b981',
                    color: '#052e16',
                    padding: '2px 8px',
                    fontSize: '11.5px',
                    fontWeight: 900,
                    marginInlineStart: '8px',
                  }}
                >
                  خصم فوري{' '}
                  {addons.countdownTimer.discountType === 'fixed'
                    ? `${formatNumber(addons.countdownTimer.discountValue || 0)} ${currency}`
                    : `${addons.countdownTimer.discountValue}%`}
                </span>
              )}
              {addons.countdownTimer.discountText && (
                <span style={{ color: isLightMenu ? '#b45309' : '#fbbf24', marginInlineStart: '8px' }}>
                  — {addons.countdownTimer.discountText}
                </span>
              )}
            </div>
            <span
              dir="ltr"
              className="tabular-nums pm-shape-btn"
              style={{
                background: brandColor,
                border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                color: brandInk,
                padding: '4px 10px',
                fontSize: '12.5px',
                fontWeight: 900,
              }}
            >
              {countdownDisplay}
            </span>
          </div>
        )}

        {/* Active Smart Deal Pills: Pickup Instant Discount & Mood Finder */}
        {((addons.pickupInstantDiscount?.enabled && orderType === 'pickup') ||
          addons.moodMealFinder?.enabled) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            {addons.moodMealFinder?.enabled && (
              <button
                type="button"
                className="pm-shape-btn"
                onClick={() => setMoodModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: brandColor,
                  color: brandInk,
                  border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                <Smile size={15} />
                <span>{addons.moodMealFinder.buttonText || 'اختر وجبتك حسب مزاجك'}</span>
              </button>
            )}
            {addons.pickupInstantDiscount?.enabled && orderType === 'pickup' && (
              <span
                className="pm-shape-pill"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 11px',
                  fontSize: '12px',
                  fontWeight: 800,
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  color: isLightMenu ? '#b45309' : '#fcd34d',
                }}
              >
                🏃 {addons.pickupInstantDiscount.title || 'خصم الاستلام الفوري'}: {addons.pickupInstantDiscount.discountPercent || 10}% تلقائي
              </span>
            )}
          </div>
        )}

        {/* Toters Discovery Shelves: "اطلب مجدداً" (only if ordered before) & "الأكثر طلباً" */}
        {isToters && allItems.length > 0 && (() => {
          const reorderItems: MenuItem[] = [];
          if (hasOrderedBefore && lastSavedOrderCart.length > 0) {
            const seen = new Set<string>();
            lastSavedOrderCart.forEach((l) => {
              if (seen.has(l.itemId)) return;
              const found = allItems.find((it) => it.id === l.itemId);
              if (found) {
                seen.add(found.id);
                reorderItems.push(found);
              }
            });
          }

          const mostOrderedShelf = mostOrderedItems.slice(0, 8);

          const renderShelf = (heading: string, items: MenuItem[]) => {
            if (items.length === 0) return null;
            return (
              <section className="pm-toters-shelf-wrap">
                <h2 className="pm-toters-shelf-heading">{heading}</h2>
                <div className="pm-toters-shelf">
                  {items.map((it) => {
                    const qty = getItemCartQty(it.id);
                    const priceInfo = getPriceDisplay(
                      it,
                      currency,
                      activeMenuDiscount,
                      resolvedPlan.perms.itemDiscounts
                    );
                    const itemEval = itemEvalMap.get(it.id);
                    const displayOnly = isDisplayOnlyItem(it);
                    const unavailable = !displayOnly && (itemEval ? !itemEval.available : false);
                    return (
                      <article
                        key={`${heading}_${it.id}`}
                        className={`pm-toters-shelf-card ${unavailable ? 'unavailable' : ''}`}
                        onClick={() => openProductModal(it)}
                      >
                        <div className="pm-toters-shelf-thumb">
                          {it.img ? (
                            <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="pm-toters-thumb-empty">
                              <Utensils size={24} />
                            </div>
                          )}
                          {!displayOnly && (
                            !unavailable && qty > 0 ? (
                              <div
                                className="pm-toters-qty-pill"
                                dir="rtl"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="pm-toters-qty-pill-btn"
                                  aria-label={qty === 1 ? `حذف ${it.n} من السلة` : `إنقاص كمية ${it.n}`}
                                  onClick={(e) => decrementItemFromCart(it.id, e)}
                                >
                                  {qty === 1 ? <Trash2 size={13} strokeWidth={2.3} /> : <Minus size={14} strokeWidth={2.6} />}
                                </button>
                                <span className="pm-toters-qty-pill-val tabular-nums">{qty}</span>
                                <button
                                  type="button"
                                  className="pm-toters-qty-pill-btn"
                                  aria-label={`زيادة كمية ${it.n}`}
                                  onClick={(e) => quickAddOrOpenModal(it, e)}
                                >
                                  <Plus size={14} strokeWidth={2.7} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="pm-toters-plus-btn"
                                disabled={unavailable}
                                aria-label={`أضف للسلة: ${it.n}`}
                                onClick={(e) => quickAddOrOpenModal(it, e)}
                              >
                                {unavailable ? (
                                  itemEval?.outOfSchedule ? <Clock size={13} /> : 'نفد'
                                ) : (
                                  <Plus size={16} strokeWidth={2.6} />
                                )}
                              </button>
                            )
                          )}
                        </div>
                        <b className="pm-toters-shelf-title">{it.n}</b>
                        <span className="pm-toters-shelf-price tabular-nums">{priceInfo.main}</span>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          };

          return (
            <>
              {reorderItems.length > 0 && renderShelf('اطلب مجدداً', reorderItems.slice(0, 8))}
              {mostOrderedShelf.length > 0 && renderShelf('الأكثر طلباً', mostOrderedShelf)}
            </>
          );
        })()}

        {/* Horizontal Category Strip + All Categories Trigger */}
        {allCategories.length > 0 && (
          <div className="pm-cat-strip-wrap">
            <div className="pm-cat-strip">
              <button
                type="button"
                className="pm-cat-chip"
                onClick={() => setCatsModalOpen(true)}
                style={{
                  fontWeight: 800,
                  background: 'var(--pm-soft)',
                  color: 'var(--pm-ink)',
                  borderColor: 'var(--pm-line)',
                }}
              >
                <LayoutGrid size={14} style={{ color: accentText }} />
                <span>القائمة</span>
              </button>

              {allCategories.map((c) => {
                const isActive = activeCatId === c.id;
                const catEval = categoryEvalMap.get(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-cat-id={c.id}
                    className={`pm-cat-chip ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setActiveCatId(c.id);
                      document.getElementById(`mc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    {c.img && (
                      <img
                        src={c.img}
                        alt={c.n}
                        className="pm-cat-chip-img"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <span>{c.n}</span>
                    {catEval?.outOfSchedule && (
                      <Clock size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Categories & Menu Items */}
        <div style={{ marginTop: '14px' }}>
          {allCategories.length === 0 ? (
            <div
              className="pm-addon-card"
              style={{
                padding: '44px 18px',
                textAlign: 'center',
                color: 'var(--pm-muted)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px', color: 'var(--pm-muted)' }}>
                <Utensils size={28} />
              </div>
              <b style={{ display: 'block', color: 'var(--pm-ink)', marginBottom: '4px' }}>
                المنيو قيد الإعداد
              </b>
              <span style={{ fontSize: '12.5px' }}>
                سيتم عرض الأقسام والأصناف هنا فور إضافتها من لوحة التحكم.
              </span>
            </div>
          ) : (
            allCategories.map((cat) => {
              const catItems = allItems.filter((it) => it.cat === cat.id);
              if (catItems.length === 0) return null;
              const catEval = categoryEvalMap.get(cat.id);

              return (
                <section
                  key={cat.id}
                  id={`mc-${cat.id}`}
                  style={{ marginBottom: '20px', scrollMarginTop: '126px' }}
                >
                  <div className="pm-sec-title" style={{ gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h2>{cat.n}</h2>
                      {catEval?.hasSchedule && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '8px',
                            background: catEval.available
                              ? 'color-mix(in srgb, var(--pm-brand) 12%, transparent)'
                              : 'rgba(245, 158, 11, 0.14)',
                            color: catEval.available ? accentText : '#f59e0b',
                            border: catEval.available
                              ? '1px solid color-mix(in srgb, var(--pm-brand) 28%, transparent)'
                              : '1px solid rgba(245, 158, 11, 0.32)',
                          }}
                        >
                          <Clock size={11} />
                          <span>
                            {catEval.available
                              ? `متاح ${catEval.badgeText}`
                              : `متوفر ${catEval.badgeText}`}
                          </span>
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--pm-muted)', fontWeight: 600 }}>
                      {catItems.length} أصناف
                    </span>
                  </div>

                  {/* 1) CLASSIC HORIZONTAL LIST LAYOUT (or Toters Clean Divider List) */}
                  {layout === 'list' && (
                    <div
                      className={isToters ? 'pm-toters-list' : undefined}
                      style={isToters ? undefined : { display: 'flex', flexDirection: 'column', gap: '10px' }}
                    >
                      {catItems.map((it) => {
                        const qty = getItemCartQty(it.id);
                        const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                        const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, cat, nowDate);
                        const displayOnly = isDisplayOnlyItem(it);
                        const unavailable = !displayOnly && !itemEval.available;

                        if (isToters) {
                          const isPopular = popularItemIds.has(it.id);
                          return (
                            <article
                              key={it.id}
                              className={`pm-toters-row ${unavailable ? 'unavailable' : ''}`}
                              onClick={() => openProductModal(it)}
                            >
                              {/* Start (Right in RTL): Title, Description, Price & Subtle Inline Tags */}
                              <div className="pm-toters-row-info">
                                <h3 className="pm-toters-row-title">{it.n}</h3>
                                {it.d && <p className="pm-toters-row-desc">{it.d}</p>}
                                <div className="pm-toters-row-meta">
                                  <span className="pm-toters-row-price tabular-nums">{priceInfo.main}</span>
                                  {priceInfo.rawBefore > 0 && (
                                    <span className="pm-toters-row-old tabular-nums">{fmtMoney(priceInfo.rawBefore)}</span>
                                  )}
                                  {isPopular && (
                                    <span className="pm-toters-popular-tag">
                                      <Flame size={12} fill="#f97316" color="#f97316" /> الأكثر طلباً
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* End (Left in RTL): Square Rounded Thumb + Floating Circular + */}
                              <div className="pm-toters-row-thumb">
                                {it.img ? (
                                  <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="pm-toters-thumb-empty">
                                    <Utensils size={22} />
                                  </div>
                                )}
                                {!displayOnly && (
                                  !unavailable && qty > 0 ? (
                                    <div
                                      className="pm-toters-qty-pill"
                                      dir="rtl"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        className="pm-toters-qty-pill-btn"
                                        aria-label={qty === 1 ? `حذف ${it.n} من السلة` : `إنقاص كمية ${it.n}`}
                                        onClick={(e) => decrementItemFromCart(it.id, e)}
                                      >
                                        {qty === 1 ? <Trash2 size={13} strokeWidth={2.3} /> : <Minus size={14} strokeWidth={2.6} />}
                                      </button>
                                      <span className="pm-toters-qty-pill-val tabular-nums">{qty}</span>
                                      <button
                                        type="button"
                                        className="pm-toters-qty-pill-btn"
                                        aria-label={`زيادة كمية ${it.n}`}
                                        onClick={(e) => quickAddOrOpenModal(it, e)}
                                      >
                                        <Plus size={14} strokeWidth={2.7} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="pm-toters-plus-btn"
                                      disabled={unavailable}
                                      aria-label={`أضف للسلة: ${it.n}`}
                                      onClick={(e) => quickAddOrOpenModal(it, e)}
                                    >
                                      {unavailable ? (
                                        itemEval.outOfSchedule ? <Clock size={13} /> : 'نفد'
                                      ) : (
                                        <Plus size={16} strokeWidth={2.6} />
                                      )}
                                    </button>
                                  )
                                )}
                              </div>
                            </article>
                          );
                        }

                        return (
                          <article
                            key={it.id}
                            className={`pm-product-row ${unavailable ? 'unavailable' : ''}`}
                            onClick={() => openProductModal(it)}
                          >
                            {/* Horizontal rectangular food image */}
                            <div className="pm-product-thumb">
                              {it.img ? (
                                <img src={it.img} alt={it.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                              ) : (
                                <div
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'grid',
                                    placeItems: 'center',
                                    color: 'var(--pm-muted)',
                                    background: 'var(--pm-soft)',
                                  }}
                                >
                                  <Utensils size={22} />
                                </div>
                              )}
                              {!displayOnly && qty > 0 && (
                                <span className="pm-qty-badge tabular-nums">{qty} ×</span>
                              )}
                            </div>

                            {/* Dish Name, Price & Plus Button Only (No description) */}
                            <div
                              style={{
                                flex: 1,
                                minWidth: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '10px',
                              }}
                            >
                              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <h3
                                  style={{
                                    margin: 0,
                                    fontSize: '14px',
                                    fontWeight: 800,
                                    color: 'var(--pm-ink)',
                                    lineHeight: 1.35,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {it.n}
                                </h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span
                                    className="tabular-nums"
                                    style={{
                                      color: accentText,
                                      fontWeight: 900,
                                      fontSize: '14px',
                                    }}
                                  >
                                    {priceInfo.main}
                                  </span>
                                  {priceInfo.rawBefore > 0 && (
                                    <span
                                      className="tabular-nums"
                                      style={{
                                        color: 'var(--pm-muted)',
                                        textDecoration: 'line-through',
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                      }}
                                    >
                                      {fmtMoney(priceInfo.rawBefore)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {!displayOnly && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    className="pm-list-add-btn"
                                    disabled={unavailable}
                                    aria-label={`أضف للسلة: ${it.n}`}
                                    onClick={(e) => quickAddOrOpenModal(it, e)}
                                    style={{
                                      width: unavailable ? 'auto' : '32px',
                                      padding: unavailable ? '0 8px' : 0,
                                      background: brandColor,
                                      color: brandInk,
                                    }}
                                  >
                                    {unavailable ? (
                                      itemEval.outOfSchedule ? <Clock size={14} /> : 'نفد'
                                    ) : (
                                      <Plus size={16} strokeWidth={2.6} />
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {/* 2, 3 & 4) SYMMETRICAL HORIZONTAL-IMAGE GRID LAYOUTS: 4 COLS (grid4), 3 COLS (grid3), 2 COLS (grid) */}
                  {(layout === 'grid4' || layout === 'grid3' || layout === 'grid') && (
                    <div
                      className={`pm-menu-grid ${
                        layout === 'grid4'
                          ? 'pm-cols-4'
                          : layout === 'grid3'
                          ? 'pm-cols-3'
                          : 'pm-cols-2'
                      }`}
                    >
                      {catItems.map((it) => {
                        const qty = getItemCartQty(it.id);
                        const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                        const itemEval = itemEvalMap.get(it.id) || evaluateItemAvailability(it, cat, nowDate);
                        const displayOnly = isDisplayOnlyItem(it);
                        const unavailable = !displayOnly && !itemEval.available;
                        const isCompact = layout === 'grid4' || layout === 'grid3';

                        return (
                          <article
                            key={it.id}
                            onClick={() => openProductModal(it)}
                            className="pm-menu-card"
                            style={{
                              opacity: unavailable ? 0.52 : 1,
                            }}
                          >
                            <div className="pm-menu-card-media">
                              {it.img ? (
                                <img
                                  src={it.img}
                                  alt={it.n}
                                  loading="lazy"
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'grid',
                                    placeItems: 'center',
                                    color: 'var(--pm-muted)',
                                  }}
                                >
                                  <Utensils size={layout === 'grid4' ? 18 : isCompact ? 22 : 28} />
                                </div>
                              )}
                              {!displayOnly && qty > 0 && (
                                <span className="pm-qty-badge tabular-nums">{qty} ×</span>
                              )}
                            </div>

                            <div className="pm-menu-card-body">
                              <b className="pm-menu-card-title">{it.n}</b>

                              <div className="pm-menu-card-footer">
                                <div style={{ minWidth: 0 }}>
                                  <span
                                    className="pm-menu-card-price tabular-nums"
                                    style={{ color: accentText }}
                                  >
                                    {priceInfo.main}
                                  </span>
                                  {priceInfo.rawBefore > 0 && (
                                    <span className="pm-menu-card-old-price tabular-nums">
                                      {fmtMoney(priceInfo.rawBefore)}
                                    </span>
                                  )}
                                </div>
                                {!displayOnly && (
                                  <button
                                    type="button"
                                    disabled={unavailable}
                                    aria-label={`أضف للسلة: ${it.n}`}
                                    onClick={(e) => quickAddOrOpenModal(it, e)}
                                    className="pm-menu-card-add"
                                    style={{
                                      background: brandColor,
                                      color: brandInk,
                                      width: unavailable ? 'auto' : undefined,
                                      padding: unavailable ? '0 6px' : 0,
                                    }}
                                  >
                                    {unavailable ? (
                                      itemEval.outOfSchedule ? (
                                        <Clock size={isCompact ? 11 : 14} />
                                      ) : (
                                        'نفد'
                                      )
                                    ) : (
                                      <Plus size={layout === 'grid4' ? 13 : isCompact ? 14 : 16} strokeWidth={2.6} />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>

        {/* Customer Reviews Section (Addon-controlled) */}
        {reviewsShowOnMenu && (
          <section className="pm-addon-card pm-reviews-card" style={{ marginTop: '20px', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--pm-ink)' }}>
                ⭐ تقييمات الزبائن ({restaurantReviews.length})
              </h3>
              {reviewsAllowSubmit && (
                <button
                  type="button"
                  className="pm-shape-btn"
                  onClick={() => setRateModalOpen(true)}
                  style={{
                    background: brandColor,
                    color: brandInk,
                    padding: '6px 11px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  أضف تقييمك
                </button>
              )}
            </div>
            {restaurantReviews.length === 0 ? (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--pm-muted)' }}>
                كن أول من يشارك تجربته ورأيه في أطباقنا!
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(restaurantReviews as RestaurantReview[]).slice(0, 5).map((rev: RestaurantReview) => (
                  <div key={rev.id} className="pm-review-item" style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <b style={{ fontSize: '13px', color: 'var(--pm-ink)' }}>{rev.name}</b>
                      <span style={{ color: '#fbbf24', fontSize: '12px' }}>
                        {'★'.repeat(rev.rate || rev.stars || 5)}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--pm-muted)' }}>{rev.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Bottom Tax, Social Media & Platform Footer */}
        <footer
          style={{
            marginTop: '28px',
            paddingTop: '16px',
            borderTop: '1px solid var(--pm-line)',
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--pm-muted)',
          }}
        >
          {rest.social && Object.values(rest.social).some(Boolean) && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '12px',
              }}
            >
              {rest.social.instagram && (
                <a
                  href={rest.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-order-type-pill"
                  style={{ height: '32px', padding: '0 11px', fontSize: '11.5px', textDecoration: 'none' }}
                >
                  انستغرام
                </a>
              )}
              {rest.social.facebook && (
                <a
                  href={rest.social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-order-type-pill"
                  style={{ height: '32px', padding: '0 11px', fontSize: '11.5px', textDecoration: 'none' }}
                >
                  فيسبوك
                </a>
              )}
              {rest.social.tiktok && (
                <a
                  href={rest.social.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-order-type-pill"
                  style={{ height: '32px', padding: '0 11px', fontSize: '11.5px', textDecoration: 'none' }}
                >
                  تيك توك
                </a>
              )}
              {rest.social.x && (
                <a
                  href={rest.social.x}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-order-type-pill"
                  style={{ height: '32px', padding: '0 11px', fontSize: '11.5px', textDecoration: 'none' }}
                >
                  منصة X
                </a>
              )}
              {rest.social.whatsapp && (
                <a
                  href={waLink(rest.social.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-order-type-pill"
                  style={{
                    height: '32px',
                    padding: '0 11px',
                    fontSize: '11.5px',
                    textDecoration: 'none',
                    background: 'rgba(16, 185, 129, 0.14)',
                    borderColor: 'rgba(16, 185, 129, 0.35)',
                    color: accentText,
                  }}
                >
                  واتساب
                </a>
              )}
            </div>
          )}

          {!isToters && rest.taxNote && <p style={{ margin: '0 0 10px' }}>{rest.taxNote}</p>}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>مدعوم بواسطة</span>
            <button
              type="button"
              onClick={() => onNavigate('/')}
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                color: accentText,
                fontWeight: 800,
                cursor: 'pointer',
                font: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AppLogo size={22} />
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => onNavigate('/signup')}
              style={{
                background: 'var(--pm-soft)',
                color: 'var(--pm-ink)',
                border: '1px solid var(--pm-line)',
                borderRadius: '99px',
                padding: '4px 11px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              امتلك منيو لمشروعك
            </button>
          </div>
        </footer>
      </div>

      {/* Floating Support / Spin Wheel Actions (when enabled) */}
      {(addons.spinWheelPromo?.enabled || addons.whatsappSupportFloat?.enabled) && !cartOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '96px',
            insetInlineEnd: '16px',
            zIndex: 45,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {addons.spinWheelPromo?.enabled && (
            <button
              type="button"
              className="pm-float-btn"
              onClick={() => setSpinModalOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                color: '#fff',
                padding: '10px 14px',
                fontWeight: 800,
                fontSize: '12.5px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{spinWonReward ? spinWonReward.label : 'جرّب حظك'}</span>
            </button>
          )}
          {addons.whatsappSupportFloat?.enabled && (rest.social?.whatsapp || rest.ph) && (
            <a
              className="pm-float-btn"
              href={waLink(
                rest.social?.whatsapp || rest.ph || '',
                addons.whatsappSupportFloat.prefillText ||
                  `مرحباً ${rest.n}، لدي استفسار`
              )}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#16a34a',
                color: '#fff',
                padding: '10px 14px',
                fontWeight: 800,
                fontSize: '12.5px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <MessageCircle size={16} />
              <span>{addons.whatsappSupportFloat.label || 'تواصل معنا'}</span>
            </a>
          )}
        </div>
      )}

      {/* Persistent Always-Floating Bottom Cart & Free Delivery Dock */}
      {!cartOpen && (
        <div className="pm-floating-dock">
          <div className="pm-dock-inner">
            {isToters && addons.loyaltyPoints?.enabled && (
              <div className="pm-toters-loyalty-bar">
                <span className="pm-toters-loyalty-bar-info">
                  <Gift size={16} style={{ color: accentText, flexShrink: 0 }} />
                  <span>
                    {totalCount > 0
                      ? `ستكسب +${earnedLoyaltyPoints} نقطة من طلبك`
                      : addons.loyaltyPoints.rewardNote || `اكسب ${addons.loyaltyPoints.pointsPerThousand || 1} نقطة لكل 1,000 ${currency}`}
                  </span>
                </span>
                <span className="pm-toters-loyalty-bar-badge tabular-nums">
                  {loyaltyBalance > 0 ? `رصيدك: ${loyaltyBalance} نقطة` : `${addons.loyaltyPoints.pointsPerThousand || 1} نقطة / 1,000`}
                </span>
              </div>
            )}

            {totalCount > 0 && freeDeliveryEnabled && freeDeliveryMin > 0 && orderType === 'delivery' && (
              <div className={`pm-fd-card ${qualifiesFreeDelivery ? 'qualifies' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={16} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 600 }}>
                    {qualifiesFreeDelivery ? (
                      'طلبك مؤهل للتوصيل المجاني!'
                    ) : (
                      <>
                        أضف{' '}
                        <strong className="tabular-nums">
                          {fmtMoney(freeDeliveryRemaining)}
                        </strong>{' '}
                        للحصول على توصيل مجاني
                      </>
                    )}
                  </span>
                  <span className="tabular-nums" style={{ fontSize: '11px', fontWeight: 700 }}>
                    {freeDeliveryPct}%
                  </span>
                </div>
                <div className="pm-fd-bar">
                  <div className="pm-fd-fill" style={{ width: `${freeDeliveryPct}%` }} />
                </div>
              </div>
            )}

            <button
              type="button"
              className="pm-cart-cta"
              onClick={() => {
                setCheckoutStep('cart');
                setCartOpen(true);
              }}
            >
              {isToters ? (
                <>
                  <span className="pm-toters-dock-badge tabular-nums">
                    {totalCount > 0 ? totalCount : <ShoppingBag size={16} />}
                  </span>
                  <span style={{ fontWeight: 900, fontSize: '15px' }}>
                    {totalCount > 0 ? 'عرض السلة' : 'سلة الطلبات'}
                  </span>
                  <span className="tabular-nums" style={{ fontWeight: 800, fontSize: '14px' }}>
                    {totalCount > 0 ? fmtMoney(subtotal) : 'افتح السلة'}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShoppingBag size={19} />
                    <span>{totalCount > 0 ? 'عرض السلة' : 'سلة الطلبات'}</span>
                    <span
                      className="tabular-nums"
                      style={{
                        background: 'rgba(255,255,255,0.22)',
                        borderRadius: '99px',
                        padding: '2px 9px',
                        fontSize: '12.5px',
                      }}
                    >
                      {totalCount}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {totalCount > 0 ? `${fmtMoney(subtotal)} ←` : 'افتح السلة ←'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {/* ================================================================
          MODAL 1: PRODUCT DETAIL SHEET (Sizes, Choices, Extras, Allergens)
          ================================================================ */}
      {activeProduct && (
        <div className="pm-modal-backdrop" onClick={() => setActiveProduct(null)}>
          <div
            className={`pm-sheet ${isToters ? 'pm-toters-product-sheet' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ position: 'relative' }}>
              {activeProduct.img ? (
                <img
                  src={activeProduct.img}
                  alt={activeProduct.n}
                  referrerPolicy="no-referrer"
                  style={{
                    width: '100%',
                    aspectRatio: isToters ? '16 / 11' : '16 / 10',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '150px',
                    background: 'var(--pm-soft)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--pm-muted)',
                  }}
                >
                  {isEstore ? <ShoppingBag size={40} /> : <Utensils size={40} />}
                </div>
              )}

              <button
                type="button"
                onClick={() => setActiveProduct(null)}
                aria-label="إغلاق"
                style={{
                  position: 'absolute',
                  top: '14px',
                  insetInlineEnd: '14px',
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: 'var(--pm-card)',
                  border: '1px solid var(--pm-line)',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: 'var(--pm-ink)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className={isToters ? 'pm-toters-sheet-body' : undefined} style={isToters ? undefined : { padding: '16px 18px 22px' }}>
              {isToters && popularItemIds.has(activeProduct.id) && (
                <div style={{ marginBottom: '6px' }}>
                  <span className="pm-toters-popular-pill">
                    <Flame size={12} fill="#f97316" color="#f97316" /> الأكثر طلباً
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <h2 style={{ margin: 0, fontSize: isToters ? '21px' : '20px', fontWeight: 900, color: 'var(--pm-ink)' }}>{activeProduct.n}</h2>
                {!isToters &&
                  activeProduct.badges
                    ?.filter((b) => {
                      const txt = String(b.text || '').trim();
                      if (/^(الأكثر|الاكثر)\s*طلب/i.test(txt)) {
                        return popularItemIds.has(activeProduct.id);
                      }
                      return true;
                    })
                    .map((b, i) => renderBadge(b, i))}
              </div>

              {((!isEstore && activeProduct.prepTime) || activeProduct.calories || selectedSize?.cal) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px', fontSize: '12.5px', color: 'var(--pm-muted)' }}>
                  {!isEstore && activeProduct.prepTime && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={14} /> {activeProduct.prepTime}
                    </span>
                  )}
                  {(selectedSize?.cal || activeProduct.calories) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Flame size={14} style={{ color: '#fb923c' }} /> {selectedSize?.cal || activeProduct.calories}
                    </span>
                  )}
                </div>
              )}

              {activeProduct.d && (
                <p style={{ margin: '0 0 12px', fontSize: '13.5px', color: 'var(--pm-muted)', lineHeight: 1.65 }}>
                  {activeProduct.d}
                </p>
              )}

              {isToters && (
                <div
                  className="tabular-nums"
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: 'var(--pm-ink)',
                    paddingBottom: '12px',
                    marginBottom: '12px',
                    borderBottom: '1px solid var(--pm-line)',
                  }}
                >
                  {formatNumber(modalBaseDiscounted)} {currency}
                </div>
              )}

              {/* Allergens / Product Specs & Warranty Accordion */}
              {activeProduct.allergens && (
                <div
                  style={{
                    border: isEstore ? '1px solid rgba(15, 118, 110, 0.25)' : '1px solid rgba(251, 191, 36, 0.35)',
                    background: isEstore ? 'rgba(15, 118, 110, 0.08)' : 'rgba(245, 158, 11, 0.12)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    marginBottom: '14px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAllergensOpen((p) => !p)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'none',
                      border: 0,
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: isEstore ? '#0f766e' : isLightMenu ? '#92400e' : '#FCD34D',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {isEstore ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}
                      <span>{isEstore ? 'مواصفات وضمان المنتج' : 'قد يحتوي على مسببات حساسية'}</span>
                    </span>
                    <ChevronDown
                      size={15}
                      style={{ transform: allergensOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                    />
                  </button>
                  {allergensOpen && (
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontSize: '12px',
                        color: isEstore ? '#001c38' : isLightMenu ? '#78350f' : '#FDE68A',
                        lineHeight: 1.55,
                      }}
                    >
                      {activeProduct.allergens}
                    </p>
                  )}
                </div>
              )}

              {/* Sizes */}
              {(() => {
                const validSizes = (activeProduct.sizes || [])
                  .map((s) => ({ ...s, n: getSizeLabel(s), p: getOptionPrice(s) }))
                  .filter((s) => s.n);
                if (validSizes.length === 0) return null;
                return (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                        {isEstore ? 'السعة / الخيار' : 'الحجم'}
                      </h4>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: accentText,
                          background: isToters ? 'var(--pm-soft)' : 'transparent',
                          padding: isToters ? '3px 8px' : 0,
                          borderRadius: '8px',
                        }}
                      >
                        مطلوب
                      </span>
                    </div>
                    {validSizes.map((sz, idx) => {
                      const isSel = selectedSize ? getSizeLabel(selectedSize) === sz.n : false;
                      const discountedSzPrice = applyMenuPriceDiscount(sz.p, activeMenuDiscount);
                      return (
                        <div
                          key={`${sz.n}_${idx}`}
                          className={`pm-option-row ${isSel ? 'selected' : ''}`}
                          onClick={() => setSelectedSize(sz)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <input type="radio" name="pm_size" checked={isSel} readOnly style={{ accentColor: accentText }} />
                            <div>
                              <b style={{ fontSize: '13.5px', color: 'var(--pm-ink)' }}>{sz.n}</b>
                              {sz.cal && (
                                <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--pm-muted)' }}>
                                  {sz.cal}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'end', flexShrink: 0 }}>
                            <b className="tabular-nums" style={{ color: accentText, fontSize: '14px', fontWeight: 900 }}>
                              {formatNumber(discountedSzPrice)} {currency}
                            </b>
                            {discountedSzPrice < sz.p && (
                              <span className="tabular-nums" style={{ display: 'block', fontSize: '11px', color: 'var(--pm-muted)', textDecoration: 'line-through' }}>
                                {formatNumber(sz.p)} {currency}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Choices (Free options — supports both string[] and { n }[]) */}
              {(() => {
                const validChoices = (activeProduct.choices || [])
                  .map((c) => getChoiceLabel(c))
                  .filter(Boolean);
                if (validChoices.length === 0) return null;
                const max = Math.max(1, Number(activeProduct.maxChoices) || 1);
                return (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                        الاختيارات <span style={{ color: accentText, fontSize: '12px', fontWeight: 700 }}>(مجاني)</span>
                      </h4>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--pm-muted)',
                          fontWeight: 700,
                          background: isToters ? 'var(--pm-soft)' : 'transparent',
                          padding: isToters ? '3px 8px' : 0,
                          borderRadius: '8px',
                        }}
                      >
                        {max === 1 ? 'خيار واحد مسموح' : `${max} خيارات مسموح لك`}
                      </span>
                    </div>
                    {validChoices.map((label, idx) => {
                      const checked = selectedChoices.includes(label);
                      return (
                        <div
                          key={`${label}_${idx}`}
                          className={`pm-option-row ${checked ? 'selected' : ''}`}
                          onClick={() => {
                            if (checked) {
                              setSelectedChoices((prev) => prev.filter((x) => x !== label));
                            } else if (max === 1) {
                              setSelectedChoices([label]);
                            } else if (selectedChoices.length < max) {
                              setSelectedChoices((prev) => [...prev, label]);
                            } else {
                              showToast(`يمكنك اختيار ${max} كحد أقصى`);
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <input
                              type={max === 1 ? 'radio' : 'checkbox'}
                              name={max === 1 ? 'pm_choice_single' : undefined}
                              checked={checked}
                              readOnly
                              style={{ accentColor: accentText }}
                            />
                            <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--pm-ink)' }}>{label}</span>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: accentText, flexShrink: 0 }}>
                            مجاني
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Extras (Paid optional addons) */}
              {(() => {
                const validExtras = (activeProduct.extras || [])
                  .map((ex) => ({ ...ex, n: getExtraLabel(ex), p: getOptionPrice(ex) }))
                  .filter((ex) => ex.n);
                if (validExtras.length === 0) return null;
                return (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                        {isEstore ? 'ملحقات وإضافات' : 'إضافات'}
                      </h4>
                      {(isToters || isEstore) && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--pm-muted)',
                            fontWeight: 700,
                            background: 'var(--pm-soft)',
                            padding: '3px 8px',
                            borderRadius: '8px',
                          }}
                        >
                          اختياري
                        </span>
                      )}
                    </div>
                    {validExtras.map((ex, idx) => {
                      const checked = selectedExtras.some((e) => getExtraLabel(e) === ex.n);
                      return (
                        <div
                          key={`${ex.n}_${idx}`}
                          className={`pm-option-row ${checked ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedExtras((prev) =>
                              checked ? prev.filter((e) => getExtraLabel(e) !== ex.n) : [...prev, ex]
                            );
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <input type="checkbox" checked={checked} readOnly style={{ accentColor: accentText }} />
                            <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--pm-ink)' }}>{ex.n}</span>
                          </div>
                          <span
                            className="tabular-nums"
                            style={{ fontSize: '13.5px', fontWeight: 900, color: accentText, flexShrink: 0 }}
                          >
                            {ex.p > 0 ? `+ ${formatNumber(ex.p)} ${currency}` : 'مجاني'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Special Instructions Box */}
              {!isDisplayOnlyItem(activeProduct) && (isToters || isEstore) && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '14.5px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                    {isEstore ? 'ملاحظات الطلب أو التغليف' : 'أي تعليمات خاصة؟'}
                  </h4>
                  <textarea
                    rows={2}
                    value={modalItemNote}
                    onChange={(e) => setModalItemNote(e.target.value)}
                    placeholder={isEstore ? 'أي ملاحظات أو طلب تغليف هدية؟' : 'اكتبها هنا'}
                    style={{
                      width: '100%',
                      resize: 'none',
                      fontSize: '13.5px',
                      fontFamily: 'inherit',
                      borderRadius: '14px',
                      padding: '10px 14px',
                    }}
                  />
                </div>
              )}

              {!isToters && rest.taxNote && (
                <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--pm-muted)', textAlign: 'center' }}>
                  {rest.taxNote}
                </p>
              )}

              {/* Quantity & Add to Cart Footer */}
              {!isDisplayOnlyItem(activeProduct) && (
                <div
                  className={isToters ? 'pm-toters-sheet-footer' : undefined}
                  style={
                    isToters
                      ? undefined
                      : {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          paddingTop: '12px',
                          borderTop: '1px solid var(--pm-line)',
                        }
                  }
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '10px',
                      border: '1px solid var(--pm-line)',
                      borderRadius: '14px',
                      padding: '6px 10px',
                      background: 'var(--pm-soft)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '8px',
                        border: '1px solid var(--pm-line)',
                        background: 'var(--pm-card)',
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center',
                        color: 'var(--pm-ink)',
                      }}
                    >
                      <Minus size={15} />
                    </button>
                    <b className="tabular-nums" style={{ minWidth: '20px', textAlign: 'center', color: 'var(--pm-ink)' }}>
                      {modalQty}
                    </b>
                    <button
                      type="button"
                      onClick={() => setModalQty((q) => q + 1)}
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '8px',
                        border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                        background: brandColor,
                        color: brandInk,
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Plus size={15} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddConfiguredToCart}
                    style={{
                      flex: 1,
                      border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                      borderRadius: '14px',
                      background: brandColor,
                      color: brandInk,
                      padding: '12px 15px',
                      fontSize: '14.5px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{isToters ? 'إضافة' : `إضافة ${modalQty} للسلة`}</span>
                    <span className="tabular-nums">
                      {formatNumber(modalUnitPrice * modalQty)} {currency}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 2: MULTI-STEP CART & CHECKOUT DRAWER (Sticky "متابعة الطلب")
          ================================================================ */}
      {cartOpen && (
        <div className="pm-modal-backdrop" onClick={() => setCartOpen(false)}>
          <div
            className="pm-sheet"
            style={{
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              maxHeight: '90vh',
              padding: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fixed Top Header */}
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--pm-line)',
                padding: '16px 18px 12px',
                background: 'var(--pm-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {checkoutStep === 'details' && (
                  <button
                    type="button"
                    onClick={() => setCheckoutStep('cart')}
                    style={{
                      border: '1px solid var(--pm-line)',
                      background: 'var(--pm-soft)',
                      borderRadius: '8px',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      color: 'var(--pm-ink)',
                    }}
                  >
                    <ChevronLeft size={16} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                )}
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                  {checkoutStep === 'done'
                    ? 'تم تأكيد طلبك'
                    : checkoutStep === 'details'
                    ? 'بيانات التوصيل والاستلام'
                    : isToters
                    ? 'سلتي'
                    : `سلة الطلبات (${totalCount})`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                style={{
                  border: '1px solid var(--pm-line)',
                  background: 'var(--pm-soft)',
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: 'var(--pm-ink)',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {checkoutStep === 'done' && lastOrderSummary ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: '18px 18px 24px', textAlign: 'center' }}>
                <div
                  style={{
                    width: '62px',
                    height: '62px',
                    borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.16)',
                    border: '1px solid rgba(52, 211, 153, 0.35)',
                    color: '#10B981',
                    margin: '0 auto 12px',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Check size={30} />
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 800, color: 'var(--pm-ink)' }}>
                  تم إرسال طلبك #{lastOrderSummary.orderSeq || lastOrderSummary.id.slice(-5)} بنجاح!
                </h3>
                <p style={{ margin: '0 0 18px', fontSize: '13.5px', color: 'var(--pm-muted)' }}>
                  {lastOrderSummary.channel === 'telegram' || !lastOrderSummary.waUrl
                    ? 'تم تسجيل طلبك وإرساله مباشرة إلى المتجر وتيليجرام بنجاح.'
                    : `تم تسجيل طلبك في لوحة تحكم ${isEstore ? 'المتجر' : 'المطعم'}، ويمكنك إعادة فتح رسالة الواتساب في أي وقت.`}
                </p>

                <div
                  style={{
                    background: 'var(--pm-soft)',
                    border: '1px solid var(--pm-line)',
                    borderRadius: '14px',
                    padding: '12px',
                    textAlign: 'start',
                    marginBottom: '16px',
                    fontSize: '13px',
                    color: 'var(--pm-ink)',
                  }}
                >
                  {lastOrderSummary.items.map((x, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span>
                        {x.n} {x.size ? `(${x.size})` : ''} × {x.q}
                      </span>
                      <b className="tabular-nums" style={{ color: 'var(--pm-ink)' }}>
                        {formatNumber(x.q * x.p)} {currency}
                      </b>
                    </div>
                  ))}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingTop: '8px',
                      marginTop: '6px',
                      borderTop: '1px dashed var(--pm-line)',
                      fontWeight: 900,
                      color: accentText,
                    }}
                  >
                    <span>الإجمالي النهائي</span>
                    <span className="tabular-nums">
                      {formatNumber(lastOrderSummary.total)} {currency}
                    </span>
                  </div>
                </div>

                {lastOrderSummary.waUrl && lastOrderSummary.channel !== 'telegram' && (
                  <a
                    href={lastOrderSummary.waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      background: '#16a34a',
                      color: '#fff',
                      borderRadius: '14px',
                      padding: '13px 16px',
                      fontWeight: 800,
                      fontSize: '15px',
                      marginBottom: '10px',
                      textDecoration: 'none',
                    }}
                  >
                    <MessageCircle size={19} />
                    <span>فتح محادثة الواتساب</span>
                  </a>
                )}

                {addons.curbsidePickupCar?.enabled && orderType === 'pickup' && addons.curbsidePickupCar.allowArrivedPing !== false && (rest.ph || rest.social?.whatsapp) && (
                  <a
                    href={waLink(
                      rest.ph || rest.social?.whatsapp || '',
                      `🚗 تنبيه وصول للاستلام من السيارة\nرقم الطلب: #${lastOrderSummary.orderSeq || lastOrderSummary.id.slice(-5)}\n${curbsideCarInfo.trim() ? `بيانات السيارة: ${curbsideCarInfo.trim()}\n` : ''}أنا الآن أمام المطعم لاستلام طلبي.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      background: '#f59e0b',
                      color: '#0f172a',
                      borderRadius: '14px',
                      padding: '13px 16px',
                      fontWeight: 900,
                      fontSize: '15px',
                      marginBottom: '10px',
                      textDecoration: 'none',
                    }}
                  >
                    <Car size={19} />
                    <span>{isEstore ? 'وصلت أمام المتجر 🚗' : 'وصلت أمام المطعم 🚗'}</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  style={{
                    width: '100%',
                    background: 'var(--pm-soft)',
                    color: 'var(--pm-ink)',
                    border: '1px solid var(--pm-line)',
                    borderRadius: '12px',
                    padding: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isEstore ? 'العودة للمتجر' : 'العودة لقائمة الطعام'}
                </button>
              </div>
            ) : cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 18px', color: 'var(--pm-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <ShoppingBag size={40} style={{ opacity: 0.55 }} />
                <p style={{ margin: 0, fontWeight: 800, fontSize: '15px', color: 'var(--pm-ink)' }}>سلتك فارغة حالياً</p>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--pm-muted)' }}>
                  {isEstore
                    ? 'أضف منتجاتك المفضلة من المتجر وسنحتفظ بها هنا أثناء تصفحك.'
                    : 'أضف أطباقك المفضلة من المنيو وسنحتفظ بها هنا أثناء تصفحك.'}
                </p>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  style={{
                    marginTop: '4px',
                    padding: '10px 22px',
                    borderRadius: '12px',
                    border: 'none',
                    background: brandColor,
                    color: brandInk,
                    fontSize: '13.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {isEstore ? 'تصفح المتجر' : 'تصفح المنيو'}
                </button>
              </div>
            ) : checkoutStep === 'cart' ? (
              <>
                {/* Scrollable Cart Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
                  {/* Order Type quick switcher inside cart */}
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${enabledTypes.length}, 1fr)`, gap: '6px', marginBottom: '14px' }}>
                    {enabledTypes.map((typeItem) => {
                      const active = orderType === typeItem;
                      return (
                        <button
                          key={typeItem}
                          type="button"
                          onClick={() => setOrderType(typeItem)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            padding: '10px 6px',
                            borderRadius: '11px',
                            border: active ? '1.5px solid var(--pm-brand)' : '1px solid var(--pm-line)',
                            background: active ? brandColor : 'var(--pm-soft)',
                            color: active ? brandInk : 'var(--pm-muted)',
                            fontSize: '12.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ color: active ? brandInk : 'var(--pm-muted)', display: 'inline-flex' }}>
                            {ORDER_TYPE_META[typeItem].icon}
                          </span>
                          <span>{ORDER_TYPE_META[typeItem].label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Delivery Area & City selector if configured */}
                  {orderType === 'delivery' && deliveryZones.length > 0 && (
                    <div
                      style={{
                        background: 'var(--pm-soft)',
                        border: '1px solid var(--pm-line)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        marginBottom: '14px',
                      }}
                    >
                      <div style={{ fontSize: '12.5px', fontWeight: 800, marginBottom: '8px', color: 'var(--pm-ink)' }}>
                        اختر منطقة التوصيل:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: hasMultipleSubCities ? '1fr 1fr' : '1fr', gap: '8px' }}>
                        <select
                          className="pm-field-card"
                          value={safeAreaIdx}
                          onChange={(e) => {
                            setSelectedAreaIdx(Number(e.target.value));
                            setSelectedCityIdx(0);
                          }}
                          style={{
                            background: 'var(--pm-card)',
                            color: 'var(--pm-ink)',
                            border: '1px solid var(--pm-line)',
                            borderRadius: '10px',
                            padding: '8px 10px',
                            fontSize: '12.5px',
                            fontWeight: 700,
                          }}
                        >
                          {deliveryZones.map((z, idx) => {
                            const flatFee = z.fee ?? z.cities?.[0]?.fee ?? 0;
                            const showFlatFee = !z.cities || z.cities.length <= 1;
                            return (
                              <option key={`${z.area}-${idx}`} value={idx}>
                                {z.area}
                                {showFlatFee ? ` (${formatNumber(flatFee)} ${currency})` : ''}
                              </option>
                            );
                          })}
                        </select>

                        {hasMultipleSubCities && (
                          <select
                            className="pm-field-card"
                            value={safeCityIdx}
                            onChange={(e) => setSelectedCityIdx(Number(e.target.value))}
                            style={{
                              background: 'var(--pm-card)',
                              color: 'var(--pm-ink)',
                              border: '1px solid var(--pm-line)',
                              borderRadius: '10px',
                              padding: '8px 10px',
                              fontSize: '12.5px',
                              fontWeight: 700,
                            }}
                          >
                            {zoneCities.map((ct, idx) => (
                              <option key={`${ct.name}-${idx}`} value={idx}>
                                {ct.name} ({formatNumber(ct.fee)} {currency})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      {activeCity?.eta && (
                        <div style={{ fontSize: '11.5px', color: 'var(--pm-muted)', marginTop: '6px' }}>
                          ⏱ مدة التوصيل المتوقعة: {activeCity.eta}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Toters Store Identity Card inside Cart Step 1 */}
                  {isToters && (
                    <div className="pm-toters-cart-store-card">
                      <div className="pm-toters-cart-store-logo">
                        {rest.logo ? (
                          <img src={rest.logo} alt={rest.n} referrerPolicy="no-referrer" />
                        ) : (
                          <span>{(rest.n || 'M').slice(0, 2)}</span>
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <b style={{ fontSize: '15px', fontWeight: 900, color: 'var(--pm-ink)', display: 'block' }}>
                          {rest.n}
                        </b>
                        <span style={{ fontSize: '12px', color: 'var(--pm-muted)', fontWeight: 600 }}>
                          {activeCity?.eta || '30 - 45 دقيقة'}
                        </span>
                      </div>
                    </div>
                  )}

                  {isToters && addons.loyaltyPoints?.enabled && (
                    <div className="pm-toters-cart-loyalty-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <Gift size={17} style={{ color: accentText, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: 'block', fontSize: '13px', fontWeight: 900, color: 'var(--pm-ink)' }}>
                            ستكسب +{earnedLoyaltyPoints} نقطة من هذا الطلب
                          </b>
                          {addons.loyaltyPoints.rewardNote && (
                            <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--pm-muted)' }}>
                              {addons.loyaltyPoints.rewardNote}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: '12px',
                          fontWeight: 900,
                          color: accentText,
                          flexShrink: 0,
                        }}
                      >
                        رصيدك: {loyaltyBalance}
                      </span>
                    </div>
                  )}

                  {/* Cart Line Items with Notes */}
                  <div
                    style={{
                      marginBottom: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: isToters ? '0' : '10px',
                    }}
                  >
                    {cart.map((line) =>
                      isToters ? (
                        <div key={line.key} className="pm-toters-cart-row">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                              <div className="pm-toters-cart-thumb">
                                {line.img ? (
                                  <img src={line.img} alt={line.name} referrerPolicy="no-referrer" />
                                ) : isEstore ? (
                                  <ShoppingBag size={18} style={{ color: 'var(--pm-muted)' }} />
                                ) : (
                                  <Utensils size={18} style={{ color: 'var(--pm-muted)' }} />
                                )}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <b style={{ fontSize: '14px', fontWeight: 800, color: 'var(--pm-ink)', display: 'block' }}>
                                  {line.name}
                                </b>
                                {(line.size || line.choices.length > 0 || line.extras.length > 0) && (
                                  <div style={{ fontSize: '11.5px', color: 'var(--pm-muted)', marginTop: '2px' }}>
                                    {[line.size, ...line.choices, ...line.extras].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                                <div className="tabular-nums" style={{ fontSize: '13.5px', fontWeight: 900, color: 'var(--pm-ink)', marginTop: '3px' }}>
                                  {formatNumber(line.unitPrice * line.qty)} {currency}
                                </div>
                              </div>
                            </div>

                            <div className="pm-toters-stepper">
                              <button
                                type="button"
                                onClick={() => updateCartLineQty(line.key, 1)}
                                aria-label="زيادة الكمية"
                              >
                                <Plus size={14} strokeWidth={2.5} />
                              </button>
                              <b className="tabular-nums">{line.qty}</b>
                              <button
                                type="button"
                                onClick={() => updateCartLineQty(line.key, -1)}
                                aria-label={line.qty <= 1 ? 'حذف الصنف' : 'إنقاص الكمية'}
                              >
                                {line.qty <= 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                              </button>
                            </div>
                          </div>

                          <input
                            type="text"
                            className="pm-field-card"
                            placeholder="ملاحظة لهذا المنتج (مثال: بدون بصل / صوص إضافي)"
                            value={line.notes || ''}
                            onChange={(e) => updateCartLineNotes(line.key, e.target.value)}
                            style={{
                              width: '100%',
                              fontSize: '12px',
                              padding: '7px 10px',
                              marginTop: '8px',
                              borderRadius: '10px',
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          key={line.key}
                          style={{
                            background: 'var(--pm-soft)',
                            border: '1px solid var(--pm-line)',
                            borderRadius: '14px',
                            padding: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '10px',
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <b style={{ fontSize: '14.5px', color: 'var(--pm-ink)', display: 'block' }}>{line.name}</b>
                              {(line.size || line.choices.length > 0 || line.extras.length > 0) && (
                                <div style={{ fontSize: '11.5px', color: 'var(--pm-muted)', marginTop: '2px' }}>
                                  {[line.size, ...line.choices, ...line.extras].filter(Boolean).join(' · ')}
                                </div>
                              )}
                              <div className="tabular-nums" style={{ fontSize: '14.5px', fontWeight: 900, color: accentText, marginTop: '4px' }}>
                                {formatNumber(line.unitPrice * line.qty)} {currency}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => updateCartLineQty(line.key, -1)}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  border: '1px solid var(--pm-line)',
                                  background: 'var(--pm-card)',
                                  color: 'var(--pm-ink)',
                                  fontWeight: 800,
                                  fontSize: '16px',
                                  cursor: 'pointer',
                                }}
                              >
                                -
                              </button>
                              <b className="tabular-nums" style={{ minWidth: '22px', textAlign: 'center', fontSize: '14px', color: 'var(--pm-ink)' }}>
                                {line.qty}
                              </b>
                              <button
                                type="button"
                                onClick={() => updateCartLineQty(line.key, 1)}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                                  background: brandColor,
                                  color: brandInk,
                                  fontWeight: 800,
                                  fontSize: '16px',
                                  cursor: 'pointer',
                                }}
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Note for each product */}
                          <div>
                            <input
                              type="text"
                              className="pm-field-card"
                              placeholder="ملاحظة لهذا المنتج (مثال: بدون بصل / صوص إضافي)"
                              value={line.notes || ''}
                              onChange={(e) => updateCartLineNotes(line.key, e.target.value)}
                              style={{
                                width: '100%',
                                fontSize: '12px',
                                padding: '7px 10px',
                                borderRadius: '8px',
                                border: '1px solid var(--pm-line)',
                                background: 'var(--pm-card)',
                                color: 'var(--pm-ink)',
                                outline: 'none',
                              }}
                            />
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {/* Cart Upsell Suggestions (Inside Cart) */}
                  {addons.cartUpsell?.enabled && (() => {
                    const inCartIds = new Set(cart.map((l) => l.itemId));
                    const maxItems = Math.max(1, Number(addons.cartUpsell.maxItems) || 4);
                    const suggestions = allItems
                      .filter(
                        (it) =>
                          !inCartIds.has(it.id) &&
                          !isDisplayOnlyItem(it) &&
                          itemEvalMap.get(it.id)?.available !== false
                      )
                      .slice(0, maxItems);
                    if (suggestions.length === 0) return null;
                    return (
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--pm-ink)', marginBottom: '8px' }}>
                          {addons.cartUpsell.title || 'أكمل وجبتك بهذه الإضافات اللذيذة'}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                          {suggestions.map((sug) => {
                            const sp = getPriceDisplay(sug, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                            return (
                              <div
                                key={sug.id}
                                style={{
                                  minWidth: '135px',
                                  background: 'var(--pm-soft)',
                                  border: '1px solid var(--pm-line)',
                                  borderRadius: '12px',
                                  padding: '8px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                  flexShrink: 0,
                                }}
                              >
                                {sug.img && (
                                  <img
                                    src={sug.img}
                                    alt={sug.n}
                                    referrerPolicy="no-referrer"
                                    style={{ width: '100%', height: '64px', objectFit: 'cover', borderRadius: '8px' }}
                                  />
                                )}
                                <b style={{ fontSize: '11.5px', color: 'var(--pm-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {sug.n}
                                </b>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                                  <span className="tabular-nums" style={{ fontSize: '11.5px', fontWeight: 900, color: accentText }}>
                                    {sp.main}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => quickAddOrOpenModal(sug, e)}
                                    style={{
                                      border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                                      borderRadius: '6px',
                                      background: brandColor,
                                      color: brandInk,
                                      width: '24px',
                                      height: '24px',
                                      display: 'grid',
                                      placeItems: 'center',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Free browsing button */}
                  <button
                    type="button"
                    onClick={() => setCartOpen(false)}
                    style={{
                      width: '100%',
                      border: '1.5px dashed var(--pm-line)',
                      borderRadius: '12px',
                      background: 'rgba(16, 185, 129, 0.08)',
                      color: accentText,
                      padding: '10px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      marginBottom: '12px',
                    }}
                  >
                    <Plus size={16} />
                    <span>تصفح الأقسام وإضافة أصناف أخرى</span>
                  </button>

                  {/* Free Delivery Progress inside Cart */}
                  {addons.freeDeliveryProgress?.enabled && freeDeliveryMin > 0 && orderType === 'delivery' && (
                    <div
                      style={{
                        background: qualifiesFreeDelivery ? 'rgba(16, 185, 129, 0.14)' : 'var(--pm-soft)',
                        border: qualifiesFreeDelivery ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid var(--pm-line)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        marginBottom: '12px',
                        fontSize: '12.5px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '6px', color: qualifiesFreeDelivery ? accentText : 'var(--pm-ink)' }}>
                        <span>
                          {qualifiesFreeDelivery
                            ? 'حصلت على توصيل مجاني'
                            : `أضف ${formatNumber(freeDeliveryRemaining)} ${currency} للتوصيل المجاني`}
                        </span>
                        <span className="tabular-nums">{freeDeliveryPct}%</span>
                      </div>
                      <div style={{ height: '6px', borderRadius: '99px', background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}>
                        <div style={{ width: `${freeDeliveryPct}%`, height: '100%', background: '#10b981' }} />
                      </div>
                    </div>
                  )}

                  {/* Free Gift Threshold Progress */}
                  {freeGiftEnabled && (
                    <div
                      style={{
                        background: qualifiesFreeGift ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.12)',
                        border: qualifiesFreeGift ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(251, 191, 36, 0.35)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        marginBottom: '12px',
                        fontSize: '12.5px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700, color: qualifiesFreeGift ? accentText : (isLightMenu ? '#b45309' : '#fbbf24'), marginBottom: '6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <Gift size={15} />
                          {qualifiesFreeGift
                            ? `تمت إضافة هديتك المجانية: ${addons.freeGiftThreshold?.giftName}`
                            : `أضف ${formatNumber(Math.max(0, freeGiftMin - subtotal))} ${currency} واحصل على: ${addons.freeGiftThreshold?.giftName}`}
                        </span>
                        <span className="tabular-nums">{freeGiftPct}%</span>
                      </div>
                      <div style={{ height: '6px', borderRadius: '99px', background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}>
                        <div style={{ width: `${freeGiftPct}%`, height: '100%', background: qualifiesFreeGift ? '#10b981' : '#f59e0b' }} />
                      </div>
                    </div>
                  )}

                  {/* Cutlery Option Addon */}
                  {addons.cutleryOption?.enabled && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--pm-soft)',
                        border: '1px solid var(--pm-line)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        marginBottom: '10px',
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: 'var(--pm-ink)',
                      }}
                    >
                      <span>
                        {addons.cutleryOption.label ||
                          (isEstore ? 'أحتاج تغليف هدية / فاتورة مطبوعة' : 'أحتاج أدوات طعام ومناديل مع الطلب')}
                      </span>
                      <input
                        type="checkbox"
                        checked={needCutlery}
                        onChange={(e) => setNeedCutlery(e.target.checked)}
                      />
                    </label>
                  )}

                  {/* Min Order Addon Warning */}
                  {belowMinOrder && (
                    <div
                      style={{
                        background: 'rgba(239, 68, 68, 0.14)',
                        border: '1px solid rgba(248, 113, 113, 0.35)',
                        color: isLightMenu ? '#B91C1C' : '#FCA5A5',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        marginBottom: '12px',
                      }}
                    >
                      {addons.minOrder?.message || 'الحد الأدنى للطلب هو'} {fmtMoney(minOrderAmount)} (متبقي{' '}
                      {fmtMoney(minOrderAmount - subtotal)})
                    </div>
                  )}

                  {/* Totals Card */}
                  <div
                    style={{
                      background: 'var(--pm-soft)',
                      border: '1px solid var(--pm-line)',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      fontSize: '13.5px',
                      marginBottom: '12px',
                      color: 'var(--pm-ink)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--pm-muted)' }}>الطلبات</span>
                      <b className="tabular-nums" style={{ color: 'var(--pm-ink)' }}>
                        {fmtMoney(subtotal)}
                      </b>
                    </div>
                    {firstOrderDiscountAmt > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: accentText }}>
                        <span>{addons.firstOrderDiscount?.title || 'خصم الطلب الأول'} ({firstOrderPct}%)</span>
                        <b className="tabular-nums">-{fmtMoney(firstOrderDiscountAmt)}</b>
                      </div>
                    )}
                    {spinDiscountAmt > 0 && spinWonReward && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: accentText }}>
                        <span>مكافأة عجلة الحظ ({spinWonReward.label})</span>
                        <b className="tabular-nums">-{fmtMoney(spinDiscountAmt)}</b>
                      </div>
                    )}
                    {pickupDiscountAmt > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: accentText }}>
                        <span>{addons.pickupInstantDiscount?.title || 'خصم الاستلام الفوري'} ({pickupPct}%)</span>
                        <b className="tabular-nums">-{fmtMoney(pickupDiscountAmt)}</b>
                      </div>
                    )}
                    {orderType === 'delivery' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--pm-muted)' }}>رسوم التوصيل</span>
                        {qualifiesFreeDelivery ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {rawDeliveryFee > 0 && (
                              <span style={{ textDecoration: 'line-through', color: 'var(--pm-muted)' }}>
                                {fmtMoney(rawDeliveryFee)}
                              </span>
                            )}
                            <span className="pm-badge green">مجاني</span>
                          </span>
                        ) : (
                          <b className="tabular-nums" style={{ color: 'var(--pm-ink)' }}>
                            {fmtMoney(effectiveDeliveryFee)}
                          </b>
                        )}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        paddingTop: '10px',
                        marginTop: '4px',
                        borderTop: '1px solid var(--pm-line)',
                        fontSize: '16px',
                        fontWeight: 900,
                        color: accentText,
                      }}
                    >
                      <span style={{ color: 'var(--pm-ink)' }}>المجموع النهائي</span>
                      <span className="tabular-nums" style={{ color: accentText }}>
                        {fmtMoney(finalTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Loyalty Points Info inside Cart */}
                  {addons.loyaltyPoints?.enabled && (
                    <div
                      style={{
                        background: 'rgba(59, 130, 246, 0.14)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '12px',
                        padding: '9px 12px',
                        marginBottom: '12px',
                        fontSize: '12px',
                        color: isLightMenu ? '#1d4ed8' : '#93C5FD',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>ستكسب {earnedLoyaltyPoints} نقطة من هذا الطلب</span>
                      <span>رصيدك الحالي: {loyaltyBalance}</span>
                    </div>
                  )}

                  {/* Group Order Bill Split Calculator */}
                  {addons.groupOrderBillSplit?.enabled && (
                    <div
                      style={{
                        background: 'var(--pm-soft)',
                        border: '1px solid var(--pm-line)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        fontSize: '12.5px',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--pm-ink)' }}>
                        <Users size={15} style={{ color: accentText }} />
                        تقسيم الفاتورة على:
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setSplitPeople((p) => Math.max(1, p - 1))}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            border: '1px solid var(--pm-line)',
                            background: 'var(--pm-card)',
                            color: 'var(--pm-ink)',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          -
                        </button>
                        <b className="tabular-nums" style={{ color: 'var(--pm-ink)' }}>{splitPeople} أشخاص</b>
                        <button
                          type="button"
                          onClick={() => setSplitPeople((p) => Math.min(Number(addons.groupOrderBillSplit?.maxPeople) || 10, p + 1))}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            border: '1px solid var(--pm-line)',
                            background: 'var(--pm-card)',
                            color: 'var(--pm-ink)',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          +
                        </button>
                        {splitPeople > 1 && (
                          <b className="tabular-nums" style={{ color: accentText }}>
                            ({formatNumber(Math.ceil(finalTotal / splitPeople))} {currency} / شخص)
                          </b>
                        )}
                      </div>
                    </div>
                  )}

                </div>

                {/* Sticky Pinned Bottom Footer — Always Visible When Scrolling Cart */}
                <div
                  style={{
                    flexShrink: 0,
                    padding: '12px 18px 16px',
                    borderTop: isToters ? '1.5px dashed var(--pm-line)' : '1px solid var(--pm-line)',
                    background: 'var(--pm-card)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {isToters && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingBottom: '4px',
                        fontSize: '15px',
                        fontWeight: 900,
                      }}
                    >
                      <span style={{ color: 'var(--pm-ink)' }}>المجموع الجزئي</span>
                      <span className="tabular-nums" style={{ color: 'var(--pm-ink)' }}>
                        {fmtMoney(finalTotal)}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (belowMinOrder) {
                        showToast(
                          `${addons.minOrder?.message || 'الحد الأدنى للطلب هو'} ${formatNumber(minOrderAmount)} ${currency}`
                        );
                        return;
                      }
                      setCheckoutStep('details');
                    }}
                    style={{
                      width: '100%',
                      border: belowMinOrder ? '1px solid rgba(148, 163, 184, 0.3)' : '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                      borderRadius: '14px',
                      background: belowMinOrder ? '#64748B' : brandColor,
                      color: belowMinOrder ? '#ffffff' : brandInk,
                      padding: '13px 16px',
                      fontSize: '15px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: isToters ? 'space-between' : 'center',
                    }}
                  >
                    <span>{isToters ? 'إتمام الشراء' : 'متابعة الطلب'}</span>
                    {isToters && (
                      <span className="tabular-nums" style={{ fontSize: '14px', fontWeight: 800 }}>
                        {fmtMoney(finalTotal)}
                      </span>
                    )}
                  </button>
                  {isToters && (
                    <button
                      type="button"
                      onClick={() => setCartOpen(false)}
                      style={{
                        width: '100%',
                        border: 'none',
                        borderRadius: '14px',
                        background: 'var(--pm-soft)',
                        color: 'var(--pm-ink)',
                        padding: '12px 16px',
                        fontSize: '14px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      أضف المزيد
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* STEP 2: CUSTOMER & DELIVERY / TABLE DETAILS */
              <form
                onSubmit={handleSubmitOrder}
                style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 24px' }}
              >
                {profileAutoFilled && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '11px',
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: isLightMenu ? '#047857' : '#6EE7B7',
                      fontSize: '12px',
                      fontWeight: 700,
                      marginBottom: '12px',
                    }}
                  >
                    <span>تم تعبئة معلوماتك المحفوظة تلقائياً ✓</span>
                    {orderType === 'delivery' && !gpsCoords && (
                      <span style={{ opacity: 0.9 }}>حدد GPS لموقعك الآن</span>
                    )}
                  </div>
                )}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: 'var(--pm-ink)', marginBottom: '6px' }}>
                    الاسم <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="اكتب اسمك الكامل للتواصل"
                    required
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: '12px',
                      border: '1px solid var(--pm-line)',
                      background: 'var(--pm-soft)',
                      color: 'var(--pm-ink)',
                      fontSize: '14px',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: 'var(--pm-ink)', marginBottom: '6px' }}>
                    {orderChannel === 'telegram'
                      ? 'رقم الهاتف للتواصل'
                      : 'رقم الهاتف / الواتساب'}{' '}
                    <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="07XXXXXXXXX"
                    required
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: '12px',
                      border: '1px solid var(--pm-line)',
                      background: 'var(--pm-soft)',
                      color: 'var(--pm-ink)',
                      fontSize: '14px',
                      fontWeight: 600,
                      outline: 'none',
                      textAlign: 'left',
                    }}
                  />
                </div>

                {orderType === 'table' && (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: 'var(--pm-ink)', marginBottom: '6px' }}>
                      رقم الطاولة (مطلوب لطلبات الصالة)
                    </label>
                    <select
                      value={selectedTable || '1'}
                      onChange={(e) => setSelectedTable(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '12px',
                        border: '1px solid var(--pm-line)',
                        background: 'var(--pm-soft)',
                        color: 'var(--pm-ink)',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}
                    >
                      {Array.from({ length: 15 }, (_, i) => String(i + 1)).map((num) => (
                        <option key={num} value={num}>
                          طاولة #{num}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {orderType === 'delivery' && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: 'var(--pm-ink)', marginBottom: '6px' }}>
                        العنوان التفصيلي <span style={{ color: '#f87171' }}>*</span>
                      </label>
                      <textarea
                        rows={2}
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        placeholder="اكتب اسم المنطقة، الشارع، رقم المبنى، وأقرب نقطة دالة للتوصيل..."
                        required
                        style={{
                          width: '100%',
                          padding: '11px 14px',
                          borderRadius: '12px',
                          border: '1px solid var(--pm-line)',
                          background: 'var(--pm-soft)',
                          color: 'var(--pm-ink)',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          outline: 'none',
                          resize: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    <div
                      style={{
                        background: gpsCoords ? 'rgba(16, 185, 129, 0.14)' : 'var(--pm-soft)',
                        border: gpsCoords ? '1.5px solid #34D399' : '1.5px dashed var(--pm-line)',
                        borderRadius: '14px',
                        padding: '12px 14px',
                        marginBottom: '14px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 800, color: gpsCoords ? (isLightMenu ? '#047857' : '#34D399') : 'var(--pm-ink)' }}>
                          <MapPin size={17} style={{ color: gpsCoords ? (isLightMenu ? '#059669' : '#34D399') : accentText }} />
                          <span>تحديد موقعك على خرائط جوجل</span>
                        </div>
                        {gpsCoords && (
                          <span style={{ fontSize: '11.5px', color: isLightMenu ? '#047857' : '#34D399', fontWeight: 800, background: 'rgba(16, 185, 129, 0.2)', padding: '2px 8px', borderRadius: '99px' }}>
                            تم الحفظ ✓
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleGetGps}
                        disabled={gpsLoading}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '11px',
                          border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                          background: gpsCoords ? '#059669' : brandColor,
                          color: gpsCoords ? '#ffffff' : brandInk,
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '7px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        }}
                      >
                        <MapPin size={15} />
                        <span>
                          {gpsLoading
                            ? 'جاري تحديد موقعك الجغرافي...'
                            : gpsCoords
                            ? 'تحديث إحداثيات موقعي الحالي'
                            : 'تحديد موقعي بدقة على الخريطة (GPS)'}
                        </span>
                      </button>

                      {gpsCoords && (
                        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: isLightMenu ? '#047857' : '#6EE7B7' }}>
                          <span>الإحداثيات: {gpsCoords.lat}, {gpsCoords.lng}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <a
                              href={`https://www.google.com/maps?q=${gpsCoords.lat},${gpsCoords.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: isLightMenu ? '#0369a1' : '#38bdf8', fontWeight: 700, textDecoration: 'underline' }}
                            >
                              Google Maps ↗
                            </a>
                            <a
                              href={`https://waze.com/ul?ll=${gpsCoords.lat},${gpsCoords.lng}&navigate=yes`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: isLightMenu ? '#0284c7' : '#7dd3fc', fontWeight: 700, textDecoration: 'underline' }}
                            >
                              Waze ↗
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {orderType === 'pickup' && (
                  <div
                    style={{
                      background: 'var(--pm-soft)',
                      border: '1px solid var(--pm-line)',
                      borderRadius: '12px',
                      padding: '10px 12px',
                      marginBottom: '14px',
                      fontSize: '12.5px',
                      color: 'var(--pm-ink)',
                    }}
                  >
                    <b>معلومات فرع الاستلام: {rest.n}</b>
                    {rest.mapUrl && (
                      <div style={{ marginTop: '4px' }}>
                        <a
                          href={rest.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: accentText, fontWeight: 700, textDecoration: 'underline' }}
                        >
                          عرض موقع الفرع على خرائط جوجل ←
                        </a>
                      </div>
                    )}

                    {addons.curbsidePickupCar?.enabled && (
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--pm-line)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: accentText, marginBottom: '4px' }}>
                          <Car size={15} />
                          <span>الاستلام السريع من السيارة</span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--pm-muted)', marginBottom: '6px' }}>
                          {addons.curbsidePickupCar.instructions || 'اكتب لون وموديل سيارتك أو رقم اللوحة وسنوصلها لباب السيارة'}
                        </div>
                        <input
                          type="text"
                          value={curbsideCarInfo}
                          onChange={(e) => setCurbsideCarInfo(e.target.value)}
                          placeholder="مثال: تويوتا كامري بيضاء — رقم 12345"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: '9px',
                            border: '1px solid var(--pm-line)',
                            background: 'var(--pm-card)',
                            color: 'var(--pm-ink)',
                            fontSize: '12.5px',
                            fontWeight: 700,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <label className="f" style={{ color: 'var(--pm-ink)' }}>
                  ملاحظات إضافية (اختياري)
                  <input
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder="بدون بصل، صوص جانبي، إلخ..."
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSubmittingOrder}
                  style={{
                    width: '100%',
                    border: '1px solid rgba(52, 211, 153, 0.4)',
                    borderRadius: '14px',
                    background: orderChannel === 'telegram' ? '#0088cc' : '#16a34a',
                    color: '#fff',
                    padding: '14px',
                    fontSize: '15px',
                    fontWeight: 800,
                    cursor: isSubmittingOrder ? 'wait' : 'pointer',
                    opacity: isSubmittingOrder ? 0.75 : 1,
                  }}
                >
                  {isSubmittingOrder
                    ? 'جاري إرسال الطلب...'
                    : `تأكيد وإرسال الطلب (${formatNumber(finalTotal)} ${currency})`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 3: HAMBURGER MENU DRAWER (Social, Hours, About, Health, Rate)
          ================================================================ */}
      {menuDrawerOpen && (
        <div className="pm-modal-backdrop" onClick={() => setMenuDrawerOpen(false)}>
          <div className="pm-sheet" style={{ padding: '18px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <b style={{ fontSize: '17px', color: 'var(--pm-ink)' }}>{rest.n}</b>
              <button
                type="button"
                onClick={() => setMenuDrawerOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="pm-option-row"
                onClick={() => {
                  setMenuDrawerOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <span style={{ fontWeight: 800, fontSize: '14.5px' }}>القائمة الرئيسية</span>
                <ChevronLeft size={16} />
              </button>

              <button
                type="button"
                className="pm-option-row"
                onClick={() => {
                  setMenuDrawerOpen(false);
                  setWorkModalOpen(true);
                }}
              >
                <span style={{ fontWeight: 800, fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={16} /> أوقات العمل
                </span>
                <ChevronLeft size={16} />
              </button>

              {rest.aboutText && (
                <button
                  type="button"
                  className="pm-option-row"
                  onClick={() => {
                    setMenuDrawerOpen(false);
                    setAboutModalOpen(true);
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={16} /> نبذة عنا
                  </span>
                  <ChevronLeft size={16} />
                </button>
              )}

              {reviewsAllowSubmit && (
                <button
                  type="button"
                  className="pm-option-row"
                  onClick={() => {
                    setMenuDrawerOpen(false);
                    setRateModalOpen(true);
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Star size={16} /> تقييم الخدمة
                  </span>
                  <ChevronLeft size={16} />
                </button>
              )}

              {rest.mapUrl && (
                <a
                  href={rest.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-option-row"
                  style={{ textDecoration: 'none' }}
                >
                  <span style={{ fontWeight: 800, fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={16} /> الموقع على الخريطة
                  </span>
                  <ChevronLeft size={16} />
                </a>
              )}

              <button
                type="button"
                className="pm-option-row"
                onClick={handleShareMenu}
              >
                <span style={{ fontWeight: 800, fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Share2 size={16} /> {isEstore ? 'مشاركة المتجر' : 'مشاركة المنيو'}
                </span>
                <ChevronLeft size={16} />
              </button>
            </div>

            {/* Social Media Links */}
            {rest.social && Object.values(rest.social).some(Boolean) && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                {rest.social.instagram && (
                  <a
                    href={rest.social.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-order-type-pill"
                    style={{ background: 'var(--pm-soft)', borderColor: 'var(--pm-line)', color: 'var(--pm-ink)', fontWeight: 800, textDecoration: 'none' }}
                  >
                    انستغرام
                  </a>
                )}
                {rest.social.facebook && (
                  <a
                    href={rest.social.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-order-type-pill"
                    style={{ background: 'var(--pm-soft)', borderColor: 'var(--pm-line)', color: 'var(--pm-ink)', fontWeight: 800, textDecoration: 'none' }}
                  >
                    فيسبوك
                  </a>
                )}
                {rest.social.tiktok && (
                  <a
                    href={rest.social.tiktok}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-order-type-pill"
                    style={{ background: 'var(--pm-soft)', borderColor: 'var(--pm-line)', color: 'var(--pm-ink)', fontWeight: 800, textDecoration: 'none' }}
                  >
                    تيك توك
                  </a>
                )}
                {rest.social.x && (
                  <a
                    href={rest.social.x}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-order-type-pill"
                    style={{ background: 'var(--pm-soft)', borderColor: 'var(--pm-line)', color: 'var(--pm-ink)', fontWeight: 800, textDecoration: 'none' }}
                  >
                    منصة X
                  </a>
                )}
                {rest.social.whatsapp && (
                  <a
                    href={waLink(rest.social.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pm-order-type-pill"
                    style={{ background: 'rgba(16, 185, 129, 0.16)', borderColor: 'rgba(52, 211, 153, 0.45)', color: accentText, fontWeight: 800, textDecoration: 'none' }}
                  >
                    واتساب
                  </a>
                )}
              </div>
            )}

            {/* Google Reviews CTA */}
            {rest.googleReviewUrl && (
              <a
                href={rest.googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pm-option-row"
                style={{ marginTop: '14px', textDecoration: 'none' }}
              >
                <span style={{ fontWeight: 800, fontSize: '14px' }}>⭐ قيّمنا على Google Maps</span>
                <ChevronLeft size={16} />
              </a>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 4: WORKING HOURS POPUP
          ================================================================ */}
      {workModalOpen && (
        <div className="pm-modal-backdrop" onClick={() => setWorkModalOpen(false)}>
          <div className="pm-sheet" style={{ padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--pm-ink)' }}>⏰ أوقات العمل</h3>
              <button
                type="button"
                onClick={() => setWorkModalOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>

            {rest.weeklyHours && Object.keys(rest.weeklyHours).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {DAY_LABELS.map((d) => {
                  const cfg = rest.weeklyHours?.[d.key];
                  return (
                    <div
                      key={d.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        background: 'var(--pm-soft)',
                        border: '1px solid var(--pm-line)',
                        fontSize: '13.5px',
                        color: 'var(--pm-ink)',
                      }}
                    >
                      <b>{d.label}</b>
                      {!cfg || !cfg.open ? (
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>مغلق</span>
                      ) : (
                        <span className="tabular-nums" style={{ color: accentText, fontWeight: 700 }}>
                          {formatTime12(cfg.from)} - {formatTime12(cfg.to)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ background: 'var(--pm-soft)', border: '1px solid var(--pm-line)', padding: '14px', borderRadius: '12px', textAlign: 'center', fontWeight: 700, color: 'var(--pm-ink)' }}>
                {rest.h?.m === '24'
                  ? 'نعمل على مدار 24 ساعة يومياً'
                  : `يومياً من ${formatTime12(rest.h?.f || '09:00')} إلى ${formatTime12(rest.h?.t || '23:00')}`}
              </div>
            )}

            {rest.acceptOrdersWhenClosed && (
              <p style={{ margin: '12px 0 0', fontSize: '12.5px', color: accentText, textAlign: 'center', fontWeight: 700 }}>
                ✓ نستقبل الطلبات حتى خارج أوقات الدوام الرسمي
              </p>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 5: ALL CATEGORIES JUMP POPUP
          ================================================================ */}
      {catsModalOpen && (
        <div className="pm-modal-backdrop" onClick={() => setCatsModalOpen(false)}>
          <div className="pm-sheet" style={{ padding: '18px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--pm-ink)' }}>قائمة التصنيفات</h3>
              <button
                type="button"
                onClick={() => setCatsModalOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>
            {allCategories.map((c) => {
              const count = allItems.filter((it) => it.cat === c.id).length;
              const catEval = categoryEvalMap.get(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="pm-option-row"
                  onClick={() => {
                    setActiveCatId(c.id);
                    if (isEstore) {
                      setEstoreCatFilter(c.id);
                    }
                    setCatsModalOpen(false);
                    window.setTimeout(() => {
                      document.getElementById(`mc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 40);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {c.img && (
                      <img
                        src={c.img}
                        alt={c.n}
                        style={{ width: '36px', height: '36px', borderRadius: '10px', objectFit: 'cover' }}
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div>
                      <b style={{ fontSize: '14.5px', color: 'var(--pm-ink)', display: 'block' }}>{c.n}</b>
                      {catEval?.hasSchedule && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: catEval.available ? 'var(--pm-muted)' : '#f59e0b',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <Clock size={10} />
                          <span>{catEval.badgeText}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="tabular-nums" style={{ color: accentText, fontWeight: 900 }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 6: SEARCH MODAL
          ================================================================ */}
      {searchOpen && (
        <div className="pm-modal-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="pm-sheet" style={{ padding: '18px', minHeight: '60vh' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isEstore ? 'ابحث عن منتج...' : 'ابحث عن وجبة أو مشروب...'}
                autoFocus
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery('');
                }}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '10px', padding: '9px 14px', fontWeight: 700, cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                إغلاق
              </button>
            </div>

            {!searchQuery.trim() ? (
              <p style={{ textAlign: 'center', color: 'var(--pm-muted)', marginTop: '40px' }}>
                {isEstore ? 'اكتب اسم المنتج لعرض النتائج فوراً...' : 'اكتب اسم الطبق لعرض النتائج فوراً...'}
              </p>
            ) : searchResults.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--pm-muted)', marginTop: '40px' }}>
                {isEstore ? `لا توجد منتجات مطابقة لـ "${searchQuery}"` : `لا توجد أصناف مطابقة لـ "${searchQuery}"`}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {searchResults.map((it) => {
                  const priceInfo = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                  return (
                    <div
                      key={it.id}
                      className="pm-option-row"
                      onClick={() => {
                        setSearchOpen(false);
                        openProductModal(it);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        {it.img && (
                          <img
                            src={it.img}
                            alt={it.n}
                            style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover' }}
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: 'block', fontSize: '14px', color: 'var(--pm-ink)' }}>{it.n}</b>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="tabular-nums" style={{ fontSize: '13px', color: accentText, fontWeight: 900 }}>
                              {priceInfo.main}
                            </span>
                            {priceInfo.rawBefore > 0 && (
                              <span
                                className="tabular-nums"
                                style={{ fontSize: '11px', color: 'var(--pm-muted)', textDecoration: 'line-through' }}
                              >
                                {formatNumber(priceInfo.rawBefore)} {currency}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span style={{ color: accentText, fontWeight: 800, fontSize: '12.5px' }}>عرض</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 7: ORDER TYPE SELECTOR POPUP
          ================================================================ */}
      {orderTypeModalOpen && (
        <div className="pm-modal-backdrop" onClick={() => setOrderTypeModalOpen(false)}>
          <div className="pm-sheet" style={{ padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 800, textAlign: 'center', color: 'var(--pm-ink)' }}>
              حدد طريقة الطلب
            </h3>
            {enabledTypes.map((t) => (
              <button
                key={t}
                type="button"
                className={`pm-option-row ${orderType === t ? 'selected' : ''}`}
                onClick={() => {
                  setOrderType(t);
                  setOrderTypeModalOpen(false);
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}>
                  <span style={{ color: accentText, display: 'inline-flex' }}>{ORDER_TYPE_META[t].icon}</span>
                  <span>{ORDER_TYPE_META[t].label}</span>
                </span>
                {orderType === t && <Check size={17} style={{ color: accentText }} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 8: ABOUT US POPUP
          ================================================================ */}
      {aboutModalOpen && (
        <div className="pm-modal-backdrop" onClick={() => setAboutModalOpen(false)}>
          <div className="pm-sheet" style={{ padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--pm-ink)' }}>نبذة عن {rest.n}</h3>
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>
            {rest.aboutImage && (
              <img
                src={rest.aboutImage}
                alt={rest.n}
                referrerPolicy="no-referrer"
                style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '14px', marginBottom: '12px' }}
              />
            )}
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.75, color: 'var(--pm-muted)' }}>{rest.aboutText}</p>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 10: SERVICE RATING POPUP
          ================================================================ */}
      {rateModalOpen && reviewsAllowSubmit && (
        <div className="pm-modal-backdrop" onClick={() => setRateModalOpen(false)}>
          <div className="pm-sheet" style={{ padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--pm-ink)' }}>⭐ تقييم الخدمة</h3>
              <button
                type="button"
                onClick={() => setRateModalOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmitReview}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setRevRate(num)}
                    style={{
                      border: 0,
                      background: 'none',
                      cursor: 'pointer',
                      color: num <= revRate ? '#f59e0b' : 'var(--pm-muted)',
                    }}
                  >
                    <Star size={30} fill={num <= revRate ? '#f59e0b' : 'none'} />
                  </button>
                ))}
              </div>
              <label className="f" style={{ color: 'var(--pm-ink)' }}>
                الاسم
                <input value={revName} onChange={(e) => setRevName(e.target.value)} required />
              </label>
              <label className="f" style={{ color: 'var(--pm-ink)' }}>
                رقم الهاتف (اختياري)
                <input type="tel" dir="ltr" placeholder="07701234567" value={revPhone} onChange={(e) => setRevPhone(e.target.value)} />
              </label>
              <label className="f" style={{ color: 'var(--pm-ink)' }}>
                تعليقك
                <textarea value={revComment} onChange={(e) => setRevComment(e.target.value)} rows={3} required />
              </label>
              <button
                type="submit"
                style={{
                  width: '100%',
                  border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                  borderRadius: '12px',
                  background: brandColor,
                  color: brandInk,
                  padding: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                إرسال التقييم
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 11: PROMOTIONAL OFFER POPUP (Ad close-only OR Dish add-to-cart)
          ================================================================ */}
      {offerModalOpen && offerPopupEnabled && offerPopupTitle && (
        <div
          className="pm-modal-backdrop"
          style={{ alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => setOfferModalOpen(false)}
        >
          <div
            className="pm-sheet"
            style={{
              width: 'min(410px, 100%)',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '24px',
              overflow: 'hidden',
              position: 'relative',
              padding: 0,
              boxShadow: '0 26px 64px rgba(0, 0, 0, 0.45)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOfferModalOpen(false)}
              aria-label="إغلاق"
              style={{
                position: 'absolute',
                top: '12px',
                insetInlineEnd: '12px',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: 'rgba(15, 23, 42, 0.56)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: '#ffffff',
                zIndex: 10,
              }}
            >
              <X size={16} />
            </button>

            {offerPopupImage && (
              <div style={{ position: 'relative', width: '100%', height: '205px', flexShrink: 0, overflow: 'hidden', background: 'var(--pm-soft)' }}>
                <img
                  src={offerPopupImage}
                  alt={offerPopupTitle}
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    insetInline: 0,
                    bottom: 0,
                    height: '44px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.28), transparent)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            )}

            <div
              style={{
                padding: offerPopupImage ? '18px 22px 22px' : '46px 22px 22px',
                overflowY: 'auto',
                textAlign: 'center',
              }}
            >
              {offerPopupBadge && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 12px',
                    borderRadius: '999px',
                    background: 'var(--pm-soft)',
                    border: '1px solid color-mix(in srgb, var(--pm-brand) 30%, transparent)',
                    color: accentText,
                    fontSize: '12px',
                    fontWeight: 800,
                    marginBottom: '10px',
                  }}
                >
                  {offerPopupBadge}
                </div>
              )}

              <h3 style={{ margin: '0 0 8px', fontSize: '19px', fontWeight: 900, color: 'var(--pm-ink)', lineHeight: 1.35 }}>
                {offerPopupTitle}
              </h3>

              {offerPopupSubtitle && (
                <p style={{ margin: '0 0 16px', fontSize: '13.5px', color: 'var(--pm-muted)', lineHeight: 1.6 }}>
                  {offerPopupSubtitle}
                </p>
              )}

              {offerPopupMode === 'dish' && (offerPopupSpecialPrice !== undefined || offerPopupLinkedItem) && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '6px 16px',
                    borderRadius: '14px',
                    background: 'var(--pm-soft)',
                    marginBottom: '16px',
                  }}
                >
                  {offerPopupSpecialPrice !== undefined ? (
                    <>
                      {offerPopupLinkedItem && offerPopupLinkedItem.pr > offerPopupSpecialPrice && (
                        <s className="tabular-nums" style={{ fontSize: '12.5px', color: 'var(--pm-muted)', fontWeight: 700 }}>
                          {fmtMoney(offerPopupLinkedItem.pr)}
                        </s>
                      )}
                      <b className="tabular-nums" style={{ fontSize: '15.5px', fontWeight: 900, color: accentText }}>
                        {fmtMoney(offerPopupSpecialPrice)}
                      </b>
                    </>
                  ) : offerPopupLinkedItem ? (
                    <b className="tabular-nums" style={{ fontSize: '15.5px', fontWeight: 900, color: accentText }}>
                      {fmtMoney(offerPopupLinkedItem.pr)}
                    </b>
                  ) : null}
                </div>
              )}

              <div
                dir="rtl"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                {offerPopupMode === 'dish' && !(offerPopupLinkedItem && isDisplayOnlyItem(offerPopupLinkedItem)) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setOfferModalOpen(false);
                        if (offerPopupLinkedItem) {
                          if (isDisplayOnlyItem(offerPopupLinkedItem)) return;
                          if (offerPopupSpecialPrice !== undefined) {
                            addSpecialCustomLine(
                              `offer_${offerPopupLinkedItem.id}`,
                              offerPopupTitle || offerPopupLinkedItem.n,
                              offerPopupSpecialPrice,
                              offerPopupBadge || 'عرض خاص',
                              offerPopupImage || offerPopupLinkedItem.img
                            );
                          } else {
                            quickAddOrOpenModal(offerPopupLinkedItem);
                          }
                        } else if (offerPopupSpecialPrice !== undefined) {
                          addSpecialCustomLine(
                            `offer_popup_${restaurantId}`,
                            offerPopupTitle,
                            offerPopupSpecialPrice,
                            offerPopupBadge || 'عرض خاص',
                            offerPopupImage || undefined
                          );
                        } else {
                          const firstSection = document.querySelector<HTMLElement>('section[id^="mc-"]');
                          if (firstSection) {
                            firstSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }
                      }}
                      style={{
                        flex: '1 1 160px',
                        height: '42px',
                        padding: '0 18px',
                        borderRadius: '14px',
                        border: 'none',
                        background: brandColor,
                        color: brandInk,
                        fontWeight: 800,
                        fontSize: '13.5px',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '7px',
                        boxShadow: '0 6px 18px color-mix(in srgb, var(--pm-brand) 28%, transparent)',
                        cursor: 'pointer',
                      }}
                    >
                      <ShoppingBag size={15} />
                      <span>{offerPopupBtnText}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOfferModalOpen(false)}
                      style={{
                        height: '42px',
                        padding: '0 18px',
                        borderRadius: '14px',
                        border: '1px solid var(--pm-line)',
                        background: 'var(--pm-soft)',
                        color: 'var(--pm-ink)',
                        fontWeight: 700,
                        fontSize: '13px',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      إغلاق
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOfferModalOpen(false)}
                    style={{
                      minWidth: '160px',
                      height: '42px',
                      padding: '0 24px',
                      borderRadius: '14px',
                      border: '1px solid var(--pm-line)',
                      background: 'var(--pm-soft)',
                      color: 'var(--pm-ink)',
                      fontWeight: 800,
                      fontSize: '13.5px',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    {offerPopupBtnText}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL 12: INTERACTIVE SPIN-THE-WHEEL PROMO MODAL
          ================================================================ */}
      {spinModalOpen && addons.spinWheelPromo?.enabled && (
        <div className="pm-modal-backdrop" onClick={() => setSpinModalOpen(false)}>
          <div
            className="pm-sheet"
            style={{ borderRadius: '24px', maxWidth: '400px', padding: '24px', textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--pm-ink)' }}>{addons.spinWheelPromo.title || 'عجلة الحظ'}</h3>
              <button
                type="button"
                onClick={() => setSpinModalOpen(false)}
                style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--pm-ink)' }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                width: '190px',
                height: '190px',
                margin: '12px auto 18px',
                borderRadius: '50%',
                border: `6px solid ${accentText}`,
                background: 'conic-gradient(#f59e0b 0deg 90deg, #10b981 90deg 180deg, #3b82f6 180deg 270deg, #ef4444 270deg 360deg)',
                display: 'grid',
                placeItems: 'center',
                transform: `rotate(${wheelDeg}deg)`,
                transition: 'transform 3.3s cubic-bezier(0.17, 0.67, 0.25, 1)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
              }}
            >
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--pm-card)', border: '2px solid var(--pm-line)', display: 'grid', placeItems: 'center', color: accentText, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
                <Gift size={24} />
              </div>
            </div>

            {spinWonReward ? (
              <div style={{ background: 'rgba(16, 185, 129, 0.16)', border: '1px solid rgba(52, 211, 153, 0.4)', color: accentText, borderRadius: '14px', padding: '12px', marginBottom: '12px', fontWeight: 800 }}>
                مبروك! ربحت: {spinWonReward.label} (سيُطبق في السلة تلقائياً)
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--pm-muted)', marginBottom: '14px' }}>
                اضغط لتدوير العجلة واربح خصماً فورياً أو توصيلاً مجانياً لطلبك اليوم!
              </p>
            )}

            <button
              type="button"
              disabled={isSpinning || Boolean(spinWonReward)}
              onClick={handleSpinWheel}
              style={{
                width: '100%',
                border: '1px solid color-mix(in srgb, var(--pm-brand) 45%, transparent)',
                borderRadius: '12px',
                background: spinWonReward ? '#059669' : brandColor,
                color: spinWonReward ? '#ffffff' : brandInk,
                padding: '13px',
                fontWeight: 800,
                fontSize: '14.5px',
                cursor: isSpinning || spinWonReward ? 'default' : 'pointer',
              }}
            >
              {isSpinning
                ? 'جاري تدوير العجلة...'
                : spinWonReward
                ? '✓ تم تفعيل المكافأة بالسلة'
                : 'أدر العجلة الآن'}
            </button>
          </div>
        </div>
      )}

      {/* Mood Meal / Smart Store Finder Modal */}
      {moodModalOpen && addons.moodMealFinder?.enabled && (() => {
        const moods: Array<{ id: 'fast' | 'light' | 'spicy' | 'sweet'; emoji: string; label: string; desc: string }> = isEstore
          ? [
              { id: 'fast', emoji: '📱', label: 'هواتف وأجهزة رائدة', desc: 'أحدث الهواتف واللابتوبات الذكية' },
              { id: 'light', emoji: '🎧', label: 'سماعات وصوتيات', desc: 'سماعات لاسلكية وصوت محيطي' },
              { id: 'spicy', emoji: '⌚', label: 'ساعات وإكسسوارات', desc: 'ساعات ذكية وشواحن وكفرات' },
              { id: 'sweet', emoji: '🎮', label: 'ألعاب وعروض قوية', desc: 'أجهزة ترفيه وتخفيضات مميزة' },
            ]
          : [
              { id: 'fast', emoji: '⚡', label: 'جوعان ومستعجل', desc: 'أطباق رئيسية سريعة التحضير' },
              { id: 'light', emoji: '🥗', label: 'خفيف وصحي', desc: 'سعرات أخف واختيارات منعشة' },
              { id: 'spicy', emoji: '🔥', label: 'نكهة قوية ومميزة', desc: 'مشويات ونكهات حارة ومميزة' },
              { id: 'sweet', emoji: '🍰', label: 'شيء حلو ومزاج عالي', desc: 'حلويات ومشروبات ترفع المزاج' },
            ];
        const availablePool = allItems.filter(
          (it) => !isDisplayOnlyItem(it) && itemEvalMap.get(it.id)?.available !== false
        );
        const picks = (() => {
          if (isEstore) {
            if (selectedMood === 'light') {
              const matched = availablePool.filter((i) => /سماع|صوت|airpods|buds|headphone|speaker|audio/i.test(`${i.n} ${i.d || ''}`));
              return (matched.length ? matched : availablePool).slice(0, 3);
            }
            if (selectedMood === 'spicy') {
              const matched = availablePool.filter((i) => /ساع|شاحن|كفر|watch|cable|charger|case|mag/i.test(`${i.n} ${i.d || ''}`));
              return (matched.length ? matched : availablePool).slice(0, 3);
            }
            if (selectedMood === 'sweet') {
              const matched = availablePool.filter((i) => /لعب|بلاي|شاش|gaming|ps5|console|keyboard|خصم/i.test(`${i.n} ${i.d || ''}`));
              return (matched.length ? matched : availablePool.slice(-3)).slice(0, 3);
            }
            const matched = availablePool.filter((i) => /هاتف|ايفون|سامسونج|لابتوب|ماك|ايباد|iphone|macbook|galaxy|ipad/i.test(`${i.n} ${i.d || ''}`));
            return (matched.length ? matched : availablePool).slice(0, 3);
          }
          if (selectedMood === 'light') {
            const matched = availablePool.filter((i) => /سلط|خفيف|مشوي|صحي|دايت|تونة|salad|grill|light|healthy/i.test(`${i.n} ${i.d || ''}`));
            return (matched.length ? matched : [...availablePool].sort((a, b) => (parseCaloriesNum(a.calories) || 9999) - (parseCaloriesNum(b.calories) || 9999))).slice(0, 3);
          }
          if (selectedMood === 'spicy') {
            const matched = availablePool.filter((i) => /حار|سبايسي|فلفل|مشوي|كباب|زنجر|spicy|hot|chili|zinger/i.test(`${i.n} ${i.d || ''}`));
            return (matched.length ? matched : availablePool).slice(0, 3);
          }
          if (selectedMood === 'sweet') {
            const matched = availablePool.filter((i) => /حلو|كيك|عصير|قهوة|شاي|كنافة|وافل|موهيتو|مشروب|cake|sweet|juice|coffee|tea|waffle/i.test(`${i.n} ${i.d || ''}`));
            return (matched.length ? matched : availablePool.slice(-3)).slice(0, 3);
          }
          return availablePool.slice(0, 3);
        })();
        return (
          <div className="pm-modal-backdrop" onClick={() => setMoodModalOpen(false)}>
            <div className="pm-sheet" style={{ padding: '20px' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <b style={{ fontSize: '17px', color: 'var(--pm-ink)' }}>
                  {addons.moodMealFinder.title ||
                    (isEstore ? 'مستشار التسوق الذكي — اختر ما يناسب احتياجك' : 'اختر وجبتك حسب مزاجك الآن')}
                </b>
                <button
                  type="button"
                  onClick={() => setMoodModalOpen(false)}
                  style={{ border: '1px solid var(--pm-line)', background: 'var(--pm-soft)', width: '32px', height: '32px', borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--pm-ink)' }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '14px' }}>
                {moods.map((m) => {
                  const active = selectedMood === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMood(m.id)}
                      style={{
                        textAlign: 'start',
                        padding: '10px',
                        borderRadius: '12px',
                        border: active ? '1.5px solid var(--pm-brand)' : '1px solid var(--pm-line)',
                        background: active ? 'color-mix(in srgb, var(--pm-brand) 14%, transparent)' : 'var(--pm-soft)',
                        color: 'var(--pm-ink)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: '15px', fontWeight: 900 }}>{m.emoji} {m.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--pm-muted)', marginTop: '2px' }}>{m.desc}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: accentText, marginBottom: '8px' }}>
                {isEstore ? 'أفضل الترشيحات لطلبك الآن:' : 'ترشيحاتنا الذكية لمزاجك الآن:'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {picks.map((it) => {
                  const sp = getPriceDisplay(it, currency, activeMenuDiscount, resolvedPlan.perms.itemDiscounts);
                  return (
                    <div
                      key={it.id}
                      className="pm-option-row"
                      onClick={() => {
                        setMoodModalOpen(false);
                        openProductModal(it);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        {it.img && (
                          <img src={it.img} alt={it.n} referrerPolicy="no-referrer" style={{ width: '44px', height: '44px', borderRadius: '9px', objectFit: 'cover' }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: 'block', fontSize: '13.5px', color: 'var(--pm-ink)' }}>{it.n}</b>
                          <span className="tabular-nums" style={{ fontSize: '12px', fontWeight: 900, color: accentText }}>{sp.main}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          quickAddOrOpenModal(it, e);
                          setMoodModalOpen(false);
                        }}
                        style={{
                          border: 'none',
                          borderRadius: '9px',
                          background: brandColor,
                          color: brandInk,
                          padding: '6px 11px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        + أضف
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {shareModalOpen && (
        <Suspense fallback={null}>
          <ShareMenuModal
            isOpen={true}
            onClose={() => setShareModalOpen(false)}
            menuName={rest.n}
            menuUrl={typeof window !== 'undefined' ? window.location.href : ''}
            description={rest.tagline}
            onCopied={showToast}
            isStore={isEstore}
            palette={{
              bg: customBgColor,
              card: effectiveSurface,
              ink: effectiveInk,
              muted: effectiveMuted,
              line: effectiveLine,
              soft: effectiveSurfaceSoft,
              brand: brandColor,
              onBrand: brandInk,
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export const PublicMenuView: React.FC<PublicMenuViewProps> = ({
  restaurantId,
  session,
  onNavigate,
  showToast,
}) => {
  const [syncTick, setSyncTick] = useState(0);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const autoPromptedRootRef = React.useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const handleDbUpdated = () => {
      if (active) setSyncTick((prev) => prev + 1);
    };
    window.addEventListener('menuplus_db_updated', handleDbUpdated);
    return () => {
      active = false;
      window.removeEventListener('menuplus_db_updated', handleDbUpdated);
    };
  }, []);

  const entryRest = getItem<Restaurant>(`restaurants/${restaurantId}`);
  const rootRid =
    entryRest?.isBranch && entryRest?.parentRid
      ? entryRest.parentRid
      : entryRest?.id || restaurantId;
  const rawMainBranch = getItem<Restaurant>(`restaurants/${rootRid}`) || entryRest;
  const isFamilyOwner = Boolean(
    session && ((session.admin && !session.menuLoggedOut) || session.rid === rootRid || session.personalRid === rootRid)
  );
  const allRests = getCollection<Restaurant>('restaurants');
  const childBranches = allRests.filter(
    (r) => r.parentRid === rootRid && r.isBranch && (isFamilyOwner || r.a !== 0)
  );
  const allFamilyBranches = [rawMainBranch, ...childBranches]
    .filter((b): b is Restaurant => Boolean(b && b.id))
    .filter((b, idx, arr) => arr.findIndex((x) => x.id === b.id) === idx)
    .map((b) => ensureRestaurantDefaults(b));

  const hasMultipleBranches = allFamilyBranches.length >= 2;
  const prefKey = `menuplus_selected_branch_${rootRid}`;

  const readSavedBranchId = (): string | null => {
    try {
      const saved = window.localStorage.getItem(prefKey);
      if (saved && allFamilyBranches.some((b) => b.id === saved)) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return null;
  };

  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (isFamilyOwner) return restaurantId;
    return readSavedBranchId() || restaurantId;
  });

  useEffect(() => {
    if (isFamilyOwner) {
      setSelectedBranchId(restaurantId);
      return;
    }
    const saved = readSavedBranchId();
    setSelectedBranchId(saved || restaurantId);
  }, [restaurantId, rootRid, isFamilyOwner]);

  useEffect(() => {
    if (!hasMultipleBranches) {
      setBranchPickerOpen(false);
      return;
    }
    const saved = readSavedBranchId();
    if (saved) {
      if (!isFamilyOwner) {
        setSelectedBranchId(saved);
      }
      return;
    }
    if (autoPromptedRootRef.current !== rootRid) {
      autoPromptedRootRef.current = rootRid;
      setBranchPickerOpen(true);
    }
  }, [hasMultipleBranches, rootRid, syncTick, isFamilyOwner]);

  const effectiveRestaurantId =
    hasMultipleBranches && allFamilyBranches.some((b) => b.id === selectedBranchId)
      ? selectedBranchId
      : restaurantId;

  const activeBranchObj =
    allFamilyBranches.find((b) => b.id === effectiveRestaurantId) || allFamilyBranches[0];
  const branchShortLabel = !activeBranchObj
    ? 'اختر الفرع'
    : activeBranchObj.id === rootRid
    ? 'الفرع الرئيسي'
    : activeBranchObj.branchName || activeBranchObj.n;

  const activeTheme = getMenuThemeById(activeBranchObj?.themePreset, activeBranchObj?.themeMode);
  const activeMode = activeTheme.mode;
  const modalBg = activeBranchObj?.bgColor || activeTheme.bg;
  const modalCard = activeTheme.surface;
  const modalInk = getContrastInk(modalCard);
  const modalMuted = activeMode === 'light' ? '#64748b' : '#94a3b8';
  const modalLine = activeMode === 'light' ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.12)';
  const modalBrand = activeBranchObj?.color || activeTheme.brand;
  const modalBrandInk = getContrastInk(modalBrand);

  const handleChooseBranch = (branchId: string) => {
    try {
      window.localStorage.setItem(prefKey, branchId);
    } catch {
      // ignore storage errors
    }
    setSelectedBranchId(branchId);
    setBranchPickerOpen(false);
  };

  const handleDismissBranchPicker = () => {
    setBranchPickerOpen(false);
  };

  return (
    <>
      <PublicMenuContent
        key={effectiveRestaurantId}
        restaurantId={effectiveRestaurantId}
        session={session}
        onNavigate={onNavigate}
        showToast={showToast}
        hasMultipleBranches={hasMultipleBranches}
        branchShortLabel={branchShortLabel}
        onOpenBranchPicker={() => setBranchPickerOpen(true)}
      />

      {hasMultipleBranches && branchPickerOpen && (
        <div
          className="pm-modal-backdrop"
          style={{ zIndex: 99999 }}
          onClick={handleDismissBranchPicker}
        >
          <div
            className="pm-sheet"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            style={{
              borderRadius: '24px',
              maxWidth: '430px',
              padding: '20px',
              background: modalCard,
              color: modalInk,
              border: `1px solid ${modalLine}`,
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '11px',
                    background: `color-mix(in srgb, ${modalBrand} 18%, ${modalBg})`,
                    color: modalBrand,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <GitBranch size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: modalInk }}>
                    اختر الفرع
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: modalMuted }}>
                    الفرع الحالي: {branchShortLabel} · اختر الفرع لعرض المنيو الخاص به، ويمكنك تبديله لاحقاً من الأعلى
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDismissBranchPicker}
                aria-label="إغلاق"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: `1px solid ${modalLine}`,
                  background: modalBg,
                  color: modalMuted,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '14px', maxHeight: '60vh', overflowY: 'auto' }}>
              {allFamilyBranches.map((branch) => {
                const isMain = branch.id === rootRid;
                const isSelected = branch.id === effectiveRestaurantId;
                const branchTitle = isMain
                  ? `${branch.n} (الفرع الرئيسي)`
                  : branch.branchName || branch.n;
                const branchOpen = isRestaurantOpenNow(branch);
                return (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => handleChooseBranch(branch.id)}
                    style={{
                      width: '100%',
                      textAlign: 'start',
                      padding: '13px 14px',
                      borderRadius: '15px',
                      border: isSelected ? `2px solid ${modalBrand}` : `1px solid ${modalLine}`,
                      background: isSelected
                        ? `color-mix(in srgb, ${modalBrand} 12%, ${modalBg})`
                        : modalBg,
                      color: modalInk,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      transition: 'transform 0.14s ease, border-color 0.14s ease',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <b style={{ fontSize: '14px', color: modalInk }}>{branchTitle}</b>
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: '8px',
                            background: branchOpen ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                            color: branchOpen ? '#10b981' : '#ef4444',
                          }}
                        >
                          {branchOpen ? 'مفتوح' : 'مغلق'}
                        </span>
                      </div>
                      {(branch.address || branch.ph) && (
                        <div style={{ fontSize: '11.5px', color: modalMuted, marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {branch.address ? `📍 ${branch.address}` : ''}
                          {branch.address && branch.ph ? ' • ' : ''}
                          {branch.ph ? `📞 ${branch.ph}` : ''}
                        </div>
                      )}
                    </div>

                    {isSelected ? (
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: modalBrand,
                          color: modalBrandInk,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Check size={13} strokeWidth={3} />
                      </span>
                    ) : (
                      <ChevronLeft size={16} style={{ color: modalMuted, flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
