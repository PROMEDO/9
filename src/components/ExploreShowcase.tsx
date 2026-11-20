/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Compass, Maximize2, X } from 'lucide-react';
import { SupportedLanguage } from '../types';
import { trByLang } from '../utils/i18n';
import { Ml7Text } from './Ml7Text';

interface ExploreSlide {
  id: string;
  image: string;
  tabLabel: { ar: string; ku: string; en: string };
  title: { ar: string; ku: string; en: string };
  description: { ar: string; ku: string; en: string };
}

const EXPLORE_SLIDES: ExploreSlide[] = [
  {
    id: 'overview',
    image: '/assets/aistudio/Screenshot_2026-11-19-12-30-54-905_com.android.chrome_f70b66cb.jpg',
    tabLabel: { ar: 'لوحة المتابعة', ku: 'داشبۆردی سەرەکی', en: 'Overview' },
    title: {
      ar: 'لوحة رئيسية تجمع المبيعات والزيارات وجاهزية المنيو',
      ku: 'پەڕەی سەرەکی بۆ بینینی فرۆش و سەردانەکان',
      en: 'Real-Time Store Pulse & Menu Readiness',
    },
    description: {
      ar: 'تابع زيارات القائمة، صافي الطلبات والمبيعات لحظة بلحظة من شاشة واحدة واضحة.',
      ku: 'چاودێری سەردانەکانی مینیۆ و فرۆش و داواکارییەکان بکە لە یەک شاشەدا.',
      en: 'Track menu visits, completed orders, and total sales at a glance from one screen.',
    },
  },
  {
    id: 'navigation',
    image: '/assets/aistudio/Screenshot_2026-11-19-12-31-00-516_com.android.chrome_98867230.jpg',
    tabLabel: { ar: 'التنقل السريع', ku: 'گەڕانی خێرا', en: 'Quick Menu' },
    title: {
      ar: 'قائمة تحكم تجمع كل أدوات مشروعك في متناول يدك',
      ku: 'لیستی کۆنترۆڵی خێرا بۆ هەموو بەشەکان',
      en: 'All Store Tools Organized in One Drawer',
    },
    description: {
      ar: 'تجوّل بسلاسة بين الأقسام، الأصناف، الطلبات الحية، المظهر، الأفرع وكود الـ QR.',
      ku: 'بە ئاسانی هاتوچۆ بکە لە نێوان بەشەکان، خواردنەکان، داواکارییەکان، ڕووکار و کۆدی QR.',
      en: 'Jump effortlessly between categories, dishes, live orders, branches, and QR codes.',
    },
  },
  {
    id: 'categories',
    image: '/assets/aistudio/Screenshot_2026-11-19-12-31-12-701_com.android.chrome_c6865f5c.jpg',
    tabLabel: { ar: 'الأقسام', ku: 'بەشەکان', en: 'Categories' },
    title: {
      ar: 'رتّب أقسام المنيو بالسحب والإفلات وجدولها حسب الوقت',
      ku: 'ڕێکخستنی بەشەکان و کاتی دەرکەوتنیان',
      en: 'Drag-and-Drop Categories & Scheduling',
    },
    description: {
      ar: 'تحكّم بترتيب الأقسام مع زر إخفاء وإظهار فوري وجدولة أوقات الظهور تلقائياً.',
      ku: 'دەستکاری بەشەکان بکە بە ڕاکێشان لەگەڵ شاردنەوەی خێرا و دیاریکردنی کاتی کارکردن.',
      en: 'Reorder categories by dragging, toggle visibility instantly, and set active hours.',
    },
  },
  {
    id: 'items',
    image: '/assets/aistudio/Screenshot_2026-11-19-12-31-23-072_com.android.chrome_f8f07cdf.jpg',
    tabLabel: { ar: 'الأصناف والأطباق', ku: 'خواردن و کاڵاکان', en: 'Items & Pricing' },
    title: {
      ar: 'أضف أطباقك وحدّث الأسعار والأحجام خلال ثوانٍ',
      ku: 'زیادکردن و نوێکردنەوەی نرخ و وێنەی خواردنەکان',
      en: 'Manage Dishes, Variants & Quick Pricing',
    },
    description: {
      ar: 'صفّ منتجاتك حسب القسم وعدّل السعر أو الأحجام وتوفر الصنف بضغطة زر.',
      ku: 'بە خێرایی بگەڕێ، نرخەکان دەستکاری بکە و قەبارە و زیادکراوەکان دابنێ.',
      en: 'Filter dishes by category, update prices inline, and toggle stock availability.',
    },
  },
  {
    id: 'appearance',
    image: '/assets/aistudio/Screenshot_2026-11-19-12-31-29-890_com.android.chrome_90f2edee.jpg',
    tabLabel: { ar: 'المظهر والألوان', ku: 'ڕووکار و ڕەنگەکان', en: 'Appearance' },
    title: {
      ar: 'تحكم بمظهر المنيو، شبكة العرض، ولوحة الألوان الفورية',
      ku: 'هەڵبژاردنی شێوازی پیشاندان و ڕەنگەکانی مینیۆ',
      en: 'Light/Dark Mode, Grid Layouts & Palettes',
    },
    description: {
      ar: 'اختر الوضع الفاتح أو الغامق مع 4 طرق لعرض المنتجات وثيمات ألوان متناسقة.',
      ku: 'دۆخی ڕووناک یان تاریک هەڵبژێرە لەگەڵ ٤ شێوازی پیشاندان و ڕەنگی ئامادە.',
      en: 'Switch appearance modes, choose from 4 product grids, and apply tailored palettes.',
    },
  },
  {
    id: 'shapes',
    image: '/assets/aistudio/Screenshot_2026-11-19-12-31-39-751_com.android.chrome_ae28333a.jpg',
    tabLabel: { ar: 'الأشكال والبطاقات', ku: 'شێوەی کارتەکان', en: 'Card Styles' },
    title: {
      ar: 'أكثر من 10 أنماط للبطاقات والأشكال الموسمية بلمسة واحدة',
      ku: 'زیاتر لە ١٠ شێوازی کارت و دیزاینی وەرزی',
      en: '10+ Card Shapes & Seasonal Themes',
    },
    description: {
      ar: 'بدّل شكل متجرك بالكامل بين الزجاجي، العصري، الهندسي والدائري مع تطبيق فوري.',
      ku: 'شێوازی هەموو پەڕەکە بگۆڕە لە نێوان شووشەیی، مۆدێرن و چەندانی تر.',
      en: 'Switch storefront card silhouettes between frosted, modern, sharp, or rounded.',
    },
  },
  {
    id: 'addons',
    image: '/assets/aistudio/Screenshot_2026-11-19-12-31-47-755_com.android.chrome_58d41830.jpg',
    tabLabel: { ar: 'متجر الإضافات', ku: 'زیادکراوە زیرەکەکان', en: 'Smart Add-ons' },
    title: {
      ar: 'مكتبة تضم 50 إضافة ذكية لتحفيز الطلب ورفع قيمة السلة',
      ku: '٥٠ زیادکراوی زیرەک بۆ بەرزکردنەوەی فرۆش و سەبەتە',
      en: '50+ Marketing & Conversion Add-ons',
    },
    description: {
      ar: 'فعّل البوب اب الترحيبي، كوبونات الخصم، شريط التوصيل المجاني والمؤقت التنازلي فوراً.',
      ku: 'پۆپئەپی پێشوازی، کۆدی داشکاندن، گەیاندنی بێبەرامبەر و کاتی دیاریکراو چالاک بکە.',
      en: 'Enable offer popups, discount coupons, free-delivery bars, and timers in one tap.',
    },
  },
];

