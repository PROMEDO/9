/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Crown,
  Database,
  Loader2,
  PauseCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import { StaffPermissions } from '../../types';
import {
  createStaffApi,
  deleteStaffApi,
  fetchStaffApi,
  ManagedStaffMember,
  updateStaffApi,
} from '../../utils/adminApi';
import {
  DEFAULT_STAFF_PERMISSIONS,
  logActivity,
  replaceCollectionCache,
  syncFromServer,
} from '../../utils/storage';

const STAFF_PRESET_ROLES: { title: string; perms: StaffPermissions }[] = [
  {
    title: 'مشرف عمليات الشركاء',
    perms: {
      canViewHome: true,
      canViewAnalytics: true,
      canManageRestaurants: true,
      canCreatePartner: true,
      canEditPartnerPlan: true,
      canSuspendPartner: true,
      canEditPartnerProfile: true,
      canEditPartnerLinks: true,
      canImpersonatePartner: true,
      canDeletePartner: false,
      canEditDemoMenu: true,
      canUseNotes: true,
      canViewReports: true,
      canManagePlans: false,
      canManageStaff: false,
      canManageSettings: false,
      canEditTabLabels: false,
      canReorderTabs: false,
      canManageThemeMode: false,
      canManageSubdomains: false,
      canRunMaintenance: false,
      canManageFinance: false,
      canEditHomePage: false,
    },
  },
  {
    title: 'مدير مساعد بصلاحيات كاملة',
    perms: {
      canViewHome: true,
      canViewAnalytics: true,
      canManageRestaurants: true,
      canCreatePartner: true,
      canEditPartnerPlan: true,
      canSuspendPartner: true,
      canEditPartnerProfile: true,
      canEditPartnerLinks: true,
      canImpersonatePartner: true,
      canDeletePartner: true,
      canEditDemoMenu: true,
      canUseNotes: true,
      canViewReports: true,
      canManagePlans: true,
      canManageStaff: true,
      canManageSettings: true,
      canEditTabLabels: true,
      canReorderTabs: true,
      canManageThemeMode: true,
      canManageSubdomains: true,
      canRunMaintenance: true,
      canManageFinance: true,
      canManageDatabase: true,
      canEditHomePage: true,
    },
  },
  {
    title: 'مسؤول باقات واشتراكات',
    perms: {
      canViewHome: true,
      canViewAnalytics: true,
      canManageRestaurants: true,
      canCreatePartner: false,
      canEditPartnerPlan: true,
      canSuspendPartner: false,
      canEditPartnerProfile: false,
      canEditPartnerLinks: false,
      canImpersonatePartner: false,
      canDeletePartner: false,
      canEditDemoMenu: false,
      canUseNotes: true,
      canManagePlans: true,
      canManageStaff: false,
      canManageSettings: false,
      canEditTabLabels: false,
      canReorderTabs: false,
      canManageThemeMode: false,
      canManageSubdomains: false,
      canRunMaintenance: false,
      canManageFinance: true,
    },
  },
  {
    title: 'دعم فني ومراجعة',
    perms: {
      canViewHome: true,
      canViewAnalytics: true,
      canManageRestaurants: true,
      canCreatePartner: true,
      canEditPartnerPlan: false,
      canSuspendPartner: false,
      canEditPartnerProfile: true,
      canEditPartnerLinks: true,
      canImpersonatePartner: true,
      canDeletePartner: false,
      canEditDemoMenu: true,
      canUseNotes: true,
      canManagePlans: false,
      canManageStaff: false,
      canManageSettings: false,
      canEditTabLabels: false,
      canReorderTabs: false,
      canManageThemeMode: false,
      canManageSubdomains: false,
      canRunMaintenance: false,
      canManageFinance: false,
    },
  },
];

interface PermissionItemDef {
  key: keyof StaffPermissions;
  label: string;
  short: string;
  critical?: boolean;
  children?: Array<{
    key: keyof StaffPermissions;
    label: string;
    short: string;
    critical?: boolean;
  }>;
}

