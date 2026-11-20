/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function isStoreProject(projectType?: string): boolean {
  const clean = String(projectType || '').toLowerCase().trim();
  return clean === 'store' || clean === 'market' || clean === 'shop' || clean === 'boutique';
}

export interface BusinessTerms {
  isStore: boolean;
  entity: string;
  entityDef: string;
  menuTitle: string;
  menuDef: string;
  catalogLinkLabel: string;
  itemSingular: string;
  itemsPlural: string;
  itemDef: string;
  addItemLabel: string;
  categorySingular: string;
  categoriesPlural: string;
  emptyItemsMsg: string;
  preparationLabel: string;
  dineInOrBranchNote: string;
  pickupLabel: string;
  tableOptionLabel: string;
  closedOrderNote: string;
  projectTypeLabel: string;
}

export function getBusinessTerms(projectType?: string): BusinessTerms {
  const isStore = isStoreProject(projectType);

  return isStore
    ? {
        isStore: true,
        entity: 'متجر',
        entityDef: 'المتجر',
        menuTitle: 'كتالوج المتجر',
        menuDef: 'الكتالوج',
        catalogLinkLabel: 'رابط كتالوج المتجر',
        itemSingular: 'منتج',
        itemsPlural: 'المنتجات',
        itemDef: 'المنتج',
        addItemLabel: 'إضافة منتج جديد',
        categorySingular: 'قسم',
        categoriesPlural: 'الأقسام والتصنيفات',
        emptyItemsMsg: 'لا توجد منتجات مضافة في هذا القسم بعد.',
        preparationLabel: 'وقت التجهيز',
        dineInOrBranchNote: 'طلب داخل المعرض / الفرع',
        pickupLabel: 'استلام من المتجر',
        tableOptionLabel: 'داخل الفرع',
        closedOrderNote: 'نستقبل الطلبات المسبقة وسيتم تجهيزها فور افتتاح المتجر.',
        projectTypeLabel: 'متجر إلكتروني / تجزئة',
      }
    : {
        isStore: false,
        entity: 'مطعم',
        entityDef: 'المطعم',
        menuTitle: 'المنيو الإلكتروني',
        menuDef: 'المنيو',
        catalogLinkLabel: 'رابط المنيو',
        itemSingular: 'صنف',
        itemsPlural: 'الأصناف والأطباق',
        itemDef: 'الطبق',
        addItemLabel: 'إضافة صنف جديد',
        categorySingular: 'قسم',
        categoriesPlural: 'الأقسام والتصنيفات',
        emptyItemsMsg: 'لا توجد أطباق مضافة في هذا القسم بعد.',
        preparationLabel: 'وقت التحضير',
        dineInOrBranchNote: 'طلب على الطاولة (داخل الصالة)',
        pickupLabel: 'استلام من المطعم',
        tableOptionLabel: 'على الطاولة',
        closedOrderNote: 'نستقبل الطلبات المسبقة وسيتم تحضيرها فور افتتاح المطعم.',
        projectTypeLabel: 'مطعم / كافيه',
      };
}
