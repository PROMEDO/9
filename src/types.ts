/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SupportedLanguage = 'ar' | 'ku' | 'en';

export type MenuLayout =
  | 'grid4'
  | 'grid3'
  | 'grid'
  | 'list'
  | (string & {});

export type MenuThemeShape =
  | 'modern'
  | 'silk'
  | 'editorial'
  | 'velvet'
  | 'luxe'
  | 'toters'
  | 'estore'
  | 'glass'
  | 'cartoon'
  | 'dreamy'
  | 'pill'
  | 'sharp'
  | 'bordered'
  | 'soft'
  | 'ramadan'
  | 'eid'
  | 'newyear';

export type OrderStatus = 'pending' | 'preparing' | 'completed' | 'cancelled';

export type OrderType = 'delivery' | 'pickup' | 'table';

export type WorkDayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface DaySchedule {
  open: boolean;
  from?: string;
  to?: string;
}

export interface RestaurantHours {
  m?: '24' | 'c';
  f?: string;
  t?: string;
}

export interface CustomFontWeightFile {
  weight: number; // e.g., 300, 400, 500, 600, 700, 800, 900; 0 means covers all weights (100 900)
  label?: string;
  url: string;
  fileId: string;
  format: 'opentype' | 'truetype' | 'woff2' | 'woff';
  fileName: string;
  sizeBytes?: number;
}

export interface CustomFontItem {
  id: string;
  name: string;
  family: string;
  createdAt: string;
  weights: CustomFontWeightFile[];
}

export interface FontTypographyConfig {
  fontKey?: string;
  separateHeadingFont?: boolean;
  headingFontKey?: string;
  bodyFontKey?: string;
  headingScale?: number; // percentage: 80..135 (default 100)
  bodySize?: number; // px: 12..20 (default 15)
  descSize?: number; // px: 11..18 (default 13.5)
  headingWeight?: number; // 300..900 (default 800)
  subHeadingWeight?: number; // 300..900 (default 700)
  bodyWeight?: number; // 300..800 (default 400)
  descWeight?: number; // 300..800 (default 400)
  headingLineHeight?: number; // 1.05..1.6 (default 1.28)
  bodyLineHeight?: number; // 1.3..2.1 (default 1.7)
  letterSpacing?: number; // em: -0.04..0.06 (default 0)
  fontStretch?: number; // percentage: 75..125 (default 100, for Firjar wdth axis)
  customFonts?: CustomFontItem[];
}

export interface ThemeSettings {
  c1: string;
  c2: string;
  c3: string;
  bg: string;
  mode?: 'dark' | 'light';
  c4?: string;
  c5?: string;
  font: string;
  typography?: FontTypographyConfig;
  preset?: string;
  [key: string]: any;
}

export interface ThemePreset {
  id: string;
  name: string;
  desc: string;
  theme: ThemeSettings;
}

export interface StaffPermissions {
  canViewHome?: boolean;
  canViewAnalytics?: boolean;
  canManageRestaurants?: boolean;
  canCreatePartner?: boolean;
  canEditPartnerPlan?: boolean;
  canExtendSubscription?: boolean;
  canSuspendPartner?: boolean;
  canEditPartnerProfile?: boolean;
  canEditPartnerLinks?: boolean;
  canImpersonatePartner?: boolean;
  canDeletePartner?: boolean;
  canEditDemoMenu?: boolean;
  canUseNotes?: boolean;
  canViewReports?: boolean;
  canManagePlans?: boolean;
  canManageStaff?: boolean;
  canManageSettings?: boolean;
  canEditTabLabels?: boolean;
  canReorderTabs?: boolean;
  canManageThemeMode?: boolean;
  canManageSubdomains?: boolean;
  canRunMaintenance?: boolean;
  canManageFinance?: boolean;
  canManageDatabase?: boolean;
  canEditHomePage?: boolean;
  // Legacy keys kept optional for backward compatibility with older stored records
  canManageUsers?: boolean;
  canEditCMS?: boolean;
  canManageTheme?: boolean;
  canExportBackup?: boolean;
  canBroadcast?: boolean;
  [key: string]: any;
}