const PERMISSION_GROUPS: Array<{ title: string; items: PermissionItemDef[] }> = [
  {
    title: 'نظرة عامة والتحليلات',
    items: [
      { key: 'canViewHome', label: 'الوصول للصفحة الرئيسية (محطة الاستراحة)', short: 'الرئيسية' },
      { key: 'canViewAnalytics', label: 'عرض نظرة عامة والتحليلات وسجل النشاطات', short: 'نظرة عامة' },
    ],
  },
  {
    title: 'الشركاء والحسابات (صلاحيات متشعبة)',
    items: [
      {
        key: 'canManageRestaurants',
        label: 'فتح قسم الشركاء والحسابات',
        short: 'الشركاء والحسابات',
        children: [
          { key: 'canCreatePartner', label: 'إضافة حساب شريك جديد', short: 'إضافة شريك' },
          { key: 'canEditPartnerPlan', label: 'ترقية وتعديل الباقة والمدة', short: 'تعديل الباقة' },
          { key: 'canSuspendPartner', label: 'إيقاف وتفعيل الحسابات', short: 'إيقاف/تفعيل' },
          { key: 'canEditPartnerProfile', label: 'تعديل بيانات الحساب وكلمة المرور', short: 'تعديل البيانات' },
          { key: 'canEditPartnerLinks', label: 'تعديل رابط المنيو والدومين والسوشيال', short: 'تعديل الروابط' },
          { key: 'canImpersonatePartner', label: 'الدخول إلى لوحة تحكم الشريك', short: 'دخول كشريك' },
          { key: 'canDeletePartner', label: 'حذف الحسابات نهائياً', short: 'حذف نهائي', critical: true },
        ],
      },
    ],
  },
  {
    title: 'أقسام الإدارة والعمليات',
    items: [
      { key: 'canEditHomePage', label: 'تعديل الصفحة الرئيسية بالكامل (النصوص والأزرار والمميزات)', short: 'تعديل الرئيسية' },
      { key: 'canEditDemoMenu', label: 'إدارة التجربة والعرض والمنيو التجريبي', short: 'التجربة والعرض' },
      { key: 'canUseNotes', label: 'استخدام مسودة الملاحظات التلقائية', short: 'الملاحظات' },
      { key: 'canViewReports', label: 'عرض وإدارة بلاغات المشاكل الواردة', short: 'البلاغات' },
      { key: 'canManagePlans', label: 'تعديل الباقات والأسعار والميزات', short: 'الباقات والأسعار' },
      { key: 'canManageStaff', label: 'إدارة الموظفين وتوزيع الصلاحيات', short: 'إدارة الموظفين', critical: true },
    ],
  },
  {
    title: 'إعدادات المنصة والنظام (صلاحيات متشعبة)',
    items: [
      {
        key: 'canManageSettings',
        label: 'فتح قسم الإعدادات وتحديث بيانات الدعم',
        short: 'إعدادات المنصة',
        children: [
          { key: 'canEditTabLabels', label: 'تعديل أسماء قوائم الإدارة ولوحة الزبون', short: 'تعديل الأسماء' },
          { key: 'canReorderTabs', label: 'تغيير ترتيب القوائم بالسحب والإفلات', short: 'ترتيب القوائم' },
          { key: 'canManageThemeMode', label: 'التحكم بمظهر الموقع العام وبوابات الدفع', short: 'المظهر والدفع' },
          { key: 'canManageSubdomains', label: 'حوكمة وإلغاء الدومينات الفرعية', short: 'الدومينات' },
          { key: 'canRunMaintenance', label: 'تنظيف الصور غير المستخدمة وصيانة التخزين', short: 'صيانة التخزين' },
          { key: 'canManageDatabase', label: 'إدارة قاعدة البيانات والتحكم المباشر بالسجلات', short: 'قاعدة البيانات', critical: true },
        ],
      },
    ],
  },
];

