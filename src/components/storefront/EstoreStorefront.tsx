/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  GitBranch,
  Heart,
  Home,
  LayoutGrid,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Package,
  Percent,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Star,
  Store,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import type {
  Category,
  MenuItem,
  OrderType,
  Restaurant,
  RestaurantAddons,
  RestaurantReview,
} from '../../types';
import type { ActiveMenuDiscount } from '../../data/addonsCatalog';
import type { CategoryAvailabilityResult, ItemAvailabilityResult } from '../../utils/availability';
import { formatNumber, waLink } from '../../utils/storage';
import { AppLogo } from '../AppLogo';

export interface EstorePriceInfo {
  main: string;
  min: number;
  rawBefore: number;
  savings: number;
}

export interface EstoreStorefrontProps {
  rest: Restaurant;
  currency: string;
  allCategories: Category[];
  allItems: MenuItem[];
  categoryEvalMap: Map<string, CategoryAvailabilityResult>;
  itemEvalMap: Map<string, ItemAvailabilityResult>;
  getPriceInfo: (it: MenuItem) => EstorePriceInfo;
  formatMoney: (amount: number) => string;
  activeMenuDiscount: ActiveMenuDiscount;
  addons: RestaurantAddons;
  countdownDisplay: string | null;
  coverImages: string[];
  bannerIdx: number;
  setBannerIdx: React.Dispatch<React.SetStateAction<number>>;
  openNow: boolean;
  orderType: OrderType;
  enabledTypes: OrderType[];
  orderTypeMeta: Record<OrderType, { label: string; icon: React.ReactNode }>;
  hasMultipleBranches: boolean;
  branchShortLabel: string;
  onOpenBranchPicker: () => void;
  totalCount: number;
  subtotal: number;
  freeDeliveryEnabled: boolean;
  freeDeliveryMin: number;
  freeDeliveryRemaining: number;
  freeDeliveryPct: number;
  qualifiesFreeDelivery: boolean;
  getItemCartQty: (itemId: string) => number;
  isDisplayOnlyItem?: (it: MenuItem) => boolean;
  openProductModal: (it: MenuItem) => void;
  quickAddOrOpenModal: (it: MenuItem, e?: React.MouseEvent) => void;
  decrementItemFromCart: (itemId: string, e?: React.MouseEvent) => void;
  openCart: () => void;
  openMenuDrawer: () => void;
  openCatsModal: () => void;
  openOrderTypeModal: () => void;
  openWorkModal: () => void;
  openAboutModal: () => void;
  openRateModal: () => void;
  openShareModal: () => void;
  openMoodModal: () => void;
  openSpinModal: () => void;
  spinWonLabel?: string | null;
  reviewsShowOnMenu: boolean;
  reviewsAllowSubmit: boolean;
  restaurantReviews: RestaurantReview[];
  onNavigate: (hash: string) => void;
  selectedCatId?: string;
  onSelectCatId?: (catId: string) => void;
}

type StorePageId =
  | 'home'
  | 'all'
  | 'section'
  | 'collections'
  | 'trending'
  | 'recent'
  | 'discounts'
  | 'favorites'
  | 'about'
  | 'policies';

type ProductSortMode = 'newest' | 'price_asc' | 'price_desc' | 'name_asc';

