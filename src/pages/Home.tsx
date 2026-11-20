/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import {
  Home,
  LogOut,
  LayoutDashboard,
  Sparkles,
  X,
  ArrowRight,
  ArrowLeft,
  ShoppingBag,
  Check,
  ChevronDown,
  Compass,
  HelpCircle,
  Shield,
} from 'lucide-react';
import { HomeSettings, PricingPlan, Restaurant, Session, SiteSettings, SupportedLanguage } from '../types';
import { formatNumber, getItem, resolveEffectiveThemeMode, setSession, waLink } from '../utils/storage';
import { getSupportWhatsapp } from '../utils/businessDefaults';
import {
  buildPlanComparisonRows,
  calcDiscountedPlanPrice,
  DEFAULT_PLANS_V2,
  getLocalizedPlanName,
  getLocalizedPlanTagline,
} from '../utils/plans';
import { getLocalizedAddonCatalog, getLocalizedAddonTabs } from '../data/addonsCatalog';
import { TRANSLATIONS, getLocalizedCurrencyUnit, getLocalizedFaqItem, getStoredLanguage, setStoredLanguage, trByLang } from '../utils/i18n';
import { LanguageSelector } from '../components/LanguageSelector';
import { AppLogo } from '../components/AppLogo';
import { Ml7Text } from '../components/Ml7Text';
import { ExploreShowcase } from '../components/ExploreShowcase';

const PlanPurchaseModal = lazy(() =>
  import('../components/PlanPurchaseModal').then((m) => ({ default: m.PlanPurchaseModal }))
);

