/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { PlanComparisonItemConfig, PricingPlan } from '../../types';
import {
  COMPARISON_FEATURE_KEY_MAP,
  EditablePlanComparisonItem,
  getDefaultComparisonRows,
  getEditablePlanComparisonItems,
  syncPlanComparisonOrderToAll,
} from '../../utils/plans';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CopyCheck,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';

interface PlanFeaturesOrderEditorProps {
  plans: PricingPlan[];
  selectedPlanIdx: number;
  onSelectPlanIdx?: (idx: number) => void;
  onChangePlans: (nextPlans: PricingPlan[]) => void;
  showPlanTabs?: boolean;
  showToast?: (msg: string) => void;
}

export const PlanFeaturesOrderEditor: React.FC<PlanFeaturesOrderEditorProps> = ({
  plans,
  selectedPlanIdx,
  onSelectPlanIdx,
  onChangePlans,
  showPlanTabs = false,
  showToast,
}) => {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  if (!plans || plans.length === 0) return null;

  const safeIdx = Math.min(Math.max(0, selectedPlanIdx), plans.length - 1);
  const plan = plans[safeIdx];
  const items = getEditablePlanComparisonItems(plan);

  const commitItems = (
    nextEditable: EditablePlanComparisonItem[],
    overridePlanPatch?: Partial<PricingPlan>
  ) => {
    const basePlan: PricingPlan = {
      ...plan,
      ...(overridePlanPatch || {}),
    };
    const nextDefaultMap = new Map(
      getDefaultComparisonRows(basePlan, 'ar').map((r) => [r.key, r])
    );

    const nextComparisonItems: PlanComparisonItemConfig[] = nextEditable.map((it) => {
      const cfg: PlanComparisonItemConfig = {
        key: it.key,
        visible: it.visible,
      };
      if (it.customLabel !== undefined) {
        cfg.label = it.customLabel;
      } else if (it.isCustom) {
        cfg.label = it.defaultLabel;
      }
      if (it.isCustom || (!(it.key in COMPARISON_FEATURE_KEY_MAP) && it.key !== 'orders')) {
        cfg.included = it.included;
      }
      return cfg;
    });

    const syncedDisplayLines = nextComparisonItems
      .filter((cfg) => cfg.visible !== false)
      .map((cfg) => {
        const custom = cfg.label?.trim();
        if (custom) return custom;
        return nextDefaultMap.get(cfg.key)?.label || '';
      })
      .filter(Boolean);

    const nextPlans = plans.map((pl, idx) =>
      idx === safeIdx
        ? {
            ...basePlan,
            comparisonItems: nextComparisonItems,
            f: syncedDisplayLines,
          }
        : pl
    );

    onChangePlans(nextPlans);
  };

  const handleMove = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= items.length) return;
    const copy = [...items];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    commitItems(copy);
  };

  const handleToggleIncluded = (idx: number) => {
    const target = items[idx];
    if (!target) return;
    const nextIncluded = !target.included;
    const nextItems = items.map((it, i) =>
      i === idx ? { ...it, included: nextIncluded } : it
    );

    if (target.key in COMPARISON_FEATURE_KEY_MAP) {
      const fmKey = COMPARISON_FEATURE_KEY_MAP[target.key];
      commitItems(nextItems, {
        featuresMap: {
          ...(plan.featuresMap || {}),
          [fmKey]: nextIncluded,
        },
      });
      return;
    }

    if (target.key === 'orders') {
      commitItems(nextItems, {
        featuresMap: {
          ...(plan.featuresMap || {}),
          deliveryOrders: nextIncluded,
          pickupOrders: nextIncluded,
        },
      });
      return;
    }

    commitItems(nextItems);
  };

  const handleLabelChange = (idx: number, val: string) => {
    const nextItems = items.map((it, i) =>
      i === idx ? { ...it, customLabel: val } : it
    );
    commitItems(nextItems);
  };

  const handleLabelBlur = (idx: number) => {
    const target = items[idx];
    if (!target || target.isCustom) return;
    const trimmed = (target.customLabel ?? '').trim();
    if (!trimmed || trimmed === target.defaultLabel) {
      const nextItems = items.map((it, i) =>
        i === idx ? { ...it, customLabel: undefined } : it
      );
      commitItems(nextItems);
    }
  };

  const handleToggleVisible = (idx: number) => {
    const nextItems = items.map((it, i) =>
      i === idx ? { ...it, visible: !it.visible } : it
    );
    commitItems(nextItems);
  };

  const handleDeleteCustom = (idx: number) => {
    const nextItems = items.filter((_, i) => i !== idx);
    commitItems(nextItems);
  };

  const handleAddFeature = () => {
    const nextItems: EditablePlanComparisonItem[] = [
      ...items,
      {
        key: `custom_${Date.now().toString(36)}`,
        defaultLabel: 'ميزة إضافية جديدة',
        customLabel: 'ميزة إضافية جديدة',
        included: true,
        visible: true,
        isCustom: true,
      },
    ];
    commitItems(nextItems);
  };

  const handleApplyOrderToAll = () => {
    const nextPlans = syncPlanComparisonOrderToAll(plans, plan);
    onChangePlans(nextPlans);
    showToast?.('تم تطبيق التغيرات');
  };

  const handleResetPlanOrder = () => {
    const nextPlans = plans.map((pl, idx) => {
      if (idx !== safeIdx) return pl;
      const cleaned: PricingPlan = { ...pl };
      delete cleaned.comparisonItems;
      cleaned.f = getDefaultComparisonRows(cleaned, 'ar').map((r) => r.label);
      return cleaned;
    });
    onChangePlans(nextPlans);
    showToast?.('تم تطبيق التغيرات');
  };

  return (
    <div className="mp-pf-wrap">
      {showPlanTabs && plans.length > 1 && onSelectPlanIdx && (
        <div className="mp-he-plan-tabs">
          {plans.map((planItem, i) => (
            <button
              key={planItem.id || i}
              type="button"
              className={`mp-he-plan-tab${i === safeIdx ? ' is-active' : ''}`}
              onClick={() => onSelectPlanIdx(i)}
            >
              <span>{planItem.n || `باقة #${i + 1}`}</span>
              {planItem.hot === 1 && <span className="mp-he-hot-dot">🔥</span>}
            </button>
          ))}
        </div>
      )}

      <div className="mp-he-group-head">
        <div>
          <h3 className="mp-he-group-title">
            ميزات الباقة وترتيبها من الأعلى للأسفل ({items.length})
          </h3>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: '11.5px' }}>
            اسحب الميزة أو استخدم الأسهم لإعادة الترتيب، وعدّل النص أو حالة التفعيل مباشرة.
          </p>
        </div>

        <div className="mp-pf-toolbar">
          <button type="button" className="btn s p" onClick={handleAddFeature}>
            <Plus size={13} />
            <span>إضافة ميزة</span>
          </button>
          {plans.length > 1 && (
            <button
              type="button"
              className="btn s"
              onClick={handleApplyOrderToAll}
              title="نسخ نفس الترتيب من الأعلى للأسفل إلى باقي الباقات"
            >
              <CopyCheck size={13} />
              <span>تطبيق الترتيب على الكل</span>
            </button>
          )}
          <button
            type="button"
            className="btn s"
            onClick={handleResetPlanOrder}
            title="استعادة الترتيب والنصوص الافتراضية"
          >
            <RotateCcw size={13} />
            <span>افتراضي</span>
          </button>
        </div>
      </div>

      <div className="mp-pf-list">
        {items.map((item, idx) => {
          const displayValue =
            item.customLabel !== undefined ? item.customLabel : item.defaultLabel;
          return (
            <div
              key={item.key}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx !== null) {
                  handleMove(dragIdx, idx);
                  setDragIdx(null);
                }
              }}
              onDragEnd={() => setDragIdx(null)}
              className={`mp-pf-row${!item.visible ? ' is-hidden' : ''}${
                dragIdx === idx ? ' is-dragging' : ''
              }`}
            >
              <span className="mp-pf-grip" title="اسحب لإعادة الترتيب">
                <GripVertical size={14} />
              </span>

              <span className="mp-pf-num">{idx + 1}</span>

              <button
                type="button"
                onClick={() => handleToggleIncluded(idx)}
                className={`mp-pf-inc-btn${item.included ? ' is-on' : ' is-off'}`}
                title={item.included ? 'متضمنة في الباقة (اضغط للإلغاء)' : 'غير متضمنة في الباقة (اضغط للتفعيل)'}
                aria-label={item.included ? 'متضمنة' : 'غير متضمنة'}
              >
                {item.included ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={2.6} />}
                <span>{item.included ? 'مفعلة' : 'غير مفعلة'}</span>
              </button>

              <input
                type="text"
                className="mp-pf-input"
                value={displayValue}
                placeholder={item.defaultLabel}
                onChange={(e) => handleLabelChange(idx, e.target.value)}
                onBlur={() => handleLabelBlur(idx)}
              />

              <div className="mp-pf-actions">
                <button
                  type="button"
                  className="mp-he-icon-btn"
                  disabled={idx === 0}
                  onClick={() => handleMove(idx, idx - 1)}
                  title="تحريك للأعلى"
                  aria-label="تحريك للأعلى"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  className="mp-he-icon-btn"
                  disabled={idx === items.length - 1}
                  onClick={() => handleMove(idx, idx + 1)}
                  title="تحريك للأسفل"
                  aria-label="تحريك للأسفل"
                >
                  <ArrowDown size={13} />
                </button>
                {item.isCustom ? (
                  <button
                    type="button"
                    className="mp-he-icon-btn is-danger"
                    onClick={() => handleDeleteCustom(idx)}
                    title="حذف الميزة"
                    aria-label="حذف الميزة"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`mp-he-icon-btn${item.visible ? ' is-vis' : ''}`}
                    onClick={() => handleToggleVisible(idx)}
                    title={item.visible ? 'إخفاء من الكرت' : 'إظهار في الكرت'}
                    aria-label={item.visible ? 'إخفاء من الكرت' : 'إظهار في الكرت'}
                  >
                    {item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
