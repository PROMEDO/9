/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  Edit,
  Eye,
  Image as ImageIcon,
  ShoppingBag,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { getContextualAddonCatalog } from '../../data/addonsCatalog';
import { formatNumber } from '../../utils/storage';
import { MediaLibraryModal } from '../../components/MediaLibraryModal';
import {
  getAddonRequiredPlanLabel,
  getAddonRequiredPlanTier,
  isAddonAllowedForPlan,
} from '../../utils/plans';
import { playBellTone, surfaceCardStyle, themedInputStyle, useDashboard } from './DashboardContext';
import {
  dashCardMotion,
  dashModalMotion,
  dashSectionMotion,
} from '../../utils/dashboardMotion';

function formatHourArabic(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const hh24 = `${String(h).padStart(2, '0')}:00`;
  if (h === 0) return `12:00 منتصف الليل (${hh24})`;
  if (h < 12) return `${h}:00 صباحاً (${hh24})`;
  if (h === 12) return `12:00 ظهراً (${hh24})`;
  return `${h - 12}:00 مساءً (${hh24})`;
}

export const AddonsPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [showOfferMediaLibrary, setShowOfferMediaLibrary] = useState(false);
  const {
    rest,
    resolvedPlan,
    currency,
    allItems,
    addonsState,
    editingAddonKey,
    setEditingAddonKey,
    addonDraft,
    setAddonDraft,
    addonEditIntent,
    setAddonEditIntent,
    addonEditError,
    setAddonEditError,
    addonSaving,
    showPopupPreview,
    setShowPopupPreview,
    handleToggleAddon,
    handleOpenAddonEdit,
    handleSaveAddonEdit,
    closeAddonEditModal,
    mediaLibraryItems,
    uploadImagesToLibrary,
    removeMediaLibraryItem,
    openUpgradeModal,
    terms,
  } = useDashboard();

  const localizedCatalog = getContextualAddonCatalog(terms.isStore);
  const allowedAddonsCount = localizedCatalog.filter((a) => isAddonAllowedForPlan(a.key, resolvedPlan)).length;
  const enabledCount = localizedCatalog.filter(
    (a) =>
      isAddonAllowedForPlan(a.key, resolvedPlan) &&
      Boolean((addonsState[a.key] as Record<string, any> | undefined)?.enabled)
  ).length;
  const visibleAddons = localizedCatalog;
  const addonsLimitText = `${enabledCount}/${allowedAddonsCount}`;

  const updateDraft = (updater: (prev: Record<string, any>) => Record<string, any>) => {
    if (addonEditError) setAddonEditError('');
    setAddonDraft(updater);
  };

  const closeEditModal = closeAddonEditModal;

  const activeMeta = editingAddonKey ? localizedCatalog.find((a) => a.key === editingAddonKey) : null;
  const activeSavedCfg = editingAddonKey
    ? ((addonsState[editingAddonKey] || {}) as Record<string, any>)
    : {};
  const requiresInitialSetup = addonEditIntent === 'enable' || !activeSavedCfg.configured;
  const currentLocalHour = new Date().getHours();

  const waTargetPhone = String(rest.social?.whatsapp || rest.ph || '').trim();

  return (
    <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
      <motion.div
        className="mp-items-toolbar"
        {...dashSectionMotion(prefersReducedMotion, 0)}
        style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: '10px' }}
      >
        <div
          className={`mp-items-count-box ${allowedAddonsCount === 0 ? 'is-limit' : ''}`}
          aria-label={`صلاحيتك بالإضافات ${addonsLimitText}`}
        >
          <span className="mp-items-count-label">صلاحيتك بالإضافات</span>
          <span className="mp-items-count-divider" aria-hidden="true" />
          <span dir="ltr" className="mp-items-count-num tabular-nums">
            {addonsLimitText}
          </span>
        </div>
      </motion.div>

      <div className="mp-addons-grid">
        {visibleAddons.map((addon, idx) => {
          const allowed = isAddonAllowedForPlan(addon.key, resolvedPlan);
          const reqLabel = getAddonRequiredPlanLabel(addon.key);
          const cfg = (addonsState[addon.key] || {}) as Record<string, any>;
          const isEnabled = allowed && Boolean(cfg.enabled);
          const isConfigured = Boolean(cfg.configured || cfg.enabled);
          const targetUpgradeTier = getAddonRequiredPlanTier(addon.key);

          return (
            <motion.div
              key={addon.key}
              className={`mp-addon-square-card ${isEnabled ? 'is-enabled' : ''} ${!allowed ? 'is-locked' : ''}`}
              {...dashCardMotion(prefersReducedMotion, idx % 8, allowed ? 1 : 0.72, false, 0.06)}
            >
              {/* Top Row: Icon + Status Pill */}
              <div className="mp-addon-card-head">
                <div className={`mp-addon-card-icon ${isEnabled ? 'is-enabled' : ''}`}>
                  <span>{addon.icon}</span>
                </div>
                <span
                  className={`mp-addon-status-pill ${
                    !allowed ? 'is-locked' : isEnabled ? 'is-enabled' : !isConfigured ? 'is-setup' : 'is-off'
                  }`}
                >
                  {!allowed
                    ? '🔒 مقفل'
                    : isEnabled
                    ? 'يعمل'
                    : !isConfigured
                    ? 'يتطلب إعداد'
                    : 'متوقف'}
                </span>
              </div>

              {/* Center: Title + Summary */}
              <div className="mp-addon-card-body">
                <b className="mp-addon-card-title">{addon.title}</b>
                <p className="mp-addon-card-desc">{addon.desc}</p>
                {addon.key === 'freeDeliveryProgress' && (
                  <div className="mp-addon-card-meta" style={{ color: isEnabled ? 'var(--brand)' : 'var(--muted)' }}>
                    الحد الأدنى: {formatNumber(Number(cfg.minAmount ?? 25000))} {currency}
                  </div>
                )}
              </div>

              {/* Bottom Action Row */}
              <div className="mp-addon-card-actions">
                {allowed ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleToggleAddon(addon)}
                      className={`mp-addon-btn-toggle ${isEnabled ? 'is-stop' : 'is-start'}`}
                    >
                      <span className={`mp-addon-dot ${isEnabled ? 'is-on' : ''}`} />
                      <span>{isEnabled ? 'إيقاف' : 'تشغيل'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenAddonEdit(addon.key)}
                      className="mp-addon-btn-edit"
                    >
                      <Edit size={12} />
                      <span>تعديل</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => openUpgradeModal(targetUpgradeTier)}
                    className="mp-addon-btn-upgrade"
                  >
                    <span>🔒 {reqLabel}</span>
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* FIXED CENTERED EDIT / SETUP ADDON POPUP MODAL */}
      {editingAddonKey && activeMeta && (
        <div className="mp-addon-modal-overlay" dir="rtl" onClick={closeEditModal}>
          <motion.div
            className="mp-addon-modal-card"
            onClick={(e) => e.stopPropagation()}
            {...dashModalMotion(prefersReducedMotion)}
            style={surfaceCardStyle}
          >
            <form onSubmit={handleSaveAddonEdit} className="mp-addon-modal-form" noValidate>
              {/* Sticky Header */}
              <div className="mp-addon-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div className="mp-addon-modal-icon">{activeMeta.icon}</div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: 'var(--ink)' }}>
                      {addonEditIntent === 'enable' ? 'إعداد وتفعيل:' : 'تعديل:'} {activeMeta.title}
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: 'var(--muted)' }}>
                      {activeMeta.desc}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeEditModal}
                  aria-label="إغلاق"
                  className="mp-addon-modal-close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="mp-addon-modal-body">
                {requiresInitialSetup ? (
                  <div className="mp-addon-setup-banner">
                    <Sparkles size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>
                      {terms.isStore
                        ? 'لتعمل هذه الإضافة بشكل صحيح في المتجر، راجع الحقول أدناه وعدّلها بما يناسبك ثم اضغط على '
                        : 'لتعمل هذه الإضافة بشكل صحيح في المنيو، راجع الحقول أدناه وعدّلها بما يناسبك ثم اضغط على '}
                      <b>"تفعيل الإضافة الآن"</b>.
                    </span>
                  </div>
                ) : (
                  <label className="mp-addon-enable-switch">
                    <div>
                      <span style={{ display: 'block', fontWeight: 800, fontSize: '13.5px', color: 'var(--ink)' }}>
                        {terms.isStore ? 'حالة الميزة في المتجر' : 'حالة الميزة في المنيو'}
                      </span>
                      <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--muted)' }}>
                        {addonDraft.enabled ? 'مفعّلة وتظهر للزبائن الآن' : 'مضبوطة ولكن متوقفة مؤقتاً'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(addonDraft.enabled)}
                      onChange={(e) => updateDraft((p) => ({ ...p, enabled: e.target.checked }))}
                    />
                  </label>
                )}

                {addonEditError && (
                  <div className="mp-addon-error-banner" role="alert">
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{addonEditError}</span>
                  </div>
                )}

                {editingAddonKey === 'offerPopup' && (() => {
                  const popupMode = addonDraft.mode === 'dish' ? 'dish' : 'ad';
                  const selectedDish = addonDraft.itemId
                    ? allItems.find((it) => it.id === addonDraft.itemId)
                    : undefined;
                  const currentBtn = String(addonDraft.buttonText || '').trim();
                  const displayedBtnValue =
                    popupMode === 'ad'
                      ? !currentBtn ||
                        currentBtn === 'إضافة إلى السلة' ||
                        currentBtn === 'تصفح المنيو واطلب الآن' ||
                        currentBtn === 'تصفح المنيو'
                        ? 'إغلاق'
                        : currentBtn
                      : !currentBtn ||
                        currentBtn === 'إغلاق' ||
                        currentBtn === 'تصفح المنيو واطلب الآن' ||
                        currentBtn === 'تصفح المنيو'
                      ? 'إضافة إلى السلة'
                      : currentBtn;

                  return (
                    <>
                      <div className="f">
                        <span>نوع النافذة المنبثقة *</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft((p) => {
                                const prevBtn = String(p.buttonText || '').trim();
                                return {
                                  ...p,
                                  mode: 'ad',
                                  itemId: '',
                                  specialPrice: undefined,
                                  buttonText:
                                    !prevBtn ||
                                    prevBtn === 'إضافة إلى السلة' ||
                                    prevBtn === 'تصفح المنيو' ||
                                    prevBtn === 'تصفح المنيو واطلب الآن'
                                      ? 'إغلاق'
                                      : prevBtn,
                                };
                              })
                            }
                            className={`btn s ${popupMode === 'ad' ? 'p' : ''}`}
                            style={{ fontWeight: 800, fontSize: '12.5px', justifyContent: 'center' }}
                          >
                            إعلان فقط
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft((p) => {
                                const prevBtn = String(p.buttonText || '').trim();
                                return {
                                  ...p,
                                  mode: 'dish',
                                  buttonText:
                                    !prevBtn || prevBtn === 'إغلاق' ? 'إضافة إلى السلة' : prevBtn,
                                };
                              })
                            }
                            className={`btn s ${popupMode === 'dish' ? 'p' : ''}`}
                            style={{ fontWeight: 800, fontSize: '12.5px', justifyContent: 'center' }}
                          >
                            {terms.isStore ? 'منتج من المتجر' : 'طبق من المنيو'}
                          </button>
                        </div>
                      </div>

                      {popupMode === 'dish' ? (
                        <>
                          <label className="f">
                            {terms.isStore ? 'اختر المنتج للعرض الخاص *' : 'اختر الطبق للعرض الخاص *'}
                            <select
                              value={addonDraft.itemId || ''}
                              onChange={(e) => {
                                const nextItemId = e.target.value;
                                const chosen = allItems.find((it) => it.id === nextItemId);
                                updateDraft((p) => ({
                                  ...p,
                                  itemId: nextItemId,
                                  title:
                                    chosen &&
                                    (!p.title ||
                                      p.title === selectedDish?.n ||
                                      p.title === 'عرض خاص لفترة محدودة!' ||
                                      p.title === 'عرض خاص ومميز لا يفوتك!')
                                      ? chosen.n
                                      : p.title,
                                  subtitle:
                                    chosen && (!p.subtitle || p.subtitle === selectedDish?.d)
                                      ? chosen.d || `اطلب ${chosen.n} الآن بسعر العرض`
                                      : p.subtitle,
                                  image:
                                    chosen && (!p.image || p.image === selectedDish?.img)
                                      ? chosen.img || ''
                                      : p.image,
                                }));
                              }}
                              style={themedInputStyle}
                            >
                              <option value="">{terms.isStore ? '— اختر منتجاً من المتجر —' : '— اختر طبقاً من المنيو —'}</option>
                              {allItems.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.n} ({formatNumber(Number(it.pr) || 0)} {currency})
                                </option>
                              ))}
                            </select>
                          </label>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <label className="f">
                              سعر العرض الخاص ({currency})
                              <input
                                type="number"
                                min={0}
                                dir="ltr"
                                value={addonDraft.specialPrice ?? ''}
                                onChange={(e) =>
                                  updateDraft((p) => ({
                                    ...p,
                                    specialPrice: e.target.value === '' ? '' : Number(e.target.value),
                                  }))
                                }
                                placeholder={selectedDish ? String(selectedDish.pr) : 'اختياري'}
                                style={themedInputStyle}
                              />
                            </label>
                            <label className="f">
                              شارة العرض (اختياري)
                              <input
                                type="text"
                                value={addonDraft.badgeText || ''}
                                onChange={(e) => updateDraft((p) => ({ ...p, badgeText: e.target.value }))}
                                placeholder="مثال: عرض خاص 🔥"
                                style={themedInputStyle}
                              />
                            </label>
                          </div>
                        </>
                      ) : (
                        <label className="f">
                          شارة الإعلان (اختياري)
                          <input
                            type="text"
                            value={addonDraft.badgeText || ''}
                            onChange={(e) => updateDraft((p) => ({ ...p, badgeText: e.target.value }))}
                            placeholder="مثال: إعلان هام ✨"
                            style={themedInputStyle}
                          />
                        </label>
                      )}

                      <label className="f">
                        عنوان النافذة المنبثقة *
                        <input
                          type="text"
                          value={addonDraft.title || ''}
                          onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                          style={themedInputStyle}
                          required
                        />
                      </label>
                      <label className="f">
                        تفاصيل الإعلان أو العرض
                        <textarea
                          rows={2}
                          value={addonDraft.subtitle || ''}
                          onChange={(e) => updateDraft((p) => ({ ...p, subtitle: e.target.value }))}
                          style={themedInputStyle}
                        />
                      </label>
                      <div className="f">
                        <span>صورة العرض (من مكتبة الصور أو رابط)</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn p"
                            onClick={() => setShowOfferMediaLibrary(true)}
                            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}
                          >
                            <ImageIcon size={14} />
                            <span>اختيار من مكتبة الصور</span>
                          </button>
                          <input
                            type="text"
                            dir="ltr"
                            value={addonDraft.image || ''}
                            onChange={(e) => updateDraft((p) => ({ ...p, image: e.target.value }))}
                            placeholder="https://..."
                            style={{ ...themedInputStyle, flex: 1, minWidth: '160px' }}
                          />
                        </div>
                        {addonDraft.image && (
                          <div style={{ marginTop: '8px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--line)', height: '110px', position: 'relative' }}>
                            <img
                              src={addonDraft.image}
                              alt="معاينة صورة البوب اب"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                            <button
                              type="button"
                              onClick={() => updateDraft((p) => ({ ...p, image: '' }))}
                              aria-label="إزالة الصورة"
                              style={{
                                position: 'absolute',
                                top: '6px',
                                insetInlineStart: '6px',
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                background: 'rgba(239,68,68,0.9)',
                                color: '#fff',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'grid',
                                placeItems: 'center',
                              }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                      <label className="f">
                        {popupMode === 'dish' ? 'نص زر الإضافة للسلة' : 'نص زر الإغلاق'}
                        <input
                          type="text"
                          value={displayedBtnValue}
                          onChange={(e) => updateDraft((p) => ({ ...p, buttonText: e.target.value }))}
                          placeholder={popupMode === 'dish' ? 'إضافة إلى السلة' : 'إغلاق'}
                          style={themedInputStyle}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn s"
                        onClick={() => setShowPopupPreview(true)}
                        style={{ marginBottom: '6px' }}
                      >
                        <Eye size={14} />
                        <span>معاينة شكل البوب اب للزبون</span>
                      </button>
                    </>
                  );
                })()}

                {editingAddonKey === 'announcementBar' && (
                  <>
                    <div
                      style={{
                        borderRadius: '10px',
                        padding: '9px 12px',
                        marginBottom: '12px',
                        background: addonDraft.bgColor || '#C2410C',
                        color: addonDraft.textColor || '#ffffff',
                        fontSize: '12.5px',
                        fontWeight: 800,
                        textAlign: 'center',
                      }}
                    >
                      {addonDraft.text || (terms.isStore ? 'معاينة شريط الإعلانات أعلى المتجر' : 'معاينة شريط الإعلانات أعلى المنيو')}
                    </div>
                    <label className="f">
                      نص الشريط الإعلاني *
                      <input
                        type="text"
                        value={addonDraft.text || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, text: e.target.value }))}
                        style={themedInputStyle}
                        required
                      />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <label className="f">
                        لون خلفية الشريط
                        <input
                          type="color"
                          value={addonDraft.bgColor || '#C2410C'}
                          onChange={(e) => updateDraft((p) => ({ ...p, bgColor: e.target.value }))}
                          style={{ width: '100%', height: '40px', borderRadius: '8px', cursor: 'pointer' }}
                        />
                      </label>
                      <label className="f">
                        لون النص
                        <input
                          type="color"
                          value={addonDraft.textColor || '#ffffff'}
                          onChange={(e) => updateDraft((p) => ({ ...p, textColor: e.target.value }))}
                          style={{ width: '100%', height: '40px', borderRadius: '8px', cursor: 'pointer' }}
                        />
                      </label>
                    </div>
                  </>
                )}

                {editingAddonKey === 'countdownTimer' && (
                  <>
                    <label className="f">
                      عنوان العرض التنازلي
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <label className="f">
                        {terms.isStore ? 'نوع الخصم الفعلي على المتجر' : 'نوع الخصم الفعلي على المنيو'}
                        <select
                          value={addonDraft.discountType || 'percent'}
                          onChange={(e) => updateDraft((p) => ({ ...p, discountType: e.target.value }))}
                          style={themedInputStyle}
                        >
                          <option value="percent">نسبة مئوية (%)</option>
                          <option value="fixed">{`مبلغ ثابت (${currency})`}</option>
                        </select>
                      </label>
                      <label className="f">
                        قيمة الخصم (تخصم تلقائياً من الأسعار)
                        <input
                          type="number"
                          min={0}
                          value={addonDraft.discountValue ?? 15}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              discountValue: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          style={themedInputStyle}
                        />
                      </label>
                    </div>
                    <label className="f">
                      نص التنبيه الظاهر في الشريط
                      <input
                        type="text"
                        value={addonDraft.discountText || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, discountText: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <label className="f">
                      ساعة انتهاء العرض اليومية
                      <select
                        value={Number(addonDraft.endHour ?? 23)}
                        onChange={(e) => updateDraft((p) => ({ ...p, endHour: Number(e.target.value) }))}
                        style={themedInputStyle}
                      >
                        {Array.from({ length: 24 }).map((_, hr) => (
                          <option key={hr} value={hr}>
                            {formatHourArabic(hr)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}



                {editingAddonKey === 'customerReviews' && (
                  <>
                    <label className="mp-addon-check-row">
                      <input
                        type="checkbox"
                        checked={addonDraft.showOnMenu !== false}
                        onChange={(e) => updateDraft((p) => ({ ...p, showOnMenu: e.target.checked }))}
                      />
                      <span>{terms.isStore ? 'عرض تقييمات الزبائن في صفحة المتجر' : 'عرض تقييمات الزبائن في صفحة المنيو'}</span>
                    </label>
                    <label className="mp-addon-check-row">
                      <input
                        type="checkbox"
                        checked={addonDraft.allowSubmit !== false}
                        onChange={(e) => updateDraft((p) => ({ ...p, allowSubmit: e.target.checked }))}
                      />
                      <span>السماح للزبائن بإرسال تقييم جديد</span>
                    </label>
                  </>
                )}

                {editingAddonKey === 'minOrder' && (
                  <>
                    <label className="f">
                      {`الحد الأدنى لمبلغ الطلب (${currency}) *`}
                      <input
                        type="number"
                        min={1}
                        value={addonDraft.amount ?? 10000}
                        onChange={(e) => updateDraft((p) => ({ ...p, amount: Number(e.target.value) }))}
                        style={themedInputStyle}
                        required
                      />
                    </label>
                    <label className="f">
                      رسالة التنبيه للزبون
                      <input
                        type="text"
                        value={addonDraft.message || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, message: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                  </>
                )}



                {editingAddonKey === 'audioBell' && (
                  <>
                    <label className="f">
                      نغمة التنبيه الصوتي للطلبات
                      <select
                        value={addonDraft.tone || 'bell'}
                        onChange={(e) => updateDraft((p) => ({ ...p, tone: e.target.value }))}
                        style={themedInputStyle}
                      >
                        <option value="bell">جرس الكاشير الكلاسيكي</option>
                        <option value="chime">رنين ناعم ثلاثي (Chime)</option>
                        <option value="alert">تنبيه سريع</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn s"
                      onClick={() => playBellTone(addonDraft.tone || 'bell')}
                      style={{ marginBottom: '6px' }}
                    >
                      <Volume2 size={15} />
                      <span>اختبار صوت التنبيه الآن</span>
                    </button>
                  </>
                )}



                {editingAddonKey === 'happyHour' && (
                  <>
                    <label className="f">
                      عنوان عرض ساعة السعادة
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <label className="f">
                        من الساعة
                        <select
                          value={Number(addonDraft.startHour ?? 14)}
                          onChange={(e) => updateDraft((p) => ({ ...p, startHour: Number(e.target.value) }))}
                          style={themedInputStyle}
                        >
                          {Array.from({ length: 24 }).map((_, hr) => (
                            <option key={hr} value={hr}>
                              {formatHourArabic(hr)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="f">
                        إلى الساعة
                        <select
                          value={Number(addonDraft.endHour ?? 17)}
                          onChange={(e) => updateDraft((p) => ({ ...p, endHour: Number(e.target.value) }))}
                          style={themedInputStyle}
                        >
                          {Array.from({ length: 24 }).map((_, hr) => (
                            <option key={hr} value={hr}>
                              {formatHourArabic(hr)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="f">
                      نسبة الخصم التلقائي (%)
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={addonDraft.discountPercent ?? 15}
                        onChange={(e) => updateDraft((p) => ({ ...p, discountPercent: Number(e.target.value) }))}
                        style={themedInputStyle}
                      />
                    </label>
                    {(() => {
                      const s = Number(addonDraft.startHour ?? 14);
                      const en = Number(addonDraft.endHour ?? 17);
                      const activeNow = s <= en ? currentLocalHour >= s && currentLocalHour < en : currentLocalHour >= s || currentLocalHour < en;
                      return (
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: activeNow ? '#10b981' : 'var(--muted)' }}>
                          {activeNow
                            ? '✓ الوقت الحالي يقع ضمن ساعة السعادة وسيطبق الخصم فوراً عند التفعيل.'
                            : `الخصم سيتفعل تلقائياً يومياً من ${formatHourArabic(s)} إلى ${formatHourArabic(en)}.`}
                        </div>
                      );
                    })()}
                  </>
                )}

                {editingAddonKey === 'freeGiftThreshold' && (
                  <>
                    <label className="f">
                      {`الحد الأدنى للطلب للحصول على الهدية (${currency})`}
                      <input
                        type="number"
                        min={0}
                        value={addonDraft.minAmount ?? 25000}
                        onChange={(e) => updateDraft((p) => ({ ...p, minAmount: Number(e.target.value) }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <label className="f">
                      اسم الهدية المجانية *
                      <input
                        type="text"
                        value={addonDraft.giftName || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, giftName: e.target.value }))}
                        style={themedInputStyle}
                        required
                      />
                    </label>
                  </>
                )}

                {editingAddonKey === 'cartUpsell' && (
                  <>
                    <label className="f">
                      عنوان قسم المقترحات في السلة
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <label className="f">
                      {terms.isStore ? 'عدد المنتجات المقترحة داخل السلة (1 - 8)' : 'عدد الأصناف المقترحة داخل السلة (1 - 8)'}
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={addonDraft.maxItems ?? 4}
                        onChange={(e) => updateDraft((p) => ({ ...p, maxItems: Number(e.target.value) }))}
                        style={themedInputStyle}
                      />
                    </label>
                  </>
                )}



                {editingAddonKey === 'spinWheelPromo' && (
                  <>
                    <label className="f">
                      عنوان نافذة عجلة الحظ
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <label className="f">
                      الجوائز المتاحة (سطر لكل جائزة — أمثلة: خصم 5%، خصم 10%، توصيل مجاني)
                      <textarea
                        rows={4}
                        value={addonDraft.prizesText || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, prizesText: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                  </>
                )}

                {editingAddonKey === 'loyaltyPoints' && (
                  <>
                    <label className="f">
                      {`عدد النقاط لكل 1,000 ${currency}`}
                      <input
                        type="number"
                        min={1}
                        value={addonDraft.pointsPerThousand ?? 1}
                        onChange={(e) => updateDraft((p) => ({ ...p, pointsPerThousand: Number(e.target.value) }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <label className="f">
                      رسالة تشجيع النقاط للزبون
                      <input
                        type="text"
                        value={addonDraft.rewardNote || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, rewardNote: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                  </>
                )}



                {editingAddonKey === 'cutleryOption' && (
                  <label className="f">
                    {terms.isStore ? 'نص سؤال التغليف الفاخر والفاتورة داخل السلة' : 'نص سؤال أدوات الطعام داخل السلة'}
                    <input
                      type="text"
                      value={addonDraft.label || ''}
                      onChange={(e) => updateDraft((p) => ({ ...p, label: e.target.value }))}
                      style={themedInputStyle}
                    />
                  </label>
                )}



                {editingAddonKey === 'firstOrderDiscount' && (
                  <>
                    <label className="f">
                      نسبة خصم الطلب الأول (%)
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={addonDraft.discountPercent ?? 10}
                        onChange={(e) => updateDraft((p) => ({ ...p, discountPercent: Number(e.target.value) }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <label className="f">
                      عنوان الخصم الترحيبي
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                  </>
                )}

                {editingAddonKey === 'freeDeliveryProgress' && (
                  <>
                    <label className="f">
                      {`الحد الأدنى للتوصيل المجاني (${currency}) *`}
                      <input
                        type="number"
                        min={1}
                        value={addonDraft.minAmount ?? 25000}
                        onChange={(e) =>
                          updateDraft((p) => ({
                            ...p,
                            minAmount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                          }))
                        }
                        placeholder="25000"
                        style={themedInputStyle}
                        required
                      />
                    </label>
                    <label className="f">
                      عنوان شريط التوصيل المجاني التحفيزي
                      <input
                        type="text"
                        value={addonDraft.label || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, label: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                  </>
                )}

                {editingAddonKey === 'whatsappSupportFloat' && (
                  <>
                    <label className="f">
                      نص زر الدعم العائم
                      <input
                        type="text"
                        value={addonDraft.label || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, label: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <label className="f">
                      الرسالة التلقائية عند فتح الواتساب
                      <input
                        type="text"
                        value={addonDraft.prefillText || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, prefillText: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <div
                      style={{
                        padding: '9px 12px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: waTargetPhone ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.12)',
                        color: waTargetPhone ? '#10b981' : '#f59e0b',
                        border: waTargetPhone ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(245,158,11,0.3)',
                      }}
                    >
                      {waTargetPhone
                        ? `سيتم توجيه الزبون إلى رقم الواتساب: ${waTargetPhone}`
                        : terms.isStore
                        ? 'تنبيه: يرجى التأكد من إضافة رقم واتساب المتجر في قسم "الإعدادات" ليظهر الزر للزبائن.'
                        : 'تنبيه: يرجى التأكد من إضافة رقم واتساب المطعم في قسم "الإعدادات" ليظهر الزر للزبائن.'}
                    </div>
                  </>
                )}

                {editingAddonKey === 'groupOrderBillSplit' && (
                  <label className="f">
                    أقصى عدد للأشخاص في حاسبة تقسيم الفاتورة
                    <input
                      type="number"
                      min={2}
                      max={30}
                      value={addonDraft.maxPeople ?? 10}
                      onChange={(e) => updateDraft((p) => ({ ...p, maxPeople: Number(e.target.value) }))}
                      style={themedInputStyle}
                    />
                  </label>
                )}



                {editingAddonKey === 'pickupInstantDiscount' && (
                  <>
                    <label className="f">
                      عنوان خصم الاستلام من المتجر
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <label className="f">
                      نسبة الخصم الفوري عند اختيار الاستلام (%)
                      <input
                        type="number"
                        min={2}
                        max={60}
                        value={addonDraft.discountPercent ?? 10}
                        onChange={(e) => updateDraft((p) => ({ ...p, discountPercent: Number(e.target.value) }))}
                        style={themedInputStyle}
                      />
                    </label>
                  </>
                )}

                {editingAddonKey === 'limitedTimeDiscount' && (() => {
                  const selectedDays = Math.max(1, Number(addonDraft.durationDays ?? 1) || 1);
                  const expiresAt = Number(addonDraft.expiresAt || 0);
                  const isActiveWindow = Boolean(addonDraft.enabled && expiresAt > Date.now());
                  return (
                    <>
                      <label className="f">
                        نسبة الخصم (%)
                        <input
                          type="number"
                          min={1}
                          max={95}
                          value={addonDraft.discountPercent ?? 15}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              discountPercent: e.target.value === '' ? '' : Number(e.target.value),
                            }))
                          }
                          placeholder="15"
                          style={themedInputStyle}
                          required
                        />
                      </label>

                      <div className="f" style={{ marginBottom: 0 }}>
                        <span>المدة (تختارها للإدارة فقط ولا تظهر للزبائن)</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', marginTop: '6px', marginBottom: '8px' }}>
                          {[
                            { days: 1, label: 'يوم واحد (24 ساعة)' },
                            { days: 2, label: 'يومين (48 ساعة)' },
                          ].map((preset) => {
                            const active = selectedDays === preset.days;
                            return (
                              <button
                                key={preset.days}
                                type="button"
                                className={active ? 'btn p s' : 'btn s'}
                                onClick={() => updateDraft((p) => ({ ...p, durationDays: preset.days }))}
                                style={{
                                  fontWeight: 800,
                                  padding: '10px 8px',
                                  justifyContent: 'center',
                                }}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={addonDraft.durationDays ?? 1}
                          onChange={(e) =>
                            updateDraft((p) => ({
                              ...p,
                              durationDays: e.target.value === '' ? 1 : Math.max(1, Math.round(Number(e.target.value) || 1)),
                            }))
                          }
                          placeholder="أدخل عدد الأيام (مثال: 1 أو 2)"
                          style={themedInputStyle}
                        />
                      </div>

                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: 'rgba(16, 185, 129, 0.08)',
                          border: '1px solid rgba(16, 185, 129, 0.22)',
                          color: 'var(--ink)',
                          lineHeight: 1.55,
                        }}
                      >
                        يُطبق الخصم تلقائياً على أسعار القائمة وينتهي بعد انتهاء المدة المختارة دون عرض أي عدّاد أو تاريخ انتهاء للزبائن.
                        {isActiveWindow && (
                          <div style={{ marginTop: '4px', color: '#10b981' }}>
                            الحالة: نشط حالياً وينتهي في {new Date(expiresAt).toLocaleString('ar-IQ')}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}



                {editingAddonKey === 'moodMealFinder' && (
                  <div className="mp-grid-2">
                    <label className="f">
                      {terms.isStore ? 'عنوان نافذة مستشار التسوق الذكي' : 'عنوان نافذة اختيار المزاج'}
                      <input
                        type="text"
                        value={addonDraft.title || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, title: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <label className="f">
                      {terms.isStore ? 'نص زر مستشار التسوق في المتجر' : 'نص زر مكتشف المزاج في المنيو'}
                      <input
                        type="text"
                        value={addonDraft.buttonText || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, buttonText: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                  </div>
                )}



                {editingAddonKey === 'curbsidePickupCar' && (
                  <>
                    <label className="f">
                      تعليمات الاستلام من السيارة للزبون
                      <input
                        type="text"
                        value={addonDraft.instructions || ''}
                        onChange={(e) => updateDraft((p) => ({ ...p, instructions: e.target.value }))}
                        style={themedInputStyle}
                      />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>
                      <input
                        type="checkbox"
                        checked={addonDraft.allowArrivedPing !== false}
                        onChange={(e) => updateDraft((p) => ({ ...p, allowArrivedPing: e.target.checked }))}
                      />
                      <span>
                        {terms.isStore
                          ? 'تفعيل زر "وصلت أمام المعرض" لإرسال إشعار فوري عبر واتساب'
                          : 'تفعيل زر "وصلت أمام المطعم" لإرسال إشعار فوري عبر واتساب'}
                      </span>
                    </label>
                  </>
                )}


              </div>

              {/* Sticky Footer */}
              <div className="mp-addon-modal-footer">
                {addonEditIntent === 'enable' ? (
                  <>
                    <button type="button" className="btn" onClick={closeEditModal} disabled={addonSaving}>
                      إلغاء
                    </button>
                    <button type="submit" className="btn p" disabled={addonSaving} style={{ fontWeight: 800 }}>
                      <CheckCircle2 size={15} />
                      <span>{addonSaving ? 'جاري التفعيل...' : 'تفعيل الإضافة الآن'}</span>
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn p" onClick={closeEditModal} style={{ fontWeight: 800 }}>
                    <CheckCircle2 size={15} />
                    <span>تم — إغلاق</span>
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* CENTERED OFFER POPUP PREVIEW */}
      {showPopupPreview && (() => {
        const previewMode = (addonDraft.mode || addonsState.offerPopup?.mode) === 'dish' ? 'dish' : 'ad';
        const previewImg = addonDraft.image || addonsState.offerPopup?.image;
        const previewBadge = addonDraft.badgeText || addonsState.offerPopup?.badgeText;
        const previewDishId = addonDraft.itemId || addonsState.offerPopup?.itemId;
        const previewDish = previewDishId ? allItems.find((it) => it.id === previewDishId) : undefined;
        const previewTitle = addonDraft.title || addonsState.offerPopup?.title || previewDish?.n;
        const previewSubtitle = addonDraft.subtitle || addonsState.offerPopup?.subtitle;
        const rawSpecial = addonDraft.specialPrice ?? addonsState.offerPopup?.specialPrice;
        const hasSpecial = rawSpecial !== '' && rawSpecial !== undefined && rawSpecial !== null && Number.isFinite(Number(rawSpecial));
        const previewPrice = previewMode === 'dish' ? (hasSpecial ? Number(rawSpecial) : Number(previewDish?.pr || 0)) : 0;
        const previewOrigPrice = previewMode === 'dish' && previewDish ? Number(previewDish.pr || 0) : 0;
        const rawBtn = String(addonDraft.buttonText || addonsState.offerPopup?.buttonText || '').trim();
        const previewBtnText =
          previewMode === 'dish'
            ? !rawBtn || rawBtn === 'إغلاق' || rawBtn === 'تصفح المنيو' || rawBtn === 'تصفح المنيو واطلب الآن'
              ? 'إضافة إلى السلة'
              : rawBtn
            : !rawBtn || rawBtn === 'إضافة إلى السلة' || rawBtn === 'تصفح المنيو' || rawBtn === 'تصفح المنيو واطلب الآن'
            ? 'إغلاق'
            : rawBtn;

        return (
          <div
            className="mp-addon-modal-overlay"
            dir="rtl"
            style={{ zIndex: 100100 }}
            onClick={() => setShowPopupPreview(false)}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              style={{
                position: 'relative',
                width: 'min(410px, 92vw)',
                maxHeight: '88vh',
                display: 'flex',
                flexDirection: 'column',
                ...surfaceCardStyle,
                borderRadius: '24px',
                overflow: 'hidden',
                boxShadow: '0 26px 64px rgba(0,0,0,0.42)',
                textAlign: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => setShowPopupPreview(false)}
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
                  border: '1px solid rgba(255,255,255,0.22)',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  zIndex: 10,
                }}
              >
                <X size={16} />
              </button>

              {previewImg && (
                <div style={{ position: 'relative', width: '100%', height: '205px', flexShrink: 0, overflow: 'hidden', background: 'var(--soft)' }}>
                  <img
                    src={previewImg}
                    alt="صورة الإعلان"
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

              <div style={{ padding: previewImg ? '18px 22px 22px' : '46px 22px 22px', overflowY: 'auto', textAlign: 'center' }}>
                {previewBadge && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      background: 'var(--soft)',
                      color: 'var(--brand)',
                      fontSize: '12px',
                      fontWeight: 800,
                      marginBottom: '10px',
                    }}
                  >
                    {previewBadge}
                  </div>
                )}
                <h3 style={{ fontSize: '19px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 8px', lineHeight: 1.35 }}>
                  {previewTitle}
                </h3>
                {previewSubtitle && (
                  <p style={{ fontSize: '13.5px', color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
                    {previewSubtitle}
                  </p>
                )}

                {previewMode === 'dish' && previewPrice > 0 && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      padding: '6px 16px',
                      borderRadius: '14px',
                      background: 'var(--soft)',
                      marginBottom: '16px',
                    }}
                  >
                    {hasSpecial && previewOrigPrice > previewPrice && (
                      <span style={{ fontSize: '12.5px', color: 'var(--muted)', textDecoration: 'line-through', fontWeight: 700 }}>
                        {formatNumber(previewOrigPrice)} {currency}
                      </span>
                    )}
                    <span style={{ fontSize: '15.5px', fontWeight: 900, color: 'var(--brand)' }}>
                      {formatNumber(previewPrice)} {currency}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }} dir="rtl">
                  {previewMode === 'dish' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowPopupPreview(false)}
                        style={{
                          flex: '1 1 160px',
                          height: '42px',
                          padding: '0 18px',
                          borderRadius: '14px',
                          border: 'none',
                          background: 'var(--brand)',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: '13.5px',
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '7px',
                          boxShadow: '0 6px 18px color-mix(in srgb, var(--brand) 28%, transparent)',
                          cursor: 'pointer',
                        }}
                      >
                        <ShoppingBag size={15} />
                        <span>{previewBtnText}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPopupPreview(false)}
                        style={{
                          height: '42px',
                          padding: '0 18px',
                          borderRadius: '14px',
                          border: '1px solid var(--line)',
                          background: 'var(--soft)',
                          color: 'var(--ink)',
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
                      onClick={() => setShowPopupPreview(false)}
                      style={{
                        minWidth: '160px',
                        height: '42px',
                        padding: '0 24px',
                        borderRadius: '14px',
                        border: '1px solid var(--line)',
                        background: 'var(--soft)',
                        color: 'var(--ink)',
                        fontWeight: 800,
                        fontSize: '13.5px',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      {previewBtnText}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        );
      })()}

      <MediaLibraryModal
        isOpen={showOfferMediaLibrary}
        items={mediaLibraryItems}
        currentUrl={addonDraft.image || ''}
        onSelect={(url) => updateDraft((p) => ({ ...p, image: url }))}
        onUploadFiles={uploadImagesToLibrary}
        onDeleteItem={(mediaId) => {
          const target = mediaLibraryItems.find((m) => m.id === mediaId);
          if (target && target.url === addonDraft.image) {
            updateDraft((p) => ({ ...p, image: '' }));
          }
          removeMediaLibraryItem(mediaId);
        }}
        onClose={() => setShowOfferMediaLibrary(false)}
      />
    </div>
  );
};
