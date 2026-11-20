/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Shield,
  UserCheck,
} from 'lucide-react';
import { Session, StaffPermissions } from '../../types';
import {
  fetchMyAccountApi,
  MyAccountProfile,
  updateMyAccountApi,
} from '../../utils/adminApi';
import { getItem, logActivity, setSession, syncFromServer } from '../../utils/storage';

interface MyAccountSectionProps {
  session: Session;
  pageTitle?: string;
  onRefresh: () => void;
  onLogout: () => void;
  showToast: (msg: string) => void;
}

const PERMISSION_LABELS: Array<{ key: keyof StaffPermissions; label: string }> = [
  { key: 'canViewAnalytics', label: 'عرض نظرة عامة والتحليلات' },
  { key: 'canManageRestaurants', label: 'إدارة الشركاء والحسابات' },
  { key: 'canEditPartnerPlan', label: 'إعطاء الباقات وتمديد المدد' },
  { key: 'canImpersonatePartner', label: 'الدخول إلى لوحة الشريك' },
  { key: 'canEditDemoMenu', label: 'التجربة والعرض والمنيو التجريبي' },
  { key: 'canUseNotes', label: 'استخدام مسودة الملاحظات' },
  { key: 'canManagePlans', label: 'تعديل الباقات والأسعار' },
  { key: 'canDeletePartner', label: 'حذف الحسابات نهائياً' },
  { key: 'canManageStaff', label: 'إدارة الموظفين والصلاحيات' },
];

