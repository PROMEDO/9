/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  HomeFaqItem,
  HomeSettings,
  PricingPlan,
  Restaurant,
  SiteSettings,
  ThemeSettings,
} from '../../types';
import {
  DEFAULT_HOME,
  applyTheme,
  buildThemeForMode,
  formatNumber,
  getCollection,
  getTheme,
  logActivity,
  putItem,
  putManyAndSync,
  resolveEffectiveThemeMode,
} from '../../utils/storage';
import {
  buildPlanComparisonRows,
  calcDiscountedPlanPrice,
  PLAN_FEATURE_TOGGLE_LABELS,
} from '../../utils/plans';
import { PlanFeaturesOrderEditor } from './PlanFeaturesOrderEditor';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CreditCard,
  Eye,
  EyeOff,
  HelpCircle,
  LayoutTemplate,
  Navigation,
  PanelBottom,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';

interface HomePageEditorSectionProps {
  site: SiteSettings;
  home: HomeSettings;
  plans: PricingPlan[];
  pageTitle?: string;
  actorLabel: string;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

type HomeEditorTab =
  | 'theme'
  | 'nav'
  | 'hero'
  | 'features'
  | 'faq'
  | 'pricing'
  | 'footer';

const HOME_EDITOR_TABS: Array<{ id: HomeEditorTab; label: string; desc: string }> = [
  { id: 'theme', label: 'المظهر والأقسام', desc: 'الوضع الفاتح والداكن أو حسب الجهاز، الشريط العلوي، وإظهار وإخفاء أقسام الصفحة.' },
  { id: 'nav', label: 'القائمة العلوية', desc: 'تعديل أسماء روابط الشريط العلوي وأزرار الدخول والحساب.' },
  { id: 'hero', label: 'الواجهة الرئيسية', desc: 'العنوان الرئيسي، النص التعريفي، وزر البداية ورابطه.' },
  { id: 'features', label: 'المميزات', desc: 'عناوين قسم المميزات وقائمة البطاقات المعروضة بالرئيسية.' },
  { id: 'faq', label: 'الأسئلة الشائعة', desc: 'إدارة الأسئلة وإجاباتها وإظهارها أو إخفاؤها في الرئيسية.' },
  { id: 'pricing', label: 'الباقات والأسعار', desc: 'إدارة خطط الاشتراك والأسعار والحدود ونصوص قسم الباقات.' },
  { id: 'footer', label: 'التذييل', desc: 'روابط التواصل، اسم المطور، ونص حقوق النشر أسفل الصفحة.' },
];

export const HomePageEditorSection: React.FC<HomePageEditorSectionProps> = ({
  site,
  home,
  plans,
  pageTitle,
  actorLabel,
  onRefresh,
  showToast,
}) => {
  const [draftHome, setDraftHome] = useState<HomeSettings>(home);
  const [editPlans, setEditPlans] = useState<PricingPlan[]>(plans);
  const [homeThemeMode, setHomeThemeMode] = useState<'light' | 'dark' | 'auto'>(
    site.homeThemeMode === 'dark' || site.homeThemeMode === 'auto' ? site.homeThemeMode : 'light'
  );
  const [bannerText, setBannerText] = useState<string>(site.bn || '');
  const [activeTab, setActiveTab] = useState<HomeEditorTab>('theme');
  const [pricingView, setPricingView] = useState<'plans' | 'features' | 'labels'>('plans');
  const [selectedPlanIdx, setSelectedPlanIdx] = useState<number>(0);

  const autoSaveTimerRef = useRef<number | null>(null);
  const hydratedHomeSigRef = useRef<string>(
    JSON.stringify({ home, plans, bn: site.bn || '' })
  );

  useEffect(() => {
    if (autoSaveTimerRef.current !== null) return;
    hydratedHomeSigRef.current = JSON.stringify({ home, plans, bn: site.bn || '' });
    setDraftHome(home);
    setEditPlans(plans);
    setBannerText(site.bn || '');
  }, [home, plans, site.bn]);

  useEffect(() => {
    setHomeThemeMode(
      site.homeThemeMode === 'dark' || site.homeThemeMode === 'auto' ? site.homeThemeMode : 'light'
    );
  }, [site.homeThemeMode]);

  const sections = {
    hero: draftHome.sections?.hero !== false,
    services: draftHome.sections?.services !== false,
    faq: draftHome.sections?.faq !== false && draftHome.faq?.enabled !== false,
    pricing: draftHome.sections?.pricing !== false,
    footer: draftHome.sections?.footer !== false,
  };

  const featureItems = Array.isArray(draftHome.services?.list)
    ? draftHome.services.list
    : DEFAULT_HOME.services.list;

  const faqCfg = draftHome.faq || {
    enabled: true,
    title: 'أسئلة ممكن تجي في بالك',
    sub: 'تفاصيل تساعدك تختار التجربة المناسبة لنشاطك.',
    items: [],
  };
  const faqItems = Array.isArray(faqCfg.items) ? faqCfg.items : [];

  const handleQuickThemeSwitch = async (nextMode: 'light' | 'dark' | 'auto') => {
    setHomeThemeMode(nextMode);
    const nextSite: SiteSettings = {
      ...site,
      homeThemeMode: nextMode,
    };
    const nextPublicTheme: ThemeSettings = buildThemeForMode(nextMode, getTheme());
    await putManyAndSync({
      'settings/site': nextSite,
      'settings/theme': nextPublicTheme,
    });
    const adminMode = site.adminThemeMode || 'light';
    applyTheme(buildThemeForMode(adminMode, nextPublicTheme));
    onRefresh();
    showToast('تم حفظ التغيرات');
  };

  const handleSaveAll = useCallback(
    async (silentIfUnchanged = false) => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const nextDigest = JSON.stringify({ home: draftHome, plans: editPlans, bn: bannerText });
      if (silentIfUnchanged && nextDigest === hydratedHomeSigRef.current) {
        return;
      }
      try {
        const heroLine1 = (draftHome.hero?.titleLine1 ?? DEFAULT_HOME.hero.titleLine1 ?? 'المنيو الأذكى بالعراق').trim();
        const heroLine2 = (draftHome.hero?.titleLine2 ?? DEFAULT_HOME.hero.titleLine2 ?? 'لمتجرك أو مطعمك').trim();
        const heroLead = (draftHome.hero?.lead ?? DEFAULT_HOME.hero.lead ?? 'أطلق متجرك الآن واستقبل الطلبات').trim();

        const nextFaqItems: HomeFaqItem[] = faqItems
          .map((item) => ({
            id: item.id || `faq_${Math.random().toString(36).slice(2, 8)}`,
            q: String(item.q || '').trim(),
            a: String(item.a || '').trim(),
            visible: item.visible !== false,
          }))
          .filter((item) => item.q.length > 0 || item.a.length > 0);

        const cleanFeatures = featureItems
          .map((f) => ({
            i: (f.i || '✨').trim(),
            t: String(f.t || '').trim(),
            d: String(f.d || '').trim(),
          }))
          .filter((f) => f.t.length > 0 || f.d.length > 0);

        const nextHome: HomeSettings = {
          ...DEFAULT_HOME,
          ...draftHome,
          sections: {
            hero: draftHome.sections?.hero !== false,
            services: draftHome.sections?.services !== false,
            faq: draftHome.faq?.enabled !== false && draftHome.sections?.faq !== false,
            pricing: draftHome.sections?.pricing !== false,
            footer: draftHome.sections?.footer !== false,
          },
          nav: {
            ...DEFAULT_HOME.nav,
            ...(draftHome.nav || {}),
          },
          hero: {
            ...DEFAULT_HOME.hero,
            ...(draftHome.hero || {}),
            titleLine1: heroLine1 || 'المنيو الأذكى بالعراق',
            titleLine2: heroLine2,
            title: [heroLine1 || 'المنيو الأذكى بالعراق', heroLine2].filter(Boolean).join(' '),
            lead: heroLead || 'أطلق متجرك الآن واستقبل الطلبات',
            cta1: (draftHome.hero?.cta1 ?? 'جرب المنيو الان').trim() || 'جرب المنيو الان',
            cta1Link:
              (['/menu/demo', '/demo', '#demo', '#menu-demo', 'demo', ''].includes((draftHome.hero?.cta1Link || '').trim().toLowerCase())
                ? '/cap-burger'
                : (draftHome.hero?.cta1Link || '/cap-burger').trim()) || '/cap-burger',
            cta1Visible: draftHome.hero?.cta1Visible !== false,
          },
          services: {
            ...DEFAULT_HOME.services,
            ...(draftHome.services || {}),
            badge: (draftHome.services?.badge ?? '✨ مميزاتنا').trim(),
            title: (draftHome.services?.title ?? DEFAULT_HOME.services.title).trim(),
            sub: (draftHome.services?.sub ?? DEFAULT_HOME.services.sub).trim(),
            list: cleanFeatures.length > 0 ? cleanFeatures : DEFAULT_HOME.services.list,
          },
          pricing: {
            ...DEFAULT_HOME.pricing,
            ...(draftHome.pricing || {}),
          },
          faq: {
            enabled: draftHome.faq?.enabled !== false && draftHome.sections?.faq !== false,
            title: (faqCfg.title || 'أسئلة ممكن تجي في بالك').trim(),
            sub: (faqCfg.sub || '').trim(),
            items: nextFaqItems,
          },
          footerConfig: {
            madeWithPrefix: draftHome.footerConfig?.madeWithPrefix ?? 'صُنع بـ',
            authorName: draftHome.footerConfig?.authorName ?? 'محمد',
            authorUrl: draftHome.footerConfig?.authorUrl ?? 'https://instagram.com/weel',
            instagramUrl: draftHome.footerConfig?.instagramUrl ?? 'https://instagram.com/iq.menu',
            copyrightText: draftHome.footerConfig?.copyrightText ?? '',
            faqLinkText: draftHome.footerConfig?.faqLinkText ?? 'الأسئلة الشائعة',
            demoLinkText: draftHome.footerConfig?.demoLinkText ?? 'معاينة منيو تجريبي',
            termsLinkText: draftHome.footerConfig?.termsLinkText ?? 'الشروط وسياسة الخصوصية',
          },
        };

        const nextSite: SiteSettings = {
          ...site,
          bn: bannerText.trim(),
          homeThemeMode,
        };
        const curTheme = getTheme();
        const nextPublicTheme: ThemeSettings = buildThemeForMode(homeThemeMode, curTheme);

        const sanitizedPlans = editPlans.map((pl) => {
          const nextFeaturesMap = {
            ...(pl.featuresMap || {}),
            unlimitedItems: pl.maxItems === -1 || pl.maxCats === -1 ? true : Boolean(pl.featuresMap?.unlimitedItems),
          };
          const cleanComparisonItems = Array.isArray(pl.comparisonItems)
            ? pl.comparisonItems
                .filter((it) => it && it.key)
                .map((it) => ({
                  key: it.key,
                  ...(it.label !== undefined && it.label.trim() ? { label: it.label.trim() } : {}),
                  ...(it.included !== undefined ? { included: Boolean(it.included) } : {}),
                  visible: it.visible !== false,
                }))
            : undefined;
          const normalizedPlan: PricingPlan = {
            ...pl,
            pr: Math.max(0, Number(pl.pr) || 0),
            annualPr: Math.max(0, Number(pl.annualPr ?? Math.round((Number(pl.pr) || 0) * 11))),
            discountPercent: Math.min(95, Math.max(0, Number(pl.discountPercent) || 0)),
            maxItems: typeof pl.maxItems === 'number' ? pl.maxItems : 20,
            maxCats: typeof pl.maxCats === 'number' ? pl.maxCats : 5,
            maxThemes: typeof pl.maxThemes === 'number' ? pl.maxThemes : 2,
            maxBranches: typeof pl.maxBranches === 'number' ? pl.maxBranches : 0,
            featuresMap: nextFeaturesMap,
            ...(cleanComparisonItems ? { comparisonItems: cleanComparisonItems } : {}),
          };
          normalizedPlan.f = buildPlanComparisonRows(normalizedPlan, 'ar').map((r) => r.label);
          return normalizedPlan;
        });

        hydratedHomeSigRef.current = nextDigest;

        await putManyAndSync({
          'settings/home': nextHome,
          'settings/site': nextSite,
          'settings/theme': nextPublicTheme,
          'settings/plans': {
            list: sanitizedPlans,
            planSchemaV2: true,
            planPriceV2: true,
            planCardV3: true,
            planAnnual11V4: true,
            planMultiBranchV5: true,
            planNamesV6: true,
            planThemesV7: true,
            planNoFreeV8: true,
          },
        });

        const allRests = getCollection<Restaurant>('restaurants');
        allRests.forEach((r) => {
          if (!r.planId) return;
          const matching = sanitizedPlans.find((pl) => pl.id === r.planId);
          if (matching && matching.n !== r.p) {
            putItem(`restaurants/${r.id}`, { ...r, p: matching.n });
          }
        });

        const activeAdminMode = site.adminThemeMode || 'light';
        applyTheme(buildThemeForMode(activeAdminMode, nextPublicTheme));

        logActivity(
          actorLabel,
          'تحديث الصفحة الرئيسية والباقات',
          `المظهر: ${homeThemeMode === 'auto' ? 'حسب الجهاز' : homeThemeMode === 'dark' ? 'داكن' : 'فاتح'} · المميزات: ${nextHome.services.list.length} · الأسئلة: ${nextFaqItems.length} · الباقات: ${sanitizedPlans.length}`,
          'system'
        );
        onRefresh();
        showToast('تم حفظ التغيرات');
      } catch (err) {
        console.error('Home editor auto-save error:', err);
      }
    },
    [
      actorLabel,
      bannerText,
      draftHome,
      editPlans,
      faqCfg.sub,
      faqCfg.title,
      faqItems,
      featureItems,
      homeThemeMode,
      onRefresh,
      showToast,
      site,
    ]
  );

