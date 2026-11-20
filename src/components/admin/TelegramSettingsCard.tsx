/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Send,
  Wifi,
  XCircle,
} from 'lucide-react';
import {
  fetchTelegramSettingsApi,
  sendTelegramTestMessageApi,
  TelegramAdminConfig,
  testTelegramBotApi,
  updateTelegramSettingsApi,
} from '../../utils/adminApi';

interface TelegramSettingsCardProps {
  canManageSettings: boolean;
  showToast: (msg: string) => void;
}

export const TelegramSettingsCard: React.FC<TelegramSettingsCardProps> = ({
  canManageSettings,
  showToast,
}) => {
  const [config, setConfig] = useState<TelegramAdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Editable form state
  const [enabled, setEnabled] = useState(true);
  const [botUsername, setBotUsername] = useState('MenuPlusBot');
  const [botTokenDraft, setBotTokenDraft] = useState('');
  const [showTokenDraft, setShowTokenDraft] = useState(false);
  const [clearTokenOverride, setClearTokenOverride] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  const [welcomeSharePhoneText, setWelcomeSharePhoneText] = useState('');
  const [verifiedSuccessText, setVerifiedSuccessText] = useState('');
  const [orderHeaderText, setOrderHeaderText] = useState('');
  const [orderFooterText, setOrderFooterText] = useState('');

  // Test message sender state
  const [testTarget, setTestTarget] = useState('');
  const [testCustomMsg, setTestCustomMsg] = useState('');
  const [testSendStatus, setTestSendStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const hydratedSigRef = useRef<string>('');
  const autoSaveTimerRef = useRef<number | null>(null);

  const buildTelegramDraftSig = useCallback(
    (vals: {
      enabled: boolean;
      botUsername: string;
      botTokenDraft: string;
      clearTokenOverride: boolean;
      proxyUrl: string;
      welcomeSharePhoneText: string;
      verifiedSuccessText: string;
      orderHeaderText: string;
      orderFooterText: string;
    }) =>
      JSON.stringify({
        enabled: vals.enabled,
        botUsername: vals.botUsername.trim().replace(/^@+/, '') || 'MenuPlusBot',
        botTokenDraft: vals.botTokenDraft.trim(),
        clearTokenOverride: vals.clearTokenOverride,
        proxyUrl: vals.proxyUrl.trim(),
        welcomeSharePhoneText: vals.welcomeSharePhoneText,
        verifiedSuccessText: vals.verifiedSuccessText,
        orderHeaderText: vals.orderHeaderText,
        orderFooterText: vals.orderFooterText,
      }),
    []
  );

  const hydrateForm = useCallback(
    (cfg: TelegramAdminConfig) => {
      const nextEnabled = cfg.enabled !== false;
      const nextUsername = cfg.botUsername || 'MenuPlusBot';
      const nextProxy = cfg.proxyUrl || '';
      const nextWelcome = cfg.welcomeSharePhoneText || '';
      const nextVerified = cfg.verifiedSuccessText || '';
      const nextHeader = cfg.orderHeaderText || '';
      const nextFooter = cfg.orderFooterText || '';

      hydratedSigRef.current = buildTelegramDraftSig({
        enabled: nextEnabled,
        botUsername: nextUsername,
        botTokenDraft: '',
        clearTokenOverride: false,
        proxyUrl: nextProxy,
        welcomeSharePhoneText: nextWelcome,
        verifiedSuccessText: nextVerified,
        orderHeaderText: nextHeader,
        orderFooterText: nextFooter,
      });

      setConfig(cfg);
      setEnabled(nextEnabled);
      setBotUsername(nextUsername);
      setBotTokenDraft('');
      setClearTokenOverride(false);
      setProxyUrl(nextProxy);
      setWelcomeSharePhoneText(nextWelcome);
      setVerifiedSuccessText(nextVerified);
      setOrderHeaderText(nextHeader);
      setOrderFooterText(nextFooter);
    },
    [buildTelegramDraftSig]
  );

  const loadSettings = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setErrorMsg('');
      try {
        const res = await fetchTelegramSettingsApi();
        if (res.config) hydrateForm(res.config);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل إعدادات بوت تيليجرام');
      } finally {
        setLoading(false);
      }
    },
    [hydrateForm]
  );

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testTelegramBotApi(botTokenDraft.trim() || undefined);
      if (res.ok && res.bot) {
        const namePart = res.bot.username ? `@${res.bot.username}` : res.bot.first_name || String(res.bot.id);
        setTestResult({
          ok: true,
          text: `الاتصال ناجح ✓ — البوت: ${namePart} (ID: ${res.bot.id})${
            res.webhookUrl ? ' · تم تنظيف الـ Webhook العالق تلقائياً' : ''
          }`,
        });
      } else {
        setTestResult({
          ok: false,
          text: res.error || 'تعذر الاتصال بخوادم تيليجرام',
        });
      }
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        text: err instanceof Error ? err.message : 'خطأ أثناء فحص الاتصال',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = useCallback(
    async (silentIfUnchanged = false) => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (!canManageSettings) {
        if (!silentIfUnchanged) showToast('ليست لديك صلاحية تعديل إعدادات النظام');
        return;
      }
      const nextSig = buildTelegramDraftSig({
        enabled,
        botUsername,
        botTokenDraft,
        clearTokenOverride,
        proxyUrl,
        welcomeSharePhoneText,
        verifiedSuccessText,
        orderHeaderText,
        orderFooterText,
      });
      if (silentIfUnchanged && (!hydratedSigRef.current || nextSig === hydratedSigRef.current)) {
        return;
      }

      setSaving(true);
      setErrorMsg('');
      try {
        const cleanUsername = botUsername.trim().replace(/^@+/, '') || 'MenuPlusBot';
        const res = await updateTelegramSettingsApi({
          enabled,
          botUsername: cleanUsername,
          ...(botTokenDraft.trim() ? { botTokenOverride: botTokenDraft.trim() } : {}),
          ...(clearTokenOverride ? { clearTokenOverride: true } : {}),
          proxyUrl: proxyUrl.trim(),
          welcomeSharePhoneText,
          verifiedSuccessText,
          orderHeaderText,
          orderFooterText,
        });
        if (res.config) hydrateForm(res.config);
        showToast('تم حفظ التغيرات');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'تعذر حفظ إعدادات تيليجرام';
        setErrorMsg(msg);
        showToast(msg);
      } finally {
        setSaving(false);
      }
    },
    [
      botTokenDraft,
      botUsername,
      buildTelegramDraftSig,
      canManageSettings,
      clearTokenOverride,
      enabled,
      hydrateForm,
      orderFooterText,
      orderHeaderText,
      proxyUrl,
      showToast,
      verifiedSuccessText,
      welcomeSharePhoneText,
    ]
  );

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (loading || !canManageSettings || !hydratedSigRef.current) return;
    const sig = buildTelegramDraftSig({
      enabled,
      botUsername,
      botTokenDraft,
      clearTokenOverride,
      proxyUrl,
      welcomeSharePhoneText,
      verifiedSuccessText,
      orderHeaderText,
      orderFooterText,
    });
    if (sig === hydratedSigRef.current) return;

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void handleSaveRef.current(true);
    }, 160);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    loading,
    canManageSettings,
    enabled,
    botUsername,
    botTokenDraft,
    clearTokenOverride,
    proxyUrl,
    welcomeSharePhoneText,
    verifiedSuccessText,
    orderHeaderText,
    orderFooterText,
    buildTelegramDraftSig,
  ]);

  useEffect(() => {
    const onFlush = () => {
      void handleSaveRef.current(true);
    };
    window.addEventListener('menuplus_admin_flush_save', onFlush);
    return () => window.removeEventListener('menuplus_admin_flush_save', onFlush);
  }, []);

  const handleSendTestMessage = async () => {
    if (!testTarget.trim()) {
      setTestSendStatus({ ok: false, text: 'أدخل رقم هاتف مربوطاً في تيليجرام أو Chat ID أولاً.' });
      return;
    }
    setSendingTest(true);
    setTestSendStatus(null);
    try {
      const res = await sendTelegramTestMessageApi(testTarget.trim(), testCustomMsg.trim() || undefined);
      setTestSendStatus({ ok: Boolean(res.ok), text: res.message });
    } catch (err: unknown) {
      setTestSendStatus({
        ok: false,
        text: err instanceof Error ? err.message : 'تعذر إرسال الرسالة التجريبية',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const runtime = config?.runtime;

  return (
    <div id="adm-telegram" className="mp-framed-wrap">
      <div className="mp-framed-title">
        <Send size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
        <span>إعدادات بوت تيليجرام لإرسال الطلبات لأصحاب المطاعم والمتاجر</span>
      </div>

      <div className="mp-framed-box">
        {loading && !config ? (
          <div style={{ padding: '24px', textAlign: 'center' }} className="muted">
            <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 6px', color: 'var(--brand)' }} />
            <div style={{ fontSize: '12.5px' }}>جاري تحميل إعدادات وحالة بوت تيليجرام...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <p className="muted" style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.6 }}>
              يُستخدم البوت لإرسال إشعارات الطلبات الجديدة مباشرة إلى حساب تيليجرام الخاص بصاحب المنيو أو المتجر بمجرد ربط رقمه من صفحة «إعداد التليجرام» في لوحة تحكمه.
            </p>

            {/* Runtime Health Strip */}
            <div className="mp-tg-health-grid">
              <div className="mp-tg-health-item">
                <span className="muted">حالة البوت</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800 }}>
                  {runtime?.configured && runtime?.enabled && config?.botTokenValid !== false ? (
                    <>
                      <CheckCircle2 size={14} style={{ color: 'var(--ok, #10b981)' }} />
                      <span>متصل ومفعّل</span>
                    </>
                  ) : runtime?.configured && config?.botTokenValid === false ? (
                    <>
                      <XCircle size={14} style={{ color: 'var(--bad, #ef4444)' }} />
                      <span>توكن مرفوض / غير صالح</span>
                    </>
                  ) : !runtime?.enabled ? (
                    <>
                      <XCircle size={14} style={{ color: 'var(--bad, #ef4444)' }} />
                      <span>متوقف من الإعدادات</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
                      <span>غير مهيأ (بدون توكن)</span>
                    </>
                  )}
                </div>
              </div>

              <div className="mp-tg-health-item">
                <span className="muted">الاستقبال (Polling)</span>
                <div style={{ fontWeight: 800 }}>
                  {runtime?.pollingActive ? 'نشط يستقبل الربط ✓' : 'متوقف'}
                </div>
              </div>

              <div className="mp-tg-health-item">
                <span className="muted">الأرقام المربوطة</span>
                <div className="tabular-nums" style={{ fontWeight: 800 }}>
                  {runtime?.boundUsersCount ?? 0} رقم
                </div>
              </div>

              <div className="mp-tg-health-item">
                <span className="muted">المتاجر المفعّلة</span>
                <div className="tabular-nums" style={{ fontWeight: 800 }}>
                  {runtime?.linkedStoresCount ?? 0} متجر
                </div>
              </div>
            </div>

            {(runtime?.lastPollError || config?.botTokenError) && (
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: 'var(--bad, #ef4444)',
                  fontSize: '12px',
                }}
              >
                {config?.botTokenError ? (
                  <div>مشكلة في التوكن: {config.botTokenError}</div>
                ) : null}
                {runtime?.lastPollError && runtime.lastPollError !== config?.botTokenError ? (
                  <div>
                    آخر خطأ في استقبال التحديثات: <span dir="ltr">{runtime.lastPollError}</span>
                  </div>
                ) : null}
              </div>
            )}

            {errorMsg && (
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: 'var(--bad, #ef4444)',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {errorMsg}
              </div>
            )}

            {/* Toggle */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  background: enabled ? 'var(--soft)' : 'var(--panel)',
                  cursor: canManageSettings ? 'pointer' : 'not-allowed',
                  fontSize: '12.5px',
                  fontWeight: 800,
                }}
              >
                <input
                  type="checkbox"
                  disabled={!canManageSettings}
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span>{enabled ? 'إرسال الطلبات عبر بوت تيليجرام مفعّل ✓' : 'بوت إرسال الطلبات معطل ⏸'}</span>
              </label>
            </div>

            {/* Identity & Token */}
            <div className="g2" style={{ gap: '12px' }}>
              <label className="f" style={{ margin: 0 }}>
                معرّف البوت (Username بدون @)
                <input
                  dir="ltr"
                  disabled={!canManageSettings}
                  value={botUsername}
                  onChange={(e) => setBotUsername(e.target.value)}
                  placeholder="MenuPlusBot"
                />
              </label>

              <label className="f" style={{ margin: 0 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span>توكن البوت المخصص (اختياري)</span>
                  {config?.maskedToken && (
                    <span className="muted" style={{ fontSize: '11px' }} dir="ltr">
                      الحالي ({config.tokenSource === 'override' ? 'مخصص' : 'بيئة'}): {config.maskedToken}
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} dir="ltr">
                  <input
                    type={showTokenDraft ? 'text' : 'password'}
                    disabled={!canManageSettings}
                    value={botTokenDraft}
                    onChange={(e) => {
                      setBotTokenDraft(e.target.value);
                      if (e.target.value.trim()) setClearTokenOverride(false);
                    }}
                    placeholder={
                      config?.hasEnvToken
                        ? 'اتركه فارغاً لاستخدام متغير البيئة (TELEGRAM_BOT_TOKEN)'
                        : '123456:ABC-DEF...'
                    }
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn s"
                    onClick={() => setShowTokenDraft((v) => !v)}
                    title={showTokenDraft ? 'إخفاء التوكن' : 'إظهار التوكن'}
                  >
                    {showTokenDraft ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {config?.hasBotTokenOverride && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '5px', fontSize: '11.5px', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      disabled={!canManageSettings}
                      checked={clearTokenOverride}
                      onChange={(e) => setClearTokenOverride(e.target.checked)}
                    />
                    <span>حذف التوكن المخصص والعودة لتوكن البيئة الافتراضي</span>
                  </label>
                )}
              </label>
            </div>

            {/* Order Bot Message Templates */}
            <div className="g2" style={{ gap: '12px', paddingTop: '14px', borderTop: '1px solid var(--line)' }}>
              <label className="f" style={{ margin: 0 }}>
                رسالة البوت عند /start وطلب مشاركة رقم صاحب المتجر
                <textarea
                  rows={2}
                  disabled={!canManageSettings}
                  value={welcomeSharePhoneText}
                  onChange={(e) => setWelcomeSharePhoneText(e.target.value)}
                />
              </label>

              <label className="f" style={{ margin: 0 }}>
                رسالة التأكيد بعد مشاركة الرقم وربطه بالمتجر
                <textarea
                  rows={2}
                  disabled={!canManageSettings}
                  value={verifiedSuccessText}
                  onChange={(e) => setVerifiedSuccessText(e.target.value)}
                />
              </label>

              <label className="f" style={{ margin: 0 }}>
                ترويسة رسالة الطلب الجديد الواصلة لصاحب المتجر
                <input
                  type="text"
                  disabled={!canManageSettings}
                  value={orderHeaderText}
                  onChange={(e) => setOrderHeaderText(e.target.value)}
                  placeholder="🔔 طلب جديد"
                />
              </label>

              <label className="f" style={{ margin: 0 }}>
                تذييل رسالة الطلب الجديد (اختياري)
                <input
                  type="text"
                  disabled={!canManageSettings}
                  value={orderFooterText}
                  onChange={(e) => setOrderFooterText(e.target.value)}
                  placeholder="شكراً لاستخدامك منيو بلس"
                />
              </label>

              <label className="f" style={{ margin: 0, gridColumn: '1 / -1' }}>
                رابط بروكسي تيليجرام الافتراضي للوحة تحكم المتاجر (اختياري)
                <input
                  type="url"
                  dir="ltr"
                  disabled={!canManageSettings}
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                  placeholder="https://t.me/proxy?server=...&port=...&secret=..."
                />
              </label>
            </div>

            {testResult && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: testResult.ok ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${testResult.ok ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                  color: testResult.ok ? 'var(--ok, #10b981)' : 'var(--bad, #ef4444)',
                  fontSize: '12.5px',
                  fontWeight: 700,
                }}
              >
                {testResult.text}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn s"
                  disabled={testing}
                  onClick={() => void handleTestConnection()}
                >
                  <Wifi size={14} />
                  <span>{testing ? 'جاري فحص الاتصال...' : 'فحص اتصال البوت'}</span>
                </button>
                <button
                  type="button"
                  className="btn s"
                  disabled={loading}
                  onClick={() => void loadSettings(true)}
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  <span>تحديث الحالة</span>
                </button>
              </div>

              {saving && (
                <span className="muted" style={{ fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={13} className="animate-spin" />
                  <span>جاري الحفظ تلقائياً...</span>
                </span>
              )}
            </div>

            {/* Quick Test Message Box */}
            <div
              style={{
                paddingTop: '14px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '12.5px', marginBottom: '8px' }}>
                إرسال رسالة اختبار فورية لصاحب متجر عبر البوت
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  dir="ltr"
                  value={testTarget}
                  onChange={(e) => setTestTarget(e.target.value)}
                  placeholder="رقم هاتف مربوط (07...) أو Chat ID"
                  style={{ flex: '1 1 180px' }}
                />
                <input
                  type="text"
                  value={testCustomMsg}
                  onChange={(e) => setTestCustomMsg(e.target.value)}
                  placeholder="نص رسالة الاختبار (اختياري)"
                  style={{ flex: '2 1 220px' }}
                />
                <button
                  type="button"
                  className="btn s p"
                  disabled={!canManageSettings || sendingTest}
                  onClick={() => void handleSendTestMessage()}
                >
                  <Send size={13} />
                  <span>{sendingTest ? 'جاري الإرسال...' : 'إرسال اختبار'}</span>
                </button>
              </div>
              {testSendStatus && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: testSendStatus.ok ? 'var(--ok, #10b981)' : 'var(--bad, #ef4444)',
                  }}
                >
                  {testSendStatus.text}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
