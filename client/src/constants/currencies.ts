/**
 * Single shared currency list for every dropdown in the app. Keeping one list means a
 * property's currency is always a selectable option everywhere it's referenced, instead of
 * silently missing from a form's own narrower, hand-copied list.
 */
export const CURRENCIES = [
  'USD', 'SGD', 'EUR', 'GBP', 'AED', 'THB', 'MMK', 'JPY', 'CNY', 'INR', 'AUD', 'MYR', 'SAR',
];
