/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Eye, GitBranch, Loader2, LogOut, MessageCircle, Save, Share2, Store, X } from 'lucide-react';
import { AppLogo } from '../../components/AppLogo';
import { AjaxConfirmModal } from '../../components/AjaxConfirmModal';
import { DEFAULT_SITE } from '../../utils/storage';
import { dashTabMotion } from '../../utils/dashboardMotion';
import {
  DashboardProvider,
  DashboardTab,
  DashboardViewProps,
  useDashboard,
} from './DashboardContext';

const PlanPurchaseModal = lazy(() =>
  import('../../components/PlanPurchaseModal').then((m) => ({ default: m.PlanPurchaseModal }))
);
const ShareMenuModal = lazy(() =>
  import('../../components/ShareMenuModal').then((m) => ({ default: m.ShareMenuModal }))
);
const ReportProblemModal = lazy(() =>
  import('../../components/ReportProblemModal').then((m) => ({ default: m.ReportProblemModal }))
);
const HomePage = lazy(() => import('./HomePage').then((m) => ({ default: m.HomePage })));
const StatsPage = lazy(() => import('./StatsPage').then((m) => ({ default: m.StatsPage })));
const CategoriesPage = lazy(() => import('./CategoriesPage').then((m) => ({ default: m.CategoriesPage })));
const ItemsPage = lazy(() => import('./ItemsPage').then((m) => ({ default: m.ItemsPage })));
const AddonsPage = lazy(() => import('./AddonsPage').then((m) => ({ default: m.AddonsPage })));
const AppearancePage = lazy(() => import('./AppearancePage').then((m) => ({ default: m.AppearancePage })));
const BranchesPage = lazy(() => import('./BranchesPage').then((m) => ({ default: m.BranchesPage })));
const OrdersPage = lazy(() => import('./OrdersPage').then((m) => ({ default: m.OrdersPage })));
const QrPage = lazy(() => import('./QrPage').then((m) => ({ default: m.QrPage })));
const SettingsPage = lazy(() => import('./SettingsPage').then((m) => ({ default: m.SettingsPage })));

const TabFallback = () => (
  <div style={{ minHeight: '220px', display: 'grid', placeItems: 'center' }} aria-hidden="true">
    <Loader2 size={24} className="animate-spin" style={{ color: 'var(--brand, #059669)' }} />
  </div>
);

