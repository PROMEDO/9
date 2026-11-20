/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    setIsIOS(isIOSDevice && isSafari);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem('mp_pwa_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || dismissed || (!isInstallable && !isIOS)) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem('mp_pwa_dismissed', '1');
    } catch {
      // ignore storage restrictions
    }
  };

  return (
    <>
      <div
        dir="rtl"
        style={{
          position: 'fixed',
          bottom: '16px',
          insetInlineStart: '16px',
          zIndex: 90,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px 6px 8px',
          borderRadius: '14px',
          background: 'rgba(6, 28, 21, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          boxShadow: '0 10px 26px rgba(0, 0, 0, 0.32)',
          color: '#f8fafc',
        }}
      >
        <img
          src="/assets/aistudio/icon_f95f5a07.png"
          alt="منيو بلس"
          style={{ width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0 }}
        />
        <button
          type="button"
          onClick={() => (isInstallable ? void install() : setShowIOSGuide(true))}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#10B981',
            color: '#052e16',
            border: 0,
            borderRadius: '9px',
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <Download size={13} />
          <span>تثبيت التطبيق</span>
        </button>
        <button
          type="button"
          aria-label="إغلاق"
          onClick={handleDismiss}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '8px',
            background: 'transparent',
            border: 0,
            color: '#94a3b8',
            cursor: 'pointer',
          }}
        >
          <X size={14} />
        </button>
      </div>

      {showIOSGuide && (
        <div
          dir="rtl"
          onClick={() => setShowIOSGuide(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(0, 0, 0, 0.55)',
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
              maxWidth: '360px',
              background: 'var(--surface, #0e1915)',
              color: 'var(--ink, #f8fafc)',
              border: '1px solid var(--line, rgba(255,255,255,0.14))',
              borderRadius: '18px',
              padding: '20px',
              boxShadow: '0 20px 44px rgba(0, 0, 0, 0.45)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <img
                src="/assets/aistudio/icon_f95f5a07.png"
                alt="منيو بلس"
                style={{ width: '40px', height: '40px', borderRadius: '11px' }}
              />
              <div>
                <b style={{ display: 'block', fontSize: '15px' }}>
                  إضافة إلى الشاشة الرئيسية
                </b>
                <span style={{ fontSize: '12px', color: 'var(--muted, #94a3b8)' }}>
                  ثبّت منيو بلس كتطبيق على هاتفك الآيفون
                </span>
              </div>
            </div>
            <ol style={{ margin: '0 0 16px', paddingInlineStart: '20px', fontSize: '13px', lineHeight: 1.7 }}>
              <li>
                اضغط على زر المشاركة{' '}
                <Share size={13} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                في شريط Safari بالأسفل.
              </li>
              <li>
                مرر للأسفل واختر{' '}
                <b>إضافة إلى الصفحة الرئيسية (Add to Home Screen)</b>.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="btn p"
              style={{ width: '100%', justifyContent: 'center', fontWeight: 800 }}
            >
              حسناً
            </button>
          </div>
        </div>
      )}
    </>
  );
};
