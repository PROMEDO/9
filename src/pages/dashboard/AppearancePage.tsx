/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, Eye, Layers, Palette, RotateCcw, Shapes, ShoppingBag, Store } from 'lucide-react';
import {
  MENU_SHAPES,
  MENU_THEMES,
  getAllowedThemesForPlan,
  getContrastInk,
  resolveMenuThemeEffectiveMode,
} from '../../utils/plans';
import { dashCardMotion, dashSectionMotion } from '../../utils/dashboardMotion';
import { useDashboard } from './DashboardContext';

export const AppearancePage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const {
    layoutDefinitions,
    resolvedPlan,
    isLayoutAllowed,
    selectedLayout,
    menuThemeMode,
    handleSelectThemeMode,
    menuThemePreset,
    handleSelectMenuTheme,
    handleUpdateCustomColors,
    menuThemeShape,
    handleSelectThemeShape,
    restColor,
    restBgColor,
    handleInstantLayoutSelect,
    openUpgradeModal,
    restProjectType,
    terms,
    setActiveTab,
    openSettingsSection,
    onNavigate,
    publicPath,
    restName,
    allCategories,
    allItems,
  } = useDashboard();

  const isStore = terms.isStore || restProjectType === 'store';

  if (isStore) {
    return (
      <div className="mp-appearance-page">
        <motion.section
          className="mp-appearance-section mp-estore-appearance-card"
          {...dashSectionMotion(prefersReducedMotion, 0)}
        >
          <div className="mp-estore-appearance-head">
            <div className="mp-estore-appearance-badge">
              <CheckCircle2 size={15} />
              <span>المظهر الأساسي المفعّل لمتجرك</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(publicPath)}
              className="btn p s"
              style={{ fontWeight: 800, gap: '6px' }}
            >
              <Eye size={15} />
              <span>معاينة المتجر مباشرة</span>
            </button>
          </div>

          <div className="mp-estore-appearance-hero">
            <div className="mp-estore-appearance-copy">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span className="mp-estore-appearance-ico">
                  <Store size={18} />
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--brand-ink, #e2e8f0)' }}>
                  مظهر المتجر الإلكتروني الموحد
                </span>
              </div>
              <h2 className="mp-appearance-section-title" style={{ marginBottom: '8px', fontSize: '20px' }}>
                واجهة متجر احترافية موحّدة لـ {restName || 'متجرك'}
              </h2>
              <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7 }}>
                تم تفعيل تصميم المتجر العصري باللونين الأبيض والفحمي تلقائياً لمتجرك: هيدر احترافي بقائمة منسدلة للأقسام، سلايدر عرض رئيسي، صفحات متكاملة (الرئيسية، كل المنتجات، الكولكشنات، الأكثر مبيعاً، وصلنا حديثاً، التخفيضات، المفضلات، من نحن، سياساتنا)، بطاقات عرض ألبومية أنيقة مع حفظ المفضلات والسلة الذكية.
              </p>

              <div className="mp-estore-swatches" aria-label="لوحة ألوان المتجر">
                <span className="mp-estore-swatch">
                  <i style={{ background: '#222222' }} />
                  <span>أسود فحمي أنيق</span>
                </span>
                <span className="mp-estore-swatch">
                  <i style={{ background: '#242424' }} />
                  <span>شريط الإعلانات الداكن</span>
                </span>
                <span className="mp-estore-swatch">
                  <i style={{ background: '#ffffff', border: '1px solid #cbd5e1' }} />
                  <span>خلفية بيضاء نقية</span>
                </span>
                <span className="mp-estore-swatch">
                  <i style={{ background: '#f8f8f8', border: '1px solid #cbd5e1' }} />
                  <span>أسطح العرض</span>
                </span>
              </div>
            </div>

            {/* Live Visual Mini-Mockup matching estore layout */}
            <div className="mp-estore-preview-frame" aria-hidden="true">
              <div className="mp-estore-preview-nav">
                <span className="mp-estore-preview-logo" />
                <span className="mp-estore-preview-search">
                  <i />
                </span>
                <span className="mp-estore-preview-cart" />
              </div>
              <div className="mp-estore-preview-cats">
                <span className="is-active" />
                <span />
                <span />
                <span />
              </div>
              <div className="mp-estore-preview-banner">
                <div>
                  <span className="line-lg" />
                  <span className="line-sm" />
                </div>
                <span className="cta-dot" />
              </div>
              <div className="mp-estore-preview-grid">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className="mp-estore-preview-card">
                    <div className="thumb">
                      {idx === 0 && <span className="disc">-20%</span>}
                    </div>
                    <div className="meta">
                      <span className="t1" />
                      <div className="bottom">
                        <span className="price" />
                        <span className="btn-sq" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mp-estore-quick-actions">
            <button
              type="button"
              onClick={() => setActiveTab('cats')}
              className="mp-estore-quick-btn"
            >
              <Layers size={18} />
              <div>
                <b>إدارة أقسام المتجر ({allCategories.length})</b>
                <span>إضافة وتعديل وترتيب الأقسام وصورها</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('menu')}
              className="mp-estore-quick-btn"
            >
              <ShoppingBag size={18} />
              <div>
                <b>إدارة المنتجات والأسعار ({allItems.length})</b>
                <span>إضافة منتجات، صور، خصومات وخيارات</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openSettingsSection('identity')}
              className="mp-estore-quick-btn"
            >
              <Store size={18} />
              <div>
                <b>هوية المتجر والشعار والغلاف</b>
                <span>تحديث الاسم والوصف والبنر الرئيسي</span>
              </div>
            </button>
          </div>
        </motion.section>
      </div>
    );
  }

  const allowedThemes = getAllowedThemesForPlan(resolvedPlan);
  const previewMode = resolveMenuThemeEffectiveMode(menuThemeMode);
  const isCustomSelected = menuThemePreset === 'custom' && resolvedPlan.perms.customColors;
  const customBrandHex = restColor || '#10B981';
  const defaultPreviewBg = previewMode === 'dark' ? '#08100d' : '#f4f7f6';
  const customBgPreview = restBgColor || defaultPreviewBg;
  const customBgIsLight = getContrastInk(customBgPreview) === '#0f172a';
  const customSurfacePreview = customBgIsLight ? '#ffffff' : '#131d19';
  const customInkPreview = customBgIsLight ? '#0f172a' : '#f8fafc';
  const customLinePreview = customBgIsLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.16)';

  const sectionRevealProps = dashSectionMotion(prefersReducedMotion, 0, true);

  return (
    <div className="mp-appearance-page">
      {/* 1. Menu Display Mode (Auto-saved immediately) */}
      {resolvedPlan.perms.lightDarkMode && (
        <motion.div
          className="mp-appearance-top-bar"
          {...dashSectionMotion(prefersReducedMotion, 0)}
        >
          <div className="mp-appearance-mode-wrap">
            <h2 className="mp-appearance-section-title">
              اختر مظهر المنيو كيف تريده للزبائن
            </h2>
            <div className="mp-appearance-mode-tabs" role="group" aria-label="وضع المظهر">
              <button
                type="button"
                onClick={() => handleSelectThemeMode('light')}
                className={`mp-appearance-mode-btn ${menuThemeMode === 'light' ? 'active' : ''}`}
              >
                <span>فاتح</span>
                <span className="mp-mode-icon">☀️</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectThemeMode('dark')}
                className={`mp-appearance-mode-btn ${menuThemeMode === 'dark' ? 'active' : ''}`}
              >
                <span>غامق</span>
                <span className="mp-mode-icon">🌙</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectThemeMode('auto')}
                className={`mp-appearance-mode-btn ${menuThemeMode === 'auto' ? 'active' : ''}`}
              >
                <span>حسب الجهاز</span>
                <span className="mp-mode-icon">📱</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* 2. Product Display Layouts */}
      <motion.section
        className="mp-appearance-section"
        {...dashSectionMotion(prefersReducedMotion, 0.12)}
      >
        <h2 className="mp-appearance-section-title" style={{ marginBottom: '12px' }}>
          اختر طريقة عرض المنتجات
        </h2>

        <div className="mp-appearance-layouts-grid">
          {layoutDefinitions.map((lay, idx) => {
            const isSelected = selectedLayout === lay.id;
            const layoutAllowed = isLayoutAllowed(lay.id);
            return (
              <motion.button
                key={lay.id}
                type="button"
                onClick={() => handleInstantLayoutSelect(lay.id)}
                className={`mp-appearance-layout-card ${isSelected ? 'selected' : ''}`}
                style={{ opacity: layoutAllowed ? 1 : 0.65 }}
                {...dashCardMotion(prefersReducedMotion, idx, layoutAllowed ? 1 : 0.65, false, 0.15)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                  <span style={{ fontSize: '24px', lineHeight: 1 }}>{lay.icon}</span>
                  {!layoutAllowed ? (
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 800,
                        color: '#f59e0b',
                        background: 'rgba(245, 158, 11, 0.14)',
                        padding: '2px 7px',
                        borderRadius: '8px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      🔒 باقة أعلى
                    </span>
                  ) : isSelected ? (
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 800,
                        color: 'var(--brand-ink, #34D399)',
                        background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
                        padding: '2px 7px',
                        borderRadius: '8px',
                        border: '1px solid var(--brand)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      مفعّل ✓
                    </span>
                  ) : null}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <b style={{ fontSize: '14px', color: isSelected ? 'var(--brand-ink, #34D399)' : 'var(--ink)', lineHeight: 1.35 }}>
                    {lay.title}
                  </b>
                  <span style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    {lay.desc}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.section>

      {/* 3. Menu Colors */}
      <section className="mp-appearance-section">
        <motion.div
          style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}
          {...dashSectionMotion(prefersReducedMotion, 0.24)}
        >
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'color-mix(in srgb, var(--surface) 40%, transparent)', border: '1px solid var(--line)', color: 'var(--brand-ink, #34D399)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Palette size={18} />
          </div>
          <div>
            <h2 className="mp-appearance-section-title" style={{ margin: '0 0 2px' }}>
              اختر ألوان المنيو
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>
              ثيمات لونية متوافقة تلقائياً مع الوضع الفاتح والغامق والألوان المخصصة
            </p>
          </div>
        </motion.div>

        <div className="mp-appearance-themes-grid">
          {MENU_THEMES.filter((t) => !t.seasonal && !t.storeOnly).map((theme, idx) => {
            const isUnlocked = allowedThemes.some((t) => t.id === theme.id);
            const isSelected = menuThemePreset === theme.id;
            const pal = previewMode === 'dark' ? theme.darkPalette : theme.lightPalette;
            const targetOpacity = isUnlocked ? 1 : 0.62;
            const showWithInitialSection = idx < 2;

            return (
              <motion.button
                key={theme.id}
                type="button"
                onClick={() => handleSelectMenuTheme(theme.id)}
                className={`mp-appearance-theme-card ${isSelected ? 'selected' : ''}`}
                style={{
                  borderColor: isSelected ? pal.brand : undefined,
                  opacity: targetOpacity,
                }}
                {...dashCardMotion(
                  prefersReducedMotion,
                  showWithInitialSection ? idx : idx - 2,
                  targetOpacity,
                  !showWithInitialSection,
                  showWithInitialSection ? 0.32 : 0.06
                )}
              >
                <div
                  className="mp-theme-mini-preview"
                  style={{
                    background: pal.bg,
                    borderColor: pal.line,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div className="mp-theme-mini-card" style={{ background: pal.surface, borderColor: pal.line }}>
                    <span className="mp-theme-mini-line" style={{ background: pal.text, width: '62%' }} />
                    <span className="mp-theme-mini-line" style={{ background: pal.muted, width: '40%', opacity: 0.6 }} />
                  </div>
                  <span className="mp-theme-mini-pill" style={{ background: pal.brand }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: pal.brand, border: '1px solid rgba(255,255,255,0.25)' }} />
                    <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: pal.accent, border: '1px solid rgba(255,255,255,0.2)' }} />
                    <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: pal.bg, border: '1px solid rgba(148,163,184,0.4)' }} />
                  </div>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: isUnlocked ? (isSelected ? 'var(--brand-ink, #34D399)' : 'var(--muted)') : '#f59e0b' }}>
                    {!isUnlocked
                      ? '🔒 مقفل'
                      : isSelected
                      ? 'نشط ✓'
                      : previewMode === 'dark'
                      ? 'غامق 🌙'
                      : 'فاتح ☀️'}
                  </span>
                </div>
                <b style={{ fontSize: '13px', color: 'var(--ink)' }}>{theme.name}</b>
                <span style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.4 }}>{theme.subtitle}</span>
              </motion.button>
            );
          })}

          {/* Wide Custom Menu Colors Card */}
          <motion.div
            role="button"
            tabIndex={0}
            onClick={() => handleSelectMenuTheme('custom')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelectMenuTheme('custom');
              }
            }}
            className={`mp-appearance-theme-card mp-appearance-custom-theme-card ${isCustomSelected ? 'selected' : ''}`}
            style={{
              borderColor: isCustomSelected ? customBrandHex : undefined,
              opacity: resolvedPlan.perms.customColors ? 1 : 0.72,
            }}
            {...dashCardMotion(prefersReducedMotion, 2, resolvedPlan.perms.customColors ? 1 : 0.72, true, 0.14)}
          >
            <div
              className="mp-theme-mini-preview"
              style={{
                background: customBgPreview,
                borderColor: customLinePreview,
              }}
            >
              <div className="mp-theme-mini-card" style={{ background: customSurfacePreview, borderColor: customLinePreview }}>
                <span className="mp-theme-mini-line" style={{ background: customInkPreview, width: '58%' }} />
                <span className="mp-theme-mini-line" style={{ background: customBrandHex, width: '36%', opacity: 0.75 }} />
              </div>
              <span className="mp-theme-mini-pill" style={{ background: customBrandHex }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px', flexWrap: 'wrap' }}>
              <div>
                <b style={{ fontSize: '13.5px', color: 'var(--ink)', display: 'block' }}>
                  ألوان مخصصة لمنيوك 🎨
                </b>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  اختر اللون الأساسي ولون الخلفية بحرية لتناسب هوية مشروعك
                </span>
              </div>
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: resolvedPlan.perms.customColors ? (isCustomSelected ? 'var(--brand-ink, #34D399)' : 'var(--muted)') : '#f59e0b' }}>
                {!resolvedPlan.perms.customColors
                  ? '🔒 باقة أعلى'
                  : isCustomSelected
                  ? 'نشط ✓'
                  : 'تخصيص حر'}
              </span>
            </div>

            <div
              className="mp-custom-color-controls"
              onClick={(e) => {
                e.stopPropagation();
                if (!resolvedPlan.perms.customColors) {
                  openUpgradeModal('vip');
                }
              }}
            >
              <label className="mp-custom-color-chip">
                <input
                  type="color"
                  disabled={!resolvedPlan.perms.customColors}
                  value={customBrandHex}
                  onChange={(e) => handleUpdateCustomColors(e.target.value, undefined)}
                  aria-label="اللون الأساسي"
                />
                <div style={{ minWidth: 0 }}>
                  <span className="mp-custom-color-label">اللون الأساسي</span>
                  <span className="mp-custom-color-hex tabular-nums" dir="ltr">{customBrandHex.toUpperCase()}</span>
                </div>
              </label>

              <label className="mp-custom-color-chip">
                <input
                  type="color"
                  disabled={!resolvedPlan.perms.customColors}
                  value={customBgPreview}
                  onChange={(e) => handleUpdateCustomColors(undefined, e.target.value)}
                  aria-label="لون الخلفية"
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span className="mp-custom-color-label">لون الخلفية</span>
                  <span className="mp-custom-color-hex tabular-nums" dir="ltr">
                    {restBgColor ? restBgColor.toUpperCase() : 'تلقائي'}
                  </span>
                </div>
                {restBgColor && resolvedPlan.perms.customColors && (
                  <button
                    type="button"
                    title="إرجاع الخلفية تلقائياً"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleUpdateCustomColors(undefined, '');
                    }}
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '6px',
                      border: '1px solid var(--line)',
                      background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
                      color: 'var(--muted)',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <RotateCcw size={11} />
                  </button>
                )}
              </label>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 4. Page & Card Shapes */}
      <motion.section
        className="mp-appearance-section"
        {...sectionRevealProps}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'color-mix(in srgb, var(--surface) 40%, transparent)', border: '1px solid var(--line)', color: 'var(--brand-ink, #34D399)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Shapes size={18} />
          </div>
          <div>
            <h2 className="mp-appearance-section-title" style={{ margin: '0 0 2px' }}>
              اختر شكل الصفحة والبطاقات والأشكال الموسمية
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>
              يُطبّق الشكل فوراً على كامل الصفحة: البنر، الصورة الشخصية، الزينة والأنيميشن، والبطاقات
            </p>
          </div>
        </div>

        <div className="mp-appearance-shapes-grid">
          {MENU_SHAPES.map((shape, idx) => {
            const isSelected = menuThemeShape === shape.id;
            const seasonalDecor =
              shape.id === 'ramadan'
                ? { left: '🏮', right: '🌙', badge: '✦' }
                : shape.id === 'eid'
                ? { left: '🎈', right: '🎉', badge: '🎊' }
                : shape.id === 'newyear'
                ? { left: '❄️', right: '🎆', badge: '✨' }
                : null;

            return (
              <motion.button
                key={shape.id}
                type="button"
                onClick={() => handleSelectThemeShape(shape.id)}
                className={`mp-appearance-shape-card ${isSelected ? 'selected' : ''}`}
                {...dashCardMotion(prefersReducedMotion, idx, 1, true, 0.06)}
              >
                <div className={`mp-shape-preview mp-shape-preview-${shape.id}`}>
                  <div className="mp-shape-mini-banner">
                    {seasonalDecor && (
                      <div className="mp-shape-seasonal-icons" aria-hidden="true">
                        <span>{seasonalDecor.right}</span>
                        <span>{seasonalDecor.badge}</span>
                        <span>{seasonalDecor.left}</span>
                      </div>
                    )}
                  </div>
                  <div className="mp-shape-mini-row">
                    <div className="mp-shape-mini-avatar" />
                    <div className="mp-shape-preview-box">
                      <div className="mp-shape-preview-thumb" />
                      <div className="mp-shape-preview-meta">
                        <span className="mp-shape-preview-bar" />
                        <span className="mp-shape-preview-btn" />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                  <b style={{ fontSize: '13px', color: isSelected ? 'var(--brand-ink, #34D399)' : 'var(--ink)' }}>
                    {shape.name}
                  </b>
                  {isSelected ? (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        color: 'var(--brand-ink, #34D399)',
                        background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
                        padding: '2px 6px',
                        borderRadius: '7px',
                        border: '1px solid var(--brand)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      مفعّل ✓
                    </span>
                  ) : shape.badge ? (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        color: 'var(--brand-ink, #34D399)',
                        background: 'color-mix(in srgb, var(--brand) 12%, transparent)',
                        padding: '2px 6px',
                        borderRadius: '7px',
                        border: '1px solid color-mix(in srgb, var(--brand) 28%, transparent)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {shape.badge}
                    </span>
                  ) : null}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.4 }}>
                  {shape.subtitle}
                </span>
              </motion.button>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
};