const PERMISSION_DEFINITIONS: Array<{ key: keyof StaffPermissions; label: string; short: string; critical?: boolean }> =
  PERMISSION_GROUPS.flatMap((g) =>
    g.items.flatMap((it) => [
      { key: it.key, label: it.label, short: it.short, critical: it.critical },
      ...(it.children || []),
    ])
  );

function normalizeStaffPerms(raw?: StaffPermissions): StaffPermissions {
  const src = raw || {};
  const canPartners = Boolean(src.canManageRestaurants || src.canManageUsers);
  const canPlans = Boolean(src.canManagePlans);
  const canSettings = Boolean(src.canManageSettings ?? canPlans);
  return {
    canViewHome: src.canViewHome === undefined ? true : Boolean(src.canViewHome),
    canViewAnalytics: Boolean(src.canViewAnalytics),
    canManageRestaurants: canPartners,
    canCreatePartner: Boolean(src.canCreatePartner ?? canPartners),
    canEditPartnerPlan: Boolean(src.canEditPartnerPlan || src.canExtendSubscription),
    canSuspendPartner: Boolean(src.canSuspendPartner ?? canPartners),
    canEditPartnerProfile: Boolean(src.canEditPartnerProfile ?? canPartners),
    canEditPartnerLinks: Boolean(src.canEditPartnerLinks ?? canPartners),
    canImpersonatePartner: Boolean(src.canImpersonatePartner),
    canDeletePartner: Boolean(src.canDeletePartner),
    canEditDemoMenu: Boolean(src.canEditDemoMenu),
    canUseNotes: src.canUseNotes === undefined ? true : Boolean(src.canUseNotes),
    canViewReports: src.canViewReports === undefined ? true : Boolean(src.canViewReports),
    canManagePlans: canPlans,
    canManageStaff: Boolean(src.canManageStaff),
    canManageSettings: canSettings,
    canEditTabLabels: Boolean(src.canEditTabLabels ?? canSettings),
    canReorderTabs: Boolean(src.canReorderTabs ?? canSettings),
    canManageThemeMode: Boolean(src.canManageThemeMode ?? canSettings),
    canManageSubdomains: Boolean(src.canManageSubdomains ?? canSettings),
    canRunMaintenance: Boolean(src.canRunMaintenance ?? canSettings),
    canManageFinance: Boolean(src.canManageFinance),
    canManageDatabase: Boolean(src.canManageDatabase),
    canEditHomePage: Boolean(src.canEditHomePage ?? canSettings),
  };
}