const DashboardShell: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [reportModalOpen, setReportModalOpen] = React.useState(false);
  const {
    session,
    navTabs,
    site,
    mainRid,
    activeRid,
    mainRest,
    rest,
    branchesList,
    switchActiveBranch,
    resolvedPlan,
    purchaseModalPlan,
    setPurchaseModalPlan,
    terms,
    customTabLabel,
    supportWaHref,
    publicPath,
    liveMenuUrl,
    shareModalOpen,
    setShareModalOpen,
    openShareModal,
    activeTab,
    setActiveTab,
    drawerOpen,
    setDrawerOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    isItemEditorOpen,
    setIsItemEditorOpen,
    editingItemId,
    newOrdersCount,
    ajaxDialog,
    setAjaxDialog,
    flushPendingAppearanceSave,
    flushAllPendingSaves,
    unifiedSaving,
    onNavigate,
    onLogout,
    showToast,
  } = useDashboard();

  const isTabLocked = (tabId: DashboardTab): boolean => {
    if (tabId === 'stats') return !resolvedPlan.perms.analytics;
    if (tabId === 'branches') return resolvedPlan.maxBranches === 0;
    if (tabId === 'qr') return !resolvedPlan.perms.qrCode;
    return false;
  };

  // Respect admin site?.dashboardTabOrder when defined, otherwise keep home -> unlocked -> locked -> set
  const orderedTabs = (() => {
    const customOrder = site?.dashboardTabOrder;
    if (Array.isArray(customOrder) && customOrder.length > 0) {
      const rank = new Map<string, number>();
      customOrder.forEach((id, idx) => {
        rank.set(id === 'items' ? 'menu' : id === 'ord' ? 'orders' : id, idx);
      });
      return [...navTabs].sort((a, b) => {
        const ra = rank.has(a.id) ? rank.get(a.id)! : 999;
        const rb = rank.has(b.id) ? rank.get(b.id)! : 999;
        return ra - rb;
      });
    }
    const homeTab = navTabs.find((t) => t.id === 'home');
    const settingsTab = navTabs.find((t) => t.id === 'set');
    const middle = navTabs.filter((t) => t.id !== 'home' && t.id !== 'set');
    const unlockedMiddle = middle.filter((t) => !isTabLocked(t.id));
    const lockedMiddle = middle.filter((t) => isTabLocked(t.id));
    return [
      ...(homeTab ? [homeTab] : []),
      ...unlockedMiddle,
      ...lockedMiddle,
      ...(settingsTab ? [settingsTab] : []),
    ];
  })();

  const activeNavTab = navTabs.find((t) => t.id === activeTab);
  const activeTabTitle = activeNavTab
    ? customTabLabel(activeNavTab.id, activeNavTab.label)
    : terms.isStore
    ? 'لوحة تحكم المتجر'
    : 'لوحة التحكم';
  useEffect(() => {
    document.title = `${activeTabTitle} | ${rest.n || 'منيو بلس'}`;
  }, [activeTabTitle, rest.n]);

  const localizedPlanTitle = resolvedPlan.plan.n;
  const lockedTooltip = 'متاح في الباقات الأعلى';

  const showBottomSaveButton =
    activeTab === 'set' ||
    activeTab === 'appearance' ||
    (activeTab === 'qr' && resolvedPlan.perms.qrCode) ||
    (activeTab === 'menu' && isItemEditorOpen && Boolean(editingItemId));

  const renderBranchSwitcher = () => {
    if (branchesList.length === 0) return null;
    return (
      <div style={{ marginTop: '10px' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            fontWeight: 800,
            color: 'var(--muted)',
            marginBottom: '4px',
          }}
        >
          <GitBranch size={12} style={{ color: 'var(--brand-ink, #34D399)' }} />
          <span>الفرع النشط:</span>
        </label>
        <select
          value={activeRid}
          onChange={(e) => switchActiveBranch(e.target.value)}
          style={{
            fontSize: '12px',
            fontWeight: 700,
            padding: '6px 10px',
            minHeight: '34px',
            borderRadius: '9px',
            background: 'color-mix(in srgb, var(--panel) 88%, transparent)',
            border: '1px solid var(--line)',
            color: 'var(--ink)',
          }}
        >
          <option value={mainRid}>
            {mainRest.n} (الرئيسي)
          </option>
          {branchesList.map((b) => (
            <option key={b.id} value={b.id}>
              {b.branchName || b.n}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const renderNavFooter = (closeDrawer?: boolean) => (
    <>
      <div className="sb-nav-divider" />

      <div className="sb-footer-inline">
        <button
          type="button"
          className="sb-footer-item"
          onClick={() => {
            if (closeDrawer) setDrawerOpen(false);
            setReportModalOpen(true);
          }}
        >
          <AlertTriangle size={17} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span>إبلاغ عن مشكلة</span>
        </button>

        <a
          href={supportWaHref}
          target="_blank"
          rel="noopener noreferrer"
          className="sb-footer-item"
          onClick={() => {
            if (closeDrawer) setDrawerOpen(false);
          }}
        >
          <MessageCircle size={17} style={{ color: '#25D366', flexShrink: 0 }} />
          <span>احصل على مساعدة</span>
        </a>

        <button
          type="button"
          className="sb-footer-item is-danger"
          onClick={() => {
            if (closeDrawer) setDrawerOpen(false);
            onLogout();
          }}
        >
          <LogOut size={17} style={{ flexShrink: 0 }} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </>
  );

  return (
    <div
      className={`shell customer-shell ${sidebarCollapsed ? 'collapsed' : ''}`}
      dir="rtl"
    >
      {/* SLIDE-OVER DRAWER (Mobile Hamburger Menu) */}
      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer-panel" style={{ zIndex: 9999 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 12px', borderBottom: '1px solid var(--line)' }}>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onNavigate('/');
                }}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="الصفحة الرئيسية للموقع"
              >
                <AppLogo size={32} />
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
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
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  <Store size={14} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
                    {rest.n}
                  </span>
                </span>
                <span style={{ fontSize: '10.5px', fontWeight: 700, flexShrink: 0 }}>
                  {localizedPlanTitle}
                </span>
              </div>

              {branchesList.length > 0 && (
                <div style={{ marginBottom: '12px' }}>{renderBranchSwitcher()}</div>
              )}

              <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {orderedTabs.map((tab) => {
                  const IconComp = tab.Icon;
                  const isActive = activeTab === tab.id;
                  const isLocked = isTabLocked(tab.id);
                  const label = customTabLabel(tab.id, tab.label);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={isActive ? 'on' : ''}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setIsItemEditorOpen(false);
                        setDrawerOpen(false);
                      }}
                      style={isLocked ? { opacity: 0.62 } : undefined}
                    >
                      <IconComp size={17} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                      {tab.id === 'orders' && newOrdersCount > 0 && (
                        <span className="bd">{newOrdersCount}</span>
                      )}
                      {isLocked && (
                        <span style={{ fontSize: '11px', flexShrink: 0 }} title={lockedTooltip}>
                          🔒
                        </span>
                      )}
                    </button>
                  );
                })}

                {renderNavFooter(true)}
              </nav>
            </div>
          </aside>
        </>
      )}

      {/* DESKTOP SIDEBAR (Matches Admin Sidebar Design) */}
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
              maxWidth: '100%',
            }}
          >
            <Store size={13} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rest.n}
            </span>
          </div>
          <small style={{ marginTop: '4px', paddingInlineStart: '2px' }}>
            {localizedPlanTitle}
          </small>

          {renderBranchSwitcher()}
        </div>

        <nav>
          {orderedTabs.map((tab) => {
            const IconComp = tab.Icon;
            const isActive = activeTab === tab.id;
            const isLocked = isTabLocked(tab.id);
            const label = customTabLabel(tab.id, tab.label);
            return (
              <button
                key={tab.id}
                type="button"
                className={isActive ? 'on' : ''}
                style={isLocked ? { opacity: 0.62 } : undefined}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsItemEditorOpen(false);
                }}
              >
                <IconComp size={17} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
                {tab.id === 'orders' && newOrdersCount > 0 && (
                  <span className="bd">{newOrdersCount}</span>
                )}
                {isLocked && (
                  <span style={{ fontSize: '11px', flexShrink: 0 }} title={lockedTooltip}>
                    🔒
                  </span>
                )}
              </button>
            );
          })}

          {renderNavFooter(false)}
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="mn">
        <header className="app-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <button
              type="button"
              className="hamburger-btn"
              onClick={() => {
                if (window.innerWidth <= 900) {
                  setDrawerOpen(true);
                } else {
                  setSidebarCollapsed((prev) => !prev);
                }
              }}
              title={sidebarCollapsed ? 'إظهار القائمة الجانبية' : 'إخفاء / إظهار القائمة'}
              aria-label="القائمة"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>

            <span style={{ fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeTabTitle}
            </span>

            {branchesList.length > 0 && (
              <div className="mp-topbar-branch-switch" title="تبديل الفرع للتعديل">
                <GitBranch size={13} style={{ color: 'var(--brand-ink, #34D399)', flexShrink: 0 }} />
                <select
                  aria-label="تبديل الفرع"
                  value={activeRid}
                  onChange={(e) => switchActiveBranch(e.target.value)}
                >
                  <option value={mainRid}>الفرع الرئيسي</option>
                  {branchesList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.branchName || b.n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="mp-dash-topbar-actions">
            <button
              type="button"
              className="mp-dash-topbar-btn"
              onClick={openShareModal}
              aria-label={terms.isStore ? 'مشاركة المتجر' : 'مشاركة المنيو'}
              title={terms.isStore ? 'مشاركة المتجر' : 'مشاركة المنيو'}
            >
              <Share2 size={18} />
              <span className="mp-dash-topbar-label">{terms.isStore ? 'مشاركة المتجر' : 'مشاركة المنيو'}</span>
            </button>

            <button
              type="button"
              className="mp-dash-topbar-btn is-primary"
              onClick={() => {
                void flushPendingAppearanceSave();
                onNavigate(publicPath);
              }}
              aria-label={terms.isStore ? 'معاينة المتجر' : 'معاينة المنيو'}
              title={terms.isStore ? 'معاينة المتجر' : 'معاينة المنيو'}
            >
              <Eye size={18} />
              <span className="mp-dash-topbar-label">{terms.isStore ? 'معاينة المتجر' : 'معاينة المنيو'}</span>
            </button>
          </div>
        </header>

        <Suspense fallback={<TabFallback />}>
          <motion.div
            key={activeTab}
            {...dashTabMotion(prefersReducedMotion)}
          >
            {activeTab === 'home' && <HomePage />}
            {activeTab === 'cats' && <CategoriesPage />}
            {activeTab === 'menu' && <ItemsPage />}
            {activeTab === 'orders' && <OrdersPage />}
            {activeTab === 'stats' && <StatsPage />}
            {activeTab === 'appearance' && <AppearancePage />}
            {activeTab === 'branches' && <BranchesPage />}
            {activeTab === 'addons' && <AddonsPage />}
            {activeTab === 'qr' && <QrPage />}
            {activeTab === 'set' && <SettingsPage />}
          </motion.div>
        </Suspense>

        {showBottomSaveButton && (
          <div className="mp-floating-save-wrap" dir="rtl">
            <button
              type="button"
              className="mp-floating-save-btn"
              disabled={unifiedSaving}
              onClick={() => void flushAllPendingSaves()}
            >
              {unifiedSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>حفظ التغيرات</span>
            </button>
          </div>
        )}
      </main>

      <AjaxConfirmModal
        dialog={ajaxDialog}
        onClose={() => setAjaxDialog((prev) => ({ ...prev, isOpen: false }))}
      />

      {Boolean(purchaseModalPlan) && (
        <Suspense fallback={null}>
          <PlanPurchaseModal
            isOpen={true}
            plan={purchaseModalPlan}
            site={site || DEFAULT_SITE}
            restaurantName={mainRest.n}
            onClose={() => setPurchaseModalPlan(null)}
          />
        </Suspense>
      )}

      {shareModalOpen && (
        <Suspense fallback={null}>
          <ShareMenuModal
            isOpen={true}
            onClose={() => setShareModalOpen(false)}
            menuName={rest.n}
            menuUrl={liveMenuUrl}
            description={rest.tagline}
            isStore={terms.isStore}
            onCopied={showToast}
          />
        </Suspense>
      )}

      {reportModalOpen && (
        <Suspense fallback={null}>
          <ReportProblemModal
            isOpen={true}
            onClose={() => setReportModalOpen(false)}
            rest={rest}
            session={session}
            showToast={showToast}
          />
        </Suspense>
      )}
    </div>
  );
};

export const DashboardPage: React.FC<DashboardViewProps> = (props) => (
  <DashboardProvider valueProps={props}>
    <DashboardShell />
  </DashboardProvider>
);

export const DashboardView = DashboardPage;