interface HomeViewProps {
  home: HomeSettings;
  site: SiteSettings;
  plans: PricingPlan[];
  session: Session | null;
  onSelectPlan: (index: number) => void;
  onNavigate: (hash: string) => void;
  onLogout?: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  home: _home,
  site,
  plans,
  session,
  onSelectPlan,
  onNavigate,
  onLogout,
}) => {
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(getStoredLanguage());
  const isRtl = currentLang === 'ar' || currentLang === 'ku';
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.ar;
  const tr = (ar: string, ku: string, en: string) => trByLang(currentLang, ar, ku, en);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const smoothScrollProgress = useSpring(scrollYProgress, { stiffness: 180, damping: 28, restDelta: 0.001 });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showAddonsModal, setShowAddonsModal] = useState(false);
  const [purchaseModalPlan, setPurchaseModalPlan] = useState<PricingPlan | null>(null);

  const sectionsCfg = _home.sections || {};
  const navCfg = _home.nav || {};
  const servicesCfg = _home.services;
  const pricingCfg = _home.pricing;
  const footerCfg = _home.footerConfig || {};

  const faqConfig = _home.faq || {
    enabled: true,
    title: 'أسئلة ممكن تجي في بالك',
    sub: 'تفاصيل تساعدك تختار التجربة المناسبة لنشاطك.',
    items: [],
  };
  const visibleFaqItems = (faqConfig.items || []).filter(
    (item) => item.visible !== false && item.q?.trim() && item.a?.trim()
  );
  const [openFaqId, setOpenFaqId] = useState<string | null>(() => visibleFaqItems[0]?.id || null);

  useEffect(() => {
    if (openFaqId !== null && !visibleFaqItems.some((item) => item.id === openFaqId)) {
      setOpenFaqId(null);
    }
  }, [visibleFaqItems, openFaqId]);

  const displayPlans = (plans && plans.length > 0 ? plans : DEFAULT_PLANS_V2).filter(
    (p) => p.id !== 'free' && Number(p.pr) > 0
  );
  const homeTheme = resolveEffectiveThemeMode(site.homeThemeMode || 'light');
  const supportWa = getSupportWhatsapp(site);
  const heroLine1 =
    currentLang === 'ar'
      ? (_home.hero?.titleLine1?.trim() || 'المنيو الأذكى بالعراق')
      : (t.heroTitle || _home.hero?.titleLine1 || 'المنيو الأذكى بالعراق');
  const heroLine2 =
    currentLang === 'ar'
      ? (_home.hero?.titleLine2?.trim() ?? 'لمتجرك أو مطعمك')
      : (t.heroTitleLine2 ?? _home.hero?.titleLine2 ?? 'لمتجرك أو مطعمك');
  const heroLead =
    currentLang === 'ar'
      ? (_home.hero?.lead?.trim() || 'أطلق متجرك الآن واستقبل الطلبات')
      : (t.heroSubtitle || _home.hero?.lead || 'أطلق متجرك الآن واستقبل الطلبات');
  const demoRestSlug = getItem<Restaurant>('restaurants/demo')?.slug?.trim() || 'cap-burger';
  const demoMenuPath = `/${demoRestSlug.replace(/^\/+/, '')}`;
  const heroCtaText = currentLang === 'ar' ? (_home.hero?.cta1?.trim() || 'جرب المنيو الان') : tr('جرب المنيو الان', 'ئێستا مینیۆ تاقیبکەرەوە', 'Try Menu Now');
  const rawHeroCtaLink = (_home.hero?.cta1Link || '').trim();
  const normalizedHeroCtaLower = rawHeroCtaLink.toLowerCase().replace(/\/+$/, '');
  const isDemoAliasLink =
    !normalizedHeroCtaLower ||
    normalizedHeroCtaLower === '#' ||
    normalizedHeroCtaLower === '#home' ||
    normalizedHeroCtaLower === '/home' ||
    normalizedHeroCtaLower === 'home' ||
    normalizedHeroCtaLower === '/demo' ||
    normalizedHeroCtaLower === '#demo' ||
    normalizedHeroCtaLower === 'demo' ||
    normalizedHeroCtaLower === '/menu/demo' ||
    normalizedHeroCtaLower === 'menu/demo' ||
    normalizedHeroCtaLower === '#menu-demo' ||
    normalizedHeroCtaLower === '/#menu-demo' ||
    normalizedHeroCtaLower === 'menu-demo' ||
    /^https?:\/\/(www\.)?menuplus\.io\/(demo|menu\/demo|cap-burger)$/i.test(normalizedHeroCtaLower);
  const isExplicitDemoCta = /جرب\s*المنيو|التجريبي|تاقیبکەرەوە|try\s*menu/i.test(heroCtaText);
  const heroCtaLink =
    isDemoAliasLink ||
    (isExplicitDemoCta &&
      !/^https?:\/\//i.test(rawHeroCtaLink) &&
      !rawHeroCtaLink.startsWith('/dashboard') &&
      !rawHeroCtaLink.startsWith('/admin'))
      ? demoMenuPath
      : rawHeroCtaLink;
  const heroCtaVisible = _home.hero?.cta1Visible !== false;

  const navHomeText = currentLang === 'ar' ? (navCfg.home || 'الرئيسية') : t.home;
  const navExploreText = tr('استكشف', 'گەڕان', 'Explore');
  const navFeaturesText = currentLang === 'ar' ? (navCfg.services || 'المميزات') : t.features;
  const navFaqText = currentLang === 'ar' ? (navCfg.faq || 'الأسئلة الشائعة') : tr('الأسئلة الشائعة', 'پرسیارە باوەکان', 'FAQ');
  const navPricingText = currentLang === 'ar' ? (navCfg.pricing || 'الأسعار') : t.pricing;
  const navEnterNowText = currentLang === 'ar' ? (navCfg.enterNow || 'ادخل الآن') : t.enterNow;
  const navDashText = currentLang === 'ar' ? (navCfg.dashboard || 'لوحة التحكم') : t.dashboard;
  const navAdminDashText = currentLang === 'ar' ? (navCfg.adminDashboard || 'لوحة تحكم الإدارة') : t.adminDashboard;
  const navLogoutText = currentLang === 'ar' ? (navCfg.logout || 'تسجيل الخروج') : (t.logout || 'Logout');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;

    const brandTitle = currentLang === 'ar' ? (site.name || 'منيو بلس') : (!site.name || site.name === 'منيو بلس' ? t.appName : site.name);
    const pageTitle = tr(
      `${brandTitle} | أفضل منيو إلكتروني QR وكتالوج واتساب للمطاعم والكافيهات والمتاجر`,
      `${brandTitle} | باشترین مینیۆی دیجیتاڵی QR و کەتەلۆگی واتسئاپ بۆ چێشتخانە و فرۆشگاکان`,
      `${brandTitle} | Smart QR Digital Menu & WhatsApp Catalog for Restaurants & Stores`
    );
    const pageDesc = tr(
      'أنشئ منيو إلكتروني تفاعلي وباركود QR لمطعمك أو كافيهك أو متجرك خلال دقائق مع طلبات واتساب فورية وبدون أي عمولات على المبيعات.',
      'لە چەند خولەکێکدا مینیۆی دیجیتاڵی کارلێکەر و بارکۆدی QR بۆ چێشتخانە یان فرۆشگاکەت دروست بکە لەگەڵ داواکاری خێرای واتسئاپ بەبێ هیچ کۆمیشنێک.',
      'Create an interactive QR digital menu and WhatsApp ordering storefront for your restaurant, café, or store in minutes with zero commission.'
    );
    document.title = pageTitle;

    const upsertMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    upsertMeta('name', 'description', pageDesc);
    upsertMeta('property', 'og:title', pageTitle);
    upsertMeta('property', 'og:description', pageDesc);
    upsertMeta('name', 'twitter:title', pageTitle);
    upsertMeta('name', 'twitter:description', pageDesc);

    const origin = window.location.origin;
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${origin}${window.location.pathname === '/' ? '/' : window.location.pathname}`;

    const graph: Record<string, unknown>[] = [
      {
        '@type': 'Organization',
        name: brandTitle,
        alternateName: ['Menu+', 'منيو بلس', 'Menu Plus'],
        url: origin,
        logo: `${origin}/assets/aistudio/icon_f95f5a07.png`,
        sameAs: ['https://instagram.com/iq.menu'],
      },
      {
        '@type': 'WebSite',
        name: brandTitle,
        url: origin,
        inLanguage: ['ar', 'en', 'ku'],
      },
      {
        '@type': 'SoftwareApplication',
        name: brandTitle,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, iOS, Android',
        offers: displayPlans.map((pl) => ({
          '@type': 'Offer',
          name: pl.n,
          price: String(calcDiscountedPlanPrice(Number(pl.pr) || 0, Number(pl.discountPercent) || 0)),
          priceCurrency: 'IQD',
        })),
      },
    ];

    if (faqConfig.enabled !== false && visibleFaqItems.length > 0) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: visibleFaqItems.map((item) => {
          const loc = getLocalizedFaqItem(item, currentLang);
          return {
            '@type': 'Question',
            name: loc.q,
            acceptedAnswer: {
              '@type': 'Answer',
              text: loc.a,
            },
          };
        }),
      });
    }

    let ldEl = document.getElementById('mp-home-jsonld') as HTMLScriptElement | null;
    if (!ldEl) {
      ldEl = document.createElement('script');
      ldEl.id = 'mp-home-jsonld';
      ldEl.type = 'application/ld+json';
      document.head.appendChild(ldEl);
    }
    ldEl.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  }, [currentLang, isRtl, site.name, displayPlans, faqConfig.enabled, visibleFaqItems]);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.documentElement.dir = 'rtl';
        document.documentElement.lang = 'ar';
      }
    };
  }, []);

  useEffect(() => {
    const handleGlobalLang = (e: any) => {
      if (e?.detail) setCurrentLang(e.detail);
    };
    window.addEventListener('menuplus_lang_changed', handleGlobalLang);
    return () => window.removeEventListener('menuplus_lang_changed', handleGlobalLang);
  }, []);

  const handleLangChange = (l: SupportedLanguage) => {
    setCurrentLang(l);
    setStoredLanguage(l);
  };

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const targetId = id === 'demo' || id === 'about' ? 'home' : id;
    setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  const personalMenuRid = session?.menuLoggedOut
    ? ''
    : session?.admin
    ? (session.personalRid || 'demo')
    : (session?.rid || '');
  const ownRestaurant = personalMenuRid ? getItem<Restaurant>(`restaurants/${personalMenuRid}`) : null;
  const hasPersonalMenu = Boolean(personalMenuRid && (ownRestaurant || session?.admin));
  const isAdminWithMenu = Boolean(session?.admin && hasPersonalMenu && !session?.menuLoggedOut);

  const isStoreComplete = Boolean(
    session?.admin ||
    personalMenuRid === 'demo' ||
    (ownRestaurant && ownRestaurant.done === 1)
  );

  const dashboardTarget = session
    ? session.admin
      ? '/admin/home'
      : session.rid
      ? isStoreComplete
        ? '/dashboard/home'
        : '/onboard'
      : '/login'
    : '/login';

  const dashboardLabel = session
    ? session.admin
      ? navAdminDashText || 'لوحة تحكم الإدارة'
      : isStoreComplete
      ? navDashText || 'لوحة التحكم'
      : t.completeSetup || 'إكمال إعداد المتجر 🚀'
    : t.login;

  const openPersonalDashboard = () => {
    setMobileMenuOpen(false);
    if (!session) {
      onNavigate('/login');
      return;
    }
    if (session.admin) {
      const targetRid = personalMenuRid || 'demo';
      if (session.rid !== targetRid || session.personalRid !== targetRid || session.menuLoggedOut) {
        setSession({
          ...session,
          personalRid: targetRid,
          rid: targetRid,
          menuLoggedOut: false,
        });
      }
      onNavigate('/dashboard/home');
      return;
    }
    onNavigate(isStoreComplete ? '/dashboard/home' : '/onboard');
  };

  const handleEnterNow = () => {
    setMobileMenuOpen(false);
    if (session) {
      onNavigate(dashboardTarget);
    } else {
      onNavigate('/login');
    }
  };

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} data-home-theme={homeTheme} className={`home-root theme-${homeTheme}`} style={{ minHeight: '100vh' }}>
      {site.bn && <div className="bn">{site.bn}</div>}

      {/* Mobile Slide-Over Side Drawer (3 lines menu) */}
      {mobileMenuOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <aside className="drawer-panel" style={{ zIndex: 9999 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 18px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <AppLogo size={32} lang={currentLang} />
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label={tr('إغلاق القائمة', 'داخستنی لیست', 'Close menu')}
                style={{
                  background: 'none',
                  border: '1px solid var(--line)',
                  borderRadius: '10px',
                  width: '38px',
                  height: '38px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '14px 12px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {/* Exact 4 navigation links: Home -> Features -> FAQ -> Pricing */}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => scrollToSection('home')}
                  className="profile-popover-item"
                  style={{ borderRadius: '12px', fontWeight: 700 }}
                >
                  {isRtl ? (
                    <>
                      <span style={{ flex: 1 }}>{navHomeText}</span>
                      <Home size={18} style={{ color: 'var(--brand-ink, #34D399)' }} />
                    </>
                  ) : (
                    <>
                      <Home size={18} style={{ color: 'var(--brand-ink, #34D399)' }} />
                      <span style={{ flex: 1 }}>{navHomeText}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('explore')}
                  className="profile-popover-item"
                  style={{ borderRadius: '12px' }}
                >
                  {isRtl ? (
                    <>
                      <span style={{ flex: 1 }}>{navExploreText}</span>
                      <Compass size={18} style={{ color: 'var(--muted)' }} />
                    </>
                  ) : (
                    <>
                      <Compass size={18} style={{ color: 'var(--muted)' }} />
                      <span style={{ flex: 1 }}>{navExploreText}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('services')}
                  className="profile-popover-item"
                  style={{ borderRadius: '12px' }}
                >
                  {isRtl ? (
                    <>
                      <span style={{ flex: 1 }}>{navFeaturesText}</span>
                      <Sparkles size={18} style={{ color: 'var(--muted)' }} />
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} style={{ color: 'var(--muted)' }} />
                      <span style={{ flex: 1 }}>{navFeaturesText}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('faq')}
                  className="profile-popover-item"
                  style={{ borderRadius: '12px' }}
                >
                  {isRtl ? (
                    <>
                      <span style={{ flex: 1 }}>{navFaqText}</span>
                      <HelpCircle size={18} style={{ color: 'var(--muted)' }} />
                    </>
                  ) : (
                    <>
                      <HelpCircle size={18} style={{ color: 'var(--muted)' }} />
                      <span style={{ flex: 1 }}>{navFaqText}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('pricing')}
                  className="profile-popover-item"
                  style={{ borderRadius: '12px' }}
                >
                  {isRtl ? (
                    <>
                      <span style={{ flex: 1 }}>{navPricingText}</span>
                      <ShoppingBag size={18} style={{ color: 'var(--muted)' }} />
                    </>
                  ) : (
                    <>
                      <ShoppingBag size={18} style={{ color: 'var(--muted)' }} />
                      <span style={{ flex: 1 }}>{navPricingText}</span>
                    </>
                  )}
                </button>
              </nav>
            </div>

            <div
              style={{
                marginTop: 'auto',
                flexShrink: 0,
                borderTop: '1px solid var(--line)',
                padding: '14px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {session ? (
                <>
                  {isAdminWithMenu ? (
                    <>
                      <button
                        type="button"
                        className="btn p b"
                        onClick={openPersonalDashboard}
                      >
                        {isRtl ? (
                          <>
                            <span>{navDashText}</span>
                            <LayoutDashboard size={16} />
                          </>
                        ) : (
                          <>
                            <LayoutDashboard size={16} />
                            <span>{navDashText}</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn b"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onNavigate('/admin/home');
                        }}
                      >
                        {isRtl ? (
                          <>
                            <span>{navAdminDashText}</span>
                            <Shield size={16} />
                          </>
                        ) : (
                          <>
                            <Shield size={16} />
                            <span>{navAdminDashText}</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn p b"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onNavigate(dashboardTarget);
                      }}
                    >
                      {isRtl ? (
                        <>
                          <span>{dashboardLabel}</span>
                          {session.admin ? <Shield size={16} /> : <LayoutDashboard size={16} />}
                        </>
                      ) : (
                        <>
                          {session.admin ? <Shield size={16} /> : <LayoutDashboard size={16} />}
                          <span>{dashboardLabel}</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn b d"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogout?.();
                    }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: '#ef4444',
                      fontWeight: 800,
                      borderRadius: '12px',
                    }}
                  >
                    {isRtl ? (
                      <>
                        <span>{navLogoutText}</span>
                        <LogOut size={16} />
                      </>
                    ) : (
                      <>
                        <LogOut size={16} />
                        <span>{navLogoutText}</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn p b"
                  onClick={handleEnterNow}
                  style={{
                    borderRadius: '9999px',
                    fontWeight: 800,
                    fontSize: '14.5px',
                    padding: '12px 20px',
                  }}
                >
                  <span>{navEnterNowText}</span>
                  {isRtl ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
                </button>
              )}
            </div>
          </aside>
        </>
      )}

      {/* Main Header Navbar */}
      <header className="nav">
        <div className="w nav-inner">
          {/* Mobile Start (Right in RTL): 3-lines Hamburger Menu Button */}
          <div className="mobile-only-flex nav-mobile-start">
            <button
              type="button"
              className="hamburger-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={tr('القائمة الرئيسية', 'مینیۆی سەرەکی', 'Main menu')}
              title={tr('القائمة', 'مینیۆ', 'Menu')}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>

          {/* Brand Logo (Right in RTL Desktop, Centered in Mobile) */}
          <div className="nav-brand-wrap">
            <a
              className="brand"
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                textDecoration: 'none',
              }}
              aria-label={t.appName}
            >
              <AppLogo size={36} lang={currentLang} />
            </a>
          </div>

          {/* Center in RTL: Desktop Navigation Links: Home -> Features -> FAQ -> Pricing */}
          <nav
            className="links desktop-only-flex"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              gap: '28px',
              flex: 1,
            }}
          >
            <a href="/" onClick={(e) => { e.preventDefault(); scrollToSection('home'); }}>{navHomeText}</a>
            <a href="/explore" onClick={(e) => { e.preventDefault(); scrollToSection('explore'); }}>{navExploreText}</a>
            <a href="/services" onClick={(e) => { e.preventDefault(); scrollToSection('services'); }}>{navFeaturesText}</a>
            <a href="/faq" onClick={(e) => { e.preventDefault(); scrollToSection('faq'); }}>{navFaqText}</a>
            <a href="/pricing" onClick={(e) => { e.preventDefault(); scrollToSection('pricing'); }}>{navPricingText}</a>
          </nav>

          {/* Left Side in RTL: Desktop Actions (Pill Language Selector + Pill "ادخل الآن" Button) */}
          <div
            className="desktop-only-flex nav-desktop-actions"
            style={{
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            <LanguageSelector
              currentLang={currentLang}
              onChange={handleLangChange}
              buttonTextColor="var(--ink)"
            />

            {isAdminWithMenu ? (
              <>
                <button
                  type="button"
                  className="btn p s"
                  onClick={openPersonalDashboard}
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {isRtl ? (
                    <>
                      <span>{navDashText}</span>
                      <LayoutDashboard size={14} />
                    </>
                  ) : (
                    <>
                      <LayoutDashboard size={14} />
                      <span>{navDashText}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn s"
                  onClick={() => onNavigate('/admin/home')}
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {isRtl ? (
                    <>
                      <span>{navAdminDashText}</span>
                      <Shield size={14} />
                    </>
                  ) : (
                    <>
                      <Shield size={14} />
                      <span>{navAdminDashText}</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={session?.admin ? 'btn s' : 'btn p s'}
                onClick={handleEnterNow}
                style={{
                  fontSize: session?.admin ? '13px' : '13.5px',
                  fontWeight: 800,
                  padding: session?.admin ? '8px 16px' : '8px 22px',
                  borderRadius: '9999px',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: session?.admin ? undefined : '0 4px 16px rgba(27, 94, 74, 0.4)',
                }}
              >
                {isRtl ? (
                  <>
                    <span>{session ? dashboardLabel : navEnterNowText}</span>
                    {session?.admin ? <Shield size={14} /> : <ArrowLeft size={14} />}
                  </>
                ) : (
                  <>
                    {session?.admin ? <Shield size={14} /> : <ArrowRight size={14} />}
                    <span>{session ? dashboardLabel : navEnterNowText}</span>
                  </>
                )}
              </button>
            )}

            {session && (
              <button
                type="button"
                className="btn s d"
                onClick={() => onLogout?.()}
                title={navLogoutText}
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  padding: '8px 14px',
                  borderRadius: '9999px',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#ef4444',
                }}
              >
                {isRtl ? (
                  <>
                    <span>{navLogoutText}</span>
                    <LogOut size={14} />
                  </>
                ) : (
                  <>
                    <LogOut size={14} />
                    <span>{navLogoutText}</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Mobile End (Left in RTL): Language Selector */}
          <div
            className="mobile-only-flex nav-mobile-actions"
            style={{
              alignItems: 'center',
              justifyContent: 'flex-end',
              flexShrink: 0,
            }}
          >
            <LanguageSelector
              currentLang={currentLang}
              onChange={handleLangChange}
              compact={true}
              buttonTextColor="var(--ink)"
            />
          </div>
        </div>
      </header>

      {/* Scroll Progress Hairline */}
      {!prefersReducedMotion && (
        <motion.div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: '2.5px',
            background: 'var(--brand)',
            transformOrigin: isRtl ? '100% 50%' : '0% 50%',
            scaleX: smoothScrollProgress,
            zIndex: 90,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* 1. SECTION: الرئيسية والنبذة (HOME / HERO)                                */}
      {/* ========================================================================= */}
      {sectionsCfg.hero !== false && (
      <section className="hero" id="home">
        <div
          className="w"
          style={{ gridTemplateColumns: '1fr', justifyItems: 'center', textAlign: 'center' }}
        >
          {/* Hero Content & CTA */}
          <div
            className="hero-content"
            style={{ maxWidth: '780px', marginInline: 'auto' }}
          >
            <h1
              className="hero-title"
              style={{
                fontFamily: 'var(--font-heading, var(--font))',
                fontSize: 'calc(clamp(34px, 5.2vw, 56px) * var(--font-scale, 1))',
                lineHeight: 'var(--font-heading-lh, 1.28)',
                fontWeight: 'var(--font-heading-weight, 800)' as any,
                color: 'var(--ink)',
                marginBottom: '20px',
                letterSpacing: 'calc(var(--font-tracking, 0em) - 0.02em)',
              }}
            >
              <span style={{ display: 'block' }}>
                <Ml7Text
                  text={heroLine1}
                  mode="mount"
                  delay={0.1}
                  stagger={0.14}
                  isRtl={isRtl}
                />
              </span>
              {heroLine2 && (
                <span style={{ display: 'block', color: homeTheme === 'dark' ? 'var(--brand-ink, #34D399)' : 'var(--brand)' }}>
                  <Ml7Text
                    text={heroLine2}
                    mode="mount"
                    delay={0.56}
                    stagger={0.14}
                    isRtl={isRtl}
                  />
                </span>
              )}
            </h1>

            <motion.p
              className="lead hero-subtitle"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.3, delay: 0.72, ease: [0.16, 1, 0.3, 1] }}
              style={{
                fontFamily: 'var(--font-body, var(--font))',
                fontSize: 'calc(clamp(16px, 2.2vw, 21px) * var(--font-desc-scale, 1))',
                color: homeTheme === 'light' ? '#334155' : 'var(--ink-soft, #CBD5E1)',
                lineHeight: 'var(--font-body-lh, 1.7)',
                marginBottom: '34px',
                maxWidth: '620px',
                marginInline: 'auto',
                fontWeight: 'var(--font-desc-weight, 500)' as any,
              }}
            >
              <span className="hero-subtitle-shine-wrap">
                <span className="hero-subtitle-base">{heroLead}</span>
                <span className="hero-subtitle-gleam" aria-hidden="true">{heroLead}</span>
              </span>
            </motion.p>

            {/* Main Action CTA */}
            {heroCtaVisible && (
              <motion.div
                className="cta hero-cta"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, delay: 0.92, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  gap: '12px',
                  marginBottom: '12px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                <motion.button
                  type="button"
                  className="mp-magic-create-btn hero-cta-btn"
                  whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.015 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => {
                    if (/^https?:\/\//i.test(heroCtaLink)) {
                      window.location.href = heroCtaLink;
                    } else {
                      onNavigate(heroCtaLink);
                    }
                  }}
                  style={{
                    fontSize: '16.5px',
                    padding: '15px 34px',
                    fontWeight: 900,
                    borderRadius: '9999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '9px',
                    width: 'auto',
                    marginTop: 0,
                  }}
                >
                  {isRtl ? (
                    <>
                      <span>{heroCtaText}</span>
                      <Sparkles size={18} className="mp-magic-sparkle" />
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} className="mp-magic-sparkle" />
                      <span>{heroCtaText}</span>
                    </>
                  )}
                </motion.button>
              </motion.div>
            )}
          </div>
        </div>
      </section>
      )}

      {/* ========================================================================= */}
      {/* 2. SECTION: استكشف (INTERACTIVE SEAMLESS PLATFORM TOUR)                   */}
      {/* ========================================================================= */}
      <ExploreShowcase lang={currentLang} homeTheme={homeTheme} />

      {/* ========================================================================= */}
      {/* 3. SECTION: مميزاتنا (STRICTLY 2-PER-ROW ON DESKTOP & MOBILE)              */}
      {/* ========================================================================= */}
      {sectionsCfg.services !== false && (() => {
        const dynamicFeatures =
          currentLang === 'ar' && Array.isArray(servicesCfg?.list) && servicesCfg.list.length > 0
            ? servicesCfg.list
            : [
                { i: '💸', t: t.feature1Title, d: t.feature1Desc },
                { i: '📲', t: t.feature2Title, d: t.feature2Desc },
                { i: '⚡', t: t.feature3Title, d: t.feature3Desc },
                { i: '📷', t: t.feature4Title, d: t.feature4Desc },
                { i: '🎯', t: t.feature5Title, d: t.feature5Desc },
                { i: '📊', t: t.feature6Title, d: t.feature6Desc },
              ];
        const featSectionBadge = currentLang === 'ar' ? (servicesCfg?.badge || `✨ ${t.features}`) : `✨ ${t.features}`;
        const featSectionTitle = currentLang === 'ar' ? (servicesCfg?.title || t.whyTitle) : t.whyTitle;
        const featSectionSub = currentLang === 'ar' ? (servicesCfg?.sub || t.whyLead) : t.whyLead;
        return (
          <section
            className="s"
            id="services"
            style={{
              paddingTop: 'clamp(76px, 8.5vw, 116px)',
              paddingBottom: 'clamp(76px, 8.5vw, 116px)',
            }}
          >
            <div className="w">
              <div style={{ textAlign: 'center', maxWidth: '560px', margin: '0 auto 34px' }}>
                <span
                  className="tag"
                  style={{
                    background: 'var(--soft)',
                    color: 'var(--brand-ink)',
                    marginBottom: '8px',
                    fontSize: '11.5px',
                    padding: '3px 10px',
                  }}
                >
                  {featSectionBadge}
                </span>
                <h2
                  style={{
                    fontFamily: 'var(--font-heading, var(--font))',
                    fontSize: 'calc(clamp(19px, 3vw, 26px) * var(--font-scale, 1))',
                    fontWeight: 'var(--font-heading-weight, 800)' as any,
                    marginBottom: '6px',
                    lineHeight: 'var(--font-heading-lh, 1.32)',
                  }}
                >
                  <Ml7Text
                    text={featSectionTitle}
                    mode="inView"
                    delay={0.08}
                    stagger={0.12}
                    isRtl={isRtl}
                  />
                </h2>
                <p
                  className="sub"
                  style={{
                    fontFamily: 'var(--font-body, var(--font))',
                    fontSize: 'var(--font-desc-size, 13.5px)',
                    fontWeight: 'var(--font-desc-weight, 400)' as any,
                    lineHeight: 'var(--font-body-lh, 1.65)',
                    margin: '0 auto',
                    maxWidth: '480px',
                  }}
                >
                  {featSectionSub}
                </p>
              </div>

              <div className="features-compact-grid">
                {dynamicFeatures.map((feat, fIdx) => {
                  const isAmber = fIdx % 3 === 1;
                  const isEmerald = fIdx % 3 === 2;
                  const iconBg = isAmber
                    ? 'rgba(245, 158, 11, 0.14)'
                    : isEmerald
                    ? 'rgba(37, 211, 102, 0.15)'
                    : 'var(--soft)';
                  const iconFg = isAmber
                    ? homeTheme === 'light'
                      ? '#B45309'
                      : '#fbbf24'
                    : isEmerald
                    ? '#16a34a'
                    : 'var(--brand-ink)';
                  return (
                    <motion.div
                      key={fIdx}
                      className="card feature-compact-card"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{
                        duration: 0.96,
                        delay: prefersReducedMotion ? 0 : Math.min(fIdx * 0.11, 0.64),
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      <div className="feature-card-head">
                        <div className="feature-card-icon" style={{ background: iconBg, color: iconFg }}>
                          {feat.i || '✨'}
                        </div>
                        <h3 className="feature-card-title">{feat.t}</h3>
                      </div>
                      <p className="muted feature-card-desc">{feat.d}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })()}

      {/* FAQ Accordion Section (Placed before Pricing so Pricing is last above the footer) */}
      {faqConfig.enabled !== false && visibleFaqItems.length > 0 && (
        <section
          className="s"
          id="faq"
          aria-labelledby="faq-section-heading"
          style={{
            paddingTop: 'clamp(76px, 8.5vw, 116px)',
            paddingBottom: 'clamp(76px, 8.5vw, 116px)',
          }}
        >
          <div className="w">
            <div style={{ textAlign: 'center', marginBottom: '34px' }}>
              <h2
                id="faq-section-heading"
                style={{
                  fontFamily: 'var(--font-heading, var(--font))',
                  fontSize: 'calc(clamp(22px, 4.2vw, 34px) * var(--font-scale, 1))',
                  fontWeight: 'var(--font-heading-weight, 800)' as any,
                  lineHeight: 'var(--font-heading-lh, 1.3)',
                  margin: '0 0 8px',
                  color: 'var(--ink)',
                  letterSpacing: 'calc(var(--font-tracking, 0em) - 0.015em)',
                }}
              >
                <Ml7Text
                  text={currentLang === 'ar' ? (faqConfig.title || 'أسئلة ممكن تجي في بالك') : tr('أسئلة ممكن تجي في بالك', 'پرسیارە باوەکان کە لەوانەیە بە مێشکتدا بێن', 'Frequently Asked Questions')}
                  mode="inView"
                  delay={0.08}
                  stagger={0.12}
                  isRtl={isRtl}
                />
              </h2>
              {(currentLang !== 'ar' || faqConfig.sub) && (
                <p
                  className="muted"
                  style={{
                    fontFamily: 'var(--font-body, var(--font))',
                    maxWidth: '540px',
                    margin: '0 auto',
                    fontSize: 'var(--font-desc-size, 13.5px)',
                    fontWeight: 'var(--font-desc-weight, 400)' as any,
                    lineHeight: 'var(--font-body-lh, 1.65)',
                    color: 'var(--muted)',
                  }}
                >
                  {currentLang === 'ar'
                    ? faqConfig.sub
                    : tr('تفاصيل تساعدك تختار التجربة المناسبة لنشاطك.', 'وردەکارییەکان کە یارمەتیت دەدەن باشترین ئەزموون بۆ کارەکەت هەڵبژێریت.', 'Clear answers to help you pick the right setup for your business.')}
                </p>
              )}
            </div>

            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 1.04, ease: [0.16, 1, 0.3, 1] }}
              style={{
                maxWidth: '720px',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {visibleFaqItems.map((item, idx) => {
                const isOpen = openFaqId === item.id;
                const localizedFaq = getLocalizedFaqItem(item, currentLang);
                return (
                  <div
                    key={item.id || idx}
                    style={{
                      borderRadius: '14px',
                      border: isOpen
                        ? '1px solid var(--brand)'
                        : '1px solid var(--line)',
                      background: isOpen
                        ? 'var(--soft)'
                        : 'var(--surface)',
                      transition: 'border-color 0.22s ease, background-color 0.22s ease',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${item.id}`}
                      onClick={() => setOpenFaqId((cur) => (cur === item.id ? null : item.id))}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '13px 14px',
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        textAlign: 'start',
                        color: 'var(--ink)',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-heading, var(--font))',
                          fontSize: 'clamp(14px, 2.2vw, 17px)',
                          fontWeight: 800,
                          lineHeight: 1.45,
                          color: isOpen ? 'var(--brand-ink)' : 'var(--ink)',
                          transition: 'color 0.2s ease',
                        }}
                      >
                        {localizedFaq.q}
                      </span>

                      <span
                        aria-hidden="true"
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          background: isOpen ? 'var(--brand)' : 'var(--soft)',
                          border: isOpen ? '1px solid transparent' : '1px solid var(--line)',
                          color: isOpen ? '#ffffff' : 'var(--brand-ink)',
                          display: 'inline-grid',
                          placeItems: 'center',
                          flexShrink: 0,
                          transition:
                            'transform 0.56s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.44s ease, color 0.44s ease',
                          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                      >
                        <ChevronDown size={16} strokeWidth={2.5} />
                      </span>
                    </button>

                    <div
                      id={`faq-answer-${item.id}`}
                      aria-hidden={!isOpen}
                      style={{
                        display: 'grid',
                        gridTemplateRows: isOpen ? '1fr' : '0fr',
                        opacity: isOpen ? 1 : 0,
                        transition:
                          'grid-template-rows 0.56s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.44s ease',
                      }}
                    >
                      <div style={{ overflow: 'hidden' }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-body, var(--font))',
                            padding: '0 14px 14px',
                            color: homeTheme === 'light' ? '#334155' : '#CBD5E1',
                            fontSize: 'clamp(12.5px, 1.8vw, 14px)',
                            lineHeight: 1.75,
                          }}
                        >
                          {localizedFaq.a}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>
        </section>
      )}

      {/* Pricing Plans Section (4 Tiers with Monthly/Annual Toggle & Admin Discounts — Last Section Before Footer) */}
      {sectionsCfg.pricing !== false && (
      <section
        className="s"
        id="pricing"
        style={{
          paddingTop: 'clamp(76px, 8.5vw, 116px)',
          paddingBottom: 'clamp(88px, 9.5vw, 132px)',
        }}
      >
        <div className="w">
          <div style={{ textAlign: 'center', marginBottom: '34px' }}>
            <div
              className="tag g"
              style={{
                display: 'inline-flex',
                marginBottom: '12px',
                background: 'var(--soft)',
                border: '1px solid var(--line)',
                color: 'var(--brand-ink)',
              }}
            >
              {currentLang === 'ar' ? (pricingCfg?.badge || '💎 الأسعار والباقات') : tr('💎 الأسعار والباقات', '💎 نرخ و پاکێجەکان', '💎 Plans & Pricing')}
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-heading, var(--font))',
                fontSize: 'calc(clamp(24px, 4.4vw, 34px) * var(--font-scale, 1))',
                fontWeight: 'var(--font-heading-weight, 800)' as any,
                lineHeight: 'var(--font-heading-lh, 1.3)',
                marginBottom: '10px',
              }}
            >
              <Ml7Text
                text={currentLang === 'ar' ? (pricingCfg?.title || 'اختر الباقة المناسبة لمشروعك') : tr('اختر الباقة المناسبة لمشروعك', 'باشترین پاکێج بۆ پرۆژەکەت هەڵبژێرە', 'Choose the Right Plan for Your Business')}
                mode="inView"
                delay={0.08}
                stagger={0.12}
                isRtl={isRtl}
              />
            </h2>
            <p
              className="muted"
              style={{
                fontFamily: 'var(--font-body, var(--font))',
                maxWidth: '640px',
                margin: '0 auto 20px',
                fontSize: 'calc(var(--font-desc-size, 13.5px) + 1px)',
                fontWeight: 'var(--font-desc-weight, 400)' as any,
                lineHeight: 'var(--font-body-lh, 1.7)',
              }}
            >
              {currentLang === 'ar'
                ? (pricingCfg?.sub || 'اشترك بالباقة المناسبة لمشروعك بدون أي عمولة على مبيعاتك، وطوّر باقتك في أي وقت مع نمو طلباتك.')
                : tr('اشترك بالباقة المناسبة لمشروعك بدون أي عمولة على مبيعاتك، وطوّر باقتك في أي وقت مع نمو طلباتك.', 'بە پاکێجی گونجاو دەستپێبکە بەبێ هیچ کۆمیشنێک لەسەر فرۆشەکانت، و هەر کاتێک بتەوێت بەرزبکەرەوە.', 'Subscribe with 0% sales commission and upgrade anytime as your daily orders grow.')}
            </p>

            {/* Monthly / Annual Billing Switch with Spring Pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '9999px',
                padding: '4px',
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)',
                position: 'relative',
              }}
            >
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                style={{
                  position: 'relative',
                  border: 0,
                  borderRadius: '9999px',
                  padding: '8px 20px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: billingCycle === 'monthly' ? '#ffffff' : 'var(--muted)',
                  transition: 'color 0.4s ease',
                  zIndex: 1,
                }}
              >
                {billingCycle === 'monthly' && (
                  <motion.span
                    layoutId="homeBillingPill"
                    transition={{ type: 'spring', stiffness: 210, damping: 28 }}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '9999px',
                      background: 'var(--brand)',
                      zIndex: -1,
                    }}
                  />
                )}
                <span>{currentLang === 'ar' ? (pricingCfg?.monthlyLabel || 'اشتراك شهري') : t.monthlyBilling}</span>
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('annual')}
                style={{
                  position: 'relative',
                  border: 0,
                  borderRadius: '9999px',
                  padding: '8px 20px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  background: 'transparent',
                  color: billingCycle === 'annual' ? '#ffffff' : 'var(--muted)',
                  transition: 'color 0.4s ease',
                  zIndex: 1,
                }}
              >
                {billingCycle === 'annual' && (
                  <motion.span
                    layoutId="homeBillingPill"
                    transition={{ type: 'spring', stiffness: 210, damping: 28 }}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '9999px',
                      background: 'var(--brand)',
                      zIndex: -1,
                    }}
                  />
                )}
                <span>{currentLang === 'ar' ? (pricingCfg?.annualLabel || 'اشتراك سنوي') : t.annualBilling}</span>
                <span
                  style={{
                    fontSize: '10.5px',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: billingCycle === 'annual' ? 'rgba(255, 255, 255, 0.22)' : 'var(--soft)',
                    color: billingCycle === 'annual' ? '#ffffff' : 'var(--brand-ink)',
                    fontWeight: 900,
                  }}
                >
                  {currentLang === 'ar' ? (pricingCfg?.annualBadge || 'احصل على شهر مجاني') : tr('احصل على شهر مجاني', 'مانگێک بێبەرامبەر', '1 Month Free')}
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch max-w-5xl mx-auto">
            {displayPlans.map((plan, idx) => {
              const isHot = plan.hot === 1;
              const isVip = plan.id === 'vip' || Boolean(plan.featuresMap?.allAddons);
              const basePrice =
                billingCycle === 'annual'
                  ? Number(plan.annualPr ?? Math.round((Number(plan.pr) || 0) * 11))
                  : Number(plan.pr) || 0;
              const promoPct = Math.min(95, Math.max(0, Number(plan.discountPercent) || 0));
              const finalPrice = calcDiscountedPlanPrice(basePrice, promoPct);
              const hasPromo = basePrice > 0 && promoPct > 0 && finalPrice < basePrice;
              const comparisonRows = buildPlanComparisonRows(plan, currentLang);

              return (
                <motion.div
                  key={plan.id || idx}
                  className="card mp-pricing-card-anim"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{
                    duration: 1.0,
                    delay: prefersReducedMotion ? 0 : idx * 0.16,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{
                    padding: '18px 15px',
                    borderRadius: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px',
                    position: 'relative',
                    background: isHot
                      ? homeTheme === 'light'
                        ? 'linear-gradient(165deg, rgba(15, 118, 110, 0.05) 0%, #FFFFFF 65%)'
                        : 'linear-gradient(165deg, rgba(15, 118, 110, 0.14) 0%, #161B22 65%)'
                      : isVip
                      ? homeTheme === 'light'
                        ? 'linear-gradient(165deg, rgba(245, 158, 11, 0.07) 0%, #FFFFFF 65%)'
                        : 'linear-gradient(165deg, rgba(245, 158, 11, 0.10) 0%, #161B22 65%)'
                      : 'var(--surface)',
                    border: isHot
                      ? '2px solid var(--brand)'
                      : isVip
                      ? '1.5px solid rgba(217, 119, 6, 0.45)'
                      : '1px solid var(--line)',
                    boxShadow: isHot
                      ? '0 12px 28px rgba(15, 118, 110, 0.12)'
                      : '0 4px 14px rgba(15, 23, 42, 0.05)',
                  }}
                >
                  <div>
                    {/* Top Badge & Promo Row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                        minHeight: '22px',
                        marginBottom: '8px',
                      }}
                    >
                      {isHot ? (
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 900,
                            padding: '2px 9px',
                            borderRadius: '9999px',
                            background: 'var(--brand)',
                            color: '#ffffff',
                          }}
                        >
                          {currentLang === 'ar' ? (pricingCfg?.hotBadge || 'الأكثر اختياراً 🔥') : tr('الأكثر اختياراً 🔥', 'پڕهەڵبژاردەترین 🔥', 'Most Popular 🔥')}
                        </span>
                      ) : isVip ? (
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 900,
                            padding: '2px 9px',
                            borderRadius: '9999px',
                            background: 'rgba(245, 158, 11, 0.14)',
                            border: '1px solid rgba(217, 119, 6, 0.4)',
                            color: homeTheme === 'light' ? '#B45309' : '#fbbf24',
                          }}
                        >
                          {currentLang === 'ar' ? (pricingCfg?.vipBadge || 'شاملة بلا حدود 👑') : tr('شاملة بلا حدود 👑', 'گشتی بێ سنوور 👑', 'Unlimited All-In 👑')}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '2px 9px',
                            borderRadius: '9999px',
                            background: 'var(--panel)',
                            border: '1px solid var(--line)',
                            color: 'var(--muted)',
                          }}
                        >
                          {currentLang === 'ar' ? (pricingCfg?.growthBadge || 'باقة متنامية') : tr('باقة متنامية', 'پاکێجی گەشەکردن', 'Growth Plan')}
                        </span>
                      )}

                      {hasPromo && (
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 900,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            background: 'rgba(220, 38, 38, 0.12)',
                            border: '1px solid rgba(220, 38, 38, 0.35)',
                            color: homeTheme === 'light' ? '#B91C1C' : '#fca5a5',
                          }}
                        >
                          {tr(`خصم ${promoPct}%`, `داشکاندنی ${promoPct}%`, `${promoPct}% OFF`)}
                        </span>
                      )}
                    </div>

                    <h3
                      style={{
                        fontFamily: 'var(--font-heading, var(--font))',
                        margin: '0 0 4px',
                        fontSize: '17px',
                        fontWeight: 900,
                        color: 'var(--ink)',
                        lineHeight: 1.3,
                      }}
                    >
                      {getLocalizedPlanName(plan, currentLang)}
                    </h3>
                    <p
                      className="muted"
                      style={{
                        fontFamily: 'var(--font-body, var(--font))',
                        margin: '0 0 12px',
                        fontSize: '11.5px',
                        lineHeight: 1.45,
                        minHeight: '18px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={getLocalizedPlanTagline(plan, currentLang)}
                    >
                      {getLocalizedPlanTagline(plan, currentLang)}
                    </p>

                    {/* Compact Price Box */}
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: '12px',
                        background: 'var(--panel)',
                        border: '1px solid var(--line)',
                        marginBottom: '12px',
                      }}
                    >
                      <div>
                        {hasPromo ? (
                          <div
                            className="tabular-nums"
                            style={{
                              fontSize: '11.5px',
                              color: 'var(--muted)',
                              textDecoration: 'line-through',
                              marginBottom: '2px',
                            }}
                          >
                            {formatNumber(basePrice)} {getLocalizedCurrencyUnit('د.ع', currentLang)}
                          </div>
                        ) : billingCycle === 'annual' && Number(plan.pr) > 0 && basePrice < Number(plan.pr) * 12 ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '11px',
                              marginBottom: '2px',
                            }}
                          >
                            <span
                              className="tabular-nums"
                              style={{ color: 'var(--muted)', textDecoration: 'line-through' }}
                            >
                              {formatNumber(Number(plan.pr) * 12)} {getLocalizedCurrencyUnit('د.ع', currentLang)}
                            </span>
                            <span style={{ color: 'var(--brand-ink)', fontWeight: 800 }}>
                              {tr('شهر مجاني 🎁', 'مانگێک بێبەرامبەر 🎁', '1 Month Free 🎁')}
                            </span>
                          </div>
                        ) : null}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', flexWrap: 'wrap' }}>
                          <motion.span
                            key={`${plan.id}-${billingCycle}-${finalPrice}`}
                            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                            className="tabular-nums"
                            style={{ fontSize: '23px', fontWeight: 900, color: 'var(--ink)', lineHeight: 1.1, display: 'inline-block' }}
                          >
                            {formatNumber(finalPrice)}
                          </motion.span>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: isVip ? (homeTheme === 'light' ? '#B45309' : '#fbbf24') : 'var(--brand-ink)' }}>
                            {getLocalizedCurrencyUnit('د.ع', currentLang)}
                          </span>
                          <span className="muted" style={{ fontSize: '11.5px', fontWeight: 700 }}>
                            / {billingCycle === 'annual' ? tr('سنوياً', 'ساڵانە', 'year') : tr('شهرياً', 'مانگانە', 'month')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Unified Aligned Comparison Checklist */}
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '7px',
                      }}
                    >
                      {comparisonRows.map((row) => (
                        <li
                          key={row.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '6px',
                            fontSize: '12px',
                            lineHeight: 1.35,
                            color: row.included ? 'var(--ink)' : 'var(--muted)',
                            opacity: row.included ? 1 : 0.65,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                            <span
                              style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                background: row.included
                                  ? isVip
                                    ? 'rgba(245, 158, 11, 0.16)'
                                    : 'var(--soft)'
                                  : 'rgba(148, 163, 184, 0.14)',
                                color: row.included ? (isVip ? (homeTheme === 'light' ? '#B45309' : '#fbbf24') : 'var(--brand-ink)') : '#64748b',
                                display: 'inline-grid',
                                placeItems: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {row.included ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={2.6} />}
                            </span>
                            <span
                              style={{
                                fontWeight: row.included ? 600 : 500,
                                textDecoration: row.included ? 'none' : 'line-through',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {row.label}
                            </span>
                          </div>

                          {isVip && row.key === 'addons' && row.included && (
                            <button
                              type="button"
                              onClick={() => setShowAddonsModal(true)}
                              style={{
                                border: '1px solid rgba(217, 119, 6, 0.45)',
                                background: 'rgba(245, 158, 11, 0.12)',
                                color: homeTheme === 'light' ? '#B45309' : '#fbbf24',
                                borderRadius: '9999px',
                                padding: '2px 7px',
                                fontSize: '10px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              {tr('عرض الكل', 'بینینی هەموو', 'View All')}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    className={`btn b ${isHot ? 'p' : ''}`}
                    onClick={() => {
                      onSelectPlan(idx);
                      setPurchaseModalPlan(plan);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '9999px',
                      fontWeight: 800,
                      fontSize: '13px',
                      background: isVip
                        ? 'linear-gradient(135deg, #d97706, #b45309)'
                        : undefined,
                      color: isVip ? '#ffffff' : undefined,
                      border: isVip ? 0 : undefined,
                      cursor: 'pointer',
                      marginTop: 'auto',
                    }}
                  >
                    {`${currentLang === 'ar' ? (pricingCfg?.paidCtaPrefix || 'اشترك في') : tr('اشترك في', 'بەشداری بکە لە', 'Subscribe to')} ${getLocalizedPlanName(plan, currentLang)} ${isRtl ? '←' : '→'}`}
                  </button>
                </motion.div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: '24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              textAlign: 'center',
            }}
          >
            <p className="muted" style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>
              {currentLang === 'ar'
                ? (pricingCfg?.helpText || 'هل تحتاج مساعدة في اختيار الباقة الأنسب أو لديك استفسار عن خدماتنا؟')
                : tr('هل تحتاج مساعدة في اختيار الباقة الأنسب أو لديك استفسار عن خدماتنا؟', 'پێویستت بە یارمەتی هەیە بۆ هەڵبژاردنی پاکێجی گونجاو یان پرسیارت هەیە؟', 'Need help choosing the right plan or have questions about our features?')}
            </p>
            <a
              className="mp-wa-cta-link"
              href={waLink(
                supportWa,
                tr('مرحباً، أود الاستفسار عن الباقات والخدمات في منصة منيو بلس', 'سڵاو، دەمەوێت پرسیار بکەم دەربارەی پاکێج و خزمەتگوزارییەکانی مینیۆ پڵەس', 'Hello, I would like to inquire about Menu+ plans and services')
              )}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '9px',
                padding: '11px 24px',
                borderRadius: '9999px',
                background: 'var(--soft)',
                border: '1px solid var(--line)',
                color: 'var(--brand-ink)',
                fontSize: '13.5px',
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
                transition: 'transform 0.16s ease, border-color 0.16s ease',
              }}
            >
              <span>
                {currentLang === 'ar'
                  ? (pricingCfg?.whatsappBtnText || 'تواصل معنا مباشرة للاستفسار عن الباقات والخدمات')
                  : tr('تواصل معنا مباشرة للاستفسار عن الباقات والخدمات', 'ڕاستەوخۆ پەیوەندیمان پێوە بکە لە واتسئاپ', 'Contact Us Directly on WhatsApp')}
              </span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
                <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.47 0 .11 5.36.11 11.95c0 2.11.55 4.17 1.6 5.98L0 24l6.23-1.63a11.93 11.93 0 0 0 5.83 1.49h.01c6.59 0 11.95-5.36 11.95-11.95 0-3.19-1.24-6.19-3.5-8.43zM12.07 21.84h-.01a9.89 9.89 0 0 1-5.04-1.38l-.36-.21-3.7.97.99-3.6-.24-.37a9.9 9.9 0 0 1-1.52-5.29c0-5.46 4.44-9.9 9.91-9.9 2.65 0 5.13 1.03 7 2.91a9.84 9.84 0 0 1 2.9 7c0 5.47-4.45 9.91-9.93 9.91zm5.44-7.42c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.21 5.08 4.5.71.31 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z" />
              </svg>
            </a>
          </div>
        </div>
      </section>
      )}

      {/* Search-Engine Accessible Structured Semantic Guide for Crawlers */}
      <section className="sr-only" aria-label={tr('دليل منصة منيو بلس للبحث', 'ڕێبەری گەڕانی مینیۆ پڵەس', 'Menu+ Platform Search Guide')}>
        <h2>{tr('أقوى منصة عربية لإنشاء المنيو الإلكتروني باركود QR وطلبات الواتساب للمطاعم والكافيهات والمتاجر', 'بەهێزترین پلاتفۆرم بۆ دروستکردنی مینیۆی دیجیتاڵی QR و داواکاری واتسئاپ', 'Smart QR Digital Menu & WhatsApp Catalog Platform for Restaurants & Stores')}</h2>
        <p>
          {tr(
            'منيو بلس Menu+ يتيح لأصحاب المطاعم والمقاهي والكوفي شوب والحلويات والمخابز والمتاجر الإلكترونية والعيادات إنشاء قائمة طعام رقمية وكتالوج مبيعات إلكتروني احترافي يعمل عبر رمز الاستجابة السريع QR Code على الطاولات أو رابط مباشر للإنستقرام وتيك توك وخرائط جوجل، مع سلة تسوق ذكية ترسل تفاصيل الطلب والفاتورة وموقع الزبون GPS مباشرة إلى واتساب المطعم بدون أي وسطاء أو عمولة مبيعات في العراق (بغداد، أربيل، البصرة، النجف، كربلاء، الموصل، السليمانية) والخليج والعالم العربي.',
            'مینیۆ پڵەس ڕێگە بە خاوەن چێشتخانە و کافێ و فرۆشگاکان دەدات مینیۆ و کەتەلۆگی دیجیتاڵی بە کۆدی QR و داواکاری خێرای واتسئاپ دروست بکەن بەبێ هیچ عمولەیەک لە عێراق.',
            'Menu+ helps restaurants, cafés, bakeries, and online stores launch a fast QR digital menu and WhatsApp catalog with itemized bills, GPS location sharing, and 0% sales commission.'
          )}
        </p>
      </section>

      {/* Clean Footer with WhatsApp & Instagram Social Links, Privacy & Attribution */}
      {sectionsCfg.footer !== false && (
      <footer className="ft2" style={{ padding: '26px 20px', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div className="w ft2-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AppLogo size={32} lang={currentLang} />

            {/* WhatsApp & Instagram Social Logos */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <a
                href={waLink(supportWa, tr('مرحباً، أود الاستفسار عن منصة منيو بلس', 'سڵاو، دەمەوێت پرسیار بکەم دەربارەی مینیۆ پڵەس', 'Hello, I have an inquiry about Menu+'))}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={tr(`تواصل معنا عبر واتساب ${supportWa}`, `پەیوەندی لە واتسئاپ ${supportWa}`, `Chat on WhatsApp ${supportWa}`)}
                title={`${tr('واتساب', 'واتسئاپ', 'WhatsApp')} ${supportWa}`}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'rgba(37, 211, 102, 0.14)',
                  border: '1px solid rgba(37, 211, 102, 0.4)',
                  color: '#25D366',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.15s ease, background-color 0.15s ease',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.47 0 .11 5.36.11 11.95c0 2.11.55 4.17 1.6 5.98L0 24l6.23-1.63a11.93 11.93 0 0 0 5.83 1.49h.01c6.59 0 11.95-5.36 11.95-11.95 0-3.19-1.24-6.19-3.5-8.43zM12.07 21.84h-.01a9.89 9.89 0 0 1-5.04-1.38l-.36-.21-3.7.97.99-3.6-.24-.37a9.9 9.9 0 0 1-1.52-5.29c0-5.46 4.44-9.9 9.91-9.9 2.65 0 5.13 1.03 7 2.91a9.84 9.84 0 0 1 2.9 7c0 5.47-4.45 9.91-9.93 9.91zm5.44-7.42c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.21 5.08 4.5.71.31 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z" />
                </svg>
              </a>

              <a
                href={footerCfg.instagramUrl || 'https://instagram.com/iq.menu'}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={tr('حساب إنستقرام', 'هەژماری ئینستاگرام', 'Instagram Account')}
                title={tr('إنستقرام', 'ئینستاگرام', 'Instagram')}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(225, 48, 108, 0.16), rgba(193, 53, 132, 0.14))',
                  border: '1px solid rgba(225, 48, 108, 0.42)',
                  color: '#f472b6',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  transition: 'transform 0.15s ease, background-color 0.15s ease',
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>
            </div>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--ink)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              <span>{currentLang === 'ar' ? (footerCfg.madeWithPrefix || 'صُنع بـ') : tr('صُنع بـ', 'دروستکراوە بە', 'Made with')}</span>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="#ef4444"
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  flexShrink: 0,
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  pointerEvents: 'none',
                  verticalAlign: 'middle',
                }}
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </span>
            <span>{tr('بواسطة', 'لەلایەن', 'by')}</span>
            <a
              href={footerCfg.authorUrl || 'https://instagram.com/weel'}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--brand-ink)',
                fontWeight: 800,
                textDecoration: 'none',
              }}
            >
              {currentLang === 'ar' ? (footerCfg.authorName || 'محمد') : (footerCfg.authorName && footerCfg.authorName !== 'محمد' ? footerCfg.authorName : tr('محمد', 'محەمەد', 'Mohammed'))}
            </a>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--muted)' }}>
            <span>
              {currentLang === 'ar'
                ? (footerCfg.copyrightText?.trim() || `© ${new Date().getFullYear()} ${site.name} – جميع الحقوق محفوظة`)
                : `© ${new Date().getFullYear()} ${t.appName} – ${t.allRightsReserved}`}
            </span>
            <span>·</span>
            <a
              href="/faq"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('faq');
              }}
              style={{ color: 'var(--ink)', textDecoration: 'underline', fontWeight: 600 }}
            >
              {currentLang === 'ar' ? (footerCfg.faqLinkText || 'الأسئلة الشائعة') : navFaqText}
            </a>
            <span>·</span>
            <a
              href={demoMenuPath}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(demoMenuPath);
              }}
              style={{ color: 'var(--ink)', textDecoration: 'underline', fontWeight: 600 }}
            >
              {currentLang === 'ar' ? (footerCfg.demoLinkText || 'معاينة منيو تجريبي') : tr('معاينة منيو تجريبي', 'بینینی مینیۆی نموونەیی', 'View Live Demo')}
            </a>
            <span>·</span>
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                color: 'var(--ink)',
                textDecoration: 'underline',
                cursor: 'pointer',
                font: 'inherit',
                fontWeight: 600,
              }}
            >
              {currentLang === 'ar' ? (footerCfg.termsLinkText || 'الشروط وسياسة الخصوصية') : tr('الشروط وسياسة الخصوصية', 'مەرج و سیاسەتی تایبەتمەندی', 'Terms & Privacy Policy')}
            </button>
          </div>

        </div>
      </footer>
      )}

      {/* Terms & Privacy Policy Modal */}
      {showTermsModal && (
        <div className="ajax-backdrop" onClick={() => setShowTermsModal(false)}>
          <div
            className="ajax-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '560px', textAlign: 'start', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>📜</span>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>
                  {tr('الشروط والأحكام وسياسة الخصوصية', 'مەرج و سیاسەتی تایبەتمەندی', 'Terms & Privacy Policy')}
                </h3>
              </div>
              <button
                type="button"
                className="btn s"
                onClick={() => setShowTermsModal(false)}
                style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0 }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: '13.5px', lineHeight: 1.7, color: 'var(--ink)' }}>
              <h4 style={{ color: 'var(--brand-ink)', marginBottom: '4px', fontSize: '15px' }}>
                {tr(`1. عن منصة ${site.name}`, `١. دەربارەی پلاتفۆرمی ${t.appName}`, `1. About ${t.appName}`)}
              </h4>
              <p className="muted" style={{ marginBottom: '14px' }}>
                {tr(
                  `منصة ${site.name} هي خدمة برمجية سحابية متخصصة في إنشاء وإدارة قوائم الطعام الإلكترونية (المنيو الإلكتروني التفاعلي الذكي) للمطاعم والمقاهي، وتسهيل استلام طلبات الزبائن مباشرة عبر تطبيق واتساب دون أي عمولات على المبيعات.`,
                  `پلاتفۆرمی ${t.appName} خزمەتگوزارییەکی هەورییە بۆ دروستکردن و بەڕێوەبردنی مینیۆی دیجیتاڵی و کەتەلۆگ، و وەرگرتنی داواکاری کڕیاران ڕاستەوخۆ لە واتسئاپ بەبێ هیچ کۆمیشنێک.`,
                  `${t.appName} is a cloud platform for building smart interactive QR menus and product catalogs, enabling direct WhatsApp order checkout with 0% sales commission.`
                )}
              </p>
              <h4 style={{ color: 'var(--brand-ink)', marginBottom: '4px', fontSize: '15px' }}>
                {tr('2. الخصوصية وأمان البيانات', '٢. تایبەتمەندی و پاراستنی زانیاری', '2. Privacy & Data Security')}
              </h4>
              <p className="muted" style={{ marginBottom: '14px' }}>
                {tr(
                  'نلتزم بأعلى معايير حماية الخصوصية. لا نقوم ببيع أو مشاركة أرقام هواتف المطاعم أو الزبائن مع أي أطراف ثالثة أو شركات إعلانية. تُستخدم البيانات حصراً لإتمام الطلب والتواصل المباشر بين المطعم وزبائنه عبر الواتساب.',
                  'پابەندین بە بەرزترین پێوەرەکانی پاراستنی تایبەتمەندی. ژمارەی تەلەفۆنی کڕیار و فرۆشگاکان لەگەڵ هیچ لایەنێکی سێیەم هاوبەش ناکرێت و تەنها بۆ گەیاندنی داواکاری بەکاردێت.',
                  'We strictly protect user privacy. Partner and customer phone numbers are never sold or shared with third-party advertisers and are used solely to fulfill orders.'
                )}
              </p>
              <h4 style={{ color: 'var(--brand-ink)', marginBottom: '4px', fontSize: '15px' }}>
                {tr('3. مسؤولية الأسعار والمنتجات', '٣. بەرپرسیارێتی نرخ و بەرهەمەکان', '3. Pricing & Catalog Accuracy')}
              </h4>
              <p className="muted" style={{ marginBottom: '14px' }}>
                {tr(
                  'يتحمل المطعم أو الكافيه المسؤولية الكاملة عن صحة أسعار الأصناف، توافرها، ومطابقتها للمواصفات الغذائية والصحية. المنصة توفر الواجهة التقنية والتنظيمية للطلب فقط.',
                  'چێشتخانە یان فرۆشگا بەرپرسیاری تەواوە لە ڕاستی نرخەکان، بەردەستبوونی بەرهەمەکان و پابەندبوون بە پێوەرە تەندروستییەکان.',
                  'Each participating restaurant or store is solely responsible for the accuracy of menu prices, item availability, and dietary compliance.'
                )}
              </p>
              <h4 style={{ color: 'var(--brand-ink)', marginBottom: '4px', fontSize: '15px' }}>
                {tr('4. الاشتراكات والدفع', '٤. بەشداریکردن و پارەدان', '4. Subscriptions & Billing')}
              </h4>
              <p className="muted" style={{ marginBottom: '14px' }}>
                {tr(
                  'نوفر باقات اشتراك شهرية وسنوية مرنة بدون أي عمولة على مبيعاتك، مع إمكانية الترقية أو تعديل الباقة في أي وقت عبر فريق الدعم الفني.',
                  'پاکێجی مانگانە و ساڵانەی گونجاو پێشکەش دەکەین بەبێ هیچ کۆمیشنێک لەسەر فرۆشەکانت، لەگەڵ توانای بەرزکردنەوەی پاکێج لە هەر کاتێکدا.',
                  'We provide flexible monthly and annual subscriptions with zero commission on sales, and plans can be upgraded anytime.'
                )}
              </p>
              <h4 style={{ color: 'var(--brand-ink)', marginBottom: '4px', fontSize: '15px' }}>
                {tr('5. الدعم الفني', '٥. پشتگیری تەکنیکی', '5. Customer Support')}
              </h4>
              <p className="muted" style={{ marginBottom: '16px' }}>
                {tr(
                  `فريق دعم ${site.name} متواجد لخدمتكم يومياً لحل أي استفسارات أو تقديم المساعدة في تجهيز المنيو وإعداد كود الـ QR وطباعته.`,
                  `تیمی پشتگیری ${t.appName} ڕۆژانە لە خزمەتتاندایە بۆ وەڵامدانەوەی پرسیارەکان و یارمەتیدان لە ئامادەکردنی مینیۆ و بارکۆدی QR.`,
                  `The ${t.appName} support team is available daily to help configure your menu, customize your branding, and prepare print-ready QR cards.`
                )}
              </p>
            </div>
            <div style={{ textAlign: 'end', borderTop: '1px solid var(--line)', paddingTop: '14px' }}>
              <button
                type="button"
                className="btn p"
                onClick={() => setShowTermsModal(false)}
                style={{ padding: '8px 20px', borderRadius: '10px' }}
              >
                {tr('فهمت ذلك وموافق ✓', 'تێگەیشتم و ڕازیم ✓', 'Got It & Agree ✓')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simplified 19-Addons Showcase Modal */}
      {showAddonsModal && (() => {
        const localizedCatalog = getLocalizedAddonCatalog(currentLang);
        const groups = getLocalizedAddonTabs(currentLang).filter((tab) => tab.id !== 'all');

        return (
          <div className="ajax-backdrop" onClick={() => setShowAddonsModal(false)}>
            <div
              className="ajax-box"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '620px',
                width: '94vw',
                textAlign: 'start',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                padding: '18px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  borderBottom: '1px solid var(--line)',
                  paddingBottom: '10px',
                  marginBottom: '12px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#fbbf24' }}>
                  {tr('✨ الـ 20 إضافة في باقة الأعمال الشاملة', '✨ ٢٠ زیادکراوی ناو پاکێجی کاروباری گشتی', '✨ All 20 Add-ons in the VIP Business Plan')}
                </h3>
                <button
                  type="button"
                  className="btn s"
                  onClick={() => setShowAddonsModal(false)}
                  aria-label={tr('إغلاق', 'داخستن', 'Close')}
                  style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0, flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  overflowY: 'auto',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  paddingInlineEnd: '2px',
                }}
              >
                {groups.map((grp) => {
                  const list = localizedCatalog.filter((item) => item.category === grp.id);
                  return (
                    <div key={grp.id}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 800,
                          color: 'var(--brand-ink, #34D399)',
                          marginBottom: '7px',
                        }}
                      >
                        {grp.label} ({list.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {list.map((item) => (
                          <div
                            key={item.key}
                            style={{
                              background: 'var(--soft)',
                              border: '1px solid var(--line)',
                              borderRadius: '10px',
                              padding: '8px 10px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <span style={{ fontSize: '15px', flexShrink: 0 }}>{item.icon}</span>
                            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>
                              {item.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  borderTop: '1px solid var(--line)',
                  paddingTop: '12px',
                  marginTop: '12px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const vipIndex = displayPlans.findIndex((pl) => pl.id === 'vip' || pl.featuresMap?.allAddons);
                    const vipPlan = displayPlans[vipIndex >= 0 ? vipIndex : displayPlans.length - 1];
                    setShowAddonsModal(false);
                    onSelectPlan(vipIndex >= 0 ? vipIndex : displayPlans.length - 1);
                    if (vipPlan) setPurchaseModalPlan(vipPlan);
                  }}
                  style={{
                    border: 0,
                    borderRadius: '9999px',
                    padding: '9px 18px',
                    fontSize: '13px',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#05120d',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  {tr('اشترك في باقة الأعمال الشاملة ←', 'بەشداری بکە لە پاکێجی کاروباری گشتی ←', 'Subscribe to VIP Business Plan →')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {Boolean(purchaseModalPlan) && (
        <Suspense fallback={null}>
          <PlanPurchaseModal
            isOpen={true}
            plan={purchaseModalPlan}
            site={site}
            billingCycle={billingCycle}
            restaurantName={ownRestaurant?.n}
            lang={currentLang}
            onClose={() => setPurchaseModalPlan(null)}
          />
        </Suspense>
      )}
    </div>
  );
};
