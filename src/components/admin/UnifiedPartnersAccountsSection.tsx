/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Copy,
  Crown,
  Eye,
  KeyRound,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { PricingPlan, Session } from '../../types';
import {
  AccountsStats,
  createPartnerApi,
  deleteAccountApi,
  fetchAccountsApi,
  ManagedAccountRecord,
  updateAccountApi,
} from '../../utils/adminApi';
import {
  formatNumber,
  getExpiryDetails,
  impersonateWithServer,
  logActivity,
  setSession,
  syncFromServer,
  today,
} from '../../utils/storage';

interface UnifiedPartnersAccountsSectionProps {
  session: Session;
  plans: PricingPlan[];
  pageTitle?: string;
  canManagePartners: boolean;
  canCreatePartner?: boolean;
  canSuspendPartner?: boolean;
  canEditPartnerProfile?: boolean;
  canEditPartnerLinks?: boolean;
  canDeletePartner: boolean;
  canExtendSubscription: boolean;
  canEditPartnerPlan: boolean;
  canImpersonatePartner: boolean;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

type UnifiedFilter = 'all' | 'newest' | 'highest' | 'incomplete' | 'admin' | 'expired';
type ActionModalView = 'menu' | 'plan' | 'edit' | 'links' | 'delete';

const EMPTY_STATS: AccountsStats = {
  total: 0,
  active: 0,
  suspended: 0,
  telegramVerified: 0,
  admins: 0,
  partners: 0,
  paid: 0,
};

const PROJECT_TYPE_OPTIONS = [
  { value: 'restaurant', label: 'مطعم' },
  { value: 'cafe', label: 'كافيه ومشروبات' },
  { value: 'sweets', label: 'حلويات ومخبوزات' },
  { value: 'store', label: 'متجر إلكتروني' },
  { value: 'market', label: 'سوبرماركت' },
  { value: 'other', label: 'مشروع آخر' },
];

const DURATION_PRESETS = [
  { days: 30, label: 'شهر (30 يوم)' },
  { days: 90, label: '3 أشهر (90 يوم)' },
  { days: 180, label: '6 أشهر (180 يوم)' },
  { days: 365, label: 'سنة (365 يوم)' },
];

export const UnifiedPartnersAccountsSection: React.FC<UnifiedPartnersAccountsSectionProps> = ({
  session,
  plans,
  pageTitle,
  canManagePartners,
  canCreatePartner = canManagePartners,
  canSuspendPartner = canManagePartners,
  canEditPartnerProfile = canManagePartners,
  canEditPartnerLinks = canManagePartners,
  canDeletePartner,
  canExtendSubscription,
  canEditPartnerPlan,
  canImpersonatePartner,
  onNavigate,
  onRefresh,
  showToast,
}) => {
  const [records, setRecords] = useState<ManagedAccountRecord[]>([]);
  const [stats, setStats] = useState<AccountsStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<UnifiedFilter>('all');

  // Unified "اتخذ إجراء" modal state
  const [actionTarget, setActionTarget] = useState<ManagedAccountRecord | null>(null);
  const [actionView, setActionView] = useState<ActionModalView>('menu');
  const [modalError, setModalError] = useState('');
  const [isSavingAction, setIsSavingAction] = useState(false);
  const [impersonatingRid, setImpersonatingRid] = useState<string | null>(null);

  // Plan & Duration state inside action modal
  const [grantPlanId, setGrantPlanId] = useState('');
  const [grantDurationDays, setGrantDurationDays] = useState<number>(30);
  const [grantIsPaid, setGrantIsPaid] = useState(true);

  // Edit account & project details inside action modal
  const [editPhone, setEditPhone] = useState('');
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectType, setEditProjectType] = useState('restaurant');
  const [editOwnerName, setEditOwnerName] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'partner'>('partner');
  const [editNewPassword, setEditNewPassword] = useState('');

  // Edit Menu Slug, Subdomain & Socials inside action modal
  const [editSlug, setEditSlug] = useState('');
  const [editSubdomain, setEditSubdomain] = useState('');
  const [editInstagram, setEditInstagram] = useState('');
  const [editFacebook, setEditFacebook] = useState('');
  const [editTiktok, setEditTiktok] = useState('');
  const [editX, setEditX] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');

