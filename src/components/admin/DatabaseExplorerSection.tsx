/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Code2,
  Copy,
  Database,
  FileText,
  FolderTree,
  History,
  KeyRound,
  Layers,
  Loader2,
  Phone,
  RefreshCw,
  Save,
  Search,
  Send,
  Shield,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  bulkDeleteDatabaseRecordsApi,
  cleanupUnusedImagesApi,
  DbAccountRow,
  DbCatalogRow,
  DbOrderRow,
  DbOverviewResponse,
  DbPhoneIndexRow,
  DbRawRecordSummary,
  DbRestaurantRow,
  DbStaffRow,
  deleteDatabasePhoneApi,
  deleteDatabaseRecordApi,
  deleteTelegramBindingApi,
  fetchDatabaseOverviewApi,
  updateDatabaseRecordApi,
} from '../../utils/adminApi';
import { syncFromServer } from '../../utils/storage';

type DbSubTab = 'accounts' | 'restaurants' | 'phones' | 'telegram' | 'catalog' | 'audit' | 'kv';

interface DatabaseExplorerSectionProps {
  pageTitle?: string;
  canManageDatabase: boolean;
  canRunMaintenance?: boolean;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

interface ConfirmDialogState {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

interface JsonModalState {
  key: string;
  editable: boolean;
  text: string;
  error: string;
  saving: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(val?: string | number | null): string {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const LOG_TYPE_LABEL: Record<string, string> = {
  auth: 'دخول/مصادقة',
  security: 'أمان',
  restaurant: 'مشروع/حساب',
  staff: 'موظفين',
  plan: 'باقات',
  finance: 'مالية',
  system: 'نظام',
  database: 'قاعدة البيانات',
};

export const DatabaseExplorerSection: React.FC<DatabaseExplorerSectionProps> = ({
  pageTitle,
  canManageDatabase,
  canRunMaintenance,
  onRefresh,
  showToast,
}) => {
  const allowMaintenance = canRunMaintenance ?? canManageDatabase;
  const [data, setData] = useState<DbOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{
    removedOrphanRecords: number;
    strippedUnreferencedImages: number;
    reclaimedBytes: number;
  } | null>(null);

  const [subTab, setSubTab] = useState<DbSubTab>('accounts');
  const [search, setSearch] = useState('');

  // Sub-switches within grouped tabs
  const [accountsMode, setAccountsMode] = useState<'accounts' | 'staff'>('accounts');
  const [phonesMode, setPhonesMode] = useState<'directory' | 'telegram'>('directory');
  const [telegramFilter, setTelegramFilter] = useState<'all' | 'no_account' | 'with_account'>('all');
  const [catalogMode, setCatalogMode] = useState<'categories' | 'items' | 'orders'>('categories');
  const [auditMode, setAuditMode] = useState<'logs' | 'sessions'>('logs');
  const [kvPrefix, setKvPrefix] = useState<string>('all');

  // Bulk selection state (stores record keys)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Modals
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);
  const [jsonModal, setJsonModal] = useState<JsonModalState | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchDatabaseOverviewApi();
      setData(res);
      setSelectedKeys(new Set());
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل بيانات قاعدة البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleAfterMutation = async (toastMsg: string) => {
    showToast(toastMsg);
    await loadOverview(true);
    void syncFromServer().then(() => onRefresh());
  };

  const openJsonInspector = (key: string, value: unknown, editable: boolean) => {
    setCopiedJson(false);
    setJsonModal({
      key,
      editable: editable && canManageDatabase && key !== 'accounts/acc_admin_owner',
      text: JSON.stringify(value, null, 2),
      error: '',
      saving: false,
    });
  };

  const handleSaveJsonModal = async () => {
    if (!jsonModal || !jsonModal.editable) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonModal.text);
    } catch {
      setJsonModal({ ...jsonModal, error: 'صيغة JSON غير صالحة. يرجى التحقق من الأقواس والفواصل.' });
      return;
    }
    setJsonModal({ ...jsonModal, saving: true, error: '' });
    try {
      await updateDatabaseRecordApi(jsonModal.key, parsed);
      setJsonModal(null);
      await handleAfterMutation(`تم تحديث السجل (${jsonModal.key}) وحفظه ✓`);
    } catch (err: unknown) {
      setJsonModal({
        ...jsonModal,
        saving: false,
        error: err instanceof Error ? err.message : 'تعذر حفظ التعديلات',
      });
    }
  };

  const requestDeleteKey = (key: string, label: string, cascade = false) => {
    if (!canManageDatabase) {
      showToast('ليست لديك صلاحية الحذف من قاعدة البيانات');
      return;
    }
    setConfirmState({
      title: cascade ? 'حذف شامل مع البيانات المرتبطة' : 'تأكيد الحذف من قاعدة البيانات',
      description: cascade
        ? `سيتم حذف "${label}" (${key}) وجميع البيانات المرتبطة به (الأقسام، العناصر، الطلبات، والحسابات المربوطة) نهائياً من الخادم.`
        : `سيتم حذف السجل "${label}" (${key}) نهائياً من قاعدة البيانات ولا يمكن التراجع عن هذا الإجراء.`,
      confirmLabel: cascade ? 'تأكيد الحذف الشامل' : 'حذف السجل نهائياً',
      onConfirm: async () => {
        setBusyAction(true);
        try {
          const res = await deleteDatabaseRecordApi(key, cascade);
          setConfirmState(null);
          await handleAfterMutation(`تم حذف ${res.deletedCount} سجل من قاعدة البيانات ✓`);
        } catch (err: unknown) {
          showToast(err instanceof Error ? err.message : 'تعذر حذف السجل');
        } finally {
          setBusyAction(false);
        }
      },
    });
  };

  const handleRunCleanupMaintenance = async () => {
    if (!allowMaintenance) {
      showToast('ليس لديك صلاحية تشغيل صيانة التخزين');
      return;
    }
    setCleanupLoading(true);
    try {
      const res = await cleanupUnusedImagesApi();
      setCleanupResult(res);
      await loadOverview(true);
      void syncFromServer().then(() => onRefresh());
      showToast('تم تطبيق التغيرات');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر تنفيذ صيانة التنظيف');
    } finally {
      setCleanupLoading(false);
    }
  };

