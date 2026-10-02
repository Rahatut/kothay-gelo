-- Reference data: the Bangladesh spending taxonomy.
-- Postgres port: INSERT OR IGNORE → ON CONFLICT DO NOTHING

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  name_bn     TEXT,
  color       TEXT,
  icon        TEXT,
  parent_id   TEXT REFERENCES categories(id),
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO categories (id, name, name_bn, color, icon) VALUES
  ('cat_food',           'Food & Dining',          'খাবার ও রেস্তোরাঁ',                    '#F97316', 'Utensils'),
  ('cat_groceries',      'Groceries',             'মুদি ও বাজার',                         '#10B981', 'ShoppingCart'),
  ('cat_transport',      'Transport & Commute',    'যাতায়াত ও পরিবহন',                    '#3B82F6', 'Car'),
  ('cat_shopping',       'Shopping & Apparel',     'কেনাকাটা',                              '#EC4899', 'Bag'),
  ('cat_bills',          'Bills & Utilities',      'ইউটিলিটি ও বিদ্যুৎ/গ্যাস বিল',          '#EAB308', 'Zap'),
  ('cat_mobile',         'Mobile & Internet',      'মোবাইল ও ইন্টারনেট',                   '#06B6D4', 'Wifi'),
  ('cat_entertainment',  'Entertainment & Subs',   'বিনোদন ও সাবস্ক্রিপশন',                '#8B5CF6', 'Tv'),
  ('cat_health',         'Health & Pharmacy',      'স্বাস্থ্য ও ওষুধ',                      '#EF4444', 'Activity'),
  ('cat_education',      'Education',              'শিক্ষা ও বইপুস্তক',                      '#6366F1', 'BookOpen'),
  ('cat_travel',         'Travel & Trips',         'ভ্রমণ',                                  '#14B8A6', 'Compass'),
  ('cat_financial',      'Financial & Banking',    'ব্যাংক ও আর্থিক ফি',                    '#64748B', 'CreditCard'),
  ('cat_transfers',      'Transfers (P2P)',        'ব্যক্তিগত লেনদেন ও হস্তান্তর',            '#A855F7', 'Repeat'),
  ('cat_income',         'Income & Salary',        'আয় ও বেতন',                            '#22C55E', 'TrendingUp'),
  ('cat_other',          'Other',                  'অন্যান্য',                               '#94A3B8', 'MoreHorizontal'),
  ('cat_uncategorized',  'Uncategorized',          'শ্রেণিবিহীন',                            '#94A3B8', 'CircleDashed')
ON CONFLICT (id) DO NOTHING;