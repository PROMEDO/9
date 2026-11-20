/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Layers,
  Lightbulb,
  Lock,
  Package,
  Receipt,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  Truck,
  Utensils,
  Wallet,
} from 'lucide-react';
import { Order } from '../../types';
import { formatNumber } from '../../utils/storage';
import { surfaceCardStyle, useDashboard } from './DashboardContext';
import {
  DASH_EASE,
  dashCardMotion,
  dashSectionMotion,
  dashSubTabMotion,
} from '../../utils/dashboardMotion';

type StatsPeriod = 'day' | 'week' | 'month' | 'all';
type ChartMetric = 'orders' | 'sales';

const AR_LOCALE = 'ar-IQ-u-nu-latn';

function getOrderTimestampMs(o: Order): number | null {
  const rawAt = Number(o.at);
  if (Number.isFinite(rawAt) && rawAt > 0) {
    return rawAt < 1e12 ? rawAt * 1000 : rawAt;
  }
  if (o.createdAt) {
    const parsed = Date.parse(String(o.createdAt));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toYm(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const dt = parseYmdLocal(ymd);
  dt.setDate(dt.getDate() + deltaDays);
  return toYmd(dt);
}

function shiftYm(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y || new Date().getFullYear(), (m || 1) - 1 + deltaMonths, 1);
  return toYm(dt);
}

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

function endOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

function formatArabicDay(ymd: string, todayYmd: string): string {
  const yesterdayYmd = shiftYmd(todayYmd, -1);
  const dt = parseYmdLocal(ymd);
  const formatted = new Intl.DateTimeFormat(AR_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(dt);
  if (ymd === todayYmd) return `اليوم • ${formatted}`;
  if (ymd === yesterdayYmd) return `أمس • ${formatted}`;
  return formatted;
}

function formatArabicMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y || new Date().getFullYear(), (m || 1) - 1, 1);
  return new Intl.DateTimeFormat(AR_LOCALE, {
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

function formatShortDayMonth(d: Date): string {
  return new Intl.DateTimeFormat(AR_LOCALE, {
    day: 'numeric',
    month: 'short',
  }).format(d);
}

export const StatsPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const {
    resolvedPlan,
    terms,
    currency,
    allCategories,
    allItems,
    allOrders,
    openUpgradeModal,
  } = useDashboard();

  const now = new Date();
  const todayYmd = toYmd(now);
  const yesterdayYmd = shiftYmd(todayYmd, -1);
  const currentYm = toYm(now);
  const prevYm = shiftYm(currentYm, -1);

  const [period, setPeriod] = useState<StatsPeriod>('day');
  const [selectedDay, setSelectedDay] = useState<string>(todayYmd);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYm);
  const [allScope, setAllScope] = useState<'all_time' | number>('all_time');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('orders');
  const [selectedBarIdx, setSelectedBarIdx] = useState<number | null>(null);
  const [showAllItems, setShowAllItems] = useState<boolean>(false);
  const [salesFilterCat, setSalesFilterCat] = useState<string>('__all__');
  const [salesFilterItem, setSalesFilterItem] = useState<string>('__all__');
  const [showAllCatalogRows, setShowAllCatalogRows] = useState<boolean>(false);

  useEffect(() => {
    setSelectedBarIdx(null);
  }, [period, selectedDay, weekOffset, selectedMonth, allScope, chartMetric]);

  const availableYears = useMemo(() => {
    const years = new Set<number>([now.getFullYear()]);
    allOrders.forEach((o) => {
      const ms = getOrderTimestampMs(o);
      if (ms) years.add(new Date(ms).getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allOrders, now]);

  const {
    currentRange,
    previousRange,
    rangeLabel,
    compareLabel,
  } = useMemo(() => {
    if (period === 'day') {
      const dayDt = parseYmdLocal(selectedDay);
      const prevDt = parseYmdLocal(shiftYmd(selectedDay, -1));
      return {
        currentRange: { start: startOfDayMs(dayDt), end: endOfDayMs(dayDt) },
        previousRange: { start: startOfDayMs(prevDt), end: endOfDayMs(prevDt) },
        rangeLabel: formatArabicDay(selectedDay, todayYmd),
        compareLabel: selectedDay === todayYmd ? 'عن أمس' : 'عن اليوم السابق',
      };
    }

    if (period === 'week') {
      const endDt = parseYmdLocal(shiftYmd(todayYmd, -weekOffset * 7));
      const startDt = new Date(endDt.getFullYear(), endDt.getMonth(), endDt.getDate() - 6);
      const prevEndDt = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate() - 1);
      const prevStartDt = new Date(prevEndDt.getFullYear(), prevEndDt.getMonth(), prevEndDt.getDate() - 6);
      const txt = `${formatShortDayMonth(startDt)} – ${formatShortDayMonth(endDt)}`;
      return {
        currentRange: { start: startOfDayMs(startDt), end: endOfDayMs(endDt) },
        previousRange: { start: startOfDayMs(prevStartDt), end: endOfDayMs(prevEndDt) },
        rangeLabel: weekOffset === 0 ? `آخر 7 أيام (${txt})` : txt,
        compareLabel: 'عن الأسبوع السابق',
      };
    }

    if (period === 'month') {
      const [yStr, mStr] = selectedMonth.split('-').map(Number);
      const y = yStr || now.getFullYear();
      const mIdx = (mStr || 1) - 1;
      const startDt = new Date(y, mIdx, 1);
      const endDt = new Date(y, mIdx + 1, 0);
      const prevStartDt = new Date(y, mIdx - 1, 1);
      const prevEndDt = new Date(y, mIdx, 0);
      return {
        currentRange: { start: startOfDayMs(startDt), end: endOfDayMs(endDt) },
        previousRange: { start: startOfDayMs(prevStartDt), end: endOfDayMs(prevEndDt) },
        rangeLabel: formatArabicMonth(selectedMonth),
        compareLabel: 'عن الشهر السابق',
      };
    }

    if (allScope === 'all_time') {
      return {
        currentRange: { start: 0, end: Number.MAX_SAFE_INTEGER },
        previousRange: null,
        rangeLabel: 'كل الأوقات',
        compareLabel: '',
      };
    }

    const yr = allScope;
    const startDt = new Date(yr, 0, 1);
    const endDt = new Date(yr, 11, 31);
    const prevStartDt = new Date(yr - 1, 0, 1);
    const prevEndDt = new Date(yr - 1, 11, 31);
    return {
      currentRange: { start: startOfDayMs(startDt), end: endOfDayMs(endDt) },
      previousRange: { start: startOfDayMs(prevStartDt), end: endOfDayMs(prevEndDt) },
      rangeLabel: `سنة ${yr}`,
      compareLabel: `عن سنة ${yr - 1}`,
    };
  }, [period, selectedDay, todayYmd, weekOffset, selectedMonth, allScope, now]);

  const filteredOrders = useMemo(() => {
    return allOrders.filter((o) => {
      const ms = getOrderTimestampMs(o);
      if (ms === null) return period === 'all' && allScope === 'all_time';
      return ms >= currentRange.start && ms <= currentRange.end;
    });
  }, [allOrders, currentRange, period, allScope]);

  const prevValidOrders = useMemo(() => {
    if (!previousRange) return [];
    return allOrders.filter((o) => {
      if (o.st === 'cancelled' || o.status === 'cancelled') return false;
      const ms = getOrderTimestampMs(o);
      return ms !== null && ms >= previousRange.start && ms <= previousRange.end;
    });
  }, [allOrders, previousRange]);

  const validOrders = useMemo(
    () => filteredOrders.filter((o) => o.st !== 'cancelled' && o.status !== 'cancelled'),
    [filteredOrders]
  );

  const totalSales = useMemo(
    () => validOrders.reduce((sum, o) => sum + (Number(o.tot ?? o.total ?? 0) || 0), 0),
    [validOrders]
  );

  const prevSales = useMemo(
    () => prevValidOrders.reduce((sum, o) => sum + (Number(o.tot ?? o.total ?? 0) || 0), 0),
    [prevValidOrders]
  );

  const salesDeltaPct = useMemo(() => {
    if (!previousRange) return null;
    if (prevSales <= 0) return totalSales > 0 ? 100 : 0;
    return Math.round(((totalSales - prevSales) / prevSales) * 100);
  }, [previousRange, prevSales, totalSales]);

  const completedOrders = filteredOrders.filter((o) => o.st === 'completed' || o.status === 'completed').length;
  const cancelledOrders = filteredOrders.filter((o) => o.st === 'cancelled' || o.status === 'cancelled').length;
  const avgOrder = validOrders.length > 0 ? Math.round(totalSales / validOrders.length) : 0;
  const completionRate = filteredOrders.length > 0 ? Math.round((completedOrders / filteredOrders.length) * 100) : 0;

  const deliveryCount = validOrders.filter((o) => (o.type || o.cu?.orderType || 'delivery') === 'delivery').length;
  const pickupCount = validOrders.filter((o) => (o.type || o.cu?.orderType) === 'pickup').length;
  const tableCount = validOrders.filter((o) => (o.type || o.cu?.orderType) === 'table').length;

  const topChannel = useMemo(() => {
    if (validOrders.length === 0) return { label: '—', count: 0, Icon: Truck };
    if (deliveryCount >= pickupCount && deliveryCount >= tableCount) {
      return { label: 'توصيل', count: deliveryCount, Icon: Truck };
    }
    if (pickupCount >= tableCount) {
      return { label: terms.pickupLabel, count: pickupCount, Icon: Store };
    }
    return {
      label: terms.isStore ? 'داخل المعرض' : 'طاولات',
      count: tableCount,
      Icon: terms.isStore ? Store : Utensils,
    };
  }, [validOrders.length, deliveryCount, pickupCount, tableCount, terms.pickupLabel, terms.isStore]);

  // Activity Chart Buckets
  const chartBuckets = useMemo(() => {
    interface Bucket {
      key: string;
      label: string;
      fullLabel: string;
      orders: number;
      sales: number;
    }

    if (period === 'day') {
      const slots: Bucket[] = [
        { key: 'night', label: 'فجراً', fullLabel: 'فجراً (12ص – 6ص)', orders: 0, sales: 0 },
        { key: 'morning', label: 'صباحاً', fullLabel: 'صباحاً (6ص – 12م)', orders: 0, sales: 0 },
        { key: 'afternoon', label: 'ظهراً', fullLabel: 'ظهراً (12م – 6م)', orders: 0, sales: 0 },
        { key: 'evening', label: 'مساءً', fullLabel: 'مساءً (6م – 12ص)', orders: 0, sales: 0 },
      ];
      validOrders.forEach((o) => {
        const ms = getOrderTimestampMs(o);
        if (ms === null) return;
        const hr = new Date(ms).getHours();
        const idx = hr < 6 ? 0 : hr < 12 ? 1 : hr < 18 ? 2 : 3;
        slots[idx].orders += 1;
        slots[idx].sales += Number(o.tot ?? o.total ?? 0) || 0;
      });
      return slots;
    }

    if (period === 'week') {
      const endDt = parseYmdLocal(shiftYmd(todayYmd, -weekOffset * 7));
      const days: Bucket[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(endDt.getFullYear(), endDt.getMonth(), endDt.getDate() - i);
        const ymd = toYmd(d);
        const shortName = new Intl.DateTimeFormat(AR_LOCALE, { weekday: 'short' }).format(d);
        const fullName = new Intl.DateTimeFormat(AR_LOCALE, { weekday: 'long', day: 'numeric', month: 'short' }).format(d);
        days.push({ key: ymd, label: shortName, fullLabel: fullName, orders: 0, sales: 0 });
      }
      const byYmd = new Map(days.map((b) => [b.key, b]));
      validOrders.forEach((o) => {
        const ms = getOrderTimestampMs(o);
        if (ms === null) return;
        const b = byYmd.get(toYmd(new Date(ms)));
        if (b) {
          b.orders += 1;
          b.sales += Number(o.tot ?? o.total ?? 0) || 0;
        }
      });
      return days;
    }

    if (period === 'month') {
      const [yStr, mStr] = selectedMonth.split('-').map(Number);
      const y = yStr || now.getFullYear();
      const mIdx = (mStr || 1) - 1;
      const daysInMonth = new Date(y, mIdx + 1, 0).getDate();
      const weeks: Bucket[] = [
        { key: 'w1', label: 'أسبوع 1', fullLabel: 'الأيام 1 – 7', orders: 0, sales: 0 },
        { key: 'w2', label: 'أسبوع 2', fullLabel: 'الأيام 8 – 14', orders: 0, sales: 0 },
        { key: 'w3', label: 'أسبوع 3', fullLabel: 'الأيام 15 – 21', orders: 0, sales: 0 },
        { key: 'w4', label: 'أسبوع 4', fullLabel: `الأيام 22 – ${daysInMonth}`, orders: 0, sales: 0 },
      ];
      validOrders.forEach((o) => {
        const ms = getOrderTimestampMs(o);
        if (ms === null) return;
        const day = new Date(ms).getDate();
        const idx = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3;
        weeks[idx].orders += 1;
        weeks[idx].sales += Number(o.tot ?? o.total ?? 0) || 0;
      });
      return weeks;
    }

    const months: Bucket[] = Array.from({ length: 12 }, (_, mIdx) => {
      const dt = new Date(2026, mIdx, 1);
      const name = new Intl.DateTimeFormat(AR_LOCALE, { month: 'short' }).format(dt);
      const full = new Intl.DateTimeFormat(AR_LOCALE, { month: 'long' }).format(dt);
      return { key: String(mIdx), label: name, fullLabel: full, orders: 0, sales: 0 };
    });
    validOrders.forEach((o) => {
      const ms = getOrderTimestampMs(o);
      if (ms === null) return;
      const mIdx = new Date(ms).getMonth();
      if (months[mIdx]) {
        months[mIdx].orders += 1;
        months[mIdx].sales += Number(o.tot ?? o.total ?? 0) || 0;
      }
    });
    return months;
  }, [period, validOrders, todayYmd, weekOffset, selectedMonth, now]);

  const maxChartVal = useMemo(() => {
    const vals = chartBuckets.map((b) => (chartMetric === 'orders' ? b.orders : b.sales));
    return Math.max(1, ...vals);
  }, [chartBuckets, chartMetric]);

  const activeBar = useMemo(() => {
    if (selectedBarIdx !== null && chartBuckets[selectedBarIdx]) {
      return chartBuckets[selectedBarIdx];
    }
    let best = chartBuckets[0];
    chartBuckets.forEach((b) => {
      const v = chartMetric === 'orders' ? b.orders : b.sales;
      const bestV = chartMetric === 'orders' ? best.orders : best.sales;
      if (v > bestV) best = b;
    });
    return best;
  }, [selectedBarIdx, chartBuckets, chartMetric]);

  // Top Ordered Items
  const topOrderedItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    validOrders.forEach((order) => {
      (order.items || []).forEach((it) => {
        const name = String(it.n || it.name || '').trim();
        if (!name) return;
        const qty = Math.max(1, Number(it.q ?? it.qty ?? 1) || 1);
        const unitPrice = Number(it.p ?? it.price ?? 0) || 0;
        const entry = map.get(name) || { name, qty: 0, revenue: 0 };
        entry.qty += qty;
        entry.revenue += unitPrice * qty;
        map.set(name, entry);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [validOrders]);

  const visibleTopItems = showAllItems ? topOrderedItems.slice(0, 12) : topOrderedItems.slice(0, 5);
  const maxItemQty = topOrderedItems[0]?.qty || 1;

  // Per-Category & Per-Item Sales Breakdown (linked directly to the top date range filter)
  const itemSalesBreakdown = useMemo(() => {
    interface ItemBreakdownRow {
      name: string;
      categoryName: string;
      qty: number;
      revenue: number;
      ordersCount: number;
    }
    interface CategoryBreakdownRow {
      name: string;
      qty: number;
      revenue: number;
      ordersCount: number;
      items: ItemBreakdownRow[];
    }

    const catById = new Map<string, string>();
    allCategories.forEach((c) => {
      const cname = String(c.n || '').trim();
      if (cname) catById.set(c.id, cname);
    });

    const itemCatLookup = new Map<string, string>();
    const catOrderRank = new Map<string, number>();
    const categoriesAgg = new Map<
      string,
      {
        name: string;
        qty: number;
        revenue: number;
        orderIds: Set<string>;
        items: Map<string, { name: string; categoryName: string; qty: number; revenue: number; orderIds: Set<string> }>;
      }
    >();

    const ensureCategory = (catName: string) => {
      const clean = catName.trim() || 'بدون قسم';
      let existing = categoriesAgg.get(clean);
      if (!existing) {
        existing = {
          name: clean,
          qty: 0,
          revenue: 0,
          orderIds: new Set<string>(),
          items: new Map(),
        };
        categoriesAgg.set(clean, existing);
      }
      return existing;
    };

    allCategories.forEach((c, idx) => {
      const clean = String(c.n || '').trim();
      if (clean) {
        catOrderRank.set(clean, idx);
        ensureCategory(clean);
      }
    });

    allItems.forEach((m) => {
      const itemName = String(m.n || '').trim();
      const cname = catById.get(m.cat) || 'بدون قسم';
      if (itemName) {
        itemCatLookup.set(itemName.toLowerCase(), cname);
        const catBucket = ensureCategory(cname);
        if (!catBucket.items.has(itemName)) {
          catBucket.items.set(itemName, {
            name: itemName,
            categoryName: cname,
            qty: 0,
            revenue: 0,
            orderIds: new Set<string>(),
          });
        }
      }
    });

    validOrders.forEach((order, ordIdx) => {
      const ordKey = order.id || `ord_${ordIdx}`;
      (order.items || []).forEach((it) => {
        const name = String(it.n || it.name || '').trim();
        if (!name) return;
        const qty = Math.max(1, Number(it.q ?? it.qty ?? 1) || 1);
        const unitPrice = Number(it.p ?? it.price ?? 0) || 0;
        const lineRevenue = unitPrice * qty;

        const explicitCat = String(it.c || '').trim();
        const mappedCat = itemCatLookup.get(name.toLowerCase()) || explicitCat || 'بدون قسم';
        const catBucket = ensureCategory(mappedCat);
        catBucket.qty += qty;
        catBucket.revenue += lineRevenue;
        catBucket.orderIds.add(ordKey);

        let itemBucket = catBucket.items.get(name);
        if (!itemBucket) {
          itemBucket = {
            name,
            categoryName: catBucket.name,
            qty: 0,
            revenue: 0,
            orderIds: new Set<string>(),
          };
          catBucket.items.set(name, itemBucket);
        }
        itemBucket.qty += qty;
        itemBucket.revenue += lineRevenue;
        itemBucket.orderIds.add(ordKey);
      });
    });

    const categoriesList: CategoryBreakdownRow[] = Array.from(categoriesAgg.values())
      .map((c) => {
        const items = Array.from(c.items.values())
          .map((it) => ({
            name: it.name,
            categoryName: it.categoryName,
            qty: it.qty,
            revenue: it.revenue,
            ordersCount: it.orderIds.size,
          }))
          .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name, 'ar'));
        return {
          name: c.name,
          qty: c.qty,
          revenue: c.revenue,
          ordersCount: c.orderIds.size,
          items,
        };
      })
      .sort((a, b) => {
        if (b.qty !== a.qty) return b.qty - a.qty;
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        const rankA = catOrderRank.get(a.name) ?? 9999;
        const rankB = catOrderRank.get(b.name) ?? 9999;
        return rankA - rankB;
      });

    const allItemsList: ItemBreakdownRow[] = categoriesList
      .flatMap((c) => c.items)
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name, 'ar'));

    const totalQty = categoriesList.reduce((s, c) => s + c.qty, 0);
    const totalRevenue = categoriesList.reduce((s, c) => s + c.revenue, 0);

    return { categoriesList, allItemsList, totalQty, totalRevenue };
  }, [allCategories, allItems, validOrders]);

  const effectiveSalesCat =
    salesFilterCat !== '__all__' && itemSalesBreakdown.categoriesList.some((c) => c.name === salesFilterCat)
      ? salesFilterCat
      : '__all__';

  const activeSalesCategoryObj =
    effectiveSalesCat !== '__all__'
      ? itemSalesBreakdown.categoriesList.find((c) => c.name === effectiveSalesCat) || null
      : null;

  const selectableItemsInScope = activeSalesCategoryObj
    ? activeSalesCategoryObj.items
    : itemSalesBreakdown.allItemsList;

  const effectiveSalesItem =
    salesFilterItem !== '__all__' && selectableItemsInScope.some((it) => it.name === salesFilterItem)
      ? salesFilterItem
      : '__all__';

  const activeSalesItemObj =
    effectiveSalesItem !== '__all__'
      ? selectableItemsInScope.find((it) => it.name === effectiveSalesItem) || null
      : null;

  // Simple Everyday Summary Lines
  const quickTakeaways = useMemo(() => {
    const lines: string[] = [];
    if (validOrders.length === 0) {
      lines.push('لا توجد طلبات في هذه الفترة بعد — جرب اختيار شهر آخر أو «كل الأوقات».');
      return lines;
    }
    if (topOrderedItems[0]) {
      lines.push(
        `الأكثر طلباً: «${topOrderedItems[0].name}» انطلب ${topOrderedItems[0].qty} مرة بمبيعات ${formatNumber(topOrderedItems[0].revenue)} ${currency}.`
      );
    }
    lines.push(
      `أغلب الزبائن يطلبون عبر ${topChannel.label} (${topChannel.count} من ${validOrders.length} طلب).`
    );
    if (cancelledOrders === 0 && filteredOrders.length > 0) {
      lines.push('ممتاز! لم يتم إلغاء أي طلب في هذه الفترة.');
    } else if (cancelledOrders > 0) {
      lines.push(`تم إكمال ${completedOrders} طلب وإلغاء ${cancelledOrders} في هذه الفترة.`);
    }
    return lines;
  }, [
    validOrders.length,
    topOrderedItems,
    currency,
    topChannel,
    cancelledOrders,
    filteredOrders.length,
    completedOrders,
  ]);

  const channelRows = useMemo(() => {
    const total = Math.max(1, validOrders.length);
    const list = [
      { id: 'delivery', label: 'توصيل', count: deliveryCount, color: '#10b981', Icon: Truck },
      { id: 'pickup', label: terms.pickupLabel, count: pickupCount, color: '#3b82f6', Icon: Store },
    ];
    if ((!terms.isStore && resolvedPlan.perms.tableOrders) || tableCount > 0) {
      list.push({
        id: 'table',
        label: terms.isStore ? 'داخل المعرض' : 'طاولات',
        count: tableCount,
        color: '#f59e0b',
        Icon: terms.isStore ? Store : Utensils,
      });
    }
    return list.map((row) => ({
      ...row,
      pct: validOrders.length > 0 ? Math.round((row.count / total) * 100) : 0,
    }));
  }, [validOrders.length, deliveryCount, pickupCount, tableCount, terms.pickupLabel, terms.isStore, resolvedPlan.perms.tableOrders]);

  const handleStepDate = (direction: 'prev' | 'next') => {
    const step = direction === 'prev' ? -1 : 1;
    if (period === 'day') {
      const next = shiftYmd(selectedDay, step);
      if (next <= todayYmd) setSelectedDay(next);
    } else if (period === 'week') {
      const next = weekOffset - step;
      if (next >= 0) setWeekOffset(next);
    } else if (period === 'month') {
      const next = shiftYm(selectedMonth, step);
      if (next <= currentYm) setSelectedMonth(next);
    } else {
      if (allScope === 'all_time') {
        setAllScope(availableYears[0] || now.getFullYear());
      } else {
        const idx = availableYears.indexOf(allScope);
        const nextIdx = direction === 'prev' ? idx + 1 : idx - 1;
        if (nextIdx >= 0 && nextIdx < availableYears.length) {
          setAllScope(availableYears[nextIdx]);
        } else if (direction === 'next' && nextIdx < 0) {
          setAllScope('all_time');
        }
      }
    }
  };

  const canGoNext =
    period === 'day'
      ? selectedDay < todayYmd
      : period === 'week'
      ? weekOffset > 0
      : period === 'month'
      ? selectedMonth < currentYm
      : allScope !== 'all_time';

  const activePlanName = resolvedPlan.plan.n;

  return (
    <div className="mp-stats-page">
      {/* Locked State for Free Plan */}
      {!resolvedPlan.perms.analytics ? (
        <div
          style={{
            ...surfaceCardStyle,
            padding: '24px 20px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            border: '1.5px dashed rgba(245, 158, 11, 0.45)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 260px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: 'rgba(245, 158, 11, 0.14)',
                color: '#f59e0b',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Lock size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '16.5px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 4px' }}>
                {`الإحصائيات مقفلة في ${activePlanName}`}
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.55 }}>
                {terms.isStore
                  ? 'قم بترقية باقتك لمتابعة المبيعات اليومية والشهرية والمنتجات الأكثر مبيعاً.'
                  : 'قم بترقية باقتك لمتابعة المبيعات اليومية والشهرية والأصناف الأكثر طلباً.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openUpgradeModal('starter')}
            className="btn p s"
            style={{ fontWeight: 800, padding: '10px 18px' }}
          >
            ترقية الباقة الآن
          </button>
        </div>
      ) : (
        <>
          {/* 1. Ultra-Simple Date & Period Controller */}
          <motion.div
            className="mp-stats-filter-card"
            {...dashSectionMotion(prefersReducedMotion, 0.04)}
          >
            <div className="mp-stats-seg-track" role="tablist" aria-label="الفترة الزمنية">
              {[
                { id: 'day' as const, label: 'اليوم' },
                { id: 'week' as const, label: 'أسبوع' },
                { id: 'month' as const, label: 'شهر' },
                { id: 'all' as const, label: 'الكل' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={period === opt.id}
                  onClick={() => setPeriod(opt.id)}
                  className={`mp-stats-seg-btn ${period === opt.id ? 'active' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="mp-stats-date-nav">
              <button
                type="button"
                className="mp-stats-nav-arrow"
                onClick={() => handleStepDate('prev')}
                aria-label="الفترة السابقة"
                title="الفترة السابقة"
              >
                <ChevronRight size={18} />
              </button>

              <div className="mp-stats-date-center">
                <Calendar size={15} style={{ color: 'var(--brand-ink, #34D399)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rangeLabel}
                </span>

                {period === 'day' && (
                  <input
                    type="date"
                    aria-label="اختر يوماً"
                    value={selectedDay}
                    max={todayYmd}
                    onClick={(e) => {
                      try {
                        (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                      } catch {
                        // ignore on browsers without showPicker
                      }
                    }}
                    onChange={(e) => {
                      if (e.target.value) setSelectedDay(e.target.value);
                    }}
                    className="mp-stats-date-native"
                  />
                )}

                {period === 'month' && (
                  <input
                    type="month"
                    aria-label="اختر شهراً"
                    value={selectedMonth}
                    max={currentYm}
                    onClick={(e) => {
                      try {
                        (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                      } catch {
                        // ignore on browsers without showPicker
                      }
                    }}
                    onChange={(e) => {
                      if (e.target.value) setSelectedMonth(e.target.value);
                    }}
                    className="mp-stats-date-native"
                  />
                )}
              </div>

              <button
                type="button"
                className="mp-stats-nav-arrow"
                disabled={!canGoNext}
                onClick={() => handleStepDate('next')}
                aria-label="الفترة التالية"
                title="الفترة التالية"
              >
                <ChevronLeft size={18} />
              </button>
            </div>

            {/* 1-Tap Quick Shortcuts */}
            <div className="mp-stats-quick-row">
              {period === 'day' && (
                <>
                  <button
                    type="button"
                    className={`mp-stats-quick-chip ${selectedDay === todayYmd ? 'active' : ''}`}
                    onClick={() => setSelectedDay(todayYmd)}
                  >
                    اليوم
                  </button>
                  <button
                    type="button"
                    className={`mp-stats-quick-chip ${selectedDay === yesterdayYmd ? 'active' : ''}`}
                    onClick={() => setSelectedDay(yesterdayYmd)}
                  >
                    أمس
                  </button>
                </>
              )}
              {period === 'week' && (
                <>
                  <button
                    type="button"
                    className={`mp-stats-quick-chip ${weekOffset === 0 ? 'active' : ''}`}
                    onClick={() => setWeekOffset(0)}
                  >
                    آخر 7 أيام
                  </button>
                  <button
                    type="button"
                    className={`mp-stats-quick-chip ${weekOffset === 1 ? 'active' : ''}`}
                    onClick={() => setWeekOffset(1)}
                  >
                    الأسبوع الماضي
                  </button>
                </>
              )}
              {period === 'month' && (
                <>
                  <button
                    type="button"
                    className={`mp-stats-quick-chip ${selectedMonth === currentYm ? 'active' : ''}`}
                    onClick={() => setSelectedMonth(currentYm)}
                  >
                    هذا الشهر
                  </button>
                  <button
                    type="button"
                    className={`mp-stats-quick-chip ${selectedMonth === prevYm ? 'active' : ''}`}
                    onClick={() => setSelectedMonth(prevYm)}
                  >
                    الشهر الماضي
                  </button>
                </>
              )}
              {period === 'all' && (
                <>
                  <button
                    type="button"
                    className={`mp-stats-quick-chip ${allScope === 'all_time' ? 'active' : ''}`}
                    onClick={() => setAllScope('all_time')}
                  >
                    كل الأوقات
                  </button>
                  {availableYears.slice(0, 3).map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      className={`mp-stats-quick-chip ${allScope === yr ? 'active' : ''}`}
                      onClick={() => setAllScope(yr)}
                    >
                      سنة {yr}
                    </button>
                  ))}
                </>
              )}
            </div>
          </motion.div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${period}-${selectedDay}-${weekOffset}-${selectedMonth}-${allScope}`}
              {...dashSubTabMotion(prefersReducedMotion)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* 2. Hero Sales Card */}
              <div className="mp-stats-hero-card">
                <div className="mp-stats-hero-main">
                  <div className="mp-stats-icon-circle">
                    <Wallet size={21} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--muted)' }}>
                      إجمالي المبيعات
                    </div>
                    <div className="mp-stats-hero-val tabular-nums">
                      {formatNumber(totalSales)}{' '}
                      <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--brand-ink, #34D399)' }}>
                        {currency}
                      </span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
                      {`من ${validOrders.length} طلب فعّال`}
                    </div>
                  </div>
                </div>

                {salesDeltaPct !== null && (
                  <div
                    className={`mp-stats-trend-pill ${
                      salesDeltaPct > 0 ? 'up' : salesDeltaPct < 0 ? 'down' : 'flat'
                    }`}
                  >
                    {salesDeltaPct > 0 ? (
                      <TrendingUp size={14} />
                    ) : salesDeltaPct < 0 ? (
                      <TrendingDown size={14} />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    <span className="tabular-nums">
                      {salesDeltaPct > 0
                        ? `+${salesDeltaPct}% ${compareLabel}`
                        : salesDeltaPct < 0
                        ? `${salesDeltaPct}% ${compareLabel}`
                        : `نفس مستوى ${compareLabel}`}
                    </span>
                  </div>
                )}
              </div>

              {/* 3. Compact 2x2 (Mobile) / 4-Col (Desktop) KPI Grid */}
              <div className="mp-stats-kpi-grid">
                <motion.div
                  className="mp-stats-kpi-tile"
                  {...dashCardMotion(prefersReducedMotion, 0, 1, false, 0.05)}
                >
                  <div className="mp-stats-kpi-top">
                    <span className="mp-stats-kpi-label">الطلبات</span>
                    <span className="mp-stats-kpi-mini-icon">
                      <ShoppingBag size={14} />
                    </span>
                  </div>
                  <div className="mp-stats-kpi-num tabular-nums">{filteredOrders.length}</div>
                  <div className="mp-stats-kpi-hint">
                    {`مكتمل ${completedOrders} • ملغى ${cancelledOrders}`}
                  </div>
                </motion.div>

                <motion.div
                  className="mp-stats-kpi-tile"
                  {...dashCardMotion(prefersReducedMotion, 1, 1, false, 0.05)}
                >
                  <div className="mp-stats-kpi-top">
                    <span className="mp-stats-kpi-label">متوسط الطلب</span>
                    <span className="mp-stats-kpi-mini-icon">
                      <Receipt size={14} />
                    </span>
                  </div>
                  <div className="mp-stats-kpi-num tabular-nums">
                    {formatNumber(avgOrder)}{' '}
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>{currency}</span>
                  </div>
                  <div className="mp-stats-kpi-hint">معدل قيمة الفاتورة</div>
                </motion.div>

                <motion.div
                  className="mp-stats-kpi-tile"
                  {...dashCardMotion(prefersReducedMotion, 2, 1, false, 0.05)}
                >
                  <div className="mp-stats-kpi-top">
                    <span className="mp-stats-kpi-label">نسبة الإتمام</span>
                    <span className="mp-stats-kpi-mini-icon" style={{ color: '#10b981' }}>
                      <CheckCircle2 size={14} />
                    </span>
                  </div>
                  <div className="mp-stats-kpi-num tabular-nums">{completionRate}%</div>
                  <div className="mp-stats-kpi-hint">الطلبات المنجزة بنجاح</div>
                </motion.div>

                <motion.div
                  className="mp-stats-kpi-tile"
                  {...dashCardMotion(prefersReducedMotion, 3, 1, false, 0.05)}
                >
                  <div className="mp-stats-kpi-top">
                    <span className="mp-stats-kpi-label">الأكثر طلباً</span>
                    <span className="mp-stats-kpi-mini-icon">
                      <topChannel.Icon size={14} />
                    </span>
                  </div>
                  <div className="mp-stats-kpi-num">{topChannel.label}</div>
                  <div className="mp-stats-kpi-hint">
                    {validOrders.length > 0 ? `${topChannel.count} من ${validOrders.length} طلب` : 'لا توجد طلبات'}
                  </div>
                </motion.div>
              </div>

              {/* 4. Interactive Visual Activity Bar Chart */}
              <div className="mp-stats-panel">
                <div className="mp-stats-panel-head">
                  <div>
                    <h2 className="mp-stats-panel-title">حركة الطلبات والمبيعات</h2>
                    {activeBar && (
                      <p className="mp-stats-panel-sub tabular-nums">
                        {`${activeBar.fullLabel}: ${activeBar.orders} طلب • ${formatNumber(activeBar.sales)} ${currency}`}
                      </p>
                    )}
                  </div>

                  <div className="mp-stats-mini-tabs">
                    <button
                      type="button"
                      className={`mp-stats-mini-tab ${chartMetric === 'orders' ? 'active' : ''}`}
                      onClick={() => setChartMetric('orders')}
                    >
                      الطلبات
                    </button>
                    <button
                      type="button"
                      className={`mp-stats-mini-tab ${chartMetric === 'sales' ? 'active' : ''}`}
                      onClick={() => setChartMetric('sales')}
                    >
                      المبيعات
                    </button>
                  </div>
                </div>

                <div className="mp-stats-chart-bars" role="img" aria-label="رسم بياني لحركة الطلبات">
                  {chartBuckets.map((b, idx) => {
                    const val = chartMetric === 'orders' ? b.orders : b.sales;
                    const heightPct = val > 0 ? Math.max(10, Math.round((val / maxChartVal) * 100)) : 4;
                    const isSelected = activeBar?.key === b.key;
                    return (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => setSelectedBarIdx(idx)}
                        className={`mp-stats-chart-col ${isSelected ? 'is-selected' : ''}`}
                        title={`${b.fullLabel}: ${b.orders} طلب`}
                      >
                        <div className="mp-stats-chart-bar-track">
                          <motion.div
                            className="mp-stats-chart-bar-fill"
                            initial={prefersReducedMotion ? false : { height: '4%' }}
                            animate={{ height: `${heightPct}%` }}
                            transition={{
                              duration: 0.9,
                              delay: prefersReducedMotion ? 0 : idx * 0.045,
                              ease: DASH_EASE,
                            }}
                          />
                        </div>
                        <span className="mp-stats-chart-lbl">{b.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5. Two-Column Breakdown: Channels & Top Ordered Items */}
              <div className="mp-stats-two-col">
                {/* Order Channels */}
                <div className="mp-stats-panel">
                  <div className="mp-stats-panel-head">
                    <div>
                      <h2 className="mp-stats-panel-title">كيف وصلتك الطلبات؟</h2>
                      <p className="mp-stats-panel-sub">توزيع الطلبات حسب طريقة الاستلام</p>
                    </div>
                  </div>

                  <div className="mp-stats-channel-bar" aria-hidden="true">
                    {channelRows.map((ch) =>
                      ch.pct > 0 ? (
                        <motion.div
                          key={ch.id}
                          initial={prefersReducedMotion ? false : { width: 0 }}
                          animate={{ width: `${ch.pct}%` }}
                          transition={{ duration: 1.05, ease: DASH_EASE }}
                          style={{ height: '100%', background: ch.color }}
                        />
                      ) : null
                    )}
                  </div>

                  <div>
                    {channelRows.map((ch) => (
                      <div key={ch.id} className="mp-stats-channel-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <span
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '10px',
                              background: `color-mix(in srgb, ${ch.color} 14%, transparent)`,
                              color: ch.color,
                              display: 'grid',
                              placeItems: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <ch.Icon size={15} />
                          </span>
                          <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>
                            {ch.label}
                          </span>
                        </div>
                        <div className="tabular-nums" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>
                          {ch.count}{' '}
                          <span style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 700 }}>
                            ({ch.pct}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Ordered Items */}
                <div className="mp-stats-panel">
                  <div className="mp-stats-panel-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <span
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '10px',
                          background: 'rgba(245, 158, 11, 0.14)',
                          color: '#f59e0b',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Flame size={16} />
                      </span>
                      <div>
                        <h2 className="mp-stats-panel-title">{`${terms.itemsPlural} الأكثر طلباً`}</h2>
                        <p className="mp-stats-panel-sub">مرتبة من الأعلى طلباً</p>
                      </div>
                    </div>

                    {topOrderedItems.length > 5 && (
                      <button
                        type="button"
                        className="mp-stats-quick-chip"
                        onClick={() => setShowAllItems((prev) => !prev)}
                      >
                        {showAllItems ? 'عرض أقل' : `عرض الكل (${topOrderedItems.length})`}
                      </button>
                    )}
                  </div>

                  {visibleTopItems.length === 0 ? (
                    <div
                      style={{
                        border: '1px dashed var(--line)',
                        borderRadius: '14px',
                        padding: '22px 14px',
                        textAlign: 'center',
                        color: 'var(--muted)',
                        fontSize: '12.5px',
                      }}
                    >
                      <BarChart3 size={22} style={{ margin: '0 auto 6px', opacity: 0.6 }} />
                      <div>
                        {terms.isStore
                          ? 'لا توجد مبيعات منتجات في هذه الفترة بعد.'
                          : 'لا توجد مبيعات أصناف في هذه الفترة بعد.'}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {visibleTopItems.map((item, idx) => {
                        const pct = Math.max(8, Math.round((item.qty / maxItemQty) * 100));
                        return (
                          <div key={item.name} className="mp-stats-item-row">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                <span
                                  style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '7px',
                                    background: idx === 0 ? 'rgba(245, 158, 11, 0.2)' : 'var(--soft)',
                                    color: idx === 0 ? '#f59e0b' : 'var(--brand-ink, #34D399)',
                                    fontSize: '11px',
                                    fontWeight: 900,
                                    display: 'grid',
                                    placeItems: 'center',
                                    flexShrink: 0,
                                  }}
                                >
                                  {idx === 0 ? <Award size={13} /> : idx + 1}
                                </span>
                                <b
                                  style={{
                                    fontSize: '13px',
                                    color: 'var(--ink)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {item.name}
                                </b>
                              </div>
                              <span
                                className="tabular-nums"
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 800,
                                  color: '#10b981',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                }}
                              >
                                {item.qty} مرة • {formatNumber(item.revenue)} {currency}
                              </span>
                            </div>

                            <div style={{ height: '5px', borderRadius: '99px', background: 'rgba(148,163,184,0.16)', overflow: 'hidden' }}>
                              <motion.div
                                initial={prefersReducedMotion ? false : { width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 1.05, delay: prefersReducedMotion ? 0 : idx * 0.075, ease: DASH_EASE }}
                                style={{
                                  height: '100%',
                                  borderRadius: '99px',
                                  background: idx === 0 ? '#f59e0b' : 'var(--brand)',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 6. Per-Item & Per-Category Sales Breakdown ("مبيعات كل مادة") */}
              <div className="mp-stats-panel">
                <div className="mp-stats-panel-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <span
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: 'color-mix(in srgb, var(--brand) 16%, transparent)',
                        color: 'var(--brand-ink, #34D399)',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Package size={16} />
                    </span>
                    <div>
                      <h2 className="mp-stats-panel-title">مبيعات كل مادة</h2>
                      <p className="mp-stats-panel-sub">
                        {`مرتبطة بالتاريخ المحدد (${rangeLabel})`}
                      </p>
                    </div>
                  </div>

                  {(effectiveSalesCat !== '__all__' || effectiveSalesItem !== '__all__') && (
                    <button
                      type="button"
                      className="mp-stats-quick-chip"
                      onClick={() => {
                        setSalesFilterCat('__all__');
                        setSalesFilterItem('__all__');
                        setShowAllCatalogRows(false);
                      }}
                    >
                      عرض الكل
                    </button>
                  )}
                </div>

                {/* Category & Item Selectors */}
                <div className="mp-stats-breakdown-filters">
                  <label className="mp-stats-select-wrap">
                    <span className="mp-stats-select-lbl">
                      <Layers size={12} style={{ display: 'inline', verticalAlign: '-2px', marginInlineEnd: '4px' }} />
                      اختر القسم
                    </span>
                    <select
                      className="mp-stats-select"
                      value={effectiveSalesCat}
                      onChange={(e) => {
                        setSalesFilterCat(e.target.value);
                        setSalesFilterItem('__all__');
                        setShowAllCatalogRows(false);
                      }}
                    >
                      <option value="__all__">
                        {`كل الأقسام (${itemSalesBreakdown.categoriesList.length})`}
                      </option>
                      {itemSalesBreakdown.categoriesList.map((cat) => (
                        <option key={cat.name} value={cat.name}>
                          {`${cat.name} (${cat.qty} مبيعات)`}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mp-stats-select-wrap">
                    <span className="mp-stats-select-lbl">
                      <ShoppingBag size={12} style={{ display: 'inline', verticalAlign: '-2px', marginInlineEnd: '4px' }} />
                      {terms.isStore ? 'اختر المنتج' : 'اختر المادة / الطبق'}
                    </span>
                    <select
                      className="mp-stats-select"
                      value={effectiveSalesItem}
                      onChange={(e) => {
                        setSalesFilterItem(e.target.value);
                      }}
                    >
                      <option value="__all__">
                        {activeSalesCategoryObj
                          ? `كل عناصر ${activeSalesCategoryObj.name} (${selectableItemsInScope.length})`
                          : `كل العناصر (${selectableItemsInScope.length})`}
                      </option>
                      {selectableItemsInScope.map((it) => (
                        <option key={`${it.categoryName}_${it.name}`} value={it.name}>
                          {`${it.name} (${it.qty})`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Focused Summary Box for Selected Item or Selected Category */}
                {activeSalesItemObj ? (
                  <div className="mp-stats-focus-box">
                    <div className="mp-stats-focus-cell">
                      <span className="mp-stats-focus-k">المادة المختارة</span>
                      <span className="mp-stats-focus-v" title={activeSalesItemObj.name}>
                        {activeSalesItemObj.name}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        القسم: {activeSalesItemObj.categoryName}
                      </span>
                    </div>
                    <div className="mp-stats-focus-cell">
                      <span className="mp-stats-focus-k">عدد المبيعات</span>
                      <span className="mp-stats-focus-v tabular-nums" style={{ color: 'var(--brand-ink, #34D399)' }}>
                        {formatNumber(activeSalesItemObj.qty)} مرة
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        {`ضمن ${activeSalesItemObj.ordersCount} طلب`}
                      </span>
                    </div>
                    <div className="mp-stats-focus-cell">
                      <span className="mp-stats-focus-k">إجمالي المبيعات</span>
                      <span className="mp-stats-focus-v tabular-nums" style={{ color: '#10b981' }}>
                        {formatNumber(activeSalesItemObj.revenue)} {currency}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        {activeSalesCategoryObj && activeSalesCategoryObj.qty > 0
                          ? `${Math.round((activeSalesItemObj.qty / activeSalesCategoryObj.qty) * 100)}% من ${activeSalesCategoryObj.name}`
                          : itemSalesBreakdown.totalQty > 0
                          ? `${Math.round((activeSalesItemObj.qty / itemSalesBreakdown.totalQty) * 100)}% من الكل`
                          : 'حسب الفترة المحددة'}
                      </span>
                    </div>
                  </div>
                ) : activeSalesCategoryObj ? (
                  <div className="mp-stats-focus-box">
                    <div className="mp-stats-focus-cell">
                      <span className="mp-stats-focus-k">القسم المختار</span>
                      <span className="mp-stats-focus-v" title={activeSalesCategoryObj.name}>
                        {activeSalesCategoryObj.name}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        {`${activeSalesCategoryObj.items.length} مادة في القسم`}
                      </span>
                    </div>
                    <div className="mp-stats-focus-cell">
                      <span className="mp-stats-focus-k">عدد مبيعات القسم</span>
                      <span className="mp-stats-focus-v tabular-nums" style={{ color: 'var(--brand-ink, #34D399)' }}>
                        {formatNumber(activeSalesCategoryObj.qty)} مرة
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        {`ضمن ${activeSalesCategoryObj.ordersCount} طلب`}
                      </span>
                    </div>
                    <div className="mp-stats-focus-cell">
                      <span className="mp-stats-focus-k">إجمالي مبيعات القسم</span>
                      <span className="mp-stats-focus-v tabular-nums" style={{ color: '#10b981' }}>
                        {formatNumber(activeSalesCategoryObj.revenue)} {currency}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        {itemSalesBreakdown.totalQty > 0
                          ? `${Math.round((activeSalesCategoryObj.qty / itemSalesBreakdown.totalQty) * 100)}% من إجمالي المبيعات`
                          : 'حسب الفترة المحددة'}
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Drill-Down Rows (Categories when All selected, or Items of the Selected Category) */}
                {!activeSalesItemObj && (() => {
                  if (activeSalesCategoryObj) {
                    const list = activeSalesCategoryObj.items;
                    const maxRowQty = Math.max(1, list[0]?.qty || 1);
                    const visible = showAllCatalogRows ? list : list.slice(0, 6);
                    if (list.length === 0) {
                      return (
                        <div style={{ fontSize: '12.5px', color: 'var(--muted)', textAlign: 'center', padding: '14px' }}>
                          لا توجد مواد مسجلة في هذا القسم.
                        </div>
                      );
                    }
                    return (
                      <div>
                        {visible.map((item) => {
                          const pct = item.qty > 0 ? Math.max(6, Math.round((item.qty / maxRowQty) * 100)) : 0;
                          return (
                            <button
                              key={`${item.categoryName}_${item.name}`}
                              type="button"
                              className="mp-stats-item-row mp-stats-row-btn"
                              onClick={() => setSalesFilterItem(item.name)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <b
                                  style={{
                                    fontSize: '13px',
                                    color: 'var(--ink)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {item.name}
                                </b>
                                <span
                                  className="tabular-nums"
                                  style={{
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    color: item.qty > 0 ? '#10b981' : 'var(--muted)',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                  }}
                                >
                                  {item.qty} مرة • {formatNumber(item.revenue)} {currency}
                                </span>
                              </div>
                              <div style={{ height: '5px', borderRadius: '99px', background: 'rgba(148,163,184,0.16)', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    borderRadius: '99px',
                                    background: 'var(--brand)',
                                    transition: 'width 0.52s cubic-bezier(0.22, 1, 0.36, 1)',
                                  }}
                                />
                              </div>
                            </button>
                          );
                        })}
                        {list.length > 6 && (
                          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '10px' }}>
                            <button
                              type="button"
                              className="mp-stats-quick-chip"
                              onClick={() => setShowAllCatalogRows((p) => !p)}
                            >
                              {showAllCatalogRows ? 'عرض أقل' : `عرض جميع المواد (${list.length})`}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  const catList = itemSalesBreakdown.categoriesList;
                  if (catList.length === 0) {
                    return (
                      <div
                        style={{
                          border: '1px dashed var(--line)',
                          borderRadius: '14px',
                          padding: '20px 14px',
                          textAlign: 'center',
                          color: 'var(--muted)',
                          fontSize: '12.5px',
                        }}
                      >
                        لا توجد أقسام أو مبيعات في هذه الفترة بعد.
                      </div>
                    );
                  }
                  const maxCatQty = Math.max(1, catList[0]?.qty || 1);
                  const visibleCats = showAllCatalogRows ? catList : catList.slice(0, 6);
                  return (
                    <div>
                      {visibleCats.map((cat) => {
                        const pct = cat.qty > 0 ? Math.max(6, Math.round((cat.qty / maxCatQty) * 100)) : 0;
                        return (
                          <button
                            key={cat.name}
                            type="button"
                            className="mp-stats-item-row mp-stats-row-btn"
                            onClick={() => {
                              setSalesFilterCat(cat.name);
                              setSalesFilterItem('__all__');
                              setShowAllCatalogRows(false);
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                                <b
                                  style={{
                                    fontSize: '13px',
                                    color: 'var(--ink)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {cat.name}
                                </b>
                                <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>
                                  ({cat.items.length})
                                </span>
                              </div>
                              <span
                                className="tabular-nums"
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 800,
                                  color: cat.qty > 0 ? '#10b981' : 'var(--muted)',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                }}
                              >
                                {cat.qty} مرة • {formatNumber(cat.revenue)} {currency}
                              </span>
                            </div>
                            <div style={{ height: '5px', borderRadius: '99px', background: 'rgba(148,163,184,0.16)', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  borderRadius: '99px',
                                  background: 'var(--brand)',
                                  transition: 'width 0.52s cubic-bezier(0.22, 1, 0.36, 1)',
                                }}
                              />
                            </div>
                          </button>
                        );
                      })}
                      {catList.length > 6 && (
                        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '10px' }}>
                          <button
                            type="button"
                            className="mp-stats-quick-chip"
                            onClick={() => setShowAllCatalogRows((p) => !p)}
                          >
                            {showAllCatalogRows ? 'عرض أقل' : `عرض جميع الأقسام (${catList.length})`}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* 7. Simple Plain-Language Takeaways */}
              <div className="mp-stats-panel">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Lightbulb size={17} style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <h2 className="mp-stats-panel-title">خلاصة سريعة</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {quickTakeaways.map((txt, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontSize: '13px',
                        lineHeight: 1.55,
                        color: 'var(--ink)',
                        padding: '8px 11px',
                        borderRadius: '11px',
                        background: 'color-mix(in srgb, var(--bg) 52%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--line) 70%, transparent)',
                      }}
                    >
                      {txt}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
};