  const requestDeletePhoneRoot = (row: DbPhoneIndexRow) => {
    if (!canManageDatabase) {
      showToast('ليست لديك صلاحية الحذف من قاعدة البيانات');
      return;
    }
    setConfirmState({
      title: `حذف الرقم ${row.phone} من جذوره`,
      description: `سيتم مسح جميع الحسابات غير الإدارية، حسابات الموظفين، ارتباط تيليجرام، وإزالة الرقم من ملفات المتاجر المرتبطة (${row.sources.length} ارتباط) ليصبح متاحاً من جديد.`,
      confirmLabel: 'حذف من جذوره نهائياً',
      onConfirm: async () => {
        setBusyAction(true);
        try {
          const res = await deleteDatabasePhoneApi(row.phone);
          setConfirmState(null);
          await handleAfterMutation(
            `تم حذف الرقم ${res.phone} (${res.deletedKeys.length} سجل) ✓`
          );
        } catch (err: unknown) {
          showToast(err instanceof Error ? err.message : 'تعذر حذف الرقم من جذوره');
        } finally {
          setBusyAction(false);
        }
      },
    });
  };

  const requestBulkDelete = (keysToDelete: string[], title: string) => {
    if (!canManageDatabase || keysToDelete.length === 0) return;
    setConfirmState({
      title,
      description: `سيتم حذف ${keysToDelete.length} سجل محدد نهائياً من قاعدة البيانات (يتم استثناء الحسابات المحمية وجلستك الحالية تلقائياً).`,
      confirmLabel: `حذف (${keysToDelete.length}) سجل`,
      onConfirm: async () => {
        setBusyAction(true);
        try {
          const res = await bulkDeleteDatabaseRecordsApi(keysToDelete);
          setConfirmState(null);
          await handleAfterMutation(`تم حذف ${res.deletedCount} سجل بنجاح ✓`);
        } catch (err: unknown) {
          showToast(err instanceof Error ? err.message : 'تعذر تنفيذ الحذف الجماعي');
        } finally {
          setBusyAction(false);
        }
      },
    });
  };

  const toggleSelectKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const q = search.trim().toLowerCase();

  const filteredAccounts = useMemo(() => {
    const list = data?.sections.accounts || [];
    if (!q) return list;
    return list.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.rid.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
    );
  }, [data, q]);