export interface StaffMember {
  id: string;
  name: string;
  username?: string;
  phone?: string;
  pw?: string;
  passwordHash?: string;
  role?: string;
  roleTitle: string;
  email: string;
  active: boolean;
  permissions: StaffPermissions;
  createdAt?: string;
  [key: string]: any;
}

export interface PlanFeaturesMap {
  deliveryOrders?: boolean;
  pickupOrders?: boolean;
  tableOrders?: boolean;
  priceProductControl?: boolean;
  qrCode?: boolean;
  customSlug?: boolean;
  lightDarkMode?: boolean;
  analytics?: boolean;
  itemDiscounts?: boolean;
  popupAd?: boolean;
  happyHourDiscount?: boolean;
  customColors?: boolean;
  allAddons?: boolean;
  prioritySupport?: boolean;
  unlimitedItems?: boolean;
  whatsappOrders?: boolean;
  customQr?: boolean;
  onlinePayment?: boolean;
  [key: string]: boolean | undefined;
}

export interface PlanComparisonItemConfig {
  key: string;
  label?: string;
  included?: boolean;
  visible?: boolean;
}

export interface PricingPlan {
  id: string;
  n: string;
  tagline?: string;
  pr: number;
  annualPr?: number;
  discountPercent?: number;
  hot: number;
  maxItems?: number;
  maxCats?: number;
  maxThemes?: number;
  maxBranches?: number; // 0 = disabled, N = up to N extra branches, -1 = unlimited
  f: string[];
  comparisonItems?: PlanComparisonItemConfig[];
  addonsHighlights?: string[];
  featuresMap?: PlanFeaturesMap;
  [key: string]: any;
}

export interface SubdomainRulesConfig {
  enabled: boolean;
  baseDomain: string;
  maxLength: number;
  blockedKeywords: string[];
  allowHyphens?: boolean;
}

export interface SiteSettings {
  name: string;
  wa?: string;
  supportWhatsapp?: string;
  em?: string;
  su?: number;
  tr?: number;
  bn?: string;
  logoText?: string;
  homeThemeMode?: 'dark' | 'light' | 'auto';
  adminThemeMode?: 'dark' | 'light' | 'auto';
  dashboardThemeMode?: 'dark' | 'light' | 'auto';
  adminTabLabels?: Record<string, string>;
  dashboardTabLabels?: Record<string, string>;
  adminTabOrder?: string[];
  dashboardTabOrder?: string[];
  subdomainRules?: SubdomainRulesConfig;
  googleAuthEnabled?: boolean;
  signupEnabled?: boolean;
  defaultCountry?: string;
  defaultCurrency?: string;
  zainCashNumber?: string;
  qiCardNumber?: string;
  paymentNote?: string;
  [key: string]: any;
}

export interface HomeDemoItem {
  e?: string;
  n: string;
  d: string;
  p: number;
}

export interface HomeSettings {
  sections?: {
    hero?: boolean;
    services?: boolean;
    faq?: boolean;
    pricing?: boolean;
    footer?: boolean;
  };
  nav: Record<string, string>;
  hero: {
    titleLine1?: string;
    titleLine2?: string;
    title: string;
    lead: string;
    cta1?: string;
    cta1Link?: string;
    cta1Visible?: boolean;
    cta2?: string;
    [key: string]: any;
  };
  services: {
    badge?: string;
    title: string;
    sub: string;
    list: Array<{ i?: string; t: string; d: string }>;
    [key: string]: any;
  };
  steps: {
    title: string;
    sub: string;
    list: Array<{ t: string; d: string }>;
    [key: string]: any;
  };
  demo: {
    title: string;
    sub: string;
    btn?: string;
    items: HomeDemoItem[];
    [key: string]: any;
  };
  pricing: {
    badge?: string;
    title: string;
    sub: string;
    monthlyLabel?: string;
    annualLabel?: string;
    annualBadge?: string;
    hotBadge?: string;
    vipBadge?: string;
    growthBadge?: string;
    paidCtaPrefix?: string;
    helpText?: string;
    whatsappBtnText?: string;
    [key: string]: any;
  };
  faq?: HomeFaqConfig;
  footerConfig?: {
    madeWithPrefix?: string;
    authorName?: string;
    authorUrl?: string;
    instagramUrl?: string;
    copyrightText?: string;
    faqLinkText?: string;
    demoLinkText?: string;
    termsLinkText?: string;
  };
  footer?: string;
  [key: string]: any;
}

