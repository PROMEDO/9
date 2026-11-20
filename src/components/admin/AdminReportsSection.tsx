/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  Image as ImageIcon,
  Link2,
  MessageCircle,
  Phone,
  Store,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { ProblemReport } from '../../types';
import {
  copyTextReliable,
  deleteItem,
  getCollection,
  putItemAndSync,
  syncFromServer,
  waLink,
} from '../../utils/storage';
import { surfaceCardStyle } from '../../pages/dashboard/DashboardContext';

interface AdminReportsSectionProps {
  pageTitle?: string;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

type ReportFilter = 'all' | 'new' | 'completed';

const REPORT_STATUS_OPTIONS = [
  { value: 'new', text: 'جديد', bg: '#ea580c' },
  { value: 'reviewing', text: 'قيد المراجعة', bg: '#f59e0b' },
  { value: 'in_progress', text: 'قيد المعالجة', bg: '#3b82f6' },
  { value: 'completed', text: 'مكتمل', bg: '#10b981' },
  { value: 'closed', text: 'مغلق', bg: '#64748b' },
] as const;

function formatReportDayAndTime(report: ProblemReport): string {
  const rawTs = Number(report.at || 0);
  const parsedCreatedAt = !rawTs && report.createdAt ? Date.parse(report.createdAt) : NaN;
  const ts = rawTs > 0 ? rawTs : Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : 0;

  if (ts > 0) {
    const dt = new Date(ts);
    try {
      const dayPart = dt.toLocaleDateString('ar-IQ-u-nu-latn', {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
      });
      const timePart = dt.toLocaleTimeString('ar-IQ-u-nu-latn', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${dayPart} • ${timePart}`;
    } catch {
      return `${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  return report.createdAt || '—';
}

function getNormalizedReportStatus(report: ProblemReport): string {
  const raw = String(report.st || report.status || 'new').toLowerCase();
  if (raw === 'pending' || raw === 'new') return 'new';
  if (raw === 'reviewing') return 'reviewing';
  if (raw === 'in_progress') return 'in_progress';
  if (raw === 'completed' || raw === 'resolved') return 'completed';
  return 'closed';
}

function getReportStatusInfo(report: ProblemReport) {
  const key = getNormalizedReportStatus(report);
  return REPORT_STATUS_OPTIONS.find((s) => s.value === key) || REPORT_STATUS_OPTIONS[0];
}

function getReportDisplayNumber(report: ProblemReport): string {
  return report.reportSeq || report.seq
    ? `#${report.reportSeq || report.seq}`
    : `#${report.id.slice(-6).toUpperCase()}`;
}

export const AdminReportsSection: React.FC<AdminReportsSectionProps> = ({
  onRefresh,
  showToast,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [reportFilter, setReportFilter] = useState<ReportFilter>('all');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [statusPickerReportId, setStatusPickerReportId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('menuplus_db_updated', bump);
    void syncFromServer().then((ok) => {
      if (ok) bump();
    });
    return () => {
      window.removeEventListener('menuplus_db_updated', bump);
    };
  }, []);

  const allReports = getCollection<ProblemReport>('reports').sort(
    (a, b) => Number(b.at || 0) - Number(a.at || 0)
  );

  const newReportsCount = allReports.filter((r) => getNormalizedReportStatus(r) === 'new').length;
  const completedReportsCount = allReports.filter((r) => getNormalizedReportStatus(r) === 'completed').length;

  const filteredReports = allReports.filter((r) => {
    const st = getNormalizedReportStatus(r);
    if (reportFilter === 'new') return st === 'new';
    if (reportFilter === 'completed') return st === 'completed';
    return true;
  });

  const selectedReport = selectedReportId
    ? allReports.find((r) => r.id === selectedReportId) || null
    : null;
  const statusPickerReport = statusPickerReportId
    ? allReports.find((r) => r.id === statusPickerReportId) || null
    : null;

  const handleUpdateReportStatus = async (reportId: string, nextStatus: string) => {
    const target = allReports.find((r) => r.id === reportId);
    if (!target) return;
    await putItemAndSync<ProblemReport>(`reports/${reportId}`, {
      ...target,
      status: nextStatus,
      st: nextStatus,
      updatedAt: Date.now(),
    });
    setTick((t) => t + 1);
    onRefresh();
    const label = REPORT_STATUS_OPTIONS.find((s) => s.value === nextStatus)?.text || nextStatus;
    showToast(`تم تحديث حالة البلاغ إلى "${label}" ✓`);
  };

  const handleDeleteReport = (reportId: string) => {
    deleteItem(`reports/${reportId}`);
    if (selectedReportId === reportId) setSelectedReportId(null);
    if (statusPickerReportId === reportId) setStatusPickerReportId(null);
    setTick((t) => t + 1);
    onRefresh();
    showToast('تم حذف البلاغ ✓');
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <motion.div
        className="mp-orders-toolbar"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mp-orders-tabs" role="tablist" aria-label="تصفية البلاغات">
          <button
            type="button"
            role="tab"
            aria-selected={reportFilter === 'all'}
            className={`mp-orders-tab ${reportFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setReportFilter('all')}
          >
            <span>الكل</span>
            <span className="mp-orders-tab-count tabular-nums">({allReports.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={reportFilter === 'new'}
            className={`mp-orders-tab ${reportFilter === 'new' ? 'is-active' : ''}`}
            onClick={() => setReportFilter('new')}
          >
            <span>جديد</span>
            <span className="mp-orders-tab-count tabular-nums">({newReportsCount})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={reportFilter === 'completed'}
            className={`mp-orders-tab ${reportFilter === 'completed' ? 'is-active' : ''}`}
            onClick={() => setReportFilter('completed')}
          >
            <span>مكتمل</span>
            <span className="mp-orders-tab-count tabular-nums">({completedReportsCount})</span>
          </button>
        </div>
      </motion.div>

      {filteredReports.length === 0 ? (
        <div style={{ ...surfaceCardStyle, padding: '40px 20px', textAlign: 'center', borderRadius: '18px' }}>
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>🚨</div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px', color: 'var(--ink)' }}>
            لا توجد بلاغات في هذا التصنيف حالياً
          </h3>
          <p style={{ fontSize: '13.5px', margin: 0, color: 'var(--muted)' }}>
            عندما يقوم أصحاب المتاجر بإرسال بلاغ عن مشكلة ستظهر بلاغاتهم هنا فوراً.
          </p>
        </div>
      ) : (
        <div className="mp-orders-list">
          {filteredReports.map((report, idx) => {
            const storeName = report.restaurantName || 'متجر';
            const repPhone = report.phone || '';
            const statusInfo = getReportStatusInfo(report);
            const displayNum = getReportDisplayNumber(report);
            const dateTimeLabel = formatReportDayAndTime(report);

            return (
              <motion.div
                key={report.id}
                className="mp-order-row"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.08 }}
                transition={{
                  duration: 0.82,
                  delay: prefersReducedMotion ? 0 : Math.min(idx * 0.06, 0.36),
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="mp-order-top-line">
                  <div className="mp-order-meta-group">
                    <span className="mp-order-num tabular-nums">{displayNum}</span>

                    <span className="mp-order-type-chip">
                      <Store size={12} style={{ color: 'var(--brand-ink, #34D399)', flexShrink: 0 }} />
                      <span>{storeName}</span>
                    </span>

                    {report.image && (
                      <span className="mp-order-type-chip">
                        <ImageIcon size={12} style={{ color: 'var(--brand-ink, #34D399)', flexShrink: 0 }} />
                        <span>صورة</span>
                      </span>
                    )}
                  </div>

                  <div className="mp-order-end-group">
                    <button
                      type="button"
                      className="mp-order-status-btn"
                      onClick={() => setStatusPickerReportId(report.id)}
                      aria-label={`تغيير حالة البلاغ ${displayNum}`}
                      title="تغيير حالة البلاغ"
                      style={{
                        background: statusInfo.bg,
                        borderColor: statusInfo.bg,
                        color: '#ffffff',
                      }}
                    >
                      <span>{statusInfo.text}</span>
                      <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.9 }} aria-hidden="true" />
                    </button>

                    {repPhone && (
                      <a
                        href={waLink(
                          repPhone,
                          `مرحباً ${report.ownerName || storeName}، بخصوص بلاغكم ${displayNum}:`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mp-order-icon-btn is-wa"
                        title="مراسلة المرسل عبر واتساب"
                        aria-label={`مراسلة المرسل عبر واتساب للبلاغ ${displayNum}`}
                      >
                        <MessageCircle size={15} />
                      </a>
                    )}

                    <button
                      type="button"
                      className="mp-order-icon-btn"
                      onClick={() => setSelectedReportId(report.id)}
                      title="تفاصيل البلاغ"
                      aria-label={`تفاصيل البلاغ ${displayNum}`}
                    >
                      <Eye size={15} />
                    </button>
                  </div>
                </div>

                <div className="mp-order-bottom-line">
                  <span className="mp-order-datetime tabular-nums">
                    <CalendarClock size={12} style={{ flexShrink: 0, opacity: 0.8 }} />
                    <span>{dateTimeLabel}</span>
                  </span>

                  <span className="mp-order-customer-mini" title={report.message}>
                    {report.message}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Details Modal */}
      {selectedReport && (() => {
        const storeName = selectedReport.restaurantName || 'متجر';
        const repPhone = selectedReport.phone || '';
        const statusInfo = getReportStatusInfo(selectedReport);
        const displayNum = getReportDisplayNumber(selectedReport);
        const dateTimeLabel = formatReportDayAndTime(selectedReport);

        const modalContent = (
          <div
            className="mp-order-modal-overlay"
            dir="rtl"
            onClick={() => setSelectedReportId(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`تفاصيل البلاغ ${displayNum}`}
              onClick={(e) => e.stopPropagation()}
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: 'min(560px, 100%)',
                maxHeight: '90dvh',
                overflowY: 'auto',
                ...surfaceCardStyle,
                borderRadius: '20px',
                padding: '18px 18px 20px',
                boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
              }}
            >
              {/* Modal Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  paddingBottom: '12px',
                  marginBottom: '14px',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--ink)' }} className="tabular-nums">
                    تفاصيل البلاغ {displayNum}
                  </h3>
                  <span className="mp-order-status-dot" style={{ background: statusInfo.bg }}>
                    {statusInfo.text}
                  </span>
                  <span className="mp-order-type-chip">
                    <Store size={13} style={{ color: 'var(--brand-ink, #34D399)' }} />
                    <span>{storeName}</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedReportId(null)}
                  aria-label="إغلاق"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '9px',
                    width: '32px',
                    height: '32px',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Reporter Info */}
                <div className="mp-order-modal-section">
                  <h4 className="mp-order-modal-section-title">
                    <User size={14} />
                    <span>معلومات البلاغ والمرسل</span>
                  </h4>

                  <div className="mp-order-info-grid">
                    <div className="mp-order-info-item">
                      <span className="mp-order-info-label">تاريخ ووقت البلاغ</span>
                      <span className="mp-order-info-val tabular-nums">{dateTimeLabel}</span>
                    </div>

                    <div className="mp-order-info-item">
                      <span className="mp-order-info-label">اسم المتجر / المطعم</span>
                      <span className="mp-order-info-val">{storeName}</span>
                    </div>

                    {selectedReport.ownerName && (
                      <div className="mp-order-info-item">
                        <span className="mp-order-info-label">اسم المرسل</span>
                        <span className="mp-order-info-val">{selectedReport.ownerName}</span>
                      </div>
                    )}

                    {repPhone && (
                      <div className="mp-order-info-item">
                        <span className="mp-order-info-label">رقم الهاتف</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <a
                            href={`tel:${repPhone}`}
                            dir="ltr"
                            className="mp-order-info-val tabular-nums"
                            style={{ color: 'var(--brand-ink, #34D399)', textDecoration: 'none' }}
                          >
                            {repPhone}
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              void copyTextReliable(repPhone).then((ok) => {
                                showToast(ok ? 'تم نسخ رقم الهاتف ✓' : 'تعذر النسخ');
                              });
                            }}
                            title="نسخ الرقم"
                            aria-label="نسخ رقم الهاتف"
                            style={{
                              border: '1px solid var(--line)',
                              background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
                              color: 'var(--muted)',
                              borderRadius: '7px',
                              width: '26px',
                              height: '26px',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mp-order-info-item" style={{ gridColumn: '1 / -1' }}>
                      <span className="mp-order-info-label">تفاصيل المشكلة</span>
                      <span className="mp-order-info-val" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                        {selectedReport.message}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Attached Image */}
                {selectedReport.image && (
                  <div className="mp-order-modal-section">
                    <h4 className="mp-order-modal-section-title">
                      <ImageIcon size={14} />
                      <span>الصورة المرفقة</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setLightboxImage(selectedReport.image || null)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: 0,
                        border: '1px solid var(--line)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: 'rgba(0, 0, 0, 0.2)',
                        cursor: 'zoom-in',
                      }}
                      title="اضغط لتكبير الصورة"
                    >
                      <img
                        src={selectedReport.image}
                        alt={`صورة البلاغ ${displayNum}`}
                        style={{
                          width: '100%',
                          maxHeight: '280px',
                          objectFit: 'contain',
                          display: 'block',
                        }}
                      />
                    </button>
                  </div>
                )}

                {/* Direct Contact */}
                {repPhone && (
                  <div className="mp-order-modal-section">
                    <h4 className="mp-order-modal-section-title">
                      <Link2 size={14} />
                      <span>التواصل المباشر</span>
                    </h4>

                    <div className="mp-order-links-list">
                      <a
                        href={waLink(
                          repPhone,
                          `مرحباً ${selectedReport.ownerName || storeName}، بخصوص بلاغكم ${displayNum}:`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mp-order-link-pill"
                        style={{
                          background: '#25D366',
                          borderColor: '#25D366',
                          color: '#ffffff',
                        }}
                      >
                        <MessageCircle size={14} />
                        <span>مراسلة المرسل عبر واتساب</span>
                      </a>

                      <a href={`tel:${repPhone}`} className="mp-order-link-pill">
                        <Phone size={14} />
                        <span>اتصال هاتفي</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* Status Actions */}
                <div className="mp-order-modal-section">
                  <h4 className="mp-order-modal-section-title">
                    <FileText size={14} />
                    <span>تغيير حالة البلاغ</span>
                  </h4>
                  <div className="mp-order-status-pills-grid">
                    {REPORT_STATUS_OPTIONS.map((opt) => {
                      const active = statusInfo.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => void handleUpdateReportStatus(selectedReport.id, opt.value)}
                          className={`mp-order-modal-status-btn ${active ? 'is-active' : ''}`}
                          style={
                            active
                              ? {
                                  background: opt.bg,
                                  borderColor: opt.bg,
                                  color: '#ffffff',
                                }
                              : {
                                  borderColor: `color-mix(in srgb, ${opt.bg} 32%, var(--line))`,
                                }
                          }
                        >
                          <span
                            className="mp-order-status-circle"
                            style={{ background: active ? '#ffffff' : opt.bg }}
                            aria-hidden="true"
                          />
                          <span>{opt.text}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Delete Action */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn s d"
                    onClick={() => handleDeleteReport(selectedReport.id)}
                    style={{ gap: '6px' }}
                  >
                    <Trash2 size={14} />
                    <span>حذف البلاغ</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        );

        return typeof document !== 'undefined'
          ? createPortal(modalContent, document.body)
          : modalContent;
      })()}

      {/* Status Picker Modal */}
      {statusPickerReport && (() => {
        const currentStatus = getReportStatusInfo(statusPickerReport);
        const displayNum = getReportDisplayNumber(statusPickerReport);
        const pickerModal = (
          <div
            className="mp-order-modal-overlay"
            dir="rtl"
            onClick={() => setStatusPickerReportId(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`تغيير حالة البلاغ ${displayNum}`}
              className="mp-status-picker-card"
              onClick={(e) => e.stopPropagation()}
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={surfaceCardStyle}
            >
              <div className="mp-status-picker-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <h4 className="mp-status-picker-title tabular-nums">حالة البلاغ {displayNum}</h4>
                  <span className="mp-order-status-dot" style={{ background: currentStatus.bg }}>
                    {currentStatus.text}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusPickerReportId(null)}
                  aria-label="إغلاق"
                  className="mp-status-picker-close"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="mp-status-picker-list">
                {REPORT_STATUS_OPTIONS.map((opt) => {
                  const isActive = currentStatus.value === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        void handleUpdateReportStatus(statusPickerReport.id, opt.value);
                        setStatusPickerReportId(null);
                      }}
                      className={`mp-status-picker-option ${isActive ? 'is-active' : ''}`}
                      style={
                        isActive
                          ? {
                              background: opt.bg,
                              borderColor: opt.bg,
                              color: '#ffffff',
                            }
                          : {
                              borderColor: `color-mix(in srgb, ${opt.bg} 34%, var(--line))`,
                              background: `color-mix(in srgb, ${opt.bg} 9%, var(--bg))`,
                            }
                      }
                    >
                      <span className="mp-status-picker-opt-main">
                        <span
                          className="mp-order-status-circle"
                          style={{ background: isActive ? '#ffffff' : opt.bg }}
                          aria-hidden="true"
                        />
                        <span>{opt.text}</span>
                      </span>
                      {isActive && <Check size={14} strokeWidth={2.75} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        );

        return typeof document !== 'undefined'
          ? createPortal(pickerModal, document.body)
          : pickerModal;
      })()}

      {/* Fullscreen Image Lightbox */}
      {lightboxImage && (() => {
        const lightbox = (
          <div
            className="mp-order-modal-overlay"
            style={{ zIndex: 100001 }}
            onClick={() => setLightboxImage(null)}
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="إغلاق الصورة"
              style={{
                position: 'fixed',
                top: '16px',
                insetInlineEnd: '16px',
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>
            <img
              src={lightboxImage}
              alt="معاينة الصورة"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '94vw',
                maxHeight: '88dvh',
                borderRadius: '14px',
                objectFit: 'contain',
                boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
              }}
            />
          </div>
        );
        return typeof document !== 'undefined'
          ? createPortal(lightbox, document.body)
          : lightbox;
      })()}
    </div>
  );
};
