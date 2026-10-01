import { Category } from '../src/types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_food', name: 'Food & Dining', name_bn: 'খাবার ও রেস্তোরাঁ', color: '#F97316', icon: 'Utensils' },
  { id: 'cat_groceries', name: 'Groceries', name_bn: 'মুদি ও বাজার', color: '#10B981', icon: 'ShoppingCart' },
  { id: 'cat_transport', name: 'Transport & Commute', name_bn: 'যাতায়াত ও পরিবহন', color: '#3B82F6', icon: 'Car' },
  { id: 'cat_shopping', name: 'Shopping & Apparel', name_bn: 'কেনাকাটা', color: '#EC4899', icon: 'Bag' },
  { id: 'cat_bills', name: 'Bills & Utilities', name_bn: 'ইউটিলিটি ও বিদ্যুৎ/গ্যাস বিল', color: '#EAB308', icon: 'Zap' },
  { id: 'cat_mobile', name: 'Mobile & Internet', name_bn: 'মোবাইল ও ইন্টারনেট', color: '#06B6D4', icon: 'Wifi' },
  { id: 'cat_entertainment', name: 'Entertainment & Subs', name_bn: 'বিনোদন ও সাবস্ক্রিপশন', color: '#8B5CF6', icon: 'Tv' },
  { id: 'cat_health', name: 'Health & Pharmacy', name_bn: 'স্বাস্থ্য ও ওষুধ', color: '#EF4444', icon: 'Activity' },
  { id: 'cat_education', name: 'Education', name_bn: 'শিক্ষা ও বইপুস্তক', color: '#6366F1', icon: 'BookOpen' },
  { id: 'cat_travel', name: 'Travel & Trips', name_bn: 'ভ্রমণ', color: '#14B8A6', icon: 'Compass' },
  { id: 'cat_financial', name: 'Financial & Banking', name_bn: 'ব্যাংক ও আর্থিক ফি', color: '#64748B', icon: 'CreditCard' },
  { id: 'cat_transfers', name: 'Transfers (P2P)', name_bn: 'ব্যক্তিগত লেনদেন ও হস্তান্তর', color: '#A855F7', icon: 'Repeat' },
  { id: 'cat_income', name: 'Income & Salary', name_bn: 'আয় ও বেতন', color: '#22C55E', icon: 'TrendingUp' },
  { id: 'cat_other', name: 'Other', name_bn: 'অন্যান্য', color: '#94A3B8', icon: 'MoreHorizontal' },
];

export interface MerchantRule {
  pattern: RegExp;
  canonicalName: string;
  categoryId: string;
}

export const MERCHANT_RULES: MerchantRule[] = [
  { pattern: /FOODPANDA|FOOD\s*PANDA|FP\*/i, canonicalName: 'Foodpanda', categoryId: 'cat_food' },
  { pattern: /SHWAPNO|ACI\s*LOGISTICS/i, canonicalName: 'Shwapno Superstore', categoryId: 'cat_groceries' },
  { pattern: /CHALDAL/i, canonicalName: 'Chaldal', categoryId: 'cat_groceries' },
  { pattern: /UNIMART/i, canonicalName: 'Unimart', categoryId: 'cat_groceries' },
  { pattern: /MEENA\s*BAZAR|GEMCON/i, canonicalName: 'Meena Bazar', categoryId: 'cat_groceries' },
  { pattern: /UBER/i, canonicalName: 'Uber BD', categoryId: 'cat_transport' },
  { pattern: /PATHAO/i, canonicalName: 'Pathao', categoryId: 'cat_transport' },
  { pattern: /METRO\s*RAIL|DMTCL|MRT/i, canonicalName: 'Dhaka Metro Rail', categoryId: 'cat_transport' },
  { pattern: /DARAZ/i, canonicalName: 'Daraz Bangladesh', categoryId: 'cat_shopping' },
  { pattern: /AARONG|BRAC\s*AARONG/i, canonicalName: 'Aarong', categoryId: 'cat_shopping' },
  { pattern: /DESCO/i, canonicalName: 'DESCO Electricity', categoryId: 'cat_bills' },
  { pattern: /DPDC/i, canonicalName: 'DPDC Electricity', categoryId: 'cat_bills' },
  { pattern: /TITAS|GAS/i, canonicalName: 'Titas Gas', categoryId: 'cat_bills' },
  { pattern: /WASA/i, canonicalName: 'Dhaka WASA', categoryId: 'cat_bills' },
  { pattern: /GRAMEENPHONE|GP\s*TOPUP|GP\s*FLEXI/i, canonicalName: 'Grameenphone', categoryId: 'cat_mobile' },
  { pattern: /ROBI|AIRTEL/i, canonicalName: 'Robi Axiata', categoryId: 'cat_mobile' },
  { pattern: /BANGLALINK/i, canonicalName: 'Banglalink Digital', categoryId: 'cat_mobile' },
  { pattern: /LINK3|CARNIVAL|AMBER\s*IT/i, canonicalName: 'Broadband Internet', categoryId: 'cat_mobile' },
  { pattern: /NETFLIX/i, canonicalName: 'Netflix', categoryId: 'cat_entertainment' },
  { pattern: /SPOTIFY/i, canonicalName: 'Spotify', categoryId: 'cat_entertainment' },
  { pattern: /CINEPLEX|BLOCKBUSTER/i, canonicalName: 'Star Cineplex', categoryId: 'cat_entertainment' },
  { pattern: /SQUARE\s*HOSPITAL|SQUARE\s*TOILETRIES/i, canonicalName: 'Square Hospital', categoryId: 'cat_health' },
  { pattern: /LAZZ\s*PHARMA|LZZ/i, canonicalName: 'Lazz Pharma', categoryId: 'cat_health' },
  { pattern: /IBN\s*SINA/i, canonicalName: 'Ibn Sina Diagnostic', categoryId: 'cat_health' },
  { pattern: /SALARY|PAYROLL|REMUNERATION/i, canonicalName: 'Monthly Salary', categoryId: 'cat_income' },
];
