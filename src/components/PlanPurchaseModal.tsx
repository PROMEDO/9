/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Check, Copy, CreditCard, MessageCircle, Smartphone, Sparkles, X } from 'lucide-react';
import { PricingPlan, SiteSettings, SupportedLanguage } from '../types';
import { copyTextReliable, waLink } from '../utils/storage';
import { getLocalizedCurrencyUnit, trByLang } from '../utils/i18n';
import { getLocalizedPlanName } from '../utils/plans';

interface PlanPurchaseModalProps {
  isOpen: boolean;
  plan: PricingPlan | null;
  site: SiteSettings;
  billingCycle?: 'monthly' | 'annual';
  restaurantName?: string;
  lang?: SupportedLanguage;
  onClose: () => void;
}

export const PlanPurchaseModal: React.FC<PlanPurchaseModalProps> = ({
  isOpen,
  plan,
  site,
  billingCycle = 'monthly',
  restaurantName,
  lang = 'ar',
  onClose,
}) => {
  const tr = (ar: string, ku: string, en: string) => trByLang(lang, ar, ku, en);
  const [copiedKey, setCopiedKey] = useState<'zain' | 'qi' | null>(null);

  if (!isOpen || !plan) return null;

  const isAnnual = billingCycle === 'annual';
  const planTitle = getLocalizedPlanName(plan, lang);
  const currencyUnit = getLocalizedCurrencyUnit('د.ع', lang);
  const priceValue = isAnnual
    ? Number(plan.annualPr || Math.round((Number(plan.pr) || 0) * 11))
    : Number(plan.pr || 0);
  const zainCashAccount = String(site.zainCashNumber || site.supportWhatsapp || site.wa || '07724799679').trim();
  const qiCardAccount = String(site.qiCardNumber || '5284 7100 3920 1188').trim();
  const supportPhone = String(site.supportWhatsapp || site.wa || '07724799679').trim();

  const handleCopy = async (val: string, key: 'zain' | 'qi') => {
    const ok = await copyTextReliable(val);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2200);
    }
  };

  const whatsappMessage = [
    tr(
      `مرحباً فريق منيو بلس، أرغب بالاشتراك وتفعيل باقة "${planTitle}".`,
      `سڵاو تیمی مینیۆ پڵەس، دەمەوێت بەشداری بکەم و پاکێجی "${planTitle}" چالاک بکەم.`,
      `Hello Menu+ team, I would like to subscribe and activate the "${planTitle}" plan.`
    ),
    restaurantName ? `${tr('اسم المشروع', 'ناوی پڕۆژە', 'Business name')}: ${restaurantName}` : '',
    `${tr('دورة الفوترة', 'خولی پارەدان', 'Billing cycle')}: ${
      isAnnual
        ? tr('سنوي (11 شهر + شهر مجاني)', 'ساڵانە (١١ مانگ + ١ مانگی بەخۆڕایی)', 'Annual (11 months + 1 month free)')
        : tr('شهري', 'مانگانە', 'Monthly')
    }`,
    priceValue > 0 ? `${tr('المبلغ المطلوب', 'بڕی پێویست', 'Amount due')}: ${priceValue.toLocaleString('en-US')} ${currencyUnit}` : '',
    tr(
      'سأقوم بتحويل المبلغ عبر زين كاش / كي كارد وإرسال وصل الدفع لتفعيل الباقة.',
      'بڕە پارەکە لە ڕێگەی زەین کاش / کی کاردەوە دەنێرم و پسووڵەی پارەدان دەنێرم بۆ چالاککردنی پاکێجەکە.',
      'I will transfer the amount via ZainCash / QiCard and send the payment receipt to activate the plan.'
    ),
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      className="ajax-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr(`شراء وتفعيل ${planTitle}`, `کڕین و چالاککردنی ${planTitle}`, `Buy and activate ${planTitle}`)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ajax-box"
        style={{
          maxWidth: '460px',
          textAlign: 'start',
          padding: '20px',
          borderRadius: '18px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'var(--soft)',
                color: 'var(--brand)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Sparkles size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                {tr('شراء وتفعيل الباقة', 'کڕین و چالاککردنی پاکێج', 'Purchase & Activate Plan')}
              </h3>
              <div className="muted" style={{ fontSize: '12px' }}>
                {planTitle}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('إغلاق', 'داخستن', 'Close')}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
              color: 'var(--muted)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Plan Price Summary */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '12px',
            border: '1px solid color-mix(in srgb, var(--brand) 32%, var(--line))',
            background: 'var(--soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: '14px' }}>{planTitle}</div>
            <div className="muted" style={{ fontSize: '11.5px' }}>
              {isAnnual
                ? tr('اشتراك سنوي (توفير شهر كامل مجاناً)', 'بەشداریی ساڵانە (مانگێک بەخۆڕایی)', 'Annual subscription (1 month free)')
                : tr('اشتراك شهري قابل للتجديد', 'بەشداریی مانگانەی نوێبووەوە', 'Renewable monthly subscription')}
            </div>
          </div>
          <div style={{ fontWeight: 900, fontSize: '18px', color: 'var(--brand)' }} className="tabular-nums">
            {priceValue > 0 ? `${priceValue.toLocaleString('en-US')} ${currencyUnit}` : tr('مجاناً', 'بەخۆڕایی', 'Free')}
          </div>
        </div>

        {/* ZainCash & QiCard Details */}
        <div style={{ fontSize: '12.5px', fontWeight: 800, marginBottom: '8px' }}>
          {tr('طرق الدفع المتوفرة (العراق)', 'ڕێگاکانی پارەدانی بەردەست (عێراق)', 'Available payment methods (Iraq)')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '11px',
              border: '1px solid var(--line)',
              background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
              <span
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '9px',
                  background: 'rgba(16, 185, 129, 0.14)',
                  color: '#10b981',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Smartphone size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '13px' }}>
                  {tr('زين كاش (ZainCash)', 'زەین کاش (ZainCash)', 'ZainCash')}
                </div>
                <div dir="ltr" className="tabular-nums" style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                  {zainCashAccount}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn s"
              onClick={() => void handleCopy(zainCashAccount, 'zain')}
              style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
            >
              {copiedKey === 'zain' ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedKey === 'zain' ? tr('تم النسخ', 'کۆپی کرا', 'Copied') : tr('نسخ', 'کۆپی', 'Copy')}</span>
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '11px',
              border: '1px solid var(--line)',
              background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
              <span
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '9px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#d97706',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <CreditCard size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '13px' }}>
                  {tr('كي كارد / ماستركارد الرافدين (QiCard)', 'کی کارد / ماستەرکاردی ڕافیدەین (QiCard)', 'QiCard / Rafidain MasterCard')}
                </div>
                <div dir="ltr" className="tabular-nums" style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                  {qiCardAccount}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn s"
              onClick={() => void handleCopy(qiCardAccount.replace(/\s+/g, ''), 'qi')}
              style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
            >
              {copiedKey === 'qi' ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedKey === 'qi' ? tr('تم النسخ', 'کۆپی کرا', 'Copied') : tr('نسخ', 'کۆپی', 'Copy')}</span>
            </button>
          </div>
        </div>

        <p className="muted" style={{ fontSize: '12px', margin: '0 0 14px', lineHeight: 1.6 }}>
          {(lang === 'ar' && site.paymentNote) ||
            tr(
              'بعد إتمام التحويل يرجى إرسال صورة وصل الدفع عبر الواتساب لتفعيل الباقة على حسابك فوراً.',
              'دوای ناردنی پارە، تکایە وێنەی پسووڵەی پارەدان لە ڕێگەی واتساپەوە بنێرە بۆ چالاککردنی خێرای پاکێجەکە.',
              'After transferring, please send a photo of your payment receipt via WhatsApp to activate your plan right away.'
            )}
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a
            href={waLink(supportPhone, whatsappMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn p"
            style={{
              flex: 1,
              background: '#1f9d55',
              borderColor: '#15803d',
              color: '#ffffff',
              justifyContent: 'center',
            }}
          >
            <MessageCircle size={16} />
            <span>{tr('تواصل عبر واتساب للشراء', 'پەیوەندی لە ڕێگەی واتساپ بۆ کڕین', 'Contact via WhatsApp to buy')}</span>
          </a>
          <button type="button" className="btn" onClick={onClose}>
            {tr('إغلاق', 'داخستن', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};