  const filteredStaff = useMemo(() => {
    const list = data?.sections.staff || [];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        s.roleTitle.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    );
  }, [data, q]);

  const filteredRestaurants = useMemo(() => {
    const list = data?.sections.restaurants || [];
    if (!q) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.owner.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
    );
  }, [data, q]);

  const filteredPhones = useMemo(() => {
    const list = data?.sections.phonesIndex || [];
    if (!q) return list;
    return list.filter(
      (p) =>
        p.phone.toLowerCase().includes(q) ||
        p.telegramChatId.toLowerCase().includes(q) ||
        p.telegramUsername.toLowerCase().includes(q) ||
        p.sources.some((s) => s.label.toLowerCase().includes(q) || s.key.toLowerCase().includes(q))
    );
  }, [data, q]);

  const filteredTelegram = useMemo(() => {
    const list = data?.sections.telegramUsers || [];
    return list.filter((t) => {
      if (telegramFilter === 'no_account' && t.hasPlatformAccount) return false;
      if (telegramFilter === 'with_account' && !t.hasPlatformAccount) return false;
      if (!q) return true;
      return (
        t.phone.toLowerCase().includes(q) ||
        t.chatId.toLowerCase().includes(q) ||
        t.username.toLowerCase().includes(q) ||
        t.firstName.toLowerCase().includes(q) ||
        (t.linkedAccountNames || []).some((n) => n.toLowerCase().includes(q))
      );
    });
  }, [data, q, telegramFilter]);

  const telegramStats = useMemo(() => {
    const list = data?.sections.telegramUsers || [];
    const withAccount = list.filter((t) => t.hasPlatformAccount).length;
    const withoutAccount = list.length - withAccount;
    return { total: list.length, withAccount, withoutAccount };
  }, [data]);

  const filteredCatalogRows = useMemo(() => {
    if (!data) return [];
    if (catalogMode === 'categories') {
      return data.sections.categories.filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.restaurantName.toLowerCase().includes(q) ||
          c.rid.toLowerCase().includes(q) ||
          c.key.toLowerCase().includes(q)
      );
    }
    if (catalogMode === 'items') {
      return data.sections.items.filter(
        (it) =>
          !q ||
          it.name.toLowerCase().includes(q) ||
          it.restaurantName.toLowerCase().includes(q) ||
          it.rid.toLowerCase().includes(q) ||
          it.key.toLowerCase().includes(q)
      );
    }
    return data.sections.orders.filter(
      (o) =>
        !q ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        o.restaurantName.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q)
    );
  }, [data, catalogMode, q]);

  const filteredLogs = useMemo(() => {
    const list = data?.sections.auditLogs || [];
    if (!q) return list;
    return list.filter(
      (l) =>
        l.actor.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        l.type.toLowerCase().includes(q)
    );
  }, [data, q]);

  const filteredUserSessions = useMemo(() => {
    const list = data?.sections.userSessions || [];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.phone.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.rid.toLowerCase().includes(q) ||
        s.sid.toLowerCase().includes(q)
    );
  }, [data, q]);

  const filteredRawRecords = useMemo(() => {
    const list = data?.sections.rawRecords || [];
    return list.filter((rec) => {
      if (kvPrefix !== 'all') {
        if (kvPrefix === 'finance_') {
          if (!rec.key.startsWith('finance_')) return false;
        } else if (!rec.key.startsWith(kvPrefix)) {
          return false;
        }
      }
      if (!q) return true;
      return (
        rec.key.toLowerCase().includes(q) ||
        rec.summary.toLowerCase().includes(q) ||
        JSON.stringify(rec.value).toLowerCase().includes(q)
      );
    });
  }, [data, kvPrefix, q]);

  const counts = data?.counts;
  const meta = data?.meta;

  const subTabs: Array<{ id: DbSubTab; label: string; count: number; Icon: React.ElementType }> = [
    {
      id: 'accounts',
      label: 'الحسابات المسجلة',
      count: (counts?.accounts || 0) + (counts?.staff || 0),
      Icon: Users,
    },
    {
      id: 'restaurants',
      label: 'المشاريع والمتاجر',
      count: counts?.restaurants || 0,
      Icon: Building2,
    },
    {
      id: 'phones',
      label: 'دليل الأرقام',
      count: counts?.phones || 0,
      Icon: Phone,
    },
    {
      id: 'telegram',
      label: 'أرقام التليكرام',
      count: counts?.telegramUsers || 0,
      Icon: Send,
    },
    {
      id: 'catalog',
      label: 'الأقسام والعناصر والطلبات',
      count: (counts?.categories || 0) + (counts?.items || 0) + (counts?.orders || 0),
      Icon: Layers,
    },
    {
      id: 'audit',
      label: 'سجل التعديلات والجلسات',
      count: (counts?.auditLogs || 0) + (counts?.userSessions || 0),
      Icon: History,
    },
    {
      id: 'kv',
      label: 'كافة السجلات (KV)',
      count: meta?.totalKvRecords || 0,
      Icon: FolderTree,
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mp-db-header">
        <div className="mp-db-header-info">
          <h1 className="mp-db-title">
            <Database size={21} style={{ color: 'var(--brand)', flexShrink: 0 }} />
            <span>{pageTitle || 'قاعدة البيانات والتحكم الكامل'}</span>
          </h1>
          <p className="muted mp-db-subtitle">
            استعراض وتحكم مباشر بجميع السجلات، الحسابات، الأرقام، سجل التعديلات، وصيانة التخزين.
          </p>
        </div>

        <div className="mp-db-header-actions">
          <button
            type="button"
            className="btn s"
            onClick={() => void loadOverview()}
            disabled={loading || busyAction}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>تحديث مباشر</span>
          </button>
        </div>
      </div>

      {/* Summary Telemetry Strip */}
      <div className="card mp-db-telemetry">
        <div>
          <div className="muted" style={{ fontSize: '11.5px', marginBottom: '2px' }}>محرك التخزين</div>
          <div style={{ fontWeight: 700, fontSize: '13.5px' }}>
            {meta?.supabaseConnected ? 'Supabase + المحلي' : 'التخزين المحلي'}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: '11.5px', marginBottom: '2px' }}>إجمالي المفاتيح</div>
          <div className="tabular-nums" style={{ fontWeight: 800, fontSize: '16px' }}>
            {meta?.totalKvRecords ?? '—'}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: '11.5px', marginBottom: '2px' }}>حجم البيانات</div>
          <div className="tabular-nums" style={{ fontWeight: 800, fontSize: '16px' }}>
            {meta ? formatBytes(meta.totalBytes) : '—'}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: '11.5px', marginBottom: '2px' }}>الحسابات والمتاجر</div>
          <div className="tabular-nums" style={{ fontWeight: 800, fontSize: '16px' }}>
            {counts ? `${counts.accounts} · ${counts.restaurants}` : '—'}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: '11.5px', marginBottom: '2px' }}>الأرقام وتيليجرام</div>
          <div className="tabular-nums" style={{ fontWeight: 800, fontSize: '16px' }}>
            {counts ? `${counts.phones} رقم (${counts.telegramUsers} تيليجرام)` : '—'}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: '11.5px', marginBottom: '2px' }}>سجل التعديلات</div>
          <div className="tabular-nums" style={{ fontWeight: 800, fontSize: '16px' }}>
            {counts?.auditLogs ?? '—'}
          </div>
        </div>
      </div>

      {/* Moved Section: Storage Maintenance & Unused Images Cleanup */}
      <div className="card mp-db-maintenance-bar">
        <div className="mp-db-maintenance-main">
          <div className="mp-db-maintenance-ico">
            <Sparkles size={16} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '13.5px', marginBottom: '2px' }}>
              صيانة التخزين وتنظيف الصور غير المستخدمة
            </div>
            <div className="muted" style={{ fontSize: '12px', lineHeight: 1.5 }}>
              يحذف الأقسام والأصناف اليتيمة التابعة لمتاجر محذوفة ويسترد مساحة التخزين في القاعدة تلقائياً.
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn s p"
          style={{ flexShrink: 0 }}
          disabled={!allowMaintenance || cleanupLoading}
          onClick={() => void handleRunCleanupMaintenance()}
        >
          <RefreshCw size={14} className={cleanupLoading ? 'animate-spin' : ''} />
          <span>{cleanupLoading ? 'جاري الفحص...' : 'تنظيف الآن'}</span>
        </button>

        {cleanupResult && (
          <div className="mp-db-cleanup-result">
            <span>
              تم التنظيف بنجاح ✓ — سجلات يتيمة محذوفة: <b>{cleanupResult.removedOrphanRecords}</b> · صور منظفة:{' '}
              <b>{cleanupResult.strippedUnreferencedImages}</b> · مساحة مستردة:{' '}
              <b>{Math.round(cleanupResult.reclaimedBytes / 1024)} ك.ب</b>
            </span>
            <button
              type="button"
              className="mp-tbl-btn"
              onClick={() => setCleanupResult(null)}
              aria-label="إخفاء النتيجة"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="mp-db-tabs" role="tablist">
        {subTabs.map((tab) => {
          const Icon = tab.Icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setSubTab(tab.id);
                setSelectedKeys(new Set());
              }}
              className={`mp-db-tab${active ? ' is-active' : ''}`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              <span className="mp-db-tab-count tabular-nums">({tab.count})</span>
            </button>
          );
        })}
      </div>

      {/* Search Bar & Bulk Actions */}
      <div className="mp-db-toolbar">
        <div className="mp-db-search-wrap">
          <Search
            size={15}
            className="mp-db-search-ico"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث فوري بالاسم، الهاتف، المعرف، المفتاح، أو التفاصيل..."
            className="mp-db-search-input"
          />
        </div>

        {selectedKeys.size > 0 && canManageDatabase && (
          <div className="mp-db-bulk-actions">
            <span className="muted tabular-nums" style={{ fontSize: '12.5px', fontWeight: 700 }}>
              محدد: {selectedKeys.size}
            </span>
            <button
              type="button"
              className="btn s d"
              disabled={busyAction}
              onClick={() => requestBulkDelete(Array.from(selectedKeys), 'حذف السجلات المحددة')}
            >
              <Trash2 size={14} />
              <span>حذف المحدد نهائياً</span>
            </button>
            <button
              type="button"
              className="btn s"
              onClick={() => setSelectedKeys(new Set())}
            >
              إلغاء التحديد
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div
          className="card"
          style={{
            padding: '12px 16px',
            marginBottom: '12px',
            borderColor: 'rgba(239, 68, 68, 0.4)',
            color: 'var(--bad)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600 }}>{errorMsg}</span>
          <button type="button" className="btn s" onClick={() => void loadOverview()}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="card" style={{ padding: '40px 16px', textAlign: 'center' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: 'var(--brand)' }} />
          <div className="muted" style={{ fontSize: '13px' }}>جاري قراءة جميع جداول وسجلات قاعدة البيانات...</div>
        </div>
      ) : (
        <>
          {/* ================================================================ */}
          {/* SUB-TAB 1: ACCOUNTS & STAFF                                      */}
          {/* ================================================================ */}
          {subTab === 'accounts' && (
            <div>
              <div className="mp-db-subbar">
                <div className="mp-seg-group">
                  <button
                    type="button"
                    className={`mp-seg-btn${accountsMode === 'accounts' ? ' is-active' : ''}`}
                    onClick={() => setAccountsMode('accounts')}
                  >
                    حسابات الشركاء والإدارة ({data?.sections.accounts.length || 0})
                  </button>
                  <button
                    type="button"
                    className={`mp-seg-btn${accountsMode === 'staff' ? ' is-active' : ''}`}
                    onClick={() => setAccountsMode('staff')}
                  >
                    حسابات الموظفين ({data?.sections.staff.length || 0})
                  </button>
                </div>
              </div>

              {accountsMode === 'accounts' ? (
                <div className="card tw mp-db-table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>الاسم / الحساب</th>
                        <th>الهاتف / المعرف</th>
                        <th>المشروع (RID)</th>
                        <th>الدور والربط</th>
                        <th>تاريخ الإنشاء</th>
                        <th style={{ whiteSpace: 'nowrap' }}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccounts.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                            لا توجد حسابات مطابقة.
                          </td>
                        </tr>
                      ) : (
                        filteredAccounts.map((acc: DbAccountRow) => (
                          <tr key={acc.key}>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: '13.5px' }}>{acc.name}</div>
                              <div className="muted" style={{ fontSize: '11.5px', fontFamily: 'monospace' }} dir="ltr">
                                {acc.key}
                              </div>
                            </td>
                            <td className="tabular-nums" dir="ltr" style={{ fontSize: '13px' }}>
                              <div>{acc.phone || acc.email || '—'}</div>
                              {acc.projectPhone && acc.projectPhone !== acc.phone && (
                                <div className="muted" style={{ fontSize: '11.5px' }}>
                                  مشروع: {acc.projectPhone}
                                </div>
                              )}
                            </td>
                            <td style={{ fontSize: '12.5px' }}>
                              <span style={{ fontFamily: 'monospace' }}>{acc.rid || '—'}</span>
                            </td>
                            <td style={{ fontSize: '12.5px' }}>
                              <div>{acc.role === 'admin' ? 'مدير النظام' : 'شريك'} · {acc.active ? 'فعّال' : 'معطل'}</div>
                              {acc.telegramLinked && (
                                <div className="muted tabular-nums" style={{ fontSize: '11.5px' }}>
                                  تيليجرام: {acc.telegramChatId || 'مربوط'}
                                </div>
                              )}
                            </td>
                            <td className="muted tabular-nums" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                              {acc.createdAt || '—'}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div className="mp-tbl-actions">
                                <button
                                  type="button"
                                  className="mp-tbl-btn"
                                  title="عرض وتعديل JSON"
                                  onClick={() => openJsonInspector(acc.key, acc.raw, true)}
                                >
                                  <Code2 size={13} />
                                  <span>فحص</span>
                                </button>
                                {acc.protected ? (
                                  <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', paddingInline: '6px' }}>
                                    <Shield size={13} />
                                    محمي
                                  </span>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="mp-tbl-btn is-danger"
                                      disabled={!canManageDatabase || busyAction}
                                      onClick={() => requestDeleteKey(acc.key, acc.name, false)}
                                    >
                                      <Trash2 size={13} />
                                      <span>حذف</span>
                                    </button>
                                    {acc.rid && acc.rid !== 'demo' && (
                                      <button
                                        type="button"
                                        className="mp-tbl-btn is-danger"
                                        title="حذف الحساب مع متجره وأقسامه وعناصره وطلباته"
                                        disabled={!canManageDatabase || busyAction}
                                        onClick={() => requestDeleteKey(acc.key, `${acc.name} + متجره`, true)}
                                      >
                                        <span>حذف شامل</span>
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="card tw mp-db-table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>اسم الموظف</th>
                        <th>الهاتف / البريد</th>
                        <th>المسمى الوظيفي</th>
                        <th>الحالة</th>
                        <th style={{ whiteSpace: 'nowrap' }}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStaff.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                            لا توجد سجلات موظفين مطابقة.
                          </td>
                        </tr>
                      ) : (
                        filteredStaff.map((st: DbStaffRow) => (
                          <tr key={st.key}>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: '13.5px' }}>{st.name}</div>
                              <div className="muted" style={{ fontSize: '11.5px', fontFamily: 'monospace' }} dir="ltr">
                                {st.key}
                              </div>
                            </td>
                            <td className="tabular-nums" dir="ltr" style={{ fontSize: '13px' }}>
                              {st.phone || st.email || '—'}
                            </td>
                            <td style={{ fontSize: '12.5px' }}>{st.roleTitle}</td>
                            <td style={{ fontSize: '12.5px' }}>{st.active ? 'فعّال' : 'معطل'}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div className="mp-tbl-actions">
                                <button
                                  type="button"
                                  className="mp-tbl-btn"
                                  onClick={() => openJsonInspector(st.key, st.raw, true)}
                                >
                                  <Code2 size={13} />
                                  <span>فحص</span>
                                </button>
                                <button
                                  type="button"
                                  className="mp-tbl-btn is-danger"
                                  disabled={!canManageDatabase || busyAction}
                                  onClick={() => requestDeleteKey(st.key, st.name, false)}
                                >
                                  <Trash2 size={13} />
                                  <span>حذف</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* SUB-TAB 2: RESTAURANTS / PROJECTS                                */}
          {/* ================================================================ */}
          {subTab === 'restaurants' && (
            <div className="card tw mp-db-table-card">
              <table>
                <thead>
                  <tr>
                    <th>المشروع / المتجر</th>
                    <th>المالك والهاتف</th>
                    <th>الباقة والحالة</th>
                    <th>المحتوى (أقسام · عناصر · طلبات)</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRestaurants.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                        لا توجد مشاريع مطابقة.
                      </td>
                    </tr>
                  ) : (
                    filteredRestaurants.map((r: DbRestaurantRow) => (
                      <tr key={r.key}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: '13.5px' }}>{r.name}</div>
                          <div className="muted" style={{ fontSize: '11.5px', fontFamily: 'monospace' }} dir="ltr">
                            {r.key} {r.slug ? `· /${r.slug}` : ''}
                          </div>
                        </td>
                        <td style={{ fontSize: '12.5px' }}>
                          <div>{r.owner || '—'}</div>
                          <div className="muted tabular-nums" dir="ltr" style={{ fontSize: '12px' }}>
                            {r.phone || 'بدون هاتف'}
                          </div>
                        </td>
                        <td style={{ fontSize: '12.5px' }}>
                          <div>{r.planName} · {r.projectType === 'store' ? 'متجر' : 'مطعم'}</div>
                          <div className="muted" style={{ fontSize: '11.5px' }}>
                            {r.active ? 'نشط' : 'متوقف'} · {r.done ? 'مكتمل الإعداد' : 'قيد الإعداد'}
                          </div>
                        </td>
                        <td className="tabular-nums" style={{ fontSize: '12.5px', fontWeight: 600 }}>
                          {r.catsCount} قسم · {r.itemsCount} صنف · {r.ordersCount} طلب
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="mp-tbl-actions">
                            <button
                              type="button"
                              className="mp-tbl-btn"
                              onClick={() => openJsonInspector(r.key, r.raw, true)}
                            >
                              <Code2 size={13} />
                              <span>فحص</span>
                            </button>
                            {r.protected ? (
                              <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', paddingInline: '6px' }}>
                                <Shield size={13} />
                                تجريبي محمي
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="mp-tbl-btn is-danger"
                                  disabled={!canManageDatabase || busyAction}
                                  onClick={() => requestDeleteKey(r.key, r.name, false)}
                                >
                                  <Trash2 size={13} />
                                  <span>حذف</span>
                                </button>
                                <button
                                  type="button"
                                  className="mp-tbl-btn is-danger"
                                  title="حذف المتجر وكافة أقسامه وعناصره وطلباته والحساب المربوط به"
                                  disabled={!canManageDatabase || busyAction}
                                  onClick={() => requestDeleteKey(r.key, `${r.name} وكامل بياناته`, true)}
                                >
                                  <span>حذف شامل</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ================================================================ */}
          {/* SUB-TAB 3: PHONES DIRECTORY + TELEGRAM                           */}
          {/* ================================================================ */}
          {subTab === 'phones' && (
            <div>
              <div className="mp-db-subbar">
                <div className="mp-seg-group">
                  <button
                    type="button"
                    className={`mp-seg-btn${phonesMode === 'directory' ? ' is-active' : ''}`}
                    onClick={() => setPhonesMode('directory')}
                  >
                    دليل الأرقام الشامل ({data?.sections.phonesIndex.length || 0})
                  </button>
                  <button
                    type="button"
                    className={`mp-seg-btn${phonesMode === 'telegram' ? ' is-active' : ''}`}
                    onClick={() => setPhonesMode('telegram')}
                  >
                    ربط تيليجرام ({data?.sections.telegramUsers.length || 0})
                  </button>
                </div>
              </div>

              {phonesMode === 'directory' && (
                <div className="card tw mp-db-table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>رقم الهاتف</th>
                        <th>السجلات المرتبطة في القاعدة</th>
                        <th>حالة تيليجرام</th>
                        <th>إجراءات جذرية</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPhones.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                            لا توجد أرقام مطابقة.
                          </td>
                        </tr>
                      ) : (
                        filteredPhones.map((row: DbPhoneIndexRow) => (
                          <tr key={row.phone}>
                            <td className="tabular-nums" dir="ltr" style={{ fontWeight: 700, fontSize: '13.5px' }}>
                              {row.phone}
                            </td>
                            <td style={{ fontSize: '12px' }}>
                              {row.sources.map((src, i) => (
                                <div key={`${src.key}-${i}`} style={{ lineHeight: 1.5 }}>
                                  <span>{src.label}</span>{' '}
                                  <span className="muted" style={{ fontFamily: 'monospace' }} dir="ltr">
                                    ({src.key})
                                  </span>
                                </div>
                              ))}
                            </td>
                            <td style={{ fontSize: '12px' }}>
                              {row.telegramLinked ? (
                                <span className="tabular-nums">
                                  مربوط · {row.telegramChatId || '—'}{' '}
                                  {row.telegramUsername ? `(@${row.telegramUsername})` : ''}
                                </span>
                              ) : (
                                <span className="muted">غير مربوط</span>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {row.protected ? (
                                <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                  <Shield size={13} />
                                  رقم مالك المنصة محمي
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="mp-tbl-btn is-danger"
                                  disabled={!canManageDatabase || busyAction}
                                  onClick={() => requestDeletePhoneRoot(row)}
                                >
                                  <Trash2 size={13} />
                                  <span>حذف من جذوره</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {phonesMode === 'telegram' && (
                <div className="card tw mp-db-table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>رقم الهاتف</th>
                        <th>معرف الدردشة (Chat ID)</th>
                        <th>اسم المستخدم</th>
                        <th>تاريخ الربط</th>
                        <th>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTelegram.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                            لا توجد ارتباطات تيليجرام مسجلة.
                          </td>
                        </tr>
                      ) : (
                        filteredTelegram.map((tg) => (
                          <tr key={tg.phone}>
                            <td className="tabular-nums" dir="ltr" style={{ fontWeight: 700 }}>{tg.phone}</td>
                            <td className="tabular-nums" dir="ltr">{tg.chatId}</td>
                            <td dir="ltr">{tg.username ? `@${tg.username}` : tg.firstName || '—'}</td>
                            <td className="muted tabular-nums" style={{ fontSize: '12px' }}>
                              {formatDateTime(tg.linkedAt)}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                className="mp-tbl-btn is-danger"
                                disabled={!canManageDatabase || busyAction}
                                onClick={() =>
                                  setConfirmState({
                                    title: 'فك ارتباط تيليجرام',
                                    description: `هل تريد حذف ارتباط تيليجرام للرقم ${tg.phone}؟`,
                                    confirmLabel: 'حذف الارتباط',
                                    onConfirm: async () => {
                                      setBusyAction(true);
                                      try {
                                        await deleteTelegramBindingApi(tg.phone);
                                        setConfirmState(null);
                                        await handleAfterMutation('تم حذف ارتباط تيليجرام ✓');
                                      } catch (err: unknown) {
                                        showToast(err instanceof Error ? err.message : 'تعذر الحذف');
                                      } finally {
                                        setBusyAction(false);
                                      }
                                    },
                                  })
                                }
                              >
                                <Send size={13} />
                                <span>حذف الارتباط</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* SUB-TAB 4: DEDICATED TELEGRAM NUMBERS SECTION (أرقام التليكرام)   */}
          {/* ================================================================ */}
          {subTab === 'telegram' && (
            <div>
              <div className="mp-db-subbar">
                <div className="mp-seg-group">
                  <button
                    type="button"
                    className={`mp-seg-btn${telegramFilter === 'all' ? ' is-active' : ''}`}
                    onClick={() => setTelegramFilter('all')}
                  >
                    الكل ({telegramStats.total})
                  </button>
                  <button
                    type="button"
                    className={`mp-seg-btn${telegramFilter === 'no_account' ? ' is-active' : ''}`}
                    onClick={() => setTelegramFilter('no_account')}
                  >
                    تليكرام بدون متجر ({telegramStats.withoutAccount})
                  </button>
                  <button
                    type="button"
                    className={`mp-seg-btn${telegramFilter === 'with_account' ? ' is-active' : ''}`}
                    onClick={() => setTelegramFilter('with_account')}
                  >
                    مرتبط بمتجر ({telegramStats.withAccount})
                  </button>
                </div>
                <div className="muted" style={{ fontSize: '12px' }}>
                  يُحفظ هنا كل رقم شارك هاتفه مع بوت تيليجرام لاستلام إشعارات الطلبات.
                </div>
              </div>

              <div className="card tw mp-db-table-card">
                <table>
                  <thead>
                    <tr>
                      <th>رقم الهاتف</th>
                      <th>حالة الحساب بالمنصة</th>
                      <th>معرف الدردشة (Chat ID)</th>
                      <th>حساب تيليجرام</th>
                      <th>تاريخ الربط</th>
                      <th>آخر إشعار طلب</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTelegram.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                          لا توجد أرقام تليكرام مطابقة للفلتر الحالي.
                        </td>
                      </tr>
                    ) : (
                      filteredTelegram.map((tg) => (
                        <tr key={`${tg.phone}-${tg.chatId}`}>
                          <td className="tabular-nums" dir="ltr" style={{ fontWeight: 800, fontSize: '13.5px' }}>
                            {tg.phone}
                          </td>
                          <td>
                            {tg.hasPlatformAccount ? (
                              <div>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '8px',
                                    background: 'rgba(16, 185, 129, 0.14)',
                                    color: 'var(--ok, #10b981)',
                                  }}
                                >
                                  مرتبط بحساب منصة
                                </span>
                                {tg.linkedAccountNames && tg.linkedAccountNames.length > 0 && (
                                  <div className="muted" style={{ fontSize: '11.5px', marginTop: '3px' }}>
                                    {tg.linkedAccountNames.join(' · ')}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '8px',
                                  background: 'rgba(245, 158, 11, 0.14)',
                                  color: '#d97706',
                                }}
                              >
                                تليكرام بدون حساب بالمنصة
                              </span>
                            )}
                          </td>
                          <td className="tabular-nums" dir="ltr" style={{ fontSize: '12.5px' }}>
                            {tg.chatId}
                          </td>
                          <td dir="ltr" style={{ fontSize: '12.5px' }}>
                            {tg.username ? `@${tg.username}` : tg.firstName || '—'}
                          </td>
                          <td className="muted tabular-nums" style={{ fontSize: '12px' }}>
                            {formatDateTime(tg.linkedAt)}
                          </td>
                          <td className="muted tabular-nums" style={{ fontSize: '12px' }}>
                            {formatDateTime(tg.lastSentAt)}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="mp-tbl-btn is-danger"
                              disabled={!canManageDatabase || busyAction}
                              onClick={() =>
                                setConfirmState({
                                  title: 'حذف رقم تيليجرام من السجل',
                                  description: `سيتم حذف توثيق تيليجرام للرقم ${tg.phone} من قاعدة بيانات البوت (لن يمس هذا حساب المنصة إن وجد).`,
                                  confirmLabel: 'حذف من تيليجرام',
                                  onConfirm: async () => {
                                    setBusyAction(true);
                                    try {
                                      await deleteTelegramBindingApi(tg.phone);
                                      setConfirmState(null);
                                      await handleAfterMutation('تم حذف الرقم من سجل تيليجرام ✓');
                                    } catch (err: unknown) {
                                      showToast(err instanceof Error ? err.message : 'تعذر الحذف');
                                    } finally {
                                      setBusyAction(false);
                                    }
                                  },
                                })
                              }
                            >
                              <Trash2 size={13} />
                              <span>حذف من تيليجرام</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* SUB-TAB 4: CATEGORIES, ITEMS & ORDERS                            */}
          {/* ================================================================ */}
          {subTab === 'catalog' && (
            <div>
              <div className="mp-db-subbar">
                <div className="mp-seg-group">
                  <button
                    type="button"
                    className={`mp-seg-btn${catalogMode === 'categories' ? ' is-active' : ''}`}
                    onClick={() => {
                      setCatalogMode('categories');
                      setSelectedKeys(new Set());
                    }}
                  >
                    الأقسام ({data?.sections.categories.length || 0})
                  </button>
                  <button
                    type="button"
                    className={`mp-seg-btn${catalogMode === 'items' ? ' is-active' : ''}`}
                    onClick={() => {
                      setCatalogMode('items');
                      setSelectedKeys(new Set());
                    }}
                  >
                    الأصناف والعناصر ({data?.sections.items.length || 0})
                  </button>
                  <button
                    type="button"
                    className={`mp-seg-btn${catalogMode === 'orders' ? ' is-active' : ''}`}
                    onClick={() => {
                      setCatalogMode('orders');
                      setSelectedKeys(new Set());
                    }}
                  >
                    الطلبات ({data?.sections.orders.length || 0})
                  </button>
                </div>
              </div>

              <div className="card tw mp-db-table-card">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '36px' }}>
                        <input
                          type="checkbox"
                          checked={
                            filteredCatalogRows.length > 0 &&
                            filteredCatalogRows.every((row) => selectedKeys.has(row.key))
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedKeys(new Set(filteredCatalogRows.map((r) => r.key)));
                            } else {
                              setSelectedKeys(new Set());
                            }
                          }}
                        />
                      </th>
                      <th>{catalogMode === 'orders' ? 'الزبون / الطلب' : 'الاسم'}</th>
                      <th>المشروع</th>
                      <th>التفاصيل</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalogRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                          لا توجد سجلات مطابقة في هذا القسم.
                        </td>
                      </tr>
                    ) : (
                      filteredCatalogRows.map((row) => {
                        const isOrder = catalogMode === 'orders';
                        const ord = isOrder ? (row as DbOrderRow) : null;
                        const cat = !isOrder ? (row as DbCatalogRow) : null;
                        const label = ord ? `${ord.customerName} (${ord.customerPhone || 'بدون هاتف'})` : (cat?.name || row.key);
                        return (
                          <tr key={row.key}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedKeys.has(row.key)}
                                onChange={() => toggleSelectKey(row.key)}
                              />
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: '13px' }}>{label}</div>
                              <div className="muted" style={{ fontSize: '11px', fontFamily: 'monospace' }} dir="ltr">
                                {row.key}
                              </div>
                            </td>
                            <td style={{ fontSize: '12.5px' }}>
                              <div>{row.restaurantName}</div>
                              <div className="muted" style={{ fontSize: '11px', fontFamily: 'monospace' }}>{row.rid}</div>
                            </td>
                            <td className="tabular-nums" style={{ fontSize: '12.5px' }}>
                              {ord
                                ? `${ord.total.toLocaleString('en-US')} د.ع · ${ord.status} · ${formatDateTime(ord.createdAt)}`
                                : cat?.extra}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div className="mp-tbl-actions">
                                <button
                                  type="button"
                                  className="mp-tbl-btn"
                                  onClick={() => openJsonInspector(row.key, row.raw, true)}
                                >
                                  <Code2 size={13} />
                                  <span>فحص</span>
                                </button>
                                <button
                                  type="button"
                                  className="mp-tbl-btn is-danger"
                                  disabled={!canManageDatabase || busyAction}
                                  onClick={() => requestDeleteKey(row.key, label, false)}
                                >
                                  <Trash2 size={13} />
                                  <span>حذف</span>
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
            </div>
          )}

          {/* ================================================================ */}
          {/* SUB-TAB 5: AUDIT LOGS & ACTIVE USER SESSIONS                     */}
          {/* ================================================================ */}
          {subTab === 'audit' && (
            <div>
              <div className="mp-db-subbar">
                <div className="mp-seg-group">
                  <button
                    type="button"
                    className={`mp-seg-btn${auditMode === 'logs' ? ' is-active' : ''}`}
                    onClick={() => {
                      setAuditMode('logs');
                      setSelectedKeys(new Set());
                    }}
                  >
                    سجل التعديلات ({data?.sections.auditLogs.length || 0})
                  </button>
                  <button
                    type="button"
                    className={`mp-seg-btn${auditMode === 'sessions' ? ' is-active' : ''}`}
                    onClick={() => {
                      setAuditMode('sessions');
                      setSelectedKeys(new Set());
                    }}
                  >
                    جلسات الدخول النشطة ({data?.sections.userSessions.length || 0})
                  </button>
                </div>

                {auditMode === 'logs' && filteredLogs.length > 0 && canManageDatabase && (
                  <button
                    type="button"
                    className="btn s d"
                    disabled={busyAction}
                    onClick={() =>
                      requestBulkDelete(
                        filteredLogs.map((l) => l.key),
                        'تفريغ سجل التعديلات الظاهر'
                      )
                    }
                  >
                    <Trash2 size={14} />
                    <span>مسح جميع السجلات الظاهرة ({filteredLogs.length})</span>
                  </button>
                )}
              </div>

              {auditMode === 'logs' ? (
                <div className="card tw mp-db-table-card">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '36px' }}>
                          <input
                            type="checkbox"
                            checked={
                              filteredLogs.length > 0 &&
                              filteredLogs.every((l) => selectedKeys.has(l.key))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedKeys(new Set(filteredLogs.map((l) => l.key)));
                              } else {
                                setSelectedKeys(new Set());
                              }
                            }}
                          />
                        </th>
                        <th>التوقيت</th>
                        <th>الجهة / المنفذ</th>
                        <th>التصنيف</th>
                        <th>الحدث والتفاصيل</th>
                        <th>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                            لا توجد سجلات تعديلات مسجلة.
                          </td>
                        </tr>
                      ) : (
                        filteredLogs.map((log) => (
                          <tr key={log.key}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedKeys.has(log.key)}
                                onChange={() => toggleSelectKey(log.key)}
                              />
                            </td>
                            <td className="muted tabular-nums" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                              {formatDateTime(log.ts)}
                            </td>
                            <td style={{ fontWeight: 700, fontSize: '12.5px' }}>{log.actor || '—'}</td>
                            <td style={{ fontSize: '12px' }}>{LOG_TYPE_LABEL[log.type] || log.type}</td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '13px' }}>{log.action}</div>
                              {log.details && (
                                <div className="muted" style={{ fontSize: '12px', marginTop: '2px' }}>
                                  {log.details}
                                </div>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                className="mp-tbl-btn is-danger"
                                disabled={!canManageDatabase || busyAction}
                                onClick={() => requestDeleteKey(log.key, log.action, false)}
                              >
                                <Trash2 size={13} />
                                <span>حذف</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="card tw mp-db-table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>المستخدم</th>
                        <th>الدور / المشروع</th>
                        <th>معرف الجلسة</th>
                        <th>تاريخ الانتهاء</th>
                        <th>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUserSessions.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                            لا توجد جلسات دخول نشطة.
                          </td>
                        </tr>
                      ) : (
                        filteredUserSessions.map((ses) => (
                          <tr key={ses.key}>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: '13px' }}>{ses.name || '—'}</div>
                              <div className="muted tabular-nums" dir="ltr" style={{ fontSize: '12px' }}>
                                {ses.phone || '—'}
                              </div>
                            </td>
                            <td style={{ fontSize: '12.5px' }}>
                              <div>{ses.role}</div>
                              <div className="muted" style={{ fontFamily: 'monospace', fontSize: '11.5px' }}>{ses.rid}</div>
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: '11.5px' }} dir="ltr">
                              {ses.sid}
                              {ses.isCurrent && ' (جلستك الحالية)'}
                            </td>
                            <td className="muted tabular-nums" style={{ fontSize: '12px' }}>
                              {formatDateTime(ses.expiresAt)}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {ses.isCurrent ? (
                                <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                  <UserCheck size={13} />
                                  نشطة حالياً
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="mp-tbl-btn is-danger"
                                  disabled={!canManageDatabase || busyAction}
                                  onClick={() => requestDeleteKey(ses.key, `جلسة ${ses.phone || ses.name}`, false)}
                                >
                                  <KeyRound size={13} />
                                  <span>إنهاء الجلسة</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* SUB-TAB 6: ALL KV RECORDS INSPECTOR & EDITOR                     */}
          {/* ================================================================ */}
          {subTab === 'kv' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700 }}>
                  <span>تصفية حسب البادئة:</span>
                  <select
                    value={kvPrefix}
                    onChange={(e) => {
                      setKvPrefix(e.target.value);
                      setSelectedKeys(new Set());
                    }}
                    style={{ width: 'auto', minWidth: '200px' }}
                  >
                    <option value="all">جميع المفاتيح ({data?.sections.rawRecords.length || 0})</option>
                    <option value="accounts/">الحسابات (accounts/)</option>
                    <option value="staff/">الموظفين (staff/)</option>
                    <option value="restaurants/">المشاريع والمتاجر (restaurants/)</option>
                    <option value="cats/">الأقسام (cats/)</option>
                    <option value="items/">الأصناف والعناصر (items/)</option>
                    <option value="orders/">الطلبات (orders/)</option>
                    <option value="reports/">البلاغات (reports/)</option>
                    <option value="logs/">سجل التعديلات (logs/)</option>
                    <option value="settings/">الإعدادات (settings/)</option>
                    <option value="finance_">المالية (finance_*)</option>
                    <option value="migrations/">التحديثات (migrations/)</option>
                    <option value="user_sessions/">الجلسات (user_sessions/)</option>
                  </select>
                </label>

                <span className="muted tabular-nums" style={{ fontSize: '12.5px' }}>
                  النتائج المعروضة: {filteredRawRecords.length}
                </span>
              </div>

              <div className="card tw mp-db-table-card">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '36px' }}>
                        <input
                          type="checkbox"
                          checked={
                            filteredRawRecords.filter((r) => !r.protected).length > 0 &&
                            filteredRawRecords
                              .filter((r) => !r.protected)
                              .every((r) => selectedKeys.has(r.key))
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedKeys(new Set(filteredRawRecords.filter((r) => !r.protected).map((r) => r.key)));
                            } else {
                              setSelectedKeys(new Set());
                            }
                          }}
                        />
                      </th>
                      <th>المفتاح (Key)</th>
                      <th>الملخص</th>
                      <th>الحجم</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRawRecords.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                          لا توجد مفاتيح مطابقة للتصفية أو البحث.
                        </td>
                      </tr>
                    ) : (
                      filteredRawRecords.map((rec: DbRawRecordSummary) => (
                        <tr key={rec.key}>
                          <td>
                            <input
                              type="checkbox"
                              disabled={Boolean(rec.protected)}
                              checked={selectedKeys.has(rec.key)}
                              onChange={() => toggleSelectKey(rec.key)}
                            />
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700 }} dir="ltr">
                            {rec.key}
                          </td>
                          <td className="muted" style={{ fontSize: '12px', maxWidth: '380px' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {rec.summary}
                            </div>
                          </td>
                          <td className="muted tabular-nums" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {formatBytes(rec.sizeBytes)}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div className="mp-tbl-actions">
                              <button
                                type="button"
                                className="mp-tbl-btn"
                                onClick={() =>
                                  openJsonInspector(
                                    rec.key,
                                    rec.value,
                                    !rec.key.startsWith('user_sessions/')
                                  )
                                }
                              >
                                <FileText size={13} />
                                <span>عرض / تعديل</span>
                              </button>
                              {rec.protected ? (
                                <span className="muted" style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', paddingInline: '6px' }}>
                                  <Shield size={13} />
                                  محمي
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="mp-tbl-btn is-danger"
                                  disabled={!canManageDatabase || busyAction}
                                  onClick={() => requestDeleteKey(rec.key, rec.key, false)}
                                >
                                  <Trash2 size={13} />
                                  <span>حذف</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================================== */}
      {/* CONFIRMATION MODAL                                                 */}
      {/* ================================================================== */}
      {confirmState && (
        <div className="ajax-backdrop" onClick={() => !busyAction && setConfirmState(null)}>
          <div
            className="ajax-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '460px', textAlign: 'start' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: 'var(--bad)' }}>
              <AlertTriangle size={20} />
              <h3 style={{ margin: 0, fontSize: '16.5px', color: 'var(--ink)' }}>{confirmState.title}</h3>
            </div>
            <p className="muted" style={{ margin: '0 0 18px', fontSize: '13.5px', lineHeight: 1.65 }}>
              {confirmState.description}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn s"
                disabled={busyAction}
                onClick={() => setConfirmState(null)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn s d"
                disabled={busyAction}
                onClick={() => void confirmState.onConfirm()}
              >
                {busyAction ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>{confirmState.confirmLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* JSON INSPECTOR / EDITOR MODAL                                      */}
      {/* ================================================================== */}
      {jsonModal && (
        <div className="ajax-backdrop" onClick={() => !jsonModal.saving && setJsonModal(null)}>
          <div
            className="ajax-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '680px', textAlign: 'start' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px' }}>فحص وتعديل السجل المباشر</h3>
                <div className="muted" style={{ fontSize: '12px', fontFamily: 'monospace' }} dir="ltr">
                  {jsonModal.key}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="btn s"
                  onClick={() => {
                    void navigator.clipboard?.writeText(jsonModal.text);
                    setCopiedJson(true);
                    setTimeout(() => setCopiedJson(false), 1800);
                  }}
                >
                  {copiedJson ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedJson ? 'تم النسخ' : 'نسخ'}</span>
                </button>
                <button
                  type="button"
                  className="btn s"
                  disabled={jsonModal.saving}
                  onClick={() => setJsonModal(null)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <textarea
              dir="ltr"
              rows={15}
              readOnly={!jsonModal.editable}
              value={jsonModal.text}
              onChange={(e) => setJsonModal({ ...jsonModal, text: e.target.value, error: '' })}
              style={{
                width: '100%',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: '12.5px',
                lineHeight: 1.55,
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                resize: 'vertical',
              }}
            />

            {jsonModal.error && (
              <div style={{ color: 'var(--bad)', fontSize: '12.5px', marginTop: '8px', fontWeight: 600 }}>
                {jsonModal.error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', gap: '10px' }}>
              <span className="muted" style={{ fontSize: '12px' }}>
                {jsonModal.editable
                  ? 'يمكنك تعديل القيم بصيغة JSON وحفظها مباشرة في قاعدة البيانات.'
                  : 'هذا السجل للعرض فقط (محمي أو جلسة نظام).'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn s"
                  disabled={jsonModal.saving}
                  onClick={() => setJsonModal(null)}
                >
                  إغلاق
                </button>
                {jsonModal.editable && (
                  <button
                    type="button"
                    className="btn s p"
                    disabled={jsonModal.saving}
                    onClick={() => void handleSaveJsonModal()}
                  >
                    {jsonModal.saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    <span>اعتماد التعديل</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
