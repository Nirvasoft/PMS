/**
 * Single shared currency list for every dropdown and lookup modal in the app.
 * Keeping one list means a property's currency is always a selectable option
 * everywhere it's referenced, instead of silently missing from a narrower list.
 */
export interface IsoCurrencyItem {
  country: string;
  name: string;
  code: string;
  symbol: string;
}

export const ISO_CURRENCY_LIST: IsoCurrencyItem[] = [
  { country: 'UAE',            name: 'UAE Dirham',          code: 'AED', symbol: 'د.إ' },
  { country: 'Australia',      name: 'Australian Dollar',   code: 'AUD', symbol: 'A$'  },
  { country: 'Bangladesh',     name: 'Bangladeshi Taka',    code: 'BDT', symbol: '৳'   },
  { country: 'Bahrain',        name: 'Bahraini Dinar',      code: 'BHD', symbol: '.د.ب'},
  { country: 'Brazil',         name: 'Brazilian Real',      code: 'BRL', symbol: 'R$'  },
  { country: 'Canada',         name: 'Canadian Dollar',     code: 'CAD', symbol: 'CA$' },
  { country: 'Switzerland',    name: 'Swiss Franc',         code: 'CHF', symbol: 'Fr'  },
  { country: 'China',          name: 'Chinese Yuan',        code: 'CNY', symbol: '¥'   },
  { country: 'Denmark',        name: 'Danish Krone',        code: 'DKK', symbol: 'kr'  },
  { country: 'Euro Zone',      name: 'Euro',                code: 'EUR', symbol: '€'   },
  { country: 'UK',             name: 'British Pound',       code: 'GBP', symbol: '£'   },
  { country: 'Hong Kong',      name: 'Hong Kong Dollar',    code: 'HKD', symbol: 'HK$' },
  { country: 'Indonesia',      name: 'Indonesian Rupiah',   code: 'IDR', symbol: 'Rp'  },
  { country: 'India',          name: 'Indian Rupee',        code: 'INR', symbol: '₹'   },
  { country: 'Japan',          name: 'Japanese Yen',        code: 'JPY', symbol: '¥'   },
  { country: 'Cambodia',       name: 'Cambodian Riel',      code: 'KHR', symbol: '៛'   },
  { country: 'South Korea',    name: 'South Korean Won',    code: 'KRW', symbol: '₩'   },
  { country: 'Kuwait',         name: 'Kuwaiti Dinar',       code: 'KWD', symbol: 'د.ك' },
  { country: 'Laos',           name: 'Lao Kip',             code: 'LAK', symbol: '₭'   },
  { country: 'Sri Lanka',      name: 'Sri Lankan Rupee',    code: 'LKR', symbol: 'Rs'  },
  { country: 'Myanmar',        name: 'Myanmar Kyat',        code: 'MMK', symbol: 'K'   },
  { country: 'Malaysia',       name: 'Malaysian Ringgit',   code: 'MYR', symbol: 'RM'  },
  { country: 'Norway',         name: 'Norwegian Krone',     code: 'NOK', symbol: 'kr'  },
  { country: 'Nepal',          name: 'Nepalese Rupee',      code: 'NPR', symbol: 'Rs'  },
  { country: 'New Zealand',    name: 'New Zealand Dollar',  code: 'NZD', symbol: 'NZ$' },
  { country: 'Oman',           name: 'Omani Rial',          code: 'OMR', symbol: 'ر.ع.'},
  { country: 'Philippines',    name: 'Philippine Peso',     code: 'PHP', symbol: '₱'   },
  { country: 'Pakistan',       name: 'Pakistani Rupee',     code: 'PKR', symbol: 'Rs'  },
  { country: 'Qatar',          name: 'Qatari Riyal',        code: 'QAR', symbol: 'ر.ق' },
  { country: 'Saudi Arabia',   name: 'Saudi Riyal',         code: 'SAR', symbol: 'ر.س' },
  { country: 'Sweden',         name: 'Swedish Krona',       code: 'SEK', symbol: 'kr'  },
  { country: 'Singapore',      name: 'Singapore Dollar',    code: 'SGD', symbol: 'S$'  },
  { country: 'Thailand',       name: 'Thai Baht',           code: 'THB', symbol: '฿'   },
  { country: 'Turkey',         name: 'Turkish Lira',        code: 'TRY', symbol: '₺'   },
  { country: 'Taiwan',         name: 'Taiwan Dollar',       code: 'TWD', symbol: 'NT$' },
  { country: 'USA',            name: 'US Dollar',           code: 'USD', symbol: '$'   },
  { country: 'Vietnam',        name: 'Vietnamese Dong',     code: 'VND', symbol: '₫'   },
  { country: 'Central Africa', name: 'CFA Franc BEAC',      code: 'XAF', symbol: 'Fr'  },
  { country: 'South Africa',   name: 'South African Rand',  code: 'ZAR', symbol: 'R'   },
];

export const CURRENCIES: string[] = ISO_CURRENCY_LIST.map((c) => c.code);
