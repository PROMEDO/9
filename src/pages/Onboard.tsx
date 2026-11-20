/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Category, MenuItem, Restaurant, SiteSettings } from '../types';
import {
  compressImage,
  deleteItem,
  flushRemoteSync,
  formatNumber,
  getCollection,
  getItem,
  getPlans,
  getSession,
  putItem,
  saveOnboardProfileToServer,
  setSession,
  uid,
} from '../utils/storage';
import { getLocalizedPlanName, resolveRestaurantPlan } from '../utils/plans';
import {
  UtensilsCrossed,
  ShoppingBag,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Globe,
  Clock,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Sun,
  Moon,
  Eye,
  LayoutDashboard,
  SlidersHorizontal,
  Sparkles,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { ImageSuggestionPicker } from '../components/ImageSuggestionPicker';
import { AjaxConfirmModal, AjaxDialogState, INITIAL_AJAX_DIALOG } from '../components/AjaxConfirmModal';
import { AppLogo } from '../components/AppLogo';
import { UnifiedSetupProgressBar, UnifiedSetupStage } from '../components/UnifiedSetupProgressBar';
import {
  DEFAULT_RESTAURANT_TAGLINE,
  ensureRestaurantDefaults,
  getDefaultBusinessMedia,
  getPublicMenuUrlPath,
  getSubdomainBaseDomain,
  isReservedSlug,
  sanitizeProjectTagline,
  sanitizeSlug,
} from '../utils/businessDefaults';
import { seedStoreCatalogForAccount } from '../data/storeSeedCatalog';

interface OnboardingViewProps {
  restaurantId: string;
  site: SiteSettings;
  onNavigate: (hash: string) => void;
  onRefresh: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  restaurantId,
  site: _site,
  onNavigate,
  onRefresh,
}) => {
  let initialRest = getItem<Restaurant>(`restaurants/${restaurantId}`);
  if (!initialRest) {
    initialRest = {
      id: restaurantId,
      n: 'مشروعي الجديد',
      ow: '',
      ph: '',
      p: 'الباقة الاقتصادية',
      planId: 'starter',
      sub: 'شهري',
      e: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      on: 1,
      done: 0,
      lay: 'list',
      themeMode: 'light',
      themePreset: 'clean-light',
      color: '#0F766E',
      projectType: 'restaurant',
      country: 'العراق',
      region: 'بغداد',
      currency: 'د.ع',
      isPaid: true,
    };
    putItem(`restaurants/${restaurantId}`, initialRest);
  }
  const resolvedPlan = resolveRestaurantPlan(initialRest, getPlans());
  const prefersReducedMotion = useReducedMotion();

  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'منيو بلس | تجهيز مشروعك';
    }
  }, []);

  // Steps: 0 = Project Info, 1 = Hours, 2 = Categories, 3 = Items, 4 = Finish ("مبروك"), 5 = Complete Editing ("أكمل التعديل على المنيو")
  const [step, setStep] = useState<number>(0);
  const [isSavingStep, setIsSavingStep] = useState(false);

  // Step 0: Project Identity (Name, Optional Phone without verification, Type, Logo & Cover)
  const initialDefaultLogo = getDefaultBusinessMedia(initialRest.projectType).logo;
  const initialDefaultBanner = getDefaultBusinessMedia(initialRest.projectType).banner;
  const [projectName, setProjectName] = useState<string>(
    initialRest.n && initialRest.n !== 'مشروعي الجديد' ? initialRest.n : ''
  );
  const [projectPhone, setProjectPhone] = useState<string>(initialRest.ph || '');
  const [projectType, setProjectType] = useState<'restaurant' | 'store'>(
    (initialRest.projectType as 'restaurant' | 'store') || 'restaurant'
  );
  const [logoImg, setLogoImg] = useState<string>(
    initialRest.logo && initialRest.logo !== initialDefaultLogo ? initialRest.logo : ''
  );
  const [coverImg, setCoverImg] = useState<string>(
    initialRest.coverImages?.[0] && initialRest.coverImages[0] !== initialDefaultBanner
      ? initialRest.coverImages[0]
      : ''
  );
  const [customSubdomain, setCustomSubdomain] = useState<string>(initialRest?.slug || '');
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const baseDomain = getSubdomainBaseDomain(_site);
  const subdomainEnabled = _site?.subdomainRules?.enabled === true;

  // Step 1: Working Hours
  const [hoursMode, setHoursMode] = useState<'24' | 'c'>(initialRest?.h?.m || '24');
  const [hoursFrom, setHoursFrom] = useState<string>(initialRest?.h?.f || '09:00');
  const [hoursTo, setHoursTo] = useState<string>(initialRest?.h?.t || '23:00');

  // Step 2: Categories
  const [newCatName, setNewCatName] = useState<string>('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatValue, setEditingCatValue] = useState<string>('');

  // Step 3: Items
  const [itemCat, setItemCat] = useState<string>('');
  const [itemName, setItemName] = useState<string>('');
  const [itemPrice, setItemPrice] = useState<number | ''>('');
  const [itemDesc, setItemDesc] = useState<string>('');
  const [itemImage, setItemImage] = useState<string>('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<string>('');

  // Step 5: Complete Menu Customization (Description, Light/Dark mode, Accent color, Layout, Categories, Items)
  const [customizeTab, setCustomizeTab] = useState<'style' | 'cats' | 'items'>('style');
  const [tagline, setTagline] = useState<string>(() =>
    sanitizeProjectTagline(initialRest?.tagline, initialRest?.projectType)
  );
  const [aboutText, setAboutText] = useState<string>(initialRest?.aboutText || '');
  const [menuThemeMode, setMenuThemeMode] = useState<'light' | 'dark'>(
    initialRest?.themeMode === 'dark' ? 'dark' : 'light'
  );
  const [menuColor] = useState<string>(initialRest?.color || '#0F766E');
  const [menuLayout, setMenuLayout] = useState<'list' | 'grid' | 'cards'>(
    initialRest?.lay === 'grid' ? 'grid' : initialRest?.lay === 'cards' ? 'cards' : 'list'
  );

  const [error, setError] = useState<string>('');
  const [ajaxDialog, setAjaxDialog] = useState<AjaxDialogState>(INITIAL_AJAX_DIALOG);
  const itemFormRef = useRef<HTMLFormElement | null>(null);

  React.useEffect(() => {
    const clean = sanitizeSlug(customSubdomain);
    if (!resolvedPlan.perms.customSlug || !clean) {
      setSubdomainStatus('idle');
      return;
    }
    if (clean.length < 3 || isReservedSlug(clean)) {
      setSubdomainStatus('invalid');
      return;
    }
    setSubdomainStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/subdomains/check?slug=${encodeURIComponent(clean)}&excludeRid=${encodeURIComponent(restaurantId)}`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        setSubdomainStatus(data?.available ? 'available' : 'taken');
      } catch {
        setSubdomainStatus('idle');
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [customSubdomain, restaurantId, resolvedPlan.perms.customSlug]);

  const triggerAjaxConfirm = (
    title: string,
    message: string,
    type: 'warn' | 'danger' | 'info',
    confirmLabel: string,
    action: () => void | Promise<void>,
    successMessage: string
  ) => {
    setAjaxDialog({
      isOpen: true,
      type,
      title,
      message,
      confirmLabel,
      isCompleted: false,
      successMessage,
      onConfirm: async () => {
        await action();
        setAjaxDialog((prev) => ({ ...prev, isCompleted: true }));
        setTimeout(() => {
          setAjaxDialog((prev) => ({ ...prev, isOpen: false, isCompleted: false }));
        }, 900);
      },
    });
  };

  const allCategories = getCollection<Category>('cats')
    .filter((c) => c.rid === restaurantId)
    .sort((a, b) => (a.o ?? 0) - (b.o ?? 0));
  const allItems = getCollection<MenuItem>('items')
    .filter((i) => i.rid === restaurantId)
    .sort((a, b) => (a.o ?? 0) - (b.o ?? 0));

  const isStore = projectType === 'store';
  const storeCatSuggestions = [
    'الهواتف الذكية',
    'اللابتوبات والأجهزة اللوحية',
    'السماعات والصوتيات',
    'الساعات الذكية',
    'الشواحن والإكسسوارات',
    'الألعاب والمنزل الذكي',
  ];
  const restCatSuggestions = [
    'البرجر',
    'البيتزا',
    'المشروبات والعصائر',
    'المقبلات',
    'الشاورما والوجبات',
  ];

  const onboardStageMap: Record<number, UnifiedSetupStage> = {
    0: 'onboard-info',
    1: 'onboard-hours',
    2: 'onboard-cats',
    3: 'onboard-items',
    4: 'onboard-ready',
  };

  // Media upload helpers for Logo & Cover
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImage(file, 'logo');
      setLogoImg(b64);
      setError('');
    } catch {
      setError('تعذر قراءة صورة الشعار، يرجى تجربة صورة أخرى.');
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImage(file, 'banner');
      setCoverImg(b64);
      setError('');
    } catch {
      setError('تعذر قراءة صورة الغلاف، يرجى تجربة صورة أخرى.');
    }
  };

  // ============================================================================
  // NAVIGATION HANDLERS
  // ============================================================================
  const handleNext = async () => {
    setError('');
    const currentRest = getItem<Restaurant>(`restaurants/${restaurantId}`) || initialRest!;

    // Step 0: Project Name, Optional Phone, Type, Logo & Cover
    if (step === 0) {
      const cleanName = projectName.trim();
      if (!cleanName) {
        setError('يرجى إدخال اسم المشروع للمتابعة.');
        return;
      }

      let cleanSub = '';
      if (resolvedPlan.perms.customSlug && customSubdomain.trim()) {
        cleanSub = sanitizeSlug(customSubdomain);
        if (cleanSub.length < 3 || isReservedSlug(cleanSub) || subdomainStatus === 'taken') {
          setError(
            subdomainStatus === 'taken'
              ? 'هذا الرابط الفرعي محجوز لمتجر آخر، يرجى اختيار اسم مختلف.'
              : 'الدومين الفرعي غير صالح أو محجوز (استخدم 3 أحرف إنجليزية على الأقل).'
          );
          return;
        }
      }

      const defaults = getDefaultBusinessMedia(projectType);
      const otherType = projectType === 'store' ? 'restaurant' : 'store';
      const otherDefaults = getDefaultBusinessMedia(otherType);
      const finalLogo = logoImg.trim() || defaults.logo;
      const finalCover = [coverImg.trim() || defaults.banner];
      const cleanPhone = projectPhone.trim();

      const curTagline = (currentRest.tagline || '').trim();
      const curAbout = (currentRest.aboutText || '').trim();
      const resolvedTagline =
        !curTagline || curTagline === otherDefaults.tagline ? defaults.tagline : curTagline;
      const resolvedAbout =
        !curAbout || curAbout === otherDefaults.aboutText ? defaults.aboutText : curAbout;

      setIsSavingStep(true);
      try {
        const nextRest = ensureRestaurantDefaults({
          ...currentRest,
          n: cleanName,
          ow: cleanName,
          ph: cleanPhone,
          projectType,
          logo: finalLogo,
          coverImages: finalCover,
          tagline: resolvedTagline,
          aboutText: resolvedAbout,
          ...(cleanSub
            ? { slug: cleanSub, subdomain: subdomainEnabled ? cleanSub : '' }
            : { subdomain: '' }),
        });
        putItem(`restaurants/${restaurantId}`, nextRest);
        setTagline(resolvedTagline);
        setAboutText(resolvedAbout);
        await saveOnboardProfileToServer({
          rid: restaurantId,
          n: cleanName,
          ph: cleanPhone,
          projectType,
          logo: finalLogo,
          coverImages: finalCover,
          tagline: resolvedTagline,
          aboutText: resolvedAbout,
          ...(cleanSub ? { slug: cleanSub } : {}),
        }).catch(() => {});
        onRefresh();
        setStep(1);
      } finally {
        setIsSavingStep(false);
      }
      return;
    }

    // Step 1: Working Hours
    if (step === 1) {
      const nextHours: Restaurant['h'] = {
        m: hoursMode,
        f: hoursMode === 'c' ? hoursFrom : undefined,
        t: hoursMode === 'c' ? hoursTo : undefined,
      };
      setIsSavingStep(true);
      try {
        putItem(`restaurants/${restaurantId}`, {
          ...currentRest,
          h: nextHours,
        });
        await saveOnboardProfileToServer({
          rid: restaurantId,
          h: nextHours,
        }).catch(() => {});
        void flushRemoteSync();
        setStep(2);
      } finally {
        setIsSavingStep(false);
      }
      return;
    }

    // Step 2: Categories
    if (step === 2) {
      if (allCategories.length === 0) {
        setError('يرجى إضافة قسم واحد على الأقل للمتابعة.');
        return;
      }
      if (!itemCat && allCategories.length > 0) {
        setItemCat(allCategories[0].id);
      }
      void flushRemoteSync();
      setStep(3);
      return;
    }

    // Step 3: Items -> Finish (MUST have at least 1 category AND 1 item)
    if (step === 3) {
      if (allCategories.length === 0) {
        setError('يرجى إضافة قسم واحد على الأقل أولاً.');
        setStep(2);
        return;
      }
      if (allItems.length === 0) {
        setError(
          isStore
            ? 'يرجى إضافة منتج واحد على الأقل للمتجر قبل المتابعة.'
            : 'يرجى إضافة عنصر واحد على الأقل للمنيو قبل المتابعة.'
        );
        return;
      }

      setIsSavingStep(true);
      try {
        const finalized = ensureRestaurantDefaults({
          ...currentRest,
          done: 1,
          on: 1,
        });
        putItem(`restaurants/${restaurantId}`, finalized);
        await saveOnboardProfileToServer({
          rid: restaurantId,
          done: 1,
          on: 1,
        }).catch(() => {});
        const curSes = getSession();
        if (!curSes || !curSes.rid) {
          setSession({ email: currentRest.ow || currentRest.n || restaurantId, rid: restaurantId });
        }
        await flushRemoteSync().catch(() => false);
        onRefresh();
        setStep(4);
      } finally {
        setIsSavingStep(false);
      }
    }
  };

  const handleBack = () => {
    setError('');
    if (step === 5) {
      setStep(4);
    } else if (step > 0) {
      setStep((s) => s - 1);
    }
  };

  // Category CRUD
  const handleAddCategory = (nameToAdd?: string) => {
    const n = (nameToAdd || newCatName).trim();
    if (!n) return;

    if (resolvedPlan.maxCats !== -1 && allCategories.length >= resolvedPlan.maxCats) {
      const localizedPlan = getLocalizedPlanName(resolvedPlan.plan, 'ar');
      setError(`وصلت إلى الحد الأقصى للأقسام في ${localizedPlan} (${resolvedPlan.maxCats} أقسام).`);
      return;
    }

    if (allCategories.some((c) => c.n.toLowerCase() === n.toLowerCase())) {
      setError('هذا القسم موجود مسبقاً.');
      return;
    }

    const catId = uid();
    putItem<Category>(`cats/${catId}`, {
      id: catId,
      rid: restaurantId,
      n,
      o: allCategories.length,
    });
    setNewCatName('');
    setError('');
    if (!itemCat) setItemCat(catId);
    onRefresh();
  };

  const handleSaveCategoryRename = (cat: Category) => {
    const clean = editingCatValue.trim();
    if (!clean) return;
    putItem<Category>(`cats/${cat.id}`, { ...cat, n: clean });
    setEditingCatId(null);
    setEditingCatValue('');
    onRefresh();
  };

  const handleDeleteCategory = (catId: string) => {
    const targetCat = allCategories.find((c) => c.id === catId);
    triggerAjaxConfirm(
      'تأكيد حذف القسم',
      `هل أنت متأكد من حذف القسم "${targetCat?.n || ''}" وكافة العناصر المرتبطة به؟`,
      'danger',
      'حذف',
      () => {
        deleteItem(`cats/${catId}`);
        allItems.filter((it) => it.cat === catId).forEach((it) => deleteItem(`items/${it.id}`));
        if (itemCat === catId) {
          const remaining = allCategories.filter((c) => c.id !== catId);
          setItemCat(remaining[0]?.id || '');
        }
        onRefresh();
      },
      'تم حذف القسم'
    );
  };

  // Item CRUD
  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const targetCat = itemCat || allCategories[0]?.id;
    if (!targetCat) {
      setError('يرجى إضافة أو اختيار قسم أولاً.');
      return;
    }

    const trimmedName = itemName.trim();
    if (!trimmedName) {
      setError(isStore ? 'يرجى كتابة اسم المنتج.' : 'يرجى كتابة اسم العنصر.');
      return;
    }

    const numericPrice = Number(itemPrice);
    if (itemPrice === '' || isNaN(numericPrice) || numericPrice < 0) {
      setError('يرجى إدخال السعر بشكل صحيح.');
      return;
    }

    if (!editingItemId && resolvedPlan.maxItems !== -1 && allItems.length >= resolvedPlan.maxItems) {
      const localizedPlan = getLocalizedPlanName(resolvedPlan.plan, 'ar');
      setError(`وصلت إلى الحد الأقصى للعناصر في ${localizedPlan} (${resolvedPlan.maxItems} عنصر).`);
      return;
    }

    const existingItem = editingItemId ? allItems.find((x) => x.id === editingItemId) : undefined;
    const itemId = editingItemId || uid();
    putItem<MenuItem>(`items/${itemId}`, {
      ...(existingItem || {}),
      id: itemId,
      rid: restaurantId,
      cat: targetCat,
      n: trimmedName,
      pr: numericPrice,
      d: itemDesc.trim(),
      img: itemImage.trim() || undefined,
      available: existingItem?.available ?? true,
      o: existingItem?.o ?? allItems.length,
    });

    setItemName('');
    setItemPrice('');
    setItemDesc('');
    setItemImage('');
    setEditingItemId(null);
    setSavedBanner(`✓ تم حفظ "${trimmedName}"`);
    setTimeout(() => setSavedBanner(''), 2200);
    onRefresh();
  };

  const handleStartEditItem = (it: MenuItem) => {
    setEditingItemId(it.id);
    setItemCat(it.cat);
    setItemName(it.n);
    setItemPrice(it.pr);
    setItemDesc(it.d || '');
    setItemImage(it.img || '');
    setError('');
    itemFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImage(file, 'item');
      setItemImage(b64);
    } catch {
      setError('تعذر قراءة الصورة، يرجى تجربة صورة أخرى.');
    }
  };

  // Save Customization (Step 5)
  const handleSaveCustomization = async (redirectTarget?: string) => {
    setIsSavingStep(true);
    setError('');
    try {
      const currentRest = getItem<Restaurant>(`restaurants/${restaurantId}`) || initialRest!;
      const defaults = getDefaultBusinessMedia(projectType);
      const finalLogo = logoImg.trim() || currentRest.logo || defaults.logo;
      const finalCover = [coverImg.trim() || currentRest.coverImages?.[0] || defaults.banner];
      const nextRest = ensureRestaurantDefaults({
        ...currentRest,
        n: projectName.trim() || currentRest.n,
        ph: projectPhone.trim(),
        projectType,
        logo: finalLogo,
        coverImages: finalCover,
        tagline: sanitizeProjectTagline(tagline, projectType),
        aboutText: aboutText.trim(),
        themeMode: isStore ? 'light' : menuThemeMode,
        themePreset: isStore ? 'estore' : menuThemeMode === 'dark' ? 'dark-obsidian' : 'clean-light',
        themeShape: isStore ? 'estore' : 'modern',
        color: isStore ? '#f15a29' : menuColor,
        lay: isStore ? 'grid4' : menuLayout,
        done: 1,
        on: 1,
      });
      putItem(`restaurants/${restaurantId}`, nextRest);
      await saveOnboardProfileToServer({
        rid: restaurantId,
        n: nextRest.n,
        ph: nextRest.ph,
        projectType,
        logo: finalLogo,
        coverImages: finalCover,
        tagline: sanitizeProjectTagline(tagline, projectType),
        aboutText: aboutText.trim(),
        themeMode: isStore ? 'light' : menuThemeMode,
        themePreset: isStore ? 'estore' : menuThemeMode === 'dark' ? 'dark-obsidian' : 'clean-light',
        themeShape: isStore ? 'estore' : 'modern',
        color: isStore ? '#f15a29' : menuColor,
        lay: isStore ? 'grid4' : menuLayout,
        done: 1,
        on: 1,
      }).catch(() => {});
      await flushRemoteSync().catch(() => false);
      onRefresh();
      setSavedBanner('✓ تم حفظ جميع التعديلات بنجاح');
      setTimeout(() => setSavedBanner(''), 2500);
      if (redirectTarget) {
        onNavigate(redirectTarget);
      }
    } finally {
      setIsSavingStep(false);
    }
  };

  const latestRest = getItem<Restaurant>(`restaurants/${restaurantId}`) || initialRest;
  const previewPath = getPublicMenuUrlPath(latestRest, resolvedPlan);

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--ink)',
        padding: '24px 16px 56px',
        maxWidth: '640px',
        margin: '0 auto',
        position: 'relative',
      }}
    >
      {/* Top Header */}
      <div style={{ textAlign: 'center', marginBottom: '18px' }}>
        <div
          onClick={() => onNavigate('/')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            cursor: 'pointer',
            marginBottom: '8px',
          }}
          aria-label="منيو بلس"
        >
          <AppLogo size={42} />
        </div>
        <h1 style={{ fontSize: '21px', fontWeight: 900, margin: '0 0 4px', color: 'var(--ink)' }}>
          {projectName.trim() || 'تجهيز مشروعك'}
        </h1>
        <p className="muted" style={{ fontSize: '13px', margin: 0 }}>
          {isStore ? 'أكمل الخطوات السريعة لتجهيز متجرك الإلكتروني' : 'أكمل الخطوات السريعة لتجهيز منيوك الإلكتروني'}
        </p>
      </div>

      {/* Single Unified Box: Aurora Progress Bar + Active Step Content + Navigation */}
      <motion.div
        className="card mp-unified-card"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        {step < 5 && (
          <UnifiedSetupProgressBar stage={onboardStageMap[step] || 'onboard-info'} integrated isStore={isStore} />
        )}

        <motion.div
          key={step}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          style={{ padding: '20px 22px 24px' }}
        >
          {error && (
            <div className="mp-inline-status is-err" role="alert" style={{ marginBottom: '14px' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* ================================================================ */}
          {/* STEP 0: اسم المشروع + نوع النشاط + الصور                        */}
          {/* ================================================================ */}
          {step === 0 && (
            <div>
          <div style={{ marginBottom: '22px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 6px', color: 'var(--ink)' }}>
              بيانات المشروع الأساسية
            </h2>
            <p className="muted" style={{ fontSize: '13.5px', margin: 0 }}>
              أدخل اسم مشروعك واختر نوع النشاط للانطلاق
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* 1. اسم المشروع */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 800, marginBottom: '7px', color: 'var(--ink)' }}>
                اسم المشروع <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="مثال: مطعم الباشا أو متجر النخبة"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--line)',
                  background: 'var(--bg)',
                  fontSize: '14.5px',
                  fontWeight: 600,
                }}
                required
                autoFocus
              />
            </div>

            {/* 2. نوع المشروع: مطعم أو كافيه / متجر أو محل */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 800, marginBottom: '9px', color: 'var(--ink)' }}>
                نوع المشروع
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setProjectType('restaurant')}
                  style={{
                    textAlign: 'start',
                    padding: '16px',
                    borderRadius: '16px',
                    border: projectType === 'restaurant' ? '2px solid var(--brand)' : '1px solid var(--line)',
                    background: projectType === 'restaurant' ? 'var(--soft)' : 'var(--surface)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      background: projectType === 'restaurant' ? 'var(--brand)' : 'var(--bg)',
                      color: projectType === 'restaurant' ? '#ffffff' : 'var(--ink)',
                      border: '1px solid var(--line)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <UtensilsCrossed size={22} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--ink)', marginBottom: '2px' }}>
                      مطعم أو كافيه
                    </div>
                    <div className="muted" style={{ fontSize: '12px' }}>
                      للمأكولات والمشروبات والحلويات
                    </div>
                  </div>
                  {projectType === 'restaurant' && (
                    <CheckCircle2 size={20} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProjectType('store');
                    if (tagline.trim() === DEFAULT_RESTAURANT_TAGLINE) {
                      setTagline('');
                    }
                  }}
                  style={{
                    textAlign: 'start',
                    padding: '16px',
                    borderRadius: '16px',
                    border: projectType === 'store' ? '2px solid var(--brand)' : '1px solid var(--line)',
                    background: projectType === 'store' ? 'var(--soft)' : 'var(--surface)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      background: projectType === 'store' ? 'var(--brand)' : 'var(--bg)',
                      color: projectType === 'store' ? '#ffffff' : 'var(--ink)',
                      border: '1px solid var(--line)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <ShoppingBag size={22} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--ink)', marginBottom: '2px' }}>
                      متجر أو محل
                    </div>
                    <div className="muted" style={{ fontSize: '12px' }}>
                      للمنتجات والبضائع والتسوق
                    </div>
                  </div>
                  {projectType === 'store' && (
                    <CheckCircle2 size={20} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                  )}
                </button>
              </div>
            </div>

            {/* 4. صورة المشروع والغلاف */}
            <div style={{ paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>
                  {isStore ? 'صورة المتجر والغلاف' : 'صورة المطعم والغلاف'}{' '}
                  <span className="muted" style={{ fontWeight: 700, fontSize: '13px' }}>
                    (اختياري)
                  </span>
                </span>
                <span className="muted" style={{ fontSize: '12px', fontWeight: 600 }}>
                  يمكن تعديله لاحقاً
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {/* Logo upload */}
                <div
                  style={{
                    border: 0,
                    borderRadius: '14px',
                    padding: '14px 12px',
                    background: 'var(--panel)',
                    textAlign: 'center',
                    position: 'relative',
                  }}
                >
                  <label style={{ cursor: 'pointer', display: 'block' }}>
                    <input type="file" accept="image/*" hidden onChange={handleLogoUpload} />
                    {logoImg ? (
                      <img
                        src={logoImg}
                        alt="شعار المشروع"
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '12px',
                          objectFit: 'cover',
                          margin: '0 auto 8px',
                          border: '1px solid var(--line)',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          background: 'var(--soft)',
                          color: 'var(--brand)',
                          display: 'grid',
                          placeItems: 'center',
                          margin: '0 auto 8px',
                        }}
                      >
                        <ImageIcon size={22} />
                      </div>
                    )}
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>
                      {logoImg
                        ? 'تغيير صورة الشعار'
                        : isStore
                        ? 'إضافة صورة المتجر'
                        : 'إضافة صورة المطعم'}
                    </div>
                  </label>
                  {logoImg && (
                    <button
                      type="button"
                      onClick={() => setLogoImg('')}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        insetInlineEnd: '8px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        color: 'var(--muted)',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                      }}
                      title="إزالة الصورة"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Cover upload */}
                <div
                  style={{
                    border: 0,
                    borderRadius: '14px',
                    padding: '14px 12px',
                    background: 'var(--panel)',
                    textAlign: 'center',
                    position: 'relative',
                  }}
                >
                  <label style={{ cursor: 'pointer', display: 'block' }}>
                    <input type="file" accept="image/*" hidden onChange={handleCoverUpload} />
                    {coverImg ? (
                      <img
                        src={coverImg}
                        alt="غلاف المنيو"
                        style={{
                          width: '100%',
                          maxWidth: '140px',
                          height: '64px',
                          borderRadius: '10px',
                          objectFit: 'cover',
                          margin: '0 auto 8px',
                          border: '1px solid var(--line)',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          background: 'var(--soft)',
                          color: 'var(--brand)',
                          display: 'grid',
                          placeItems: 'center',
                          margin: '0 auto 8px',
                        }}
                      >
                        <ImageIcon size={22} />
                      </div>
                    )}
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>
                      {coverImg ? 'تغيير صورة الغلاف' : 'إضافة صورة الغلاف'}
                    </div>
                  </label>
                  {coverImg && (
                    <button
                      type="button"
                      onClick={() => setCoverImg('')}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        insetInlineEnd: '8px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        color: 'var(--muted)',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                      }}
                      title="إزالة الصورة"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Handle / Subdomain only if unlocked on plan */}
            {resolvedPlan.perms.customSlug && (
              <div style={{ paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Globe size={17} style={{ color: 'var(--brand)' }} />
                  <b style={{ fontSize: '13.5px' }}>
                    {subdomainEnabled
                      ? 'الرابط الفرعي المخصص (اختياري)'
                      : isStore
                      ? 'رابط المتجر باسم حسابك (اختياري)'
                      : 'رابط المنيو باسم حسابك (اختياري)'}
                  </b>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} dir="ltr">
                  {!subdomainEnabled && (
                    <span className="muted" style={{ fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {baseDomain}/
                    </span>
                  )}
                  <input
                    type="text"
                    value={customSubdomain}
                    onChange={(e) => setCustomSubdomain(sanitizeSlug(e.target.value))}
                    placeholder="mystore"
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                    }}
                  />
                  {subdomainEnabled && (
                    <span className="muted" style={{ fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
                      .{baseDomain}
                    </span>
                  )}
                </div>
                {subdomainStatus !== 'idle' && (
                  <div
                    style={{
                      marginTop: '6px',
                      fontSize: '12px',
                      fontWeight: 800,
                      color:
                        subdomainStatus === 'available'
                          ? 'var(--brand)'
                          : subdomainStatus === 'checking'
                          ? 'var(--muted)'
                          : '#ef4444',
                    }}
                  >
                    {subdomainStatus === 'checking' && 'جاري فحص توفر الرابط...'}
                    {subdomainStatus === 'available' && '✓ هذا الرابط متاح'}
                    {subdomainStatus === 'taken' && '✕ هذا الرابط محجوز مسبقاً'}
                    {subdomainStatus === 'invalid' && '✕ يجب أن يتكون من 3 أحرف إنجليزية على الأقل'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 1: ساعات التواجد                                              */}
      {/* ================================================================ */}
      {step === 1 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Clock size={22} style={{ color: 'var(--brand)' }} />
            <h2 style={{ fontSize: '20px', fontWeight: 900, margin: 0 }}>
              ساعات التواجد والعمل
            </h2>
          </div>
          <p className="muted" style={{ fontSize: '13.5px', marginBottom: '20px' }}>
            حدد أوقات العمل ليظهر للزبون حالة مشروعك (مفتوح / مغلق):
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                borderRadius: '14px',
                border: hoursMode === '24' ? '2px solid var(--brand)' : '1px solid var(--line)',
                background: hoursMode === '24' ? 'var(--soft)' : 'var(--surface)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="hoursMode"
                checked={hoursMode === '24'}
                onChange={() => setHoursMode('24')}
                style={{ width: '18px', height: '18px' }}
              />
              <div>
                <b style={{ fontSize: '15px', display: 'block' }}>مفتوح على مدار 24 ساعة</b>
                <span className="muted" style={{ fontSize: '12.5px' }}>
                  يستقبل الطلبات طوال اليوم دون توقف
                </span>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                borderRadius: '14px',
                border: hoursMode === 'c' ? '2px solid var(--brand)' : '1px solid var(--line)',
                background: hoursMode === 'c' ? 'var(--soft)' : 'var(--surface)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="hoursMode"
                checked={hoursMode === 'c'}
                onChange={() => setHoursMode('c')}
                style={{ width: '18px', height: '18px' }}
              />
              <div>
                <b style={{ fontSize: '15px', display: 'block' }}>ساعات عمل محددة يومياً</b>
                <span className="muted" style={{ fontSize: '12.5px' }}>
                  يفتح ويغلق في أوقات محددة كل يوم
                </span>
              </div>
            </label>
          </div>

          {hoursMode === '24' && (
            <div role="alert" className="mp-warn-note">
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b className="mp-warn-note-title">
                  تنبيه مهم بخصوص أوقات العمل (24 ساعة):
                </b>
                <span>
                  عند اختيار «مفتوح على مدار 24 ساعة»، سيظهر مشروعك مفتوحاً للزبائن وستستقبل الطلبات على مدار الوقت طوال اليوم دون توقف.
                </span>
              </div>
            </div>
          )}

          {hoursMode === 'c' && (
            <div
              style={{
                paddingTop: '14px',
                borderTop: '1px solid var(--line)',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
              }}
            >
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  يفتح من الساعة:
                </label>
                <input
                  type="time"
                  value={hoursFrom}
                  onChange={(e) => setHoursFrom(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '10px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  يغلق في الساعة:
                </label>
                <input
                  type="time"
                  value={hoursTo}
                  onChange={(e) => setHoursTo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '10px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 2: تحديد الأقسام (بسيط ومرتب)                                */}
      {/* ================================================================ */}
      {step === 2 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Layers size={21} style={{ color: 'var(--brand)' }} />
              <h2 style={{ fontSize: '20px', fontWeight: 900, margin: 0 }}>
                تحديد الأقسام
              </h2>
            </div>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '8px',
                background: 'var(--soft)',
                color: 'var(--brand-ink, var(--brand))',
                border: '1px solid var(--line)',
              }}
            >
              {allCategories.length} {resolvedPlan.maxCats !== -1 ? `/ ${resolvedPlan.maxCats}` : 'قسم'}
            </span>
          </div>
          <p className="muted" style={{ fontSize: '13.5px', marginBottom: '18px' }}>
            {isStore
              ? 'أضف أقسام متجرك بكتابة الاسم أو اختيار قسم جاهز، أو استورد الكتالوج المتكامل بنقرة واحدة:'
              : 'أضف أقسام قائمة طعامك بكتابة الاسم أو اختيار قسم جاهز:'}
          </p>

          {savedBanner && (
            <div
              style={{
                marginBottom: '12px',
                padding: '9px 14px',
                borderRadius: '10px',
                background: 'var(--soft)',
                border: '1px solid var(--line)',
                color: 'var(--brand-ink, var(--brand))',
                fontSize: '13px',
                fontWeight: 800,
                textAlign: 'center',
              }}
            >
              {savedBanner}
            </div>
          )}

          {isStore && (
            <div style={{ marginBottom: '14px' }}>
              <button
                type="button"
                className="btn s"
                onClick={() => {
                  const added = seedStoreCatalogForAccount(restaurantId, latestRest.currency || 'د.ع', 'append_missing');
                  onRefresh();
                  setSavedBanner(added.catsAdded + added.itemsAdded > 0 ? '✓ تم إضافة أقسام ومنتجات المتجر الجاهزة بنجاح' : '✓ جميع أقسام ومنتجات المتجر مضافة بالفعل');
                  setTimeout(() => setSavedBanner(''), 2500);
                }}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: 800,
                  borderRadius: '12px',
                  padding: '10px 14px',
                  border: '1px solid var(--brand)',
                  color: 'var(--brand-ink, var(--brand))',
                }}
              >
                <Sparkles size={15} />
                <span>تعبئة أقسام ومنتجات المتجر الجاهزة بنقرة واحدة</span>
              </button>
            </div>
          )}

          {/* Add Input */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCategory();
                }
              }}
              placeholder={isStore ? 'اكتب اسم القسم (مثال: الهواتف الذكية)' : 'اكتب اسم القسم (مثال: البرجر)'}
              style={{
                flex: 1,
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                fontSize: '14px',
              }}
            />
            <button
              type="button"
              className="btn p"
              onClick={() => handleAddCategory()}
              style={{ padding: '12px 18px', fontWeight: 800, borderRadius: '12px', whiteSpace: 'nowrap' }}
            >
              <Plus size={16} />
              <span>إضافة</span>
            </button>
          </div>

          {/* Quick Suggestions */}
          <div style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
              اقتراحات سريعة:
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(isStore ? storeCatSuggestions : restCatSuggestions).map((sug) => {
                const alreadyAdded = allCategories.some((c) => c.n.toLowerCase() === sug.toLowerCase());
                return (
                  <button
                    key={sug}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => handleAddCategory(sug)}
                    style={{
                      background: alreadyAdded ? 'var(--soft)' : 'var(--bg)',
                      border: alreadyAdded ? '1px solid var(--brand)' : '1px solid var(--line)',
                      color: alreadyAdded ? 'var(--brand-ink, var(--brand))' : 'var(--ink)',
                      borderRadius: '10px',
                      padding: '6px 12px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: alreadyAdded ? 'default' : 'pointer',
                      opacity: alreadyAdded ? 0.8 : 1,
                    }}
                  >
                    {alreadyAdded ? `✓ ${sug}` : `+ ${sug}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Categories List */}
          {allCategories.length === 0 ? (
            <div
              style={{
                borderRadius: '12px',
                padding: '20px',
                background: 'var(--panel)',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: '13.5px',
              }}
            >
              لم تضف أي قسم بعد. اكتب اسم القسم أو اختر من الاقتراحات أعلاه.
            </div>
          ) : (
            <div style={{ borderTop: '1px solid var(--line)' }}>
              {allCategories.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '10px 4px',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  {editingCatId === c.id ? (
                    <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                      <input
                        type="text"
                        value={editingCatValue}
                        onChange={(e) => setEditingCatValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveCategoryRename(c);
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid var(--brand)',
                          background: 'var(--surface)',
                          fontSize: '14px',
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn p s"
                        onClick={() => handleSaveCategoryRename(c)}
                      >
                        حفظ
                      </button>
                      <button
                        type="button"
                        className="btn s"
                        onClick={() => setEditingCatId(null)}
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '8px',
                            background: 'var(--surface)',
                            border: '1px solid var(--line)',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: '12px',
                            fontWeight: 800,
                            color: 'var(--brand)',
                            flexShrink: 0,
                          }}
                        >
                          {i + 1}
                        </span>
                        <b style={{ fontSize: '14.5px', color: 'var(--ink)' }}>{c.n}</b>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCatId(c.id);
                            setEditingCatValue(c.n);
                          }}
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--line)',
                            color: 'var(--ink)',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Pencil size={12} />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(c.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#dc2626',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Trash2 size={12} />
                          <span>حذف</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 3: تحديد العناصر (بسيط ومرتب)                                */}
      {/* ================================================================ */}
      {step === 3 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 900, margin: 0 }}>
              {isStore ? 'تحديد المنتجات' : 'تحديد العناصر والأصناف'}
            </h2>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '8px',
                background: 'var(--soft)',
                color: 'var(--brand-ink, var(--brand))',
                border: '1px solid var(--line)',
              }}
            >
              {allItems.length} {resolvedPlan.maxItems !== -1 ? `/ ${resolvedPlan.maxItems}` : isStore ? 'منتج' : 'عنصر'}
            </span>
          </div>
          <p className="muted" style={{ fontSize: '13.5px', marginBottom: '12px' }}>
            {isStore
              ? 'اختر القسم ثم أضف اسم المنتج وسعره، أو استورد منتجات المتجر الجاهزة بنقرة واحدة:'
              : 'اختر القسم ثم أضف الاسم والسعر، ويمكنك تعديل أي عنصر في أي وقت:'}
          </p>
          {isStore && (
            <div style={{ marginBottom: '14px' }}>
              <button
                type="button"
                className="btn s"
                onClick={() => {
                  const added = seedStoreCatalogForAccount(restaurantId, latestRest.currency || 'د.ع', 'append_missing');
                  onRefresh();
                  setSavedBanner(added.catsAdded + added.itemsAdded > 0 ? '✓ تم استيراد منتجات المتجر الجاهزة بنجاح' : '✓ منتجات المتجر مضافة بالفعل');
                  setTimeout(() => setSavedBanner(''), 2500);
                }}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: 800,
                  borderRadius: '12px',
                  padding: '9px 14px',
                  border: '1px solid var(--brand)',
                  color: 'var(--brand-ink, var(--brand))',
                }}
              >
                <Sparkles size={15} />
                <span>تعبئة منتجات متجر جاهزة بالصور والأسعار</span>
              </button>
            </div>
          )}

          {/* Quick Category Pills */}
          {allCategories.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {allCategories.map((c) => {
                const active = (itemCat || allCategories[0]?.id) === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setItemCat(c.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '10px',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      border: active ? '1px solid var(--brand)' : '1px solid var(--line)',
                      background: active ? 'var(--brand)' : 'var(--bg)',
                      color: active ? '#ffffff' : 'var(--ink)',
                    }}
                  >
                    {c.n}
                  </button>
                );
              })}
            </div>
          )}

          <form ref={itemFormRef} onSubmit={handleSaveItem} style={{ marginBottom: '20px' }}>
            {savedBanner && (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '9px 14px',
                  borderRadius: '10px',
                  background: 'var(--soft)',
                  border: '1px solid var(--line)',
                  color: 'var(--brand-ink, var(--brand))',
                  fontSize: '13px',
                  fontWeight: 800,
                  textAlign: 'center',
                }}
              >
                {savedBanner}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 800, display: 'block', marginBottom: '5px' }}>
                    {isStore ? 'اسم المنتج' : 'اسم العنصر'} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder={isStore ? 'مثال: iPhone 16 Pro Max' : 'مثال: برجر كلاسيك'}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      fontSize: '13.5px',
                    }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 800, display: 'block', marginBottom: '5px' }}>
                    السعر ({latestRest.currency || 'د.ع'}) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="250"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value ? Number(e.target.value) : '')}
                    placeholder="7000"
                    dir="ltr"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      fontSize: '13.5px',
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
                    وصف مختصر
                  </label>
                  <input
                    type="text"
                    value={itemDesc}
                    onChange={(e) => setItemDesc(e.target.value)}
                    placeholder={isStore ? 'مواصفات المنتج...' : 'مكونات الوجبة أو الإضافات...'}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
                  {itemImage ? (
                    <img
                      src={itemImage}
                      alt="معاينة"
                      style={{ width: '22px', height: '22px', borderRadius: '6px', objectFit: 'cover' }}
                    />
                  ) : (
                    <ImageIcon size={16} />
                  )}
                  <span>{itemImage ? 'تغيير الصورة' : 'صورة'}</span>
                </label>
              </div>

              {itemName.trim() && (
                <div>
                  <ImageSuggestionPicker
                    productName={itemName}
                    categoryName={allCategories.find((c) => c.id === (itemCat || allCategories[0]?.id))?.n}
                    currentImage={itemImage}
                    onSelect={(imgUrl) => setItemImage(imgUrl)}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="submit"
                  className="btn p b"
                  style={{ flex: 1, padding: '11px', fontSize: '14px', fontWeight: 800 }}
                >
                  {editingItemId
                    ? isStore
                      ? '✓ حفظ تعديلات المنتج'
                      : '✓ حفظ تعديلات العنصر'
                    : isStore
                    ? '+ إضافة المنتج'
                    : '+ إضافة العنصر'}
                </button>
                {editingItemId && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditingItemId(null);
                      setItemName('');
                      setItemPrice('');
                      setItemDesc('');
                      setItemImage('');
                    }}
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Added Items List */}
          <div style={{ paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '10px' }}>
              {isStore ? 'المنتجات المضافة' : 'العناصر المضافة'} ({allItems.length}):
            </h4>
            {allItems.length === 0 ? (
              <div
                style={{
                  borderRadius: '12px',
                  padding: '20px',
                  background: 'var(--panel)',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  fontSize: '13.5px',
                }}
              >
                {isStore
                  ? 'لم تضف منتجات بعد. يرجى إضافة منتج واحد على الأقل أعلاه للمتابعة.'
                  : 'لم تضف عناصر بعد. يرجى إضافة عنصر واحد على الأقل أعلاه للمتابعة.'}
              </div>
            ) : (
              <div style={{ borderTop: '1px solid var(--line)' }}>
                {allItems.map((it) => {
                  const catName = allCategories.find((c) => c.id === it.cat)?.n || '';
                  return (
                    <div
                      key={it.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '10px 4px',
                        borderBottom: '1px solid var(--line)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        {it.img ? (
                          <img
                            src={it.img}
                            alt={it.n}
                            style={{ width: '44px', height: '44px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: '10px',
                              background: 'var(--surface)',
                              border: '1px solid var(--line)',
                              display: 'grid',
                              placeItems: 'center',
                              fontSize: '18px',
                              flexShrink: 0,
                            }}
                          >
                            {isStore ? '🛍️' : '🍽️'}
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <b style={{ fontSize: '14.5px', display: 'block', color: 'var(--ink)' }}>{it.n}</b>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                            <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--brand)' }}>
                              {formatNumber(it.pr)} {latestRest.currency || 'د.ع'}
                            </span>
                            {catName && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  background: 'var(--surface)',
                                  border: '1px solid var(--line)',
                                  color: 'var(--muted)',
                                }}
                              >
                                {catName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleStartEditItem(it)}
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--line)',
                            color: 'var(--ink)',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            triggerAjaxConfirm(
                              'تأكيد حذف العنصر',
                              `هل أنت متأكد من حذف "${it.n}"؟`,
                              'danger',
                              'حذف',
                              () => {
                                deleteItem(`items/${it.id}`);
                                onRefresh();
                              },
                              'تم الحذف بنجاح'
                            );
                          }}
                          style={{
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#dc2626',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 4: مبروك! المنيو جاهز مع 3 أزرار رئيسية                      */}
      {/* ================================================================ */}
      {step === 4 && (
        <div style={{ padding: '12px 4px', textAlign: 'center' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'var(--soft)',
              color: 'var(--brand)',
              border: '1px solid var(--line)',
              margin: '0 auto 16px',
              display: 'grid',
              placeItems: 'center',
              fontSize: '34px',
            }}
          >
            🎉
          </div>

          <h2 style={{ fontSize: '23px', fontWeight: 900, marginBottom: '10px', color: 'var(--ink)' }}>
            {isStore ? 'مبروك! متجرك الإلكتروني جاهز الآن' : 'مبروك! المنيو الخاص بمشروعك جاهز الآن'}
          </h2>

          <p
            style={{
              fontSize: '14.5px',
              color: 'var(--muted)',
              lineHeight: 1.75,
              maxWidth: '520px',
              margin: '0 auto 24px',
            }}
          >
            {isStore
              ? `تم تجهيز متجر ${projectName.trim() || latestRest.n} (${allCategories.length} أقسام • ${allItems.length} منتجات). يمكنك الآن إكمال التعديلات وإضافة المزيد أو معاينة المتجر مباشرة.`
              : `تم تجهيز منيو ${projectName.trim() || latestRest.n} (${allCategories.length} أقسام • ${allItems.length} عناصر). يمكنك الآن إكمال التعديلات وإضافة المزيد أو معاينة المنيو مباشرة.`}
          </p>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              maxWidth: '420px',
              margin: '0 auto',
            }}
          >
            {/* زر 1: أكمل التعديل */}
            <button
              type="button"
              onClick={() => {
                setError('');
                setCustomizeTab('style');
                setStep(5);
              }}
              className="btn p b"
              style={{
                padding: '14px 18px',
                fontSize: '15.5px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <SlidersHorizontal size={18} />
              <span>{isStore ? 'أكمل التعديل على المتجر' : 'أكمل التعديل على المنيو'}</span>
            </button>

            {/* زر 2: معاينة */}
            <a
              href={previewPath}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(previewPath);
              }}
              className="btn b"
              style={{
                padding: '14px 18px',
                fontSize: '15px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                textDecoration: 'none',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                color: 'var(--ink)',
              }}
            >
              <Eye size={18} />
              <span>{isStore ? 'معاينة شكل المتجر' : 'معاينة شكل المنيو'}</span>
            </a>

            {/* زر 3: لوحة التحكم */}
            <button
              type="button"
              onClick={() => {
                const currentRest = getItem<Restaurant>(`restaurants/${restaurantId}`) || initialRest!;
                putItem(`restaurants/${restaurantId}`, {
                  ...currentRest,
                  done: 1,
                  on: 1,
                });
                const curSes = getSession();
                if (!curSes || !curSes.rid) {
                  setSession({ email: currentRest.ow || currentRest.n || restaurantId, rid: restaurantId });
                }
                void flushRemoteSync();
                onNavigate('/dashboard/home');
              }}
              className="btn b"
              style={{
                padding: '14px 18px',
                fontSize: '15px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                color: 'var(--ink)',
              }}
            >
              <LayoutDashboard size={18} />
              <span>لوحة التحكم</span>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 5: أكمل التعديل على المنيو (وصف، فاتح/غامق، ألوان، أقسام، عناصر) */}
      {/* ================================================================ */}
      {step === 5 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 4px' }}>
                {isStore ? 'إكمال التعديل على المتجر' : 'إكمال التعديل على المنيو'}
              </h2>
              <p className="muted" style={{ fontSize: '13px', margin: 0 }}>
                {isStore
                  ? 'أضف وصف متجرك ونبذته، أو أضف أقساماً ومنتجات جديدة'
                  : 'أضف وصف المشروع، اختر المظهر الفاتح أو الغامق، أو أضف أقساماً وعناصر جديدة'}
              </p>
            </div>
            <button
              type="button"
              className="btn s"
              onClick={() => setStep(4)}
              style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>السابق</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {savedBanner && (
            <div
              style={{
                marginBottom: '14px',
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'var(--soft)',
                border: '1px solid var(--line)',
                color: 'var(--brand-ink, var(--brand))',
                fontSize: '13px',
                fontWeight: 800,
                textAlign: 'center',
              }}
            >
              {savedBanner}
            </div>
          )}

          {/* Sub-tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '20px' }}>
            <button
              type="button"
              className={`btn s${customizeTab === 'style' ? ' p' : ''}`}
              onClick={() => setCustomizeTab('style')}
              style={{ justifyContent: 'center', fontWeight: 800 }}
            >
              الوصف والمظهر
            </button>
            <button
              type="button"
              className={`btn s${customizeTab === 'cats' ? ' p' : ''}`}
              onClick={() => setCustomizeTab('cats')}
              style={{ justifyContent: 'center', fontWeight: 800 }}
            >
              الأقسام ({allCategories.length})
            </button>
            <button
              type="button"
              className={`btn s${customizeTab === 'items' ? ' p' : ''}`}
              onClick={() => setCustomizeTab('items')}
              style={{ justifyContent: 'center', fontWeight: 800 }}
            >
              {isStore ? 'المنتجات' : 'العناصر'} ({allItems.length})
            </button>
          </div>

          {customizeTab === 'style' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* نبذة سريعة + وصف المشروع */}
              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, marginBottom: '6px' }}>
                  عنوان مختصر أسفل الاسم (نبذة سريعة)
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder={
                    isStore
                      ? 'مثال: أحدث المنتجات والعروض المختارة بجودة عالية'
                      : 'مثال: أشهى الأطباق الطازجة يومياً'
                  }
                  style={{
                    width: '100%',
                    padding: '11px 13px',
                    borderRadius: '12px',
                    border: '1px solid var(--line)',
                    background: 'var(--bg)',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, marginBottom: '6px' }}>
                  وصف المشروع الكامل
                </label>
                <textarea
                  rows={3}
                  value={aboutText}
                  onChange={(e) => setAboutText(e.target.value)}
                  placeholder={
                    isStore
                      ? 'اكتب وصفاً موجزاً عن متجرك وأبرز المنتجات والخدمات والعنوان...'
                      : 'اكتب وصفاً موجزاً عن مطعمك ومشروعك وأطباقك والخدمات...'
                  }
                  style={{
                    width: '100%',
                    padding: '11px 13px',
                    borderRadius: '12px',
                    border: '1px solid var(--line)',
                    background: 'var(--bg)',
                    fontSize: '14px',
                    resize: 'vertical',
                  }}
                />
              </div>

              {isStore ? (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '14px',
                    background: 'color-mix(in srgb, #f15a29 10%, var(--surface))',
                    border: '1px solid color-mix(in srgb, #f15a29 30%, var(--line))',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--ink)',
                    lineHeight: 1.65,
                  }}
                >
                  تم تفعيل مظهر المتجر الإلكتروني الموحّد تلقائياً لمتجرك ✓ يمكنك حفظ الوصف أدناه أو تعديل الأقسام والمنتجات بحرية.
                </div>
              ) : (
                <>
                  {/* فاتح أو غامق */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, marginBottom: '8px' }}>
                      مظهر المنيو للزبائن (فاتح أو غامق)
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setMenuThemeMode('light')}
                        style={{
                          padding: '14px',
                          borderRadius: '14px',
                          border: menuThemeMode === 'light' ? '2px solid var(--brand)' : '1px solid var(--line)',
                          background: menuThemeMode === 'light' ? 'var(--soft)' : 'var(--bg)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          fontWeight: 800,
                          fontSize: '14px',
                          color: 'var(--ink)',
                        }}
                      >
                        <Sun size={18} />
                        <span>مظهر فاتح (Light)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMenuThemeMode('dark')}
                        style={{
                          padding: '14px',
                          borderRadius: '14px',
                          border: menuThemeMode === 'dark' ? '2px solid var(--brand)' : '1px solid var(--line)',
                          background: menuThemeMode === 'dark' ? 'var(--soft)' : 'var(--bg)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          fontWeight: 800,
                          fontSize: '14px',
                          color: 'var(--ink)',
                        }}
                      >
                        <Moon size={18} />
                        <span>مظهر غامق (Dark)</span>
                      </button>
                    </div>
                  </div>

                  {/* طريقة عرض العناصر */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, marginBottom: '8px' }}>
                      شكل عرض العناصر
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      {[
                        { id: 'list' as const, label: 'قائمة مرتبة' },
                        { id: 'grid' as const, label: 'شبكة مزدوجة' },
                        { id: 'cards' as const, label: 'بطاقات كبيرة' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`btn s${menuLayout === opt.id ? ' p' : ''}`}
                          onClick={() => setMenuLayout(opt.id)}
                          style={{ justifyContent: 'center', fontWeight: 700 }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <button
                type="button"
                disabled={isSavingStep}
                className="btn p b"
                onClick={() => void handleSaveCustomization()}
                style={{ padding: '12px', fontWeight: 800, fontSize: '14.5px' }}
              >
                {isSavingStep ? 'جاري الحفظ...' : 'حفظ إعدادات المظهر والوصف'}
              </button>
            </div>
          )}

          {customizeTab === 'cats' && (
            <div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                  placeholder="أضف قسماً جديداً..."
                  style={{
                    flex: 1,
                    padding: '11px 13px',
                    borderRadius: '12px',
                    border: '1px solid var(--line)',
                    background: 'var(--bg)',
                    fontSize: '14px',
                  }}
                />
                <button
                  type="button"
                  className="btn p"
                  onClick={() => handleAddCategory()}
                  style={{ fontWeight: 800, borderRadius: '12px' }}
                >
                  + إضافة
                </button>
              </div>
              <div style={{ borderTop: '1px solid var(--line)' }}>
                {allCategories.map((c, idx) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 4px',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <b style={{ fontSize: '14px' }}>{idx + 1}. {c.n}</b>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(c.id)}
                      style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        color: '#dc2626',
                        padding: '5px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customizeTab === 'items' && (
            <div>
              <form onSubmit={handleSaveItem} style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                    <select
                      value={itemCat || allCategories[0]?.id || ''}
                      onChange={(e) => setItemCat(e.target.value)}
                      style={{
                        padding: '10px',
                        borderRadius: '10px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        fontSize: '13.5px',
                      }}
                    >
                      {allCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.n}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder={isStore ? 'اسم المنتج...' : 'اسم العنصر...'}
                      style={{
                        padding: '10px',
                        borderRadius: '10px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        fontSize: '13.5px',
                      }}
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="250"
                      value={itemPrice}
                      onChange={(e) => setItemPrice(e.target.value ? Number(e.target.value) : '')}
                      placeholder="السعر..."
                      dir="ltr"
                      style={{
                        padding: '10px',
                        borderRadius: '10px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        fontSize: '13.5px',
                      }}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={itemDesc}
                      onChange={(e) => setItemDesc(e.target.value)}
                      placeholder="وصف مختصر..."
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '10px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        fontSize: '13px',
                      }}
                    />
                    <label
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        fontWeight: 700,
                      }}
                    >
                      <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
                      {itemImage ? '✓ صورة' : 'صورة'}
                    </label>
                    <button type="submit" className="btn p" style={{ fontWeight: 800 }}>
                      {editingItemId ? 'حفظ' : '+ إضافة'}
                    </button>
                  </div>
                </div>
              </form>

              <div style={{ borderTop: '1px solid var(--line)' }}>
                {allItems.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 4px',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <div>
                      <b style={{ fontSize: '14px', display: 'block' }}>{it.n}</b>
                      <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--brand)' }}>
                        {formatNumber(it.pr)} {latestRest.currency || 'د.ع'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleStartEditItem(it)}
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--line)',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          deleteItem(`items/${it.id}`);
                          onRefresh();
                        }}
                        style={{
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          color: '#dc2626',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px',
              marginTop: '22px',
              paddingTop: '18px',
              borderTop: '1px solid var(--line)',
            }}
          >
            <button
              type="button"
              disabled={isSavingStep}
              className="btn p"
              onClick={() => void handleSaveCustomization(previewPath)}
              style={{ justifyContent: 'center', fontWeight: 800, padding: '12px' }}
            >
              <Eye size={17} />
              <span>{isStore ? 'حفظ ومعاينة شكل المتجر' : 'حفظ ومعاينة شكل المنيو'}</span>
            </button>
            <button
              type="button"
              disabled={isSavingStep}
              className="btn"
              onClick={() => void handleSaveCustomization('/dashboard/home')}
              style={{ justifyContent: 'center', fontWeight: 800, padding: '12px' }}
            >
              <LayoutDashboard size={17} />
              <span>لوحة التحكم</span>
            </button>
          </div>
        </div>
      )}

      {/* Navigation Buttons (السابق والتالي) inside the unified card for steps 0 to 3 */}
      {step < 4 && (
        <div
          style={{
            display: 'flex',
            justifyContent: step > 0 ? 'space-between' : 'flex-end',
            gap: '10px',
            marginTop: '22px',
            paddingTop: '16px',
            borderTop: '1px solid var(--line)',
          }}
        >
          {step > 0 && (
            <button
              type="button"
              onClick={handleBack}
              className="btn"
              style={{
                padding: '11px 20px',
                fontSize: '14px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
              }}
            >
              <span>السابق</span>
              <ArrowRight size={16} />
            </button>
          )}

          <button
            type="button"
            disabled={isSavingStep}
            onClick={() => void handleNext()}
            className="btn p"
            style={{
              padding: '11px 26px',
              fontSize: '14.5px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
            }}
          >
            <span>
              {isSavingStep
                ? 'جاري الحفظ...'
                : step === 3
                ? isStore
                  ? 'إنهاء وتجهيز المتجر'
                  : 'إنهاء وتجهيز المنيو'
                : 'التالي'}
            </span>
            {!isSavingStep && <ArrowLeft size={16} />}
          </button>
        </div>
      )}
        </motion.div>
      </motion.div>

      <AjaxConfirmModal
        dialog={ajaxDialog}
        onClose={() => setAjaxDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