export interface HomeFaqItem {
  id: string;
  q: string;
  a: string;
  qKu?: string;
  aKu?: string;
  qEn?: string;
  aEn?: string;
  visible?: boolean;
}

export interface HomeFaqConfig {
  enabled?: boolean;
  title?: string;
  sub?: string;
  items: HomeFaqItem[];
}

export type FinanceExpenseCategory =
  | 'server'
  | 'domain'
  | 'database'
  | 'apis'
  | 'marketing'
  | 'sales'
  | 'tools'
  | 'salaries'
  | 'gateway'
  | 'legal'
  | 'emergency'
  | 'other';

export type FinanceBillingCycle = 'monthly' | 'quarterly' | 'annual' | 'one_time';
export type FinanceExpenseStatus = 'pending' | 'paid' | 'overdue';
export type FinanceCurrency = 'IQD' | 'USD';

export interface FinanceExpense {
  id: string;
  title: string;
  vendor?: string;
  category: FinanceExpenseCategory;
  amount: number;
  currency: FinanceCurrency;
  billingCycle: FinanceBillingCycle;
  dueDate: string; // YYYY-MM-DD
  status: FinanceExpenseStatus;
  autoRenew?: boolean;
  reminderDays?: number;
  paidAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type FinanceProfitSource = 'subscription' | 'setup' | 'ads_campaign' | 'custom_service' | 'other';

export interface FinanceProfitEntry {
  id: string;
  title: string;
  source: FinanceProfitSource;
  partnerName?: string;
  rid?: string;
  amount: number;
  currency: FinanceCurrency;
  date: string; // YYYY-MM-DD
  allocationNote?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FinanceSettings {
  exchangeRateIqdPerUsd: number;
  monthlyRevenueTargetIqd: number;
  expensesReservePct: number;
  marketingSalesPct: number;
  emergencyGrowthPct: number;
  ownerNetProfitPct: number;
  updatedAt?: string;
}

export interface DeliveryZone {
  name?: string;
  fee?: number;
  area?: string;
  cities?: Array<{ name: string; fee: number; eta?: string }>;
  [key: string]: any;
}

export interface RestaurantAddons {
  offerPopup?: {
    configured?: boolean;
    enabled?: boolean;
    mode?: 'ad' | 'dish';
    itemId?: string;
    specialPrice?: number;
    badgeText?: string;
    title?: string;
    subtitle?: string;
    image?: string;
    buttonText?: string;
  };
  announcementBar?: {
    configured?: boolean;
    enabled?: boolean;
    text?: string;
    bgColor?: string;
    textColor?: string;
  };
  countdownTimer?: {
    configured?: boolean;
    enabled?: boolean;
    title?: string;
    discountType?: 'percent' | 'fixed';
    discountValue?: number;
    discountText?: string;
    endHour?: number;
  };
  customerReviews?: {
    configured?: boolean;
    enabled?: boolean;
    showOnMenu?: boolean;
    allowSubmit?: boolean;
  };
  minOrder?: {
    configured?: boolean;
    enabled?: boolean;
    amount?: number;
    message?: string;
  };
  audioBell?: {
    configured?: boolean;
    enabled?: boolean;
    tone?: 'chime' | 'bell' | 'alert';
    mutedByUser?: boolean;
  };
  happyHour?: {
    configured?: boolean;
    enabled?: boolean;
    title?: string;
    startHour?: number;
    endHour?: number;
    discountPercent?: number;
  };
  limitedTimeDiscount?: {
    configured?: boolean;
    enabled?: boolean;
    discountPercent?: number;
    durationDays?: number;
    startsAt?: number;
    expiresAt?: number;
  };
  freeGiftThreshold?: {
    configured?: boolean;
    enabled?: boolean;
    minAmount?: number;
    giftName?: string;
  };
  cartUpsell?: {
    configured?: boolean;
    enabled?: boolean;
    title?: string;
    maxItems?: number;
  };
  spinWheelPromo?: {
    configured?: boolean;
    enabled?: boolean;
    title?: string;
    prizesText?: string;
  };
  loyaltyPoints?: {
    configured?: boolean;
    enabled?: boolean;
    pointsPerThousand?: number;
    rewardNote?: string;
  };
  cutleryOption?: {
    configured?: boolean;
    enabled?: boolean;
    label?: string;
  };
  firstOrderDiscount?: {
    configured?: boolean;
    enabled?: boolean;
    discountPercent?: number;
    title?: string;
  };
  freeDeliveryProgress?: {
    configured?: boolean;
    enabled?: boolean;
    label?: string;
    minAmount?: number;
  };
  whatsappSupportFloat?: {
    configured?: boolean;
    enabled?: boolean;
    label?: string;
    prefillText?: string;
  };
  groupOrderBillSplit?: {
    configured?: boolean;
    enabled?: boolean;
    maxPeople?: number;
  };
  pickupInstantDiscount?: {
    configured?: boolean;
    enabled?: boolean;
    title?: string;
    discountPercent?: number;
  };
  moodMealFinder?: {
    configured?: boolean;
    enabled?: boolean;
    title?: string;
    buttonText?: string;
  };
  curbsidePickupCar?: {
    configured?: boolean;
    enabled?: boolean;
    instructions?: string;
    allowArrivedPing?: boolean;
  };
  [key: string]: any;
}

export interface MediaLibraryItem {
  id: string;
  name: string;
  url: string;
  createdAt?: number;
}

export interface Restaurant {
  id: string;
  n: string;
  ow?: string;
  ph?: string;
  p?: string;
  planId?: string;
  e?: string;
  a?: number;
  o?: number;
  v?: number;
  done?: number;
  slug?: string;
  subdomain?: string;
  parentRid?: string;
  isBranch?: boolean;
  branchName?: string;
  lay?: MenuLayout;
  themeMode?: 'dark' | 'light' | 'auto';
  dashboardThemeMode?: 'dark' | 'light' | 'auto';
  themePreset?: string;
  themeShape?: MenuThemeShape;
  bgColor?: string;
  currency?: string;
  country?: string;
  region?: string;
  projectType?: string;
  isPaid?: boolean;
  color?: string;
  logo?: string;
  coverImages?: string[];
  taxNote?: string;
  aboutText?: string;
  aboutImage?: string;
  mapUrl?: string;
  googleReviewUrl?: string;
  acceptOrdersWhenClosed?: boolean;
  weeklyHours?: Partial<Record<WorkDayKey, DaySchedule>>;
  demoVersion?: string;
  tagline?: string;
  social?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    snapchat?: string;
    website?: string;
    x?: string;
    whatsapp?: string;
    [key: string]: any;
  };
  deliveryZones?: DeliveryZone[];
  freeDeliveryMin?: number;
  offerPopup?: {
    enabled?: boolean;
    mode?: 'ad' | 'dish';
    itemId?: string;
    specialPrice?: number;
    badgeText?: string;
    title?: string;
    subtitle?: string;
    text?: string;
    image?: string;
    buttonText?: string;
    [key: string]: any;
  };
  addons?: RestaurantAddons;
  mediaLibrary?: MediaLibraryItem[];
  tables?: any[];
  h?: RestaurantHours;
  enabledOrderTypes?: {
    delivery?: boolean;
    pickup?: boolean;
    table?: boolean;
    [key: string]: any;
  };
  telegramPhone?: string;
  telegramChatId?: string;
  telegramLinked?: boolean;
  telegramUnlinkedManually?: boolean;
  telegramUsername?: string;
  telegramNotificationsEnabled?: boolean;
  orderChannel?: 'both' | 'telegram' | 'whatsapp';
  qrDesign?: {
    dotStyle?: 'square' | 'dots' | 'rounded' | 'diamond';
    bgPreset?: 'white' | 'cream' | 'dark' | 'emerald' | 'gold';
    framePreset?: 'minimal' | 'table' | 'classic' | 'badge';
    qrColor?: string;
    showLogo?: boolean;
  };
  [key: string]: any;
}

export interface AvailabilityWindow {
  from: string; // HH:mm
  to: string;   // HH:mm
}

export interface AvailabilitySchedule {
  enabled: boolean;
  from: string; // HH:mm (primary window start)
  to: string;   // HH:mm (primary window end)
  windows?: AvailabilityWindow[]; // optional multiple daily windows
  days?: string[]; // ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] — empty means every day
  behavior?: 'badge' | 'hide'; // 'badge' = show with time label & disable ordering; 'hide' = hide completely outside hours
}

export interface Category {
  id: string;
  rid: string;
  n: string;
  emoji?: string;
  img?: string;
  subtitle?: string;
  date?: string;
  published?: boolean;
  availabilitySchedule?: AvailabilitySchedule;
  o?: number;
  [key: string]: any;
}

export interface MenuItemSize {
  n: string;
  pr?: number;
  p: number;
  cal?: string;
  [key: string]: any;
}

export interface MenuItemExtra {
  n: string;
  pr?: number;
  p: number;
  [key: string]: any;
}

export interface MenuItemBadge {
  type: string;
  text?: string;
  [key: string]: any;
}

export interface ChoiceOption {
  n: string;
  [key: string]: any;
}

export interface MenuItem {
  id: string;
  rid: string;
  cat: string;
  n: string;
  d?: string;
  pr: number;
  beforePrice?: number;
  img?: string;
  o?: number;
  date?: string;
  published?: boolean;
  available?: boolean;
  availabilitySchedule?: AvailabilitySchedule;
  dineInOnly?: boolean;
  noDelivery?: boolean;
  noPickup?: boolean;
  sizes?: MenuItemSize[];
  extras?: MenuItemExtra[];
  choices?: any[];
  maxChoices?: number;
  calories?: number | string;
  prepTime?: string | number;
  badges?: MenuItemBadge[];
  allergens?: string[] | string;
  [key: string]: any;
}

export interface Session {
  u?: string;
  rid?: string;
  personalRid?: string;
  admin?: boolean;
  menuLoggedOut?: boolean;
  phone?: string;
  email?: string;
  [key: string]: any;
}

export interface Account {
  id?: string;
  u?: string;
  em?: string;
  e?: string;
  n?: string;
  phone?: string;
  ph?: string;
  pw?: string;
  rid?: string;
  at?: string;
  r?: string;
  created?: any;
  admin?: boolean;
  [key: string]: any;
}

export interface ActivityLog {
  id: string;
  at: number;
  actor?: string;
  action?: string;
  details?: string;
  type?: string;
  t?: string;
  msg?: string;
  [key: string]: any;
}

export interface AdminNote {
  id: string;
  title: string;
  content: string;
  author?: string;
  category?: string;
  priority?: string;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
  text?: string;
  at?: string | number;
  [key: string]: any;
}

export interface OrderItem {
  id?: string;
  n: string;
  pr?: number;
  p: number;
  origP?: number;
  origPrice?: number;
  discountPct?: number;
  discountAmt?: number;
  q: number;
  img?: string;
  size?: string;
  c?: string;
  extras?: any;
  choices?: string[];
  [key: string]: any;
}

export interface Order {
  id: string;
  rid: string;
  items: OrderItem[];
  total?: number;
  tot: number;
  origSubtotal?: number;
  itemsDiscountTotal?: number;
  menuDiscountLabel?: string;
  firstOrderDiscount?: number;
  firstOrderDiscountPct?: number;
  spinDiscount?: number;
  pickupDiscount?: number;
  pickupDiscountLabel?: string;
  totalDiscount?: number;
  status?: OrderStatus | string;
  st: string;
  type?: OrderType;
  table?: string;
  name?: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt?: string;
  at: number;
  cu?: any;
  [key: string]: any;
}

export interface RestaurantReview {
  id: string;
  rid?: string;
  name: string;
  stars?: number;
  rate?: number;
  comment: string;
  email?: string;
  date?: string;
  at?: number;
  [key: string]: any;
}

export type ProblemReportStatus = 'new' | 'reviewing' | 'in_progress' | 'completed' | 'closed';

export interface ProblemReport {
  id: string;
  seq?: number;
  reportSeq?: number;
  rid: string;
  restaurantName?: string;
  restaurantSlug?: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  message: string;
  image?: string;
  status: ProblemReportStatus | string;
  st?: string;
  at: number;
  createdAt?: string;
  updatedAt?: number;
  [key: string]: any;
}