  const handleSaveAllRef = useRef(handleSaveAll);
  handleSaveAllRef.current = handleSaveAll;

  useEffect(() => {
    const nextDigest = JSON.stringify({ home: draftHome, plans: editPlans, bn: bannerText });
    if (nextDigest === hydratedHomeSigRef.current) return;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void handleSaveAllRef.current(true);
    }, 150);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [draftHome, editPlans, bannerText]);

  useEffect(() => {
    const onFlush = () => {
      void handleSaveAllRef.current(true);
    };
    window.addEventListener('menuplus_admin_flush_save', onFlush);
    return () => window.removeEventListener('menuplus_admin_flush_save', onFlush);
  }, []);

  const moveFeature = (from: number, to: number) => {
    if (to < 0 || to >= featureItems.length) return;
    const next = [...featureItems];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraftHome({
      ...draftHome,
      services: { ...draftHome.services, list: next },
    });
  };

  const moveFaq = (from: number, to: number) => {
    if (to < 0 || to >= faqItems.length) return;
    const next = [...faqItems];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraftHome({
      ...draftHome,
      faq: { ...faqCfg, items: next },
    });
  };

  const renderTabIcon = (id: HomeEditorTab) => {
    switch (id) {
      case 'theme':
        return <Sparkles size={15} />;
      case 'nav':
        return <Navigation size={15} />;
      case 'hero':
        return <LayoutTemplate size={15} />;
      case 'features':
        return <Sparkles size={15} />;
      case 'faq':
        return <HelpCircle size={15} />;
      case 'pricing':
        return <CreditCard size={15} />;
      case 'footer':
        return <PanelBottom size={15} />;
    }
  };

  const activeTabIdx = HOME_EDITOR_TABS.findIndex((t) => t.id === activeTab);
  const currentTabMeta = HOME_EDITOR_TABS[activeTabIdx] || HOME_EDITOR_TABS[0];
  const prevTab = activeTabIdx > 0 ? HOME_EDITOR_TABS[activeTabIdx - 1] : null;
  const nextTab = activeTabIdx < HOME_EDITOR_TABS.length - 1 ? HOME_EDITOR_TABS[activeTabIdx + 1] : null;

  const safePlanIdx = editPlans.length > 0 ? Math.min(selectedPlanIdx, editPlans.length - 1) : 0;
  const activePlan = editPlans[safePlanIdx];

  return (
    <div className="mp-he-shell">
      {/* Clean Top Bar */}
      <div className="mp-he-topbar">
        <div className="mp-he-topbar-info">
          <h1 className="mp-he-title">
            <LayoutTemplate size={22} style={{ color: 'var(--brand-ink, #34D399)' }} />
            <span>{pageTitle || 'تعديل الصفحة الرئيسية'}</span>
          </h1>
          <p className="muted mp-he-subtitle">
            اختر القسم من الشريط أدناه لتعديل نصوصه وإعداداته — يتم الحفظ تلقائياً وفورياً.
          </p>
        </div>
      </div>

      {/* Clean 7-Tab Navigation Bar */}
      <div className="mp-he-tabs" role="tablist" aria-label="أقسام الصفحة الرئيسية">
        {HOME_EDITOR_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`mp-he-tab${isActive ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {renderTabIcon(tab.id)}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Focused Single-Section Workspace */}
      <div className="mp-he-stage">
        <div className="mp-he-stage-head">
          <div>
            <h2 className="mp-he-stage-title">{currentTabMeta.label}</h2>
            <p className="muted mp-he-stage-desc">{currentTabMeta.desc}</p>
          </div>
        </div>

        {/* 1. Theme & Sections Visibility */}
        {activeTab === 'theme' && (
          <div className="mp-he-stage-body">
            <div className="mp-he-group">
              <div className="mp-he-form-grid">
                <div>
                  <span className="mp-he-lbl">مظهر الموقع العام</span>
                  <div
                    className="mp-seg-group"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      width: '100%',
                    }}
                  >
                    <button
                      type="button"
                      className={`mp-seg-btn${homeThemeMode === 'light' ? ' is-active' : ''}`}
                      style={{ justifyContent: 'center', width: '100%' }}
                      onClick={() => void handleQuickThemeSwitch('light')}
                    >
                      <Sun size={14} />
                      <span>فاتح</span>
                    </button>
                    <button
                      type="button"
                      className={`mp-seg-btn${homeThemeMode === 'dark' ? ' is-active' : ''}`}
                      style={{ justifyContent: 'center', width: '100%' }}
                      onClick={() => void handleQuickThemeSwitch('dark')}
                    >
                      <Moon size={14} />
                      <span>داكن</span>
                    </button>
                    <button
                      type="button"
                      className={`mp-seg-btn${homeThemeMode === 'auto' ? ' is-active' : ''}`}
                      style={{ justifyContent: 'center', width: '100%' }}
                      onClick={() => void handleQuickThemeSwitch('auto')}
                    >
                      <Monitor size={14} />
                      <span>حسب الجهاز</span>
                    </button>
                  </div>
                </div>

                <label className="f">
                  شريط الإعلان العلوي (اختياري)
                  <input
                    value={bannerText}
                    onChange={(e) => setBannerText(e.target.value)}
                    placeholder="اتركه فارغاً لإخفاء الشريط..."
                  />
                </label>
              </div>
            </div>

            <div className="mp-he-group">
              <div className="mp-he-group-head">
                <h3 className="mp-he-group-title">إظهار وإخفاء أقسام الصفحة</h3>
              </div>
              <div className="mp-he-switch-grid">
                {(
                  [
                    ['hero', 'قسم البداية (العنوان والزر)'],
                    ['services', 'قسم المميزات'],
                    ['faq', 'قسم الأسئلة الشائعة'],
                    ['pricing', 'قسم الباقات والأسعار'],
                    ['footer', 'التذييل (الفوتر)'],
                  ] as const
                ).map(([secKey, label]) => {
                  const checked = sections[secKey];
                  return (
                    <div key={secKey} className="mp-he-switch-row">
                      <span className="mp-he-switch-label">{label}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        className={`ios-switch sm ${checked ? 'on' : 'off'}`}
                        onClick={() => {
                          const val = !checked;
                          setDraftHome((prev) => ({
                            ...prev,
                            sections: { ...(prev.sections || {}), [secKey]: val },
                            ...(secKey === 'faq' ? { faq: { ...(prev.faq || faqCfg), enabled: val } } : {}),
                          }));
                        }}
                      >
                        <span className="ios-switch-thumb" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 2. Navbar & Header Links */}
        {activeTab === 'nav' && (
          <div className="mp-he-stage-body">
            <div className="mp-he-group">
              <div className="mp-he-group-head">
                <h3 className="mp-he-group-title">روابط القائمة الرئيسية</h3>
              </div>
              <div className="mp-he-form-grid">
                {(
                  [
                    ['home', 'رابط: الرئيسية', 'الرئيسية'],
                    ['services', 'رابط: المميزات', 'المميزات'],
                    ['faq', 'رابط: الأسئلة الشائعة', 'الأسئلة الشائعة'],
                    ['pricing', 'رابط: الأسعار', 'الأسعار'],
                  ] as const
                ).map(([field, label, ph]) => (
                  <label key={field} className="f">
                    {label}
                    <input
                      value={draftHome.nav?.[field] ?? ph}
                      onChange={(e) =>
                        setDraftHome({
                          ...draftHome,
                          nav: { ...(draftHome.nav || {}), [field]: e.target.value },
                        })
                      }
                      placeholder={ph}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="mp-he-group">
              <div className="mp-he-group-head">
                <h3 className="mp-he-group-title">أزرار الدخول والحساب</h3>
              </div>
              <div className="mp-he-form-grid">
                {(
                  [
                    ['enterNow', 'زر الدخول (للزوار)', 'ادخل الآن'],
                    ['dashboard', 'زر لوحة التحكم (للمسجلين)', 'لوحة التحكم'],
                    ['adminDashboard', 'زر لوحة الإدارة (للأدمن)', 'لوحة تحكم الإدارة'],
                    ['modalLogin', 'زر: تسجيل الدخول', 'تسجيل الدخول'],
                    ['modalSignup', 'زر: إنشاء حساب', 'إنشاء حساب مجاني'],
                    ['logout', 'زر: تسجيل الخروج', 'تسجيل الخروج'],
                  ] as const
                ).map(([field, label, ph]) => (
                  <label key={field} className="f">
                    {label}
                    <input
                      value={draftHome.nav?.[field] ?? ph}
                      onChange={(e) =>
                        setDraftHome({
                          ...draftHome,
                          nav: { ...(draftHome.nav || {}), [field]: e.target.value },
                        })
                      }
                      placeholder={ph}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 3. Hero Section */}
        {activeTab === 'hero' && (
          <div className="mp-he-stage-body">
            <div className="mp-he-group">
              <div className="mp-he-form-grid">
                <label className="f">
                  العنوان الرئيسي (السطر الأول)
                  <input
                    value={draftHome.hero?.titleLine1 ?? 'المنيو الأذكى بالعراق'}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        hero: { ...draftHome.hero, titleLine1: e.target.value },
                      })
                    }
                    placeholder="المنيو الأذكى بالعراق"
                  />
                </label>
                <label className="f">
                  العنوان المميّز (السطر الثاني)
                  <input
                    value={draftHome.hero?.titleLine2 ?? 'لمتجرك أو مطعمك'}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        hero: { ...draftHome.hero, titleLine2: e.target.value },
                      })
                    }
                    placeholder="لمتجرك أو مطعمك"
                  />
                </label>
              </div>

              <label className="f">
                النص التعريفي أسفل العنوان
                <input
                  value={draftHome.hero?.lead ?? 'أطلق متجرك الآن واستقبل الطلبات'}
                  onChange={(e) =>
                    setDraftHome({
                      ...draftHome,
                      hero: { ...draftHome.hero, lead: e.target.value },
                    })
                  }
                  placeholder="أطلق متجرك الآن واستقبل الطلبات"
                />
              </label>
            </div>

            <div className="mp-he-group">
              <div className="mp-he-group-head">
                <h3 className="mp-he-group-title">الزر الرئيسي في الواجهة</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="mp-he-inline-switch">
                    <span>إظهار الزر</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draftHome.hero?.cta1Visible !== false}
                      className={`ios-switch sm ${draftHome.hero?.cta1Visible !== false ? 'on' : 'off'}`}
                      onClick={() =>
                        setDraftHome({
                          ...draftHome,
                          hero: { ...draftHome.hero, cta1Visible: draftHome.hero?.cta1Visible === false },
                        })
                      }
                    >
                      <span className="ios-switch-thumb" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn s"
                    onClick={() =>
                      setDraftHome({
                        ...draftHome,
                        hero: {
                          ...draftHome.hero,
                          titleLine1: 'المنيو الأذكى بالعراق',
                          titleLine2: 'لمتجرك أو مطعمك',
                          title: 'المنيو الأذكى بالعراق لمتجرك أو مطعمك',
                          lead: 'أطلق متجرك الآن واستقبل الطلبات',
                          cta1: 'جرب المنيو الان',
                          cta1Link: '/cap-burger',
                          cta1Visible: true,
                        },
                      })
                    }
                  >
                    <RotateCcw size={13} />
                    <span>استعادة الافتراضي</span>
                  </button>
                </div>
              </div>

              <div className="mp-he-form-grid">
                <label className="f">
                  نص الزر
                  <input
                    value={draftHome.hero?.cta1 ?? 'جرب المنيو الان'}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        hero: { ...draftHome.hero, cta1: e.target.value },
                      })
                    }
                    placeholder="جرب المنيو الان"
                  />
                </label>
                <label className="f">
                  رابط الزر
                  <input
                    dir="ltr"
                    value={
                      ['/menu/demo', '/demo', '#demo', '#menu-demo', 'demo'].includes((draftHome.hero?.cta1Link || '').trim().toLowerCase())
                        ? '/cap-burger'
                        : (draftHome.hero?.cta1Link ?? '/cap-burger')
                    }
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        hero: { ...draftHome.hero, cta1Link: e.target.value },
                      })
                    }
                    placeholder="/cap-burger"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 4. Features Section */}
        {activeTab === 'features' && (
          <div className="mp-he-stage-body">
            <div className="mp-he-group">
              <div className="mp-he-form-grid">
                <label className="f">
                  شارة القسم
                  <input
                    value={draftHome.services?.badge ?? '✨ مميزاتنا'}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        services: { ...draftHome.services, badge: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="f">
                  عنوان القسم
                  <input
                    value={draftHome.services?.title ?? DEFAULT_HOME.services.title}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        services: { ...draftHome.services, title: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
              <label className="f">
                النص التعريفي أسفل العنوان
                <input
                  value={draftHome.services?.sub ?? DEFAULT_HOME.services.sub}
                  onChange={(e) =>
                    setDraftHome({
                      ...draftHome,
                      services: { ...draftHome.services, sub: e.target.value },
                    })
                  }
                />
              </label>
            </div>

            <div className="mp-he-group">
              <div className="mp-he-group-head">
                <h3 className="mp-he-group-title">بطاقات المميزات ({featureItems.length})</h3>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn s"
                    onClick={() =>
                      setDraftHome({
                        ...draftHome,
                        services: DEFAULT_HOME.services,
                      })
                    }
                  >
                    <RotateCcw size={13} />
                    <span>استعادة الافتراضية</span>
                  </button>
                  <button
                    type="button"
                    className="btn s p"
                    onClick={() =>
                      setDraftHome({
                        ...draftHome,
                        services: {
                          ...draftHome.services,
                          list: [...featureItems, { i: '✨', t: 'ميزة جديدة', d: 'اكتب وصفاً مختصراً للميزة.' }],
                        },
                      })
                    }
                  >
                    <Plus size={13} />
                    <span>إضافة ميزة</span>
                  </button>
                </div>
              </div>

              <div className="mp-he-list">
                {featureItems.map((feat, idx) => (
                  <div key={idx} className="mp-he-row-item">
                    <div className="mp-he-row-top">
                      <span className="mp-he-row-num">{idx + 1}</span>
                      <input
                        className="mp-he-emoji-inp"
                        value={feat.i || '✨'}
                        onChange={(e) => {
                          const next = [...featureItems];
                          next[idx] = { ...feat, i: e.target.value };
                          setDraftHome({ ...draftHome, services: { ...draftHome.services, list: next } });
                        }}
                        aria-label="الأيقونة"
                      />
                      <input
                        className="mp-he-row-main-inp"
                        value={feat.t}
                        onChange={(e) => {
                          const next = [...featureItems];
                          next[idx] = { ...feat, t: e.target.value };
                          setDraftHome({ ...draftHome, services: { ...draftHome.services, list: next } });
                        }}
                        placeholder="عنوان الميزة"
                      />
                      <div className="mp-he-row-actions">
                        <button
                          type="button"
                          className="mp-he-icon-btn"
                          disabled={idx === 0}
                          onClick={() => moveFeature(idx, idx - 1)}
                          aria-label="لأعلى"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          className="mp-he-icon-btn"
                          disabled={idx === featureItems.length - 1}
                          onClick={() => moveFeature(idx, idx + 1)}
                          aria-label="لأسفل"
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          className="mp-he-icon-btn is-danger"
                          onClick={() => {
                            const next = featureItems.filter((_, i) => i !== idx);
                            setDraftHome({ ...draftHome, services: { ...draftHome.services, list: next } });
                          }}
                          aria-label="حذف"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <input
                      className="mp-he-row-sub-inp"
                      value={feat.d}
                      onChange={(e) => {
                        const next = [...featureItems];
                        next[idx] = { ...feat, d: e.target.value };
                        setDraftHome({ ...draftHome, services: { ...draftHome.services, list: next } });
                      }}
                      placeholder="وصف مختصر للميزة..."
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 6. FAQ Management */}
        {activeTab === 'faq' && (
          <div className="mp-he-stage-body">
            <div className="mp-he-switch-row is-featured">
              <div>
                <div style={{ fontWeight: 800, fontSize: '13.5px' }}>إظهار قسم الأسئلة الشائعة بالرئيسية</div>
                <div className="muted" style={{ fontSize: '12px' }}>
                  {faqCfg.enabled !== false ? 'القسم ظاهر حالياً أسفل الصفحة.' : 'القسم مخفي حالياً.'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={faqCfg.enabled !== false}
                className={`ios-switch sm ${faqCfg.enabled !== false ? 'on' : 'off'}`}
                onClick={() => {
                  const val = faqCfg.enabled === false;
                  setDraftHome({
                    ...draftHome,
                    sections: { ...(draftHome.sections || {}), faq: val },
                    faq: { ...faqCfg, enabled: val },
                  });
                }}
              >
                <span className="ios-switch-thumb" />
              </button>
            </div>

            <div className="mp-he-group">
              <div className="mp-he-form-grid">
                <label className="f">
                  عنوان القسم
                  <input
                    value={faqCfg.title ?? 'أسئلة ممكن تجي في بالك'}
                    onChange={(e) => setDraftHome({ ...draftHome, faq: { ...faqCfg, title: e.target.value } })}
                  />
                </label>
                <label className="f">
                  النص التعريفي أسفل العنوان
                  <input
                    value={faqCfg.sub ?? ''}
                    onChange={(e) => setDraftHome({ ...draftHome, faq: { ...faqCfg, sub: e.target.value } })}
                  />
                </label>
              </div>
            </div>

            <div className="mp-he-group">
              <div className="mp-he-group-head">
                <h3 className="mp-he-group-title">الأسئلة ({faqItems.length})</h3>
                <button
                  type="button"
                  className="btn s p"
                  onClick={() =>
                    setDraftHome({
                      ...draftHome,
                      faq: {
                        ...faqCfg,
                        items: [...faqItems, { id: `faq_${Date.now().toString(36)}`, q: '', a: '', visible: true }],
                      },
                    })
                  }
                >
                  <Plus size={14} />
                  <span>إضافة سؤال</span>
                </button>
              </div>

              {faqItems.length === 0 ? (
                <div className="muted" style={{ textAlign: 'center', padding: '18px', fontSize: '13px' }}>
                  لا توجد أسئلة مضافة حالياً. اضغط «إضافة سؤال» للبدء.
                </div>
              ) : (
                <div className="mp-he-list">
                  {faqItems.map((item, idx) => {
                    const isVis = item.visible !== false;
                    return (
                      <div key={item.id || idx} className={`mp-he-row-item${!isVis ? ' is-dim' : ''}`}>
                        <div className="mp-he-row-top">
                          <span className="mp-he-row-num">{idx + 1}</span>
                          <input
                            className="mp-he-row-main-inp"
                            value={item.q}
                            onChange={(e) => {
                              const next = [...faqItems];
                              next[idx] = { ...item, q: e.target.value };
                              setDraftHome({ ...draftHome, faq: { ...faqCfg, items: next } });
                            }}
                            placeholder="اكتب السؤال هنا..."
                          />
                          <div className="mp-he-row-actions">
                            <button
                              type="button"
                              className={`mp-he-icon-btn${isVis ? ' is-vis' : ''}`}
                              onClick={() => {
                                const next = [...faqItems];
                                next[idx] = { ...item, visible: !isVis };
                                setDraftHome({ ...draftHome, faq: { ...faqCfg, items: next } });
                              }}
                              title={isVis ? 'ظاهر بالرئيسية' : 'مخفي بالرئيسية'}
                              aria-label={isVis ? 'إخفاء السؤال' : 'إظهار السؤال'}
                            >
                              {isVis ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                            <button
                              type="button"
                              className="mp-he-icon-btn"
                              disabled={idx === 0}
                              onClick={() => moveFaq(idx, idx - 1)}
                              aria-label="لأعلى"
                            >
                              <ArrowUp size={13} />
                            </button>
                            <button
                              type="button"
                              className="mp-he-icon-btn"
                              disabled={idx === faqItems.length - 1}
                              onClick={() => moveFaq(idx, idx + 1)}
                              aria-label="لأسفل"
                            >
                              <ArrowDown size={13} />
                            </button>
                            <button
                              type="button"
                              className="mp-he-icon-btn is-danger"
                              onClick={() => {
                                const next = faqItems.filter((_, i) => i !== idx);
                                setDraftHome({ ...draftHome, faq: { ...faqCfg, items: next } });
                              }}
                              aria-label="حذف"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <textarea
                          className="mp-he-row-sub-inp"
                          rows={2}
                          value={item.a}
                          onChange={(e) => {
                            const next = [...faqItems];
                            next[idx] = { ...item, a: e.target.value };
                            setDraftHome({ ...draftHome, faq: { ...faqCfg, items: next } });
                          }}
                          placeholder="اكتب الإجابة هنا..."
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 7. Pricing & Plans */}
        {activeTab === 'pricing' && (
          <div className="mp-he-stage-body">
            <div className="mp-he-subnav">
              <div className="mp-seg-group">
                <button
                  type="button"
                  className={`mp-seg-btn${pricingView === 'plans' ? ' is-active' : ''}`}
                  onClick={() => setPricingView('plans')}
                >
                  الباقات والأسعار ({editPlans.length})
                </button>
                <button
                  type="button"
                  className={`mp-seg-btn${pricingView === 'features' ? ' is-active' : ''}`}
                  onClick={() => setPricingView('features')}
                >
                  ترتيب وتعديل الميزات
                </button>
                <button
                  type="button"
                  className={`mp-seg-btn${pricingView === 'labels' ? ' is-active' : ''}`}
                  onClick={() => setPricingView('labels')}
                >
                  نصوص وعناوين القسم
                </button>
              </div>
            </div>

            {pricingView === 'features' ? (
              <div className="mp-he-group">
                <PlanFeaturesOrderEditor
                  plans={editPlans}
                  selectedPlanIdx={safePlanIdx}
                  onSelectPlanIdx={setSelectedPlanIdx}
                  onChangePlans={setEditPlans}
                  showPlanTabs={true}
                  showToast={showToast}
                />
              </div>
            ) : pricingView === 'labels' ? (
              <div className="mp-he-group">
                <div className="mp-he-form-grid">
                  <label className="f">
                    شارة القسم
                    <input
                      value={draftHome.pricing?.badge ?? '💎 الأسعار والباقات'}
                      onChange={(e) => setDraftHome({ ...draftHome, pricing: { ...draftHome.pricing, badge: e.target.value } })}
                    />
                  </label>
                  <label className="f">
                    عنوان قسم الباقات
                    <input
                      value={draftHome.pricing?.title ?? 'اختر الباقة المناسبة لمشروعك'}
                      onChange={(e) => setDraftHome({ ...draftHome, pricing: { ...draftHome.pricing, title: e.target.value } })}
                    />
                  </label>
                  <label className="f">
                    الوصف أسفل العنوان
                    <input
                      value={draftHome.pricing?.sub ?? ''}
                      onChange={(e) => setDraftHome({ ...draftHome, pricing: { ...draftHome.pricing, sub: e.target.value } })}
                    />
                  </label>
                  <label className="f">
                    زر الاشتراك الشهري
                    <input
                      value={draftHome.pricing?.monthlyLabel ?? 'اشتراك شهري'}
                      onChange={(e) => setDraftHome({ ...draftHome, pricing: { ...draftHome.pricing, monthlyLabel: e.target.value } })}
                    />
                  </label>
                  <label className="f">
                    زر الاشتراك السنوي
                    <input
                      value={draftHome.pricing?.annualLabel ?? 'اشتراك سنوي'}
                      onChange={(e) => setDraftHome({ ...draftHome, pricing: { ...draftHome.pricing, annualLabel: e.target.value } })}
                    />
                  </label>
                  <label className="f">
                    شارة العرض السنوي
                    <input
                      value={draftHome.pricing?.annualBadge ?? 'احصل على شهر مجاني'}
                      onChange={(e) => setDraftHome({ ...draftHome, pricing: { ...draftHome.pricing, annualBadge: e.target.value } })}
                    />
                  </label>
                  <label className="f">
                    بادئة زر الباقات المدفوعة
                    <input
                      value={draftHome.pricing?.paidCtaPrefix ?? 'اشترك في'}
                      onChange={(e) => setDraftHome({ ...draftHome, pricing: { ...draftHome.pricing, paidCtaPrefix: e.target.value } })}
                    />
                  </label>
                  <label className="f">
                    شارة الباقة الشائعة
                    <input
                      value={draftHome.pricing?.hotBadge ?? 'الأكثر اختياراً 🔥'}
                      onChange={(e) => setDraftHome({ ...draftHome, pricing: { ...draftHome.pricing, hotBadge: e.target.value } })}
                    />
                  </label>
                  <label className="f">
                    شارة الباقة الشاملة (VIP)
                    <input
                      value={draftHome.pricing?.vipBadge ?? 'شاملة بلا حدود 👑'}
                      onChange={(e) => setDraftHome({ ...draftHome, pricing: { ...draftHome.pricing, vipBadge: e.target.value } })}
                    />
                  </label>
                  <label className="f">
                    نص زر التواصل عبر واتساب
                    <input
                      value={draftHome.pricing?.whatsappBtnText ?? 'تواصل معنا مباشرة للاستفسار عن الباقات والخدمات'}
                      onChange={(e) => setDraftHome({ ...draftHome, pricing: { ...draftHome.pricing, whatsappBtnText: e.target.value } })}
                    />
                  </label>
                </div>

                <label className="f">
                  نص المساعدة أسفل الباقات
                  <input
                    value={draftHome.pricing?.helpText ?? 'هل تحتاج مساعدة في اختيار الباقة الأنسب أو لديك استفسار عن خدماتنا؟'}
                    onChange={(e) => setDraftHome({ ...draftHome, pricing: { ...draftHome.pricing, helpText: e.target.value } })}
                  />
                </label>
              </div>
            ) : (
              activePlan && (() => {
                const p = activePlan;
                const idx = safePlanIdx;
                const fm = p.featuresMap || {};
                const discPct = Math.min(95, Math.max(0, Number(p.discountPercent) || 0));
                const monthlyFinal = calcDiscountedPlanPrice(Number(p.pr) || 0, discPct);
                const annualRaw = Number(p.annualPr ?? Math.round((Number(p.pr) || 0) * 11));
                const annualFinal = calcDiscountedPlanPrice(annualRaw, discPct);
                const itemsUnlimited = p.maxItems === -1;
                const catsUnlimited = p.maxCats === -1;

                return (
                  <div className="mp-he-stage-body">
                    {/* Clean Plan Selector Tabs */}
                    <div className="mp-he-plan-tabs">
                      {editPlans.map((planItem, i) => (
                        <button
                          key={planItem.id || i}
                          type="button"
                          className={`mp-he-plan-tab${i === safePlanIdx ? ' is-active' : ''}`}
                          onClick={() => setSelectedPlanIdx(i)}
                        >
                          <span>{planItem.n || `باقة #${i + 1}`}</span>
                          {planItem.hot === 1 && <span className="mp-he-hot-dot" title="الأكثر اختياراً">🔥</span>}
                        </button>
                      ))}
                    </div>

                    <div className="mp-he-group">
                      <div className="mp-he-group-head">
                        <h3 className="mp-he-group-title">المعلومات الأساسية والأسعار</h3>
                        <div className="mp-he-inline-switch">
                          <span>تمييز كـ «الأكثر اختياراً 🔥»</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(p.hot)}
                            className={`ios-switch sm ${p.hot ? 'on' : 'off'}`}
                            onClick={() => {
                              const copy = editPlans.map((item, i) => ({
                                ...item,
                                hot: i === idx ? (p.hot ? 0 : 1) : 0,
                              }));
                              setEditPlans(copy);
                            }}
                          >
                            <span className="ios-switch-thumb" />
                          </button>
                        </div>
                      </div>

                      <div className="mp-he-form-grid">
                        <label className="f">
                          اسم الباقة
                          <input
                            value={p.n}
                            onChange={(e) => {
                              const copy = [...editPlans];
                              copy[idx] = { ...copy[idx], n: e.target.value };
                              setEditPlans(copy);
                            }}
                          />
                        </label>
                        <label className="f">
                          وصف مختصر أسفل الاسم
                          <input
                            value={p.tagline || ''}
                            onChange={(e) => {
                              const copy = [...editPlans];
                              copy[idx] = { ...copy[idx], tagline: e.target.value };
                              setEditPlans(copy);
                            }}
                            placeholder="وصف سريع للباقة..."
                          />
                        </label>
                      </div>

                      <div className="mp-he-form-grid-3">
                        <label className="f">
                          السعر الشهري (د.ع)
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={p.pr}
                            onChange={(e) => {
                              const copy = [...editPlans];
                              copy[idx] = { ...copy[idx], pr: Number(e.target.value) };
                              setEditPlans(copy);
                            }}
                          />
                        </label>
                        <label className="f">
                          السعر السنوي (د.ع)
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={annualRaw}
                            onChange={(e) => {
                              const copy = [...editPlans];
                              copy[idx] = { ...copy[idx], annualPr: Number(e.target.value) };
                              setEditPlans(copy);
                            }}
                          />
                        </label>
                        <label className="f">
                          نسبة الخصم (%)
                          <input
                            type="number"
                            min="0"
                            max="95"
                            step="5"
                            value={discPct}
                            onChange={(e) => {
                              const copy = [...editPlans];
                              copy[idx] = {
                                ...copy[idx],
                                discountPercent: Math.min(95, Math.max(0, Number(e.target.value) || 0)),
                              };
                              setEditPlans(copy);
                            }}
                          />
                        </label>
                      </div>

                      {discPct > 0 && (Number(p.pr) > 0 || annualRaw > 0) && (
                        <div className="mp-he-disc-preview">
                          <b>السعر بعد خصم {discPct}%:</b> شهري {formatNumber(monthlyFinal)} د.ع · سنوي {formatNumber(annualFinal)} د.ع
                        </div>
                      )}
                    </div>

                    <div className="mp-he-group">
                      <div className="mp-he-group-head">
                        <h3 className="mp-he-group-title">الحدود والقيود في لوحة الزبون</h3>
                      </div>
                      <div className="mp-he-form-grid">
                        <div>
                          <label className="f">
                            حد العناصر ({itemsUnlimited ? 'لانهائي ∞' : p.maxItems ?? 20})
                            <input
                              type="number"
                              min="1"
                              disabled={itemsUnlimited}
                              value={itemsUnlimited ? '' : p.maxItems ?? 20}
                              placeholder={itemsUnlimited ? '∞ لانهائي' : '20'}
                              onChange={(e) => {
                                const copy = [...editPlans];
                                copy[idx] = {
                                  ...copy[idx],
                                  maxItems: Math.max(1, Number(e.target.value) || 1),
                                };
                                setEditPlans(copy);
                              }}
                            />
                          </label>
                          <label className="mp-he-check-inline">
                            <input
                              type="checkbox"
                              checked={itemsUnlimited}
                              onChange={(e) => {
                                const copy = [...editPlans];
                                copy[idx] = {
                                  ...copy[idx],
                                  maxItems: e.target.checked ? -1 : 100,
                                };
                                setEditPlans(copy);
                              }}
                            />
                            <span>عناصر لانهائية (∞)</span>
                          </label>
                        </div>

                        <div>
                          <label className="f">
                            حد الأقسام ({catsUnlimited ? 'لانهائي ∞' : p.maxCats ?? 5})
                            <input
                              type="number"
                              min="1"
                              disabled={catsUnlimited}
                              value={catsUnlimited ? '' : p.maxCats ?? 5}
                              placeholder={catsUnlimited ? '∞ لانهائي' : '5'}
                              onChange={(e) => {
                                const copy = [...editPlans];
                                copy[idx] = {
                                  ...copy[idx],
                                  maxCats: Math.max(1, Number(e.target.value) || 1),
                                };
                                setEditPlans(copy);
                              }}
                            />
                          </label>
                          <label className="mp-he-check-inline">
                            <input
                              type="checkbox"
                              checked={catsUnlimited}
                              onChange={(e) => {
                                const copy = [...editPlans];
                                copy[idx] = {
                                  ...copy[idx],
                                  maxCats: e.target.checked ? -1 : 10,
                                };
                                setEditPlans(copy);
                              }}
                            />
                            <span>أقسام لانهائية (∞)</span>
                          </label>
                        </div>

                        <label className="f">
                          عدد مظاهر المنيو المتاحة
                          <select
                            value={String(p.maxThemes ?? 2)}
                            onChange={(e) => {
                              const copy = [...editPlans];
                              copy[idx] = { ...copy[idx], maxThemes: Number(e.target.value) };
                              setEditPlans(copy);
                            }}
                          >
                            <option value="2">مظهر أساسي (2)</option>
                            <option value="3">3 مظاهر احترافية</option>
                            <option value="6">6 مظاهر احترافية</option>
                            <option value="-1">كل المظاهر + الألوان (∞)</option>
                          </select>
                        </label>

                        <label className="f">
                          صلاحية تعدد الأفرع
                          <select
                            value={String(p.maxBranches ?? 0)}
                            onChange={(e) => {
                              const copy = [...editPlans];
                              copy[idx] = { ...copy[idx], maxBranches: Number(e.target.value) };
                              setEditPlans(copy);
                            }}
                          >
                            <option value="0">غير مفعل (فرع رئيسي فقط)</option>
                            <option value="2">حتى فرعين إضافيين (2)</option>
                            <option value="5">حتى 5 أفرع</option>
                            <option value="-1">أفرع غير محدودة (∞)</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="mp-he-group">
                      <div className="mp-he-group-head">
                        <h3 className="mp-he-group-title">الخصائص المفعلة بالنظام</h3>
                      </div>
                      <div className="mp-he-switch-grid">
                        {PLAN_FEATURE_TOGGLE_LABELS.map((feat) => {
                          const enabled = Boolean(fm[feat.key]);
                          return (
                            <div key={String(feat.key)} className="mp-he-switch-row">
                              <span className="mp-he-switch-label">{feat.label}</span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={enabled}
                                className={`ios-switch sm ${enabled ? 'on' : 'off'}`}
                                onClick={() => {
                                  const copy = [...editPlans];
                                  copy[idx] = {
                                    ...copy[idx],
                                    featuresMap: {
                                      ...(copy[idx].featuresMap || {}),
                                      [feat.key]: !enabled,
                                    },
                                  };
                                  setEditPlans(copy);
                                }}
                              >
                                <span className="ios-switch-thumb" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mp-he-group">
                      <PlanFeaturesOrderEditor
                        plans={editPlans}
                        selectedPlanIdx={idx}
                        onSelectPlanIdx={setSelectedPlanIdx}
                        onChangePlans={setEditPlans}
                        showPlanTabs={false}
                        showToast={showToast}
                      />
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* 8. Footer Controls */}
        {activeTab === 'footer' && (
          <div className="mp-he-stage-body">
            <div className="mp-he-group">
              <div className="mp-he-form-grid">
                <label className="f">
                  اسم المطور / الحساب (بواسطة)
                  <input
                    value={draftHome.footerConfig?.authorName ?? 'محمد'}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        footerConfig: { ...(draftHome.footerConfig || {}), authorName: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="f">
                  رابط المطور
                  <input
                    dir="ltr"
                    value={draftHome.footerConfig?.authorUrl ?? 'https://instagram.com/weel'}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        footerConfig: { ...(draftHome.footerConfig || {}), authorUrl: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="f">
                  رابط إنستقرام المنصة
                  <input
                    dir="ltr"
                    value={draftHome.footerConfig?.instagramUrl ?? 'https://instagram.com/iq.menu'}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        footerConfig: { ...(draftHome.footerConfig || {}), instagramUrl: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="f">
                  نص حقوق النشر (اتركه فارغاً للتلقائي)
                  <input
                    value={draftHome.footerConfig?.copyrightText ?? ''}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        footerConfig: { ...(draftHome.footerConfig || {}), copyrightText: e.target.value },
                      })
                    }
                    placeholder={`© ${new Date().getFullYear()} ${site.name} – جميع الحقوق محفوظة`}
                  />
                </label>
              </div>
            </div>

            <div className="mp-he-group">
              <div className="mp-he-group-head">
                <h3 className="mp-he-group-title">نصوص روابط التذييل</h3>
              </div>
              <div className="mp-he-form-grid-3">
                <label className="f">
                  رابط: الأسئلة الشائعة
                  <input
                    value={draftHome.footerConfig?.faqLinkText ?? 'الأسئلة الشائعة'}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        footerConfig: { ...(draftHome.footerConfig || {}), faqLinkText: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="f">
                  رابط: المنيو التجريبي
                  <input
                    value={draftHome.footerConfig?.demoLinkText ?? 'معاينة منيو تجريبي'}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        footerConfig: { ...(draftHome.footerConfig || {}), demoLinkText: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="f">
                  زر: الشروط والخصوصية
                  <input
                    value={draftHome.footerConfig?.termsLinkText ?? 'الشروط وسياسة الخصوصية'}
                    onChange={(e) =>
                      setDraftHome({
                        ...draftHome,
                        footerConfig: { ...(draftHome.footerConfig || {}), termsLinkText: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Clean Bottom Step Navigation */}
        <div className="mp-he-stage-foot">
          <div className="mp-he-step-nav">
            {prevTab && (
              <button
                type="button"
                className="btn s"
                onClick={() => setActiveTab(prevTab.id)}
              >
                <ArrowRight size={14} />
                <span>السابق: {prevTab.label}</span>
              </button>
            )}
            {nextTab && (
              <button
                type="button"
                className="btn s"
                onClick={() => setActiveTab(nextTab.id)}
              >
                <span>التالي: {nextTab.label}</span>
                <ArrowLeft size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
