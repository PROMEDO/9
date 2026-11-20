/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import { HOME_LANGUAGES, HomeLanguageItem } from '../utils/i18n';
import { SupportedLanguage } from '../types';

interface LanguageSelectorProps {
  currentLang: SupportedLanguage;
  onChange: (lang: SupportedLanguage) => void;
  /** Custom background color, defaults to 'var(--surface)' to match navbar and platform buttons */
  buttonBg?: string;
  /** Custom text color, defaults to 'var(--ink)' */
  buttonTextColor?: string;
  /** Custom border, defaults to '1px solid var(--line)' */
  buttonBorder?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Compact mode for mobile header (Globe + Chevron in a small pill) */
  compact?: boolean;
}

// Pixel-perfect SVG Flags matching the rounded badges
export const LanguageFlag: React.FC<{
  flagCode: HomeLanguageItem['flagCode'];
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ flagCode, width = 24, height = 17, className, style }) => {
  const commonStyle: React.CSSProperties = {
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: '3.5px',
    display: 'inline-block',
    flexShrink: 0,
    boxShadow: '0 1px 2px rgba(0,0,0,0.20)',
    overflow: 'hidden',
    verticalAlign: 'middle',
    ...style,
  };

  switch (flagCode as string) {
    case 'iq':
    case 'ar':
      // Iraq Flag (علم العراق 🇮🇶)
      return (
        <svg viewBox="0 0 28 20" style={commonStyle} className={className} aria-label="العربية (العراق 🇮🇶)">
          <rect width="28" height="6.66" y="0" fill="#CE1126" />
          <rect width="28" height="6.66" y="6.66" fill="#FFFFFF" />
          <rect width="28" height="6.68" y="13.32" fill="#000000" />
          <text
            x="14"
            y="11.5"
            textAnchor="middle"
            fill="#007A3D"
            fontSize="4.8"
            fontWeight="bold"
            fontFamily="var(--font-body, 'Tajawal', sans-serif)"
            letterSpacing="-0.2"
          >
            الله أكبر
          </text>
        </svg>
      );

    case 'ku':
      // Kurdistan Flag (ئاڵای کوردستان ☀️)
      return (
        <svg viewBox="0 0 28 20" style={commonStyle} className={className} aria-label="کوردی">
          <rect width="28" height="6.66" y="0" fill="#ED1B24" />
          <rect width="28" height="6.66" y="6.66" fill="#FFFFFF" />
          <rect width="28" height="6.68" y="13.32" fill="#278E43" />
          {/* Golden Sun in center */}
          <circle cx="14" cy="10" r="3.2" fill="#FFC80A" />
          <g stroke="#FFC80A" strokeWidth="1.1" strokeLinecap="round">
            <line x1="14" y1="5.2" x2="14" y2="6.4" />
            <line x1="14" y1="13.6" x2="14" y2="14.8" />
            <line x1="9.2" y1="10" x2="10.4" y2="10" />
            <line x1="17.6" y1="10" x2="18.8" y2="10" />
            <line x1="10.6" y1="6.6" x2="11.4" y2="7.4" />
            <line x1="16.6" y1="12.6" x2="17.4" y2="13.4" />
            <line x1="10.6" y1="13.4" x2="11.4" y2="12.6" />
            <line x1="16.6" y1="7.4" x2="17.4" y2="6.6" />
          </g>
        </svg>
      );

    case 'gb':
    case 'en':
    case 'uk':
      // United Kingdom / English (Union Jack 🇬🇧)
      return (
        <svg viewBox="0 0 28 20" style={commonStyle} className={className} aria-label="English">
          <rect width="28" height="20" fill="#012169" />
          {/* White diagonal broad strokes */}
          <path d="M0 0l28 20M28 0L0 20" stroke="#ffffff" strokeWidth="3.6" />
          {/* Red diagonals */}
          <path d="M0 0l28 20M28 0L0 20" stroke="#C8102E" strokeWidth="1.8" />
          {/* White cross */}
          <path d="M14 0v20M0 10h28" stroke="#ffffff" strokeWidth="5.5" />
          {/* Red cross */}
          <path d="M14 0v20M0 10h28" stroke="#C8102E" strokeWidth="3.2" />
        </svg>
      );

    default:
      return (
        <span
          style={{
            ...commonStyle,
            background: 'var(--brand)',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: 800,
          }}
        >
          {String(flagCode || '🌐').toUpperCase()}
        </span>
      );
  }
};

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  currentLang,
  onChange,
  buttonBg,
  buttonTextColor,
  buttonBorder,
  className,
  style,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentItem =
    HOME_LANGUAGES.find((item) => item.code === currentLang) || HOME_LANGUAGES[0];

  const isDarkContext = Boolean(
    (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark' && !buttonBg?.includes('#f') && !buttonBg?.includes('#F') && !buttonBg?.includes('white')) ||
    (buttonBg && (buttonBg.includes('#0') || buttonBg.includes('#1')))
  );
  const isLightContext = !isDarkContext;

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (lang: SupportedLanguage) => {
    onChange(lang);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      {/* Pill-shaped Language Button with Globe icon and Chevron */}
      <button
        type="button"
        className={`lang-selector-btn ${className || ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        style={{
          background: buttonBg || 'var(--surface)',
          border: buttonBorder || '1px solid var(--line)',
          color: buttonTextColor || 'var(--ink)',
          height: compact ? '38px' : undefined,
          padding: compact ? '0 11px' : '7px 14px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: compact ? '5px' : '8px',
          cursor: 'pointer',
          borderRadius: '10px',
          transition: 'background-color 0.15s ease, border-color 0.15s ease',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          boxShadow: isLightContext ? '0 1px 3px rgba(15, 23, 42, 0.06)' : '0 2px 8px rgba(0, 0, 0, 0.25)',
          fontSize: '13px',
          fontWeight: 700,
          ...style,
        }}
      >
        <ChevronDown
          size={13}
          style={{
            transition: 'transform 0.2s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            opacity: 0.7,
            flexShrink: 0,
          }}
        />

        {!compact && (
          <span
            className="lang-selector-name"
            style={{
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.1px',
            }}
          >
            {currentItem.name}
          </span>
        )}

        <Globe
          size={compact ? 16 : 15}
          style={{
            opacity: 0.9,
            flexShrink: 0,
            color: 'currentColor',
          }}
        />
      </button>

      {/* Dropdown Menu listing exactly 3 languages in order: Arabic, Kurdish, English */}
      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            insetInlineEnd: 0,
            backgroundColor: isLightContext ? '#ffffff' : '#161b22',
            color: isLightContext ? '#0f172a' : '#f1f5f9',
            borderRadius: '14px',
            boxShadow: isLightContext
              ? '0 12px 30px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.06)'
              : '0 18px 45px rgba(0, 0, 0, 0.65), 0 4px 14px rgba(0, 0, 0, 0.35)',
            border: isLightContext ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.12)',
            minWidth: '160px',
            padding: '5px',
            zIndex: 99999,
            overflow: 'hidden',
          }}
        >
          {HOME_LANGUAGES.map((langItem, idx) => {
            const isLast = idx === HOME_LANGUAGES.length - 1;
            const isSelected = langItem.code === currentLang;

            return (
              <button
                key={langItem.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(langItem.code)}
                style={{
                  width: '100%',
                  backgroundColor: isSelected
                    ? isLightContext
                      ? '#f1f5f9'
                      : '#1c2430'
                    : isLightContext
                    ? '#ffffff'
                    : '#161b22',
                  border: 'none',
                  borderBottom: isLast
                    ? 'none'
                    : isLightContext
                    ? '1px solid #e2e8f0'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '10px 12px',
                  borderRadius: '9px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  cursor: 'pointer',
                  textAlign: 'start',
                  transition: 'background 0.12s ease',
                  marginBottom: isLast ? 0 : '2px',
                  color: isSelected
                    ? isLightContext ? '#0F766E' : '#34d399'
                    : isLightContext
                    ? '#0f172a'
                    : '#f1f5f9',
                }}
              >
                <span
                  style={{
                    fontSize: '13.5px',
                    fontWeight: isSelected ? 800 : 600,
                    direction: langItem.isRtl ? 'rtl' : 'ltr',
                  }}
                >
                  {langItem.name}
                </span>

                <LanguageFlag flagCode={langItem.flagCode} width={24} height={16} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
