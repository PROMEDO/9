/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AdminNote } from '../../types';
import {
  fetchNotesDocument,
  getAdminNotes,
  putItem,
  saveNoteToDocument,
} from '../../utils/storage';

interface OpenNotesScratchpadProps {
  authorName: string;
  pageTitle?: string;
  showToast: (msg: string) => void;
}

const SCRATCHPAD_ID = 'admin_scratchpad';

export const OpenNotesScratchpad: React.FC<OpenNotesScratchpadProps> = ({
  authorName,
  pageTitle,
  showToast,
}) => {
  const [content, setContent] = useState<string>(() => {
    const existing = getAdminNotes();
    const primary = existing.find((n) => n.id === SCRATCHPAD_ID);
    if (primary) return primary.content || '';
    if (existing.length > 0) {
      return existing
        .map((n) => [n.title && n.title !== 'ملاحظة جديدة' ? n.title : '', n.content || ''].filter(Boolean).join('\n'))
        .filter(Boolean)
        .join('\n\n──────────\n\n');
    }
    return '';
  });

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [editorHeightPx, setEditorHeightPx] = useState<number>(() => {
    if (typeof window === 'undefined') return 520;
    const vh = window.visualViewport?.height || window.innerHeight;
    return Math.max(220, Math.round(vh - 175));
  });

  const latestContentRef = useRef<string>(content);
  const lastPersistedRef = useRef<string>(content);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const buildNotePayload = useCallback(
    (text: string): AdminNote => ({
      id: SCRATCHPAD_ID,
      title: 'مسودة الملاحظات',
      content: text,
      author: authorName || 'الإدارة',
      category: 'general',
      priority: 'med',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
    }),
    [authorName]
  );

  // Track visualViewport height smoothly so mobile virtual keyboard never covers the cursor/textarea
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const recalc = () => {
      const vv = window.visualViewport;
      const visibleH = vv ? vv.height : window.innerHeight;
      const topOffset = containerRef.current ? Math.max(85, containerRef.current.getBoundingClientRect().top + 56) : 165;
      const available = Math.max(180, Math.round(visibleH - Math.min(topOffset, 175) - 18));
      setEditorHeightPx(available);
    };

    recalc();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', recalc);
    vv?.addEventListener('scroll', recalc);
    window.addEventListener('resize', recalc);

    return () => {
      vv?.removeEventListener('resize', recalc);
      vv?.removeEventListener('scroll', recalc);
      window.removeEventListener('resize', recalc);
    };
  }, []);

  // Load latest saved scratchpad from server on mount
  useEffect(() => {
    let active = true;
    void fetchNotesDocument().then((doc) => {
      if (!active || !doc || !Array.isArray(doc.notes)) return;
      const primary = doc.notes.find((n) => n.id === SCRATCHPAD_ID);
      if (primary) {
        const serverText = primary.content || '';
        if (latestContentRef.current === lastPersistedRef.current) {
          setContent(serverText);
          latestContentRef.current = serverText;
          lastPersistedRef.current = serverText;
          setSaveState('saved');
        }
      } else if (doc.notes.length > 0 && !latestContentRef.current.trim()) {
        const merged = doc.notes
          .map((n) => [n.title && n.title !== 'ملاحظة جديدة' ? n.title : '', n.content || ''].filter(Boolean).join('\n'))
          .filter(Boolean)
          .join('\n\n──────────\n\n');
        setContent(merged);
        latestContentRef.current = merged;
        lastPersistedRef.current = merged;
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const persistNow = useCallback(
    async (textToSave: string, manualToast: boolean) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setSaveState('saving');
      const note = buildNotePayload(textToSave);
      putItem(`notes/${SCRATCHPAD_ID}`, note);
      await saveNoteToDocument(note);
      lastPersistedRef.current = textToSave;
      setSaveState('saved');
      if (manualToast) {
        showToast('تم حفظ التغيرات');
      }
    },
    [buildNotePayload, showToast]
  );

  // Flush dirty content with keepalive on tab close / page hide / unmount
  useEffect(() => {
    const flushKeepAlive = () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const text = latestContentRef.current;
      if (text === lastPersistedRef.current) return;
      const note = buildNotePayload(text);
      try {
        putItem(`notes/${SCRATCHPAD_ID}`, note);
        if (typeof fetch !== 'undefined') {
          void fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'save', note }),
            keepalive: true,
          }).catch(() => {});
        }
        lastPersistedRef.current = text;
      } catch {
        // Ignore keepalive failures
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushKeepAlive();
      }
    };

    const onFlush = () => {
      if (autoSaveTimerRef.current || latestContentRef.current !== lastPersistedRef.current) {
        void persistNow(latestContentRef.current, true);
      }
    };

    window.addEventListener('beforeunload', flushKeepAlive);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('menuplus_admin_flush_save', onFlush);

    return () => {
      window.removeEventListener('beforeunload', flushKeepAlive);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('menuplus_admin_flush_save', onFlush);
      flushKeepAlive();
    };
  }, [buildNotePayload, persistNow]);

  const keepCaretVisible = () => {
    const el = textareaRef.current;
    if (!el) return;
    // If caret is near the end, ensure scroll stays smoothly anchored to bottom like chat/WhatsApp
    const nearEnd = (el.selectionStart ?? el.value.length) >= el.value.length - 80;
    if (nearEnd) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    setContent(nextVal);
    latestContentRef.current = nextVal;
    setSaveState('saving');
    keepCaretVisible();

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void persistNow(latestContentRef.current, true);
    }, 250);
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          flexWrap: 'wrap',
          background: 'transparent',
          paddingBottom: '2px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 'clamp(18px, 3vw, 22px)' }}>{pageTitle || 'الملاحظات'}</h1>
        <span className="muted" style={{ fontSize: '12px', fontWeight: 600 }}>
          {saveState === 'saving'
            ? 'جاري الحفظ تلقائياً...'
            : saveState === 'saved'
            ? 'تم الحفظ تلقائياً ✓'
            : 'حفظ تلقائي نشط'}
        </span>
      </div>

      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onFocus={() => {
          setTimeout(() => {
            const vv = window.visualViewport;
            if (vv) {
              const nextH = Math.max(180, Math.round(vv.height - 150));
              setEditorHeightPx(nextH);
            }
          }, 120);
        }}
        placeholder="اكتب ملاحظاتك وأفكارك هنا بحرية بأسطر لا نهائية... يتم الحفظ تلقائياً."
        style={{
          width: '100%',
          height: `${editorHeightPx}px`,
          minHeight: '190px',
          padding: '18px 20px',
          paddingBottom: '48px',
          borderRadius: '16px',
          border: '1.5px solid color-mix(in srgb, var(--line) 72%, transparent)',
          background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
          backdropFilter: 'blur(14px) saturate(1.25)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.25)',
          color: 'var(--ink)',
          fontSize: '15.5px',
          lineHeight: 1.85,
          resize: 'none',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          outline: 'none',
          boxSizing: 'border-box',
          scrollPaddingBottom: '48px',
        }}
      />
    </div>
  );
};
