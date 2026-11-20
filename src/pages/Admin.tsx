/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  FontTypographyConfig,
  HomeSettings,
  PricingPlan,
  ProblemReport,
  Restaurant,
  Session,
  SiteSettings,
  StaffPermissions,
  ThemeSettings,
} from '../types';
import { AppLogo } from '../components/AppLogo';
import { buildPlanComparisonRows } from '../utils/plans';

const StaffManagementSection = lazy(() =>
  import('../components/admin/StaffManagementSection').then((m) => ({ default: m.StaffManagementSection }))
);
const UnifiedPartnersAccountsSection = lazy(() =>
  import('../components/admin/UnifiedPartnersAccountsSection').then((m) => ({ default: m.UnifiedPartnersAccountsSection }))
);
const OpenNotesScratchpad = lazy(() =>
  import('../components/admin/OpenNotesScratchpad').then((m) => ({ default: m.OpenNotesScratchpad }))
);
const AdminReportsSection = lazy(() =>
  import('../components/admin/AdminReportsSection').then((m) => ({ default: m.AdminReportsSection }))
);
const MyAccountSection = lazy(() =>
  import('../components/admin/MyAccountSection').then((m) => ({ default: m.MyAccountSection }))
);
const AdminHomeLounge = lazy(() =>
  import('../components/admin/AdminHomeLounge').then((m) => ({ default: m.AdminHomeLounge }))
);
const DatabaseExplorerSection = lazy(() =>
  import('../components/admin/DatabaseExplorerSection').then((m) => ({ default: m.DatabaseExplorerSection }))
);
const HomePageEditorSection = lazy(() =>
  import('../components/admin/HomePageEditorSection').then((m) => ({ default: m.HomePageEditorSection }))
);
const TelegramSettingsCard = lazy(() =>
  import('../components/admin/TelegramSettingsCard').then((m) => ({ default: m.TelegramSettingsCard }))
);
const PlanFeaturesOrderEditor = lazy(() =>
  import('../components/admin/PlanFeaturesOrderEditor').then((m) => ({ default: m.PlanFeaturesOrderEditor }))
);
import {
  SystemInfrastructureCard,
  SystemLiveStatusBadge,
  useSystemDbStatus,
} from '../components/admin/SystemHealthWidget';
import {
  DEFAULT_TYPOGRAPHY,
  PLATFORM_FONT_CATALOG,
  applyTheme,
  buildThemeForMode,
  flushPendingDbSync,
  getActivityLogs,
  getCollection,
  getSystemPrefersDark,
  getTheme,
  impersonateWithServer,
  logActivity,
  normalizePlatformFontKey,
  putItem,
  putItemAndSync,
  putManyAndSync,
  resolveFontCssStack,
  setSession,
  syncFromServer,
  waLink,
} from '../utils/storage';
import {
  dashCardMotion,
  dashSectionMotion,
  dashTabMotion,
} from '../utils/dashboardMotion';
import {
  Home,
  LayoutDashboard,
  Store,
  Smartphone,
  Lightbulb,
  Users,
  Settings,
  User,
  LogOut,
  X,
  Eye,
  Wifi,
  BatteryCharging,
  Shield,
  RefreshCw,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Wallet,
  Database,
  LayoutTemplate,
  Type,
  Check,
  Sun,
  Moon,
  Monitor,
  AlertTriangle,
  Loader2,
  Save,
} from 'lucide-react';

