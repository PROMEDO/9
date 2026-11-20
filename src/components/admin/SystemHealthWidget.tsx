/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Server,
  WifiOff,
} from 'lucide-react';
import { DbStatusResponse, fetchDbStatusApi } from '../../utils/adminApi';
import { formatNumber } from '../../utils/storage';

export interface SystemDbHealthState {
  data: DbStatusResponse | null;
  isLoading: boolean;
  error: string | null;
  latencyMs: number | null;
  lastCheckedAt: Date | null;
  refresh: (notify?: boolean) => Promise<void>;
}

export function useSystemDbStatus(
  onNotify?: (msg: string) => void
): SystemDbHealthState {
  const [data, setData] = useState<DbStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  const refresh = useCallback(
    async (notify = false) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetchDbStatusApi();
        setData(res.data);
        setLatencyMs(res.latencyMs);
        setLastCheckedAt(new Date());
        if (notify && onNotify) {
          if (res.data.status === 'operational' && res.data.connected) {
            onNotify(`تم فحص الاتصال بنجاح — النظام يعمل بكفاءة (${res.data.recordsCount} سجل) ✓`);
          } else {
            onNotify('تم فحص الخادم — تنبيه: اتصال قاعدة البيانات السحابية متدهور ⚠️');
          }
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'تعذر الاتصال بالخادم (/api/db-status)';
        setError(msg);
        setLastCheckedAt(new Date());
        if (notify && onNotify) {
          onNotify(`فشل فحص الخادم: ${msg}`);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [onNotify]
  );

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return {
    data,
    isLoading,
    error,
    latencyMs,
    lastCheckedAt,
    refresh,
  };
}

interface ResolvedHealthMeta {
  tone: 'loading' | 'operational' | 'degraded' | 'offline';
  badgeText: string;
  overallLabel: string;
  color: string;
  bg: string;
  border: string;
}

function resolveHealthMeta(state: SystemDbHealthState): ResolvedHealthMeta {
  const { data, isLoading, error } = state;

  if (isLoading && !data && !error) {
    return {
      tone: 'loading',
      badgeText: 'جاري فحص حالة النظام...',
      overallLabel: 'جاري الفحص...',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.14)',
      border: 'rgba(148, 163, 184, 0.3)',
    };
  }

  if (error || !data) {
    return {
      tone: 'offline',
      badgeText: 'تحذير: الخادم غير متصل (Offline)',
      overallLabel: 'غير متصل (Offline)',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.16)',
      border: 'rgba(239, 68, 68, 0.45)',
    };
  }

  const isDegraded =
    data.status === 'degraded' ||
    !data.connected ||
    Boolean(data.supabase?.configured && !data.supabase.connected);

  if (isDegraded) {
    return {
      tone: 'degraded',
      badgeText: 'تحذير: تدهور اتصال قاعدة البيانات (Degraded)',
      overallLabel: 'اتصال متدهور (Degraded)',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.16)',
      border: 'rgba(245, 158, 11, 0.45)',
    };
  }

  return {
    tone: 'operational',
    badgeText: data.supabase?.connected
      ? 'النظام يعمل باستقرار (Supabase متصل)'
      : 'النظام يعمل باستقرار (Operational)',
    overallLabel: 'يعمل بكفاءة (Operational)',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.35)',
  };
}

export const SystemLiveStatusBadge: React.FC<{
  health: SystemDbHealthState;
}> = ({ health }) => {
  const meta = resolveHealthMeta(health);

  const renderIcon = () => {
    if (health.isLoading) {
      return <Loader2 size={14} className="animate-spin" />;
    }
    if (meta.tone === 'offline') {
      return <WifiOff size={14} />;
    }
    if (meta.tone === 'degraded') {
      return <AlertTriangle size={14} />;
    }
    return <CheckCircle2 size={14} />;
  };

  return (
    <span
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        background: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
        padding: '6px 14px',
        borderRadius: '20px',
        fontSize: '13px',
        fontWeight: 700,
      }}
    >
      {renderIcon()}
      <span>{meta.badgeText}</span>
    </span>
  );
};

