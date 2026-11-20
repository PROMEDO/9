/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Link2,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Monitor,
  Moon,
  Phone,
  Plus,
  Power,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Store,
  Sun,
  Trash2,
  Truck,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { MediaLibraryModal } from '../../components/MediaLibraryModal';
import { fetchDashboardTelegramStatusApi } from '../../utils/adminApi';
import { isReservedSlug } from '../../utils/businessDefaults';
import {
  SettingsSectionTab,
  WEEK_DAYS_ORDER,
  themedInputStyle,
  useDashboard,
} from './DashboardContext';
import {
  DASH_EASE,
  DASH_SPRING_PILL,
  dashSectionMotion,
  dashSubTabMotion,
} from '../../utils/dashboardMotion';
import { TelegramPage } from './TelegramPage';

export const SettingsPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'logo' | 'cover' | null>(null);
  const waInputRef = useRef<HTMLInputElement | null>(null);
  const slugDebounceRef = useRef<number | null>(null);

  const {
    settingsSectionTab: sectionTab,
    setSettingsSectionTab: setSectionTab,
    resolvedPlan,
    openUpgradeModal,
    menuThemeMode,
    handleSelectThemeMode,
    dashboardThemeMode,
    handleSelectDashboardThemeMode,
    baseDomain,
    fullSubdomainUrl,
    subdomainEnabled,
    publicPath,
    liveMenuUrl,
    onNavigate,
    copyLink,
    openShareModal,
    restSlug,
    setRestSlug,
    slugCheckState,
    setSlugCheckState,
    checkSubdomainAvailability,
    coverUrlInput,
    setCoverUrlInput,
    logoUrlInput,
    setLogoUrlInput,
    aboutTextInput,
    setAboutTextInput,
    taxNoteInput,
    setTaxNoteInput,
    showLogoUrlField,
    setShowLogoUrlField,
    showBannerUrlField,
    setShowBannerUrlField,
    handleCurrencyChange,
    flushAllPendingSaves,
    mediaLibraryItems,
    uploadImagesToLibrary,
    removeMediaLibraryItem,
    restProjectType,
    setRestProjectType,
    restName,
    setRestName,
    restTagline,
    setRestTagline,
    restCurrency,
    restActive,
    setRestActive,
    allowDelivery,
    setAllowDelivery,
    allowPickup,
    setAllowPickup,
    allowTable,
    setAllowTable,
    rest,
    activeRid,
    mainRid,
    acceptClosedOrders,
    setAcceptClosedOrders,
    orderChannel,
    setOrderChannel,
    restPhone,
    setRestPhone,
    restWa,
    setRestWa,
    restAddress,
    setRestAddress,
    restInstagram,
    setRestInstagram,
    restMapUrl,
    setRestMapUrl,
    restGoogleReviewUrl,
    setRestGoogleReviewUrl,
    restFacebook,
    setRestFacebook,
    restTiktok,
    setRestTiktok,
    workMode,
    setWorkMode,
    workFrom,
    setWorkFrom,
    workTo,
    setWorkTo,
    weeklyHours,
    setWeeklyHours,
    applyTimeToOpenDays,
    deliveryZonesState,
    setDeliveryZonesState,
    terms,
    handleSeedStoreCatalog,
  } = useDashboard();

  const [slugDraft, setSlugDraft] = useState(restSlug);
  const [hasTypedSlug, setHasTypedSlug] = useState(false);
  const [slugFormatError, setSlugFormatError] = useState('');
  const [slugDebouncing, setSlugDebouncing] = useState(false);

  // Reset slug draft cleanly when switching branches
  useEffect(() => {
    if (slugDebounceRef.current !== null) {
      window.clearTimeout(slugDebounceRef.current);
      slugDebounceRef.current = null;
    }
    setSlugDraft(restSlug);
    setHasTypedSlug(false);
    setSlugFormatError('');
    setSlugDebouncing(false);
  }, [activeRid]);

  // Keep draft synced with external updates when user hasn't typed manually
  useEffect(() => {
    if (!hasTypedSlug) {
      setSlugDraft(restSlug);
    }
  }, [restSlug, hasTypedSlug]);

  useEffect(() => {
    return () => {
      if (slugDebounceRef.current !== null) {
        window.clearTimeout(slugDebounceRef.current);
      }
    };
  }, []);

  const handleSlugTyping = (rawInput: string) => {
    const rawVal = rawInput.toLowerCase();
    setSlugDraft(rawVal);
    setHasTypedSlug(true);

    if (slugDebounceRef.current !== null) {
      window.clearTimeout(slugDebounceRef.current);
      slugDebounceRef.current = null;
    }

    if (!rawVal) {
      setSlugDebouncing(false);
      setSlugFormatError('أدخل 3 أحرف إنجليزية أو أرقام على الأقل.');
      setSlugCheckState({ checking: false, available: false, message: '' });
      return;
    }

    const hasInvalidChars = /[^a-z0-9-]/.test(rawVal);
    const hasBadHyphen = rawVal.startsWith('-') || rawVal.endsWith('-') || rawVal.includes('--');
    if (hasInvalidChars || hasBadHyphen) {
      setSlugDebouncing(false);
      setSlugFormatError(
        hasInvalidChars
          ? 'يُسمح فقط بالأحرف الإنجليزية (a-z) والأرقام والشرطة (-) بدون مسافات.'
          : 'لا يمكن أن يبدأ الرابط أو ينتهي بشرطة (-) أو يحتوي على شرطتين متتاليتين.'
      );
      setSlugCheckState({ checking: false, available: false, message: '' });
      return;
    }

    if (rawVal.length < 3) {
      setSlugDebouncing(false);
      setSlugFormatError('يجب أن يتكون الرابط من 3 أحرف إنجليزية أو أرقام على الأقل.');
      setSlugCheckState({ checking: false, available: false, message: '' });
      return;
    }

    if (isReservedSlug(rawVal)) {
      setSlugDebouncing(false);
      setSlugFormatError('هذا الاسم محجوز للنظام، يرجى اختيار اسم آخر.');
      setSlugCheckState({ checking: false, available: false, message: '' });
      return;
    }

    setSlugFormatError('');
    setRestSlug(rawVal);
    setSlugDebouncing(true);
    setSlugCheckState({ checking: true, available: null, message: '' });
    slugDebounceRef.current = window.setTimeout(() => {
      slugDebounceRef.current = null;
      setSlugDebouncing(false);
      void checkSubdomainAvailability(rawVal);
    }, 320);
  };

  const targetTelegramRid = activeRid || mainRid || rest.id;
  const hasLocalTelegram = Boolean(
    rest.telegramLinked ||
      (rest.telegramChatId && String(rest.telegramChatId).trim()) ||
      (rest.telegramPhone && String(rest.telegramPhone).trim() && rest.telegramUnlinkedManually !== true)
  );
  const [serverTelegramLinked, setServerTelegramLinked] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (!targetTelegramRid) {
      setServerTelegramLinked(false);
      return;
    }
    setServerTelegramLinked(null);
    void fetchDashboardTelegramStatusApi(targetTelegramRid)
      .then((res) => {
        if (!active) return;
        setServerTelegramLinked(Boolean(res?.linked));
      })
      .catch(() => {
        if (active) setServerTelegramLinked(hasLocalTelegram);
      });
    return () => {
      active = false;
    };
  }, [targetTelegramRid, rest.telegramPhone, rest.telegramLinked, rest.telegramUnlinkedManually, hasLocalTelegram]);

  const previewSubdomainHost = subdomainEnabled
    ? `${restSlug || 'your-store'}.${baseDomain}`
    : `${baseDomain}/${restSlug || 'your-store'}`;

  const isTelegramConnected =
    serverTelegramLinked === true ||
    (serverTelegramLinked !== false && hasLocalTelegram);
  const missingTelegram =
    orderChannel !== 'whatsapp' &&
    !isTelegramConnected &&
    (hasLocalTelegram || serverTelegramLinked !== null);
  const missingWhatsapp = orderChannel !== 'telegram' && !restWa.trim() && !restPhone.trim();
  const hasOpsAlert = missingTelegram || missingWhatsapp;

  const goToWhatsAppInput = () => {
    setSectionTab('links');
    window.setTimeout(() => {
      waInputRef.current?.focus();
      waInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 220);
  };

  const isSlugLoading = hasTypedSlug && (slugDebouncing || slugCheckState.checking);
  const isSlugInvalid = hasTypedSlug && !isSlugLoading && (Boolean(slugFormatError) || slugCheckState.available === false);
  const isSlugValid = hasTypedSlug && !isSlugLoading && !slugFormatError && slugCheckState.available === true;
  const slugFeedbackMessage = hasTypedSlug && !isSlugLoading ? slugFormatError || slugCheckState.message : '';

  const tabs: Array<{ id: SettingsSectionTab; label: string; Icon: React.ElementType; alert?: boolean }> = [
    { id: 'ops', label: 'التشغيل', Icon: SlidersHorizontal, alert: hasOpsAlert },
    { id: 'identity', label: 'الهوية', Icon: Store },
    { id: 'links', label: 'الروابط', Icon: Link2, alert: missingWhatsapp },
    { id: 'telegram', label: 'تيليجرام', Icon: Send, alert: missingTelegram },
  ];

  const renderLinkActionButtons = (targetUrl: string) => (
    <div className="mp-set2-link-actions">
      <button type="button" className="btn s mp-set2-link-action-btn" onClick={openShareModal}>
        <Share2 size={14} />
        <span>مشاركة</span>
      </button>
      <button type="button" className="btn s mp-set2-link-action-btn" onClick={() => copyLink(targetUrl)}>
        <Copy size={14} />
        <span>نسخ</span>
      </button>
      {fullSubdomainUrl ? (
        <a
          href={fullSubdomainUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn s mp-set2-link-action-btn"
        >
          <ExternalLink size={14} />
          <span>معاينة</span>
        </a>
      ) : (
        <button type="button" className="btn s mp-set2-link-action-btn" onClick={() => onNavigate(publicPath)}>
          <ExternalLink size={14} />
          <span>معاينة</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="mp-set2-page">
      {/* Segmented Category Navigation */}
      <motion.div
        className="mp-set2-tabs-bar"
        role="tablist"
        aria-label="أقسام الإعدادات"
        {...dashSectionMotion(prefersReducedMotion, 0)}
      >
        {tabs.map((tab) => {
          const isActive = sectionTab === tab.id;
          const TabIcon = tab.Icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSectionTab(tab.id)}
              className={`mp-set2-tab-btn ${isActive ? 'active' : ''}`}
            >
              {isActive && (
                <motion.span
                  layoutId={prefersReducedMotion ? undefined : 'mp-set2-active-pill'}
                  className="mp-set2-tab-pill"
                  transition={DASH_SPRING_PILL}
                />
              )}
              <TabIcon size={14} />
              <span>{tab.label}</span>
              {tab.alert && <span className="mp-set2-tab-alert" aria-hidden="true" />}
            </button>
          );
        })}
      </motion.div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void flushAllPendingSaves();
        }}
      >
        <AnimatePresence mode="wait">
          {/* 1. التبويب الأول: التشغيل (الحالة، العملة وطرق الطلبات، قناة الوصول، أوقات الدوام، مناطق وأسعار التوصيل) */}
          {sectionTab === 'ops' && (
            <motion.div
              key="tab-ops"
              {...dashSubTabMotion(prefersReducedMotion)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Live Menu Status Hero Card */}
              <div className={`mp-set2-hero ${restActive ? '' : 'is-paused'}`}>
                <div className="mp-set2-hero-info">
                  <div className="mp-set2-icon-box">
                    <Power size={19} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--ink)' }}>
                      {restActive
                        ? terms.isStore
                          ? 'المتجر مفعّل ويستقبل الطلبات'
                          : 'المنيو مفعّل ويستقبل الطلبات'
                        : terms.isStore
                        ? 'المتجر متوقف مؤقتاً'
                        : 'المنيو متوقف مؤقتاً'}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: restActive ? '#10b981' : '#ef4444',
                        marginTop: '2px',
                      }}
                    >
                      {restActive
                        ? 'يظهر للزبائن بشكل مباشر'
                        : 'يظهر إشعار التوقف المؤقت للزوار'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={restActive}
                  aria-label={terms.isStore ? 'حالة المتجر للزبائن' : 'حالة المنيو للزبائن'}
                  onClick={() => setRestActive((v) => !v)}
                  className={`ios-switch ${restActive ? 'on' : 'off'}`}
                >
                  <span className="ios-switch-thumb" />
                </button>
              </div>

              {/* Currency & Order Types Panel */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">العملة وطرق استلام الطلبات</h2>
                </div>

                <div className="mp-set2-list">
                  {/* Currency */}
                  <div className="mp-set2-row">
                    <div className="mp-set2-row-meta">
                      <div className="mp-set2-mini-ico">
                        <Coins size={16} />
                      </div>
                      <div>
                        <div className="mp-set2-row-label">العملة</div>
                        <div className="mp-set2-row-desc">للأسعار والفواتير</div>
                      </div>
                    </div>

                    <select
                      aria-label="اختيار العملة"
                      value={restCurrency}
                      onChange={(e) => handleCurrencyChange(e.target.value)}
                      className="mp-set2-currency-select"
                      style={themedInputStyle}
                    >
                      <option value="د.ع">د.ع — دينار عراقي</option>
                      <option value="$">$ — دولار أمريكي</option>
                      <option value="ر.س">ر.س — ريال سعودي</option>
                      <option value="د.إ">د.إ — درهم إماراتي</option>
                      <option value="د.ك">د.ك — دينار كويتي</option>
                      <option value="د.أ">د.أ — دينار أردني</option>
                      <option value="ر.ق">ر.ق — ريال قطري</option>
                      <option value="د.ب">د.ب — دينار بحريني</option>
                      <option value="ر.ع">ر.ع — ريال عماني</option>
                      <option value="ج.م">ج.م — جنيه مصري</option>
                      <option value="ل.ل">ل.ل — ليرة لبنانية</option>
                      <option value="€">€ — يورو</option>
                    </select>
                  </div>

                  {/* Delivery */}
                  <div className="mp-set2-row">
                    <div className="mp-set2-row-meta">
                      <div className="mp-set2-mini-ico">
                        <Truck size={16} />
                      </div>
                      <div>
                        <div className="mp-set2-row-label">طلبات التوصيل</div>
                        {!resolvedPlan.perms.deliveryOrders && (
                          <div className="mp-set2-row-desc" style={{ color: '#f59e0b', fontWeight: 700 }}>
                            مقفل في باقتك الحالية
                          </div>
                        )}
                      </div>
                    </div>
                    {!resolvedPlan.perms.deliveryOrders ? (
                      <button
                        type="button"
                        className="btn s"
                        onClick={() => openUpgradeModal('starter')}
                        style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 800 }}
                      >
                        <Lock size={13} />
                        <span>ترقية</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={allowDelivery}
                        aria-label="تفعيل طلبات التوصيل"
                        onClick={() => setAllowDelivery((v) => !v)}
                        className={`ios-switch sm ${allowDelivery ? 'on' : 'off'}`}
                      >
                        <span className="ios-switch-thumb" />
                      </button>
                    )}
                  </div>

                  {/* Pickup */}
                  <div className="mp-set2-row">
                    <div className="mp-set2-row-meta">
                      <div className="mp-set2-mini-ico">
                        <Store size={16} />
                      </div>
                      <div>
                        <div className="mp-set2-row-label">{terms.isStore ? 'الاستلام من المعرض' : 'الحجز / الاستلام'}</div>
                        {!resolvedPlan.perms.pickupOrders && (
                          <div className="mp-set2-row-desc" style={{ color: '#f59e0b', fontWeight: 700 }}>
                            مقفل في باقتك الحالية
                          </div>
                        )}
                      </div>
                    </div>
                    {!resolvedPlan.perms.pickupOrders ? (
                      <button
                        type="button"
                        className="btn s"
                        onClick={() => openUpgradeModal('starter')}
                        style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 800 }}
                      >
                        <Lock size={13} />
                        <span>ترقية</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={allowPickup}
                        aria-label={terms.isStore ? 'تفعيل الاستلام من المعرض' : 'تفعيل الحجز والاستلام'}
                        onClick={() => setAllowPickup((v) => !v)}
                        className={`ios-switch sm ${allowPickup ? 'on' : 'off'}`}
                      >
                        <span className="ios-switch-thumb" />
                      </button>
                    )}
                  </div>

                  {/* Table (Restaurants only) */}
                  {restProjectType !== 'store' && (
                    <div className="mp-set2-row">
                      <div className="mp-set2-row-meta">
                        <div className="mp-set2-mini-ico">
                          <UtensilsCrossed size={16} />
                        </div>
                        <div>
                          <div className="mp-set2-row-label">طلبات الطاولات</div>
                          {!resolvedPlan.perms.tableOrders && (
                            <div className="mp-set2-row-desc" style={{ color: '#f59e0b', fontWeight: 700 }}>
                              متاح في الباقة الاحترافية فأعلى
                            </div>
                          )}
                        </div>
                      </div>
                      {!resolvedPlan.perms.tableOrders ? (
                        <button
                          type="button"
                          className="btn s"
                          onClick={() => openUpgradeModal('pro')}
                          style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 800 }}
                        >
                          <Lock size={13} />
                          <span>ترقية</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={allowTable}
                          aria-label="تفعيل طلبات الطاولات"
                          onClick={() => setAllowTable((v) => !v)}
                          className={`ios-switch sm ${allowTable ? 'on' : 'off'}`}
                        >
                          <span className="ios-switch-thumb" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Pre-orders when closed */}
                  <div className="mp-set2-row">
                    <div className="mp-set2-row-meta">
                      <div className="mp-set2-mini-ico">
                        <Moon size={16} />
                      </div>
                      <div>
                        <div className="mp-set2-row-label">استقبال الطلبات خارج الدوام</div>
                        <div className="mp-set2-row-desc">السماح بالطلبات المسبقة عند الإغلاق</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={acceptClosedOrders}
                      aria-label="استقبال الطلبات خارج الدوام"
                      onClick={() => setAcceptClosedOrders((v) => !v)}
                      className={`ios-switch sm ${acceptClosedOrders ? 'on' : 'off'}`}
                    >
                      <span className="ios-switch-thumb" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Order Receiving Channel */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <div>
                    <h2 className="mp-set2-panel-title">قناة وصول الطلبات</h2>
                    <p className="mp-set2-panel-sub">
                      {terms.isStore ? 'حدد أين تصلك طلبات الزبائن مباشرة من المتجر' : 'حدد أين تصلك طلبات الزبائن مباشرة من المنيو'}
                    </p>
                  </div>
                </div>

                <div className="mp-set2-channels-grid">
                  {[
                    {
                      id: 'both' as const,
                      title: 'الاثنين معاً',
                      desc: 'إشعار تيليجرام + تحويل لواتساب',
                      accent: '#10b981',
                      Icon: CheckCircle2,
                    },
                    {
                      id: 'telegram' as const,
                      title: 'تيليجرام فقط',
                      desc: 'للّوحة وبوت تيليجرام بدون واتساب',
                      accent: '#0088cc',
                      Icon: Send,
                    },
                    {
                      id: 'whatsapp' as const,
                      title: 'واتساب فقط',
                      desc: 'محادثة واتساب مع إيقاف البوت',
                      accent: '#16a34a',
                      Icon: MessageCircle,
                    },
                  ].map((opt) => {
                    const selected = orderChannel === opt.id;
                    const OptIcon = opt.Icon;
                    return (
                      <motion.button
                        key={opt.id}
                        type="button"
                        whileHover={prefersReducedMotion ? undefined : { y: -2, transition: { duration: 0.38, ease: DASH_EASE } }}
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.985, transition: { duration: 0.2 } }}
                        onClick={() => setOrderChannel(opt.id)}
                        className={`mp-set2-channel-card ${selected ? 'is-selected' : ''}`}
                        style={{
                          borderColor: selected ? opt.accent : undefined,
                          background: selected
                            ? `color-mix(in srgb, ${opt.accent} 11%, var(--surface))`
                            : undefined,
                        }}
                      >
                        <span
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '10px',
                            background: selected ? opt.accent : 'var(--soft)',
                            color: selected ? '#ffffff' : 'var(--muted)',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <OptIcon size={17} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 900, fontSize: '13.5px', color: 'var(--ink)' }}>
                            {opt.title}
                          </span>
                          <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px', lineHeight: 1.45 }}>
                            {opt.desc}
                          </span>
                        </span>
                      </motion.button>
                    );
                  })}
                </div>

                {missingTelegram && (
                  <div className="mp-set2-alert warn">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 200px' }}>
                      <AlertCircle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
                      <span>لم يتم ربط التليجرام بعد — شارك رقمك مع البوت لاستقبال الطلبات.</span>
                    </div>
                    <button
                      type="button"
                      className="btn s"
                      onClick={() => setSectionTab('telegram')}
                      style={{ fontWeight: 800, fontSize: '12px' }}
                    >
                      <Send size={13} />
                      <span>إعداد التليجرام</span>
                    </button>
                  </div>
                )}

                {missingWhatsapp && (
                  <div className="mp-set2-alert danger">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 200px' }}>
                      <AlertCircle size={16} style={{ flexShrink: 0 }} />
                      <span>يرجى إدخال رقم الواتساب في تبويب «الروابط» لاستقبال الطلبات.</span>
                    </div>
                    <button
                      type="button"
                      className="btn s"
                      onClick={goToWhatsAppInput}
                      style={{ fontSize: '12px', fontWeight: 800 }}
                    >
                      إدخال الرقم الآن
                    </button>
                  </div>
                )}
              </div>

              {/* Working Hours Panel */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <div>
                    <h2 className="mp-set2-panel-title">
                      <Clock size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
                      <span>أوقات وساعات العمل</span>
                    </h2>
                  </div>
                </div>

                <div className="mp-set2-seg-2" role="group" aria-label="نظام أوقات العمل">
                  <button
                    type="button"
                    className={`mp-set2-seg-2-btn ${workMode === '24' ? 'active' : ''}`}
                    onClick={() => setWorkMode('24')}
                  >
                    مفتوح 24 ساعة
                  </button>
                  <button
                    type="button"
                    className={`mp-set2-seg-2-btn ${workMode === 'c' ? 'active' : ''}`}
                    onClick={() => setWorkMode('c')}
                  >
                    جدول أسبوعي مخصص
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {workMode === 'c' && (
                    <motion.div
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -12, scale: 0.99 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0, x: 10, scale: 0.99 }}
                      transition={{ duration: 0.45, ease: DASH_EASE }}
                      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                    >
                      {/* Quick Unified Time Bar */}
                      <div className="mp-set2-hours-quick">
                        <div className="mp-set2-hours-quick-label">توقيت موحد للأيام المفتوحة:</div>
                        <div className="mp-set2-hours-quick-controls">
                          <div className="mp-set2-time-pair">
                            <label className="mp-set2-time-box">
                              <span>من</span>
                              <input
                                type="time"
                                dir="ltr"
                                value={workFrom}
                                onChange={(e) => setWorkFrom(e.target.value)}
                                style={themedInputStyle}
                              />
                            </label>
                            <label className="mp-set2-time-box">
                              <span>إلى</span>
                              <input
                                type="time"
                                dir="ltr"
                                value={workTo}
                                onChange={(e) => setWorkTo(e.target.value)}
                                style={themedInputStyle}
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            className="btn s mp-set2-hours-apply-btn"
                            onClick={() => applyTimeToOpenDays(workFrom, workTo)}
                          >
                            تطبيق على الكل
                          </button>
                        </div>
                      </div>

                      {/* 7 Days List */}
                      <div className="mp-set2-days-list">
                        {WEEK_DAYS_ORDER.map(({ key, label }) => {
                          const dayCfg = weeklyHours[key] || { open: true, from: workFrom, to: workTo };
                          return (
                            <div
                              key={key}
                              className={`mp-set2-day-row ${dayCfg.open ? 'is-open' : 'is-closed'}`}
                            >
                              <div className="mp-set2-day-head">
                                <div className="mp-set2-day-switch-wrap">
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={dayCfg.open}
                                    aria-label={`${label} ${dayCfg.open ? 'مفتوح' : 'مغلق'}`}
                                    onClick={() =>
                                      setWeeklyHours((prev) => ({
                                        ...prev,
                                        [key]: { ...dayCfg, open: !dayCfg.open },
                                      }))
                                    }
                                    className={`ios-switch sm ${dayCfg.open ? 'on' : 'off'}`}
                                  >
                                    <span className="ios-switch-thumb" />
                                  </button>
                                  <span className="mp-set2-day-name">{label}</span>
                                </div>
                                <span className={`mp-set2-day-status ${dayCfg.open ? 'is-open' : 'is-closed'}`}>
                                  {dayCfg.open ? 'مفتوح' : 'مغلق'}
                                </span>
                              </div>

                              {dayCfg.open && (
                                <div className="mp-set2-time-pair">
                                  <label className="mp-set2-time-box">
                                    <span>من</span>
                                    <input
                                      type="time"
                                      dir="ltr"
                                      value={dayCfg.from || workFrom}
                                      onChange={(e) =>
                                        setWeeklyHours((prev) => ({
                                          ...prev,
                                          [key]: { ...dayCfg, from: e.target.value },
                                        }))
                                      }
                                      style={themedInputStyle}
                                    />
                                  </label>
                                  <label className="mp-set2-time-box">
                                    <span>إلى</span>
                                    <input
                                      type="time"
                                      dir="ltr"
                                      value={dayCfg.to || workTo}
                                      onChange={(e) =>
                                        setWeeklyHours((prev) => ({
                                          ...prev,
                                          [key]: { ...dayCfg, to: e.target.value },
                                        }))
                                      }
                                      style={themedInputStyle}
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Delivery Zones & Fees */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <div>
                    <h2 className="mp-set2-panel-title">
                      <MapPin size={16} style={{ color: 'var(--brand-ink, #34D399)' }} />
                      <span>أسعار ومناطق التوصيل</span>
                    </h2>
                    <p className="mp-set2-panel-sub">
                      أضف المنطقة وسعر التوصيل ببساطة، ويمكنك إضافة أحياء فرعية لها إذا رغبت
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn p s"
                    style={{ fontWeight: 800 }}
                    onClick={() =>
                      setDeliveryZonesState((prev) => [...prev, { area: '', fee: 2000, cities: [] }])
                    }
                  >
                    <Plus size={14} />
                    <span>إضافة منطقة</span>
                  </button>
                </div>

                {deliveryZonesState.length === 0 ? (
                  <div className="mp-set2-zones-empty">
                    <MapPin size={22} style={{ margin: '0 auto 6px', opacity: 0.6 }} />
                    <div>لم تُضف مناطق توصيل بعد. اضغط «إضافة منطقة» للبدء.</div>
                  </div>
                ) : (
                  <div className="mp-set2-zones-list">
                    {deliveryZonesState.map((zone, idx) => (
                      <div key={idx} className="mp-set2-zone-card">
                        <div className="mp-set2-zone-top">
                          <span className="mp-set2-zone-num">منطقة #{idx + 1}</span>
                          <button
                            type="button"
                            className="mp-set2-zone-del-btn"
                            onClick={() => setDeliveryZonesState((prev) => prev.filter((_, i) => i !== idx))}
                            title="حذف المنطقة"
                          >
                            <Trash2 size={13} />
                            <span>حذف</span>
                          </button>
                        </div>

                        <div className="mp-set2-zone-fields">
                          <label className="mp-set2-field-group">
                            <span>اسم المنطقة / المحافظة</span>
                            <input
                              type="text"
                              value={zone.area}
                              onChange={(e) =>
                                setDeliveryZonesState((prev) =>
                                  prev.map((z, i) => (i === idx ? { ...z, area: e.target.value } : z))
                                )
                              }
                              placeholder="مثال: بغداد - الكرادة"
                              style={themedInputStyle}
                            />
                          </label>
                          <label className="mp-set2-field-group">
                            <span>سعر التوصيل ({restCurrency})</span>
                            <input
                              type="number"
                              min={0}
                              dir="ltr"
                              value={zone.fee}
                              onChange={(e) =>
                                setDeliveryZonesState((prev) =>
                                  prev.map((z, i) => (i === idx ? { ...z, fee: Number(e.target.value) || 0 } : z))
                                )
                              }
                              placeholder="2000"
                              style={themedInputStyle}
                            />
                          </label>
                        </div>

                        {zone.cities && zone.cities.length > 0 && (
                          <div className="mp-set2-subzone-list">
                            <div className="mp-set2-subzone-heading">الأحياء / الأقضية الفرعية:</div>
                            {zone.cities.map((city, cIdx) => (
                              <div key={cIdx} className="mp-set2-subzone-row">
                                <input
                                  type="text"
                                  value={city.name}
                                  onChange={(e) =>
                                    setDeliveryZonesState((prev) =>
                                      prev.map((z, i) =>
                                        i === idx
                                          ? {
                                              ...z,
                                              cities: z.cities.map((c, j) => (j === cIdx ? { ...c, name: e.target.value } : c)),
                                            }
                                          : z
                                      )
                                    )
                                  }
                                  placeholder="الحي / القضاء"
                                  style={themedInputStyle}
                                />
                                <input
                                  type="number"
                                  min={0}
                                  dir="ltr"
                                  value={city.fee}
                                  onChange={(e) =>
                                    setDeliveryZonesState((prev) =>
                                      prev.map((z, i) =>
                                        i === idx
                                          ? {
                                              ...z,
                                              cities: z.cities.map((c, j) => (j === cIdx ? { ...c, fee: Number(e.target.value) || 0 } : c)),
                                            }
                                          : z
                                      )
                                    )
                                  }
                                  placeholder={restCurrency}
                                  style={themedInputStyle}
                                />
                                <button
                                  type="button"
                                  className="mp-set2-subzone-del"
                                  onClick={() =>
                                    setDeliveryZonesState((prev) =>
                                      prev.map((z, i) =>
                                        i === idx ? { ...z, cities: z.cities.filter((_, j) => j !== cIdx) } : z
                                      )
                                    )
                                  }
                                  title="حذف الحي الفرعي"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <button
                          type="button"
                          className="mp-set2-subzone-add-btn"
                          onClick={() =>
                            setDeliveryZonesState((prev) =>
                              prev.map((z, i) =>
                                i === idx
                                  ? { ...z, cities: [...(z.cities || []), { name: '', fee: z.fee || 2000 }] }
                                  : z
                              )
                            )
                          }
                        >
                          <Plus size={13} />
                          <span>إضافة حي فرعي (اختياري)</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* 2. التبويب الثاني: الهوية (بيانات المشروع، الشعار والغلاف، المظهر) */}
          {sectionTab === 'identity' && (
            <motion.div
              key="tab-identity"
              {...dashSubTabMotion(prefersReducedMotion)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Business Type & Core Info */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">نوع النشاط وبيانات المشروع</h2>
                </div>

                <div className="mp-set2-type-grid">
                  <button
                    type="button"
                    onClick={() => setRestProjectType('restaurant')}
                    className={`mp-set2-type-card ${restProjectType === 'restaurant' ? 'is-selected' : ''}`}
                  >
                    <span
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '11px',
                        background: '#059669',
                        color: '#ffffff',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <UtensilsCrossed size={18} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 800, fontSize: '13px', color: 'var(--ink)' }}>
                        مطعم أو مقهى
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>
                        أطعمة وكافيه
                      </span>
                    </span>
                    {restProjectType === 'restaurant' && <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0 }} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRestProjectType('store')}
                    className={`mp-set2-type-card ${restProjectType === 'store' ? 'is-selected' : ''}`}
                  >
                    <span
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '11px',
                        background: '#0ea5e9',
                        color: '#ffffff',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Store size={18} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 800, fontSize: '13px', color: 'var(--ink)' }}>
                        متجر أو محل
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>
                        منتجات ومبيعات
                      </span>
                    </span>
                    {restProjectType === 'store' && <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0 }} />}
                  </button>
                </div>

                {restProjectType === 'store' && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      background: 'color-mix(in srgb, #f15a29 10%, var(--surface))',
                      border: '1px solid color-mix(in srgb, #f15a29 30%, var(--line))',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--ink)',
                      lineHeight: 1.6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      تم تفعيل مظهر المتجر الإلكتروني الموحّد تلقائياً لمتجرك، مع إمكانية تعديل الأقسام والمنتجات والأسعار والشعار بالكامل.
                    </span>
                    <button
                      type="button"
                      className="btn p s"
                      onClick={() => handleSeedStoreCatalog('append_missing')}
                      style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Sparkles size={13} />
                      <span>إضافة أقسام ومنتجات المتجر الافتراضية</span>
                    </button>
                  </div>
                )}

                <div className="mp-set2-grid-2">
                  <label className="f" style={{ marginBottom: 0 }}>
                    اسم المشروع *
                    <input
                      type="text"
                      value={restName}
                      onChange={(e) => setRestName(e.target.value)}
                      style={themedInputStyle}
                      required
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    الوصف المختصر (Tagline)
                    <input
                      type="text"
                      value={restTagline}
                      onChange={(e) => setRestTagline(e.target.value)}
                      placeholder={terms.isStore ? 'مثال: أحدث الأجهزة الإلكترونية والإكسسوارات بضمان رسمي' : 'مثال: برجر سماش طازج • بطاطا مقرمشة'}
                      style={themedInputStyle}
                    />
                  </label>
                </div>

                <label className="f" style={{ marginBottom: 0 }}>
                  نبذة عن المشروع (تظهر في نافذة «نبذة عنا»)
                  <textarea
                    rows={2}
                    value={aboutTextInput}
                    onChange={(e) => setAboutTextInput(e.target.value)}
                    placeholder="اكتب قصة مشروعك، جودة المنتجات، وساعات الخدمة..."
                    style={themedInputStyle}
                  />
                </label>

                <label className="f" style={{ marginBottom: 0 }}>
                  {terms.isStore ? 'ملاحظة الضريبة أو الضمان أسفل المتجر' : 'ملاحظة الضريبة أو الفاتورة أسفل المنيو'}
                  <input
                    type="text"
                    value={taxNoteInput}
                    onChange={(e) => setTaxNoteInput(e.target.value)}
                    placeholder={terms.isStore ? 'مثال: جميع الأسعار شاملة الضمان الرسمي' : 'مثال: جميع الأسعار شاملة الضريبة'}
                    style={themedInputStyle}
                  />
                </label>
              </div>

              {/* Logo & Cover Media */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <div>
                    <h2 className="mp-set2-panel-title">
                      <ImageIcon size={16} style={{ color: 'var(--brand-ink, #34D399)' }} />
                      <span>الشعار وصورة الغلاف</span>
                    </h2>
                    <p className="mp-set2-panel-sub">
                      {terms.isStore ? 'تظهر أعلى المتجر الإلكتروني أمام الزبائن' : 'تظهر أعلى المنيو الإلكتروني أمام الزبائن'}
                    </p>
                  </div>
                </div>

                <div className="mp-set2-grid-2" style={{ gap: '18px' }}>
                  {/* Logo */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>الشعار (Logo)</span>
                      <span style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>مربع 1:1</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '74px',
                          height: '74px',
                          borderRadius: '50%',
                          border: '2px solid var(--line)',
                          background: 'color-mix(in srgb, var(--bg) 52%, transparent)',
                          overflow: 'hidden',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {logoUrlInput ? (
                          <img
                            src={logoUrlInput}
                            alt={terms.isStore ? 'شعار المتجر' : 'شعار المنيو'}
                            referrerPolicy="no-referrer"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <ImageIcon size={22} style={{ color: 'var(--muted)' }} />
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', flex: 1, minWidth: 0 }}>
                        <button
                          type="button"
                          onClick={() => setMediaPickerTarget('logo')}
                          className="btn p s"
                          style={{ width: 'fit-content', fontWeight: 800 }}
                        >
                          <ImageIcon size={14} />
                          <span>مكتبة الصور</span>
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn s"
                            onClick={() => setShowLogoUrlField((v) => !v)}
                            style={{ minHeight: '30px', padding: '4px 9px', fontSize: '11.5px' }}
                          >
                            <Link2 size={12} />
                            <span>{showLogoUrlField ? 'إخفاء الرابط' : 'رابط مباشر'}</span>
                          </button>
                          {logoUrlInput && (
                            <button
                              type="button"
                              onClick={() => setLogoUrlInput('')}
                              style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                color: '#ef4444',
                                borderRadius: '8px',
                                padding: '5px 9px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              إزالة
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {showLogoUrlField && (
                      <input
                        type="text"
                        dir="ltr"
                        value={logoUrlInput}
                        onChange={(e) => setLogoUrlInput(e.target.value)}
                        placeholder="https://example.com/logo.png"
                        style={{ ...themedInputStyle, textAlign: 'left', fontSize: '12.5px' }}
                      />
                    )}
                  </div>

                  {/* Cover Banner */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>الغلاف (Banner)</span>
                      <span style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>عريض 16:9</span>
                    </div>

                    <div
                      style={{
                        width: '100%',
                        height: '92px',
                        borderRadius: '12px',
                        border: '1px solid color-mix(in srgb, var(--line) 70%, transparent)',
                        background: 'color-mix(in srgb, var(--bg) 52%, transparent)',
                        overflow: 'hidden',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      {coverUrlInput ? (
                        <img
                          src={coverUrlInput}
                          alt={terms.isStore ? 'بانر المتجر' : 'بانر المنيو'}
                          referrerPolicy="no-referrer"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: 'var(--muted)' }}>
                          <ImageIcon size={20} />
                          <span style={{ fontSize: '11.5px' }}>لم يتم اختيار صورة غلاف</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setMediaPickerTarget('cover')}
                        className="btn p s"
                        style={{ fontWeight: 800 }}
                      >
                        <ImageIcon size={14} />
                        <span>مكتبة الصور</span>
                      </button>
                      <button
                        type="button"
                        className="btn s"
                        onClick={() => setShowBannerUrlField((v) => !v)}
                        style={{ minHeight: '34px', padding: '5px 10px', fontSize: '11.5px' }}
                      >
                        <Link2 size={12} />
                        <span>{showBannerUrlField ? 'إخفاء الرابط' : 'رابط مباشر'}</span>
                      </button>
                      {coverUrlInput && (
                        <button
                          type="button"
                          onClick={() => setCoverUrlInput('')}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#ef4444',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          إزالة
                        </button>
                      )}
                    </div>

                    {showBannerUrlField && (
                      <input
                        type="text"
                        dir="ltr"
                        value={coverUrlInput}
                        onChange={(e) => setCoverUrlInput(e.target.value)}
                        placeholder="https://example.com/banner.jpg"
                        style={{ ...themedInputStyle, textAlign: 'left', fontSize: '12.5px' }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Theme Appearance Modes */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">
                    {restProjectType === 'store' ? 'مظهر لوحة التحكم' : 'مظهر العرض للزبون واللوحة'}
                  </h2>
                </div>

                <div className="mp-set2-list">
                  {/* Menu Theme Mode (Restaurants only — Store uses unified white/navy/orange storefront theme) */}
                  {restProjectType !== 'store' && (
                    <div className="mp-set2-row">
                      <div className="mp-set2-row-meta">
                        <div className="mp-set2-mini-ico">
                          {menuThemeMode === 'light' ? (
                            <Sun size={16} />
                          ) : menuThemeMode === 'auto' ? (
                            <Monitor size={16} />
                          ) : (
                            <Moon size={16} />
                          )}
                        </div>
                        <div>
                          <div className="mp-set2-row-label">مظهر المنيو</div>
                          <div className="mp-set2-row-desc">فاتح أو غامق للزبون</div>
                        </div>
                      </div>

                      <div className="mp-theme-icon-switch" role="group" aria-label="مظهر المنيو">
                        <button
                          type="button"
                          onClick={() => handleSelectThemeMode('light')}
                          className={`mp-theme-icon-btn${menuThemeMode === 'light' ? ' is-active' : ''}`}
                          aria-label="الوضع الفاتح"
                          title="فاتح"
                        >
                          <Sun size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectThemeMode('dark')}
                          className={`mp-theme-icon-btn${menuThemeMode === 'dark' ? ' is-active' : ''}`}
                          aria-label="الوضع الغامق"
                          title="غامق"
                        >
                          <Moon size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectThemeMode('auto')}
                          className={`mp-theme-icon-btn${menuThemeMode === 'auto' ? ' is-active' : ''}`}
                          aria-label="تلقائي حسب جهاز الزبون"
                          title="تلقائي"
                        >
                          <Monitor size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Dashboard Theme Mode */}
                  <div className="mp-set2-row">
                    <div className="mp-set2-row-meta">
                      <div className="mp-set2-mini-ico">
                        {dashboardThemeMode === 'light' ? (
                          <Sun size={16} />
                        ) : dashboardThemeMode === 'auto' ? (
                          <Monitor size={16} />
                        ) : (
                          <Moon size={16} />
                        )}
                      </div>
                      <div>
                        <div className="mp-set2-row-label">مظهر اللوحة</div>
                        <div className="mp-set2-row-desc">مظهر لوحة التحكم</div>
                      </div>
                    </div>

                    <div className="mp-theme-icon-switch" role="group" aria-label="مظهر لوحة التحكم">
                      <button
                        type="button"
                        onClick={() => void handleSelectDashboardThemeMode('light')}
                        className={`mp-theme-icon-btn${dashboardThemeMode === 'light' ? ' is-active' : ''}`}
                        aria-label="الوضع الفاتح"
                        title="فاتح"
                      >
                        <Sun size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSelectDashboardThemeMode('dark')}
                        className={`mp-theme-icon-btn${dashboardThemeMode === 'dark' ? ' is-active' : ''}`}
                        aria-label="الوضع الداكن"
                        title="داكن"
                      >
                        <Moon size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSelectDashboardThemeMode('auto')}
                        className={`mp-theme-icon-btn${dashboardThemeMode === 'auto' ? ' is-active' : ''}`}
                        aria-label="تلقائي حسب جهازك"
                        title="تلقائي"
                      >
                        <Monitor size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 3. التبويب الثالث: الروابط (رابط المنيو المخصص، التواصل والموقع والخرائط، حسابات التواصل الاجتماعي) */}
          {sectionTab === 'links' && (
            <motion.div
              key="tab-links"
              {...dashSubTabMotion(prefersReducedMotion)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Custom Link / Subdomain */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <div>
                    <h2 className="mp-set2-panel-title">
                      <Globe size={16} style={{ color: 'var(--brand-ink, #34D399)' }} />
                      <span>
                        {subdomainEnabled
                          ? 'الدومين الفرعي والرابط المخصص'
                          : terms.isStore
                          ? 'رابط المتجر المخصص'
                          : 'رابط المنيو المخصص'}
                      </span>
                    </h2>
                    <p className="mp-set2-panel-sub">
                      {!resolvedPlan.perms.customSlug
                        ? terms.isStore
                          ? 'رابط متجر مشروعك الحالي بالكود التلقائي'
                          : 'رابط منيو مشروعك الحالي بالكود التلقائي'
                        : `اختر اسماً إنجليزياً فريداً لمشروعك (${baseDomain}/user)`}
                    </p>
                  </div>
                </div>

                {!resolvedPlan.perms.customSlug ? (
                  <>
                    {renderLinkActionButtons(liveMenuUrl)}

                    <div className="mp-set2-alert warn">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 220px' }}>
                        <Lock size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--ink)' }}>
                            تخصيص الرابط باسم مشروعك متاح في الباقات المدفوعة
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
                            قم بالترقية إلى الباقة الاقتصادية أو أعلى لتفعيل رابط مخصص.
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openUpgradeModal('starter')}
                        className="btn p s"
                        style={{ fontWeight: 800 }}
                      >
                        ترقية الباقة
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      dir="ltr"
                      className={`mp-set2-slug-box ${
                        isSlugValid ? 'is-valid' : isSlugInvalid ? 'is-invalid' : ''
                      }`}
                    >
                      {!subdomainEnabled && (
                        <span
                          style={{
                            padding: '0 10px',
                            fontSize: '12px',
                            fontWeight: 800,
                            color: 'var(--brand-ink, #34D399)',
                            borderInlineEnd: '1px solid var(--line)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          https://{baseDomain}/
                        </span>
                      )}
                      <input
                        type="text"
                        dir="ltr"
                        aria-label={terms.isStore ? 'رابط المتجر المخصص' : 'رابط المنيو المخصص'}
                        value={slugDraft}
                        onChange={(e) => handleSlugTyping(e.target.value)}
                        placeholder={terms.isStore ? 'your-store' : 'your-restaurant'}
                        style={{
                          border: 0,
                          background: 'transparent',
                          outline: 'none',
                          padding: '10px 12px',
                          fontSize: '14px',
                          fontWeight: 700,
                          color: 'var(--ink)',
                          flex: 1,
                          minHeight: '42px',
                          minWidth: 0,
                        }}
                      />
                      {subdomainEnabled && (
                        <span
                          style={{
                            padding: '0 10px',
                            fontSize: '12px',
                            fontWeight: 800,
                            color: 'var(--brand-ink, #34D399)',
                            borderInlineStart: '1px solid var(--line)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          .{baseDomain}
                        </span>
                      )}
                      {hasTypedSlug && (
                        <span className="mp-set2-slug-status" aria-live="polite">
                          {isSlugLoading ? (
                            <Loader2
                              size={16}
                              className="animate-spin"
                              style={{ color: 'var(--brand-ink, #34D399)' }}
                              aria-label="جاري التحقق"
                            />
                          ) : isSlugValid ? (
                            <Check size={17} strokeWidth={2.8} style={{ color: '#10b981' }} aria-label="الرابط متاح وصحيح" />
                          ) : isSlugInvalid ? (
                            <X size={17} strokeWidth={2.8} style={{ color: '#ef4444' }} aria-label="الرابط غير صحيح أو غير متاح" />
                          ) : null}
                        </span>
                      )}
                    </div>

                    {slugFeedbackMessage && (
                      <div
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 800,
                          color: isSlugValid ? '#10b981' : '#ef4444',
                        }}
                      >
                        {slugFeedbackMessage}
                      </div>
                    )}

                    {renderLinkActionButtons(restSlug ? `https://${previewSubdomainHost}` : liveMenuUrl)}
                  </>
                )}
              </div>

              {/* Contact & Location */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">
                    <Phone size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
                    <span>التواصل والموقع والخرائط</span>
                  </h2>
                </div>

                <div className="mp-set2-grid-2">
                  <label className="f" style={{ marginBottom: 0 }}>
                    رقم هاتف الاتصال
                    <input
                      type="tel"
                      dir="ltr"
                      value={restPhone}
                      onChange={(e) => setRestPhone(e.target.value)}
                      placeholder="07701234567"
                      style={{ ...themedInputStyle, textAlign: 'left' }}
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    رقم الواتساب لاستقبال الطلبات{' '}
                    {orderChannel === 'telegram' ? '(اختياري)' : '*'}
                    <input
                      ref={waInputRef}
                      type="tel"
                      dir="ltr"
                      value={restWa}
                      onChange={(e) => setRestWa(e.target.value)}
                      placeholder="07711448594"
                      style={{ ...themedInputStyle, textAlign: 'left' }}
                      required={orderChannel !== 'telegram'}
                    />
                  </label>
                </div>

                <label className="f" style={{ marginBottom: 0 }}>
                  عنوان ومقر المشروع بالتفصيل
                  <input
                    type="text"
                    value={restAddress}
                    onChange={(e) => setRestAddress(e.target.value)}
                    placeholder="بغداد، الكرادة..."
                    style={themedInputStyle}
                  />
                </label>

                <div className="mp-set2-grid-2">
                  <label className="f" style={{ marginBottom: 0 }}>
                    رابط الموقع على خرائط جوجل
                    <input
                      type="text"
                      dir="ltr"
                      value={restMapUrl}
                      onChange={(e) => setRestMapUrl(e.target.value)}
                      placeholder="https://maps.google.com/?q=..."
                      style={{ ...themedInputStyle, textAlign: 'left' }}
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    رابط تقييمات Google Maps (اختياري)
                    <input
                      type="text"
                      dir="ltr"
                      value={restGoogleReviewUrl}
                      onChange={(e) => setRestGoogleReviewUrl(e.target.value)}
                      placeholder="https://g.page/r/..."
                      style={{ ...themedInputStyle, textAlign: 'left' }}
                    />
                  </label>
                </div>
              </div>

              {/* Social Media */}
              <div className="mp-set2-panel">
                <div className="mp-set2-panel-head">
                  <h2 className="mp-set2-panel-title">حسابات التواصل الاجتماعي</h2>
                </div>

                <div className="mp-set2-grid-3">
                  <label className="f" style={{ marginBottom: 0 }}>
                    انستقرام (Instagram)
                    <input
                      type="text"
                      dir="ltr"
                      value={restInstagram}
                      onChange={(e) => setRestInstagram(e.target.value)}
                      placeholder="https://instagram.com/..."
                      style={{ ...themedInputStyle, textAlign: 'left' }}
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    فيسبوك (Facebook)
                    <input
                      type="text"
                      dir="ltr"
                      value={restFacebook}
                      onChange={(e) => setRestFacebook(e.target.value)}
                      placeholder="https://facebook.com/..."
                      style={{ ...themedInputStyle, textAlign: 'left' }}
                    />
                  </label>

                  <label className="f" style={{ marginBottom: 0 }}>
                    تيك توك (TikTok)
                    <input
                      type="text"
                      dir="ltr"
                      value={restTiktok}
                      onChange={(e) => setRestTiktok(e.target.value)}
                      placeholder="https://tiktok.com/@..."
                      style={{ ...themedInputStyle, textAlign: 'left' }}
                    />
                  </label>
                </div>
              </div>
            </motion.div>
          )}

          {/* 4. التبويب الرابع: تيليجرام (قسم تيليجرام الكامل مدمج داخل الإعدادات) */}
          {sectionTab === 'telegram' && (
            <motion.div
              key="tab-telegram"
              {...dashSubTabMotion(prefersReducedMotion)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <TelegramPage
                embedded
                onOpenOrderChannelSettings={() => setSectionTab('ops')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      <MediaLibraryModal
        isOpen={mediaPickerTarget !== null}
        items={mediaLibraryItems}
        currentUrl={mediaPickerTarget === 'logo' ? logoUrlInput : coverUrlInput}
        onSelect={(url) => {
          if (mediaPickerTarget === 'logo') {
            setLogoUrlInput(url);
          } else if (mediaPickerTarget === 'cover') {
            setCoverUrlInput(url);
          }
        }}
        onUploadFiles={uploadImagesToLibrary}
        onDeleteItem={(mediaId) => {
          const target = mediaLibraryItems.find((m) => m.id === mediaId);
          if (target) {
            if (target.url === logoUrlInput) setLogoUrlInput('');
            if (target.url === coverUrlInput) setCoverUrlInput('');
          }
          removeMediaLibraryItem(mediaId);
        }}
        onClose={() => setMediaPickerTarget(null)}
      />
    </div>
  );
};