interface AdminViewProps {
  session: Session;
  site: SiteSettings;
  home: HomeSettings;
  plans: PricingPlan[];
  theme: ThemeSettings;
  initialSubTab?: string;
  onNavigate: (hash: string) => void;
  onLogout: () => void;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

type MainTab = 'home' | 'ov' | 'partners' | 'preview' | 'home_editor' | 'notes' | 'reports' | 'staff' | 'database' | 'settings' | 'account';

function normalizeInitialTab(sub?: string): MainTab {
  if (!sub) return 'home';
  if (sub === 'accounts') return 'partners';
  if (sub === 'home-editor' || sub === 'plans') return 'home_editor';
  if (['home', 'ov', 'partners', 'preview', 'home_editor', 'notes', 'reports', 'staff', 'database', 'settings', 'account'].includes(sub)) {
    return sub as MainTab;
  }
  return 'home';
}

export const AdminView: React.FC<AdminViewProps> = ({
  session,
  site,
  home,
  plans,
  theme,
  initialSubTab,
  onNavigate,
  onLogout,
  onRefresh,
  showToast,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const isSuperAdmin = !session.staffId;
  const rawPerms: StaffPermissions = session.permissions || {};
  const staffPerms: StaffPermissions = isSuperAdmin
    ? {
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
        canManageDatabase: true,
        canEditHomePage: true,
      }
    : (() => {
        const canPartners = Boolean(rawPerms.canManageRestaurants || rawPerms.canManageUsers);
        const canPlans = Boolean(rawPerms.canManagePlans);
        const canSettings = Boolean(rawPerms.canManageSettings ?? canPlans);
        return {
          canViewHome: rawPerms.canViewHome !== false,
          canViewAnalytics: Boolean(rawPerms.canViewAnalytics),
          canManageRestaurants: canPartners,
          canCreatePartner: Boolean(rawPerms.canCreatePartner ?? canPartners),
          canEditPartnerPlan: Boolean(rawPerms.canEditPartnerPlan || rawPerms.canExtendSubscription),
          canSuspendPartner: Boolean(rawPerms.canSuspendPartner ?? canPartners),
          canEditPartnerProfile: Boolean(rawPerms.canEditPartnerProfile ?? canPartners),
          canEditPartnerLinks: Boolean(rawPerms.canEditPartnerLinks ?? canPartners),
          canImpersonatePartner: Boolean(rawPerms.canImpersonatePartner),
          canDeletePartner: Boolean(rawPerms.canDeletePartner),
          canEditDemoMenu: Boolean(rawPerms.canEditDemoMenu),
          canUseNotes: rawPerms.canUseNotes !== false,
          canViewReports: rawPerms.canViewReports !== false,
          canManagePlans: canPlans,
          canManageStaff: Boolean(rawPerms.canManageStaff),
          canManageSettings: canSettings,
          canEditTabLabels: Boolean(rawPerms.canEditTabLabels ?? canSettings),
          canReorderTabs: Boolean(rawPerms.canReorderTabs ?? canSettings),
          canManageThemeMode: Boolean(rawPerms.canManageThemeMode ?? canSettings),
          canManageSubdomains: Boolean(rawPerms.canManageSubdomains ?? canSettings),
          canRunMaintenance: Boolean(rawPerms.canRunMaintenance ?? canSettings),
          canManageDatabase: Boolean(rawPerms.canManageDatabase),
          canEditHomePage: Boolean(rawPerms.canEditHomePage ?? canSettings),
        };
      })();

  const [activeTab, setActiveTabState] = useState<MainTab>(() => normalizeInitialTab(initialSubTab));

  useEffect(() => {
    setActiveTabState(normalizeInitialTab(initialSubTab));
  }, [initialSubTab]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [dragAdminIdx, setDragAdminIdx] = useState<number | null>(null);
  const [dragDashIdx, setDragDashIdx] = useState<number | null>(null);

  // Editable site settings state
  const [editSite, setEditSite] = useState<SiteSettings>(site);
  const [editPlans, setEditPlans] = useState<PricingPlan[]>(plans);
  const [editTheme, setEditTheme] = useState<ThemeSettings>(() => theme || getTheme());
  const [settingsPlanIdx, setSettingsPlanIdx] = useState<number>(0);
  const [unifiedSaving, setUnifiedSaving] = useState<boolean>(false);

  const siteAutoSaveTimerRef = useRef<number | null>(null);
  const plansAutoSaveTimerRef = useRef<number | null>(null);
  const hydratedSiteSigRef = useRef<string>(JSON.stringify(site));
  const hydratedPlansSigRef = useRef<string>(JSON.stringify(plans));

  useEffect(() => {
    if (siteAutoSaveTimerRef.current !== null) return;
    const incomingSig = JSON.stringify(site);
    if (incomingSig !== hydratedSiteSigRef.current) {
      hydratedSiteSigRef.current = incomingSig;
      setEditSite(site);
    }
  }, [site]);

  useEffect(() => {
    if (plansAutoSaveTimerRef.current !== null) return;
    const incomingSig = JSON.stringify(plans);
    if (incomingSig !== hydratedPlansSigRef.current) {
      hydratedPlansSigRef.current = incomingSig;
      setEditPlans(plans);
    }
  }, [plans]);

  useEffect(() => {
    if (theme) setEditTheme(theme);
  }, [theme]);

  const setActiveTab = (t: MainTab) => {
    setActiveTabState(t);
    window.scrollTo({ top: 0, behavior: 'auto' });
    const targetPath = `/admin/${t}`;
    if (window.location.pathname !== targetPath) {
      onNavigate(targetPath);
    } else {
      void syncFromServer().then((ok) => {
        if (ok) onRefresh();
      });
    }
  };

  useEffect(() => {
    let active = true;
    void syncFromServer().then((ok) => {
      if (ok && active) onRefresh();
    });
    return () => {
      active = false;
    };
  }, []);

  // Collections for Overview stats & logs
  const allRestaurants = getCollection<Restaurant>('restaurants');
  const allOrders = getCollection<{ tot: number; at?: number }>('orders');
  const allReports = getCollection<ProblemReport>('reports');
  const newReportsCount = allReports.filter((r) => {
    const raw = String(r.st || r.status || 'new').toLowerCase();
    return raw === 'new' || raw === 'pending';
  }).length;
  const activityLogs = getActivityLogs(80);
  const systemDbHealth = useSystemDbStatus(showToast);

  const paidPartners = allRestaurants.filter((r) => r.isPaid && r.id !== 'demo');
  const trialPartners = allRestaurants.filter((r) => !r.isPaid && r.id !== 'demo');
  const totalOrdersCount = allOrders.length;
  const monthAgoTs = Date.now() - 30 * 86400000;
  const thisMonthOrdersCount = allOrders.filter((o) => Number(o.at || 0) >= monthAgoTs).length;

  const filteredLogs = activityLogs.filter((l) => {
    if (logFilter === 'all') return true;
    return l.type === logFilter;
  });

  const handleImpersonate = async (rid: string) => {
    if (rid === 'demo' && !staffPerms.canEditDemoMenu) {
      showToast('ليس لديك صلاحية تعديل المنيو التجريبي');
      return;
    }
    if (rid !== 'demo' && !staffPerms.canImpersonatePartner) {
      showToast('ليس لديك صلاحية الدخول كشريك');
      return;
    }
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
  };

  const buildNormalizedSitePayload = useCallback((): SiteSettings => {
    const cleanedAdminLabels: Record<string, string> = {};
    Object.entries(editSite.adminTabLabels || {}).forEach(([k, v]) => {
      if (v && v.trim()) cleanedAdminLabels[k] = v.trim();
    });
    const cleanedDashLabels: Record<string, string> = {};
    Object.entries(editSite.dashboardTabLabels || {}).forEach(([k, v]) => {
      if (v && v.trim()) cleanedDashLabels[k] = v.trim();
    });
    const cleanWa = (editSite.supportWhatsapp || editSite.wa || '07724799679').trim();

    return {
      ...site,
      ...editSite,
      wa: cleanWa,
      supportWhatsapp: cleanWa,
      homeThemeMode:
        site.homeThemeMode === 'dark' || site.homeThemeMode === 'auto' ? site.homeThemeMode : 'light',
      adminThemeMode:
        editSite.adminThemeMode === 'dark' || editSite.adminThemeMode === 'auto'
          ? editSite.adminThemeMode
          : 'light',
      dashboardThemeMode:
        editSite.dashboardThemeMode === 'dark' || editSite.dashboardThemeMode === 'auto'
          ? editSite.dashboardThemeMode
          : 'light',
      adminTabLabels: cleanedAdminLabels,
      dashboardTabLabels: cleanedDashLabels,
      adminTabOrder: Array.isArray(editSite.adminTabOrder) ? editSite.adminTabOrder : site.adminTabOrder,
      dashboardTabOrder: Array.isArray(editSite.dashboardTabOrder) ? editSite.dashboardTabOrder : site.dashboardTabOrder,
      zainCashNumber: (editSite.zainCashNumber || '').trim(),
      qiCardNumber: (editSite.qiCardNumber || '').trim(),
      paymentNote: (editSite.paymentNote || '').trim(),
      googleAuthEnabled: false,
      signupEnabled: false,
      su: 0,
      subdomainRules: site.subdomainRules,
    };
  }, [editSite, site]);

  const buildSanitizedPlansPayload = useCallback(
    () => ({
      list: editPlans.map((pl) => {
        const cleanComparisonItems = Array.isArray(pl.comparisonItems)
          ? pl.comparisonItems
              .filter((it) => it && it.key)
              .map((it) => ({
                key: it.key,
                ...(it.label !== undefined && it.label.trim() ? { label: it.label.trim() } : {}),
                ...(it.included !== undefined ? { included: Boolean(it.included) } : {}),
                visible: it.visible !== false,
              }))
          : undefined;
        const nextPlan: PricingPlan = {
          ...pl,
          ...(cleanComparisonItems ? { comparisonItems: cleanComparisonItems } : {}),
        };
        nextPlan.f = buildPlanComparisonRows(nextPlan, 'ar').map((r) => r.label);
        return nextPlan;
      }),
      planSchemaV2: true,
      planPriceV2: true,
      planCardV3: true,
      planAnnual11V4: true,
      planMultiBranchV5: true,
      planNamesV6: true,
      planThemesV7: true,
      planNoFreeV8: true,
    }),
    [editPlans]
  );

  const persistSiteSettingsAuto = useCallback(
    async (notify = true) => {
      if (!isSuperAdmin && !staffPerms.canManageSettings && !staffPerms.canEditTabLabels && !staffPerms.canReorderTabs && !staffPerms.canManageThemeMode) {
        return;
      }
      const nextSite = buildNormalizedSitePayload();
      const resolvedAdminMode = nextSite.adminThemeMode || 'light';
      hydratedSiteSigRef.current = JSON.stringify(editSite);
      await putItemAndSync('settings/site', nextSite);
      applyTheme(buildThemeForMode(resolvedAdminMode, getTheme()));
      onRefresh();
      if (notify) {
        showToast('تم حفظ التغيرات');
      }
    },
    [
      buildNormalizedSitePayload,
      editSite,
      isSuperAdmin,
      onRefresh,
      showToast,
      staffPerms.canEditTabLabels,
      staffPerms.canManageSettings,
      staffPerms.canManageThemeMode,
      staffPerms.canReorderTabs,
    ]
  );

  const handleSavePlanFeaturesOnly = useCallback(
    async (notify = true) => {
      if (!isSuperAdmin && !staffPerms.canManagePlans) {
        if (notify) showToast('ليست لديك صلاحية تعديل الباقات والميزات');
        return;
      }
      const plansPayload = buildSanitizedPlansPayload();
      hydratedPlansSigRef.current = JSON.stringify(editPlans);
      await putItemAndSync('settings/plans', plansPayload);
      onRefresh();
      if (notify) {
        showToast('تم حفظ التغيرات');
      }
    },
    [buildSanitizedPlansPayload, editPlans, isSuperAdmin, onRefresh, showToast, staffPerms.canManagePlans]
  );

  const persistSiteAutoRef = useRef(persistSiteSettingsAuto);
  persistSiteAutoRef.current = persistSiteSettingsAuto;

  const savePlansAutoRef = useRef(handleSavePlanFeaturesOnly);
  savePlansAutoRef.current = handleSavePlanFeaturesOnly;

  // Auto-save editSite changes across all Admin Settings inputs (payment, labels, ordering)
  useEffect(() => {
    const nextSig = JSON.stringify(editSite);
    if (nextSig === hydratedSiteSigRef.current) return;
    if (siteAutoSaveTimerRef.current !== null) {
      window.clearTimeout(siteAutoSaveTimerRef.current);
    }
    siteAutoSaveTimerRef.current = window.setTimeout(() => {
      siteAutoSaveTimerRef.current = null;
      void persistSiteAutoRef.current(true);
    }, 150);
    return () => {
      if (siteAutoSaveTimerRef.current !== null) {
        window.clearTimeout(siteAutoSaveTimerRef.current);
      }
    };
  }, [editSite]);

  // Auto-save editPlans changes across PlanFeaturesOrderEditor
  useEffect(() => {
    const nextSig = JSON.stringify(editPlans);
    if (nextSig === hydratedPlansSigRef.current) return;
    if (plansAutoSaveTimerRef.current !== null) {
      window.clearTimeout(plansAutoSaveTimerRef.current);
    }
    plansAutoSaveTimerRef.current = window.setTimeout(() => {
      plansAutoSaveTimerRef.current = null;
      void savePlansAutoRef.current(true);
    }, 150);
    return () => {
      if (plansAutoSaveTimerRef.current !== null) {
        window.clearTimeout(plansAutoSaveTimerRef.current);
      }
    };
  }, [editPlans]);

  const flushAllAdminSaves = useCallback(async () => {
    if (unifiedSaving) return;
    setUnifiedSaving(true);
    try {
      const pendingPut: Record<string, unknown> = {};
      let siteDirty = false;
      let plansDirty = false;

      if (siteAutoSaveTimerRef.current !== null) {
        window.clearTimeout(siteAutoSaveTimerRef.current);
        siteAutoSaveTimerRef.current = null;
        siteDirty = true;
      } else if (JSON.stringify(editSite) !== hydratedSiteSigRef.current) {
        siteDirty = true;
      }

      if (plansAutoSaveTimerRef.current !== null) {
        window.clearTimeout(plansAutoSaveTimerRef.current);
        plansAutoSaveTimerRef.current = null;
        plansDirty = true;
      } else if (JSON.stringify(editPlans) !== hydratedPlansSigRef.current) {
        plansDirty = true;
      }

      if (siteDirty) {
        const nextSite = buildNormalizedSitePayload();
        hydratedSiteSigRef.current = JSON.stringify(editSite);
        pendingPut['settings/site'] = nextSite;
        applyTheme(buildThemeForMode(nextSite.adminThemeMode || 'light', getTheme()));
      }

      if (plansDirty && (isSuperAdmin || staffPerms.canManagePlans)) {
        hydratedPlansSigRef.current = JSON.stringify(editPlans);
        pendingPut['settings/plans'] = buildSanitizedPlansPayload();
      }

      if (Object.keys(pendingPut).length > 0) {
        await putManyAndSync(pendingPut);
      }

      window.dispatchEvent(new CustomEvent('menuplus_admin_flush_save'));
      await flushPendingDbSync();
      onRefresh();
      showToast('تم حفظ التغيرات');
    } finally {
      setUnifiedSaving(false);
    }
  }, [
    buildNormalizedSitePayload,
    buildSanitizedPlansPayload,
    editPlans,
    editSite,
    isSuperAdmin,
    onRefresh,
    showToast,
    staffPerms.canManagePlans,
    unifiedSaving,
  ]);

  const handleSelectAdminThemeMode = async (nextMode: 'light' | 'dark' | 'auto') => {
    if (!isSuperAdmin && !staffPerms.canManageThemeMode) {
      showToast('ليست لديك صلاحية تغيير المظهر');
      return;
    }
    if (siteAutoSaveTimerRef.current !== null) {
      window.clearTimeout(siteAutoSaveTimerRef.current);
      siteAutoSaveTimerRef.current = null;
    }
    const nextSite: SiteSettings = {
      ...site,
      ...editSite,
      adminThemeMode: nextMode,
    };
    hydratedSiteSigRef.current = JSON.stringify(nextSite);
    setEditSite(nextSite);
    applyTheme(buildThemeForMode(nextMode, editTheme));
    await putItemAndSync('settings/site', nextSite);
    onRefresh();
    showToast('تم حفظ التغيرات');
  };

  const handleSelectGlobalDashboardThemeMode = async (nextMode: 'light' | 'dark' | 'auto') => {
    if (!isSuperAdmin && !staffPerms.canManageThemeMode && !staffPerms.canManageSettings) {
      showToast('ليست لديك صلاحية تغيير المظهر');
      return;
    }
    if (siteAutoSaveTimerRef.current !== null) {
      window.clearTimeout(siteAutoSaveTimerRef.current);
      siteAutoSaveTimerRef.current = null;
    }
    const nextSite: SiteSettings = {
      ...site,
      ...editSite,
      dashboardThemeMode: nextMode,
    };
    hydratedSiteSigRef.current = JSON.stringify(nextSite);
    setEditSite(nextSite);
    await putItemAndSync('settings/site', nextSite);
    logActivity(
      session.phone || session.email || 'المدير',
      'تحديث ثيم لوحة تحكم الزبائن',
      `ثيم لوحة التحكم الافتراضي: ${nextMode === 'auto' ? 'حسب جهاز الزبون' : nextMode === 'dark' ? 'داكن' : 'فاتح'}`,
      'system'
    );
    onRefresh();
    showToast('تم حفظ التغيرات');
  };

  const handleApplyDashboardThemeToAllStores = async (nextMode: 'light' | 'dark' | 'auto') => {
    if (!isSuperAdmin && !staffPerms.canManageThemeMode && !staffPerms.canManageSettings) {
      showToast('ليست لديك صلاحية تغيير المظهر');
      return;
    }
    if (siteAutoSaveTimerRef.current !== null) {
      window.clearTimeout(siteAutoSaveTimerRef.current);
      siteAutoSaveTimerRef.current = null;
    }
    const allRests = getCollection<Restaurant>('restaurants');
    const batchEntries: Record<string, unknown> = {};
    for (const r of allRests) {
      if (r.dashboardThemeMode !== nextMode) {
        batchEntries[`restaurants/${r.id}`] = {
          ...r,
          dashboardThemeMode: nextMode,
        };
      }
    }
    const nextSite: SiteSettings = {
      ...site,
      ...editSite,
      dashboardThemeMode: nextMode,
    };
    batchEntries['settings/site'] = nextSite;
    hydratedSiteSigRef.current = JSON.stringify(nextSite);
    setEditSite(nextSite);
    await putManyAndSync(batchEntries);
    onRefresh();
    showToast('تم حفظ التغيرات');
  };

  const snapWeightToCatalog = (desired: number, available: number[]): number => {
    if (!available.length) return desired;
    if (available.includes(desired)) return desired;
    return available.reduce((best, w) => (Math.abs(w - desired) < Math.abs(best - desired) ? w : best), available[0]);
  };

  const handleUpdatePlatformTypography = async (
    updates: {
      fontKey?: 'tajawal' | 'firjar' | 'alexandria' | 'alan_sans';
      typography?: Partial<FontTypographyConfig>;
    },
    toastMsg?: string
  ) => {
    if (!isSuperAdmin && !staffPerms.canManageThemeMode && !staffPerms.canManageSettings) {
      showToast('ليست لديك صلاحية تعديل الخطوط');
      return;
    }
    const baseTheme = getTheme();
    const rawPrevTypo = {
      ...DEFAULT_TYPOGRAPHY,
      ...(baseTheme.typography || {}),
      ...(editTheme.typography || {}),
    } as Record<string, any>;
    delete rawPrevTypo.thmanyahFamily;
    const prevTypo: FontTypographyConfig = rawPrevTypo;
    const nextFontKey = updates.fontKey || normalizePlatformFontKey(prevTypo.fontKey || editTheme.font);
    const meta = PLATFORM_FONT_CATALOG.find((f) => f.key === nextFontKey) || PLATFORM_FONT_CATALOG[0];
    const nextTypoRaw: FontTypographyConfig = {
      ...prevTypo,
      ...(updates.typography || {}),
      fontKey: nextFontKey,
      separateHeadingFont: false,
      headingFontKey: nextFontKey,
      bodyFontKey: nextFontKey,
    };
    const nextHeadingW = snapWeightToCatalog(Number(nextTypoRaw.headingWeight || 800), meta.weights);
    const nextSubW = snapWeightToCatalog(Math.min(nextHeadingW, Number(nextTypoRaw.subHeadingWeight || 700)), meta.weights);
    const nextBodyW = snapWeightToCatalog(Number(nextTypoRaw.bodyWeight || 400), meta.weights);
    const nextBodySize = Number(nextTypoRaw.bodySize || 15);
    const nextDescSize = Number((nextBodySize - 1.5).toFixed(1));

    const nextTheme: ThemeSettings = {
      ...baseTheme,
      ...editTheme,
      font: nextFontKey,
      typography: {
        ...nextTypoRaw,
        headingWeight: nextHeadingW,
        subHeadingWeight: nextSubW,
        bodyWeight: nextBodyW,
        descWeight: nextBodyW,
        bodySize: nextBodySize,
        descSize: nextDescSize,
      },
    };
    setEditTheme(nextTheme);
    const activeAdminMode = editSite.adminThemeMode || site.adminThemeMode || 'light';
    applyTheme(buildThemeForMode(activeAdminMode, nextTheme));
    await putItemAndSync('settings/theme', nextTheme);
    onRefresh();
    if (toastMsg) showToast(toastMsg || 'تم تطبيق التغيرات');
  };

  const customAdminLabel = (id: string, fallback: string) => {
    const custom = site.adminTabLabels?.[id];
    return custom && custom.trim() ? custom.trim() : fallback;
  };

  const DEFAULT_ADMIN_TAB_META: Array<{ id: MainTab; def: string }> = [
    { id: 'home', def: 'الصفحة الرئيسية' },
    { id: 'home_editor', def: 'تعديل الصفحة الرئيسية' },
    { id: 'ov', def: 'نظرة عامة والتحليلات' },
    { id: 'partners', def: 'الشركاء والحسابات' },
    { id: 'preview', def: 'التجربة والعرض' },
    { id: 'notes', def: 'الملاحظات' },
    { id: 'reports', def: 'البلاغات' },
    { id: 'staff', def: 'إدارة الموظفين والصلاحيات' },
    { id: 'database', def: 'قاعدة البيانات' },
    { id: 'settings', def: 'الإعدادات' },
  ];

  const DEFAULT_DASH_TAB_META: Array<{ id: string; def: string; legacyId?: string }> = [
    { id: 'home', def: 'الصفحة الرئيسية' },
    { id: 'stats', def: 'احصائيات احترافية' },
    { id: 'cats', def: 'الأقسام والتصنيفات' },
    { id: 'menu', def: 'العناصر والمنتجات', legacyId: 'items' },
    { id: 'orders', def: 'الطلبات', legacyId: 'ord' },
    { id: 'appearance', def: 'المظهر' },
    { id: 'branches', def: 'عدة أفرع' },
    { id: 'addons', def: 'الإضافات' },
    { id: 'qr', def: 'كود QR ورابط المنيو' },
    { id: 'set', def: 'الإعدادات' },
  ];

  const adminOrderList = (() => {
    const saved = Array.isArray(site.adminTabOrder) ? site.adminTabOrder : [];
    const baseIds = DEFAULT_ADMIN_TAB_META.map((x) => x.id);
    const merged = [...saved.filter((id) => baseIds.includes(id as MainTab)), ...baseIds.filter((id) => !saved.includes(id))];
    return merged as MainTab[];
  })();

  const baseAdminTabs = [
    { id: 'home' as const, Icon: Home, label: customAdminLabel('home', 'الصفحة الرئيسية'), perm: isSuperAdmin || staffPerms.canViewHome !== false },
    {
      id: 'home_editor' as const,
      Icon: LayoutTemplate,
      label: customAdminLabel('home_editor', 'تعديل الصفحة الرئيسية'),
      perm: isSuperAdmin || Boolean(staffPerms.canEditHomePage || staffPerms.canManagePlans),
    },
    {
      id: 'ov' as const,
      Icon: LayoutDashboard,
      label: customAdminLabel('ov', 'نظرة عامة والتحليلات'),
      perm: isSuperAdmin || Boolean(staffPerms.canViewAnalytics),
    },
    {
      id: 'partners' as const,
      Icon: Store,
      label: customAdminLabel('partners', 'الشركاء والحسابات'),
      perm:
        isSuperAdmin ||
        Boolean(
          staffPerms.canManageRestaurants ||
            staffPerms.canEditPartnerPlan ||
            staffPerms.canDeletePartner ||
            staffPerms.canImpersonatePartner
        ),
    },
    {
      id: 'preview' as const,
      Icon: Smartphone,
      label: customAdminLabel('preview', 'التجربة والعرض'),
      perm: isSuperAdmin || Boolean(staffPerms.canEditDemoMenu),
    },
    {
      id: 'notes' as const,
      Icon: Lightbulb,
      label: customAdminLabel('notes', 'الملاحظات'),
      perm: isSuperAdmin || staffPerms.canUseNotes !== false,
    },
    {
      id: 'reports' as const,
      Icon: AlertTriangle,
      label: customAdminLabel('reports', 'البلاغات'),
      perm: isSuperAdmin || staffPerms.canViewReports !== false,
    },
    {
      id: 'staff' as const,
      Icon: Users,
      label: customAdminLabel('staff', 'إدارة الموظفين والصلاحيات'),
      perm: isSuperAdmin || Boolean(staffPerms.canManageStaff),
    },
    {
      id: 'database' as const,
      Icon: Database,
      label: customAdminLabel('database', 'قاعدة البيانات'),
      perm: isSuperAdmin || Boolean(staffPerms.canManageDatabase),
    },
    {
      id: 'settings' as const,
      Icon: Settings,
      label: customAdminLabel('settings', 'الإعدادات'),
      perm: isSuperAdmin || Boolean(staffPerms.canManageSettings),
    },
  ].filter((t) => t.perm);

  const adminTabs = [...baseAdminTabs].sort(
    (a, b) => adminOrderList.indexOf(a.id) - adminOrderList.indexOf(b.id)
  );

  const activeTabInfo = adminTabs.find((t) => t.id === activeTab) || adminTabs[0];
  const effectiveTab: MainTab = activeTab === 'account' ? 'account' : (activeTabInfo?.id || 'home');
  const activePageTitle = effectiveTab === 'account' ? customAdminLabel('account', 'حسابك') : activeTabInfo?.label;
  const showBottomSaveButton =
    effectiveTab === 'home_editor' ||
    effectiveTab === 'notes' ||
    effectiveTab === 'settings' ||
    effectiveTab === 'account';

  useEffect(() => {
    const titleLabel = activePageTitle || 'لوحة الإدارة';
    const brandName = site.name || 'منيو بلس';
    document.title = `${titleLabel} | ${brandName}`;
  }, [activePageTitle, site.name]);

  return (
    <div className="shell admin-shell" dir="rtl">
      {/* Mobile Slide-over Drawer (تظهر فقط عند الضغط على الثلاث خطوط في الهاتف) */}
      {mobileMenuOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <aside className="drawer-panel" style={{ zIndex: 9999 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 12px', borderBottom: '1px solid var(--line)' }}>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigate('/');
                }}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="الصفحة الرئيسية للموقع"
              >
                <AppLogo size={32} />
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="إغلاق القائمة"
                style={{
                  background: 'color-mix(in srgb, var(--panel) 85%, transparent)',
                  border: '1px solid var(--line)',
                  borderRadius: '10px',
                  width: '34px',
                  height: '34px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '12px 10px 18px', overflowY: 'auto', flex: 1 }}>
              <div
                style={{
                  padding: '8px 11px',
                  background: 'color-mix(in srgb, var(--brand) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--brand) 20%, transparent)',
                  borderRadius: '11px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--brand-ink, #34D399)',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                }}
              >
                <Shield size={14} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
                  {session.roleTitle ? session.roleTitle : 'مدير المنصة العام'}
                </span>
              </div>

              <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {adminTabs.map((tab) => {
                  const IconComp = tab.Icon;
                  const isActive = effectiveTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={isActive ? 'on' : ''}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMobileMenuOpen(false);
                      }}
                    >
                      <IconComp size={17} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.label}</span>
                      {tab.id === 'reports' && newReportsCount > 0 && (
                        <span className="bd">{newReportsCount}</span>
                      )}
                    </button>
                  );
                })}

                <div className="sb-nav-divider" />

                <div className="sb-footer-inline">
                  <button
                    type="button"
                    className="btn s"
                    onClick={() => {
                      onNavigate('/');
                      setMobileMenuOpen(false);
                    }}
                    style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
                  >
                    <Eye size={14} />
                    <span>الموقع العام</span>
                  </button>
                  <button
                    type="button"
                    className="btn s d"
                    onClick={onLogout}
                    style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
                  >
                    <LogOut size={14} />
                    <span>تسجيل الخروج</span>
                  </button>
                </div>
              </nav>
            </div>
          </aside>
        </>
      )}

      {/* Fixed Sidebar for Desktop */}
      <aside className="sb desktop-only">
        <div className="lg">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="العودة للصفحة الرئيسية"
          >
            <AppLogo size={36} />
          </button>

          <div
            style={{
              marginTop: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '16px',
              background: 'var(--soft)',
              color: 'var(--brand-ink, #34D399)',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            <Shield size={13} />
            <span>{session.roleTitle ? session.roleTitle : 'مدير المنصة العام'}</span>
          </div>
        </div>

        <nav>
          {adminTabs.map((tab) => {
            const IconComp = tab.Icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={effectiveTab === tab.id ? 'on' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                <IconComp size={17} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.label}</span>
                {tab.id === 'reports' && newReportsCount > 0 && (
                  <span className="bd">{newReportsCount}</span>
                )}
              </button>
            );
          })}

          <div className="sb-nav-divider" />

          <div className="sb-footer-inline">
            <button
              type="button"
              className="btn s"
              onClick={() => onNavigate('/')}
              style={{ width: '100%', justifyContent: 'center', gap: '7px' }}
            >
              <Eye size={15} />
              <span>الموقع العام</span>
            </button>
            <button
              type="button"
              className="btn s d"
              onClick={onLogout}
              style={{ width: '100%', justifyContent: 'center', gap: '7px' }}
            >
              <LogOut size={15} />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="mn">
        {/* Topbar: Mobile hamburger only, Active tab title, Home link */}
        <header className="app-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <button
              type="button"
              className="hamburger-btn"
              onClick={() => setMobileMenuOpen(true)}
              title="القوائم الجانبية"
              aria-label="القوائم الجانبية"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activePageTitle}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              className={`btn${effectiveTab === 'account' ? ' p' : ' s'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                padding: 0,
                borderRadius: '10px',
                cursor: 'pointer',
              }}
              onClick={() => setActiveTab('account')}
              title={customAdminLabel('account', 'حسابك')}
              aria-label={customAdminLabel('account', 'حسابك')}
            >
              <User size={17} />
            </button>
            <button
              type="button"
              className="btn p"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              onClick={() => onNavigate('/')}
              title="الموقع العام"
              aria-label="الموقع العام"
            >
              <Eye size={15} />
              <span>الموقع العام</span>
            </button>
          </div>
        </header>

        <Suspense
          fallback={
            <div style={{ minHeight: '220px', display: 'grid', placeItems: 'center' }} aria-hidden="true">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--brand, #059669)' }} />
            </div>
          }
        >
        <motion.div
          key={effectiveTab}
          {...dashTabMotion(prefersReducedMotion)}
        >
        {/* ============================================================== */}
        {/* TAB 0: HOME REST STATION / LOUNGE (الصفحة الرئيسية - محطة الاستراحة) */}
        {/* ============================================================== */}
        {effectiveTab === 'home' && (
          <AdminHomeLounge
            session={session}
            staffPerms={staffPerms}
            isSuperAdmin={isSuperAdmin}
            pageTitle={site.adminTabLabels?.home?.trim() || undefined}
            onSelectTab={setActiveTab}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 1: OVERVIEW (READ-ONLY STATS, SERVER STATUS, ACTIVITY LOGS) */}
        {/* ============================================================== */}
        {effectiveTab === 'ov' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
              <div>
                <h1 style={{ margin: 0 }}>{customAdminLabel('ov', 'نظرة عامة على المنصة')}</h1>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
                  قسم استعراض الإحصائيات الشاملة وحالة الخوادم وسجل النشاطات (للاطلاع فقط دون تعديل).
                </p>
              </div>
              <div className="rw" style={{ gap: '8px' }}>
                <SystemLiveStatusBadge health={systemDbHealth} />
                <button
                  type="button"
                  className="btn s"
                  onClick={() => void systemDbHealth.refresh(true)}
                  disabled={systemDbHealth.isLoading}
                >
                  <RefreshCw size={14} className={systemDbHealth.isLoading ? 'animate-spin' : ''} />
                  تحديث الحالة
                </button>
              </div>
            </div>

            {/* Core Metrics */}
            <div className="kp k4" style={{ margin: '18px 0' }}>
              <motion.div
                className="card"
                {...dashCardMotion(prefersReducedMotion, 0, 1, false, 0.08)}
              >
                <div className="v tabular-nums">{paidPartners.length}</div>
                <div className="l">الشركاء المشتركون (باقة مدفوعة) 🌟</div>
              </motion.div>
              <motion.div
                className="card"
                {...dashCardMotion(prefersReducedMotion, 1, 1, false, 0.08)}
              >
                <div className="v tabular-nums">{trialPartners.length}</div>
                <div className="l">المنيوات التجريبية المجانية 🆓</div>
              </motion.div>
              <motion.div
                className="card"
                {...dashCardMotion(prefersReducedMotion, 2, 1, false, 0.08)}
              >
                <div className="v tabular-nums">{totalOrdersCount}</div>
                <div className="l">إجمالي الطلبات بالمنصة 📦</div>
              </motion.div>
              <motion.div
                className="card"
                {...dashCardMotion(prefersReducedMotion, 3, 1, false, 0.08)}
              >
                <div className="v tabular-nums">{thisMonthOrdersCount}</div>
                <div className="l">طلبات هذا الشهر 📈</div>
              </motion.div>
            </div>

            {/* Live Server Status & Cloud Infrastructure (/api/db-status) */}
            <SystemInfrastructureCard health={systemDbHealth} />

            {/* Embedded Activity Log (سجل النشاطات مدمج هنا لرؤية حركات المشرفين) */}
            <motion.div
              className="card"
              {...dashSectionMotion(prefersReducedMotion, 0.08, true)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  marginBottom: '14px',
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>📜 سجل نشاطات الموظفين والمشرفين</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: '12px' }}>
                    تتبع فوري وموثق لكل عملية يقوم بها أي مشرف أو موظف بالمنصة.
                  </p>
                </div>
                <div className="rw" style={{ gap: '6px' }}>
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'restaurant', label: 'المطاعم' },
                    { id: 'staff', label: 'الموظفون' },
                    { id: 'plan', label: 'الباقات' },
                    { id: 'theme', label: 'المظهر' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`btn s${logFilter === f.id ? ' p' : ''}`}
                      onClick={() => setLogFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tw desktop-only-table">
                <table>
                  <thead>
                    <tr>
                      <th>الوقت</th>
                      <th>القائم بالعملية</th>
                      <th>النوع</th>
                      <th>النشاط</th>
                      <th>التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.slice(0, 15).map((log) => {
                      const dt = new Date(log.at);
                      const timeStr = `${dt.toLocaleDateString('ar-IQ-u-nu-latn')} ${dt.toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}`;
                      return (
                        <tr key={log.id}>
                          <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }} dir="ltr">
                            {timeStr}
                          </td>
                          <td>
                            <b>{log.actor}</b>
                          </td>
                          <td>
                            <span className="tag" style={{ fontSize: '11px' }}>
                              {log.type === 'restaurant'
                                ? 'مطعم'
                                : log.type === 'staff'
                                ? 'موظف'
                                : log.type === 'plan'
                                ? 'باقة'
                                : 'نظام'}
                            </span>
                          </td>
                          <td>
                            <b>{log.action}</b>
                          </td>
                          <td className="muted" style={{ fontSize: '12px' }}>
                            {log.details || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mobile-cards-only">
                {filteredLogs.slice(0, 15).map((log) => {
                  const dt = new Date(log.at);
                  const timeStr = `${dt.toLocaleDateString('ar-IQ-u-nu-latn')} ${dt.toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}`;
                  return (
                    <div
                      key={log.id}
                      style={{
                        border: '1px solid var(--line)',
                        borderRadius: '12px',
                        padding: '12px',
                        background: 'var(--bg)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span className="tag" style={{ fontSize: '11px' }}>
                          {log.type === 'restaurant'
                            ? 'مطعم'
                            : log.type === 'staff'
                            ? 'موظف'
                            : log.type === 'plan'
                            ? 'باقة'
                            : 'نظام'}
                        </span>
                        <span className="muted tabular-nums" style={{ fontSize: '11px' }} dir="ltr">
                          {timeStr}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '3px' }}>{log.action}</div>
                      <div style={{ fontSize: '12px', color: 'var(--brand-ink, #34D399)', marginBottom: '4px' }}>
                        بواسطة: {log.actor}
                      </div>
                      {log.details && (
                        <div className="muted" style={{ fontSize: '12px', lineHeight: 1.5 }}>{log.details}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: UNIFIED PARTNERS & ACCOUNTS (الشركاء والحسابات)         */}
        {/* ============================================================== */}
        {effectiveTab === 'partners' && (
          <UnifiedPartnersAccountsSection
            session={session}
            plans={plans}
            pageTitle={site.adminTabLabels?.partners?.trim() || undefined}
            canManagePartners={isSuperAdmin || Boolean(staffPerms.canManageRestaurants)}
            canCreatePartner={isSuperAdmin || Boolean(staffPerms.canCreatePartner)}
            canSuspendPartner={isSuperAdmin || Boolean(staffPerms.canSuspendPartner)}
            canEditPartnerProfile={isSuperAdmin || Boolean(staffPerms.canEditPartnerProfile)}
            canEditPartnerLinks={isSuperAdmin || Boolean(staffPerms.canEditPartnerLinks)}
            canDeletePartner={isSuperAdmin || Boolean(staffPerms.canDeletePartner)}
            canExtendSubscription={isSuperAdmin || Boolean(staffPerms.canEditPartnerPlan)}
            canEditPartnerPlan={isSuperAdmin || Boolean(staffPerms.canEditPartnerPlan)}
            canImpersonatePartner={isSuperAdmin || Boolean(staffPerms.canImpersonatePartner)}
            onNavigate={onNavigate}
            onRefresh={onRefresh}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: PREVIEW & EXPERIENCE HUB (التجربة والعرض)                */}
        {/* ============================================================== */}
        {effectiveTab === 'preview' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <h1 style={{ margin: 0, fontSize: 'clamp(18px, 3vw, 22px)' }}>
                {customAdminLabel('preview', 'مركز التجربة والعرض الشامل')}
              </h1>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '12.5px' }}>
                تحكم بالمنيو التجريبي، فحص الطلبات، ومعاينة تجربة الزبائن في الوقت الفعلي.
              </p>
            </div>

            {/* Quick Experience Action Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '12px', marginBottom: '18px' }}>
              <motion.div
                className="card"
                {...dashCardMotion(prefersReducedMotion, 0, 1, false, 0.08)}
                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
              >
                <div>
                  <div style={{ fontSize: '26px', marginBottom: '6px' }}>🛠️</div>
                  <h3 style={{ fontSize: '15.5px', marginBottom: '5px' }}>تعديل المنيو التجريبي بالكامل</h3>
                  <p className="muted" style={{ fontSize: '12.5px', lineHeight: 1.55, marginBottom: '12px' }}>
                    الدخول كصاحب المطعم التجريبي لإضافة وحذف أصناف وتعديل الأسعار والصور.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn p"
                  onClick={() => void handleImpersonate('demo')}
                  style={{ width: '100%', fontWeight: 'bold' }}
                >
                  الدخول وتعديل الأصناف الآن ⚙️
                </button>
              </motion.div>

              <motion.div
                className="card"
                {...dashCardMotion(prefersReducedMotion, 1, 1, false, 0.08)}
                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
              >
                <div>
                  <div style={{ fontSize: '26px', marginBottom: '6px' }}>👁️</div>
                  <h3 style={{ fontSize: '15.5px', marginBottom: '5px' }}>معاينة المنيو كما يراه الزبون</h3>
                  <p className="muted" style={{ fontSize: '12.5px', lineHeight: 1.55, marginBottom: '12px' }}>
                    فتح صفحة المنيو التجريبي الكامل لتجربة التصفح والسلة وتحديد طريقة الطلب.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => onNavigate('/cap-burger')}
                  style={{ width: '100%', textAlign: 'center', fontWeight: 'bold' }}
                >
                  فتح صفحة المنيو كزبون 👈
                </button>
              </motion.div>

              <motion.div
                className="card"
                {...dashCardMotion(prefersReducedMotion, 2, 1, false, 0.08)}
                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
              >
                <div>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📱</div>
                  <h3 style={{ fontSize: '17px', marginBottom: '6px' }}>فحص إرسال طلب واتساب حقيقي</h3>
                  <p className="muted" style={{ fontSize: '13px', lineHeight: 1.6, marginBottom: '14px' }}>
                    إرسال رسالة طلب تجريبية منسقة إلى رقم هاتفك لاختبار وصول تفاصيل الفاتورة والأصناف للواتساب بنجاح.
                  </p>
                </div>
                <a
                  className="btn"
                  style={{ background: '#1f9d55', color: '#fff', border: 0, width: '100%', textAlign: 'center', fontWeight: 'bold' }}
                  href={waLink(
                    site.supportWhatsapp || site.wa || '07724799679',
                    `تجربة طلب من منصة ${site.name} 🚀\n------------------\n1x برجر لحم دبل كلاسيك - 8,500 د.ع\n1x كباب عراقي مشوي - 13,000 د.ع\n------------------\nالمجموع: 21,500 د.ع\nالزبون: تجربة مدير المنصة\nالعنوان: بغداد - الكرادة`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  إرسال طلب فحص لواتساب 💬
                </a>
              </motion.div>
            </div>

            {/* Live Interactive Phone Simulator (Real iPhone Size) */}
            <motion.div
              className="card"
              {...dashSectionMotion(prefersReducedMotion, 0.08, true)}
              style={{ textAlign: 'center', padding: '24px 14px' }}
            >
              <h3 style={{ marginBottom: '6px', fontSize: '18px' }}>محاكي الآيفون التفاعلي الحي</h3>
              <p className="muted" style={{ fontSize: '13px', marginBottom: '20px' }}>
                هكذا يظهر المنيو التجريبي لعملائك على شاشات الآيفون الحقيقية مع ألوان المنصة المعتمدة:
              </p>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div className="iphone-shell-embed">
                  <div className="iphone-island">
                    <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#1e293b', border: '1px solid #334155' }} />
                    <span style={{ width: '38px', height: '5px', borderRadius: '4px', background: '#1e293b' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 22px 6px', fontSize: '12px', fontWeight: 700, direction: 'ltr', flexShrink: 0 }}>
                    <span>9:41</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Wifi size={13} />
                      <BatteryCharging size={14} />
                    </div>
                  </div>
                  <iframe
                    src={`${window.location.origin}/cap-burger`}
                    style={{ width: '100%', flex: 1, border: 0 }}
                    title="Live Demo Simulator"
                  />
                  <div className="iphone-home-bar" />
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB: HOME PAGE FULL EDITOR (تعديل الصفحة الرئيسية بالكامل)      */}
        {/* ============================================================== */}
        {effectiveTab === 'home_editor' && (
          <HomePageEditorSection
            site={site}
            home={home}
            plans={plans}
            pageTitle={customAdminLabel('home_editor', 'تعديل الصفحة الرئيسية')}
            actorLabel={session.phone || session.email || 'المدير'}
            onRefresh={onRefresh}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: OPEN SCRATCHPAD NOTES (مسودة مفتوحة مع حفظ تلقائي)        */}
        {/* ============================================================== */}
        {effectiveTab === 'notes' && (
          <OpenNotesScratchpad
            authorName={session.name || session.phone || session.email || 'الإدارة'}
            pageTitle={site.adminTabLabels?.notes?.trim() || undefined}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: PROBLEM REPORTS (البلاغات الواردة من لوحات الشركاء)         */}
        {/* ============================================================== */}
        {effectiveTab === 'reports' && (
          <AdminReportsSection
            pageTitle={site.adminTabLabels?.reports?.trim() || undefined}
            onRefresh={onRefresh}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 3: PERSISTENT STAFF MANAGEMENT (SUPABASE REST API)         */}
        {/* ============================================================== */}
        {effectiveTab === 'staff' && (
          <StaffManagementSection
            sessionEmail={session.phone || session.email || '07711448594'}
            pageTitle={site.adminTabLabels?.staff?.trim() || undefined}
            canManageStaff={isSuperAdmin || Boolean(staffPerms.canManageStaff)}
            onRefresh={onRefresh}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: DATABASE EXPLORER & FULL CONTROL (قاعدة البيانات)         */}
        {/* ============================================================== */}
        {effectiveTab === 'database' && (
          <DatabaseExplorerSection
            pageTitle={site.adminTabLabels?.database?.trim() || undefined}
            canManageDatabase={isSuperAdmin || Boolean(staffPerms.canManageDatabase)}
            canRunMaintenance={isSuperAdmin || Boolean(staffPerms.canRunMaintenance)}
            onRefresh={onRefresh}
            showToast={showToast}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 7: PLATFORM SETTINGS & SUBDOMAIN GOVERNANCE                 */}
        {/* ============================================================== */}
        {effectiveTab === 'settings' && (() => {
          const curAdminOrder = (() => {
            const saved = Array.isArray(editSite.adminTabOrder) ? editSite.adminTabOrder : [];
            const baseIds = DEFAULT_ADMIN_TAB_META.map((x) => x.id);
            return [...saved.filter((id) => baseIds.includes(id as MainTab)), ...baseIds.filter((id) => !saved.includes(id))];
          })();
          const curDashOrder = (() => {
            const saved = Array.isArray(editSite.dashboardTabOrder) ? editSite.dashboardTabOrder : [];
            const baseIds = DEFAULT_DASH_TAB_META.map((x) => x.id);
            return [...saved.filter((id) => baseIds.includes(id)), ...baseIds.filter((id) => !saved.includes(id))];
          })();

          const moveAdminOrder = (fromIdx: number, toIdx: number) => {
            if (fromIdx === toIdx || toIdx < 0 || toIdx >= curAdminOrder.length) return;
            const copy = [...curAdminOrder];
            const [moved] = copy.splice(fromIdx, 1);
            copy.splice(toIdx, 0, moved);
            setEditSite({ ...editSite, adminTabOrder: copy });
          };

          const moveDashOrder = (fromIdx: number, toIdx: number) => {
            if (fromIdx === toIdx || toIdx < 0 || toIdx >= curDashOrder.length) return;
            const copy = [...curDashOrder];
            const [moved] = copy.splice(fromIdx, 1);
            copy.splice(toIdx, 0, moved);
            setEditSite({ ...editSite, dashboardTabOrder: copy });
          };

          const jumpTo = (id: string) => {
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          };

          const allowLabels = isSuperAdmin || Boolean(staffPerms.canEditTabLabels);
          const allowReorder = isSuperAdmin || Boolean(staffPerms.canReorderTabs);
          const allowThemePay = isSuperAdmin || Boolean(staffPerms.canManageThemeMode);

          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'clamp(18px, 3vw, 22px)' }}>
                    <Settings size={20} style={{ color: 'var(--brand-ink, #34D399)' }} />
                    <span>{customAdminLabel('settings', 'إعدادات لوحة الإدارة والنظام')}</span>
                  </h1>
                  <p className="muted" style={{ margin: '3px 0 0', fontSize: '12px' }}>
                    مظهر لوحة الأدمن، بيانات الدفع والواتساب، ترتيب ومسميات القوائم، وبوت إرسال الطلبات عبر تيليجرام — يتم الحفظ تلقائياً.
                  </p>
                </div>
              </div>

              {/* Quick Jump Strip */}
              <div className="mp-jump-strip">
                <button type="button" className="mp-jump-btn" onClick={() => jumpTo('adm-general')}>مظهر الأدمن</button>
                <button type="button" className="mp-jump-btn" onClick={() => jumpTo('adm-fonts')}>الخطوط</button>
                <button type="button" className="mp-jump-btn" onClick={() => jumpTo('adm-payment')}>الدفع والواتساب</button>
                <button type="button" className="mp-jump-btn" onClick={() => jumpTo('adm-tabs-admin')}>قوائم الإدارة</button>
                <button type="button" className="mp-jump-btn" onClick={() => jumpTo('adm-tabs-dash')}>قوائم الزبون</button>
                {(isSuperAdmin || Boolean(staffPerms.canManagePlans)) && (
                  <button type="button" className="mp-jump-btn" onClick={() => jumpTo('adm-plan-features')}>ميزات الباقات</button>
                )}
                <button type="button" className="mp-jump-btn" onClick={() => jumpTo('adm-telegram')}>تيليجرام الطلبات</button>
              </div>

              <div className="mp-admin-settings-sections">
              {/* Frame 1: Admin & Customer Dashboard Themes */}
              <motion.div
                id="adm-general"
                className="mp-framed-wrap"
                {...dashSectionMotion(prefersReducedMotion, 0, true)}
              >
                <div className="mp-framed-title">
                  <span>مظهر لوحة الإدارة ولوحة تحكم الزبائن</span>
                </div>
                <div className="mp-framed-box" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* 1. Admin Dashboard Theme */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '14px 20px',
                    }}
                  >
                    <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '4px' }}>
                        مظهر لوحة تحكم الأدمن
                      </div>
                      <div className="muted" style={{ fontSize: '12px', lineHeight: 1.6 }}>
                        يغيّر مظهر لوحة الإدارة فقط دون التأثير على الصفحة الرئيسية أو لوحة الزبون.
                      </div>
                    </div>

                    <div
                      className="mp-seg-group"
                      role="group"
                      aria-label="مظهر لوحة تحكم الأدمن"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        width: 'min(100%, 348px)',
                        flexShrink: 0,
                      }}
                    >
                      <button
                        type="button"
                        disabled={!allowThemePay}
                        className={`mp-seg-btn${(editSite.adminThemeMode || 'light') === 'light' ? ' is-active' : ''}`}
                        style={{ justifyContent: 'center', width: '100%' }}
                        onClick={() => void handleSelectAdminThemeMode('light')}
                      >
                        <Sun size={14} />
                        <span>فاتح</span>
                      </button>
                      <button
                        type="button"
                        disabled={!allowThemePay}
                        className={`mp-seg-btn${editSite.adminThemeMode === 'dark' ? ' is-active' : ''}`}
                        style={{ justifyContent: 'center', width: '100%' }}
                        onClick={() => void handleSelectAdminThemeMode('dark')}
                      >
                        <Moon size={14} />
                        <span>داكن</span>
                      </button>
                      <button
                        type="button"
                        disabled={!allowThemePay}
                        className={`mp-seg-btn${editSite.adminThemeMode === 'auto' ? ' is-active' : ''}`}
                        style={{ justifyContent: 'center', width: '100%' }}
                        onClick={() => void handleSelectAdminThemeMode('auto')}
                      >
                        <Monitor size={14} />
                        <span>حسب الجهاز</span>
                      </button>
                    </div>
                  </div>

                  <div style={{ height: '1px', background: 'var(--line)' }} />

                  {/* 2. Customer Dashboard Theme (Default / Device-Matched) */}
                  {(() => {
                    const globalDashMode = editSite.dashboardThemeMode || 'light';
                    const deviceIsDark = getSystemPrefersDark();
                    const overriddenCount = getCollection<Restaurant>('restaurants').filter(
                      (r) => r.dashboardThemeMode && r.dashboardThemeMode !== globalDashMode
                    ).length;

                    return (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '14px 20px',
                        }}
                      >
                        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                          <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '4px' }}>
                            ثيم لوحة تحكم الزبائن (أصحاب المتاجر)
                          </div>
                          <div className="muted" style={{ fontSize: '12px', lineHeight: 1.6 }}>
                            عند اختيار <b>حسب الجهاز</b> يتطابق مظهر لوحة التحكم تلقائياً مع وضع متصفح أو هاتف الزبون.
                          </div>

                          {(globalDashMode === 'auto' || overriddenCount > 0) && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '8px',
                                marginTop: '8px',
                              }}
                            >
                              {globalDashMode === 'auto' && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    color: 'var(--brand-ink, #34D399)',
                                    background: 'var(--panel)',
                                    border: '1px solid var(--line)',
                                    borderRadius: '8px',
                                    padding: '3px 9px',
                                  }}
                                >
                                  {deviceIsDark ? <Moon size={12} /> : <Sun size={12} />}
                                  <span>الوضع المكتشف على جهازك الآن: {deviceIsDark ? 'داكن' : 'فاتح'}</span>
                                </span>
                              )}

                              {overriddenCount > 0 && (
                                <button
                                  type="button"
                                  disabled={!allowThemePay}
                                  className="btn s"
                                  onClick={() => void handleApplyDashboardThemeToAllStores(globalDashMode)}
                                  style={{ fontSize: '11.5px', fontWeight: 700, minHeight: '28px', padding: '3px 10px' }}
                                >
                                  تعميم على جميع الحسابات ({overriddenCount})
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div
                          className="mp-seg-group"
                          role="group"
                          aria-label="ثيم لوحة تحكم الزبائن"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                            width: 'min(100%, 348px)',
                            flexShrink: 0,
                          }}
                        >
                          <button
                            type="button"
                            disabled={!allowThemePay}
                            className={`mp-seg-btn${globalDashMode === 'light' ? ' is-active' : ''}`}
                            style={{ justifyContent: 'center', width: '100%' }}
                            onClick={() => void handleSelectGlobalDashboardThemeMode('light')}
                          >
                            <Sun size={14} />
                            <span>فاتح</span>
                          </button>
                          <button
                            type="button"
                            disabled={!allowThemePay}
                            className={`mp-seg-btn${globalDashMode === 'dark' ? ' is-active' : ''}`}
                            style={{ justifyContent: 'center', width: '100%' }}
                            onClick={() => void handleSelectGlobalDashboardThemeMode('dark')}
                          >
                            <Moon size={14} />
                            <span>داكن</span>
                          </button>
                          <button
                            type="button"
                            disabled={!allowThemePay}
                            className={`mp-seg-btn${globalDashMode === 'auto' ? ' is-active' : ''}`}
                            style={{ justifyContent: 'center', width: '100%' }}
                            onClick={() => void handleSelectGlobalDashboardThemeMode('auto')}
                          >
                            <Monitor size={14} />
                            <span>حسب الجهاز</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </motion.div>

              {/* Frame 1.5: Simple Site Font Switcher (Google Fonts) */}
              {(() => {
                const allowFontEdit =
                  isSuperAdmin || Boolean(staffPerms.canManageThemeMode) || Boolean(staffPerms.canManageSettings);
                const curTypo: FontTypographyConfig = {
                  ...DEFAULT_TYPOGRAPHY,
                  ...(editTheme.typography || {}),
                };
                const activeFontKey = normalizePlatformFontKey(curTypo.fontKey || editTheme.font);
                const activeFontMeta =
                  PLATFORM_FONT_CATALOG.find((f) => f.key === activeFontKey) || PLATFORM_FONT_CATALOG[0];
                const weightNames: Record<number, string> = {
                  100: '100 · رفيع جداً',
                  200: '200 · رفيع',
                  300: '300 · خفيف',
                  400: '400 · عادي',
                  500: '500 · متوسط',
                  600: '600 · نصف عريض',
                  700: '700 · عريض',
                  800: '800 · ثقيل',
                  900: '900 · أسود',
                };
                const curHeadingWeight = snapWeightToCatalog(Number(curTypo.headingWeight || 800), activeFontMeta.weights);
                const curBodyWeight = snapWeightToCatalog(Number(curTypo.bodyWeight || 400), activeFontMeta.weights);
                const curBodySize = Number(curTypo.bodySize || 15);
                const curStretch = Number(curTypo.fontStretch || 100);
                const curLineHeight = Number(curTypo.bodyLineHeight || 1.7);

                return (
                  <motion.div
                    id="adm-fonts"
                    className="mp-framed-wrap"
                    {...dashSectionMotion(prefersReducedMotion, 0.04, true)}
                  >
                    <div className="mp-framed-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                        <Type size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
                        <span>خط المنصة والمنيوهات (Google Fonts)</span>
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>
                        المفعّل على كامل المنصة: {activeFontMeta.label} ({activeFontMeta.englishName})
                      </span>
                    </div>
                    <div className="mp-framed-box" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: '10px',
                        }}
                      >
                        {PLATFORM_FONT_CATALOG.map((fontMeta) => {
                          const selected = fontMeta.key === activeFontKey;
                          const previewFamily = resolveFontCssStack(fontMeta.key, [], 'heading');
                          return (
                            <button
                              key={fontMeta.key}
                              type="button"
                              disabled={!allowFontEdit}
                              onClick={() =>
                                void handleUpdatePlatformTypography(
                                  { fontKey: fontMeta.key },
                                  `تم التبديل إلى ${fontMeta.label} (${fontMeta.englishName}) في كل المنصة ✓`
                                )
                              }
                              style={{
                                textAlign: 'start',
                                padding: '12px 14px',
                                borderRadius: '12px',
                                background: selected ? 'var(--soft)' : 'var(--bg)',
                                border: selected ? '1.5px solid var(--brand)' : '1px solid var(--line)',
                                cursor: allowFontEdit ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                transition: 'border-color 0.32s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.32s cubic-bezier(0.22, 1, 0.36, 1), transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>
                                  {fontMeta.label} · {fontMeta.englishName}
                                </span>
                                {selected && (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      fontSize: '11.5px',
                                      fontWeight: 800,
                                      color: 'var(--brand-ink, var(--brand))',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    <Check size={13} />
                                    مفعّل
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  fontFamily: previewFamily,
                                  fontSize: '16px',
                                  fontWeight: snapWeightToCatalog(700, fontMeta.weights),
                                  color: 'var(--ink)',
                                  lineHeight: 1.45,
                                }}
                              >
                                أهلاً بكم في منيو بلس · Menu+ 123
                              </div>
                              <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                                {fontMeta.sourceLabel} · أوزان {fontMeta.weights[0]}–{fontMeta.weights[fontMeta.weights.length - 1]}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                          gap: '10px',
                          paddingTop: '12px',
                          borderTop: '1px solid var(--line)',
                        }}
                      >
                        <label className="f" style={{ margin: 0 }}>
                          <span style={{ fontSize: '12px', fontWeight: 700 }}>حجم النص الأساسي</span>
                          <select
                            disabled={!allowFontEdit}
                            value={String(curBodySize)}
                            onChange={(e) =>
                              void handleUpdatePlatformTypography(
                                { typography: { bodySize: Number(e.target.value) } },
                                'تم تحديث حجم الخط في كل المنصة ✓'
                              )
                            }
                          >
                            <option value="13">13px · صغير</option>
                            <option value="14">14px · مدمج</option>
                            <option value="15">15px · قياسي</option>
                            <option value="16">16px · مريح</option>
                            <option value="17">17px · كبير</option>
                            <option value="18">18px · ضخم</option>
                          </select>
                        </label>

                        <label className="f" style={{ margin: 0 }}>
                          <span style={{ fontSize: '12px', fontWeight: 700 }}>سُمك العناوين</span>
                          <select
                            disabled={!allowFontEdit}
                            value={String(curHeadingWeight)}
                            onChange={(e) =>
                              void handleUpdatePlatformTypography(
                                {
                                  typography: {
                                    headingWeight: Number(e.target.value),
                                    subHeadingWeight: Number(e.target.value),
                                  },
                                },
                                'تم تحديث سُمك العناوين ✓'
                              )
                            }
                          >
                            {activeFontMeta.weights.map((w) => (
                              <option key={w} value={String(w)}>
                                {weightNames[w] || String(w)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="f" style={{ margin: 0 }}>
                          <span style={{ fontSize: '12px', fontWeight: 700 }}>سُمك النصوص</span>
                          <select
                            disabled={!allowFontEdit}
                            value={String(curBodyWeight)}
                            onChange={(e) =>
                              void handleUpdatePlatformTypography(
                                { typography: { bodyWeight: Number(e.target.value) } },
                                'تم تحديث سُمك النصوص ✓'
                              )
                            }
                          >
                            {activeFontMeta.weights.map((w) => (
                              <option key={w} value={String(w)}>
                                {weightNames[w] || String(w)}
                              </option>
                            ))}
                          </select>
                        </label>

                        {activeFontKey === 'firjar' ? (
                          <label className="f" style={{ margin: 0 }}>
                            <span style={{ fontSize: '12px', fontWeight: 700 }}>عرض الحرف (Firjar Width)</span>
                            <select
                              disabled={!allowFontEdit}
                              value={String(curStretch)}
                              onChange={(e) =>
                                void handleUpdatePlatformTypography(
                                  { typography: { fontStretch: Number(e.target.value) } },
                                  'تم تحديث عرض خط Firjar ✓'
                                )
                              }
                            >
                              <option value="85">85% · مضغوط</option>
                              <option value="100">100% · قياسي</option>
                              <option value="115">115% · موسّع</option>
                              <option value="125">125% · عريض</option>
                            </select>
                          </label>
                        ) : (
                          <label className="f" style={{ margin: 0 }}>
                            <span style={{ fontSize: '12px', fontWeight: 700 }}>تباعد الأسطر</span>
                            <select
                              disabled={!allowFontEdit}
                              value={String(curLineHeight)}
                              onChange={(e) =>
                                void handleUpdatePlatformTypography(
                                  { typography: { bodyLineHeight: Number(e.target.value) } },
                                  'تم تحديث تباعد الأسطر ✓'
                                )
                              }
                            >
                              <option value="1.5">1.5 · مدمج</option>
                              <option value="1.7">1.7 · قياسي</option>
                              <option value="1.9">1.9 · مريح</option>
                            </select>
                          </label>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

              {/* Frame 2: Compact Payment Numbers & Support WhatsApp */}
              <motion.div
                id="adm-payment"
                className="mp-framed-wrap"
                {...dashSectionMotion(prefersReducedMotion, 0.04, true)}
              >
                <div className="mp-framed-title">
                  <Wallet size={15} style={{ color: 'var(--brand-ink, #34D399)' }} />
                  <span>بيانات استلام الدفع للاشتراكات (زين كاش / كي كارد)</span>
                </div>
                <div className="mp-framed-box mp-compact-payment-box">
                  <div className="mp-compact-payment-grid">
                    <label className="f" style={{ margin: 0 }}>
                      رقم محفظة زين كاش
                      <input
                        dir="ltr"
                        disabled={!allowThemePay}
                        value={editSite.zainCashNumber || ''}
                        onChange={(e) => setEditSite({ ...editSite, zainCashNumber: e.target.value })}
                        placeholder="078..."
                      />
                    </label>
                    <label className="f" style={{ margin: 0 }}>
                      رقم بطاقة ماستر / كي كارد
                      <input
                        dir="ltr"
                        disabled={!allowThemePay}
                        value={editSite.qiCardNumber || ''}
                        onChange={(e) => setEditSite({ ...editSite, qiCardNumber: e.target.value })}
                        placeholder="رقم البطاقة أو الآيبان..."
                      />
                    </label>
                    <label className="f" style={{ margin: 0 }}>
                      رقم الدعم الفني بواتساب
                      <input
                        dir="ltr"
                        disabled={!allowThemePay}
                        value={editSite.supportWhatsapp ?? editSite.wa ?? '07724799679'}
                        onChange={(e) =>
                          setEditSite({
                            ...editSite,
                            supportWhatsapp: e.target.value,
                            wa: e.target.value,
                          })
                        }
                        placeholder="07724799679"
                      />
                    </label>
                  </div>
                  <label className="f" style={{ margin: 0 }}>
                    ملاحظة تظهر للزبون عند الترقية (اختياري)
                    <input
                      disabled={!allowThemePay}
                      value={editSite.paymentNote || ''}
                      onChange={(e) => setEditSite({ ...editSite, paymentNote: e.target.value })}
                      placeholder="مثال: أرسل صورة وصل التحويل على الواتساب لتفعيل الباقة فوراً."
                    />
                  </label>
                </div>
              </motion.div>

              {/* Frames 3 & 4: Side-by-Side Equal-Sized Menu Button Lists (Admin + Customer Tabs) */}
              <motion.div
                className="mp-tabs-dual-grid"
                {...dashSectionMotion(prefersReducedMotion, 0.04, true)}
              >
                <div id="adm-tabs-admin" className="mp-framed-wrap mp-tabs-col">
                  <div className="mp-framed-title">
                    <span>أسماء وترتيب قوائم لوحة الإدارة</span>
                  </div>
                  <div className="mp-framed-box mp-tabs-col-box">
                    <div className="mp-tab-order-list">
                      {curAdminOrder.map((tabId, idx) => {
                        const meta = DEFAULT_ADMIN_TAB_META.find((m) => m.id === tabId);
                        if (!meta) return null;
                        const rawVal = editSite.adminTabLabels?.[meta.id];
                        const currentVal = rawVal !== undefined ? rawVal : meta.def;
                        return (
                          <div
                            key={meta.id}
                            draggable={allowReorder}
                            onDragStart={() => setDragAdminIdx(idx)}
                            onDragOver={(e) => {
                              if (allowReorder) e.preventDefault();
                            }}
                            onDrop={() => {
                              if (allowReorder && dragAdminIdx !== null) {
                                moveAdminOrder(dragAdminIdx, idx);
                                setDragAdminIdx(null);
                              }
                            }}
                            onDragEnd={() => setDragAdminIdx(null)}
                            className={`mp-tab-order-tile${dragAdminIdx === idx ? ' is-dragging' : ''}`}
                          >
                            {allowReorder && (
                              <span className="mp-tab-order-grip" title="اسحب للترتيب">
                                <GripVertical size={13} />
                              </span>
                            )}
                            {allowReorder && (
                              <div className="mp-tab-order-btns">
                                <button
                                  type="button"
                                  className="mp-tab-order-btn"
                                  disabled={idx === 0}
                                  onClick={() => moveAdminOrder(idx, idx - 1)}
                                  title="لأعلى"
                                  aria-label="لأعلى"
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="mp-tab-order-btn"
                                  disabled={idx === curAdminOrder.length - 1}
                                  onClick={() => moveAdminOrder(idx, idx + 1)}
                                  title="لأسفل"
                                  aria-label="لأسفل"
                                >
                                  <ChevronDown size={13} />
                                </button>
                              </div>
                            )}
                            <input
                              type="text"
                              disabled={!allowLabels}
                              aria-label={meta.def}
                              value={currentVal}
                              placeholder={meta.def}
                              className="mp-tab-order-input"
                              onChange={(e) =>
                                setEditSite({
                                  ...editSite,
                                  adminTabLabels: {
                                    ...(editSite.adminTabLabels || {}),
                                    [meta.id]: e.target.value,
                                  },
                                })
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div id="adm-tabs-dash" className="mp-framed-wrap mp-tabs-col">
                  <div className="mp-framed-title">
                    <span>أسماء وترتيب قوائم لوحة تحكم الزبون</span>
                  </div>
                  <div className="mp-framed-box mp-tabs-col-box">
                    <div className="mp-tab-order-list">
                      {curDashOrder.map((tabId, idx) => {
                        const item = DEFAULT_DASH_TAB_META.find((m) => m.id === tabId);
                        if (!item) return null;
                        const labels = editSite.dashboardTabLabels || {};
                        const rawVal =
                          labels[item.id] !== undefined
                            ? labels[item.id]
                            : item.legacyId && labels[item.legacyId] !== undefined
                            ? labels[item.legacyId]
                            : undefined;
                        const currentVal = rawVal !== undefined ? rawVal : item.def;
                        return (
                          <div
                            key={item.id}
                            draggable={allowReorder}
                            onDragStart={() => setDragDashIdx(idx)}
                            onDragOver={(e) => {
                              if (allowReorder) e.preventDefault();
                            }}
                            onDrop={() => {
                              if (allowReorder && dragDashIdx !== null) {
                                moveDashOrder(dragDashIdx, idx);
                                setDragDashIdx(null);
                              }
                            }}
                            onDragEnd={() => setDragDashIdx(null)}
                            className={`mp-tab-order-tile${dragDashIdx === idx ? ' is-dragging' : ''}`}
                          >
                            {allowReorder && (
                              <span className="mp-tab-order-grip" title="اسحب للترتيب">
                                <GripVertical size={13} />
                              </span>
                            )}
                            {allowReorder && (
                              <div className="mp-tab-order-btns">
                                <button
                                  type="button"
                                  className="mp-tab-order-btn"
                                  disabled={idx === 0}
                                  onClick={() => moveDashOrder(idx, idx - 1)}
                                  title="لأعلى"
                                  aria-label="لأعلى"
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="mp-tab-order-btn"
                                  disabled={idx === curDashOrder.length - 1}
                                  onClick={() => moveDashOrder(idx, idx + 1)}
                                  title="لأسفل"
                                  aria-label="لأسفل"
                                >
                                  <ChevronDown size={13} />
                                </button>
                              </div>
                            )}
                            <input
                              type="text"
                              disabled={!allowLabels}
                              aria-label={item.def}
                              value={currentVal}
                              placeholder={item.def}
                              className="mp-tab-order-input"
                              onChange={(e) => {
                                const nextLabels: Record<string, string> = {
                                  ...(editSite.dashboardTabLabels || {}),
                                  [item.id]: e.target.value,
                                };
                                if (item.legacyId) delete nextLabels[item.legacyId];
                                setEditSite({
                                  ...editSite,
                                  dashboardTabLabels: nextLabels,
                                });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Frame 5: Plan Features Customization & Top-to-Bottom Reordering */}
              {(isSuperAdmin || Boolean(staffPerms.canManagePlans)) && editPlans.length > 0 && (
                <motion.div
                  id="adm-plan-features"
                  className="mp-framed-wrap"
                  {...dashSectionMotion(prefersReducedMotion, 0.04, true)}
                >
                  <div className="mp-framed-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <span>تعديل وترتيب ميزات الباقات في الصفحة الرئيسية (من الأعلى للأسفل)</span>
                  </div>
                  <div className="mp-framed-box">
                    <PlanFeaturesOrderEditor
                      plans={editPlans}
                      selectedPlanIdx={settingsPlanIdx}
                      onSelectPlanIdx={setSettingsPlanIdx}
                      onChangePlans={setEditPlans}
                      showPlanTabs={true}
                      showToast={showToast}
                    />
                  </div>
                </motion.div>
              )}

              {/* Frame 6: Telegram Order Notification Bot Settings */}
              <TelegramSettingsCard
                canManageSettings={isSuperAdmin || Boolean(staffPerms.canManageSettings)}
                showToast={showToast}
              />
              </div>
            </div>
          );
        })()}

        {/* ============================================================== */}
        {/* TAB 8: PERSONAL ACCOUNT SETTINGS (OWNER & ALL STAFF)           */}
        {/* ============================================================== */}
        {effectiveTab === 'account' && (
          <MyAccountSection
            session={session}
            pageTitle={site.adminTabLabels?.account?.trim() || undefined}
            onRefresh={onRefresh}
            onLogout={onLogout}
            showToast={showToast}
          />
        )}
        </motion.div>
        </Suspense>

        {showBottomSaveButton && (
          <div className="mp-floating-save-wrap" dir="rtl">
            <button
              type="button"
              className="mp-floating-save-btn"
              disabled={unifiedSaving}
              onClick={() => void flushAllAdminSaves()}
            >
              {unifiedSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>حفظ التغيرات</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
