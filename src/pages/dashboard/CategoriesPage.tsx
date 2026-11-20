/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  Clock,
  Edit,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AvailabilitySchedule, Category } from '../../types';
import { AvailabilityScheduleEditor } from '../../components/AvailabilityScheduleEditor';
import { MediaLibraryModal } from '../../components/MediaLibraryModal';
import {
  DEFAULT_AVAILABILITY_SCHEDULE,
  normalizeAvailabilitySchedule,
} from '../../utils/availability';
import {
  SixDotDragHandle,
  surfaceCardStyle,
  themedInputStyle,
  useDashboard,
} from './DashboardContext';
import { dashModalMotion, dashSectionMotion } from '../../utils/dashboardMotion';

export const CategoriesPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const {
    resolvedPlan,
    terms,
    allCategories,
    showCatModal,
    setShowCatModal,
    editingCatId,
    catNameInput,
    setCatNameInput,
    catImageInput,
    setCatImageInput,
    openNewCategoryModal,
    handleToggleCategoryVisibility,
    handleSaveCategory,
    handleOpenEditCategory,
    handleDeleteCategory,
    handleReorderCategories,
    handleSaveCategorySchedule,
    handleSeedStoreCatalog,
    mediaLibraryItems,
    uploadImagesToLibrary,
    removeMediaLibraryItem,
  } = useDashboard();

  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [scheduleModalCat, setScheduleModalCat] = useState<Category | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<AvailabilitySchedule>(() =>
    normalizeAvailabilitySchedule(DEFAULT_AVAILABILITY_SCHEDULE)
  );

  // Smooth touch + mouse pointer-drag reordering via the 6-dot handle
  const [draggingCatId, setDraggingCatId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragSessionRef = useRef<{
    catId: string;
    startClientY: number;
    initialCenterY: number;
    slotCenters: number[];
    draftOrder: string[];
    originalOrder: string[];
  } | null>(null);

  const canReorder = allCategories.length > 1;

  const displayCategories = dragOrder
    ? dragOrder
        .map((id) => allCategories.find((c) => c.id === id))
        .filter((c): c is Category => Boolean(c))
    : allCategories;

  useEffect(() => {
    const handlePointerMove = (ev: PointerEvent) => {
      const st = dragSessionRef.current;
      if (!st) return;
      ev.preventDefault();

      const currentCenterY = st.initialCenterY + (ev.clientY - st.startClientY);
      let bestIdx = 0;
      let bestDist = Infinity;
      st.slotCenters.forEach((sc, idx) => {
        const dist = Math.abs(currentCenterY - sc);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });

      const currentIdx = st.draftOrder.indexOf(st.catId);
      if (currentIdx !== -1 && bestIdx !== currentIdx) {
        const nextOrder = [...st.draftOrder];
        const [moved] = nextOrder.splice(currentIdx, 1);
        nextOrder.splice(bestIdx, 0, moved);
        st.draftOrder = nextOrder;
        setDragOrder([...nextOrder]);
      }

      setDragOffsetY(currentCenterY - st.slotCenters[bestIdx]);
    };

    const finishDrag = () => {
      const st = dragSessionRef.current;
      if (!st) return;
      const changed = st.draftOrder.some((id, idx) => id !== st.originalOrder[idx]);
      const finalOrder = [...st.draftOrder];
      dragSessionRef.current = null;
      setDraggingCatId(null);
      setDragOffsetY(0);
      setDragOrder(null);
      if (changed) {
        handleReorderCategories(finalOrder);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [handleReorderCategories]);

  const startHandleDrag = (e: React.PointerEvent<HTMLButtonElement>, catId: string) => {
    if (!canReorder) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if browser declines pointer capture
    }

    const originalOrder = allCategories.map((c) => c.id);
    const slotCenters = originalOrder.map((id) => {
      const el = rowRefs.current.get(id);
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    const initialIdx = originalOrder.indexOf(catId);
    if (initialIdx === -1 || slotCenters.some((v) => v === 0)) return;

    dragSessionRef.current = {
      catId,
      startClientY: e.clientY,
      initialCenterY: slotCenters[initialIdx],
      slotCenters,
      draftOrder: [...originalOrder],
      originalOrder,
    };
    setDraggingCatId(catId);
    setDragOffsetY(0);
    setDragOrder([...originalOrder]);
  };

  const openScheduleModal = (cat: Category) => {
    setScheduleModalCat(cat);
    setScheduleDraft(normalizeAvailabilitySchedule(cat.availabilitySchedule));
  };

  const handleSaveScheduleModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleModalCat) return;
    handleSaveCategorySchedule(scheduleModalCat, scheduleDraft);
    setScheduleModalCat(null);
  };

  const atCatLimit = resolvedPlan.maxCats !== -1 && allCategories.length >= resolvedPlan.maxCats;
  const catLimitText =
    resolvedPlan.maxCats === -1
      ? `${allCategories.length}/∞`
      : `${allCategories.length}/${resolvedPlan.maxCats}`;

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <motion.div
        className="mp-items-toolbar"
        {...dashSectionMotion(prefersReducedMotion, 0)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={openNewCategoryModal}
            className={`${atCatLimit ? 'btn s' : 'btn p'} mp-items-add-btn`}
          >
            <span>{atCatLimit ? 'الحد مكتمل 🔒' : terms.isStore ? 'إضافة قسم منتجات' : 'إضافة قسم'}</span>
            <Plus size={17} />
          </button>

          {terms.isStore && (
            <button
              type="button"
              onClick={() => handleSeedStoreCatalog('append_missing')}
              className="btn s"
              style={{
                minHeight: '40px',
                borderRadius: '12px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Sparkles size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
              <span>استيراد أقسام ومنتجات جاهزة</span>
            </button>
          )}
        </div>

        <div
          className={`mp-items-count-box ${atCatLimit ? 'is-limit' : ''}`}
          aria-label={`عدد الأقسام ${catLimitText}`}
        >
          <span className="mp-items-count-label">عدد الأقسام</span>
          <span className="mp-items-count-divider" aria-hidden="true" />
          <span dir="ltr" className="mp-items-count-num tabular-nums">
            {catLimitText}
          </span>
        </div>
      </motion.div>

      <motion.div
        className="mp-items-list"
        {...dashSectionMotion(prefersReducedMotion, 0.12)}
      >
        {displayCategories.map((c) => {
          const isCatVisible = c.published !== false;
          const isDragging = draggingCatId === c.id;
          const hasSchedule = Boolean(c.availabilitySchedule?.enabled);
          return (
            <div
              key={c.id}
              ref={(el) => {
                if (el) {
                  rowRefs.current.set(c.id, el);
                } else {
                  rowRefs.current.delete(c.id);
                }
              }}
              className={`mp-item-card ${!isCatVisible ? 'is-hidden-item' : ''}`}
              style={{
                zIndex: isDragging ? 40 : 1,
                transform: isDragging ? `translateY(${dragOffsetY}px) scale(1.015)` : 'none',
                border: isDragging ? '1.5px solid var(--brand)' : undefined,
                boxShadow: isDragging ? '0 14px 32px rgba(0, 0, 0, 0.35)' : undefined,
                transition: isDragging
                  ? 'box-shadow 0.15s ease, border-color 0.15s ease'
                  : 'transform 0.18s ease, opacity 0.15s ease',
                userSelect: draggingCatId ? 'none' : undefined,
              }}
            >
              <div className="mp-item-main">
                {canReorder && (
                  <button
                    type="button"
                    className="mp-item-drag-btn"
                    onPointerDown={(e) => startHandleDrag(e, c.id)}
                    title="اسحب لتحريك القسم للأعلى أو للأسفل"
                    aria-label={`تحريك قسم ${c.n}`}
                    style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                  >
                    <SixDotDragHandle />
                  </button>
                )}
                {c.img && (
                  <img
                    src={c.img}
                    alt={c.n}
                    referrerPolicy="no-referrer"
                    className="mp-item-thumb"
                  />
                )}
                <div className="mp-item-info">
                  <div className="mp-item-title">{c.n}</div>
                </div>
              </div>

              <div className="mp-item-actions">
                <div className="mp-item-visibility-wrap">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isCatVisible}
                    aria-label={
                      isCatVisible
                        ? terms.isStore
                          ? 'إخفاء القسم من المتجر'
                          : 'إخفاء القسم من المنيو'
                        : terms.isStore
                        ? 'إظهار القسم في المتجر'
                        : 'إظهار القسم في المنيو'
                    }
                    title={
                      isCatVisible
                        ? terms.isStore
                          ? 'ظاهر في المتجر — اضغط للإيقاف'
                          : 'ظاهر في المنيو — اضغط للإيقاف'
                        : terms.isStore
                        ? 'مخفي من المتجر — اضغط للتشغيل'
                        : 'مخفي من المنيو — اضغط للتشغيل'
                    }
                    onClick={() => handleToggleCategoryVisibility(c)}
                    className={`ios-switch ${isCatVisible ? 'on' : 'off'}`}
                  >
                    <span className="ios-switch-thumb" />
                  </button>
                  <span className={`mp-item-visibility-label ${isCatVisible ? 'is-visible' : ''}`}>
                    {isCatVisible ? 'ظاهر' : 'مخفي'}
                  </span>
                </div>

                <div className="mp-item-action-btns">
                  <button
                    type="button"
                    className={`mp-item-icon-btn ${hasSchedule ? 'is-scheduled' : ''}`}
                    onClick={() => openScheduleModal(c)}
                    title="تعيين وقت توفر القسم"
                    aria-label="تعيين وقت توفر القسم"
                  >
                    <Clock size={15} />
                  </button>

                  <button
                    type="button"
                    className="mp-item-icon-btn"
                    onClick={() => handleOpenEditCategory(c)}
                    title="تعديل القسم"
                    aria-label={`تعديل ${c.n}`}
                  >
                    <Edit size={15} />
                  </button>

                  <button
                    type="button"
                    className="mp-item-icon-btn"
                    onClick={() => handleDeleteCategory(c)}
                    title="حذف القسم"
                    aria-label={`حذف ${c.n}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Add / Edit Category Modal (clean name + image picker only) */}
      {showCatModal && (() => {
        const catModalNode = (
          <div
            onClick={() => setShowCatModal(false)}
            dir="rtl"
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              background: 'rgba(0, 0, 0, 0.62)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 99999,
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={editingCatId ? 'تعديل القسم' : 'إضافة قسم'}
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              style={{
                width: 'min(500px, 100%)',
                maxHeight: 'calc(100dvh - 32px)',
                overflowY: 'auto',
                ...surfaceCardStyle,
                borderRadius: '20px',
                padding: '20px 22px 22px',
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
              }}
            >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: 'var(--ink)' }}>
                {editingCatId ? 'تعديل القسم' : 'إضافة قسم'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCatModal(false)}
                aria-label="إغلاق"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '9px',
                  width: '32px',
                  height: '32px',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleSaveCategory}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <label className="f" style={{ marginBottom: 0 }}>
                اسم القسم
                <input
                  type="text"
                  value={catNameInput}
                  onChange={(e) => setCatNameInput(e.target.value)}
                  placeholder={terms.isStore ? 'مثال: الهواتف الذكية / السماعات / الإكسسوارات' : 'ادخل اسم القسم'}
                  style={{ ...themedInputStyle, borderRadius: '12px', marginTop: '6px' }}
                  required
                />
              </label>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowMediaLibrary(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowMediaLibrary(true);
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: catImageInput ? '16px' : '24px 16px',
                  borderRadius: '14px',
                  border: '1.5px dashed color-mix(in srgb, var(--line) 85%, transparent)',
                  background: 'color-mix(in srgb, var(--ink) 3%, transparent)',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                {catImageInput ? (
                  <>
                    <img
                      src={catImageInput}
                      alt={catNameInput || 'صورة القسم'}
                      referrerPolicy="no-referrer"
                      style={{
                        width: '86px',
                        height: '86px',
                        borderRadius: '14px',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--brand-ink, #34D399)' }}>
                      اضغط لتغيير الصورة من مكتبة الصور
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCatImageInput('');
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--muted)',
                        cursor: 'pointer',
                      }}
                    >
                      إزالة الصورة
                    </button>
                  </>
                ) : (
                  <>
                    <ImageIcon size={30} strokeWidth={1.7} style={{ color: 'var(--muted)' }} />
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ink)' }}>
                      اضف صورة للقسم (اختياري)
                    </div>
                    <div dir="auto" style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                      مقاس الصورة المفضل 180 × 180، نقبل jpg, png, jpeg
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                {editingCatId ? (
                  <button
                    type="button"
                    onClick={() => setShowCatModal(false)}
                    className="btn p"
                    style={{
                      minWidth: '180px',
                      height: '44px',
                      borderRadius: '12px',
                      padding: '0 26px',
                      fontSize: '14.5px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    تم — إغلاق
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="btn p"
                    style={{
                      minWidth: '180px',
                      height: '44px',
                      borderRadius: '12px',
                      padding: '0 26px',
                      fontSize: '14.5px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {terms.isStore ? 'إضافة قسم للمتجر' : 'إضافة قسم'}
                  </button>
                )}
              </div>
            </form>
            </motion.div>
          </div>
        );
        return typeof document !== 'undefined' ? createPortal(catModalNode, document.body) : catModalNode;
      })()}

      {/* Dedicated Schedule / Timer Modal opened from the row Clock button */}
      {scheduleModalCat && (() => {
        const schedModalNode = (
          <div
            onClick={() => setScheduleModalCat(null)}
            dir="rtl"
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              background: 'rgba(0, 0, 0, 0.62)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 99999,
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`توقيت توفر: ${scheduleModalCat.n}`}
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              style={{
                width: 'min(480px, 100%)',
                maxHeight: 'calc(100dvh - 32px)',
                overflowY: 'auto',
                ...surfaceCardStyle,
                borderRadius: '20px',
                padding: '18px 16px 20px',
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
              }}
            >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: 'var(--ink)' }}>
                {`توقيت توفر: ${scheduleModalCat.n}`}
              </h3>
              <button
                type="button"
                onClick={() => setScheduleModalCat(null)}
                aria-label="إغلاق"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '9px',
                  width: '32px',
                  height: '32px',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleSaveScheduleModal}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <AvailabilityScheduleEditor
                value={scheduleDraft}
                onChange={(next) => {
                  setScheduleDraft(next);
                  if (scheduleModalCat) {
                    handleSaveCategorySchedule(scheduleModalCat, next);
                  }
                }}
                targetLabel="القسم"
                inputStyle={themedInputStyle}
                flat
              />

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setScheduleModalCat(null)}
                  className="btn p"
                  style={{
                    minWidth: '180px',
                    height: '44px',
                    borderRadius: '12px',
                    padding: '0 26px',
                    fontSize: '14.5px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  تم — إغلاق
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        );
        return typeof document !== 'undefined' ? createPortal(schedModalNode, document.body) : schedModalNode;
      })()}

      <MediaLibraryModal
        isOpen={showMediaLibrary}
        items={mediaLibraryItems}
        currentUrl={catImageInput}
        onSelect={(url) => setCatImageInput(url)}
        onUploadFiles={uploadImagesToLibrary}
        onDeleteItem={(mediaId) => {
          const target = mediaLibraryItems.find((m) => m.id === mediaId);
          if (target && target.url === catImageInput) {
            setCatImageInput('');
          }
          removeMediaLibraryItem(mediaId);
        }}
        onClose={() => setShowMediaLibrary(false)}
      />
    </div>
  );
};