const DAY_LABELS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const EstoreStorefront: React.FC<EstoreStorefrontProps> = ({
  rest,
  allCategories,
  allItems,
  categoryEvalMap,
  itemEvalMap,
  getPriceInfo,
  formatMoney,
  activeMenuDiscount,
  addons,
  countdownDisplay,
  coverImages,
  bannerIdx,
  setBannerIdx,
  openNow,
  orderType,
  enabledTypes,
  orderTypeMeta,
  hasMultipleBranches,
  branchShortLabel,
  onOpenBranchPicker,
  totalCount,
  subtotal,
  freeDeliveryEnabled,
  freeDeliveryMin,
  freeDeliveryRemaining,
  freeDeliveryPct,
  qualifiesFreeDelivery,
  getItemCartQty,
  isDisplayOnlyItem,
  openProductModal,
  quickAddOrOpenModal,
  decrementItemFromCart,
  openCart,
  openMenuDrawer,
  openCatsModal,
  openOrderTypeModal,
  openWorkModal,
  openRateModal,
  openShareModal,
  openMoodModal,
  openSpinModal,
  spinWonLabel,
  reviewsShowOnMenu,
  reviewsAllowSubmit,
  restaurantReviews,
  onNavigate,
  selectedCatId: controlledCatId,
  onSelectCatId,
}) => {
  const [storePage, setStorePage] = useState<StorePageId>('home');
  const [internalCatId, setInternalCatId] = useState<string>('all');
  const selectedCatId = controlledCatId !== undefined ? controlledCatId : internalCatId;
  const setSelectedCatId = (nextId: string) => {
    setInternalCatId(nextId);
    onSelectCatId?.(nextId);
  };

  const [sortMode, setSortMode] = useState<ProductSortMode>('newest');
  const [onlyDiscounts, setOnlyDiscounts] = useState(false);
  const [inlineQuery, setInlineQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [catsDropdownOpen, setCatsDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const favStorageKey = `mp_store_favs_${rest.id || 'store'}`;
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(`mp_store_favs_${rest.id || 'store'}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(favStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setFavoriteIds(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
    } catch {
      setFavoriteIds([]);
    }
  }, [favStorageKey]);

  const toggleFavorite = (itemId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFavoriteIds((prev) => {
      const next = prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [itemId, ...prev];
      try {
        window.localStorage.setItem(favStorageKey, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  };

  const clearFavorites = () => {
    setFavoriteIds([]);
    try {
      window.localStorage.removeItem(favStorageKey);
    } catch {
      // Ignore storage errors
    }
  };

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const catsDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!catsDropdownOpen) return;
    const handleOutside = (ev: MouseEvent) => {
      if (catsDropdownRef.current && !catsDropdownRef.current.contains(ev.target as Node)) {
        setCatsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [catsDropdownOpen]);

  const catMap = useMemo(() => new Map(allCategories.map((c) => [c.id, c])), [allCategories]);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const trimmedQuery = inlineQuery.trim().toLowerCase();
  const inlineMatches = useMemo(() => {
    if (!trimmedQuery) return [];
    return allItems.filter(
      (it) =>
        it.n.toLowerCase().includes(trimmedQuery) ||
        (it.d || '').toLowerCase().includes(trimmedQuery) ||
        (catMap.get(it.cat)?.n || '').toLowerCase().includes(trimmedQuery)
    );
  }, [allItems, trimmedQuery, catMap]);

  const discountedItems = useMemo(() => {
    return allItems.filter((it) => {
      const p = getPriceInfo(it);
      return p.rawBefore > p.min && p.rawBefore > 0;
    });
  }, [allItems, getPriceInfo]);

  const newestItems = useMemo(() => {
    return [...allItems].reverse();
  }, [allItems]);

  const trendingItems = useMemo(() => {
    const scored = [...allItems].sort((a, b) => {
      const aBest = a.badges?.some((bd) => /مبيع|الأكثر|مميز|best|hot/i.test(bd.text || '')) ? 1 : 0;
      const bBest = b.badges?.some((bd) => /مبيع|الأكثر|مميز|best|hot/i.test(bd.text || '')) ? 1 : 0;
      if (bBest !== aBest) return bBest - aBest;
      const aDisc = getPriceInfo(a).savings > 0 ? 1 : 0;
      const bDisc = getPriceInfo(b).savings > 0 ? 1 : 0;
      return bDisc - aDisc;
    });
    return scored;
  }, [allItems, getPriceInfo]);

  const lowestPriceItems = useMemo(() => {
    return [...allItems].sort((a, b) => getPriceInfo(a).min - getPriceInfo(b).min);
  }, [allItems, getPriceInfo]);

  const favoriteItems = useMemo(() => {
    return allItems.filter((it) => favoriteSet.has(it.id));
  }, [allItems, favoriteSet]);

  const shopFilteredItems = useMemo(() => {
    let list = [...allItems];
    if (selectedCatId !== 'all' && selectedCatId !== 'discounts') {
      list = list.filter((it) => it.cat === selectedCatId);
    }
    if (onlyDiscounts || selectedCatId === 'discounts') {
      list = list.filter((it) => {
        const p = getPriceInfo(it);
        return p.rawBefore > p.min && p.rawBefore > 0;
      });
    }
    if (trimmedQuery) {
      list = list.filter(
        (it) =>
          it.n.toLowerCase().includes(trimmedQuery) ||
          (it.d || '').toLowerCase().includes(trimmedQuery) ||
          (catMap.get(it.cat)?.n || '').toLowerCase().includes(trimmedQuery)
      );
    }
    if (sortMode === 'newest') {
      list.reverse();
    } else if (sortMode === 'price_asc') {
      list.sort((a, b) => getPriceInfo(a).min - getPriceInfo(b).min);
    } else if (sortMode === 'price_desc') {
      list.sort((a, b) => getPriceInfo(b).min - getPriceInfo(a).min);
    } else if (sortMode === 'name_asc') {
      list.sort((a, b) => a.n.localeCompare(b.n, 'ar'));
    }
    return list;
  }, [allItems, selectedCatId, onlyDiscounts, trimmedQuery, catMap, sortMode, getPriceInfo]);

  const scrollToTop = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const navigateStorePage = (
    nextPage: StorePageId,
    opts?: { catId?: string; sort?: ProductSortMode; discountOnly?: boolean }
  ) => {
    setStorePage(nextPage);
    if (opts?.catId !== undefined) {
      setSelectedCatId(opts.catId);
    } else if (nextPage === 'all' || nextPage === 'home') {
      setSelectedCatId('all');
    }
    if (opts?.sort !== undefined) {
      setSortMode(opts.sort);
    } else if (nextPage !== 'all' && nextPage !== 'section') {
      setSortMode('newest');
    }
    if (opts?.discountOnly !== undefined) {
      setOnlyDiscounts(opts.discountOnly);
    } else if (nextPage !== 'discounts') {
      setOnlyDiscounts(false);
    }
    setCatsDropdownOpen(false);
    setMobileNavOpen(false);
    setSearchFocused(false);
    scrollToTop();
  };

  const openSearchPanel = () => {
    setSearchOpen(true);
    setMobileNavOpen(false);
    setCatsDropdownOpen(false);
    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 80);
  };

  const renderProductCard = (it: MenuItem, keyPrefix = 'prod') => {
    const qty = getItemCartQty(it.id);
    const priceInfo = getPriceInfo(it);
    const itemEval = itemEvalMap.get(it.id);
    const displayOnly = Boolean(isDisplayOnlyItem?.(it));
    const unavailable = !displayOnly && (itemEval ? !itemEval.available : false);
    const isFav = favoriteSet.has(it.id);
    const discountPct =
      priceInfo.rawBefore > priceInfo.min && priceInfo.rawBefore > 0
        ? Math.max(1, Math.round(((priceInfo.rawBefore - priceInfo.min) / priceInfo.rawBefore) * 100))
        : 0;
    const hasRequiredChoices = Boolean(
      (it.sizes && it.sizes.length > 0) ||
        (it.choices && it.choices.length > 0) ||
        (it.extras && it.extras.length > 0)
    );

    return (
      <article
        key={`${keyPrefix}_${it.id}`}
        className={`mp-bg-product-card ${unavailable ? 'is-unavailable' : ''}`}
        onClick={() => openProductModal(it)}
      >
        <div className="mp-bg-card-media">
          {it.img ? (
            <img
              src={it.img}
              alt={it.n}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="mp-bg-media-placeholder">
              <Package size={32} strokeWidth={1.3} />
            </div>
          )}

          {discountPct > 0 && priceInfo.rawBefore > 0 && (
            <span className="mp-bg-disc-ribbon tabular-nums">-{discountPct}%</span>
          )}

          {unavailable && (
            <span className="mp-bg-unavail-ribbon">
              {itemEval?.outOfSchedule ? 'خارج وقت التوفر' : 'غير متوفر'}
            </span>
          )}

          {/* Top-end Wishlist Heart Toggle (matching backgroundiraq card UI) */}
          <button
            type="button"
            className={`mp-bg-fav-float ${isFav ? 'is-liked' : ''}`}
            onClick={(e) => toggleFavorite(it.id, e)}
            aria-label={isFav ? `إزالة ${it.n} من المفضلة` : `حفظ ${it.n} في المفضلة`}
            title={isFav ? 'إزالة من المفضلة' : 'حفظ في المفضلات'}
          >
            <Heart size={16} fill={isFav ? 'currentColor' : 'none'} strokeWidth={2} />
          </button>

          {/* Bottom-start Quick Cart Controls */}
          {!displayOnly && (
            <div className="mp-bg-card-actions" onClick={(e) => e.stopPropagation()}>
              {!unavailable && qty > 0 && !hasRequiredChoices && (
                <button
                  type="button"
                  className="mp-bg-qty-btn"
                  onClick={(e) => decrementItemFromCart(it.id, e)}
                  aria-label={qty === 1 ? `حذف ${it.n}` : `إنقاص كمية ${it.n}`}
                >
                  {qty === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                </button>
              )}

              <button
                type="button"
                className={`mp-bg-cart-btn ${qty > 0 ? 'is-in-cart' : ''}`}
                disabled={unavailable}
                onClick={(e) => quickAddOrOpenModal(it, e)}
                aria-label={`أضف ${it.n} للسلة`}
              >
                {unavailable ? (
                  <Clock size={15} />
                ) : qty > 0 && !hasRequiredChoices ? (
                  <>
                    <Plus size={14} strokeWidth={2.5} />
                    <span className="tabular-nums">{qty}</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag size={15} strokeWidth={2} />
                    <span>أضف للسلة</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="mp-bg-card-info">
          <div className="mp-bg-card-price-row">
            <span className="mp-bg-card-price tabular-nums">{priceInfo.main}</span>
            {discountPct > 0 && priceInfo.rawBefore > 0 && (
              <s className="mp-bg-card-old-price tabular-nums">{formatMoney(priceInfo.rawBefore)}</s>
            )}
          </div>
          <h3 className="mp-bg-card-title">{it.n}</h3>
        </div>
      </article>
    );
  };

  const renderSectionBreadcrumb = (title: string, subtitle?: string) => (
    <div className="mp-bg-page-head">
      <div className="mp-bg-breadcrumb">
        <button type="button" onClick={() => navigateStorePage('home')}>
          الرئيسية
        </button>
        <span>/</span>
        <span>{title}</span>
      </div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );

  const waTarget = rest.social?.whatsapp || rest.ph || '';
  const currentCategory = catMap.get(selectedCatId);

  const navLinks: Array<{ id: StorePageId; label: string }> = [
    { id: 'home', label: 'الرئيسية' },
    { id: 'all', label: 'كل المنتجات' },
    { id: 'collections', label: 'الكولكشنات' },
    { id: 'trending', label: 'الأكثر مبيعاً' },
    { id: 'recent', label: 'وصلنا حديثاً' },
    { id: 'discounts', label: 'التخفيضات' },
    { id: 'about', label: 'من نحن' },
    { id: 'policies', label: 'سياساتنا' },
  ];

  const cleanStoreTagline =
    String(rest.tagline || '').trim() === 'أشهى الأطباق المحضرة يومياً طازجة بجودة عالية'
      ? ''
      : String(rest.tagline || '').trim();

  const announcementMessage =
    addons.happyHour?.enabled &&
    activeMenuDiscount.sourceLabel === (addons.happyHour.title || 'ساعة السعادة')
      ? `✨ ${addons.happyHour.title || 'ساعة السعادة'}: خصم ${addons.happyHour.discountPercent || 15}% تلقائي على جميع المنتجات`
      : addons.countdownTimer?.enabled && countdownDisplay
      ? `⏳ ${addons.countdownTimer.title || 'عرض لفترة محدودة'} ينتهي خلال ${countdownDisplay}`
      : cleanStoreTagline || `أهلاً بكم في ${rest.n} — تسوق الآن واستلم طلبك بكل سهولة`;

  return (
    <div className="mp-bg-store-root" dir="rtl">
      {/* 1. Dark Top Announcement & Store Controls Bar (#242424 matching backgroundiraq.com) */}
      <div className="mp-bg-announcement-bar">
        <div className="mp-bg-container mp-bg-announcement-inner">
          <div className="mp-bg-announce-left">
            <button
              type="button"
              className={`mp-bg-status-chip ${openNow ? 'is-open' : 'is-closed'}`}
              onClick={openWorkModal}
            >
              <span className="mp-bg-status-dot" />
              <span>{openNow ? 'مفتوح الآن' : 'مغلق حالياً'}</span>
            </button>

            <button
              type="button"
              className="mp-bg-announce-btn"
              onClick={openOrderTypeModal}
            >
              {orderTypeMeta[orderType].icon}
              <span>{orderTypeMeta[orderType].label}</span>
              <ChevronDown size={12} />
            </button>

            {hasMultipleBranches && (
              <button
                type="button"
                className="mp-bg-announce-btn"
                onClick={onOpenBranchPicker}
                title={`تبديل الفرع — الحالي: ${branchShortLabel}`}
                aria-label="تبديل الفرع"
              >
                <GitBranch size={12} />
                <span>تبديل الفرع</span>
                <ChevronDown size={12} />
              </button>
            )}
          </div>

          <div className="mp-bg-announce-center">{announcementMessage}</div>

          <div className="mp-bg-announce-right mp-bg-hide-sm">
            {waTarget && (
              <a
                href={waLink(waTarget, `مرحباً ${rest.n}، لدي استفسار عن المنتجات`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mp-bg-announce-link"
              >
                <MessageCircle size={13} />
                <span>واتساب</span>
              </a>
            )}
            <button type="button" className="mp-bg-announce-link" onClick={openShareModal}>
              <Share2 size={13} />
              <span>مشاركة المتجر</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Sticky Light Minimalist Header (matching backgroundiraq.com desktop & mobile header) */}
      <header className="mp-bg-header">
        <div className="mp-bg-container mp-bg-header-inner">
          {/* Mobile Trigger + Brand */}
          <div className="mp-bg-header-start">
            <button
              type="button"
              className="mp-bg-mobile-menu-btn"
              onClick={() => setMobileNavOpen(true)}
              aria-label="قائمة المتجر"
            >
              <Menu size={22} strokeWidth={1.8} />
            </button>

            <button
              type="button"
              className="mp-bg-brand"
              onClick={() => navigateStorePage('home')}
            >
              <div className="mp-bg-logo-wrap">
                {rest.logo ? (
                  <img src={rest.logo} alt={rest.n} referrerPolicy="no-referrer" />
                ) : (
                  <span>{(rest.n || 'S').slice(0, 2)}</span>
                )}
              </div>
              <div className="mp-bg-brand-meta">
                <strong>{rest.n}</strong>
              </div>
            </button>
          </div>

          {/* Center Desktop Navigation Links + Interactive Categories Dropdown */}
          <nav className="mp-bg-desktop-nav" aria-label="التنقل الرئيسي">
            <button
              type="button"
              className={`mp-bg-nav-link ${storePage === 'home' ? 'is-active' : ''}`}
              onClick={() => navigateStorePage('home')}
            >
              الرئيسية
            </button>

            <div className="mp-bg-nav-dropdown-wrap" ref={catsDropdownRef}>
              <button
                type="button"
                className={`mp-bg-nav-link ${storePage === 'section' || catsDropdownOpen ? 'is-active' : ''}`}
                onClick={() => setCatsDropdownOpen((o) => !o)}
              >
                <span>الأقسام</span>
                <ChevronDown size={14} className={catsDropdownOpen ? 'is-rotated' : ''} />
              </button>

              {catsDropdownOpen && (
                <div className="mp-bg-cats-dropdown">
                  <div className="mp-bg-cats-dropdown-head">
                    <b>تصفح أقسام {rest.n}</b>
                    <button
                      type="button"
                      onClick={() => {
                        setCatsDropdownOpen(false);
                        openCatsModal();
                      }}
                    >
                      عرض الكل
                    </button>
                  </div>
                  <div className="mp-bg-cats-dropdown-grid">
                    {allCategories.map((cat) => {
                      const count = allItems.filter((it) => it.cat === cat.id).length;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          className="mp-bg-cats-dd-item"
                          onClick={() => navigateStorePage('section', { catId: cat.id })}
                        >
                          <div className="mp-bg-cats-dd-thumb">
                            {cat.img ? (
                              <img src={cat.img} alt={cat.n} referrerPolicy="no-referrer" />
                            ) : (
                              <LayoutGrid size={18} />
                            )}
                          </div>
                          <div>
                            <b>{cat.n}</b>
                            <span className="tabular-nums">{count} منتج</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {navLinks
              .filter((l) => l.id !== 'home')
              .map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className={`mp-bg-nav-link ${storePage === link.id ? 'is-active' : ''}`}
                  onClick={() => navigateStorePage(link.id)}
                >
                  {link.label}
                </button>
              ))}
          </nav>

          {/* End Utility Icons: Search, Wishlist, Cart */}
          <div className="mp-bg-header-actions">
            <button
              type="button"
              className={`mp-bg-icon-btn ${searchOpen ? 'is-active' : ''}`}
              onClick={() => (searchOpen ? setSearchOpen(false) : openSearchPanel())}
              aria-label="بحث عن منتج"
              title="بحث"
            >
              {searchOpen ? <X size={19} strokeWidth={1.8} /> : <Search size={19} strokeWidth={1.8} />}
            </button>

            <button
              type="button"
              className={`mp-bg-icon-btn ${storePage === 'favorites' ? 'is-active' : ''}`}
              onClick={() => navigateStorePage('favorites')}
              aria-label="المفضلات"
              title="المفضلات"
            >
              <Heart size={19} strokeWidth={1.8} />
              {favoriteIds.length > 0 && (
                <span className="mp-bg-icon-badge tabular-nums">{favoriteIds.length}</span>
              )}
            </button>

            <button
              type="button"
              className="mp-bg-icon-btn is-cart"
              onClick={openCart}
              aria-label="سلة التسوق"
              title="سلة التسوق"
            >
              <ShoppingBag size={19} strokeWidth={1.8} />
              <span className="mp-bg-icon-badge is-dark tabular-nums">{totalCount}</span>
            </button>
          </div>
        </div>

        {/* Expandable Instant Search Drawer Bar */}
        {searchOpen && (
          <div className="mp-bg-search-drawer">
            <div className="mp-bg-container">
              <div className="mp-bg-search-field-wrap">
                <Search size={17} className="mp-bg-search-ico" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={inlineQuery}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                  onChange={(e) => {
                    setInlineQuery(e.target.value);
                    setSearchFocused(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && trimmedQuery) {
                      setSearchOpen(false);
                      navigateStorePage('all', { catId: 'all' });
                    }
                  }}
                  placeholder={`ابحث في منتجات ${rest.n}...`}
                />
                {inlineQuery && (
                  <button
                    type="button"
                    className="mp-bg-search-clear"
                    onClick={() => setInlineQuery('')}
                    aria-label="مسح البحث"
                  >
                    <X size={14} />
                  </button>
                )}
                {trimmedQuery && (
                  <button
                    type="button"
                    className="mp-bg-search-submit"
                    onClick={() => {
                      setSearchOpen(false);
                      navigateStorePage('all', { catId: 'all' });
                    }}
                  >
                    عرض كل النتائج ({inlineMatches.length})
                  </button>
                )}
              </div>

              {searchFocused && trimmedQuery && (
                <div className="mp-bg-search-results">
                  {inlineMatches.length === 0 ? (
                    <div className="mp-bg-search-empty">لا توجد منتجات مطابقة لـ "{inlineQuery}"</div>
                  ) : (
                    inlineMatches.slice(0, 6).map((it) => {
                      const p = getPriceInfo(it);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          className="mp-bg-search-row"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSearchFocused(false);
                            setSearchOpen(false);
                            openProductModal(it);
                          }}
                        >
                          <div className="mp-bg-search-thumb">
                            {it.img ? (
                              <img src={it.img} alt={it.n} referrerPolicy="no-referrer" />
                            ) : (
                              <Package size={18} />
                            )}
                          </div>
                          <div className="mp-bg-search-meta">
                            <b>{it.n}</b>
                            <span>{catMap.get(it.cat)?.n || rest.n}</span>
                          </div>
                          <div className="mp-bg-search-price tabular-nums">{p.main}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div
          className="mp-bg-drawer-backdrop"
          onClick={() => setMobileNavOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <aside className="mp-bg-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mp-bg-drawer-head">
              <div className="mp-bg-drawer-brand">
                <div className="mp-bg-logo-wrap is-sm">
                  {rest.logo ? (
                    <img src={rest.logo} alt={rest.n} referrerPolicy="no-referrer" />
                  ) : (
                    <span>{(rest.n || 'S').slice(0, 2)}</span>
                  )}
                </div>
                <b>{rest.n}</b>
              </div>
              <button
                type="button"
                className="mp-bg-drawer-close"
                onClick={() => setMobileNavOpen(false)}
                aria-label="إغلاق القائمة"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mp-bg-drawer-body">
              <div className="mp-bg-drawer-section-label">الصفحات</div>
              <div className="mp-bg-drawer-links">
                {navLinks.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    className={`mp-bg-drawer-link ${storePage === link.id ? 'is-active' : ''}`}
                    onClick={() => navigateStorePage(link.id)}
                  >
                    <span>{link.label}</span>
                    <ArrowLeft size={15} />
                  </button>
                ))}
                <button
                  type="button"
                  className={`mp-bg-drawer-link ${storePage === 'favorites' ? 'is-active' : ''}`}
                  onClick={() => navigateStorePage('favorites')}
                >
                  <span>المفضلات ({favoriteIds.length})</span>
                  <Heart size={15} />
                </button>
              </div>

              {allCategories.length > 0 && (
                <>
                  <div className="mp-bg-drawer-section-label">أقسام المتجر</div>
                  <div className="mp-bg-drawer-cats">
                    {allCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className="mp-bg-drawer-cat"
                        onClick={() => navigateStorePage('section', { catId: cat.id })}
                      >
                        <span>{cat.n}</span>
                        <ChevronLeft size={15} />
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mp-bg-drawer-tools">
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    openWorkModal();
                  }}
                >
                  <Clock size={15} />
                  <span>أوقات العمل والدوام</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    openMenuDrawer();
                  }}
                >
                  <Store size={15} />
                  <span>معلومات وتفاصيل المتجر</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Active Store Addons Bar (Free Delivery / Spin / Mood) */}
      {((totalCount > 0 && freeDeliveryEnabled && freeDeliveryMin > 0 && orderType === 'delivery') ||
        (addons.pickupInstantDiscount?.enabled && orderType === 'pickup') ||
        addons.moodMealFinder?.enabled ||
        addons.spinWheelPromo?.enabled) && (
        <div className="mp-bg-addons-strip">
          <div className="mp-bg-container mp-bg-addons-inner">
            {totalCount > 0 &&
              freeDeliveryEnabled &&
              freeDeliveryMin > 0 &&
              orderType === 'delivery' && (
                <div className={`mp-bg-fd-pill ${qualifiesFreeDelivery ? 'is-ready' : ''}`}>
                  <Truck size={15} />
                  {qualifiesFreeDelivery ? (
                    <b>طلبك مؤهل للتوصيل المجاني!</b>
                  ) : (
                    <span>
                      أضف <b className="tabular-nums">{formatMoney(freeDeliveryRemaining)}</b> للتوصيل المجاني ({freeDeliveryPct}%)
                    </span>
                  )}
                </div>
              )}

            {addons.pickupInstantDiscount?.enabled && orderType === 'pickup' && (
              <span className="mp-bg-addon-chip">
                🏪 {addons.pickupInstantDiscount.title || 'خصم الاستلام الفوري'}:{' '}
                {addons.pickupInstantDiscount.discountPercent || 10}% تلقائي
              </span>
            )}

            <div className="mp-bg-addon-actions">
              {addons.moodMealFinder?.enabled && (
                <button type="button" className="mp-bg-addon-btn" onClick={openMoodModal}>
                  <Smile size={14} />
                  <span>{addons.moodMealFinder.buttonText || 'اقتراحات ذكية لك'}</span>
                </button>
              )}
              {addons.spinWheelPromo?.enabled && (
                <button type="button" className="mp-bg-addon-btn is-dark" onClick={openSpinModal}>
                  <Sparkles size={14} />
                  <span>{spinWonLabel || 'جرّب حظك واربح خصماً'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Page Router */}
      <main className="mp-bg-main">
        {storePage === 'home' && (
          <>
            {/* HERO SLIDER (Exact backgroundiraq slider-hero pattern) */}
            {coverImages.length > 0 && (
              <section className="mp-bg-hero-section" aria-label="واجهة المتجر">
                <div className="mp-bg-hero-wrap">
                  <img
                    src={coverImages[bannerIdx % coverImages.length]}
                    alt={rest.n}
                    className="mp-bg-hero-img"
                    referrerPolicy="no-referrer"
                  />
                  <div className="mp-bg-hero-scrim" />

                  <div className="mp-bg-container mp-bg-hero-content-layer">
                    <div className="mp-bg-hero-card">
                      {cleanStoreTagline && <span className="mp-bg-hero-eyebrow">{rest.n}</span>}
                      <h1 className="mp-bg-hero-title">{cleanStoreTagline || rest.n}</h1>
                      <div className="mp-bg-hero-cta-row">
                        <button
                          type="button"
                          className="mp-bg-btn-solid"
                          onClick={() => navigateStorePage('all')}
                        >
                          <span>اشتري الآن</span>
                          <ArrowLeft size={16} />
                        </button>
                        {discountedItems.length > 0 && (
                          <button
                            type="button"
                            className="mp-bg-btn-outline-light"
                            onClick={() => navigateStorePage('discounts')}
                          >
                            <span>التخفيضات ({discountedItems.length})</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {coverImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="mp-bg-hero-arrow is-next"
                        onClick={() =>
                          setBannerIdx((i) => (i - 1 + coverImages.length) % coverImages.length)
                        }
                        aria-label="السابق"
                      >
                        <ChevronRight size={20} />
                      </button>
                      <button
                        type="button"
                        className="mp-bg-hero-arrow is-prev"
                        onClick={() => setBannerIdx((i) => (i + 1) % coverImages.length)}
                        aria-label="التالي"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <div className="mp-bg-hero-dots">
                        {coverImages.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`mp-bg-hero-dot ${idx === bannerIdx % coverImages.length ? 'is-active' : ''}`}
                            onClick={() => setBannerIdx(idx)}
                            aria-label={`عرض ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* CATEGORIES SHOWCASE (الأقسام) */}
            {allCategories.length > 0 && (
              <section className="mp-bg-section mp-bg-container">
                <div className="mp-bg-section-head">
                  <div>
                    <h2>الأقسام</h2>
                    <p>تصفح تشكيلة منتجات {rest.n} حسب القسم</p>
                  </div>
                  <button
                    type="button"
                    className="mp-bg-view-all-link"
                    onClick={() => navigateStorePage('collections')}
                  >
                    <span>عرض جميع الكولكشنات</span>
                    <ChevronLeft size={16} />
                  </button>
                </div>

                <div className="mp-bg-cats-grid">
                  {allCategories.map((cat) => {
                    const count = allItems.filter((it) => it.cat === cat.id).length;
                    const catEval = categoryEvalMap.get(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className="mp-bg-cat-card"
                        onClick={() => navigateStorePage('section', { catId: cat.id })}
                      >
                        <div className="mp-bg-cat-media">
                          {cat.img ? (
                            <img src={cat.img} alt={cat.n} loading="lazy" referrerPolicy="no-referrer" />
                          ) : (
                            <ShoppingBag size={28} strokeWidth={1.4} />
                          )}
                        </div>
                        <div className="mp-bg-cat-body">
                          <b>{cat.n}</b>
                          <span className="tabular-nums">{count} منتج</span>
                          {catEval?.hasSchedule && (
                            <small className={catEval.available ? 'is-on' : 'is-off'}>
                              <Clock size={10} /> {catEval.badgeText}
                            </small>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* CURATED COLLECTIONS GRID (كولكشنات) */}
            {allCategories.length > 0 && (
              <section className="mp-bg-section-soft">
                <div className="mp-bg-container">
                  <div className="mp-bg-section-head">
                    <div>
                      <h2>كولكشنات {rest.n}</h2>
                      <p>مجموعات مختارة بعناية لتناسب احتياجك</p>
                    </div>
                    <button
                      type="button"
                      className="mp-bg-view-all-link"
                      onClick={() => navigateStorePage('collections')}
                    >
                      <span>عرض الكل</span>
                      <ChevronLeft size={16} />
                    </button>
                  </div>

                  <div className="mp-bg-collections-grid">
                    {allCategories.slice(0, 4).map((cat) => {
                      const catCount = allItems.filter((it) => it.cat === cat.id).length;
                      return (
                        <button
                          key={`col_${cat.id}`}
                          type="button"
                          className="mp-bg-collection-card"
                          onClick={() => navigateStorePage('section', { catId: cat.id })}
                        >
                          <div className="mp-bg-collection-media">
                            {cat.img ? (
                              <img src={cat.img} alt={cat.n} loading="lazy" referrerPolicy="no-referrer" />
                            ) : (
                              <LayoutGrid size={36} strokeWidth={1.3} />
                            )}
                            <div className="mp-bg-collection-scrim" />
                            <div className="mp-bg-collection-overlay">
                              <span className="tabular-nums">{catCount} منتج</span>
                              <h3>{cat.n}</h3>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* LATEST PRODUCTS (أحدث المنتجات) */}
            <section className="mp-bg-section mp-bg-container">
              <div className="mp-bg-section-head">
                <div>
                  <h2>أحدث المنتجات</h2>
                  <p>أحدث الإصدارات المضافة إلى {rest.n}</p>
                </div>
                <button
                  type="button"
                  className="mp-bg-view-all-link"
                  onClick={() => navigateStorePage('recent')}
                >
                  <span>عرض كل الجديد</span>
                  <ChevronLeft size={16} />
                </button>
              </div>

              {allItems.length === 0 ? (
                <div className="mp-bg-empty-state">
                  <ShoppingBag size={36} strokeWidth={1.4} />
                  <b>المتجر قيد التجهيز</b>
                  <p>سيتم عرض المنتجات هنا فور إضافتها من لوحة التحكم.</p>
                </div>
              ) : (
                <div className="mp-bg-products-grid">
                  {newestItems.slice(0, 8).map((it) => renderProductCard(it, 'latest'))}
                </div>
              )}

              {allItems.length > 0 && (
                <div className="mp-bg-center-cta">
                  <button
                    type="button"
                    className="mp-bg-btn-outline"
                    onClick={() => navigateStorePage('all')}
                  >
                    <span>عرض جميع المنتجات ({allItems.length})</span>
                    <ArrowLeft size={15} />
                  </button>
                </div>
              )}
            </section>

            {/* DARK FEATURE MARQUEE BAND (#242424 matching backgroundiraq.com announcement-bar-section) */}
            <section className="mp-bg-dark-band" aria-label="مميزات المتجر">
              <div className="mp-bg-container mp-bg-dark-band-grid">
                <div className="mp-bg-dark-feature">
                  <Truck size={22} strokeWidth={1.7} />
                  <div>
                    <b>{enabledTypes.includes('delivery') ? 'توصيل لجميع المناطق' : 'تجهيز سريع'}</b>
                    <span>
                      {rest.deliveryZones && rest.deliveryZones.length > 0
                        ? `متاح إلى ${formatNumber(rest.deliveryZones.length)} مناطق معتمدة`
                        : 'شحن منظم وسريع لباب المنزل'}
                    </span>
                  </div>
                </div>

                <div className="mp-bg-dark-feature">
                  <RefreshCw size={22} strokeWidth={1.7} />
                  <div>
                    <b>سياسة استبدال واضحة</b>
                    <span>مراجعة وتبديل ميسر وفق سياسات {rest.n}</span>
                  </div>
                </div>

                <div className="mp-bg-dark-feature">
                  <ShieldCheck size={22} strokeWidth={1.7} />
                  <div>
                    <b>جودة وضمان حقيقي</b>
                    <span>منتجات منتقاة بأسعار واضحة ومحدثة</span>
                  </div>
                </div>

                <div className="mp-bg-dark-feature">
                  <MessageCircle size={22} strokeWidth={1.7} />
                  <div>
                    <b>دعم وتواصل مباشر</b>
                    <span>تأكيد الطلب فوراً مع فريق {rest.n}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* BEST SELLERS (الأكثر مبيعاً) */}
            {trendingItems.length > 0 && (
              <section className="mp-bg-section mp-bg-container">
                <div className="mp-bg-section-head">
                  <div>
                    <h2>الأكثر مبيعاً</h2>
                    <p>المنتجات الأكثر طلباً وثقة لدى عملائنا</p>
                  </div>
                  <button
                    type="button"
                    className="mp-bg-view-all-link"
                    onClick={() => navigateStorePage('trending')}
                  >
                    <span>عرض الكل</span>
                    <ChevronLeft size={16} />
                  </button>
                </div>

                <div className="mp-bg-products-grid">
                  {trendingItems.slice(0, 4).map((it) => renderProductCard(it, 'best'))}
                </div>
              </section>
            )}

            {/* LOWEST PRICED (الأقل سعراً) */}
            {lowestPriceItems.length > 0 && (
              <section className="mp-bg-section-soft">
                <div className="mp-bg-container">
                  <div className="mp-bg-section-head">
                    <div>
                      <h2>الأقل سعراً</h2>
                      <p>خيارات مميزة بأسعار اقتصادية تناسب الجميع</p>
                    </div>
                    <button
                      type="button"
                      className="mp-bg-view-all-link"
                      onClick={() => navigateStorePage('all', { sort: 'price_asc' })}
                    >
                      <span>ترتيب حسب السعر</span>
                      <ChevronLeft size={16} />
                    </button>
                  </div>

                  <div className="mp-bg-products-grid">
                    {lowestPriceItems.slice(0, 4).map((it) => renderProductCard(it, 'low'))}
                  </div>
                </div>
              </section>
            )}

            {/* CUSTOMER REVIEWS */}
            {reviewsShowOnMenu && (
              <section className="mp-bg-section mp-bg-container">
                <div className="mp-bg-section-head">
                  <div>
                    <h2>تقييمات العملاء ({restaurantReviews.length})</h2>
                    <p>تجارب المتسوقين وآراؤهم في منتجات {rest.n}</p>
                  </div>
                  {reviewsAllowSubmit && (
                    <button type="button" className="mp-bg-btn-solid is-sm" onClick={openRateModal}>
                      <Star size={14} />
                      <span>أضف تقييمك</span>
                    </button>
                  )}
                </div>

                {restaurantReviews.length === 0 ? (
                  <p className="mp-bg-muted-note">كن أول من يشارك رأيه في منتجات {rest.n}!</p>
                ) : (
                  <div className="mp-bg-reviews-grid">
                    {restaurantReviews.slice(0, 6).map((rev) => (
                      <div key={rev.id} className="mp-bg-review-card">
                        <div className="mp-bg-review-head">
                          <b>{rev.name}</b>
                          <span className="mp-bg-stars">
                            {'★'.repeat(rev.rate || rev.stars || 5)}
                          </span>
                        </div>
                        <p>{rev.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {/* ALL PRODUCTS & FILTERED CATEGORY PAGE (all / section) */}
        {(storePage === 'all' || storePage === 'section') && (
          <section className="mp-bg-section mp-bg-container">
            {renderSectionBreadcrumb(
              currentCategory ? currentCategory.n : 'كل المنتجات',
              currentCategory?.subtitle || `تصفح جميع منتجات ${rest.n} المتاحة الآن`
            )}

            {/* Filter & Sort Controls */}
            <div className="mp-bg-shop-toolbar">
              <div className="mp-bg-filter-cats">
                <button
                  type="button"
                  className={`mp-bg-filter-chip ${selectedCatId === 'all' && !onlyDiscounts ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedCatId('all');
                    setOnlyDiscounts(false);
                  }}
                >
                  الكل ({allItems.length})
                </button>
                {discountedItems.length > 0 && (
                  <button
                    type="button"
                    className={`mp-bg-filter-chip ${onlyDiscounts || selectedCatId === 'discounts' ? 'is-active' : ''}`}
                    onClick={() => {
                      setOnlyDiscounts((v) => !v);
                      if (selectedCatId === 'discounts') setSelectedCatId('all');
                    }}
                  >
                    <Percent size={13} />
                    <span>التخفيضات ({discountedItems.length})</span>
                  </button>
                )}
                {allCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`mp-bg-filter-chip ${selectedCatId === cat.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedCatId(cat.id)}
                  >
                    {cat.n}
                  </button>
                ))}
              </div>

              <div className="mp-bg-sort-wrap">
                <div className="mp-bg-inline-filter-search">
                  <Search size={15} />
                  <input
                    type="search"
                    value={inlineQuery}
                    onChange={(e) => setInlineQuery(e.target.value)}
                    placeholder="ابحث بالاسم..."
                  />
                  {inlineQuery && (
                    <button type="button" onClick={() => setInlineQuery('')} aria-label="مسح">
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div className="mp-bg-sort-select-wrap">
                  <SlidersHorizontal size={14} />
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as ProductSortMode)}
                    aria-label="ترتيب المنتجات"
                  >
                    <option value="newest">الأحدث</option>
                    <option value="price_asc">الأقل سعراً</option>
                    <option value="price_desc">الأعلى سعراً</option>
                    <option value="name_asc">الاسم (أ - ي)</option>
                  </select>
                </div>
              </div>
            </div>

            {shopFilteredItems.length === 0 ? (
              <div className="mp-bg-empty-state">
                <Search size={34} strokeWidth={1.4} />
                <b>لا توجد منتجات مطابقة</b>
                <p>جرّب تعديل كلمات البحث أو إزالة فلاتر القسم.</p>
                <button
                  type="button"
                  className="mp-bg-btn-outline"
                  onClick={() => {
                    setInlineQuery('');
                    setSelectedCatId('all');
                    setOnlyDiscounts(false);
                  }}
                >
                  عرض جميع المنتجات
                </button>
              </div>
            ) : (
              <div className="mp-bg-products-grid">
                {shopFilteredItems.map((it) => renderProductCard(it, 'shop'))}
              </div>
            )}
          </section>
        )}

        {/* COLLECTIONS PAGE */}
        {storePage === 'collections' && (
          <section className="mp-bg-section mp-bg-container">
            {renderSectionBreadcrumb(
              'الكولكشنات',
              `استكشف جميع الأقسام والمجموعات المتوفرة في ${rest.n}`
            )}

            {allCategories.length === 0 ? (
              <div className="mp-bg-empty-state">
                <LayoutGrid size={34} strokeWidth={1.4} />
                <b>لا توجد كولكشنات بعد</b>
                <p>ستظهر الكولكشنات هنا فور إضافة الأقسام من لوحة التحكم.</p>
              </div>
            ) : (
              <div className="mp-bg-collections-page-grid">
                {allCategories.map((cat) => {
                  const catItems = allItems.filter((it) => it.cat === cat.id);
                  return (
                    <div key={`colp_${cat.id}`} className="mp-bg-colpage-card">
                      <div
                        className="mp-bg-colpage-banner"
                        onClick={() => navigateStorePage('section', { catId: cat.id })}
                      >
                        {cat.img ? (
                          <img src={cat.img} alt={cat.n} loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <LayoutGrid size={40} strokeWidth={1.3} />
                        )}
                        <div className="mp-bg-colpage-banner-info">
                          <span className="tabular-nums">{catItems.length} منتج</span>
                          <h2>{cat.n}</h2>
                          {cat.subtitle && <p>{cat.subtitle}</p>}
                        </div>
                      </div>

                      {catItems.length > 0 && (
                        <div className="mp-bg-colpage-previews">
                          {catItems.slice(0, 3).map((it) => (
                            <button
                              key={it.id}
                              type="button"
                              className="mp-bg-colpage-mini-item"
                              onClick={() => openProductModal(it)}
                            >
                              {it.img ? (
                                <img src={it.img} alt={it.n} referrerPolicy="no-referrer" />
                              ) : (
                                <Package size={16} />
                              )}
                              <span>{it.n}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        className="mp-bg-btn-outline is-full"
                        onClick={() => navigateStorePage('section', { catId: cat.id })}
                      >
                        <span>تصفح كولكشن {cat.n}</span>
                        <ArrowLeft size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TRENDING / BEST SELLERS PAGE */}
        {storePage === 'trending' && (
          <section className="mp-bg-section mp-bg-container">
            {renderSectionBreadcrumb(
              'الأكثر مبيعاً',
              `المنتجات الأعلى طلباً وتفضيلاً لدى عملاء ${rest.n}`
            )}
            <div className="mp-bg-products-grid">
              {trendingItems.map((it) => renderProductCard(it, 'trend'))}
            </div>
          </section>
        )}

        {/* RECENT / NEW ARRIVALS PAGE */}
        {storePage === 'recent' && (
          <section className="mp-bg-section mp-bg-container">
            {renderSectionBreadcrumb(
              'وصلنا حديثاً',
              `أحدث المنتجات والإضافات الجديدة في ${rest.n}`
            )}
            <div className="mp-bg-products-grid">
              {newestItems.map((it) => renderProductCard(it, 'recent'))}
            </div>
          </section>
        )}

        {/* DISCOUNTS PAGE */}
        {storePage === 'discounts' && (
          <section className="mp-bg-section mp-bg-container">
            {renderSectionBreadcrumb(
              'التخفيضات والعروض',
              `أفضل الخصومات والعروض المحدودة المتوفرة الآن في ${rest.n}`
            )}
            {discountedItems.length === 0 ? (
              <div className="mp-bg-empty-state">
                <Tag size={34} strokeWidth={1.4} />
                <b>لا توجد تخفيضات مفعلة حالياً</b>
                <p>تابع هذه الصفحة باستمرار أو تصفح كل المنتجات.</p>
                <button
                  type="button"
                  className="mp-bg-btn-solid"
                  onClick={() => navigateStorePage('all')}
                >
                  تصفح كل المنتجات
                </button>
              </div>
            ) : (
              <div className="mp-bg-products-grid">
                {discountedItems.map((it) => renderProductCard(it, 'disc'))}
              </div>
            )}
          </section>
        )}

        {/* FAVORITES / WISHLIST PAGE */}
        {storePage === 'favorites' && (
          <section className="mp-bg-section mp-bg-container">
            {renderSectionBreadcrumb(
              'مفضلاتي',
              'المنتجات التي قمت بحفظها للرجوع إليها وطلبها لاحقاً'
            )}

            {favoriteItems.length === 0 ? (
              <div className="mp-bg-empty-state">
                <Heart size={36} strokeWidth={1.4} />
                <b>قائمة المفضلات فارغة</b>
                <p>اضغط على علامة القلب فوق أي منتج لحفظه هنا.</p>
                <button
                  type="button"
                  className="mp-bg-btn-solid"
                  onClick={() => navigateStorePage('all')}
                >
                  <span>تسوق الآن</span>
                  <ArrowLeft size={15} />
                </button>
              </div>
            ) : (
              <>
                <div className="mp-bg-fav-actions-bar">
                  <span className="tabular-nums">لديك {favoriteItems.length} منتج في المفضلة</span>
                  <button type="button" className="mp-bg-text-danger" onClick={clearFavorites}>
                    <Trash2 size={14} />
                    <span>مسح المفضلات</span>
                  </button>
                </div>
                <div className="mp-bg-products-grid">
                  {favoriteItems.map((it) => renderProductCard(it, 'fav'))}
                </div>
              </>
            )}
          </section>
        )}

        {/* ABOUT US PAGE (من نحن — Dynamic Merchant Identity) */}
        {storePage === 'about' && (
          <section className="mp-bg-section mp-bg-container">
            {renderSectionBreadcrumb('من نحن', `تعرف على ${rest.n} وقيمنا وتفاصيل التواصل`)}

            <div className="mp-bg-about-grid">
              <div className="mp-bg-about-media">
                {coverImages[0] ? (
                  <img src={coverImages[0]} alt={rest.n} referrerPolicy="no-referrer" />
                ) : rest.logo ? (
                  <img src={rest.logo} alt={rest.n} referrerPolicy="no-referrer" />
                ) : (
                  <Store size={48} strokeWidth={1.3} />
                )}
              </div>

              <div className="mp-bg-about-content">
                <div className="mp-bg-about-brand-row">
                  <div className="mp-bg-logo-wrap is-lg">
                    {rest.logo ? (
                      <img src={rest.logo} alt={rest.n} referrerPolicy="no-referrer" />
                    ) : (
                      <span>{(rest.n || 'S').slice(0, 2)}</span>
                    )}
                  </div>
                  <div>
                    <h2>{rest.n}</h2>
                    {cleanStoreTagline && <span>{cleanStoreTagline}</span>}
                  </div>
                </div>

                <p className="mp-bg-about-story">
                  {rest.aboutText ||
                    `مرحباً بكم في ${rest.n}. نحرص على تقديم منتجات منتقاة بعناية وجودة عالية مع تجربة تسوق سلسة، تسعير واضح، وخدمة عملاء سريعة مباشرة.`}
                </p>

                <div className="mp-bg-about-details">
                  {rest.address && (
                    <div className="mp-bg-detail-box">
                      <MapPin size={18} />
                      <div>
                        <b>العنوان</b>
                        <span>{rest.address}</span>
                      </div>
                    </div>
                  )}

                  {rest.ph && (
                    <div className="mp-bg-detail-box">
                      <Phone size={18} />
                      <div>
                        <b>رقم الهاتف</b>
                        <a href={`tel:${rest.ph}`} dir="ltr" className="tabular-nums">
                          {rest.ph}
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="mp-bg-detail-box">
                    <Clock size={18} />
                    <div>
                      <b>حالة المتجر والدوام</b>
                      <span>{openNow ? 'مفتوح الآن لاستقبال الطلبات' : 'مغلق حالياً — يمكنك تصفح المنتجات'}</span>
                    </div>
                  </div>
                </div>

                <div className="mp-bg-about-cta-row">
                  <button
                    type="button"
                    className="mp-bg-btn-solid"
                    onClick={() => navigateStorePage('all')}
                  >
                    <span>تصفح المنتجات</span>
                    <ArrowLeft size={15} />
                  </button>
                  {waTarget && (
                    <a
                      href={waLink(waTarget, `مرحباً ${rest.n}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mp-bg-btn-outline"
                    >
                      <MessageCircle size={15} />
                      <span>تواصل عبر واتساب</span>
                    </a>
                  )}
                  {rest.mapUrl && (
                    <a
                      href={rest.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mp-bg-btn-outline"
                    >
                      <MapPin size={15} />
                      <span>الموقع على الخريطة</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* POLICIES PAGE (سياساتنا — Dynamic Delivery Zones, Hours, Order & Return Policy) */}
        {storePage === 'policies' && (
          <section className="mp-bg-section mp-bg-container">
            {renderSectionBreadcrumb(
              'سياسات المتجر',
              `الشروط والأحكام وسياسات الشحن والاستبدال الخاصة بـ ${rest.n}`
            )}

            <div className="mp-bg-policies-grid">
              <div className="mp-bg-policy-card">
                <div className="mp-bg-policy-ico">
                  <ShieldCheck size={22} />
                </div>
                <h3>الطلبات وتأكيد الشراء</h3>
                <p>
                  يتم تأكيد جميع الطلبات مباشرة مع إدارة {rest.n} مع إرسال تفاصيل الفاتورة كاملة قبل التجهيز والشحن. الأسعار المعروضة نهائية ومحدثة لحظياً.
                </p>
              </div>

              <div className="mp-bg-policy-card">
                <div className="mp-bg-policy-ico">
                  <RefreshCw size={22} />
                </div>
                <h3>الاستبدال والاسترجاع</h3>
                <p>
                  نضمن مطابقة المنتجات للمواصفات الموضحة. في حال وجود أي خلل مصنعي أو اختلاف عند الاستلام، يمكنك التواصل معنا مباشرة لترتيب الاستبدال وفق حالته الأصلية.
                </p>
              </div>

              <div className="mp-bg-policy-card">
                <div className="mp-bg-policy-ico">
                  <Truck size={22} />
                </div>
                <h3>الشحن والتوصيل</h3>
                <p>
                  {enabledTypes.includes('delivery')
                    ? `نوفر خدمة توصيل منظمة إلى باب منزلك مع خيار ${enabledTypes.includes('pickup') ? 'الاستلام المباشر من المتجر' : 'المتابعة الفورية'}.`
                    : 'الطلبات متاحة للاستلام المباشر من المتجر فور تأكيدها.'}
                </p>
              </div>

              <div className="mp-bg-policy-card">
                <div className="mp-bg-policy-ico">
                  <Flame size={22} />
                </div>
                <h3>خصوصية البيانات</h3>
                <p>
                  تُستخدم بيانات الاسم ورقم الهاتف والعنوان فقط لتجهيز الطلب وتوصيله إلى موقعك بكل دقة، ولا يتم مشاركتها مع أي طرف خارجي.
                </p>
              </div>
            </div>

            {/* Dynamic Delivery Zones Table if configured */}
            {rest.deliveryZones && rest.deliveryZones.length > 0 && (
              <div className="mp-bg-zones-box">
                <h3>مناطق وأسعار التوصيل المعتمدة</h3>
                <div className="mp-bg-zones-grid">
                  {rest.deliveryZones.map((zone, idx) => (
                    <div key={`${zone.area}_${idx}`} className="mp-bg-zone-row">
                      <span>{zone.area}</span>
                      <b className="tabular-nums">
                        {(zone.fee ?? 0) > 0 ? formatMoney(zone.fee ?? 0) : 'مجاناً'}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic Working Hours if configured */}
            {Array.isArray(rest.workHours) && rest.workHours.length > 0 && (
              <div className="mp-bg-zones-box">
                <h3>أوقات العمل الأسبوعية</h3>
                <div className="mp-bg-zones-grid">
                  {rest.workHours.map((wh, idx) => (
                    <div key={idx} className="mp-bg-zone-row">
                      <span>{DAY_LABELS_AR[idx] || `اليوم ${idx + 1}`}</span>
                      <b dir="ltr" className="tabular-nums">
                        {wh.open ? `${wh.from || '09:00'} - ${wh.to || '22:00'}` : 'مغلق'}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* 4. Multi-Column Editorial Footer (matching backgroundiraq.com footer) */}
      <footer className="mp-bg-footer">
        <div className="mp-bg-container mp-bg-footer-grid">
          {/* Col 1: Brand Statement */}
          <div className="mp-bg-footer-col is-brand">
            <div className="mp-bg-footer-brand-head">
              <div className="mp-bg-logo-wrap is-sm">
                {rest.logo ? (
                  <img src={rest.logo} alt={rest.n} referrerPolicy="no-referrer" />
                ) : (
                  <span>{(rest.n || 'S').slice(0, 2)}</span>
                )}
              </div>
              <div>
                <h3>{rest.n}</h3>
                {cleanStoreTagline && <span>{cleanStoreTagline}</span>}
              </div>
            </div>
            <p className="mp-bg-footer-about">
              {rest.aboutText ||
                `${rest.n} — متجرك الإلكتروني لمنتجات منتقاة بعناية وتوصيل سريع مباشر.`}
            </p>
            {rest.social && Object.values(rest.social).some(Boolean) && (
              <div className="mp-bg-footer-socials">
                {rest.social.instagram && (
                  <a href={rest.social.instagram} target="_blank" rel="noopener noreferrer">
                    انستغرام
                  </a>
                )}
                {rest.social.facebook && (
                  <a href={rest.social.facebook} target="_blank" rel="noopener noreferrer">
                    فيسبوك
                  </a>
                )}
                {rest.social.tiktok && (
                  <a href={rest.social.tiktok} target="_blank" rel="noopener noreferrer">
                    تيك توك
                  </a>
                )}
                {rest.social.x && (
                  <a href={rest.social.x} target="_blank" rel="noopener noreferrer">
                    منصة X
                  </a>
                )}
                {rest.social.whatsapp && (
                  <a
                    href={waLink(rest.social.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="is-wa"
                  >
                    واتساب
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Col 2: روابط مفيدة */}
          <div className="mp-bg-footer-col">
            <h4>روابط مفيدة</h4>
            <ul>
              <li>
                <button type="button" onClick={() => navigateStorePage('home')}>
                  الرئيسية
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigateStorePage('about')}>
                  من نحن
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigateStorePage('policies')}>
                  سياساتنا
                </button>
              </li>
              <li>
                <button type="button" onClick={openWorkModal}>
                  أوقات العمل والدوام
                </button>
              </li>
              {reviewsAllowSubmit && (
                <li>
                  <button type="button" onClick={openRateModal}>
                    تقييم المتجر
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Col 3: المتجر */}
          <div className="mp-bg-footer-col">
            <h4>المتجر</h4>
            <ul>
              <li>
                <button type="button" onClick={() => navigateStorePage('all')}>
                  كل المنتجات ({allItems.length})
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigateStorePage('collections')}>
                  الكولكشنات
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigateStorePage('trending')}>
                  الأكثر مبيعاً
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigateStorePage('recent')}>
                  وصلنا حديثاً
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigateStorePage('discounts')}>
                  التخفيضات ({discountedItems.length})
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigateStorePage('favorites')}>
                  مفضلاتي ({favoriteIds.length})
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: تواصل معنا */}
          <div className="mp-bg-footer-col">
            <h4>تواصل معنا</h4>
            <div className="mp-bg-footer-contact">
              {rest.ph && (
                <a href={`tel:${rest.ph}`} dir="ltr" className="tabular-nums">
                  <Phone size={14} />
                  <span>{rest.ph}</span>
                </a>
              )}
              {waTarget && (
                <a
                  href={waLink(waTarget, `مرحباً ${rest.n}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={14} />
                  <span>مراسلة واتساب</span>
                </a>
              )}
              {rest.address && (
                <div>
                  <MapPin size={14} />
                  <span>{rest.address}</span>
                </div>
              )}
              {rest.mapUrl && (
                <a href={rest.mapUrl} target="_blank" rel="noopener noreferrer" className="is-map">
                  <MapPin size={14} />
                  <span>الموقع على الخريطة</span>
                </a>
              )}
              {rest.deliveryZones && rest.deliveryZones.length > 0 && (
                <div className="mp-bg-footer-zones">
                  <b>مناطق التوصيل:</b>
                  <span>
                    {rest.deliveryZones
                      .slice(0, 4)
                      .map((z) => z.area)
                      .join(' · ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Copyright Bar */}
        <div className="mp-bg-footer-bottom">
          <div className="mp-bg-container mp-bg-footer-bottom-inner">
            <span>© {new Date().getFullYear()} {rest.n}. جميع الحقوق محفوظة.</span>
            <div className="mp-bg-powered">
              <span>مدعوم بواسطة</span>
              <button
                type="button"
                className="mp-bg-powered-logo"
                onClick={() => onNavigate('/')}
              >
                <AppLogo size={18} />
              </button>
              <button
                type="button"
                className="mp-bg-own-btn"
                onClick={() => onNavigate('/signup')}
              >
                أنشئ متجرك الإلكتروني
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* 5. Compact Mobile Bottom Utility Navigation Bar */}
      <nav className="mp-bg-bottom-nav" aria-label="التنقل السريع">
        <button
          type="button"
          className={`mp-bg-bnav-btn ${storePage === 'home' ? 'is-active' : ''}`}
          onClick={() => navigateStorePage('home')}
        >
          <Home size={18} strokeWidth={1.8} />
          <span>الرئيسية</span>
        </button>

        <button
          type="button"
          className={`mp-bg-bnav-btn ${storePage === 'all' || storePage === 'section' || storePage === 'collections' ? 'is-active' : ''}`}
          onClick={() => navigateStorePage('all')}
        >
          <LayoutGrid size={18} strokeWidth={1.8} />
          <span>المتجر</span>
        </button>

        <button
          type="button"
          className={`mp-bg-bnav-btn ${storePage === 'favorites' ? 'is-active' : ''}`}
          onClick={() => navigateStorePage('favorites')}
        >
          <div className="mp-bg-bnav-icon-wrap">
            <Heart size={18} strokeWidth={1.8} />
            {favoriteIds.length > 0 && (
              <span className="mp-bg-bnav-badge tabular-nums">{favoriteIds.length}</span>
            )}
          </div>
          <span>المفضلات</span>
        </button>

        <button
          type="button"
          className="mp-bg-bnav-btn"
          onClick={openCart}
        >
          <div className="mp-bg-bnav-icon-wrap">
            <ShoppingCart size={18} strokeWidth={1.8} />
            {totalCount > 0 && (
              <span className="mp-bg-bnav-badge is-dark tabular-nums">{totalCount}</span>
            )}
          </div>
          <span>{totalCount > 0 ? formatMoney(subtotal) : 'السلة'}</span>
        </button>

        {waTarget ? (
          <a
            href={waLink(waTarget, `مرحباً ${rest.n}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="mp-bg-bnav-btn"
          >
            <MessageCircle size={18} strokeWidth={1.8} />
            <span>راسلنا</span>
          </a>
        ) : (
          <button
            type="button"
            className={`mp-bg-bnav-btn ${searchOpen ? 'is-active' : ''}`}
            onClick={openSearchPanel}
          >
            <Search size={18} strokeWidth={1.8} />
            <span>بحث</span>
          </button>
        )}
      </nav>
    </div>
  );
};
