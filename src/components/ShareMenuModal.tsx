/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  MessageCircle,
  Send,
  Share2,
  X,
} from 'lucide-react';
import { copyTextReliable } from '../utils/storage';

export interface ShareMenuPalette {
  bg?: string;
  card?: string;
  ink?: string;
  muted?: string;
  line?: string;
  soft?: string;
  brand?: string;
  onBrand?: string;
}

interface ShareMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuName: string;
  menuUrl: string;
  description?: string;
  onCopied?: (msg: string) => void;
  palette?: ShareMenuPalette;
  isStore?: boolean;
}

export const ShareMenuModal: React.FC<ShareMenuModalProps> = ({
  isOpen,
  onClose,
  menuName,
  menuUrl,
  description,
  onCopied,
  palette,
  isStore = false,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const cleanUrl = (menuUrl || window.location.href).trim();
  const title = (menuName || (isStore ? 'المتجر الإلكتروني' : 'المنيو الإلكتروني')).trim();
  const shareText = description?.trim()
    ? `${title} — ${description.trim()}`
    : isStore
    ? `تصفح متجر ${title} واطلب الآن بسهولة`
    : `تصفح منيو ${title} واطلب الآن بسهولة`;

  const encodedUrl = encodeURIComponent(cleanUrl);
  const encodedText = encodeURIComponent(shareText);
  const encodedWaText = encodeURIComponent(`${shareText}\n${cleanUrl}`);

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopy = async () => {
    const ok = await copyTextReliable(cleanUrl);
    if (ok) {
      setCopied(true);
      onCopied?.(isStore ? 'تم نسخ رابط المتجر للمشاركة ✓' : 'تم نسخ رابط المنيو للمشاركة ✓');
      setTimeout(() => setCopied(false), 2200);
    } else {
      onCopied?.('تعذر نسخ الرابط، انسخه يدوياً من المربع');
    }
  };

  const handleNativeShare = async () => {
    if (!canNativeShare) {
      void handleCopy();
      return;
    }
    try {
      await navigator.share({
        title,
        text: shareText,
        url: cleanUrl,
      });
    } catch {
      // User dismissed share sheet — ignore silently
    }
  };

  const cardBg = palette?.card || 'var(--surface, #ffffff)';
  const innerBg = palette?.bg || 'var(--bg, #f8fafc)';
  const ink = palette?.ink || 'var(--ink, #0f172a)';
  const muted = palette?.muted || 'var(--muted, #64748b)';
  const line = palette?.line || 'var(--line, #e2e8f0)';
  const soft = palette?.soft || 'var(--soft, rgba(16, 185, 129, 0.12))';
  const brand = palette?.brand || 'var(--brand, #0f766e)';
  const onBrand = palette?.onBrand || 'var(--on-brand, #ffffff)';

  const socialChannels = [
    {
      id: 'whatsapp',
      label: 'واتساب',
      href: `https://wa.me/?text=${encodedWaText}`,
      bg: 'rgba(37, 211, 102, 0.14)',
      border: 'rgba(37, 211, 102, 0.38)',
      color: '#16a34a',
      icon: <MessageCircle size={18} />,
    },
    {
      id: 'telegram',
      label: 'تيليجرام',
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      bg: 'rgba(14, 165, 233, 0.14)',
      border: 'rgba(14, 165, 233, 0.36)',
      color: '#0284c7',
      icon: <Send size={17} />,
    },
    {
      id: 'facebook',
      label: 'فيسبوك',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      bg: 'rgba(37, 99, 235, 0.13)',
      border: 'rgba(37, 99, 235, 0.34)',
      color: '#2563eb',
      icon: (
        <span style={{ fontWeight: 900, fontSize: '16px', lineHeight: 1 }}>f</span>
      ),
    },
    {
      id: 'x',
      label: 'منصة X',
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
      bg: soft,
      border: line,
      color: ink,
      icon: (
        <span style={{ fontWeight: 900, fontSize: '15px', lineHeight: 1 }}>𝕏</span>
      ),
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isStore ? 'مشاركة المتجر' : 'مشاركة المنيو'}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(15, 23, 42, 0.56)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '460px',
          background: cardBg,
          color: ink,
          borderRadius: '22px',
          border: `1px solid ${line}`,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.28)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: soft,
                color: brand,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Share2 size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '16.5px',
                  fontWeight: 900,
                  color: ink,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {isStore ? `مشاركة متجر ${title}` : `مشاركة منيو ${title}`}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: muted }}>
                انسخ الرابط أو شاركه مباشرة عبر تطبيقات التواصل الاجتماعي
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              border: `1px solid ${line}`,
              background: innerBg,
              color: ink,
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Copy Link Bar */}
        <div
          style={{
            background: innerBg,
            border: `1px solid ${line}`,
            borderRadius: '14px',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <input
            type="text"
            className="pm-plain-input"
            readOnly
            dir="ltr"
            value={cleanUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={isStore ? 'رابط المتجر' : 'رابط المنيو'}
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              background: 'transparent',
              color: ink,
              fontSize: '12.5px',
              fontWeight: 700,
              outline: 'none',
              padding: '4px 4px',
            }}
          />
          <button
            type="button"
            onClick={() => void handleCopy()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: 0,
              borderRadius: '10px',
              padding: '8px 13px',
              background: copied ? '#10b981' : brand,
              color: copied ? '#ffffff' : onBrand,
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s ease',
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            <span>
              {copied ? 'تم النسخ' : 'نسخ الرابط'}
            </span>
          </button>
        </div>

        {/* Social Share Grid */}
        <div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 800,
              color: muted,
              marginBottom: '8px',
            }}
          >
            مشاركة عبر السوشيال ميديا:
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '8px',
            }}
          >
            {socialChannels.map((ch) => (
              <a
                key={ch.id}
                href={ch.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: ch.bg,
                  border: `1px solid ${ch.border}`,
                  color: ch.color,
                  fontSize: '13px',
                  fontWeight: 800,
                  textDecoration: 'none',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  {ch.icon}
                  <span>{ch.label}</span>
                </span>
                <ExternalLink size={13} style={{ opacity: 0.7 }} />
              </a>
            ))}
          </div>
        </div>

        {/* Native Share + Bio/Story Tip */}
        {canNativeShare && (
          <button
            type="button"
            onClick={() => void handleNativeShare()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '11px 14px',
              borderRadius: '12px',
              border: `1px solid ${line}`,
              background: soft,
              color: ink,
              fontSize: '13.5px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <Share2 size={16} />
            <span>
              مشاركة عبر تطبيقات الجهاز (إنستقرام / سناب / رسائل...)
            </span>
          </button>
        )}

        <div
          style={{
            fontSize: '11.5px',
            color: muted,
            lineHeight: 1.55,
            background: innerBg,
            borderRadius: '11px',
            padding: '9px 12px',
            border: `1px solid ${line}`,
          }}
        >
          {isStore
            ? '💡 لمشاركة المتجر في إنستقرام أو تيك توك أو سناب شات، اضغط على «نسخ الرابط» ثم الصقه في البايو أو ملصق الرابط في الستوري.'
            : '💡 لمشاركة المنيو في إنستقرام أو تيك توك أو سناب شات، اضغط على «نسخ الرابط» ثم الصقه في البايو أو ملصق الرابط في الستوري.'}
        </div>
      </div>
    </div>
  );
};