export const MyAccountSection: React.FC<MyAccountSectionProps> = ({
  session,
  pageTitle,
  onRefresh,
  onLogout,
  showToast,
}) => {
  const isStaff = Boolean(session.staffId);
  const [profile, setProfile] = useState<MyAccountProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  // Editable full account fields (enabled for BOTH owner and every staff member)
  const [name, setName] = useState(session.name || '');
  const [phone, setPhone] = useState(session.phone || session.email || '');
  const [roleTitle, setRoleTitle] = useState(
    session.roleTitle || (isStaff ? 'موظف إدارة' : 'مالك المنصة والمدير العام')
  );
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const hydratedBasicSigRef = useRef<string>('');
  const autoSaveTimerRef = useRef<number | null>(null);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await fetchMyAccountApi({
        staffId: session.staffId ? String(session.staffId) : undefined,
        email: session.email,
        phone: session.phone || session.email,
      });
      setProfile(res.profile);
      const nextName = res.profile.name || '';
      const resolvedPhone =
        res.profile.phone ||
        (/^\+?\d[\d\s-]{5,}$/.test(res.profile.email || '') ? res.profile.email : '');
      const nextRole = res.profile.roleTitle || '';
      hydratedBasicSigRef.current = JSON.stringify({
        name: nextName.trim(),
        roleTitle: nextRole.trim(),
        phone: (resolvedPhone || '').trim(),
      });
      setName(nextName);
      setPhone(resolvedPhone || '');
      setRoleTitle(nextRole);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'تعذر تحميل بيانات الحساب');
    } finally {
      setIsLoading(false);
    }
  }, [session.email, session.phone, session.staffId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const executeSave = useCallback(async (fromUnifiedButton = false) => {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setErrorMessage('');

    const cleanPhone = phone.trim();
    const normalizePhoneDigits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '');

    if (!name.trim()) {
      setErrorMessage('الاسم الكامل مطلوب');
      return;
    }
    if (!cleanPhone) {
      setErrorMessage('رقم الهاتف مطلوب');
      return;
    }
    if (newPassword.trim() && newPassword.trim().length < 8) {
      setErrorMessage('كلمة المرور الجديدة يجب أن تكون 8 خانات على الأقل (أرقام أو أحرف أو رموز)');
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setErrorMessage('كلمتا المرور غير متطابقتين');
      return;
    }

    const previousPhone = profile?.phone || profile?.email || '';
    if (
      isStaff &&
      profile &&
      normalizePhoneDigits(cleanPhone) !== normalizePhoneDigits(previousPhone) &&
      !newPassword.trim()
    ) {
      setErrorMessage('عند تغيير رقم الهاتف، يرجى كتابة كلمة مرور جديدة للحفاظ على صلاحية تسجيل دخولك.');
      return;
    }

    const nextBasicSig = JSON.stringify({
      name: name.trim(),
      roleTitle: (roleTitle.trim() || (isStaff ? 'موظف إدارة' : 'مالك المنصة والمدير العام')).trim(),
      phone: cleanPhone,
    });
    if (!fromUnifiedButton && !newPassword.trim() && nextBasicSig === hydratedBasicSigRef.current) {
      return;
    }
    if (fromUnifiedButton && !newPassword.trim() && nextBasicSig === hydratedBasicSigRef.current) {
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateMyAccountApi({
        ...(session.staffId ? { staffId: String(session.staffId) } : { accountId: profile?.id }),
        name: name.trim(),
        email: cleanPhone,
        phone: cleanPhone,
        roleTitle: roleTitle.trim() || (isStaff ? 'موظف إدارة' : 'مالك المنصة والمدير العام'),
        ...(newPassword.trim() ? { newPassword: newPassword.trim() } : {}),
      });

      hydratedBasicSigRef.current = JSON.stringify({
        name: (res.profile.name || '').trim(),
        roleTitle: (res.profile.roleTitle || '').trim(),
        phone: (res.profile.phone || cleanPhone).trim(),
      });
      setProfile(res.profile);

      const curSession = getItem<Session>('session') || session;
      const updatedSession: Session = {
        ...curSession,
        name: res.sessionPatch.name,
        email: res.sessionPatch.phone || res.sessionPatch.email,
        phone: res.sessionPatch.phone,
        roleTitle: res.sessionPatch.roleTitle,
      };
      setSession(updatedSession);

      logActivity(
        res.sessionPatch.phone || session.phone || 'المستخدم',
        'تحديث بيانات الحساب الشخصي',
        `تم تحديث بيانات حساب ${res.sessionPatch.name}`,
        isStaff ? 'staff' : 'system'
      );

      setNewPassword('');
      setConfirmPassword('');
      await syncFromServer();
      onRefresh();
      showToast('تم حفظ التغيرات');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'تعذر حفظ بيانات الحساب');
    } finally {
      setIsSaving(false);
    }
  }, [
    confirmPassword,
    isStaff,
    name,
    newPassword,
    onRefresh,
    phone,
    profile,
    roleTitle,
    session,
    showToast,
  ]);

  const executeSaveRef = useRef(executeSave);
  executeSaveRef.current = executeSave;

  useEffect(() => {
    if (isLoading || !profile || !hydratedBasicSigRef.current) return;
    // Only auto-save name & roleTitle directly when phone is unchanged and password fields are empty
    const previousPhone = (profile.phone || profile.email || '').trim();
    if (phone.trim() !== previousPhone || newPassword.trim() || confirmPassword.trim()) {
      return;
    }
    const sig = JSON.stringify({
      name: name.trim(),
      roleTitle: (roleTitle.trim() || (isStaff ? 'موظف إدارة' : 'مالك المنصة والمدير العام')).trim(),
      phone: phone.trim(),
    });
    if (!name.trim() || sig === hydratedBasicSigRef.current) return;

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void executeSaveRef.current(false);
    }, 180);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [name, roleTitle, phone, newPassword, confirmPassword, isLoading, profile, isStaff]);

  useEffect(() => {
    const onFlush = () => {
      void executeSaveRef.current(true);
    };
    window.addEventListener('menuplus_admin_flush_save', onFlush);
    return () => window.removeEventListener('menuplus_admin_flush_save', onFlush);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSave(true);
  };

  const activePermissions = PERMISSION_LABELS.filter((p) =>
    !isStaff ? true : Boolean((profile?.permissions || session.permissions)?.[p.key])
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: '22px' }}>{pageTitle || 'حسابك'}</h1>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
          إدارة وتعديل معلومات حسابك الشخصي، رقم الهاتف، وكلمة المرور بشكل كامل.
        </p>
      </div>

      {/* Top Symmetric Summary Card */}
      <div
        className="card"
        style={{
          padding: '20px 22px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
          backdropFilter: 'blur(14px) saturate(1.25)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.25)',
          border: '1px solid color-mix(in srgb, var(--line) 72%, transparent)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '16px',
              display: 'grid',
              placeItems: 'center',
              background: isStaff ? 'var(--soft)' : 'rgba(245, 158, 11, 0.14)',
              color: isStaff ? 'var(--brand-ink, var(--brand))' : '#d97706',
              border: '1px solid var(--line)',
              flexShrink: 0,
            }}
          >
            {isStaff ? <UserCheck size={26} /> : <Crown size={26} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <b style={{ fontSize: '17px' }}>{name || 'الحساب الشخصي'}</b>
              <span
                className="tag"
                style={{
                  background: isStaff ? 'var(--soft)' : 'rgba(245, 158, 11, 0.14)',
                  color: isStaff ? 'var(--brand-ink, var(--brand))' : '#d97706',
                  fontWeight: 700,
                  fontSize: '12px',
                }}
              >
                {roleTitle || (isStaff ? 'موظف إدارة' : 'مالك المنصة')}
              </span>
              <span
                className="tag"
                style={{
                  background: 'var(--soft)',
                  color: 'var(--brand-ink, var(--brand))',
                  fontSize: '11.5px',
                  fontWeight: 700,
                }}
              >
                <CheckCircle2 size={12} /> فعّال
              </span>
            </div>
            <div className="muted" style={{ fontSize: '12.5px', marginTop: '4px' }}>
              <span className="tabular-nums" dir="ltr">{phone || '—'}</span>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'end' }}>
          <span className="muted" style={{ fontSize: '11.5px', display: 'block' }}>
            تاريخ الإنشاء
          </span>
          <b className="tabular-nums" style={{ fontSize: '13px' }}>
            {profile?.createdAt || 'منذ التأسيس'}
          </b>
        </div>
      </div>

      {errorMessage && (
        <div
          className="card"
          style={{
            borderColor: 'rgba(239, 68, 68, 0.45)',
            background: 'rgba(239, 68, 68, 0.08)',
            color: '#ef4444',
            fontSize: '13.5px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Symmetrical 2-Column Boxes Grid */}
      <form onSubmit={(e) => void handleSave(e)}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
            gap: '16px',
            alignItems: 'stretch',
          }}
        >
          {/* Box 1: Personal & Login Info */}
          <div className="card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--line)', paddingBottom: '10px' }}>
              <UserCheck size={18} style={{ color: 'var(--brand-ink, #34D399)' }} />
              <h3 style={{ margin: 0, fontSize: '16px' }}>المعلومات الأساسية والتواصل</h3>
            </div>

            {isLoading ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>
                <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <span>جاري تحميل المعلومات...</span>
              </div>
            ) : (
              <>
                <label className="f" style={{ margin: 0 }}>
                  الاسم الكامل
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="اكتب اسمك الكامل"
                    required
                  />
                </label>

                <label className="f" style={{ margin: 0 }}>
                  المسمى الوظيفي / الصفة
                  <input
                    type="text"
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    placeholder="مثال: مشرف الدعم والعمليات"
                  />
                </label>

                <label className="f" style={{ margin: 0 }}>
                  رقم الهاتف (لتسجيل الدخول)
                  <input
                    type="tel"
                    dir="ltr"
                    className="tabular-nums"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07701234567"
                    required
                  />
                </label>
              </>
            )}
          </div>

          {/* Box 2: Security, Password & Permissions */}
          <div className="card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={18} style={{ color: 'var(--brand-ink, #34D399)' }} />
                <h3 style={{ margin: 0, fontSize: '16px' }}>الأمان وكلمة المرور</h3>
              </div>
              <button
                type="button"
                className="btn s"
                onClick={() => setShowPasswords((prev) => !prev)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{showPasswords ? 'إخفاء' : 'إظهار'}</span>
              </button>
            </div>

            <label className="f" style={{ margin: 0 }}>
              كلمة المرور الجديدة
              <input
                type={showPasswords ? 'text' : 'password'}
                dir="ltr"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="اتركه فارغاً للإبقاء على الحالية (8 خانات فأكثر)"
              />
            </label>

            <label className="f" style={{ margin: 0 }}>
              تأكيد كلمة المرور الجديدة
              <input
                type={showPasswords ? 'text' : 'password'}
                dir="ltr"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد كتابة كلمة المرور الجديدة"
              />
            </label>

            {/* Permissions Overview Divider */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: '12px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '12.5px', fontWeight: 700 }}>
                <Shield size={14} style={{ color: 'var(--brand-ink, #34D399)' }} />
                <span>صلاحيات حسابك الحالية:</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {!isStaff ? (
                  <span className="tag" style={{ background: 'rgba(245, 158, 11, 0.16)', color: '#f59e0b', fontSize: '11.5px', fontWeight: 700 }}>
                    كامل الصلاحيات الإدارية والسيادة المطلقة
                  </span>
                ) : activePermissions.length === 0 ? (
                  <span className="muted" style={{ fontSize: '12px' }}>عرض عام ولوحة المتابعة</span>
                ) : (
                  activePermissions.map((p) => (
                    <span
                      key={String(p.key)}
                      className="tag"
                      style={{ background: 'var(--soft)', color: 'var(--ink)', fontSize: '11px' }}
                    >
                      {p.label}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Account Status & Logout Box */}
        <div
          className="card"
          style={{
            marginTop: '16px',
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <span className="muted" style={{ fontSize: '12.5px', fontWeight: 700 }}>
            {isSaving
              ? 'جاري حفظ تعديلات الحساب...'
              : 'الاسم والمسمى الوظيفي يُحفظان تلقائياً؛ عند تغيير الرقم أو كلمة المرور اضغط حفظ التغيرات بالأسفل.'}
          </span>

          <button type="button" className="btn d" onClick={onLogout}>
            <LogOut size={16} />
            <span>تسجيل الخروج من هذا الجهاز</span>
          </button>
        </div>
      </form>
    </div>
  );
};
