/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Phone,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Unlink,
} from 'lucide-react';
import { useDashboard, surfaceCardStyle, themedInputStyle } from './DashboardContext';
import { copyTextReliable, syncFromServer } from '../../utils/storage';
import {
  DashboardTelegramStatus,
  fetchDashboardTelegramStatusApi,
  linkDashboardTelegramApi,
  testDashboardTelegramApi,
  toggleDashboardTelegramApi,
  unlinkDashboardTelegramApi,
  verifyDashboardTelegramApi,
} from '../../utils/adminApi';
import { dashSectionMotion } from '../../utils/dashboardMotion';

const DEFAULT_TELEGRAM_PROXY_URL =
  'https://t.me/proxy?server=heremit.larval.nonce.rubricate.textbook.watchpinoyteleserye.com&port=1250&secret=eeeaa279236535275f4071a1279335415773332e616d617a6f6e6177732e636f6d&bot=@mtpro_xyz_bot&channel=@mtpro_xyz';

const CUSTOM_PROXY_STORAGE_KEY = 'menuplus_custom_telegram_proxy';

function sanitizeTelegramProxyLink(raw: string): string {
  const clean = String(raw || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .trim();
  if (!clean) return '';
  if (/^tg:\/\/proxy\?/i.test(clean)) {
    const query = clean.slice('tg://proxy?'.length);
    const params = new URLSearchParams(query);
    return params.get('server')?.trim() ? `tg://proxy?${query}` : '';
  }
  try {
    const candidate = /^t\.me\/proxy\?/i.test(clean) ? `https://${clean}` : clean;
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    const host = parsed.hostname.toLowerCase();
    if (host !== 't.me' && host !== 'telegram.me') return '';
    if (!parsed.pathname.toLowerCase().startsWith('/proxy')) return '';
    if (!parsed.searchParams.get('server')?.trim()) return '';
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return '';
  }
}

export interface TelegramPageProps {
  embedded?: boolean;
  onOpenOrderChannelSettings?: () => void;
}

export const TelegramPage: React.FC<TelegramPageProps> = ({
  embedded = false,
  onOpenOrderChannelSettings,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const { rid, rest, showToast, onRefresh, setActiveTab } = useDashboard();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<DashboardTelegramStatus | null>(null);
  const [phoneInput, setPhoneInput] = useState<string>(() => rest.telegramPhone || rest.ph || '');
  const [awaitingShare, setAwaitingShare] = useState(false);
  const [botUrl, setBotUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [customProxyUrl, setCustomProxyUrl] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem(CUSTOM_PROXY_STORAGE_KEY) || '';
      return sanitizeTelegramProxyLink(saved);
    } catch {
      return '';
    }
  });
  const [showCustomProxyForm, setShowCustomProxyForm] = useState(false);
  const [proxyDraft, setProxyDraft] = useState<string>(() => {
    try {
      return window.localStorage.getItem(CUSTOM_PROXY_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [proxyError, setProxyError] = useState('');

  const loadStatus = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetchDashboardTelegramStatusApi(rid);
        setStatus(res);
        if (res.telegramPhone && !awaitingShare) {
          setPhoneInput((prev) => prev || res.telegramPhone);
        }
        if (res.linked) {
          setAwaitingShare(false);
          setBotUrl('');
        }
      } catch (err: unknown) {
        if (!silent) {
          setError(
            err instanceof Error
              ? err.message || 'تعذر تحميل حالة الربط مع تيليجرام.'
              : 'تعذر تحميل حالة الربط مع تيليجرام.'
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [rid, awaitingShare]
  );

  useEffect(() => {
    void loadStatus(false);
  }, [rid]);

  // Poll automatically while waiting for owner to share their phone contact in the bot
  useEffect(() => {
    if (!awaitingShare || status?.linked) return;
    let active = true;

    const checkNow = async () => {
      try {
        const res = await fetchDashboardTelegramStatusApi(rid);
        if (!active) return;
        setStatus(res);
        if (res.linked) {
          setAwaitingShare(false);
          setBotUrl('');
          setInfoMsg('تم ربط رقمك مع بوت تيليجرام بنجاح! ستصلك طلبات متجرك فوراً ✓');
          showToast('تم تطبيق التغيرات');
          await syncFromServer();
          onRefresh();
        }
      } catch {
        // ignore transient poll errors
      }
    };

    const handleWake = () => {
      if (document.visibilityState !== 'hidden') {
        void checkNow();
      }
    };
    window.addEventListener('focus', handleWake);
    document.addEventListener('visibilitychange', handleWake);
    const timer = window.setInterval(checkNow, 2500);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', handleWake);
      document.removeEventListener('visibilitychange', handleWake);
    };
  }, [awaitingShare, status?.linked, rid, showToast, onRefresh]);

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    const cleanPhone = phoneInput.trim();
    if (!cleanPhone || cleanPhone.replace(/\D/g, '').length < 7) {
      setError('يرجى إدخال رقم هاتف صحيح أولاً.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await linkDashboardTelegramApi(rid, cleanPhone);
      if (!res.ok) {
        setError(res.message || 'تعذر بدء ربط تيليجرام.');
        return;
      }
      setBotUrl(res.botUrl || '');
      if (res.linked) {
        setAwaitingShare(false);
        setInfoMsg('تم ربط رقمك بنجاح ✓');
        showToast('تم تطبيق التغيرات');
        await syncFromServer();
        onRefresh();
        await loadStatus(true);
      } else {
        setAwaitingShare(true);
        setInfoMsg('افتح البوت وشارك رقم هاتفك لتفعيل استلام الطلبات.');
      }
    } catch {
      setError('حدث خطأ أثناء الاتصال بالخادم.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEnabled = async (nextEnabled: boolean) => {
    setError('');
    setToggling(true);
    try {
      await toggleDashboardTelegramApi(rid, nextEnabled);
      await syncFromServer();
      onRefresh();
      await loadStatus(true);
      showToast('تم تطبيق التغيرات');
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message || 'تعذر تحديث الإعداد.'
          : 'تعذر تحديث الإعداد.'
      );
    } finally {
      setToggling(false);
    }
  };

  const handleSendTestOrder = async () => {
    setError('');
    setInfoMsg('');
    setTesting(true);
    try {
      const res = await testDashboardTelegramApi(rid);
      if (res.ok) {
        setInfoMsg('تم إرسال طلب تجريبي إلى حسابك في تيليجرام ✓');
        showToast('تم إرسال الطلب التجريبي إلى تيليجرام ✓');
      } else {
        setError(res.message || 'تعذر إرسال الطلب التجريبي.');
      }
    } catch {
      setError('تعذر الاتصال بالخادم لإرسال الطلب التجريبي.');
    } finally {
      setTesting(false);
    }
  };

  const handleUnlink = async () => {
    setError('');
    setInfoMsg('');
    setUnlinking(true);
    try {
      await unlinkDashboardTelegramApi(rid);
      await syncFromServer();
      onRefresh();
      setAwaitingShare(false);
      setBotUrl('');
      setStatus((prev) =>
        prev ? { ...prev, linked: false, telegramUsername: '', telegramSendReady: false } : prev
      );
      showToast('تم تطبيق التغيرات');
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message || 'تعذر فك الربط.'
          : 'تعذر فك الربط.'
      );
    } finally {
      setUnlinking(false);
    }
  };

  const handleVerifyBot = async () => {
    setError('');
    setInfoMsg('');
    setVerifying(true);
    try {
      const res = await verifyDashboardTelegramApi(rid);
      if (res.status) {
        setStatus(res.status);
      }
      if (res.ok) {
        const msg = res.diagnosticMessage || 'اتصال البوت بالخادم سليم ✓';
        setInfoMsg(msg);
        showToast('اتصال البوت سليم ✓');
      } else {
        const msg = res.diagnosticMessage || 'تعذر التحقق من اتصال البوت.';
        setError(msg);
        showToast('توجد مشكلة في اتصال البوت');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message || 'تعذر فحص اتصال البوت بالخادم.'
          : 'تعذر فحص اتصال البوت بالخادم.'
      );
    } finally {
      setVerifying(false);
    }
  };

  const botTokenRejected = Boolean(status?.botConfigured && status?.botTokenValid === false);
  const botUnavailable = status && (!status.botConfigured || !status.botEnabled || botTokenRejected);
  const channelLabel =
    status?.orderChannel === 'telegram'
      ? 'عبر التليجرام فقط'
      : status?.orderChannel === 'whatsapp'
      ? 'عبر الواتساب فقط (تيليجرام متوقف)'
      : 'الاثنين معاً (تيليجرام + واتساب)';

  const platformProxyUrl = sanitizeTelegramProxyLink(status?.proxyUrl || '') || DEFAULT_TELEGRAM_PROXY_URL;
  const effectiveProxyUrl = customProxyUrl || platformProxyUrl;

  const applyCustomProxyValue = useCallback(
    (rawVal: string, closeForm: boolean) => {
      setProxyError('');
      const trimmed = rawVal.trim();
      if (!trimmed) {
        if (customProxyUrl) {
          setCustomProxyUrl('');
          try {
            window.localStorage.removeItem(CUSTOM_PROXY_STORAGE_KEY);
          } catch {
            // ignore storage error
          }
          showToast('تم حفظ التغيرات');
        }
        if (closeForm) setShowCustomProxyForm(false);
        return true;
      }
      const valid = sanitizeTelegramProxyLink(trimmed);
      if (!valid) {
        setProxyError(
          'الرابط غير صالح — يرجى لصق رابط بروكسي تيليجرام يبدأ بـ https://t.me/proxy? أو tg://proxy?'
        );
        return false;
      }
      if (valid !== customProxyUrl) {
        setCustomProxyUrl(valid);
        setProxyDraft(valid);
        try {
          window.localStorage.setItem(CUSTOM_PROXY_STORAGE_KEY, valid);
        } catch {
          // ignore storage error
        }
        showToast('تم حفظ التغيرات');
      }
      if (closeForm) setShowCustomProxyForm(false);
      return true;
    },
    [customProxyUrl, showToast]
  );

  const handleSaveCustomProxy = (e: React.FormEvent) => {
    e.preventDefault();
    applyCustomProxyValue(proxyDraft, true);
  };

  const proxyFlushRef = useRef<() => void>(() => {});
  proxyFlushRef.current = () => {
    if (showCustomProxyForm) {
      applyCustomProxyValue(proxyDraft, false);
    }
  };
  useEffect(() => {
    const onFlush = () => proxyFlushRef.current();
    window.addEventListener('menuplus_dashboard_flush_save', onFlush);
    return () => window.removeEventListener('menuplus_dashboard_flush_save', onFlush);
  }, []);

  const handleResetDefaultProxy = () => {
    setCustomProxyUrl('');
    setProxyDraft('');
    setProxyError('');
    try {
      window.localStorage.removeItem(CUSTOM_PROXY_STORAGE_KEY);
    } catch {
      // ignore storage error
    }
    showToast('تم تطبيق التغيرات');
  };

  const handleCopyProxyLink = () => {
    void copyTextReliable(effectiveProxyUrl).then((ok) => {
      showToast(ok ? 'تم نسخ رابط البروكسي ✓' : 'تعذر نسخ الرابط');
    });
  };

  return (
    <div style={embedded ? { display: 'flex', flexDirection: 'column', gap: '14px' } : { maxWidth: '640px', margin: '0 auto' }}>
      {!embedded && (
        <motion.div
          className="hd"
          style={{ marginBottom: '16px' }}
          {...dashSectionMotion(prefersReducedMotion, 0)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Send size={20} style={{ color: '#0088cc' }} />
              <span>إعداد التليجرام</span>
            </h2>
            {status && (
              <span
                className={`badge ${status.linked ? (status.enabled ? 'ok' : 'warn') : 'mute'}`}
                style={{ fontSize: '12px' }}
              >
                {status.linked
                  ? status.enabled
                    ? 'مربوط ويستقبل الطلبات ✓'
                    : 'مربوط (متوقف مؤقتاً)'
                  : 'غير مربوط'}
              </span>
            )}
          </div>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: '13.5px', lineHeight: 1.6 }}>
            ضع رقم هاتفك وشاركه مع بوت تيليجرام ليصلك كل طلب جديد يرسله الزبائن مباشرة إلى حسابك في تيليجرام.
          </p>
        </motion.div>
      )}

      {loading ? (
        <div className={embedded ? 'mp-set2-panel' : 'card'} style={embedded ? { padding: '28px', textAlign: 'center' } : { ...surfaceCardStyle, padding: '28px', textAlign: 'center' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--brand)', margin: '0 auto 8px' }} />
          <div className="muted" style={{ fontSize: '13.5px' }}>
            جاري التحقق من حالة الربط...
          </div>
        </div>
      ) : (
        <motion.div
          className={embedded ? 'mp-set2-panel' : 'card'}
          {...dashSectionMotion(prefersReducedMotion, 0.06)}
          style={embedded ? undefined : { ...surfaceCardStyle, padding: '22px' }}
        >
          {embedded && (
            <div className="mp-set2-panel-head">
              <div>
                <h2 className="mp-set2-panel-title">
                  <Send size={16} style={{ color: '#0088cc' }} />
                  <span>ربط بوت تيليجرام للطلبات</span>
                </h2>
                <p className="mp-set2-panel-sub">
                  ضع رقم هاتفك وشاركه مع البوت ليصلك كل طلب جديد مباشرة إلى حسابك في تيليجرام.
                </p>
              </div>
              {status && (
                <span
                  className={`badge ${status.linked ? (status.enabled ? 'ok' : 'warn') : 'mute'}`}
                  style={{ fontSize: '12px' }}
                >
                  {status.linked
                    ? status.enabled
                      ? 'مربوط ويستقبل الطلبات ✓'
                      : 'مربوط (متوقف مؤقتاً)'
                    : 'غير مربوط'}
                </span>
              )}
            </div>
          )}
          {botUnavailable && status?.orderChannel !== 'whatsapp' && (
            <div
              className={`mp-inline-status ${botTokenRejected ? 'is-err' : 'is-warn'}`}
              style={{ marginBottom: '16px' }}
            >
              <AlertCircle size={17} style={{ flexShrink: 0 }} />
              <span>
                {!status?.botConfigured
                  ? 'خدمة بوت تيليجرام غير مفعلة حالياً من إدارة المنصة.'
                  : botTokenRejected
                  ? 'توكن بوت تيليجرام مرفوض من خادم تيليجرام — يرجى تحديث التوكن الصحيح من @BotFather في إعدادات الأدمن.'
                  : 'تم إيقاف بوت تيليجرام مؤقتاً من إعدادات المنصة.'}
              </span>
            </div>
          )}

          {error && (
            <div className="mp-inline-status is-err" role="alert" style={{ marginBottom: '14px' }}>
              <AlertCircle size={17} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {infoMsg && !error && (
            <div className="mp-inline-status is-ok" style={{ marginBottom: '14px' }}>
              <CheckCircle2 size={17} style={{ flexShrink: 0 }} />
              <span>{infoMsg}</span>
            </div>
          )}

          {status?.linked ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                  padding: '14px 16px',
                  borderRadius: '14px',
                  background: 'var(--soft)',
                  border: '1px solid color-mix(in srgb, var(--brand) 28%, var(--line))',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: '#0088cc',
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '14.5px', color: 'var(--ink)' }}>
                      حساب تيليجرام مربوط بنجاح
                    </div>
                    <div className="muted" style={{ fontSize: '12.5px', marginTop: '2px' }} dir="ltr">
                      {status.telegramPhone}
                      {status.telegramUsername ? ` · @${status.telegramUsername}` : ''}
                    </div>
                  </div>
                </div>

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: toggling ? 'wait' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 700,
                    background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--line)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={status.enabled}
                    disabled={toggling}
                    onChange={(e) => void handleToggleEnabled(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--brand)' }}
                  />
                  <Bell size={14} style={{ color: status.enabled ? 'var(--brand)' : 'var(--muted)' }} />
                  <span>
                    {status.enabled ? 'استلام الطلبات مفعّل' : 'إشعارات الطلبات متوقفة'}
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn p"
                  disabled={testing || Boolean(botUnavailable)}
                  onClick={() => void handleSendTestOrder()}
                  style={{ gap: '7px' }}
                >
                  {testing ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  <span>
                    {testing ? 'جاري الإرسال...' : 'إرسال طلب تجريبي إلى تيليجرام'}
                  </span>
                </button>

                <button
                  type="button"
                  className="btn s d"
                  disabled={unlinking}
                  onClick={() => void handleUnlink()}
                  style={{ gap: '6px' }}
                >
                  {unlinking ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
                  <span>تغيير الرقم / فك الربط</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleLinkSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label className="f" style={{ margin: 0 }}>
                <span style={{ fontWeight: 800, fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone size={15} style={{ color: 'var(--brand)' }} />
                  <span>رقم هاتفك في تيليجرام</span>
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    setError('');
                  }}
                  placeholder="07XXXXXXXXX أو +9647XXXXXXXXX"
                  required
                  style={{ ...themedInputStyle, fontSize: '15px', fontWeight: 700, marginTop: '6px' }}
                />
                <small className="muted" style={{ display: 'block', marginTop: '5px', fontSize: '12px' }}>
                  أدخل رقم الهاتف المرتبط بحسابك في تيليجرام والذي تريد استلام إشعارات الطلبات عليه.
                </small>
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  className="btn p"
                  disabled={submitting || Boolean(botUnavailable)}
                  style={{ gap: '7px', fontWeight: 800 }}
                >
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  <span>
                    {submitting ? 'جاري التجهيز...' : 'ربط الرقم مع البوت'}
                  </span>
                </button>

                <button
                  type="button"
                  className="btn s"
                  onClick={() => void loadStatus(false)}
                  style={{ gap: '6px' }}
                >
                  <RefreshCw size={14} />
                  <span>تحديث الحالة</span>
                </button>
              </div>

              {awaitingShare && botUrl && (
                <div
                  style={{
                    marginTop: '6px',
                    padding: '16px',
                    borderRadius: '14px',
                    background: 'color-mix(in srgb, #0088cc 8%, var(--bg))',
                    border: '1.5px solid color-mix(in srgb, #0088cc 35%, var(--line))',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--ink)' }}>
                    الخطوة الأخيرة: شارك رقمك داخل البوت
                  </div>
                  <p className="muted" style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.65 }}>
                    {`اضغط على الزر أدناه لفتح بوت تيليجرام (@${status?.botUsername || 'MenuPlus_bot'})، ثم اضغط Start وبعدها اضغط زر «📱 مشاركة رقم هاتفي لاستقبال الطلبات». سيتم الربط هنا تلقائياً فور المشاركة.`}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <a
                      href={botUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn p"
                      style={{
                        background: '#0088cc',
                        borderColor: '#0088cc',
                        color: '#ffffff',
                        textDecoration: 'none',
                        gap: '7px',
                        fontWeight: 800,
                      }}
                    >
                      <ExternalLink size={15} />
                      <span>فتح البوت ومشاركة الرقم في تيليجرام</span>
                    </a>
                    <span className="muted" style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Loader2 size={13} className="animate-spin" />
                      <span>بانتظار مشاركة الرقم...</span>
                    </span>
                  </div>
                </div>
              )}
            </form>
          )}
        </motion.div>
      )}

      {!loading && (
        <motion.div
          className={embedded ? 'mp-set2-panel' : 'card'}
          {...dashSectionMotion(prefersReducedMotion, 0.06, true)}
          style={
            embedded
              ? undefined
              : {
                  ...surfaceCardStyle,
                  padding: '18px 20px',
                  marginTop: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={18} style={{ color: '#0088cc' }} />
              <b style={{ fontSize: '14.5px', color: 'var(--ink)' }}>
                بروكسي تيليجرام (لتشغيل البوت والتطبيق بسلاسة)
              </b>
            </div>
            {customProxyUrl && (
              <span className="badge ok" style={{ fontSize: '11.5px' }}>
                بروكسي مخصص مفعّل
              </span>
            )}
          </div>

          <p className="muted" style={{ margin: 0, fontSize: '13px', lineHeight: 1.65 }}>
            إذا كان تيليجرام يحتاج بروكسي على جهازك، اضغط الزر أدناه لإضافة البروكسي مباشرة إلى حسابك في تيليجرام، أو يمكنك إدخال أي رابط بروكسي آخر يعمل لديك.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <a
              href={effectiveProxyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn p"
              style={{
                background: '#0088cc',
                borderColor: '#0088cc',
                color: '#ffffff',
                textDecoration: 'none',
                gap: '7px',
                fontWeight: 800,
              }}
            >
              <ExternalLink size={15} />
              <span>إضافة بروكسي إلى تيليجرام الخاص بك</span>
            </a>

            <button
              type="button"
              className="btn s"
              onClick={handleCopyProxyLink}
              style={{ gap: '6px' }}
            >
              <Copy size={14} />
              <span>نسخ رابط البروكسي</span>
            </button>

            <button
              type="button"
              className="btn s"
              onClick={() => {
                setProxyError('');
                setShowCustomProxyForm((v) => !v);
              }}
              style={{ gap: '6px' }}
            >
              <Settings size={14} />
              <span>
                {showCustomProxyForm ? 'إخفاء تعديل البروكسي' : 'استخدام بروكسي آخر'}
              </span>
            </button>

            {customProxyUrl && (
              <button
                type="button"
                className="btn s"
                onClick={handleResetDefaultProxy}
                style={{ gap: '6px' }}
              >
                <RotateCcw size={14} />
                <span>العودة للبروكسي الافتراضي</span>
              </button>
            )}
          </div>

          {showCustomProxyForm && (
            <form
              onSubmit={handleSaveCustomProxy}
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <label className="f" style={{ margin: 0 }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800 }}>
                  رابط بروكسي تيليجرام البديل (https://t.me/proxy?... أو tg://proxy?...)
                </span>
                <input
                  type="text"
                  dir="ltr"
                  value={proxyDraft}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setProxyDraft(nextVal);
                    setProxyError('');
                    const valid = sanitizeTelegramProxyLink(nextVal);
                    if (valid && valid !== customProxyUrl) {
                      applyCustomProxyValue(valid, false);
                    }
                  }}
                  onBlur={() => {
                    if (proxyDraft.trim()) {
                      applyCustomProxyValue(proxyDraft, false);
                    }
                  }}
                  placeholder={platformProxyUrl}
                  style={{ ...themedInputStyle, fontSize: '13px', marginTop: '6px' }}
                />
              </label>
              {proxyError && (
                <div className="mp-inline-status is-err" role="alert">
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{proxyError}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button type="submit" className="btn p s" style={{ fontWeight: 800 }}>
                  اعتماد البروكسي
                </button>
                <button
                  type="button"
                  className="btn s"
                  onClick={() => {
                    setProxyDraft(platformProxyUrl);
                    setProxyError('');
                  }}
                >
                  تعبئة الرابط الافتراضي
                </button>
              </div>
            </form>
          )}
        </motion.div>
      )}

      {!loading && status && (
        <motion.div
          className={embedded ? 'mp-set2-panel' : 'card'}
          {...dashSectionMotion(prefersReducedMotion, 0.12, true)}
          style={
            embedded
              ? undefined
              : {
                  ...surfaceCardStyle,
                  padding: '18px 20px',
                  marginTop: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} style={{ color: status.telegramSendReady ? '#10b981' : '#f59e0b' }} />
              <b style={{ fontSize: '14.5px', color: 'var(--ink)' }}>
                التحقق من جاهزية خدمة إرسال الطلبات
              </b>
            </div>
            <span className={`badge ${status.telegramSendReady ? 'ok' : 'warn'}`} style={{ fontSize: '12px' }}>
              {status.telegramSendReady ? 'الخدمة جاهزة وتستقبل الطلبات ✓' : 'تحتاج إكمال التفعيل'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px' }}>
            {[
              {
                label: 'توكن البوت وتفعيله',
                ok: Boolean(status.botConfigured && status.botEnabled && status.botTokenValid !== false),
                detail: !status.botConfigured
                  ? 'غير مضبوط في المنصة بعد'
                  : status.botTokenValid === false
                  ? 'توكن البوت مرفوض من تيليجرام — حدّث التوكن من @BotFather'
                  : !status.botEnabled
                  ? 'معطل من إعدادات المنصة'
                  : `مفعّل (@${status.botUsername})`,
              },
              {
                label: 'اتصال البوت بالخادم',
                ok: Boolean(status.pollingActive && !status.lastPollError && !status.botTokenError),
                detail: status.lastPollError
                  ? status.lastPollError
                  : status.botTokenError
                  ? status.botTokenError
                  : status.lastSendError
                  ? `تعذر إرسال الرد: ${status.lastSendError}`
                  : status.pollingActive
                  ? 'يعمل ويستقبل رسائل الربط ✓'
                  : 'بانتظار التفعيل',
              },
              {
                label: 'ربط حساب المتجر',
                ok: status.linked,
                detail: status.linked
                  ? `مربوط (${status.telegramPhone || 'تم التحقق'})`
                  : status.orderChannel === 'whatsapp'
                  ? 'غير مربوط (اختياري لأن قناة الطلبات هي واتساب فقط)'
                  : 'غير مربوط — أدخل الرقم واضغط ربط الرقم مع البوت ثم شارك جهة الاتصال',
              },
              {
                label: 'قناة الطلبات المختارة',
                ok: true,
                detail: channelLabel,
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: '10px 12px',
                  borderRadius: '11px',
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)' }}>{item.label}</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: item.ok ? '#10b981' : '#f59e0b' }}>
                    {item.ok ? '✓ سليم' : '! غير مكتمل'}
                  </span>
                </div>
                <span style={{ fontSize: '11.5px', color: 'var(--muted)', wordBreak: 'break-word' }}>{item.detail}</span>
              </div>
            ))}
          </div>

          {status.orderChannel !== 'whatsapp' && (status.lastPollError || status.lastSendError) && (
            <div className="mp-inline-status is-err" style={{ marginTop: '2px' }}>
              <AlertCircle size={17} style={{ flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12.5px' }}>
                {status.lastPollError && (
                  <span>
                    <b>سبب توقف الاستقبال:</b> {status.lastPollError}
                  </span>
                )}
                {status.lastSendError && (
                  <span>
                    <b>آخر خطأ في الإرسال:</b> {status.lastSendError}
                  </span>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingTop: '6px', borderTop: '1px solid var(--line)' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              يمكنك فحص اتصال البوت مباشرة أو تغيير قناة الطلبات من الإعدادات.
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn s"
                disabled={verifying}
                onClick={() => void handleVerifyBot()}
                style={{ gap: '6px', fontSize: '12px', fontWeight: 800 }}
              >
                {verifying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                <span>
                  {verifying ? 'جاري الفحص...' : 'فحص اتصال البوت الآن'}
                </span>
              </button>
              <button
                type="button"
                className="btn s"
                onClick={() => {
                  if (onOpenOrderChannelSettings) {
                    onOpenOrderChannelSettings();
                  } else {
                    setActiveTab('set');
                  }
                }}
                style={{ gap: '6px', fontSize: '12px', fontWeight: 800 }}
              >
                <Settings size={13} />
                <span>{embedded ? 'تغيير قناة الطلبات' : 'تغيير قناة الطلبات من الإعدادات'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
