/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Check, Sparkles } from 'lucide-react';

export type UnifiedSetupStage =
  | 'signup-form'
  | 'signup-verify'
  | 'onboard-info'
  | 'onboard-hours'
  | 'onboard-cats'
  | 'onboard-items'
  | 'onboard-ready';

interface UnifiedSetupProgressBarProps {
  stage: UnifiedSetupStage;
  onBackToSignupForm?: () => void;
  integrated?: boolean;
  isStore?: boolean;
}

export const UnifiedSetupProgressBar: React.FC<UnifiedSetupProgressBarProps> = ({
  stage,
  onBackToSignupForm,
  integrated = true,
  isStore = false,
}) => {
  const UNIFIED_MILESTONES = [
    { id: 'account', label: 'الحساب' },
    { id: 'project', label: 'المشروع' },
    { id: 'hours', label: 'الأوقات' },
    { id: 'cats', label: 'الأقسام' },
    { id: 'items', label: isStore ? 'المنتجات' : 'العناصر' },
    { id: 'ready', label: 'جاهز' },
  ] as const;

  const STAGE_META: Record<
    UnifiedSetupStage,
    { pct: number; activeIndex: number; title: string }
  > = {
    'signup-form': {
      pct: 16,
      activeIndex: 0,
      title: isStore ? 'إنشاء الحساب وتجهيز المتجر' : 'إنشاء الحساب وتجهيز المنيو',
    },
    'signup-verify': {
      pct: 30,
      activeIndex: 0,
      title: isStore ? 'تأكيد الحساب لتجهيز المتجر' : 'تأكيد الحساب لتجهيز المنيو',
    },
    'onboard-info': {
      pct: 46,
      activeIndex: 1,
      title: 'بيانات المشروع الأساسية',
    },
    'onboard-hours': {
      pct: 62,
      activeIndex: 2,
      title: 'ساعات التواجد والعمل',
    },
    'onboard-cats': {
      pct: 78,
      activeIndex: 3,
      title: isStore ? 'إضافة أقسام المتجر' : 'إضافة أقسام المنيو',
    },
    'onboard-items': {
      pct: 92,
      activeIndex: 4,
      title: isStore ? 'إضافة المنتجات والأسعار' : 'إضافة العناصر والأصناف',
    },
    'onboard-ready': {
      pct: 100,
      activeIndex: 5,
      title: isStore ? 'المتجر جاهز للانطلاق' : 'المنيو جاهز للانطلاق',
    },
  };

  const meta = STAGE_META[stage];

  return (
    <div
      className={`aurora-progress-shell${integrated ? ' is-integrated' : ''}`}
      style={integrated ? undefined : { marginBottom: '20px' }}
    >
      <div className="aurora-progress-cloud-a" />
      <div className="aurora-progress-cloud-b" />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '11px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
            <span className="aurora-icon-badge">
              <Sparkles size={13} />
            </span>
            <span className="aurora-title">
              {meta.title}
            </span>
          </div>

          <span dir="ltr" className="aurora-pct-pill">
            {meta.pct}%
          </span>
        </div>

        {/* Neon Aurora Track */}
        <div className="aurora-track" style={{ marginBottom: '13px' }}>
          <div className="aurora-fill" style={{ width: `${meta.pct}%` }}>
            <div className="aurora-fill-shimmer" />
            <div className="aurora-tip-orb" />
          </div>
        </div>

        {/* Unified 6-Stage Milestones */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
            gap: '4px',
            textAlign: 'center',
          }}
        >
          {UNIFIED_MILESTONES.map((m, idx) => {
            const isDone = meta.activeIndex > idx || stage === 'onboard-ready';
            const isCurrent = meta.activeIndex === idx && stage !== 'onboard-ready';
            const canClickAccount = idx === 0 && stage === 'signup-verify' && Boolean(onBackToSignupForm);
            const stateClass = isDone ? 'is-done' : isCurrent ? 'is-current' : '';

            return (
              <button
                key={m.id}
                type="button"
                disabled={!canClickAccount}
                onClick={() => {
                  if (canClickAccount && onBackToSignupForm) {
                    onBackToSignupForm();
                  }
                }}
                style={{
                  border: 0,
                  background: 'none',
                  padding: '2px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: canClickAccount ? 'pointer' : 'default',
                }}
              >
                <span className={`aurora-step-dot ${stateClass}`.trim()}>
                  {isDone ? <Check size={11} strokeWidth={3} /> : idx + 1}
                </span>

                <span className={`aurora-step-label ${stateClass}`.trim()}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