interface ExploreShowcaseProps {
  lang: SupportedLanguage;
  homeTheme: 'light' | 'dark';
}

export const ExploreShowcase: React.FC<ExploreShowcaseProps> = ({ lang, homeTheme }) => {
  const isRtl = lang === 'ar' || lang === 'ku';
  const prefersReducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const tr = useCallback(
    (ar: string, ku: string, en: string) => trByLang(lang, ar, ku, en),
    [lang]
  );

  const activeSlide = EXPLORE_SLIDES[activeIndex];

  useEffect(() => {
    if (!isZoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsZoomed(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isZoomed]);

  const renderScreen = (slide: ExploreSlide, zoomed = false) => {
    const failed = Boolean(failedImages[slide.id]);
    if (failed) {
      return (
        <div
          style={{
            width: '100%',
            aspectRatio: '1240 / 2480',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '24px',
            textAlign: 'center',
            color: '#94A3B8',
            background: '#0f1419',
            borderRadius: '24px',
          }}
        >
          <Compass size={26} style={{ color: '#34D399' }} />
          <strong style={{ color: '#F8FAFC', fontSize: '14px' }}>{slide.tabLabel[lang]}</strong>
        </div>
      );
    }

    return (
      <div className={`mp-explore-crop${zoomed ? ' is-zoomed' : ''}`}>
        <img
          src={slide.image}
          alt={slide.title[lang]}
          referrerPolicy="no-referrer"
          loading={slide.id === activeSlide.id ? 'eager' : 'lazy'}
          draggable={false}
          onError={() => setFailedImages((prev) => ({ ...prev, [slide.id]: true }))}
          className="mp-explore-crop-img"
        />
      </div>
    );
  };

  return (
    <section
      className="s mp-explore-section"
      id="explore"
      aria-labelledby="explore-section-heading"
      style={{
        paddingTop: 'clamp(56px, 7vw, 96px)',
        paddingBottom: 'clamp(64px, 7.5vw, 104px)',
      }}
    >
      <div className="w">
        {/* Clean Editorial Heading */}
        <div style={{ textAlign: 'center', maxWidth: '580px', margin: '0 auto clamp(28px, 4vw, 44px)' }}>
          <h2
            id="explore-section-heading"
            style={{
              fontFamily: 'var(--font-heading, var(--font))',
              fontSize: 'calc(clamp(22px, 3.6vw, 34px) * var(--font-scale, 1))',
              fontWeight: 'var(--font-heading-weight, 800)' as any,
              lineHeight: 'var(--font-heading-lh, 1.3)',
              marginBottom: '10px',
              color: 'var(--ink)',
              textWrap: 'balance',
            }}
          >
            <Ml7Text
              text={tr(
                'استكشف لوحة التحكم من الداخل',
                'ناوەوەی پەڕەی کۆنترۆڵ ببینە',
                'Explore the Dashboard Inside'
              )}
              mode="inView"
              delay={0.06}
              stagger={0.08}
              isRtl={isRtl}
            />
          </h2>

          <p
            style={{
              fontFamily: 'var(--font-body, var(--font))',
              fontSize: 'var(--font-desc-size, 14.5px)',
              lineHeight: 'var(--font-body-lh, 1.65)',
              margin: '0 auto',
              color: 'var(--muted)',
            }}
          >
            {tr(
              'اختر أي قسم للتعرّف على أدوات إدارة متجرك بوضوح.',
              'هەر بەشێک هەڵبژێرە بۆ بینینی شاشە ڕاستەقینەکان.',
              'Select any screen to inspect the tools built to run your store.'
            )}
          </p>
        </div>

        {/* Mobile Single-Row Scrollable Tabs */}
        <div
          role="tablist"
          aria-label={tr('شاشات لوحة التحكم', 'شاشەکانی کۆنترۆڵ', 'Dashboard screens')}
          className="mp-explore-mobile-tabs"
        >
          {EXPLORE_SLIDES.map((slide, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveIndex(idx)}
                className={`mp-explore-mobile-tab${isActive ? ' is-active' : ''}`}
              >
                <span className="tabular-nums" style={{ opacity: isActive ? 0.9 : 0.55 }}>
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span>{slide.tabLabel[lang]}</span>
              </button>
            );
          })}
        </div>

        {/* Minimal 2-Column Layout: Clean Selector List + Single Screen Preview */}
        <div className="mp-explore-simple-grid">
          {/* Desktop Feature List (hairline dividers, active row expands description) */}
          <div
            className="mp-explore-list"
            role="tablist"
            aria-label={tr('شاشات لوحة التحكم', 'شاشەکانی کۆنترۆڵ', 'Dashboard screens')}
          >
            {EXPLORE_SLIDES.map((slide, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveIndex(idx)}
                  className={`mp-explore-list-item${isActive ? ' is-active' : ''}`}
                >
                  <div className="mp-explore-list-head">
                    <span className="tabular-nums mp-explore-list-num">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="mp-explore-list-title">{slide.tabLabel[lang]}</span>
                  </div>

                  {isActive && (
                    <motion.p
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="mp-explore-list-desc"
                    >
                      {slide.description[lang]}
                    </motion.p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Single Uncluttered Screen Preview */}
          <div className={`mp-explore-preview-col ${homeTheme === 'light' ? 'is-light' : 'is-dark'}`}>
            <div className="mp-explore-phone-wrap">
              <AnimatePresence mode="wait" initial={false}>
                <motion.button
                  key={activeSlide.id}
                  type="button"
                  onClick={() => setIsZoomed(true)}
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: prefersReducedMotion ? 0.12 : 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="mp-explore-phone-btn"
                  aria-label={tr(
                    `تكبير شاشة ${activeSlide.tabLabel.ar}`,
                    `گەورەکردنی شاشەی ${activeSlide.tabLabel.ku}`,
                    `Expand ${activeSlide.tabLabel.en}`
                  )}
                >
                  {renderScreen(activeSlide)}
                  <span className="mp-explore-zoom-hint" aria-hidden="true">
                    <Maximize2 size={14} />
                  </span>
                </motion.button>
              </AnimatePresence>
            </div>

            {/* Mobile Active Caption */}
            <div className="mp-explore-mobile-caption">
              <h3>{activeSlide.title[lang]}</h3>
              <p>{activeSlide.description[lang]}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Simple Lightbox Preview */}
      {isZoomed && (
        <div
          className="ajax-backdrop"
          style={{ zIndex: 10020, padding: '16px', background: 'rgba(6, 10, 14, 0.86)' }}
          onClick={() => setIsZoomed(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '340px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              aria-label={tr('إغلاق المعاينة', 'داخستن', 'Close preview')}
              style={{
                position: 'absolute',
                top: '8px',
                insetInlineEnd: '8px',
                zIndex: 5,
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(15, 20, 25, 0.85)',
                color: '#F8FAFC',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>

            <div
              style={{
                width: '100%',
                background: '#0F1419',
                borderRadius: '28px',
                padding: '6px',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {renderScreen(activeSlide, true)}
            </div>

            <div style={{ textAlign: 'center', color: '#F8FAFC', fontSize: '14px', fontWeight: 700 }}>
              {activeSlide.tabLabel[lang]}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
