/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  GitBranch,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { getCollection } from '../../utils/storage';
import { Category, MenuItem } from '../../types';
import { getFullSubdomainUrl, getPublicMenuUrlPath } from '../../utils/businessDefaults';
import { surfaceCardStyle, themedInputStyle, useDashboard } from './DashboardContext';
import {
  DASH_EASE,
  dashCardMotion,
  dashModalMotion,
  dashSectionMotion,
} from '../../utils/dashboardMotion';

export const BranchesPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const {
    mainRid,
    activeRid,
    mainRest,
    branchesList,
    resolvedPlan,
    terms,
    site,
    switchActiveBranch,
    createBranch,
    cloneMainMenuToBranch,
    deleteBranch,
    copyLink,
    onNavigate,
    openUpgradeModal,
    showToast,
  } = useDashboard();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [cloneOnCreate, setCloneOnCreate] = useState(true);

  const maxB = resolvedPlan.maxBranches;
  const isLocked = maxB === 0;
  const atLimit = maxB !== -1 && branchesList.length >= maxB;

  const allCats = getCollection<Category>('cats');
  const allItems = getCollection<MenuItem>('items');

  const getBranchUrl = (r: typeof mainRest) => {
    const sub = getFullSubdomainUrl(r, site, resolvedPlan);
    if (sub) return sub;
    return `${window.location.origin}${getPublicMenuUrlPath(r, resolvedPlan)}`;
  };

  const handleOpenCreateModal = () => {
    if (isLocked) {
      openUpgradeModal('pro');
      return;
    }
    if (atLimit) {
      showToast(`وصلت للحد الأقصى للأفرع في باقتك (${maxB} فرع) 🔒`);
      openUpgradeModal('vip');
      return;
    }
    setShowCreateModal(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = createBranch(newBranchName, newBranchPhone, newBranchAddress, cloneOnCreate);
    if (ok) {
      setNewBranchName('');
      setNewBranchPhone('');
      setNewBranchAddress('');
      setShowCreateModal(false);
    }
  };

  return (
    <>
      {branchesList.length === 0 ? (
        <div
          style={{
            minHeight: 'calc(100dvh - 150px)',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <motion.button
            type="button"
            onClick={handleOpenCreateModal}
            className="btn p"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.92, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1.28, ease: DASH_EASE }}
            whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.03, transition: { duration: 0.42, ease: DASH_EASE } }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.96, transition: { duration: 0.22 } }}
            style={{
              height: '46px',
              padding: '0 24px',
              borderRadius: '14px',
              fontSize: '14.5px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 10px 28px color-mix(in srgb, var(--brand) 28%, transparent)',
            }}
          >
            <Plus size={18} />
            <span>إضافة فرع جديد</span>
          </motion.button>
        </div>
      ) : (
        <div style={{ maxWidth: '1020px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <motion.button
              type="button"
              onClick={handleOpenCreateModal}
              className="btn p"
              whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.025, transition: { duration: 0.42, ease: DASH_EASE } }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.96, transition: { duration: 0.22 } }}
              style={{
                height: '44px',
                padding: '0 22px',
                borderRadius: '13px',
                fontSize: '14px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Plus size={17} />
              <span>إضافة فرع جديد</span>
            </motion.button>
          </div>

          {/* Main Branch + Child Branches List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(() => {
              const isManagingMain = activeRid === mainRid;
              const mainCatsCount = allCats.filter((c) => c.rid === mainRid).length;
              const mainItemsCount = allItems.filter((i) => i.rid === mainRid).length;
              const mainUrl = getBranchUrl(mainRest);

              return (
                <motion.div
                  {...dashSectionMotion(prefersReducedMotion, 0.04)}
                  style={{
                    ...surfaceCardStyle,
                    borderRadius: '18px',
                    padding: '18px 20px',
                    border: isManagingMain ? '2px solid var(--brand)' : '1px solid var(--line)',
                    background: isManagingMain ? 'var(--soft)' : 'var(--surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--brand)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <GitBranch size={20} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <b style={{ fontSize: '16px', color: 'var(--ink)' }}>
                          {mainRest.n} (الفرع الرئيسي)
                        </b>
                        {isManagingMain && (
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,0.16)', padding: '2px 8px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} /> نشط الآن في اللوحة
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '3px' }}>
                        {mainCatsCount} أقسام • {mainItemsCount} {terms.isStore ? 'منتج' : 'عنصر'} • {mainRest.address || 'العنوان الرئيسي'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {!isManagingMain && (
                      <button
                        type="button"
                        onClick={() => switchActiveBranch(mainRid)}
                        className="btn p s"
                        style={{ fontWeight: 800 }}
                      >
                        إدارة الرئيسي الآن
                      </button>
                    )}
                    <button type="button" onClick={() => copyLink(mainUrl)} className="btn s">
                      <Copy size={14} />
                      <span>نسخ الرابط</span>
                    </button>
                    {getFullSubdomainUrl(mainRest, site, resolvedPlan) ? (
                      <a
                        href={mainUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn s"
                        style={{ textDecoration: 'none' }}
                      >
                        <ExternalLink size={14} />
                        <span>{terms.isStore ? 'فتح المتجر' : 'فتح المنيو'}</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigate(getPublicMenuUrlPath(mainRest, resolvedPlan))}
                        className="btn s"
                      >
                        <ExternalLink size={14} />
                        <span>{terms.isStore ? 'فتح المتجر' : 'فتح المنيو'}</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })()}

            {branchesList.map((branch, idx) => {
              const isManagingThis = activeRid === branch.id;
              const branchLabel = branch.branchName || branch.n;
              const branchCats = allCats.filter((c) => c.rid === branch.id).length;
              const branchItems = allItems.filter((i) => i.rid === branch.id).length;
              const branchUrl = getBranchUrl(branch);

              return (
                <motion.div
                  key={branch.id}
                  {...dashCardMotion(prefersReducedMotion, idx, 1, false, 0.08)}
                  style={{
                    ...surfaceCardStyle,
                    borderRadius: '18px',
                    padding: '18px 20px',
                    border: isManagingThis ? '2px solid var(--brand)' : '1px solid var(--line)',
                    background: isManagingThis ? 'var(--soft)' : 'var(--surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '14px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <b style={{ fontSize: '15.5px', color: 'var(--ink)' }}>🏢 {branchLabel}</b>
                      {isManagingThis && (
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,0.16)', padding: '2px 8px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={12} /> قيد الإدارة الآن
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '3px' }}>
                      {branchCats} أقسام • {branchItems} {terms.isStore ? 'منتج' : 'عنصر'} • 📞 {branch.ph || mainRest.ph}
                      {branch.address ? ` • 📍 ${branch.address}` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {!isManagingThis && (
                      <button
                        type="button"
                        onClick={() => switchActiveBranch(branch.id)}
                        className="btn p s"
                        style={{ fontWeight: 800 }}
                      >
                        {terms.isStore ? 'إدارة متجر هذا الفرع' : 'إدارة منيو هذا الفرع'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => cloneMainMenuToBranch(branch.id, branchLabel)}
                      className="btn s"
                      title={terms.isStore ? 'استيراد نسخة من منتجات الفرع الرئيسي' : 'استيراد نسخة من منيو الفرع الرئيسي'}
                    >
                      <RefreshCw size={14} />
                      <span>{terms.isStore ? 'نسخ منتجات الرئيسي هنا' : 'نسخ منيو الرئيسي هنا'}</span>
                    </button>
                    <button type="button" onClick={() => copyLink(branchUrl)} className="btn s">
                      <Copy size={14} />
                      <span>الرابط</span>
                    </button>
                    {getFullSubdomainUrl(branch, site, resolvedPlan) ? (
                      <a
                        href={branchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn s"
                        style={{ textDecoration: 'none' }}
                      >
                        <ExternalLink size={14} />
                        <span>فتح</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigate(getPublicMenuUrlPath(branch, resolvedPlan))}
                        className="btn s"
                      >
                        <ExternalLink size={14} />
                        <span>فتح</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteBranch(branch.id, branchLabel)}
                      className="btn s d"
                      title="حذف الفرع"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create New Branch Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.72, ease: DASH_EASE }}
            onClick={() => setShowCreateModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0, 0, 0, 0.58)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <motion.form
              onSubmit={handleCreate}
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              style={{
                ...surfaceCardStyle,
                width: '100%',
                maxWidth: '480px',
                borderRadius: '20px',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--soft)', color: 'var(--brand)', display: 'grid', placeItems: 'center' }}>
                    <Plus size={18} />
                  </div>
                  <h2 style={{ margin: 0, fontSize: '16.5px', fontWeight: 900, color: 'var(--ink)' }}>
                    إضافة فرع جديد
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  aria-label="إغلاق"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    border: '1px solid var(--line)',
                    background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
                    color: 'var(--muted)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <label className="f" style={{ margin: 0 }}>
                {terms.isStore ? 'اسم الفرع * (مثال: معرض المنصور)' : 'اسم الفرع * (مثال: فرع المنصور)'}
                <input
                  type="text"
                  required
                  autoFocus
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder={terms.isStore ? 'مثال: معرض المنصور' : 'مثال: فرع المنصور'}
                  style={themedInputStyle}
                />
              </label>

              <label className="f" style={{ margin: 0 }}>
                رقم هاتف / واتساب الفرع (اختياري)
                <input
                  type="tel"
                  dir="ltr"
                  value={newBranchPhone}
                  onChange={(e) => setNewBranchPhone(e.target.value)}
                  placeholder={mainRest.ph || '07701234567'}
                  style={{ ...themedInputStyle, textAlign: 'left' }}
                />
              </label>

              <label className="f" style={{ margin: 0 }}>
                عنوان الفرع (اختياري)
                <input
                  type="text"
                  value={newBranchAddress}
                  onChange={(e) => setNewBranchAddress(e.target.value)}
                  placeholder="مثال: بغداد - المنصور شارع 14 رمضان"
                  style={themedInputStyle}
                />
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                <input
                  type="checkbox"
                  checked={cloneOnCreate}
                  onChange={(e) => setCloneOnCreate(e.target.checked)}
                />
                <span>
                  {terms.isStore
                    ? 'نسخ أقسام ومنتجات الفرع الرئيسي (الأقسام والمنتجات) إلى هذا الفرع تلقائياً'
                    : 'نسخ منيو الفرع الرئيسي (الأقسام والأصناف) إلى هذا الفرع تلقائياً'}
                </span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn s"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn p"
                  style={{ fontWeight: 800 }}
                >
                  <Plus size={16} />
                  <span>إنشاء الفرع وتفعيله</span>
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