interface StaffManagementSectionProps {
  sessionEmail: string;
  pageTitle?: string;
  canManageStaff: boolean;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

export const StaffManagementSection: React.FC<StaffManagementSectionProps> = ({
  sessionEmail,
  pageTitle,
  canManageStaff,
  onRefresh,
  showToast,
}) => {
  const [staffList, setStaffList] = useState<ManagedStaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [dataSource, setDataSource] = useState<'supabase' | 'file-memory'>('supabase');
  const [searchQuery, setSearchQuery] = useState('');

  // Add / Edit Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('مشرف دعم وعمليات المطاعم');
  const [formActive, setFormActive] = useState(true);
  const [formPerms, setFormPerms] = useState<StaffPermissions>({ ...DEFAULT_STAFF_PERMISSIONS });
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Physical Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<ManagedStaffMember | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const loadStaff = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await fetchStaffApi();
      setStaffList(res.staff || []);
      setDataSource(res.source);
      replaceCollectionCache('staff', res.staff || []);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'تعذر تحميل بيانات الموظفين من الخادم');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const openNewModal = () => {
    setEditingId(null);
    setFormName('');
    setFormPhone('');
    setFormPassword('');
    setFormRole('مشرف عمليات الشركاء');
    setFormActive(true);
    setFormPerms(normalizeStaffPerms(DEFAULT_STAFF_PERMISSIONS));
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (stf: ManagedStaffMember) => {
    setEditingId(stf.id);
    setFormName(stf.name);
    setFormPhone(stf.phone || (/^\+?\d[\d\s-]{5,}$/.test(stf.email || '') ? stf.email : '') || '');
    setFormPassword('');
    setFormRole(stf.roleTitle || 'مشرف عمليات الشركاء');
    setFormActive(stf.active !== false);
    setFormPerms(normalizeStaffPerms(stf.permissions));
    setFormError('');
    setShowModal(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageStaff) {
      setFormError('ليس لديك صلاحية إدارة الموظفين');
      return;
    }

    const cleanName = formName.trim();
    const cleanPhone = formPhone.trim();
    const cleanRole = formRole.trim() || 'مشرف دعم وعمليات المطاعم';
    const cleanPassword = formPassword.trim();

    if (!cleanName) {
      setFormError('يرجى إدخال اسم الموظف');
      return;
    }
    if (!cleanPhone) {
      setFormError('يرجى إدخال رقم الهاتف');
      return;
    }
    if (!editingId && cleanPassword.length < 8) {
      setFormError('كلمة المرور يجب ألا تقل عن 8 خانات (أرقام أو أحرف أو رموز)');
      return;
    }
    if (editingId && cleanPassword && cleanPassword.length < 8) {
      setFormError('كلمة المرور الجديدة يجب ألا تقل عن 8 خانات (أرقام أو أحرف أو رموز)');
      return;
    }

    setFormError('');
    setIsSaving(true);
    try {
      if (editingId) {
        const res = await updateStaffApi(editingId, {
          name: cleanName,
          email: cleanPhone,
          phone: cleanPhone,
          roleTitle: cleanRole,
          ...(cleanPassword ? { password: cleanPassword } : {}),
          active: formActive,
          permissions: formPerms,
        });
        logActivity(
          sessionEmail || 'المدير',
          'تعديل بيانات موظف (مزامنة دائمة)',
          `الموظف: ${res.staff.name} (${res.staff.roleTitle})`,
          'staff'
        );
        showToast('تم تطبيق التغيرات');
      } else {
        const res = await createStaffApi({
          name: cleanName,
          email: cleanPhone,
          phone: cleanPhone,
          roleTitle: cleanRole,
          password: cleanPassword,
          active: formActive,
          permissions: formPerms,
        });
        logActivity(
          sessionEmail || 'المدير',
          'إضافة موظف جديد (مزامنة دائمة)',
          `الموظف: ${res.staff.name} - ${res.staff.roleTitle}`,
          'staff'
        );
        showToast('تم تطبيق التغيرات');
      }

      setShowModal(false);
      await loadStaff(true);
      void syncFromServer().then(() => onRefresh());
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ بيانات الموظف');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmPhysicalDelete = async () => {
    if (!deleteTarget || !canManageStaff) return;
    setDeleteError('');
    setIsDeleting(true);
    try {
      await deleteStaffApi(deleteTarget.id);
      logActivity(
        sessionEmail || 'المدير',
        'حذف موظف نهائياً من قاعدة البيانات',
        `الموظف: ${deleteTarget.name} (${deleteTarget.phone || deleteTarget.email})`,
        'staff'
      );
      showToast('تم تطبيق التغيرات');
      setDeleteTarget(null);
      await loadStaff(true);
      void syncFromServer().then(() => onRefresh());
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'تعذر حذف السجل من قاعدة البيانات');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredStaff = staffList.filter((s) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q) ||
      s.roleTitle.toLowerCase().includes(q)
    );
  });

