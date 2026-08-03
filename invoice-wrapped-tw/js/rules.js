/* rules.js
   分類規則的唯一真相。以店名關鍵字比對，由上而下第一個命中者勝出。
   放在 JS 模組而不是外部 JSON，是為了讓離線與 file:// 情境下分類照樣成立。
   使用者可以在介面上把這份規則展開檢視，也可以按「下載規則 JSON」把它存下來。 */

export const RULES_VERSION = '2026.08.03';

export const CATEGORIES = [
  {
    id: 'cvs', name: '超商', ramp: 6, stripes: 5, icon: 'cvs', defaultRate: 1.0,
    keywords: ['7-ELEVEN', '7-11', '統一超商', '全家便利商店', '全家便利', '萊爾富', 'OK MART', 'OKMART', '來來超商'],
  },
  {
    id: 'mart', name: '超市', ramp: 6, stripes: 5, icon: 'mart', defaultRate: 1.5,
    keywords: ['全聯', '家樂福', '大潤發', '愛買', '美廉社', '楓康', '頂好', 'COSTCO', '好市多', '農會超市'],
  },
  {
    id: 'food', name: '餐飲', ramp: 5, stripes: 4, icon: 'food', defaultRate: 3.0,
    keywords: ['星巴克', '路易莎', '麥當勞', '摩斯', '肯德基', '拉亞', '八方雲集', '鬍鬚張', '三商巧福', '清心',
      '50嵐', '五十嵐', 'CoCo', '都可', '藏壽司', '壽司郎', '頂呱呱', '王品', '瓦城', '鼎泰豐',
      '早餐', '咖啡', '茶飲', '餐飲', '食堂', '餐廳', '小吃', '便當', '麵館', '飯店'],
  },
  {
    id: 'trans', name: '交通', ramp: 4, stripes: 3, icon: 'trans', defaultRate: 2.0,
    keywords: ['中油', '台塑石油', '全國加油', '山隆', '高鐵', '台灣鐵路', '臺灣鐵路', '捷運', '悠遊卡', '一卡通',
      '大車隊', '計程車', '客運', '停車', '加油站', 'UBER', 'iRent', '格上租車'],
  },
  {
    id: 'drug', name: '藥妝', ramp: 3, stripes: 2, icon: 'drug', defaultRate: 2.0,
    keywords: ['屈臣氏', '康是美', '寶雅', 'POYA', '日藥本舖', '杏一', '大樹藥局', '丁丁藥局', '藥局', '藥妝', '美華泰'],
  },
  {
    id: 'shop', name: '電商', ramp: 2, stripes: 1, icon: 'shop', defaultRate: 5.0,
    keywords: ['momo', '富邦媒體', 'PChome', '露天', '蝦皮', 'Shopee', '博客來', '誠品線上', '生活市集',
      '松果購物', '東森購物', 'friDay', '購物網', '線上購物'],
  },
];

export const FALLBACK_CATEGORY = {
  id: 'other', name: '其他', ramp: 1, stripes: 0, icon: 'info', defaultRate: 1.0,
};

const ALL = [...CATEGORIES, FALLBACK_CATEGORY];

export function categoryById(id) {
  return ALL.find((c) => c.id === id) || FALLBACK_CATEGORY;
}

/** 純比對，不含使用者的手動覆寫（覆寫在 dataset.js 套用） */
export function matchCategory(storeName) {
  const n = (storeName || '').toUpperCase();
  for (const c of CATEGORIES) {
    for (const k of c.keywords) {
      if (n.includes(k.toUpperCase())) return { id: c.id, keyword: k };
    }
  }
  return { id: FALLBACK_CATEGORY.id, keyword: null };
}

/** 把規則序列化成使用者可以下載、可以拿去比對的 JSON */
export function rulesAsJson() {
  return JSON.stringify({
    version: RULES_VERSION,
    note: '店名關鍵字比對，由上而下第一個命中者勝出。未命中歸「其他」。',
    categories: CATEGORIES.map(({ id, name, ramp, stripes, defaultRate, keywords }) =>
      ({ id, name, ramp, stripes, defaultRate, keywords })),
    fallback: FALLBACK_CATEGORY,
  }, null, 2);
}
