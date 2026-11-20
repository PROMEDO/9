/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FinanceExpense,
  FinanceProfitEntry,
  FinanceSettings,
  StaffPermissions,
} from '../types';
import { getAuthHeaders } from './storage';

export interface ManagedStaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  roleTitle: string;
  active: boolean;
  permissions: StaffPermissions;
  createdAt?: string;
  updatedAt?: string;
  hasPassword?: boolean;
}

export interface StaffMutationPayload {
  name: string;
  email: string;
  phone?: string;
  roleTitle: string;
  password?: string;
  active: boolean;
  permissions: StaffPermissions;
}

export interface ManagedAccountRecord {
  id: string;
  source: 'account' | 'restaurant' | 'telegram_only';
  name: string;
  phone: string;
  identifier: string;
  email: string;
  role: 'admin' | 'partner' | 'demo' | 'telegram_only';
  roleLabel: string;
  status: 'active' | 'suspended' | 'telegram_verified';
  statusLabel: string;
  active: boolean;
  registrationDate: string;
  rid?: string;
  done?: number;
  slug?: string;
  subdomain?: string;
  social?: Record<string, string>;
  restaurantName?: string;
  projectName?: string;
  projectType?: string;
  projectTypeLabel?: string;
  planId?: string;
  planName?: string;
  isPaid?: boolean;
  expiresAt?: string;
  restaurantActive?: boolean;
  telegramLinked: boolean;
  telegramUsername?: string;
  telegramChatId?: string;
  telegramLinkedAt?: string;
  lastSentAt?: string;
  hasPassword: boolean;
  isProtected: boolean;
  isCurrentUser?: boolean;
  authMethod?: string;
  itemsCount?: number;
  catsCount?: number;
  ordersCount?: number;
  hasOwnedMenu?: boolean;
  isSelfRegisteredMenuOwner?: boolean;
  permissionsSummary: string;
}

export interface AccountsStats {
  total: number;
  active: number;
  suspended: number;
  telegramVerified: number;
  admins: number;
  partners: number;
  paid?: number;
}

export interface AccountUpdatePayload {
  name?: string;
  phone?: string;
  email?: string;
  role?: 'admin' | 'partner';
  active?: boolean;
  newPassword?: string;
  projectName?: string;
  projectType?: string;
  planId?: string;
  planName?: string;
  isPaid?: boolean;
  durationDays?: number;
  expiresAt?: string;
  extendFromCurrent?: boolean;
  slug?: string;
  subdomain?: string;
  social?: Record<string, string>;
}

export interface CreatePartnerPayload {
  projectName: string;
  ownerName?: string;
  phone?: string;
  projectType?: string;
  planId?: string;
  planName?: string;
  durationDays?: number;
  isPaid?: boolean;
  password?: string;
}

export interface MyAccountProfile {
  kind: 'owner' | 'staff';
  id: string;
  name: string;
  email: string;
  phone: string;
  roleTitle: string;
  createdAt: string;
  active: boolean;
  isProtected: boolean;
  permissions: StaffPermissions;
}

export interface UpdateMyAccountPayload {
  staffId?: string;
  accountId?: string;
  name: string;
  email: string;
  phone: string;
  roleTitle: string;
  newPassword?: string;
}

async function parseApiJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & {
    success?: boolean;
    error?: string;
  };
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `فشل الطلب برمز (${res.status})`);
  }
  return data;
}