  const renderPermissionSummary = (perms: StaffPermissions) => {
    const enabled = PERMISSION_DEFINITIONS.filter((d) => Boolean(perms[d.key]));
    if (enabled.length === 0) return 'بدون صلاحيات مفعلة';
    const preview = enabled.slice(0, 3).map((d) => d.short).join(' · ');
    const extra = enabled.length > 3 ? ` +${enabled.length - 3}` : '';
    return `${preview}${extra}`;
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={22} style={{ color: 'var(--brand-ink, #34D399)' }} />
            <span>{pageTitle || 'إدارة الموظفين وفريق العمل'}</span>
          </h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
            إضافة وتعديل وحذف حسابات المشرفين مع مزامنة مباشرة وحذف فعلي دائم من قاعدة البيانات لتحسين المساحة.
          </p>
        </div>
        <div className="rw" style={{ gap: '8px' }}>
          <button
            type="button"
            className="btn s"
            onClick={() => void loadStaff()}
            disabled={isLoading}
            title="تحديث من قاعدة البيانات"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            تحديث
          </button>
          <button
            type="button"
            className="btn p"
            onClick={openNewModal}
            disabled={!canManageStaff}
            style={{ fontWeight: 'bold' }}
          >
            <Plus size={16} />
            إضافة موظف جديد
          </button>
        </div>
      </div>

      {/* Search & Storage Status Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '14px',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: '460px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              insetInlineStart: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            placeholder="ابحث عن موظف بالاسم أو رقم الهاتف أو الدور..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingInlineStart: '40px' }}
          />
        </div>
        <div
          className="muted tabular-nums"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}
        >
          <Database size={14} style={{ color: dataSource === 'supabase' ? '#10B981' : '#F59E0B' }} />
          <span>{dataSource === 'supabase' ? 'متصل بقاعدة بيانات Supabase' : 'الوضع المحلي الاحتياطي'}</span>
          <span>·</span>
          <span>إجمالي الموظفين: {staffList.length}</span>
        </div>
      </div>

      {/* Error State */}
      {errorMessage && (
        <div
          className="card"
          style={{
            marginBottom: '14px',
            padding: '14px 18px',
            borderColor: 'rgba(239, 68, 68, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#EF4444' }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{errorMessage}</span>
          </div>
          <button type="button" className="btn s" onClick={() => void loadStaff()}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Desktop Table */}
      <div className="card tw desktop-only-table" style={{ padding: '8px 16px' }}>
        <table>
          <thead>
            <tr>
              <th>الموظف</th>
              <th>المسمى الوظيفي</th>
              <th>الصلاحيات الممنوحة</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {/* Protected Owner Row */}
            <tr>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Crown size={16} style={{ color: '#F59E0B', flexShrink: 0 }} />
                  <b>مالك المنصة والمدير العام</b>
                </div>
                <div className="muted tabular-nums" style={{ fontSize: '12px', marginTop: '2px' }} dir="ltr">
                  {sessionEmail || '07711448594'} · الحساب الرئيسي
                </div>
              </td>
              <td>الإدارة العليا والسيادة الكاملة</td>
              <td className="muted tabular-nums" style={{ fontSize: '12.5px' }}>
                كافة الصلاحيات ({PERMISSION_DEFINITIONS.length} من {PERMISSION_DEFINITIONS.length}) · غير مقيدة
              </td>
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#10B981', fontWeight: 600, fontSize: '13px' }}>
                  <CheckCircle2 size={15} />
                  دائم
                </span>
              </td>
              <td>
                <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                  <Shield size={14} />
                  محمي من التعديل أو الحذف
                </span>
              </td>
            </tr>

            {isLoading ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <tr key={`skeleton-${idx}`}>
                  <td colSpan={5}>
                    <div
                      style={{
                        height: '20px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.06)',
                        width: idx % 2 === 0 ? '85%' : '70%',
                      }}
                    />
                  </td>
                </tr>
              ))
            ) : filteredStaff.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '28px 12px' }}>
                  <div className="muted" style={{ fontSize: '13.5px' }}>
                    {searchQuery.trim()
                      ? 'لا توجد نتائج مطابقة لبحثك في قائمة الموظفين.'
                      : 'لا يوجد موظفون مضافون حالياً. اضغط على "إضافة موظف جديد" للبدء.'}
                  </div>
                </td>
              </tr>
            ) : (
              filteredStaff.map((stf) => {
                const normalized = normalizeStaffPerms(stf.permissions);
                const grantedCount = PERMISSION_DEFINITIONS.filter((d) =>
                  Boolean(normalized[d.key])
                ).length;
                return (
                  <tr key={stf.id}>
                    <td>
                      <b style={{ fontSize: '14px' }}>{stf.name}</b>
                      <div className="muted tabular-nums" style={{ fontSize: '12px', marginTop: '2px' }} dir="ltr">
                        {stf.phone || stf.email}
                      </div>
                    </td>
                    <td style={{ fontSize: '13px' }}>{stf.roleTitle}</td>
                    <td>
                      <div style={{ fontSize: '12.5px', color: 'var(--ink)' }}>
                        {renderPermissionSummary(normalized)}
                      </div>
                      <div className="muted tabular-nums" style={{ fontSize: '11.5px', marginTop: '2px' }}>
                        {grantedCount} من {PERMISSION_DEFINITIONS.length} صلاحيات مفعلة
                      </div>
                    </td>
                    <td>
                      {stf.active !== false ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#10B981', fontWeight: 600, fontSize: '13px' }}>
                          <CheckCircle2 size={15} />
                          فعّال
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#EF4444', fontWeight: 600, fontSize: '13px' }}>
                          <PauseCircle size={15} />
                          معطل
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="rw" style={{ gap: '6px', justifyContent: 'flex-start' }}>
                        <button
                          type="button"
                          className="btn s"
                          onClick={() => openEditModal(stf)}
                          disabled={!canManageStaff}
                        >
                          <Pencil size={14} />
                          تعديل
                        </button>
                        <button
                          type="button"
                          className="btn s d"
                          onClick={() => {
                            setDeleteError('');
                            setDeleteTarget(stf);
                          }}
                          disabled={!canManageStaff}
                        >
                          <Trash2 size={14} />
                          حذف نهائي
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards-only">
        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <b style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Crown size={16} style={{ color: '#F59E0B' }} />
              مالك المنصة والمدير العام
            </b>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#10B981', fontWeight: 600, fontSize: '12.5px' }}>
              <CheckCircle2 size={14} />
              دائم
            </span>
          </div>
          <div className="muted tabular-nums" style={{ fontSize: '12px', marginBottom: '6px' }} dir="ltr">
            {sessionEmail || '07711448594'} · الحساب الرئيسي
          </div>
          <div className="muted" style={{ fontSize: '12px' }}>
            كافة الصلاحيات ({PERMISSION_DEFINITIONS.length} من {PERMISSION_DEFINITIONS.length}) · محمي من الحذف
          </div>
        </div>

        {isLoading ? (
          <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
            <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--brand-ink, #34D399)' }} />
          </div>
        ) : (
          filteredStaff.map((stf) => {
            const normalized = normalizeStaffPerms(stf.permissions);
            const grantedCount = PERMISSION_DEFINITIONS.filter((d) =>
              Boolean(normalized[d.key])
            ).length;
            return (
              <div key={stf.id} className="card" style={{ padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                  <div>
                    <b style={{ fontSize: '15px' }}>{stf.name}</b>
                    <div className="muted tabular-nums" style={{ fontSize: '12px' }} dir="ltr">
                      {stf.phone || stf.email}
                    </div>
                  </div>
                  {stf.active !== false ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#10B981', fontWeight: 600, fontSize: '12.5px' }}>
                      <CheckCircle2 size={14} />
                      فعّال
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#EF4444', fontWeight: 600, fontSize: '12.5px' }}>
                      <PauseCircle size={14} />
                      معطل
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '12.5px', margin: '8px 0 4px', color: 'var(--ink)' }}>
                  {stf.roleTitle}
                </div>
                <div className="muted tabular-nums" style={{ fontSize: '12px', marginBottom: '12px' }}>
                  {renderPermissionSummary(normalized)} · ({grantedCount} من {PERMISSION_DEFINITIONS.length})
                </div>

                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
                  <button
                    type="button"
                    className="btn s"
                    onClick={() => openEditModal(stf)}
                    disabled={!canManageStaff}
                    style={{ flex: 1 }}
                  >
                    <Pencil size={14} />
                    تعديل الصلاحيات
                  </button>
                  <button
                    type="button"
                    className="btn s d"
                    onClick={() => {
                      setDeleteError('');
                      setDeleteTarget(stf);
                    }}
                    disabled={!canManageStaff}
                  >
                    <Trash2 size={14} />
                    حذف
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Staff Modal */}
      {showModal && (
        <div className="ajax-backdrop" onClick={() => !isSaving && setShowModal(false)}>
          <div
            className="ajax-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '640px', textAlign: 'start' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>
                {editingId ? 'تعديل بيانات وصلاحيات الموظف' : 'إضافة موظف جديد للمنصة'}
              </h2>
              <button
                type="button"
                className="btn s"
                onClick={() => !isSaving && setShowModal(false)}
                disabled={isSaving}
                style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0 }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div
                style={{
                  marginBottom: '14px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#EF4444',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="g2" style={{ gap: '12px' }}>
                <label className="f" style={{ margin: 0 }}>
                  اسم الموظف
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="مثال: أحمد الكرخي"
                    disabled={isSaving}
                    required
                  />
                </label>
                <label className="f" style={{ margin: 0 }}>
                  المسمى والدور الوظيفي
                  <select
                    value={formRole}
                    disabled={isSaving}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormRole(val);
                      const preset = STAFF_PRESET_ROLES.find((r) => r.title === val);
                      if (preset) {
                        setFormPerms({ ...preset.perms });
                      }
                    }}
                  >
                    {STAFF_PRESET_ROLES.map((r) => (
                      <option key={r.title} value={r.title}>
                        {r.title}
                      </option>
                    ))}
                    <option value="دور مخصص">دور مخصص</option>
                  </select>
                </label>

                <label className="f" style={{ margin: 0 }}>
                  رقم الهاتف لتسجيل الدخول
                  <input
                    type="tel"
                    dir="ltr"
                    className="tabular-nums"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="07701234567"
                    disabled={isSaving}
                    required
                  />
                </label>

                <label className="f" style={{ margin: 0 }}>
                  كلمة المرور {editingId ? '(اتركها فارغة للإبقاء على الحالية)' : '(8 خانات كحد أدنى — أرقام أو أحرف أو رموز)'}
                  <input
                    type="password"
                    dir="ltr"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isSaving}
                  />
                </label>
              </div>

              <div
                style={{
                  paddingTop: '14px',
                  borderTop: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
                  <b style={{ color: 'var(--brand-ink, #34D399)', fontSize: '14px' }}>
                    الصلاحيات الممنوحة لهذا الحساب (شجرة متدرجة)
                  </b>
                  <span className="muted" style={{ fontSize: '11.5px' }}>
                    قسم &quot;حسابك&quot; متاح دائماً للموظف
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {PERMISSION_GROUPS.map((group) => (
                    <div
                      key={group.title}
                      style={{
                        paddingTop: '10px',
                        borderTop: '1px solid var(--line)',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--brand-ink, #34D399)', marginBottom: '8px' }}>
                        {group.title}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {group.items.map((item) => {
                          const parentChecked = Boolean(formPerms[item.key]);
                          return (
                            <div key={String(item.key)} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '8px 10px',
                                  borderRadius: '10px',
                                  background: parentChecked ? 'var(--soft)' : 'transparent',
                                  border: parentChecked
                                    ? item.critical
                                      ? '1px solid rgba(239, 68, 68, 0.45)'
                                      : '1px solid var(--brand)'
                                    : '1px solid var(--line)',
                                  fontSize: '13px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  color: item.critical && parentChecked ? 'var(--bad)' : 'var(--ink)',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  disabled={isSaving}
                                  checked={parentChecked}
                                  onChange={(e) => {
                                    const nextVal = e.target.checked;
                                    const patch: StaffPermissions = {
                                      ...formPerms,
                                      [item.key]: nextVal,
                                    };
                                    if (!nextVal && item.children) {
                                      item.children.forEach((ch) => {
                                        patch[ch.key] = false;
                                      });
                                    }
                                    setFormPerms(patch);
                                  }}
                                />
                                <span style={{ lineHeight: 1.4 }}>{item.label}</span>
                              </label>

                              {item.children && item.children.length > 0 && (
                                <div
                                  className="modal-grid-2"
                                  style={{
                                    gap: '6px',
                                    paddingInlineStart: '16px',
                                    borderInlineStart: '2px solid var(--line)',
                                  }}
                                >
                                  {item.children.map((ch) => {
                                    const childChecked = Boolean(formPerms[ch.key]);
                                    return (
                                      <label
                                        key={String(ch.key)}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '7px',
                                          padding: '6px 9px',
                                          borderRadius: '8px',
                                          background: childChecked ? 'var(--soft)' : 'var(--bg)',
                                          border: childChecked
                                            ? ch.critical
                                              ? '1px solid rgba(239, 68, 68, 0.45)'
                                              : '1px solid var(--brand)'
                                            : '1px solid var(--line)',
                                          fontSize: '12px',
                                          cursor: 'pointer',
                                          color: ch.critical && childChecked ? 'var(--bad)' : 'var(--ink)',
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          disabled={isSaving}
                                          checked={childChecked}
                                          onChange={(e) => {
                                            const nextVal = e.target.checked;
                                            setFormPerms({
                                              ...formPerms,
                                              [item.key]: nextVal ? true : formPerms[item.key],
                                              [ch.key]: nextVal,
                                            });
                                          }}
                                        />
                                        <span style={{ lineHeight: 1.35 }}>{ch.label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  disabled={isSaving}
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                <b>حساب الموظف فعّال ويمكنه تسجيل الدخول فوراً</b>
              </label>

              <div className="rw l" style={{ gap: '8px' }}>
                <button type="submit" className="btn p" disabled={isSaving}>
                  {isSaving && <Loader2 size={15} className="animate-spin" />}
                  {isSaving
                    ? 'جاري الحفظ في قاعدة البيانات...'
                    : editingId
                    ? 'حفظ التعديلات في قاعدة البيانات'
                    : 'إنشاء وحفظ الموظف'}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={isSaving}
                  onClick={() => setShowModal(false)}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Physical Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="ajax-backdrop" onClick={() => !isDeleting && setDeleteTarget(null)}>
          <div className="ajax-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="ajax-icon danger">
              <Trash2 size={26} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px' }}>
              حذف الموظف نهائياً
            </h3>
            <p className="muted" style={{ fontSize: '13.5px', lineHeight: 1.7, margin: '0 0 16px' }}>
              هل أنت متأكد من حذف الموظف <b>&quot;{deleteTarget.name}&quot;</b> ({deleteTarget.phone || deleteTarget.email})؟
              <br />
              سيتم تنفيذ حذف فعلي ودائم للسجل من قاعدة البيانات لتحرير المساحة ولا يمكن التراجع عنه.
            </p>

            {deleteError && (
              <div
                style={{
                  marginBottom: '14px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#EF4444',
                  fontSize: '12.5px',
                }}
              >
                {deleteError}
              </div>
            )}

            <div className="rw" style={{ justifyContent: 'center', gap: '10px' }}>
              <button
                type="button"
                className="btn p d"
                disabled={isDeleting}
                onClick={() => void handleConfirmPhysicalDelete()}
                style={{ minWidth: '150px' }}
              >
                {isDeleting && <Loader2 size={15} className="animate-spin" />}
                {isDeleting ? 'جاري الحذف النهائي...' : 'تأكيد الحذف النهائي'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
