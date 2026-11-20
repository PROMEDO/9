/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Sparkles, Check, RefreshCw, Search, ImageOff } from 'lucide-react';

import { searchSuggestedImages } from '../utils/storage';

interface ImageSuggestionPickerProps {
  productName: string;
  categoryName?: string;
  currentImage?: string;
  onSelect: (imageUrl: string) => void;
  titleLabel?: string;
}

interface SuggestedPhoto {
  id?: string;
  name?: string;
  url: string;
  thumb?: string;
}

const DEFAULT_SAMPLE_PHOTOS: SuggestedPhoto[] = [
  { name: 'برجر لحم سماش', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80' },
  { name: 'بيتزا بيبروني', url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80' },
  { name: 'كيكة شوكولاتة', url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80' },
  { name: 'دجاج كريسبي', url: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=600&q=80' },
  { name: 'بطاطا فرايز', url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80' },
  { name: 'قهوة لاتيه', url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=80' },
  { name: 'مشاوي وكباب', url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=600&q=80' },
  { name: 'مشروبات باردة', url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80' },
];

export const ImageSuggestionPicker: React.FC<ImageSuggestionPickerProps> = ({
  productName,
  categoryName,
  currentImage,
  onSelect,
  titleLabel,
}) => {
  const [suggestions, setSuggestions] = useState<SuggestedPhoto[]>(DEFAULT_SAMPLE_PHOTOS);
  const [loading, setLoading] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [hasSearchedWithQuery, setHasSearchedWithQuery] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [seenUrls, setSeenUrls] = useState<string[]>([]);

  const effectiveQuery = (customQuery.trim() || `${productName} ${categoryName || ''}`).trim();

  const fetchSuggestions = async (overrideQuery?: string, isRefresh = false) => {
    const q = (overrideQuery !== undefined ? overrideQuery : effectiveQuery).trim();
    const nextSeed = isRefresh ? refreshSeed + 1 : 0;
    const nextOffset = isRefresh ? nextSeed * 8 : 0;
    const excludeList = isRefresh ? seenUrls.slice(-32) : [];

    if (isRefresh) {
      setRefreshSeed(nextSeed);
    } else {
      setRefreshSeed(0);
    }

    setLoading(true);
    setHasSearchedWithQuery(Boolean(q));
    try {
      const results = await searchSuggestedImages(q, 12, nextOffset, nextSeed, excludeList);
      if (Array.isArray(results) && results.length > 0) {
        setSuggestions(
          results.map((r) => ({
            ...r,
            name: r.title || q || 'صورة مقترحة',
          }))
        );
        setSeenUrls((prev) =>
          isRefresh
            ? Array.from(new Set([...prev, ...results.map((r) => r.url)])).slice(-40)
            : results.map((r) => r.url)
        );
        setLoading(false);
        return;
      }
    } catch {
      // Fallback only if offline and query is empty
    }
    if (!q) {
      setSuggestions(DEFAULT_SAMPLE_PHOTOS);
    } else if (!isRefresh) {
      setSuggestions([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (customQuery.trim()) return;
    const timer = setTimeout(() => {
      void fetchSuggestions(`${productName} ${categoryName || ''}`.trim(), false);
    }, 300);
    return () => clearTimeout(timer);
  }, [productName, categoryName]);

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderRadius: '14px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Top Header Row + Symmetrical Refresh Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: '12.5px',
            fontWeight: 800,
            color: 'var(--brand-ink, var(--brand))',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: 0,
          }}
        >
          <Sparkles size={14} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titleLabel || 'اقتراحات صور حسب الاسم'}
            {productName.trim() ? ` (${productName.trim()})` : ''}
          </span>
        </span>

        <button
          type="button"
          onClick={() => void fetchSuggestions(undefined, true)}
          disabled={loading}
          style={{
            background: 'var(--soft)',
            border: '1px solid var(--line)',
            borderRadius: '9px',
            height: '32px',
            padding: '0 12px',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--brand-ink, var(--brand))',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            flexShrink: 0,
            transition: 'background-color 0.15s ease',
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>تحديث</span>
        </button>
      </div>

      {/* Symmetrical Search Bar + Submit Button */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: '8px',
          alignItems: 'stretch',
        }}
      >
        <input
          type="text"
          value={customQuery}
          onChange={(e) => setCustomQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void fetchSuggestions(customQuery);
            }
          }}
          placeholder="ابحث باسم الصنف (مثال: بيتزا، كيكة، برجر، قهوة...)"
          style={{
            width: '100%',
            height: '38px',
            padding: '0 12px',
            borderRadius: '10px',
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            fontSize: '12.5px',
          }}
        />
        <button
          type="button"
          onClick={() => void fetchSuggestions(customQuery || effectiveQuery)}
          disabled={loading}
          style={{
            height: '38px',
            padding: '0 14px',
            background: 'var(--brand)',
            color: 'var(--on-brand)',
            border: '1px solid var(--brand)',
            borderRadius: '10px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '12.5px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          <Search size={14} />
          <span>بحث</span>
        </button>
      </div>

      {/* Results Grid or Helpful Empty State */}
      {suggestions.length === 0 && !loading ? (
        <div
          style={{
            padding: '18px 12px',
            borderRadius: '11px',
            border: '1px dashed var(--line)',
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '12.5px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <ImageOff size={20} style={{ opacity: 0.7 }} />
          <span>
            {hasSearchedWithQuery
              ? 'لم يتم العثور على صور مطابقة تماماً — جرّب كلمة بحث أخرى أو ارفع صورة مخصصة من جهازك.'
              : 'اكتب اسم الصنف للبحث أو ارفع صورة من جهازك.'}
          </span>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '8px',
          }}
        >
          {suggestions.slice(0, 12).map((item, idx) => {
            const isSelected = currentImage === item.url;
            return (
              <button
                key={item.id || `${idx}_${item.url}`}
                type="button"
                title={item.name}
                onClick={() => onSelect(item.url)}
                style={{
                  position: 'relative',
                  aspectRatio: '1',
                  borderRadius: '11px',
                  overflow: 'hidden',
                  border: isSelected ? '2.5px solid var(--brand)' : '1px solid var(--line)',
                  padding: 0,
                  background: 'var(--surface)',
                  cursor: 'pointer',
                  transition: 'transform 0.14s ease, border-color 0.14s ease',
                }}
              >
                <img
                  src={item.thumb || item.url}
                  alt={item.name}
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />
                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(16, 185, 129, 0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                    }}
                  >
                    <Check size={20} strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
