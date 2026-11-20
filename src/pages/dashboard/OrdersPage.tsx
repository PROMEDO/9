/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Link2,
  MapPin,
  MessageCircle,
  Phone,
  Store,
  Trash2,
  Truck,
  User,
  Utensils,
  X,
} from 'lucide-react';
import { Order } from '../../types';
import { copyTextReliable, formatNumber, waLink } from '../../utils/storage';
import { surfaceCardStyle, useDashboard } from './DashboardContext';
import { dashModalMotion, dashRowMotion, dashSectionMotion } from '../../utils/dashboardMotion';

function formatOrderDayAndTime(order: Order): string {
  const locale = 'ar-IQ-u-nu-latn';
  const rawTs = Number(order.at || 0);
  const parsedCreatedAt = !rawTs && order.createdAt ? Date.parse(order.createdAt) : NaN;
  const ts = rawTs > 0 ? rawTs : Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : 0;

  if (ts > 0) {
    const dt = new Date(ts);
    try {
      const dayPart = dt.toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
      });
      const timePart = dt.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${dayPart} • ${timePart}`;
    } catch {
      return `${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  return order.createdAt || '—';
}

function getOrderTypeInfo(order: Order, isStore = false) {
  const rawType = order.type || order.cu?.orderType || 'delivery';
  const tableVal = String(order.table || order.cu?.table || '').trim();

  if (rawType === 'table') {
    const base = isStore ? 'داخل المعرض' : 'طاولة';
    return {
      key: 'table' as const,
      label: tableVal ? `${base} (${tableVal})` : base,
      Icon: isStore ? Store : Utensils,
    };
  }
  if (rawType === 'pickup') {
    return {
      key: 'pickup' as const,
      label: isStore ? 'استلام من المعرض' : 'استلام',
      Icon: Store,
    };
  }
  return {
    key: 'delivery' as const,
    label: 'توصيل',
    Icon: Truck,
  };
}

function getOrderStatusOptions() {
  return [
    { value: 'new', text: 'جديد', bg: '#ea580c' },
    { value: 'preparing', text: 'قيد التجهيز', bg: '#f59e0b' },
    { value: 'ready', text: 'جاهز', bg: '#3b82f6' },
    { value: 'delivering', text: 'قيد التوصيل', bg: '#8b5cf6' },
    { value: 'completed', text: 'مكتمل', bg: '#10b981' },
    { value: 'cancelled', text: 'ملغي', bg: '#ef4444' },
  ] as const;
}

function getNormalizedOrderStatus(order: Order): string {
  const raw = String(order.st || order.status || 'new').toLowerCase();
  if (raw === 'pending' || raw === 'new') return 'new';
  if (raw === 'preparing') return 'preparing';
  if (raw === 'ready') return 'ready';
  if (raw === 'delivering') return 'delivering';
  if (raw === 'completed') return 'completed';
  return 'cancelled';
}

function getOrderStatusInfo(order: Order) {
  const opts = getOrderStatusOptions();
  const key = getNormalizedOrderStatus(order);
  return opts.find((s) => s.value === key) || opts[0];
}

function getOrderDisplayNumber(order: Order): string {
  return order.orderSeq || order.seq
    ? `#${order.orderSeq || order.seq}`
    : `#${order.id.slice(-6).toUpperCase()}`;
}

function extractOrderLinks(
  order: Order,
  restName: string
): Array<{ label: string; url: string; kind: 'whatsapp' | 'map' | 'web' }> {
  const links: Array<{ label: string; url: string; kind: 'whatsapp' | 'map' | 'web' }> = [];
  const seen = new Set<string>();

  const addLink = (label: string, url: string, kind: 'whatsapp' | 'map' | 'web') => {
    const clean = String(url || '').trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    links.push({ label, url: clean, kind });
  };

  const ordName = order.name || order.cu?.n || '';
  const ordPhone = order.phone || order.cu?.ph || '';
  if (ordPhone) {
    addLink(
      'مراسلة الزبون عبر واتساب',
      waLink(
        ordPhone,
        `مرحباً ${ordName}، بخصوص طلبك ${getOrderDisplayNumber(order)} من ${restName}:`
      ),
      'whatsapp'
    );
  }

  const lat = order.lat ?? order.cu?.lat;
  const lng = order.lng ?? order.cu?.lng;
  if (lat && lng) {
    addLink(
      'موقع الزبون على خرائط Google',
      `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`,
      'map'
    );
  }

  const directMap = order.mapUrl || order.locationUrl || order.cu?.mapUrl || order.cu?.locationUrl;
  if (typeof directMap === 'string' && /^https?:\/\//i.test(directMap.trim())) {
    addLink('رابط الموقع المرفق', directMap.trim(), 'map');
  }

  const textPool = [
    order.address,
    order.cu?.address,
    order.notes,
    order.cu?.nt,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ');

  const urlMatches = textPool.match(/https?:\/\/[^\s]+/gi) || [];
  urlMatches.forEach((rawUrl, idx) => {
    const cleanUrl = rawUrl.replace(/[),.;]+$/, '');
    const isMap = /maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(cleanUrl);
    addLink(
      isMap ? 'رابط خرائط Google' : `رابط مرفق #${idx + 1}`,
      cleanUrl,
      isMap ? 'map' : 'web'
    );
  });

  return links;
}

export const OrdersPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const {
    rest,
    terms,
    currency,
    allOrders,
    filteredOrders,
    newOrdersCount,
    orderFilter,
    setOrderFilter,
    handleUpdateOrderStatus,
    handleDeleteOrder,
    handleCompleteAllOrders,
    showToast,
  } = useDashboard();

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusPickerOrderId, setStatusPickerOrderId] = useState<string | null>(null);
  const selectedOrder = selectedOrderId
    ? allOrders.find((o) => o.id === selectedOrderId) || null
    : null;
  const statusPickerOrder = statusPickerOrderId
    ? allOrders.find((o) => o.id === statusPickerOrderId) || null
    : null;

  const completedOrdersCount = allOrders.filter(
    (o) => o.st === 'completed' || o.status === 'completed'
  ).length;
  const incompleteOrdersCount = allOrders.filter((o) => {
    const st = String(o.st || o.status || 'new');
    return st !== 'completed' && st !== 'cancelled';
  }).length;

  const statusOptions = getOrderStatusOptions();

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <motion.div
        className="mp-orders-toolbar"
        {...dashSectionMotion(prefersReducedMotion, 0)}
      >
        <div className="mp-orders-tabs" role="tablist" aria-label="تصفية الطلبات">
          <button
            type="button"
            role="tab"
            aria-selected={orderFilter === 'all'}
            className={`mp-orders-tab ${orderFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setOrderFilter('all')}
          >
            <span>الكل</span>
            <span className="mp-orders-tab-count tabular-nums">({allOrders.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={orderFilter === 'new'}
            className={`mp-orders-tab ${orderFilter === 'new' ? 'is-active' : ''}`}
            onClick={() => setOrderFilter('new')}
          >
            <span>جديد</span>
            <span className="mp-orders-tab-count tabular-nums">({newOrdersCount})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={orderFilter === 'completed'}
            className={`mp-orders-tab ${orderFilter === 'completed' ? 'is-active' : ''}`}
            onClick={() => setOrderFilter('completed')}
          >
            <span>مكتمل</span>
            <span className="mp-orders-tab-count tabular-nums">({completedOrdersCount})</span>
          </button>
        </div>
        {incompleteOrdersCount > 0 && (
          <button
            type="button"
            className="btn p"
            onClick={() => void handleCompleteAllOrders()}
            style={{
              height: '38px',
              borderRadius: '10px',
              padding: '0 14px',
              fontSize: '12.5px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              flexShrink: 0,
            }}
          >
            <CheckCheck size={15} />
            <span>أكمل كل الطلبات ({incompleteOrdersCount})</span>
          </button>
        )}
      </motion.div>

      {filteredOrders.length === 0 ? (
        <div style={{ ...surfaceCardStyle, padding: '40px 20px', textAlign: 'center', borderRadius: '18px' }}>
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>📦</div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px', color: 'var(--ink)' }}>
            لا توجد طلبات في هذا التصنيف حالياً
          </h3>
          <p style={{ fontSize: '13.5px', margin: 0, color: 'var(--muted)' }}>
            {terms.isStore
              ? 'عندما يقوم الزبائن بالطلب عبر المتجر ستظهر طلباتهم هنا فوراً.'
              : 'عندما يقوم الزبائن بالطلب عبر المنيو ستظهر طلباتهم هنا فوراً.'}
          </p>
        </div>
      ) : (
        <div className="mp-orders-list">
          {filteredOrders.map((order, idx) => {
            const ordName = order.name || order.cu?.n || '';
            const ordPhone = order.phone || order.cu?.ph || '';
            const typeInfo = getOrderTypeInfo(order, terms.isStore);
            const TypeIcon = typeInfo.Icon;
            const statusInfo = getOrderStatusInfo(order);
            const displayOrderNum = getOrderDisplayNumber(order);
            const dateTimeLabel = formatOrderDayAndTime(order);
            const totalAmount = formatNumber(order.tot || order.total || 0);

            return (
              <motion.div
                key={order.id}
                className="mp-order-row"
                {...dashRowMotion(prefersReducedMotion, idx, true)}
              >
                <div className="mp-order-top-line">
                  <div className="mp-order-meta-group">
                    <span className="mp-order-num tabular-nums">
                      {displayOrderNum}
                    </span>

                    <span className="mp-order-type-chip">
                      <TypeIcon size={12} style={{ color: 'var(--brand-ink, #34D399)', flexShrink: 0 }} />
                      <span>{typeInfo.label}</span>
                    </span>
                  </div>

                  <div className="mp-order-end-group">
                    <span className="mp-order-price tabular-nums">
                      {totalAmount} {currency}
                    </span>

                    <button
                      type="button"
                      className="mp-order-status-btn"
                      onClick={() => setStatusPickerOrderId(order.id)}
                      aria-label={`تغيير حالة الطلب ${displayOrderNum}`}
                      title="تغيير حالة الطلب"
                      style={{
                        background: statusInfo.bg,
                        borderColor: statusInfo.bg,
                        color: '#ffffff',
                      }}
                    >
                      <span>{statusInfo.text}</span>
                      <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.9 }} aria-hidden="true" />
                    </button>

                    {ordPhone && (
                      <a
                        href={waLink(
                          ordPhone,
                          `مرحباً ${ordName}، بخصوص طلبك ${displayOrderNum} من ${rest.n}:`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mp-order-icon-btn is-wa"
                        title="مراسلة الزبون عبر واتساب"
                        aria-label={`مراسلة الزبون عبر واتساب للطلب ${displayOrderNum}`}
                      >
                        <MessageCircle size={15} />
                      </a>
                    )}

                    <button
                      type="button"
                      className="mp-order-icon-btn"
                      onClick={() => setSelectedOrderId(order.id)}
                      title="تفاصيل الطلب"
                      aria-label={`تفاصيل الطلب ${displayOrderNum}`}
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

                  <span className="mp-order-customer-mini">
                    {ordName || 'زبون'}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {selectedOrder && (() => {
        const ordName = selectedOrder.name || selectedOrder.cu?.n || '';
        const ordPhone = selectedOrder.phone || selectedOrder.cu?.ph || '';
        const ordAddr = selectedOrder.address || selectedOrder.cu?.address || '';
        const ordNotes = selectedOrder.notes || selectedOrder.cu?.nt || '';
        const ordArea = selectedOrder.cu?.area || selectedOrder.area || '';
        const ordCity = selectedOrder.cu?.city || selectedOrder.city || '';
        const ordTable = selectedOrder.table || selectedOrder.cu?.table || '';
        const deliveryFee = Number(selectedOrder.cu?.deliveryFee ?? selectedOrder.deliveryFee ?? 0);
        const typeInfo = getOrderTypeInfo(selectedOrder, terms.isStore);
        const TypeIcon = typeInfo.Icon;
        const statusInfo = getOrderStatusInfo(selectedOrder);
        const displayOrderNum = getOrderDisplayNumber(selectedOrder);
        const dateTimeLabel = formatOrderDayAndTime(selectedOrder);
        const orderLinks = extractOrderLinks(selectedOrder, rest.n);

        const modalContent = (
          <div
            className="mp-order-modal-overlay"
            dir="rtl"
            onClick={() => setSelectedOrderId(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`تفاصيل الطلب ${displayOrderNum}`}
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
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
                    {`تفاصيل الطلب ${displayOrderNum}`}
                  </h3>
                  <span
                    className="mp-order-status-dot"
                    style={{ background: statusInfo.bg }}
                  >
                    {statusInfo.text}
                  </span>
                  <span className="mp-order-type-chip">
                    <TypeIcon size={13} style={{ color: 'var(--brand-ink, #34D399)' }} />
                    <span>{typeInfo.label}</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedOrderId(null)}
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
                {/* Customer & Order Info */}
                <div className="mp-order-modal-section">
                  <h4 className="mp-order-modal-section-title">
                    <User size={14} />
                    <span>معلومات الطلب والزبون</span>
                  </h4>

                  <div className="mp-order-info-grid">
                    <div className="mp-order-info-item">
                      <span className="mp-order-info-label">تاريخ ووقت الطلب</span>
                      <span className="mp-order-info-val tabular-nums">{dateTimeLabel}</span>
                    </div>

                    <div className="mp-order-info-item">
                      <span className="mp-order-info-label">نوع الطلب</span>
                      <span className="mp-order-info-val">{typeInfo.label}</span>
                    </div>

                    {ordName && (
                      <div className="mp-order-info-item">
                        <span className="mp-order-info-label">اسم الزبون</span>
                        <span className="mp-order-info-val">{ordName}</span>
                      </div>
                    )}

                    {ordPhone && (
                      <div className="mp-order-info-item">
                        <span className="mp-order-info-label">رقم الهاتف</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <a
                            href={`tel:${ordPhone}`}
                            dir="ltr"
                            className="mp-order-info-val tabular-nums"
                            style={{ color: 'var(--brand-ink, #34D399)', textDecoration: 'none' }}
                          >
                            {ordPhone}
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              void copyTextReliable(ordPhone).then((ok) => {
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

                    {(ordArea || ordCity) && (
                      <div className="mp-order-info-item">
                        <span className="mp-order-info-label">المنطقة / المدينة</span>
                        <span className="mp-order-info-val">
                          {[ordArea, ordCity].filter(Boolean).join(' — ')}
                        </span>
                      </div>
                    )}

                    {ordTable && (
                      <div className="mp-order-info-item">
                        <span className="mp-order-info-label">
                          {terms.isStore ? 'رقم المعرض / الفاتورة' : 'رقم الطاولة'}
                        </span>
                        <span className="mp-order-info-val">{ordTable}</span>
                      </div>
                    )}

                    {selectedOrder.scheduledSlot && (
                      <div className="mp-order-info-item">
                        <span className="mp-order-info-label">الوقت المحدد</span>
                        <span className="mp-order-info-val">{selectedOrder.scheduledSlot}</span>
                      </div>
                    )}

                    {typeof selectedOrder.needCutlery === 'boolean' && (
                      <div className="mp-order-info-item">
                        <span className="mp-order-info-label">
                          {terms.isStore ? 'تغليف هدية / فاتورة' : 'أدوات الطعام'}
                        </span>
                        <span className="mp-order-info-val">
                          {selectedOrder.needCutlery ? 'نعم (مطلوبة)' : 'لا حاجة'}
                        </span>
                      </div>
                    )}

                    {ordAddr && (
                      <div className="mp-order-info-item" style={{ gridColumn: '1 / -1' }}>
                        <span className="mp-order-info-label">العنوان</span>
                        <span className="mp-order-info-val">{ordAddr}</span>
                      </div>
                    )}

                    {ordNotes && (
                      <div className="mp-order-info-item" style={{ gridColumn: '1 / -1' }}>
                        <span className="mp-order-info-label">ملاحظات الزبون</span>
                        <span className="mp-order-info-val">{ordNotes}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Direct Links */}
                {(orderLinks.length > 0 || ordPhone) && (
                  <div className="mp-order-modal-section">
                    <h4 className="mp-order-modal-section-title">
                      <Link2 size={14} />
                      <span>الروابط والتواصل المباشر</span>
                    </h4>

                    <div className="mp-order-links-list">
                      {orderLinks.map((lk, idx) => (
                        <a
                          key={idx}
                          href={lk.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mp-order-link-pill"
                          style={
                            lk.kind === 'whatsapp'
                              ? {
                                  background: '#25D366',
                                  borderColor: '#25D366',
                                  color: '#ffffff',
                                }
                              : undefined
                          }
                        >
                          {lk.kind === 'whatsapp' ? (
                            <MessageCircle size={14} />
                          ) : lk.kind === 'map' ? (
                            <MapPin size={14} />
                          ) : (
                            <ExternalLink size={14} />
                          )}
                          <span>{lk.label}</span>
                        </a>
                      ))}

                      {ordPhone && (
                        <a href={`tel:${ordPhone}`} className="mp-order-link-pill">
                          <Phone size={14} />
                          <span>اتصال هاتفي بالزبون</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Order Items & Invoice Breakdown */}
                <div className="mp-order-modal-section">
                  <h4 className="mp-order-modal-section-title">
                    <FileText size={14} />
                    <span>تفاصيل الطلب والفاتورة</span>
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(selectedOrder.items || []).map((it, idx) => {
                      const extrasList = Array.isArray(it.extras)
                        ? it.extras
                            .map((ex: any) => (typeof ex === 'string' ? ex : ex?.n || ''))
                            .filter(Boolean)
                        : [];
                      const choicesList = Array.isArray(it.choices) ? it.choices.filter(Boolean) : [];
                      const detailsParts = [it.size, ...choicesList, ...extrasList].filter(Boolean);

                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '10px',
                            paddingBottom: '8px',
                            borderBottom: '1px solid color-mix(in srgb, var(--line) 45%, transparent)',
                            fontSize: '13px',
                            color: 'var(--ink)',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 700 }}>
                              {it.n} <span style={{ color: 'var(--muted)' }}>× {it.q}</span>
                            </div>
                            {detailsParts.length > 0 && (
                              <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
                                {detailsParts.join(' • ')}
                              </div>
                            )}
                            {it.notes && (
                              <div style={{ fontSize: '11.5px', color: 'var(--brand-ink, #34D399)', marginTop: '2px' }}>
                                ملاحظة: {it.notes}
                              </div>
                            )}
                          </div>
                          <span className="tabular-nums" style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                            {formatNumber((it.pr || it.p || 0) * it.q)} {currency}
                          </span>
                        </div>
                      );
                    })}

                    {deliveryFee > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--muted)' }}>
                        <span>رسوم التوصيل</span>
                        <span className="tabular-nums">{formatNumber(deliveryFee)} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.serviceFee || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--muted)' }}>
                        <span>رسوم التغليف والخدمة</span>
                        <span className="tabular-nums">{formatNumber(selectedOrder.serviceFee)} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.tipAmount || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--muted)' }}>
                        <span>إكرامية</span>
                        <span className="tabular-nums">{formatNumber(selectedOrder.tipAmount)} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.itemsDiscountTotal || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#10b981' }}>
                        <span>خصم على الأطباق {selectedOrder.menuDiscountLabel ? `(${selectedOrder.menuDiscountLabel})` : ''}</span>
                        <span className="tabular-nums">-{formatNumber(Number(selectedOrder.itemsDiscountTotal || 0))} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.discount || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#10b981' }}>
                        <span>خصم على الطلب {selectedOrder.couponCode ? `(${selectedOrder.couponCode})` : ''}</span>
                        <span className="tabular-nums">-{formatNumber(Number(selectedOrder.discount || 0))} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.firstOrderDiscount || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#10b981' }}>
                        <span>خصم على الطلب (الطلب الأول)</span>
                        <span className="tabular-nums">-{formatNumber(Number(selectedOrder.firstOrderDiscount || 0))} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.spinDiscount || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#10b981' }}>
                        <span>خصم على الطلب {selectedOrder.spinRewardLabel ? `(${selectedOrder.spinRewardLabel})` : '(عجلة الحظ)'}</span>
                        <span className="tabular-nums">-{formatNumber(Number(selectedOrder.spinDiscount || 0))} {currency}</span>
                      </div>
                    )}

                    {Number(selectedOrder.pickupDiscount || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#10b981' }}>
                        <span>خصم على الطلب ({selectedOrder.pickupDiscountLabel || 'الاستلام الفوري'})</span>
                        <span className="tabular-nums">-{formatNumber(Number(selectedOrder.pickupDiscount || 0))} {currency}</span>
                      </div>
                    )}

                    {selectedOrder.freeGiftName && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--brand-ink, #34D399)', fontWeight: 700 }}>
                        <span>هدية مجانية</span>
                        <span>{selectedOrder.freeGiftName}</span>
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: '8px',
                        marginTop: '2px',
                        borderTop: '1px solid var(--line)',
                        fontSize: '15px',
                        fontWeight: 900,
                        color: 'var(--ink)',
                      }}
                    >
                      <span>الإجمالي النهائي</span>
                      <span className="tabular-nums" style={{ color: 'var(--brand-ink, #34D399)' }}>
                        {formatNumber(selectedOrder.tot || selectedOrder.total || 0)} {currency}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Actions */}
                <div className="mp-order-modal-section">
                  <h4 className="mp-order-modal-section-title">
                    <Check size={14} />
                    <span>تغيير حالة الطلب</span>
                  </h4>
                  <div className="mp-order-status-pills-grid">
                    {statusOptions.map((opt) => {
                      const active = statusInfo.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleUpdateOrderStatus(selectedOrder.id, opt.value)}
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
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteOrder(selectedOrder.id, () => {
                          setSelectedOrderId(null);
                          setStatusPickerOrderId(null);
                        })
                      }
                      className="mp-order-modal-status-btn"
                      style={{
                        borderColor: 'rgba(239, 68, 68, 0.4)',
                        background: 'rgba(239, 68, 68, 0.08)',
                        color: '#ef4444',
                      }}
                    >
                      <Trash2 size={13} strokeWidth={2.3} />
                      <span>حذف الطلب نهائياً</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        );

        return typeof document !== 'undefined'
          ? createPortal(modalContent, document.body)
          : modalContent;
      })()}

      {statusPickerOrder && (() => {
        const currentStatus = getOrderStatusInfo(statusPickerOrder);
        const displayNum = getOrderDisplayNumber(statusPickerOrder);
        const pickerModal = (
          <div
            className="mp-order-modal-overlay"
            dir="rtl"
            onClick={() => setStatusPickerOrderId(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`تغيير حالة الطلب ${displayNum}`}
              className="mp-status-picker-card"
              onClick={(e) => e.stopPropagation()}
              {...dashModalMotion(prefersReducedMotion)}
              style={surfaceCardStyle}
            >
              <div className="mp-status-picker-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <h4 className="mp-status-picker-title tabular-nums">
                    {`حالة الطلب ${displayNum}`}
                  </h4>
                  <span
                    className="mp-order-status-dot"
                    style={{ background: currentStatus.bg }}
                  >
                    {currentStatus.text}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusPickerOrderId(null)}
                  aria-label="إغلاق"
                  className="mp-status-picker-close"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="mp-status-picker-list">
                {statusOptions.map((opt) => {
                  const isActive = currentStatus.value === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        handleUpdateOrderStatus(statusPickerOrder.id, opt.value);
                        setStatusPickerOrderId(null);
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
                <button
                  type="button"
                  onClick={() => {
                    const targetId = statusPickerOrder.id;
                    setStatusPickerOrderId(null);
                    handleDeleteOrder(targetId, () => {
                      if (selectedOrderId === targetId) setSelectedOrderId(null);
                    });
                  }}
                  className="mp-status-picker-option"
                  style={{
                    borderColor: 'rgba(239, 68, 68, 0.42)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    marginTop: '4px',
                  }}
                >
                  <span className="mp-status-picker-opt-main">
                    <Trash2 size={14} strokeWidth={2.3} aria-hidden="true" />
                    <span>حذف الطلب نهائياً</span>
                  </span>
                </button>
              </div>
            </motion.div>
          </div>
        );

        return typeof document !== 'undefined'
          ? createPortal(pickerModal, document.body)
          : pickerModal;
      })()}
    </div>
  );
};