  // Delete confirmation inside action modal
  const [confirmRealOwnerDelete, setConfirmRealOwnerDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add Partner Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newProjectType, setNewProjectType] = useState('restaurant');
  const [newPlanId, setNewPlanId] = useState(plans[0]?.id || 'starter');
  const [newDurationDays, setNewDurationDays] = useState<number>(30);
  const [newIsPaid, setNewIsPaid] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [addError, setAddError] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await fetchAccountsApi();
      setRecords(res.accounts || []);
      setStats(res.stats || EMPTY_STATS);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'تعذر تحميل البيانات من الخادم');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openActionModal = (item: ManagedAccountRecord) => {
    const matchedPlan =
      plans.find((pl) => (item.planId && pl.id === item.planId) || (item.planName && pl.n === item.planName)) ||
      plans[0];

    setActionTarget(item);
    setActionView('menu');
    setGrantPlanId(matchedPlan?.id || 'starter');
    setGrantDurationDays(30);
    setGrantIsPaid(Boolean(item.isPaid ?? (matchedPlan ? matchedPlan.pr > 0 : false)));

    setEditPhone(item.phone === '-' ? '' : item.phone);
    setEditProjectName(item.projectName || item.restaurantName || '');
    setEditProjectType(
      item.projectType && PROJECT_TYPE_OPTIONS.some((o) => o.value === item.projectType)
        ? item.projectType
        : 'restaurant'
    );
    setEditOwnerName(item.name || '');
    setEditRole(item.role === 'admin' ? 'admin' : 'partner');
    setEditNewPassword('');

    setEditSlug(item.slug || '');
    setEditSubdomain(item.subdomain || '');
    setEditInstagram(item.social?.instagram || '');
    setEditFacebook(item.social?.facebook || '');
    setEditTiktok(item.social?.tiktok || '');
    setEditX(item.social?.x || '');
    setEditWhatsapp(item.social?.whatsapp || '');

    setConfirmRealOwnerDelete(false);
    setModalError('');
  };

  const handleGrantPlanAndDuration = async () => {
    if (!actionTarget) return;
    if (!canEditPartnerPlan && !canExtendSubscription) {
      setModalError('ليس لديك صلاحية تعديل الباقات أو المدد');
      return;
    }
    const safeDays = Math.max(1, Math.min(3650, Number(grantDurationDays) || 30));
    const chosenPlan = plans.find((pl) => pl.id === grantPlanId || pl.n === grantPlanId) || plans[0];

    setIsSavingAction(true);
    setModalError('');
    try {
      const res = await updateAccountApi(actionTarget.id, {
        planId: chosenPlan?.id || grantPlanId,
        planName: chosenPlan?.n || 'الباقة المحددة',
        isPaid: grantIsPaid,
        durationDays: safeDays,
        active: true,
        projectName: editProjectName.trim() || actionTarget.projectName || actionTarget.name,
        projectType: editProjectType,
      });

      logActivity(
        session.phone || session.email || 'المدير',
        'إعطاء باقة وتحديد المدة',
        `تم منح "${chosenPlan?.n || grantPlanId}" لمدة ${safeDays} يوم لـ ${res.account.projectName || res.account.phone}`,
        'plan'
      );

      await syncFromServer();
      await loadData(true);
      onRefresh();
      setActionTarget(res.account);
      setActionView('menu');
      showToast('تم تطبيق التغيرات');
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'تعذر حفظ الباقة والمدة');
    } finally {
      setIsSavingAction(false);
    }
  };

  const handleSaveAccountDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionTarget || !canEditPartnerProfile) return;

    if (editNewPassword.trim() && editNewPassword.trim().length < 8) {
      setModalError('كلمة المرور الجديدة يجب أن تكون 8 خانات على الأقل (أرقام أو أحرف أو رموز)');
      return;
    }

    setIsSavingAction(true);
    setModalError('');
    try {
      const res = await updateAccountApi(actionTarget.id, {
        phone: editPhone.trim(),
        projectName: editProjectName.trim(),
        projectType: editProjectType,
        name: editOwnerName.trim(),
        ...(actionTarget.isProtected || actionTarget.role === 'telegram_only' ? {} : { role: editRole }),
        ...(editNewPassword.trim() ? { newPassword: editNewPassword.trim() } : {}),
      });

      logActivity(
        session.phone || session.email || 'المدير',
        'تعديل حساب ومشروع',
        `تم تحديث بيانات: ${res.account.projectName || res.account.phone}`,
        'restaurant'
      );

      await syncFromServer();
      await loadData(true);
      onRefresh();
      setActionTarget(res.account);
      setEditNewPassword('');
      setActionView('menu');
      showToast('تم تطبيق التغيرات');
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'تعذر حفظ تعديلات الحساب');
    } finally {
      setIsSavingAction(false);
    }
  };

  const handleSavePartnerLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionTarget || !canEditPartnerLinks) return;

    setIsSavingAction(true);
    setModalError('');
    try {
      const res = await updateAccountApi(actionTarget.id, {
        slug: editSlug.trim(),
        subdomain: editSubdomain.trim(),
        social: {
          instagram: editInstagram.trim(),
          facebook: editFacebook.trim(),
          tiktok: editTiktok.trim(),
          x: editX.trim(),
          whatsapp: editWhatsapp.trim(),
        },
      });

      logActivity(
        session.phone || session.email || 'المدير',
        'تعديل رابط المنيو والسوشيال',
        `${res.account.projectName || res.account.phone} -> /${res.account.slug || res.account.rid || ''}`,
        'restaurant'
      );

      await syncFromServer();
      await loadData(true);
      onRefresh();
      setActionTarget(res.account);
      setActionView('menu');
      showToast('تم تطبيق التغيرات');
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'تعذر حفظ رابط المنيو');
    } finally {
      setIsSavingAction(false);
    }
  };

  const handleToggleSuspend = async () => {
    if (!actionTarget || actionTarget.isProtected || !canSuspendPartner) return;
    const nextActive = !actionTarget.active;
    setIsSavingAction(true);
    setModalError('');
    try {
      const res = await updateAccountApi(actionTarget.id, { active: nextActive });
      logActivity(
        session.phone || session.email || 'المدير',
        nextActive ? 'تفعيل حساب' : 'إيقاف حساب',
        `${actionTarget.projectName || actionTarget.phone}`,
        'restaurant'
      );
      await syncFromServer();
      await loadData(true);
      onRefresh();
      setActionTarget(res.account);
      showToast('تم تطبيق التغيرات');
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'تعذر تغيير حالة الحساب');
    } finally {
      setIsSavingAction(false);
    }
  };

  const handleConfirmDelete = async () => {
    const isSelfAccount = Boolean(actionTarget?.isCurrentUser || (session.accountId && actionTarget?.id === session.accountId));
    if (!actionTarget || actionTarget.isProtected || isSelfAccount || !canDeletePartner) return;
    setIsDeleting(true);
    setModalError('');
    try {
      await deleteAccountApi(actionTarget.id, false);
      logActivity(
        session.phone || session.email || 'المدير',
        'حذف حساب ومشروع نهائياً',
        `${actionTarget.projectName || actionTarget.name} (${actionTarget.phone})`,
        'restaurant'
      );
      setActionTarget(null);
      setActionView('menu');
      await syncFromServer();
      await loadData(true);
      onRefresh();
      showToast('تم تطبيق التغيرات');
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'تعذر حذف السجل');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddPartnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreatePartner) return;
    if (!newProjectName.trim()) {
      setAddError('أدخل اسم المشروع أو المطعم');
      return;
    }
    if (newPassword.trim() && newPassword.trim().length < 8) {
      setAddError('كلمة المرور يجب أن تكون 8 خانات على الأقل (أرقام أو أحرف أو رموز)');
      return;
    }

    const chosenPlan = plans.find((pl) => pl.id === newPlanId || pl.n === newPlanId) || plans[0];
    setIsAdding(true);
    setAddError('');
    try {
      await createPartnerApi({
        projectName: newProjectName.trim(),
        ownerName: newOwnerName.trim() || newProjectName.trim(),
        phone: newPhone.trim(),
        projectType: newProjectType,
        planId: chosenPlan?.id || 'starter',
        planName: chosenPlan?.n || 'الباقة الاقتصادية',
        durationDays: Math.max(1, Number(newDurationDays) || 30),
        isPaid: newIsPaid,
        ...(newPassword.trim() ? { password: newPassword.trim() } : {}),
      });

      logActivity(
        session.phone || session.email || 'المدير',
        'إضافة شريك جديد',
        `${newProjectName.trim()} · ${chosenPlan?.n || 'الباقة الاقتصادية'} (${newDurationDays} يوم)`,
        'restaurant'
      );

      setShowAddModal(false);
      setNewProjectName('');
      setNewOwnerName('');
      setNewPhone('');
      setNewPassword('');
      await syncFromServer();
      await loadData(true);
      onRefresh();
      showToast('تم تطبيق التغيرات');
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'تعذر إضافة الشريك');
    } finally {
      setIsAdding(false);
    }
  };

  const handleImpersonate = async (rid: string) => {
    if (!canImpersonatePartner) {
      showToast('ليس لديك صلاحية الدخول كشريك');
      return;
    }
    if (impersonatingRid) return;
    setImpersonatingRid(rid);
    try {
      const res = await impersonateWithServer(rid);
      if (!res.ok) {
        showToast(res.error || 'تعذر فتح لوحة الشريك');
        return;
      }
      setSession({
        ...session,
        ...(res.session || {}),
        personalRid: session.personalRid || 'demo',
        rid,
        admin: true,
        menuLoggedOut: false,
      });
      onNavigate('/dashboard/home');
    } finally {
      setImpersonatingRid(null);
    }
  };

  const todayStr = today();

  const getPlanPriceForAccount = (item: ManagedAccountRecord): number => {
    const match = plans.find((p) => p.id === item.planId || p.n === item.planName);
    return Number(match?.pr || 0);
  };

  const isExpiredAccount = (item: ManagedAccountRecord) =>
    item.role !== 'admin' && Boolean(!item.active || (item.expiresAt && item.expiresAt < todayStr));

  const isIncompleteAccount = (item: ManagedAccountRecord) =>
    item.role === 'telegram_only' || (item.role === 'partner' && (!item.rid || item.done !== 1));

  const filteredRecords = records
    .filter((item) => {
      if (filterType === 'highest' && !item.isPaid) return false;
      if (filterType === 'incomplete' && !isIncompleteAccount(item)) return false;
      if (filterType === 'admin' && item.role !== 'admin') return false;
      if (filterType === 'expired' && !isExpiredAccount(item)) return false;

      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        item.phone.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.projectName || '').toLowerCase().includes(q) ||
        (item.restaurantName || '').toLowerCase().includes(q) ||
        (item.projectTypeLabel || '').toLowerCase().includes(q) ||
        (item.planName || '').toLowerCase().includes(q) ||
        (item.slug || '').toLowerCase().includes(q) ||
        (item.telegramUsername || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (filterType === 'highest') {
        const priceDiff = getPlanPriceForAccount(b) - getPlanPriceForAccount(a);
        if (priceDiff !== 0) return priceDiff;
      }
      if (filterType === 'newest' || filterType === 'all') {
        const da = a.registrationDate || '';
        const db = b.registrationDate || '';
        if (db !== da) return db.localeCompare(da);
      }
      return 0;
    });

  const paidCount = records.filter((r) => r.isPaid && r.rid !== 'demo').length;
  const incompleteCount = records.filter(isIncompleteAccount).length;
  const adminCount = records.filter((r) => r.role === 'admin').length;
  const expiredCount = records.filter(isExpiredAccount).length;

  const renderSubscriptionCell = (item: ManagedAccountRecord) => {
    if (item.role === 'admin') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span
            className="tag"
            style={{
              background: 'rgba(245, 158, 11, 0.16)',
              color: '#f59e0b',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              fontSize: '11px',
              fontWeight: 700,
              width: 'fit-content',
            }}
          >
            {item.isProtected ? 'مالك المنصة' : 'مدير النظام'}
          </span>
          <span className="muted" style={{ fontSize: '11px' }}>صلاحية دائمة</span>
        </div>
      );
    }

    if (item.role === 'telegram_only') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span
            className="tag"
            style={{
              background: 'rgba(14, 165, 233, 0.14)',
              color: '#38bdf8',
              fontSize: '11px',
              fontWeight: 700,
              width: 'fit-content',
            }}
          >
            غير مكتمل (تيليجرام فقط)
          </span>
          <span className="muted" style={{ fontSize: '11px' }}>بانتظار إكمال التسجيل</span>
        </div>
      );
    }

    const exp = getExpiryDetails(item.expiresAt);
    const isStopped = !item.active;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
          <b style={{ fontSize: '12.5px', color: 'var(--ink)' }}>
            {item.planName || 'الباقة الاقتصادية'}
          </b>
          <span
            className="tag"
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              background: item.isPaid ? 'rgba(245, 158, 11, 0.16)' : 'var(--soft)',
              color: item.isPaid ? '#fbbf24' : 'var(--brand-ink, #34D399)',
              fontWeight: 700,
            }}
          >
            {item.isPaid ? 'مدفوع' : 'قيد التفعيل'}
          </span>
          {item.done !== 1 && (
            <span className="tag" style={{ fontSize: '10px', padding: '1px 6px', background: 'rgba(14,165,233,0.14)', color: '#38bdf8' }}>
              غير مكتمل
            </span>
          )}
          {isStopped ? (
            <span className="tag" style={{ fontSize: '10px', padding: '1px 6px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
              موقوف
            </span>
          ) : exp.isExp ? (
            <span className="tag" style={{ fontSize: '10px', padding: '1px 6px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
              منتهي
            </span>
          ) : null}
        </div>
        <span
          className="muted"
          style={{ fontSize: '11px', color: exp.isExp || isStopped ? '#f87171' : 'var(--muted)' }}
        >
          {item.expiresAt ? exp.text : 'غير محدد المدة'}
        </span>
      </div>
    );
  };

  return (
    <div>
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '12px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'clamp(18px, 3vw, 22px)', color: 'var(--ink)' }}>
            <Users size={20} style={{ color: 'var(--brand-ink, #34D399)' }} />
            <span>{pageTitle || 'الشركاء والحسابات'}</span>
          </h1>
          <p className="muted" style={{ margin: '3px 0 0', fontSize: '12px' }}>
            إدارة حسابات الشركاء والإدارة المسجلة، الفلاتر، والباقات والصلاحيات.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {canCreatePartner && (
            <button
              type="button"
              className="btn s p"
              onClick={() => {
                setNewPlanId(plans[0]?.id || 'starter');
                setNewDurationDays(30);
                setNewIsPaid(true);
                setAddError('');
                setShowAddModal(true);
              }}
            >
              <Plus size={14} />
              <span>إضافة حساب</span>
            </button>
          )}
          <button
            type="button"
            className="btn s"
            onClick={() => void loadData()}
            disabled={isLoading}
            title="تحديث من قاعدة البيانات"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Single-Row Compact Summary Strip (Fits cleanly on 1 line on mobile!) */}
      <div
        className="accounts-kpi-strip"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '6px',
          marginBottom: '12px',
        }}
      >
        <div className="card" style={{ padding: '8px 6px', textAlign: 'center', borderRadius: '10px' }}>
          <div style={{ fontSize: 'clamp(15px, 3.8vw, 20px)', fontWeight: 800, lineHeight: 1.15 }}>
            {stats.total || records.length}
          </div>
          <div className="muted" style={{ fontSize: '10px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            الكل
          </div>
        </div>
        <div className="card" style={{ padding: '8px 6px', textAlign: 'center', borderRadius: '10px' }}>
          <div style={{ fontSize: 'clamp(15px, 3.8vw, 20px)', fontWeight: 800, lineHeight: 1.15, color: '#f59e0b' }}>
            {paidCount}
          </div>
          <div className="muted" style={{ fontSize: '10px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            مدفوع
          </div>
        </div>
        <div className="card" style={{ padding: '8px 6px', textAlign: 'center', borderRadius: '10px' }}>
          <div style={{ fontSize: 'clamp(15px, 3.8vw, 20px)', fontWeight: 800, lineHeight: 1.15, color: 'var(--brand-ink, #34D399)' }}>
            {incompleteCount}
          </div>
          <div className="muted" style={{ fontSize: '10px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            غير مكتمل
          </div>
        </div>
        <div className="card" style={{ padding: '8px 6px', textAlign: 'center', borderRadius: '10px' }}>
          <div style={{ fontSize: 'clamp(15px, 3.8vw, 20px)', fontWeight: 800, lineHeight: 1.15, color: expiredCount > 0 ? 'var(--bad)' : 'var(--muted)' }}>
            {expiredCount}
          </div>
          <div className="muted" style={{ fontSize: '10px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            منتهي
          </div>
        </div>
      </div>

      {/* Search & Compact Filters Row */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        <div style={{ position: 'relative' }}>
          <Search
            size={14}
            className="muted"
            style={{ position: 'absolute', top: '50%', insetInlineStart: '11px', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث برقم الهاتف، اسم المشروع، الرابط..."
            style={{ paddingInlineStart: '32px', width: '100%', fontSize: '13px', minHeight: '36px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {([
            { id: 'all', label: `الكل (${records.length})` },
            { id: 'newest', label: 'الأحدث' },
            { id: 'highest', label: `الأكبر اشتراكاً (${paidCount})` },
            { id: 'incomplete', label: `غير مكتمل (${incompleteCount})` },
            { id: 'admin', label: `الإدارة (${adminCount})` },
            { id: 'expired', label: `منتهي (${expiredCount})` },
          ] as const).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterType(f.id)}
              style={{
                padding: '4px 9px',
                minHeight: '28px',
                fontSize: '11.5px',
                fontWeight: 700,
                borderRadius: '8px',
                cursor: 'pointer',
                border: filterType === f.id ? '1px solid var(--brand)' : '1px solid var(--line)',
                background: filterType === f.id ? 'var(--brand)' : 'color-mix(in srgb, var(--surface) 40%, transparent)',
                color: filterType === f.id ? 'var(--on-brand)' : 'var(--ink)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div
          className="card"
          style={{
            marginBottom: '12px',
            borderColor: 'rgba(239, 68, 68, 0.45)',
            background: 'rgba(239, 68, 68, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#ef4444',
          }}
        >
          <AlertCircle size={16} />
          <span style={{ fontSize: '13px' }}>{errorMessage}</span>
        </div>
      )}

      {/* Desktop Unified Table */}
      <div className="card tw desktop-only-table" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--muted)' }}>
            <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            <div>جاري تحميل الحسابات...</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>رقم الهاتف</th>
                <th>اسم المشروع</th>
                <th>الاشتراك والحالة</th>
                <th style={{ width: '160px' }}>اتخذ إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                    لا توجد حسابات مطابقة للفلتر أو البحث الحالي.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {item.isProtected && <Crown size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                        <b className="tabular-nums" dir="ltr" style={{ fontSize: '13px' }}>
                          {item.phone}
                        </b>
                      </div>
                      <div className="muted" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span>{item.name}</span>
                        {item.telegramLinked && (
                          <span style={{ color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Send size={10} />
                            تيليجرام
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <b style={{ fontSize: '13.5px' }}>
                        {item.projectName || item.restaurantName || (item.role === 'admin' ? 'إدارة المنصة' : 'بدون مشروع')}
                      </b>
                      <div className="muted tabular-nums" style={{ fontSize: '11px', marginTop: '2px' }}>
                        {item.registrationDate ? `مسجل: ${item.registrationDate}` : ''}
                        {item.slug ? ` · /${item.slug}` : ''}
                      </div>
                    </td>

                    <td>{renderSubscriptionCell(item)}</td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {item.rid && canImpersonatePartner && (
                          <button
                            type="button"
                            className="btn s"
                            disabled={Boolean(impersonatingRid)}
                            onClick={() => handleImpersonate(item.rid!)}
                            title="دخول سريع للوحة التحكم"
                            style={{
                              fontWeight: 800,
                              background: 'color-mix(in srgb, var(--brand) 14%, transparent)',
                              color: 'var(--brand)',
                              border: '1px solid color-mix(in srgb, var(--brand) 32%, transparent)',
                            }}
                          >
                            {impersonatingRid === item.rid ? (
                              <Loader2 size={13} className="spin" />
                            ) : (
                              <KeyRound size={13} />
                            )}
                            <span>دخول للوحة</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn s p"
                          onClick={() => openActionModal(item)}
                          style={{ fontWeight: 700 }}
                        >
                          اتخذ إجراء
                        </button>
                        {item.rid && (
                          <button
                            type="button"
                            className="btn s"
                            onClick={() => onNavigate(item.rid === 'demo' && !item.slug ? '/cap-burger' : `/${item.slug || item.rid}`)}
                            title="فتح المنيو"
                            aria-label="فتح المنيو"
                          >
                            <Eye size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards-only">
        {isLoading ? (
          <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
            جاري التحميل...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>
            لا توجد حسابات مطابقة.
          </div>
        ) : (
          filteredRecords.map((item) => (
            <div key={item.id} className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {item.isProtected && <Crown size={13} style={{ color: '#f59e0b' }} />}
                    <b className="tabular-nums" dir="ltr" style={{ fontSize: '13.5px' }}>
                      {item.phone}
                    </b>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>
                    {item.projectName || item.restaurantName || item.name}
                  </div>
                </div>
                {item.registrationDate && (
                  <span className="muted tabular-nums" style={{ fontSize: '10.5px' }} dir="ltr">
                    {item.registrationDate}
                  </span>
                )}
              </div>

              <div style={{ paddingTop: '8px', borderTop: '1px solid var(--line)' }}>
                {renderSubscriptionCell(item)}
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {item.rid && canImpersonatePartner && (
                  <button
                    type="button"
                    className="btn s"
                    disabled={Boolean(impersonatingRid)}
                    onClick={() => handleImpersonate(item.rid!)}
                    style={{
                      flex: 1,
                      fontWeight: 800,
                      background: 'color-mix(in srgb, var(--brand) 14%, transparent)',
                      color: 'var(--brand)',
                      border: '1px solid color-mix(in srgb, var(--brand) 32%, transparent)',
                    }}
                  >
                    {impersonatingRid === item.rid ? (
                      <Loader2 size={13} className="spin" />
                    ) : (
                      <KeyRound size={13} />
                    )}
                    <span>دخول للوحة</span>
                  </button>
                )}
                <button
                  type="button"
                  className="btn s p"
                  style={{ flex: 1, fontWeight: 700 }}
                  onClick={() => openActionModal(item)}
                >
                  اتخذ إجراء
                </button>
                {item.rid && (
                  <button
                    type="button"
                    className="btn s"
                    onClick={() => onNavigate(item.rid === 'demo' && !item.slug ? '/cap-burger' : `/${item.slug || item.rid}`)}
                    title="فتح المنيو"
                    aria-label="فتح المنيو"
                  >
                    <Eye size={14} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Unified Action Modal ("اتخذ إجراء") — Clean Action Buttons Menu + Dedicated Sub-views */}
      {actionTarget && (
        <div className="ajax-backdrop" onClick={() => setActionTarget(null)}>
          <div
            className="ajax-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '520px', textAlign: 'start', maxHeight: '90vh', overflowY: 'auto' }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                paddingBottom: '10px',
                marginBottom: '14px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '16.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {actionTarget.projectName || actionTarget.name}
                </h3>
                <div className="muted" style={{ fontSize: '12px', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span className="tabular-nums" dir="ltr">{actionTarget.phone}</span>
                  {actionTarget.planName && <span>· {actionTarget.planName}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {actionView !== 'menu' && (
                  <button
                    type="button"
                    className="btn s"
                    onClick={() => {
                      setModalError('');
                      setActionView('menu');
                    }}
                  >
                    <ArrowRight size={14} />
                    <span>رجوع</span>
                  </button>
                )}
                <button type="button" className="btn s" onClick={() => setActionTarget(null)} aria-label="إغلاق">
                  <X size={15} />
                </button>
              </div>
            </div>

            {modalError && (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '9px 11px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#ef4444',
                  fontSize: '12.5px',
                }}
              >
                {modalError}
              </div>
            )}

            {/* VIEW 0: ACTION BUTTONS MENU */}
            {actionView === 'menu' && (
              <div className="mp-modal-actions">
                {!actionTarget.isProtected && actionTarget.role !== 'admin' && (canEditPartnerPlan || canExtendSubscription) && (
                  <button
                    type="button"
                    className="mp-action-primary"
                    onClick={() => setActionView('plan')}
                  >
                    <span className="mp-action-primary-main">
                      <Crown size={17} />
                      <span>ترقية / تغيير الباقة والمدة</span>
                    </span>
                    <span style={{ fontSize: '11.5px', opacity: 0.9 }}>إدارة الاشتراك</span>
                  </button>
                )}

                <div className="mp-action-grid">
                  {canEditPartnerProfile && (
                    <button
                      type="button"
                      className="mp-action-tile"
                      onClick={() => setActionView('edit')}
                    >
                      <span className="mp-action-tile-ico">
                        <Pencil size={15} />
                      </span>
                      <span>تعديل البيانات وكلمة المرور</span>
                    </button>
                  )}

                  {actionTarget.rid && canEditPartnerLinks && (
                    <button
                      type="button"
                      className="mp-action-tile"
                      onClick={() => setActionView('links')}
                    >
                      <span className="mp-action-tile-ico">
                        <Link2 size={15} />
                      </span>
                      <span>رابط المنيو والسوشيال ميديا</span>
                    </button>
                  )}

                  {actionTarget.rid && canImpersonatePartner && (
                    <button
                      type="button"
                      className="mp-action-tile"
                      onClick={() => {
                        const rid = actionTarget.rid!;
                        setActionTarget(null);
                        void handleImpersonate(rid);
                      }}
                    >
                      <span className="mp-action-tile-ico">
                        <KeyRound size={15} />
                      </span>
                      <span>فتح لوحة تحكم الحساب</span>
                    </button>
                  )}

                  {actionTarget.rid && (
                    <button
                      type="button"
                      className="mp-action-tile"
                      onClick={() => {
                        const slugOrRid = actionTarget.rid === 'demo' && !actionTarget.slug ? 'cap-burger' : (actionTarget.slug || actionTarget.rid!);
                        setActionTarget(null);
                        onNavigate(`/${slugOrRid}`);
                      }}
                    >
                      <span className="mp-action-tile-ico">
                        <Eye size={15} />
                      </span>
                      <span>معاينة المنيو العام</span>
                    </button>
                  )}
                </div>

                {((!actionTarget.isProtected && actionTarget.role !== 'telegram_only' && canSuspendPartner) ||
                  (!actionTarget.isProtected &&
                    !(actionTarget.isCurrentUser || (session.accountId && actionTarget.id === session.accountId)) &&
                    canDeletePartner)) && (
                  <>
                    <div className="mp-section-divider" style={{ margin: '2px 0' }} />
                    <div className="mp-action-danger-row">
                      {!actionTarget.isProtected && actionTarget.role !== 'telegram_only' && canSuspendPartner && (
                        <button
                          type="button"
                          className={`mp-action-danger-btn${actionTarget.active ? '' : ' is-restore'}`}
                          disabled={isSavingAction}
                          onClick={() => void handleToggleSuspend()}
                        >
                          {actionTarget.active ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                          <span>{actionTarget.active ? 'إيقاف الحساب مؤقتاً' : 'تفعيل الحساب'}</span>
                        </button>
                      )}

                      {!actionTarget.isProtected &&
                        !(actionTarget.isCurrentUser || (session.accountId && actionTarget.id === session.accountId)) &&
                        canDeletePartner && (
                        <button
                          type="button"
                          className="mp-action-danger-btn"
                          onClick={() => {
                            setConfirmRealOwnerDelete(false);
                            setActionView('delete');
                          }}
                        >
                          <Trash2 size={15} />
                          <span>حذف الحساب نهائياً</span>
                        </button>
                      )}
                    </div>
                  </>
                )}

                {(actionTarget.isProtected ||
                  actionTarget.isCurrentUser ||
                  (session.accountId && actionTarget.id === session.accountId)) && (
                  <div className="muted" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '2px' }}>
                    <Shield size={14} />
                    <span>
                      {actionTarget.isProtected
                        ? 'حساب مالك المنصة الرئيسي محمي من الإيقاف أو الحذف'
                        : 'هذا حسابك النشط حالياً ولا يمكن حذفه أثناء استخدامه'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* VIEW 1: GRANT PLAN & DURATION */}
            {actionView === 'plan' && (
              <div>
                <div className="g2" style={{ gap: '10px', marginBottom: '12px' }}>
                  <label className="f" style={{ margin: 0 }}>
                    اختر الباقة
                    <select
                      value={grantPlanId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setGrantPlanId(val);
                        const pl = plans.find((x) => x.id === val || x.n === val);
                        if (pl) setGrantIsPaid(pl.pr > 0);
                      }}
                    >
                      {plans.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.n} ({formatNumber(pl.pr)} د.ع)
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="f" style={{ margin: 0 }}>
                    المدة بالأيام
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      dir="ltr"
                      value={grantDurationDays}
                      onChange={(e) => setGrantDurationDays(Math.max(1, Number(e.target.value) || 30))}
                    />
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      className={`btn s${grantDurationDays === preset.days ? ' p' : ''}`}
                      onClick={() => setGrantDurationDays(preset.days)}
                      style={{ fontSize: '12px', padding: '5px 10px' }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={grantIsPaid}
                      onChange={(e) => setGrantIsPaid(e.target.checked)}
                    />
                    <span>تصنيف الاشتراك: مدفوع</span>
                  </label>

                  <button
                    type="button"
                    className="btn p"
                    disabled={isSavingAction}
                    onClick={() => void handleGrantPlanAndDuration()}
                  >
                    {isSavingAction ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    <span>تفعيل الباقة ({grantDurationDays} يوم)</span>
                  </button>
                </div>
              </div>
            )}

            {/* VIEW 2: EDIT ACCOUNT & PROJECT DETAILS */}
            {actionView === 'edit' && (
              <form onSubmit={(e) => void handleSaveAccountDetails(e)}>
                <div className="g2" style={{ gap: '10px' }}>
                  <label className="f" style={{ margin: 0 }}>
                    رقم الهاتف
                    <input
                      type="tel"
                      dir="ltr"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="0770..."
                    />
                  </label>

                  <label className="f" style={{ margin: 0 }}>
                    اسم المشروع
                    <input
                      type="text"
                      value={editProjectName}
                      onChange={(e) => setEditProjectName(e.target.value)}
                      placeholder="اسم المطعم أو المتجر"
                    />
                  </label>

                  <label className="f" style={{ margin: 0 }}>
                    نوع المشروع
                    <select value={editProjectType} onChange={(e) => setEditProjectType(e.target.value)}>
                      {PROJECT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="f" style={{ margin: 0 }}>
                    اسم صاحب الحساب
                    <input
                      type="text"
                      value={editOwnerName}
                      onChange={(e) => setEditOwnerName(e.target.value)}
                      placeholder="الاسم الكامل"
                    />
                  </label>

                  {!actionTarget.isProtected && actionTarget.role !== 'telegram_only' && (
                    <label className="f" style={{ margin: 0 }}>
                      صلاحية الحساب
                      <select value={editRole} onChange={(e) => setEditRole(e.target.value as 'admin' | 'partner')}>
                        <option value="partner">شريك متجر</option>
                        <option value="admin">مدير منصة</option>
                      </select>
                    </label>
                  )}

                  <label className="f" style={{ margin: 0 }}>
                    كلمة مرور جديدة (اختياري)
                    <input
                      type="password"
                      dir="ltr"
                      value={editNewPassword}
                      onChange={(e) => setEditNewPassword(e.target.value)}
                      placeholder="اتركه فارغاً للإبقاء"
                    />
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
                  <button type="submit" className="btn p" disabled={isSavingAction}>
                    {isSavingAction ? <Loader2 size={14} className="animate-spin" /> : null}
                    <span>حفظ التعديلات</span>
                  </button>
                </div>
              </form>
            )}

            {/* VIEW 3: EDIT MENU SLUG, SUBDOMAIN & SOCIAL LINKS */}
            {actionView === 'links' && (
              <form
                onSubmit={(e) => void handleSavePartnerLinks(e)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div className="g2" style={{ gap: '10px' }}>
                  <label className="f" style={{ margin: 0 }}>
                    معرّف الرابط (Slug)
                    <input
                      type="text"
                      dir="ltr"
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="my-store"
                    />
                  </label>
                  <label className="f" style={{ margin: 0 }}>
                    النطاق الفرعي (Subdomain)
                    <input
                      type="text"
                      dir="ltr"
                      value={editSubdomain}
                      onChange={(e) => setEditSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="my-store"
                    />
                  </label>
                </div>

                <div className="g2" style={{ gap: '10px' }}>
                  <label className="f" style={{ margin: 0 }}>
                    انستغرام (Instagram)
                    <input dir="ltr" value={editInstagram} onChange={(e) => setEditInstagram(e.target.value)} placeholder="https://instagram.com/..." />
                  </label>
                  <label className="f" style={{ margin: 0 }}>
                    فيسبوك (Facebook)
                    <input dir="ltr" value={editFacebook} onChange={(e) => setEditFacebook(e.target.value)} placeholder="https://facebook.com/..." />
                  </label>
                  <label className="f" style={{ margin: 0 }}>
                    تيك توك (TikTok)
                    <input dir="ltr" value={editTiktok} onChange={(e) => setEditTiktok(e.target.value)} placeholder="https://tiktok.com/@..." />
                  </label>
                  <label className="f" style={{ margin: 0 }}>
                    إكس / تويتر (X)
                    <input dir="ltr" value={editX} onChange={(e) => setEditX(e.target.value)} placeholder="https://x.com/..." />
                  </label>
                </div>

                <label className="f" style={{ margin: 0 }}>
                  واتساب التواصل
                  <input dir="ltr" value={editWhatsapp} onChange={(e) => setEditWhatsapp(e.target.value)} placeholder="0770..." />
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--line)' }}>
                  <button type="submit" className="btn p" disabled={isSavingAction}>
                    {isSavingAction ? <Loader2 size={14} className="animate-spin" /> : null}
                    <span>حفظ الرابط والتواصل</span>
                  </button>
                </div>
              </form>
            )}

            {/* VIEW 4: CONFIRM PHYSICAL DELETE (Clean Flat Dual-Theme Layout) */}
            {actionView === 'delete' && (() => {
              const isRealMenuOwner = Boolean(
                actionTarget.hasOwnedMenu ||
                (actionTarget.role === 'partner' && actionTarget.rid && actionTarget.rid !== 'demo')
              );
              const isSelfRegistered = Boolean(actionTarget.isSelfRegisteredMenuOwner);

              return (
                <div className="mp-danger-banner">
                  <div className="mp-danger-head">
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800 }}>
                        {isRealMenuOwner
                          ? 'تأكيد أخير: هذا الحساب يمتلك منيو حقيقي'
                          : 'هل أنت متأكد من الحذف النهائي لهذا الحساب؟'}
                      </div>
                      <div style={{ fontSize: '12.5px', opacity: 0.9, marginTop: '3px', lineHeight: 1.55 }}>
                        {isRealMenuOwner
                          ? isSelfRegistered
                            ? 'هذا الزبون سجّل بنفسه ويمتلك منيو فعلي في المنصة.'
                            : 'يوجد مشروع ومنيو مرتبط بهذا الحساب سيتم حذفه نهائياً.'
                          : 'سيتم حذف الحساب والمتجر من المنصة فقط مع الإبقاء على توثيق الرقم في قاعدة بيانات تيليجرام.'}
                      </div>
                    </div>
                  </div>

                  {isRealMenuOwner && (
                    <>
                      <div className="mp-danger-meta">
                        <div>
                          <span className="muted" style={{ display: 'block', fontSize: '11.5px' }}>المشروع</span>
                          <b>{actionTarget.projectName || actionTarget.restaurantName || actionTarget.name}</b>
                        </div>
                        <div>
                          <span className="muted" style={{ display: 'block', fontSize: '11.5px' }}>الباقة</span>
                          <b>{actionTarget.planName || 'الباقة الاقتصادية'}</b>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span className="muted" style={{ display: 'block', fontSize: '11.5px' }}>حالة المنيو</span>
                          <b>{actionTarget.done === 1 ? 'مكتمل ومفعّل' : 'قيد الإعداد'}</b>
                          {typeof actionTarget.itemsCount === 'number' && (
                            <span className="muted tabular-nums">
                              {` · ${actionTarget.catsCount || 0} قسم · ${actionTarget.itemsCount} صنف · ${actionTarget.ordersCount || 0} طلب`}
                            </span>
                          )}
                        </div>
                      </div>

                      <label className={`mp-confirm-check${confirmRealOwnerDelete ? ' is-checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={confirmRealOwnerDelete}
                          onChange={(e) => setConfirmRealOwnerDelete(e.target.checked)}
                        />
                        <span>أؤكد أن هذا الحساب ليس مهماً لي وأريد حذفه مع المنيو نهائياً</span>
                      </label>
                    </>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '8px',
                      flexWrap: 'wrap',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--line)',
                    }}
                  >
                    <button
                      type="button"
                      className="btn s"
                      onClick={() => {
                        setConfirmRealOwnerDelete(false);
                        setActionView('menu');
                      }}
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      className="btn s p d"
                      disabled={isDeleting || (isRealMenuOwner && !confirmRealOwnerDelete)}
                      onClick={() => void handleConfirmDelete()}
                    >
                      {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      <span>{isRealMenuOwner ? 'تأكيد الحذف النهائي للمشروع والحساب' : 'تأكيد الحذف النهائي'}</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Add Account / Partner Modal */}
      {showAddModal && (
        <div className="ajax-backdrop" onClick={() => setShowAddModal(false)}>
          <div
            className="ajax-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '500px', textAlign: 'start' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ margin: 0, fontSize: '17px' }}>إضافة حساب ومشروع جديد</h3>
              <button type="button" className="btn s" onClick={() => setShowAddModal(false)}>
                <X size={16} />
              </button>
            </div>

            {addError && (
              <div style={{ marginBottom: '10px', padding: '9px 12px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: '12.5px' }}>
                {addError}
              </div>
            )}

            <form onSubmit={(e) => void handleAddPartnerSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="g2" style={{ gap: '10px' }}>
                <label className="f" style={{ margin: 0 }}>
                  رقم الهاتف
                  <input
                    type="tel"
                    dir="ltr"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="07701234567"
                  />
                </label>

                <label className="f" style={{ margin: 0 }}>
                  اسم المشروع *
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="اسم المطعم أو المتجر"
                    required
                  />
                </label>

                <label className="f" style={{ margin: 0 }}>
                  نوع المشروع
                  <select value={newProjectType} onChange={(e) => setNewProjectType(e.target.value)}>
                    {PROJECT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="f" style={{ margin: 0 }}>
                  اسم المسؤول / المالك
                  <input
                    type="text"
                    value={newOwnerName}
                    onChange={(e) => setNewOwnerName(e.target.value)}
                    placeholder="اختياري"
                  />
                </label>

                <label className="f" style={{ margin: 0 }}>
                  الباقة
                  <select
                    value={newPlanId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewPlanId(val);
                      const pl = plans.find((x) => x.id === val || x.n === val);
                      if (pl) setNewIsPaid(pl.pr > 0);
                    }}
                  >
                    {plans.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.n} ({formatNumber(pl.pr)} د.ع)
                      </option>
                    ))}
                  </select>
                </label>

                <label className="f" style={{ margin: 0 }}>
                  مدة الباقة (أيام)
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    dir="ltr"
                    value={newDurationDays}
                    onChange={(e) => setNewDurationDays(Math.max(1, Number(e.target.value) || 30))}
                  />
                </label>
              </div>

              <label className="f" style={{ margin: 0 }}>
                كلمة مرور الدخول للحساب (اختياري)
                <input
                  type="password"
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8 خانات فأكثر (أرقام أو أحرف أو رموز)"
                />
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={newIsPaid}
                  onChange={(e) => setNewIsPaid(e.target.checked)}
                />
                <b>اشتراك مدفوع</b>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" className="btn s" onClick={() => setShowAddModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn p" disabled={isAdding}>
                  {isAdding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  <span>حفظ وإضافة الحساب</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