export async function fetchStaffApi(): Promise<{
  staff: ManagedStaffMember[];
  source: 'supabase' | 'file-memory';
  supabaseError?: string;
}> {
  const res = await fetch('/api/staff', {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function createStaffApi(payload: StaffMutationPayload): Promise<{
  staff: ManagedStaffMember;
  persistedToSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch('/api/staff', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function updateStaffApi(
  id: string,
  payload: StaffMutationPayload
): Promise<{
  staff: ManagedStaffMember;
  persistedToSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch(`/api/staff/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function deleteStaffApi(id: string): Promise<{
  deletedId: string;
  physicalDelete: boolean;
  deletedFromSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch(`/api/staff/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function fetchAccountsApi(): Promise<{
  accounts: ManagedAccountRecord[];
  stats: AccountsStats;
  source: 'supabase' | 'file-memory';
  supabaseError?: string;
}> {
  const res = await fetch('/api/accounts', {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function createPartnerApi(payload: CreatePartnerPayload): Promise<{
  account: ManagedAccountRecord;
  persistedToSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch('/api/partners', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function updateAccountApi(
  id: string,
  payload: AccountUpdatePayload
): Promise<{
  account: ManagedAccountRecord;
  persistedToSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function deleteAccountApi(
  id: string,
  _deleteTelegram = false
): Promise<{
  deletedId: string;
  physicalDelete: boolean;
  deletedFromSupabase: boolean;
  deletedTelegram: boolean;
}> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(id)}?deleteTelegram=false`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function cleanupUnusedImagesApi(): Promise<{
  removedOrphanRecords: number;
  strippedUnreferencedImages: number;
  reclaimedBytes: number;
}> {
  const res = await fetch('/api/maintenance/cleanup-images', {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function fetchMyAccountApi(params: {
  staffId?: string;
  email?: string;
  phone?: string;
}): Promise<{
  profile: MyAccountProfile;
  source: 'supabase' | 'file-memory';
}> {
  const qs = new URLSearchParams();
  if (params.staffId) qs.set('staffId', params.staffId);
  if (params.email) qs.set('email', params.email);
  if (params.phone) qs.set('phone', params.phone);
  const res = await fetch(`/api/my-account?${qs.toString()}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function updateMyAccountApi(payload: UpdateMyAccountPayload): Promise<{
  profile: MyAccountProfile;
  sessionPatch: {
    name: string;
    email: string;
    phone: string;
    roleTitle: string;
  };
  persistedToSupabase: boolean;
  source: 'supabase' | 'file-memory';
}> {
  const res = await fetch('/api/my-account', {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export interface DbStatusResponse {
  connected: boolean;
  driver: 'supabase' | 'file-memory' | string;
  supabase?: {
    configured: boolean;
    connected: boolean;
    error?: string;
  };
  databaseUrl?: {
    configured: boolean;
    valid: boolean;
    host?: string;
    port?: number;
    database?: string;
    projectRef?: string;
    error?: string;
  };
  recordsCount: number;
  status: 'operational' | 'degraded' | string;
  error?: string;
}

export async function fetchDbStatusApi(): Promise<{
  data: DbStatusResponse;
  latencyMs: number;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const res = await fetch('/api/db-status', {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latencyMs = Math.max(1, Math.round(endTime - startTime));

    const payload = (await res.json().catch(() => ({}))) as Partial<DbStatusResponse>;
    if (!res.ok) {
      throw new Error(payload.error || `تعذر الوصول لحالة النظام (HTTP ${res.status})`);
    }

    return {
      latencyMs,
      data: {
        connected: Boolean(payload.connected),
        driver: payload.driver || 'file-memory',
        supabase: payload.supabase,
        databaseUrl: payload.databaseUrl,
        recordsCount: Number(payload.recordsCount || 0),
        status: payload.status || (payload.connected ? 'operational' : 'degraded'),
        error: payload.error,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface FinanceOverviewResponse {
  expenses: FinanceExpense[];
  profits: FinanceProfitEntry[];
  settings: FinanceSettings;
  partnerSummary: {
    activePaidPartners: number;
    estimatedMonthlyMrrIqd: number;
  };
  source: 'supabase' | 'file-memory';
}

export async function fetchFinanceApi(): Promise<FinanceOverviewResponse> {
  const res = await fetch('/api/admin/finance', {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function createExpenseApi(
  payload: Omit<FinanceExpense, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ expense: FinanceExpense; source: 'supabase' | 'file-memory' }> {
  const res = await fetch('/api/admin/finance/expenses', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function updateExpenseApi(
  id: string,
  payload: Partial<Omit<FinanceExpense, 'id' | 'createdAt'>>
): Promise<{ expense: FinanceExpense; source: 'supabase' | 'file-memory' }> {
  const res = await fetch(`/api/admin/finance/expenses/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function markExpensePaidApi(
  id: string,
  advanceCycle = true
): Promise<{ expense: FinanceExpense }> {
  const res = await fetch(`/api/admin/finance/expenses/${encodeURIComponent(id)}/pay`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ advanceCycle }),
  });
  return parseApiJson(res);
}

export async function deleteExpenseApi(id: string): Promise<{ deletedId: string }> {
  const res = await fetch(`/api/admin/finance/expenses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function createProfitApi(
  payload: Omit<FinanceProfitEntry, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ profit: FinanceProfitEntry; source: 'supabase' | 'file-memory' }> {
  const res = await fetch('/api/admin/finance/profits', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function updateProfitApi(
  id: string,
  payload: Partial<Omit<FinanceProfitEntry, 'id' | 'createdAt'>>
): Promise<{ profit: FinanceProfitEntry; source: 'supabase' | 'file-memory' }> {
  const res = await fetch(`/api/admin/finance/profits/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function deleteProfitApi(id: string): Promise<{ deletedId: string }> {
  const res = await fetch(`/api/admin/finance/profits/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function updateFinanceSettingsApi(
  payload: FinanceSettings
): Promise<{ settings: FinanceSettings }> {
  const res = await fetch('/api/admin/finance/settings', {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

// ============================================================================
// DATABASE EXPLORER & FULL CONTROL API (/api/admin/database/*)
// ============================================================================

export interface DbRawRecordSummary {
  key: string;
  prefix: string;
  sizeBytes: number;
  summary: string;
  protected?: boolean;
  value: unknown;
}

export interface DbAccountRow {
  key: string;
  id: string;
  name: string;
  phone: string;
  projectPhone: string;
  email: string;
  rid: string;
  role: string;
  active: boolean;
  authMethod: string;
  telegramLinked: boolean;
  telegramChatId: string;
  createdAt: string;
  protected: boolean;
  raw: Record<string, unknown>;
}

export interface DbStaffRow {
  key: string;
  id: string;
  name: string;
  phone: string;
  email: string;
  roleTitle: string;
  active: boolean;
  createdAt: string;
  raw: Record<string, unknown>;
}

export interface DbRestaurantRow {
  key: string;
  id: string;
  name: string;
  owner: string;
  phone: string;
  slug: string;
  projectType: string;
  planName: string;
  planId: string;
  active: boolean;
  done: number;
  isPaid: boolean;
  expiresAt: string;
  createdAt: string;
  catsCount: number;
  itemsCount: number;
  ordersCount: number;
  protected: boolean;
  raw: Record<string, unknown>;
}

export interface DbCatalogRow {
  key: string;
  id: string;
  rid: string;
  restaurantName: string;
  name: string;
  extra: string;
  raw: Record<string, unknown>;
}

export interface DbOrderRow {
  key: string;
  id: string;
  rid: string;
  restaurantName: string;
  customerName: string;
  customerPhone: string;
  total: number;
  status: string;
  createdAt: string;
  raw: Record<string, unknown>;
}

export interface DbPhoneIndexRow {
  phone: string;
  sources: Array<{ kind: string; key: string; label: string }>;
  telegramLinked: boolean;
  telegramChatId: string;
  telegramUsername: string;
  protected: boolean;
}

export interface DbTelegramUserRow {
  phone: string;
  normalizedPhone?: string;
  chatId: string;
  username: string;
  firstName: string;
  linkedAt: string;
  lastSentAt: string;
  hasPlatformAccount?: boolean;
  linkedAccountNames?: string[];
}

export interface DbUserSessionRow {
  key: string;
  sid: string;
  role: string;
  name: string;
  phone: string;
  rid: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface DbAuditLogRow {
  key: string;
  id: string;
  ts: number;
  actor: string;
  action: string;
  details: string;
  type: string;
}

export interface DbOverviewResponse {
  success: boolean;
  meta: {
    driver: 'supabase' | 'file-memory' | string;
    connected: boolean;
    supabaseConfigured: boolean;
    supabaseConnected: boolean;
    supabaseError?: string;
    totalKvRecords: number;
    totalBytes: number;
    fetchedAt: string;
  };
  counts: {
    accounts: number;
    staff: number;
    restaurants: number;
    categories: number;
    items: number;
    orders: number;
    phones: number;
    telegramUsers: number;
    userSessions: number;
    auditLogs: number;
    settingsAndSystem: number;
  };
  sections: {
    accounts: DbAccountRow[];
    staff: DbStaffRow[];
    restaurants: DbRestaurantRow[];
    categories: DbCatalogRow[];
    items: DbCatalogRow[];
    orders: DbOrderRow[];
    phonesIndex: DbPhoneIndexRow[];
    telegramUsers: DbTelegramUserRow[];
    userSessions: DbUserSessionRow[];
    auditLogs: DbAuditLogRow[];
    settingsAndSystem: DbRawRecordSummary[];
    rawRecords: DbRawRecordSummary[];
  };
}

export async function fetchDatabaseOverviewApi(): Promise<DbOverviewResponse> {
  const res = await fetch('/api/admin/database/overview', {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function deleteDatabaseRecordApi(
  key: string,
  cascade = false
): Promise<{
  success: boolean;
  deletedKeys: string[];
  deletedCount: number;
  source: string;
}> {
  const res = await fetch('/api/admin/database/record', {
    method: 'DELETE',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ key, cascade }),
  });
  return parseApiJson(res);
}

export async function updateDatabaseRecordApi(
  key: string,
  value: unknown
): Promise<{
  success: boolean;
  key: string;
  source: string;
}> {
  const res = await fetch('/api/admin/database/record', {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ key, value }),
  });
  return parseApiJson(res);
}

export async function deleteDatabasePhoneApi(phone: string): Promise<{
  success: boolean;
  phone: string;
  deletedKeys: string[];
  clearedRestaurants: string[];
  deletedTelegram: boolean;
  deletedOtpCount: number;
}> {
  const res = await fetch(`/api/admin/database/phone/${encodeURIComponent(phone)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function deleteTelegramBindingApi(phone: string): Promise<{
  success: boolean;
  deleted?: boolean;
  phone?: string;
}> {
  const res = await fetch(`/api/admin/database/telegram-user/${encodeURIComponent(phone)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function bulkDeleteDatabaseRecordsApi(keys: string[]): Promise<{
  success: boolean;
  deletedKeys: string[];
  deletedCount: number;
  skippedKeys: string[];
}> {
  const res = await fetch('/api/admin/database/bulk-delete', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ keys }),
  });
  return parseApiJson(res);
}

// ============================================================================
// INTERNAL TELEGRAM BOT SETTINGS API (/api/admin/telegram/*)
// ============================================================================

export interface TelegramAdminConfig {
  enabled: boolean;
  botUsername: string;
  hasBotTokenOverride: boolean;
  hasEnvToken: boolean;
  hasEffectiveToken: boolean;
  tokenSource?: 'override' | 'env' | 'none';
  botTokenValid?: boolean;
  botTokenError?: string | null;
  maskedToken: string;
  proxyUrl?: string;
  welcomeSharePhoneText: string;
  verifiedSuccessText: string;
  orderHeaderText: string;
  orderFooterText: string;
  updatedAt: string | null;
  runtime: {
    configured: boolean;
    enabled: boolean;
    botUsername: string;
    boundUsersCount: number;
    linkedStoresCount?: number;
    pollingActive: boolean;
    botTokenValid?: boolean;
    botTokenError?: string | null;
    tokenSource?: 'override' | 'env' | 'none';
    provider: 'telegram';
    lastPollError: string | null;
    lastPollSuccessAt: string | null;
  };
}

export interface UpdateTelegramSettingsPayload {
  enabled?: boolean;
  botUsername?: string;
  botTokenOverride?: string;
  clearTokenOverride?: boolean;
  proxyUrl?: string;
  welcomeSharePhoneText?: string;
  verifiedSuccessText?: string;
  orderHeaderText?: string;
  orderFooterText?: string;
}

export async function fetchTelegramSettingsApi(): Promise<{
  success: boolean;
  config: TelegramAdminConfig;
}> {
  const res = await fetch('/api/admin/telegram/settings', {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function updateTelegramSettingsApi(
  payload: UpdateTelegramSettingsPayload
): Promise<{
  success: boolean;
  config: TelegramAdminConfig;
}> {
  const res = await fetch('/api/admin/telegram/settings', {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  return parseApiJson(res);
}

export async function testTelegramBotApi(botToken?: string): Promise<{
  ok: boolean;
  bot?: { id: number; username?: string; first_name?: string };
  webhookUrl?: string;
  error?: string;
}> {
  const res = await fetch('/api/admin/telegram/test-connection', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(botToken ? { botToken } : {}),
  });
  return res.json();
}

export async function sendTelegramTestMessageApi(
  target: string,
  message?: string
): Promise<{
  ok: boolean;
  chatId?: string;
  message: string;
}> {
  const res = await fetch('/api/admin/telegram/send-test', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ target, message }),
  });
  return res.json();
}

// ============================================================================
// PARTNER DASHBOARD TELEGRAM ORDER NOTIFICATIONS API (/api/dashboard/telegram/*)
// ============================================================================

export interface DashboardTelegramStatus {
  ok: boolean;
  linked: boolean;
  enabled: boolean;
  orderChannel?: 'both' | 'telegram' | 'whatsapp';
  whatsappConfigured?: boolean;
  telegramSendReady?: boolean;
  pollingActive?: boolean;
  pollingHealthy?: boolean;
  lastPollError?: string | null;
  lastSendError?: string | null;
  lastPollSuccessAt?: number | null;
  botEnabled: boolean;
  botConfigured: boolean;
  botTokenValid?: boolean;
  botTokenError?: string | null;
  botUsername: string;
  configuredBotUsername?: string;
  verifiedBotUsername?: string | null;
  telegramPhone: string;
  telegramUsername: string;
  proxyUrl?: string;
}

export async function fetchDashboardTelegramStatusApi(rid: string): Promise<DashboardTelegramStatus> {
  const res = await fetch(`/api/dashboard/telegram/status?rid=${encodeURIComponent(rid)}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  return parseApiJson(res);
}

export async function linkDashboardTelegramApi(
  rid: string,
  phone: string
): Promise<{
  ok: boolean;
  linked: boolean;
  botUrl: string;
  botUsername: string;
  telegramPhone: string;
  telegramUsername?: string;
  message: string;
}> {
  const res = await fetch('/api/dashboard/telegram/link', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid, phone }),
  });
  return res.json();
}

export async function toggleDashboardTelegramApi(
  rid: string,
  enabled: boolean
): Promise<{ ok: boolean; enabled: boolean }> {
  const res = await fetch('/api/dashboard/telegram/toggle', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid, enabled }),
  });
  return parseApiJson(res);
}

export async function unlinkDashboardTelegramApi(rid: string): Promise<{ ok: boolean }> {
  const res = await fetch('/api/dashboard/telegram/unlink', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid }),
  });
  return parseApiJson(res);
}

export async function testDashboardTelegramApi(rid: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/dashboard/telegram/test', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid }),
  });
  return res.json();
}

export async function verifyDashboardTelegramApi(rid: string): Promise<{
  ok: boolean;
  diagnosticMessage: string;
  status?: DashboardTelegramStatus;
}> {
  const res = await fetch('/api/dashboard/telegram/verify', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ rid }),
  });
  return parseApiJson(res);
}
