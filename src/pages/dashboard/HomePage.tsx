/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  CheckCircle2,
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import { fetchDashboardTelegramStatusApi } from '../../utils/adminApi';
import { DEFAULT_MEDIA_ASSETS } from '../../utils/businessDefaults';
import { Ml7Text } from '../../components/Ml7Text';
import { dashRowMotion, dashSectionMotion } from '../../utils/dashboardMotion';
import { SettingsSectionTab, useDashboard } from './DashboardContext';

export const HomePage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const {
    rest,
    resolvedPlan,
    terms,
    allCategories,
    allItems,
    setActiveTab,
    openSettingsSection,
    handleSeedStoreCatalog,
    activeRid,
    mainRid,
  } = useDashboard();

  const defaultMedia =
    terms.isStore ? DEFAULT_MEDIA_ASSETS.store : DEFAULT_MEDIA_ASSETS.restaurant;
  const hasCustomLogo = Boolean(rest.logo && rest.logo !== defaultMedia.logo);
  const hasCustomBanner = Boolean(rest.coverImages?.[0] && rest.coverImages[0] !== defaultMedia.banner);
  const hasRichBio = Boolean(rest.aboutText && rest.aboutText.trim().length >= 35);
  const hasSocialLinks = Boolean(
    rest.social?.instagram || rest.social?.tiktok || rest.social?.facebook || rest.mapUrl
  );
  const hasCustomSlugConfigured = Boolean(rest.slug || rest.subdomain);
  const itemsWithPhotoCount = allItems.filter((item) => Boolean(item.img && item.img.trim())).length;
  const hasItemsPhotos = allItems.length >= 3 && itemsWithPhotoCount >= Math.min(allItems.length, 3);
  const hasWhatsappConfigured = Boolean(
    (rest.ph && rest.ph.trim().length >= 8) ||
      (rest.social?.whatsapp && rest.social.whatsapp.trim().length >= 8)
  );
  const hasWorkHoursConfigured = Boolean(rest.weeklyHours && Object.keys(rest.weeklyHours).length > 0);
  const hasDeliveryZonesConfigured = Boolean(
    Array.isArray(rest.deliveryZones) && rest.deliveryZones.length > 0
  );
  const targetTelegramRid = activeRid || mainRid || rest.id;
  const [serverTelegramLinked, setServerTelegramLinked] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    if (!targetTelegramRid) return;
    void fetchDashboardTelegramStatusApi(targetTelegramRid)
      .then((res) => {
        if (active && typeof res?.linked === 'boolean') {
          setServerTelegramLinked(res.linked);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [targetTelegramRid, rest.telegramPhone, rest.telegramUnlinkedManually]);

  const hasTelegramConnected = Boolean(
    serverTelegramLinked ||
      rest.telegramLinked ||
      (rest.telegramChatId && String(rest.telegramChatId).trim()) ||
      (rest.telegramPhone && String(rest.telegramPhone).trim() && rest.telegramUnlinkedManually !== true)
  );
  const hasMapLocation = Boolean(rest.mapUrl && rest.mapUrl.trim());

  interface MenuTip {
    id: string;
    done: boolean;
    label: string;
    targetTab: 'cats' | 'menu' | 'set' | 'qr' | 'appearance';
    settingsSection?: SettingsSectionTab;
  }

  const dynamicTips: MenuTip[] = [
    {
      id: 'cats',
      done: allCategories.length >= 3,
      label:
        allCategories.length >= 3
          ? `الأقسام منظمة (${allCategories.length} أقسام)`
          : `أضف 3 أقسام على الأقل (${allCategories.length}/3)`,
      targetTab: 'cats',
    },
    {
      id: 'items',
      done: allItems.length >= 6,
      label:
        allItems.length >= 6
          ? `${terms.itemsPlural} مكتملة (${allItems.length})`
          : `أضف 6 ${terms.itemsPlural} على الأقل (${allItems.length}/6)`,
      targetTab: 'menu',
    },
    {
      id: 'itemImages',
      done: hasItemsPhotos,
      label: hasItemsPhotos
        ? terms.isStore
          ? 'تمت إضافة صور واضحة للمنتجات'
          : 'تمت إضافة صور واضحة للأصناف'
        : terms.isStore
        ? `أضف صوراً للمنتجات (${Math.min(itemsWithPhotoCount, 3)}/3)`
        : `أضف صوراً للأصناف (${Math.min(itemsWithPhotoCount, 3)}/3)`,
      targetTab: 'menu',
    },
    {
      id: 'whatsapp',
      done: hasWhatsappConfigured,
      label: hasWhatsappConfigured
        ? 'رقم الواتساب لاستقبال الطلبات مفعّل'
        : 'إضافة رقم واتساب لاستقبال الطلبات',
      targetTab: 'set',
      settingsSection: 'links',
    },
    {
      id: 'media',
      done: hasCustomLogo && hasCustomBanner,
      label:
        hasCustomLogo && hasCustomBanner
          ? 'تم رفع الشعار والغلاف'
          : 'رفع الشعار وصورة الغلاف',
      targetTab: 'set',
      settingsSection: 'identity',
    },
    {
      id: 'hours',
      done: hasWorkHoursConfigured,
      label: hasWorkHoursConfigured
        ? 'أوقات وساعات الدوام مضبوطة'
        : 'ضبط أوقات وساعات الدوام',
      targetTab: 'set',
      settingsSection: 'ops',
    },
    ...(rest.enabledOrderTypes?.delivery !== false
      ? [
          {
            id: 'deliveryZones',
            done: hasDeliveryZonesConfigured,
            label: hasDeliveryZonesConfigured
              ? 'مناطق وأسعار التوصيل محددة'
              : 'تحديد مناطق وأسعار التوصيل',
            targetTab: 'set' as const,
            settingsSection: 'ops' as const,
          },
        ]
      : []),
    {
      id: 'telegram',
      done: hasTelegramConnected,
      label: hasTelegramConnected
        ? terms.isStore
          ? 'إشعارات بوت تيليجرام لطلبات المتجر مفعّلة'
          : 'إشعارات بوت تيليجرام مفعّلة'
        : terms.isStore
        ? 'ربط بوت تيليجرام لتنبيهات طلبات المتجر'
        : 'ربط بوت تيليجرام لتنبيهات الطلبات',
      targetTab: 'set',
      settingsSection: 'telegram',
    },
    {
      id: 'mapLocation',
      done: hasMapLocation,
      label: hasMapLocation
        ? 'تم تحديد الموقع على الخريطة'
        : 'إضافة رابط الموقع على الخريطة',
      targetTab: 'set',
      settingsSection: 'links',
    },
    {
      id: 'bio',
      done: hasRichBio && hasSocialLinks,
      label:
        hasRichBio && hasSocialLinks
          ? 'النبذة والروابط مكتملة'
          : 'إكمال النبذة وروابط التواصل',
      targetTab: 'set',
      settingsSection: 'identity',
    },
  ];

  if (resolvedPlan.perms.customSlug) {
    dynamicTips.push({
      id: 'slug',
      done: hasCustomSlugConfigured,
      label: hasCustomSlugConfigured
        ? terms.isStore
          ? 'رابط المتجر المخصص مفعّل'
          : 'الرابط الفرعي المخصص مفعّل'
        : terms.isStore
        ? 'حجز رابط المتجر المخصص'
        : 'حجز الرابط الفرعي المخصص',
      targetTab: 'set',
      settingsSection: 'links',
    });
  }

  const orderedTips: MenuTip[] = [
    ...dynamicTips.filter((tip) => !tip.done),
    ...dynamicTips.filter((tip) => tip.done),
  ];

  const completedTipsCount = dynamicTips.filter((x) => x.done).length;
  const readinessPercent = Math.round((completedTipsCount / dynamicTips.length) * 100);
  const allTipsCompleted = completedTipsCount >= dynamicTips.length;

  const activePlanName = resolvedPlan.plan.n;

  return (
    <div className="mp-home-wrap">
      {/* Floating Welcome Header (transparent to main grid background) */}
      <div className="mp-home-welcome">
        <img
          src={rest.logo}
          alt={rest.n}
          referrerPolicy="no-referrer"
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            objectFit: 'cover',
            border: '2px solid var(--brand)',
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          {activeRid !== mainRid && (
            <div style={{ fontSize: '12px', color: 'var(--brand-ink, #34D399)', fontWeight: 800, marginBottom: '2px' }}>
              {`إدارة فرع: ${rest.branchName || rest.n}`}
            </div>
          )}
          <h1 style={{ margin: '0 0 4px', fontSize: 'clamp(19px, 3vw, 24px)', fontWeight: 900, color: 'var(--ink)' }}>
            {rest.n}
          </h1>
          <div className="mp-home-welcome-meta">
            <span>
              الباقة النشطة: <b style={{ color: 'var(--brand-ink, #34D399)' }}>{activePlanName}</b>
            </span>
          </div>
        </div>
      </div>

      {/* Checklist Section: hidden once all steps are completed */}
      {!allTipsCompleted && (
        <section className="mp-home-section">
          <div className="mp-home-section-head">
            <span
              className="mp-home-section-badge"
              style={{
                background: 'rgba(245, 158, 11, 0.14)',
                color: '#f59e0b',
              }}
            >
              <Lightbulb size={15} />
              <span>{`نسبة الاكتمال: ${readinessPercent}%`}</span>
            </span>

            <h2 className="mp-home-section-title">
              <Ml7Text
                text={terms.isStore ? 'خطوات استكمال جاهزية المتجر 🛍️' : 'خطوات استكمال جاهزية المنيو 💡'}
                mode="mount"
                delay={0.12}
                stagger={0.18}
                duration={2.25}
                isRtl
              />
            </h2>

            <motion.p
              className="mp-home-section-sub"
              {...dashSectionMotion(prefersReducedMotion, 0.38)}
            >
              {terms.isStore
                ? 'أكمل الخطوات التالية ليكون متجرك جاهزاً لاستقبال الطلبات بأفضل شكل:'
                : 'أكمل الخطوات التالية ليكون منيوك جاهزاً لاستقبال الطلبات بأفضل شكل:'}
            </motion.p>

            {terms.isStore && allItems.length === 0 && (
              <div style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn p s"
                  onClick={() => handleSeedStoreCatalog('append_missing')}
                  style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Sparkles size={15} />
                  <span>إضافة أقسام ومنتجات المتجر الافتراضية</span>
                </button>
              </div>
            )}
          </div>

          <div className="mp-home-tips-box" dir="rtl">
            <div className="mp-home-tips-list">
              {orderedTips.map((tip, idx) => (
                <motion.button
                  key={tip.id}
                  type="button"
                  onClick={() => {
                    if (tip.targetTab === 'set' && tip.settingsSection) {
                      openSettingsSection(tip.settingsSection);
                    } else {
                      setActiveTab(tip.targetTab);
                    }
                  }}
                  className={`btn s mp-home-tip-btn ${tip.done ? 'is-done' : ''}`}
                  dir="rtl"
                  {...dashRowMotion(prefersReducedMotion, idx, true)}
                >
                  <span className="mp-home-tip-icon" aria-hidden="true">
                    {tip.done ? (
                      <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                    ) : (
                      <Sparkles size={18} style={{ color: '#f59e0b' }} />
                    )}
                  </span>

                  <span className="mp-home-tip-label">{tip.label}</span>

                  {!tip.done && (
                    <ArrowUpRight size={15} className="mp-home-tip-arrow" aria-hidden="true" />
                  )}
                </motion.button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