export const SystemInfrastructureCard: React.FC<{
  health: SystemDbHealthState;
}> = ({ health }) => {
  const { data, isLoading, error, latencyMs, lastCheckedAt, refresh } = health;
  const meta = resolveHealthMeta(health);

  const supabaseLabel = (() => {
    if (isLoading && !data && !error) return 'جاري الفحص...';
    if (error || !data) return 'غير متصل بالخادم';
    if (data.supabase?.configured) {
      return data.supabase.connected
        ? 'متصل ونشط (Supabase PostgreSQL)'
        : `مفصول — وضع الاحتياط (${data.driver})`;
    }
    return `التخزين المحلي (${data.driver})`;
  })();

  const supabaseColor =
    error || !data
      ? '#ef4444'
      : data.supabase?.configured && !data.supabase.connected
      ? '#f59e0b'
      : 'var(--ok)';

  const lastCheckedText = lastCheckedAt
    ? lastCheckedAt.toLocaleTimeString('ar-IQ', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  return (
    <div style={{ marginBottom: '22px' }}>
      <div className="card">
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
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Server size={18} style={{ color: 'var(--brand-ink, #34D399)' }} />
            <span>حالة الخادم وقاعدة البيانات السحابية</span>
          </h3>

          <button
            type="button"
            className="btn s"
            onClick={() => void refresh(true)}
            disabled={isLoading}
            title="فحص الاتصال بـ /api/db-status الآن"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>{isLoading ? 'جاري الفحص...' : 'تحديث الحالة'}</span>
          </button>
        </div>

        {/* Live Warning Banner when Offline or Degraded */}
        {(meta.tone === 'offline' || meta.tone === 'degraded') && (
          <div
            role="alert"
            style={{
              marginBottom: '14px',
              padding: '10px 14px',
              borderRadius: '12px',
              background: meta.bg,
              border: `1px solid ${meta.border}`,
              color: meta.color,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              {meta.tone === 'offline' ? <WifiOff size={16} /> : <AlertTriangle size={16} />}
              <span>
                {meta.tone === 'offline'
                  ? `فشل الاتصال بنقطة الفحص (/api/db-status): ${error || 'الخادم لا يستجيب'}`
                  : `تنبيه: تعذر الوصول إلى Supabase (${data?.supabase?.error || 'العمل بالوضع المحلي الاحتياطي حالياً'})`}
              </span>
            </div>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            fontSize: '13px',
          }}
        >
          <div className="rw">
            <span className="muted">الحالة التشغيلية للنظام:</span>
            <b style={{ color: meta.color }}>{meta.overallLabel}</b>
          </div>

          <div className="rw">
            <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Database size={14} />
              قاعدة البيانات:
            </span>
            <b style={{ color: supabaseColor }}>{supabaseLabel}</b>
          </div>

          <div className="rw">
            <span className="muted">إجمالي السجلات المخزنة:</span>
            <b className="tabular-nums" style={{ color: 'var(--ink)' }}>
              {data ? `${formatNumber(data.recordsCount)} سجل` : '—'}
            </b>
          </div>

          <div className="rw">
            <span className="muted">متغير DATABASE_URL:</span>
            <b
              style={{
                color: data?.databaseUrl?.configured
                  ? data.databaseUrl.valid
                    ? 'var(--ok)'
                    : '#ef4444'
                  : '#f59e0b',
              }}
            >
              {!data
                ? '—'
                : data.databaseUrl?.configured
                ? data.databaseUrl.valid
                  ? `مُفعّل (${data.databaseUrl.host || 'PostgreSQL'})`
                  : `غير صالح (${data.databaseUrl.error || 'تحقق من الصيغة'})`
                : 'غير مضاف في المتغيرات (مطلوب)'}
            </b>
          </div>

          <div className="rw">
            <span className="muted">الاستجابة وآخر فحص:</span>
            <b className="tabular-nums" dir="ltr" style={{ color: latencyMs !== null && latencyMs < 500 ? 'var(--ok)' : 'var(--ink)' }}>
              {latencyMs !== null ? `${latencyMs} ms` : '—'} · {lastCheckedText}
            </b>
          </div>
        </div>
      </div>
    </div>
  );
};
