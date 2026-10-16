import type { LeaseDetail } from '../../../../store/api/leasesApi';

function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Converts a numeric amount to Myanmar currency words (e.g. 32100000 -> "သုံးဆယ်-နှစ်သန်း တစ်သိန်း")
 */
function numberToMyanmarWords(num: number): string {
  if (!num || isNaN(num) || num <= 0) return 'သုည';

  const digits = ['', 'တစ်', 'နှစ်', 'သုံး', 'လေး', 'ငါး', 'ခြောက်', 'ခုနစ်', 'ရှစ်', 'ကိုး'];
  let n = Math.floor(num);
  const parts: string[] = [];

  // Handle Millions (သန်း)
  const millions = Math.floor(n / 1000000);
  n %= 1000000;

  if (millions > 0) {
    if (millions === 1) {
      parts.push('တစ်သန်း');
    } else if (millions < 10) {
      parts.push(digits[millions] + 'သန်း');
    } else if (millions < 100) {
      const ten = Math.floor(millions / 10);
      const rem = millions % 10;
      parts.push(rem === 0 ? `${digits[ten]}ဆယ်သန်း` : `${digits[ten]}ဆယ်-${digits[rem]}သန်း`);
    } else {
      parts.push(`${millions.toLocaleString()} သန်း`);
    }
  }

  // Handle Hundred-Thousands / သိန်း (100,000)
  const thein = Math.floor(n / 100000);
  n %= 100000;
  if (thein > 0) parts.push(digits[thein] + 'သိန်း');

  // Handle Ten-Thousands / သောင်း (10,000)
  const thaung = Math.floor(n / 10000);
  n %= 10000;
  if (thaung > 0) parts.push(digits[thaung] + 'သောင်း');

  // Handle Thousands / ထောင် (1,000)
  const htaung = Math.floor(n / 1000);
  n %= 1000;
  if (htaung > 0) parts.push(digits[htaung] + 'ထောင်');

  // Handle Hundreds / ရာ (100)
  const ya = Math.floor(n / 100);
  n %= 100;
  if (ya > 0) parts.push(digits[ya] + 'ရာ');

  // Handle Tens / ဆယ် (10)
  const sal = Math.floor(n / 10);
  n %= 10;
  if (sal > 0) parts.push(digits[sal] + 'ဆယ်');

  // Handle Units
  if (n > 0) parts.push(digits[n]);

  return parts.join(' ') || 'သုည';
}

const fmtDate = (dStr?: string | Date | null) => {
  if (!dStr) return '';
  const d = typeof dStr === 'string' ? new Date(dStr) : dStr;
  if (isNaN(d.getTime())) return String(dStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SUB_CLAUSES_5 = [
  { num: '(၁)', text: 'မိမိဆိုင်ခန်းအတွက် ကျသင့်သည့် မီးခွန်၊ ရေခွန်၊ ဖုန်းခွန်များကိုလစဉ်မှန်ကန်စွာ ပေးသွင်းရပါမည်။ ဆိုင်ခန်းငှားရမ်းသူနှင့်သာသက်ဆိုင်သည့် နိုင်ငံတော်သို့ပေးသွင်းရန် အခွန်အခများကိုဆိုင်ခန်းငှားသူမှ ပေးဆောင်ရမည်။' },
  { num: '(၂)', text: 'သန့်ရှင်းရေး၊ လုံခြုံရေး၊ ပြုပြင်ထိန်းသိမ်းရေး လုပ်ငန်းများအတွက်သတ်မှတ်ထားသည့် ဝန်ဆောင်မှုစရိတ်များကို လစဉ်ပုံမှန်ပေးဆောင်ရမည်။' },
  { num: '(၃)', text: 'မိမိတို့ငှားရမ်းထားသည့်ဆိုင်ခန်း၊ ဆိုင်ခုံ၊ ကောင်တာများကိုပြင်ဆင်ခြင်းနှင့် ဖြုတ်သိမ်းပြုလုပ်လိုပါကစီမံခန့်ခွဲအုပ်ချုပ်မှုကော်မတီရုံးသို့ကြိုတင်လျှောက်ထားခွင့်ပြုချက် ရယူရမည်။ ခွင့်ပြုချက်ရပြီးသောပုံစံအတိုင်းသာ ပြင်ဆင်ဆောင်ရွက်ရမည်။ သတ်မှတ်ချက်နှင့် မညီသောပြင်ဆင်ဆောင်ရွက်မှုများ ရှိပါက ပြန်လည်ဖျက်သိမ်းပေးရပါမည်။' },
  { num: '(၄)', text: 'ငှားရမ်းထားသည့်ဆိုင်ခန်းအား ဧရိယာနှင့်လိုက်လျှောညီထွေစွာခင်းကျင်းနိူင်သည့်ပစ္စည်းကိုသာ ရောင်းဝယ်ဖောက်ကားရမည်ဖြစ်ပြီး၊သတ်မှတ်ဧရိယာထက် ကျော်လွန်တိုးချဲ့ခင်းကျင်းခြင်း၊ ဆိုင်ခန်းအားသိုလှောင်ရုံအဖြစ်ပြုလုပ်ခြင်း၊ ဆိုင်နီးချင်းများနှင့်လမ်းသွားလမ်းလာများ အနှောင့်အယှက်ဖြစ်စေသည့်ထုတ်ပိုးခင်းကျင်းခြင်းများ မပြုလုပ်ရ။' },
  { num: '(၅)', text: 'ဥပဒေနှင့် မလွတ်ကင်းသော မီးလောင်ပေါက်ကွဲစေနိူင်သော ပစ္စည်းများ၊တားမြစ်ပိတ်ပင်ထားသော ပစ္စည်းများကို ရောင်းချခြင်းမပြုရ။' },
  { num: '(၆)', text: 'ဆိုင်ခန်းများကို သတ်မှတ်ကာလကျော်လွန်ကြာရှည်စွာပိတ်ထားခြင်း၊လုပ်ငန်းဆောင်ရွက်မှုမရှိခြင်း၊ အုပ်ချုပ်မှုကော်မတီသို့ ဆက်သွယ်အကြောင်းကြားခြင်း မရှိဘဲ ပိတ်ထားပါကဆိုင်ခန်းနှင့်ပတ်သက်သည့် ကိစ္စအရပ်ရပ်အားစီမံခန့်ခွဲအုပ်ချုပ်မှုကော်မတီမှ စီမံဆောင်ရွက်မှုအားသဘောတူလိုက်နာရမည်။' },
  { num: '(၇)', text: 'အများပြည်သူ အနှောင့်အယှက်မဖြစ်စေရေးအတွက် မိမိတို့ဆိုင်ခန်းမှကတ်ဆက်၊ အသံချဲ့စက် VCD ကာရာအိုကေများကျယ်လောင်စွာဖွင့်ခြင်းမပြုလုပ်ရ။' },
  { num: '(၈)', text: 'မြန်မာ့ရိုးရာဓလေ့နှင့်အညီ ယဉ်ကျေးစွာရောင်းဝယ်ဖောက်ကားရမည်ဖြစ်ပြီး ခိုက်ရန်ဖြစ်ပွားခြင်းမပြုရ။ ခိုက်ရန်ဖြစ်ပွားခြင်း၊ ပတ်ဝန်းကျင်အနှောင့်အယှက်ဖြစ်စေသောအခြေအနေများတွေ့ရှိပါက ဆိုင်ခန်းငှားရမ်းခြင်းရပ်ဆိုင်းမည်ဖြစ်ပါသည်။' },
];

const SHARED_VIEWER_TOOLBAR_CSS = `
  /* ── Preview Toolbar (no-print) ── */
  .preview-toolbar {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 10px 24px;
    background: #1e293b;
    color: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }
  .preview-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .preview-btn {
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }
  .preview-btn-print {
    background: #10b981;
    color: #fff;
  }
  .preview-btn-print:hover {
    background: #059669;
  }
  .preview-btn-close {
    background: rgba(255,255,255,0.12);
    color: #f1f5f9;
    border-color: rgba(255,255,255,0.2);
  }
  .preview-btn-close:hover {
    background: rgba(255,255,255,0.22);
  }
  .preview-container {
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    min-height: calc(100vh - 49px);
  }
`;

function renderToolbarHtml(_title?: string, _badgeText?: string, _status?: string): string {
  return `
  <div class="preview-toolbar no-print">
    <div class="preview-toolbar-actions">
      <button class="preview-btn preview-btn-print" onclick="window.print()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 6 2 18 2 18 9"></polyline>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
          <rect x="6" y="14" width="12" height="8"></rect>
        </svg>
        Print / Save as PDF
      </button>
      <button class="preview-btn preview-btn-close" onclick="window.close()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        Close
      </button>
    </div>
  </div>`;
}

export function generateLeaseFormHtml(
  lease: LeaseDetail,
  users: { fullName?: string; jobTitle?: string | null }[] = [],
  leads: any[] = [],
): string {
  // Financial & Dates
  const rent = Number(lease.rentAmount) || 0;
  const months = lease.leaseTermMonths || 0;
  const totalRent = rent * months;

  const rentFormatted = rent.toFixed(2);
  const totalRentFormatted = totalRent.toFixed(2);
  const rentBurmeseWords = numberToMyanmarWords(totalRent);

  const startDateFormatted = fmtDate(lease.startDate);
  const endDateFormatted = fmtDate(lease.endDate);
  const contractStartDateFormatted = fmtDate(lease.rentalAgreement?.contractStartDate) || startDateFormatted;
  const contractEndDateFormatted = fmtDate(lease.rentalAgreement?.contractEndDate) || endDateFormatted;
  const contractDateFormatted = fmtDate(
    lease.rentalAgreement?.contractStartDate ||
    (lease.rentalAgreement as any)?.renterDate ||
    lease.createdAt,
  );

  // Property & Unit
  const propertyName = lease.property?.name || '';
  const propertyAddress = [
    lease.property?.addressLine1,
    lease.property?.addressLine2,
    lease.property?.city,
    lease.property?.state,
    lease.property?.postalCode,
    lease.property?.country,
  ].filter(Boolean).join('၊ ');

  let propertyImage = lease.property?.coverImageUrl || lease.property?.imageUrl || null;
  if (
    propertyImage &&
    !propertyImage.startsWith('http://') &&
    !propertyImage.startsWith('https://') &&
    !propertyImage.startsWith('data:')
  ) {
    propertyImage = `${window.location.origin}${propertyImage.startsWith('/') ? '' : '/'}${propertyImage}`;
  }

  const unitNumber = lease.unit?.unitNumber || '';
  const floorLabel =
    lease.unit?.floorLabel ||
    (lease.unit?.floorNumber != null ? `Floor ${lease.unit.floorNumber}` : '');
  const areaSqft =
    lease.unit?.areaSqft != null &&
    !isNaN(Number(lease.unit.areaSqft)) &&
    Number(lease.unit.areaSqft) > 0
      ? Number(lease.unit.areaSqft).toFixed(2)
      : '';

  // Rental Agreement / Parties Details
  const ra = lease.rentalAgreement || {};

  const companyAddressFormatted = [
    lease.company?.addressLine1,
    lease.company?.addressLine2,
    lease.company?.city,
    lease.company?.state,
    lease.company?.postalCode,
    lease.company?.country,
  ].filter(Boolean).join(', ');

  const lessorName = lease.company?.legalName || lease.company?.name || '';
  const lessorAddress = ra.renterAddress || '';
  const leaserName = ra.renterName || ra.renterSignedName || '';
  const lessorNirc = ra.renterNirc || '';

  const matchedUser = users.find(
    (u) =>
      (ra.renterName && u.fullName?.trim().toLowerCase() === ra.renterName.trim().toLowerCase()) ||
      (ra.renterSignedName && u.fullName?.trim().toLowerCase() === ra.renterSignedName.trim().toLowerCase()),
  );
  const leaserPosition = (ra as any)?.renterPosition || matchedUser?.jobTitle || 'Director';

  const headerCompanyName = lease.company?.name || lease.company?.legalName || '';
  const headerCompanyAddress = companyAddressFormatted || ra.renterAddress || '';
  const companyPhone = lease.company?.phone
    ? lease.company.phone.startsWith('Tel:')
      ? lease.company.phone
      : `Tel: ${lease.company.phone}`
    : '';

  // Tenant Data (Lessee / ငှားရမ်းသူ)
  const tenantAny = lease.tenant as any;
  const tenantAddressFormatted = [
    tenantAny?.addressLine1,
    tenantAny?.addressLine2,
    tenantAny?.city,
    tenantAny?.state,
    tenantAny?.postalCode,
    tenantAny?.country,
  ].filter(Boolean).join(', ');

  const lesseeName =
    ra.companyName ||
    lease.tenant?.displayName ||
    lease.tenant?.companyName ||
    [lease.tenant?.firstName, lease.tenant?.lastName].filter(Boolean).join(' ') ||
    '';
  const lesseeAddress = ra.customerAddress || tenantAddressFormatted || '';
  const lesseeSignedName = ra.customerSignedName || tenantAny?.contactPersonName || lease.tenant?.displayName || '';
  const lesseeNirc = ra.customerNirc || tenantAny?.idNumber || '';

  const matchedLead = leads.find(
    (l) =>
      l.convertedLease?.id === lease.id ||
      l.convertedLeaseId === lease.id ||
      l.convertedTenantId === lease.tenant?.id,
  );

  const pipelineLeadShopName = matchedLead?.loiDetails?.shopName || matchedLead?.companyName;
  const shopName = (lease.rentalAgreement as any)?.shopName || (lease as any).shopName || pipelineLeadShopName || '-';

  const clausesPage3 = [
    { num: '(၉)', text: 'ဆိုင်ခန်း၊ ဆိုင်ခုံ၊ ကောင်တာငှားရမ်းသူများသည် ဆိုင်နေရာကိုသန့်ရှင်းစင်ကြယ်စွာ ထားရှိရမည်။ အမှိုက်သရိုက်နှင့်စားကြွင်းစားကျန်များကို နေ့စဉ်ရှင်းလင်းသုတ်သင်ပြီးမှသတ်မှတ်ပေးထားသည့် အမှိုက်ပုံးများသို့ သွားရောက်စွန့်ပစ်ကြရမည်။' },
    { num: '(၁၀)', text: 'ဆိုင်ဖွင့်ချိန် နံနက်(၉ : ၀၀) နာရီနှင့် ဆိုင်ပိတ်ချိန် ညနေ (၆ : ၀၀)နာရီ သတ်မှတ်ချက်ကို တိကျစွာ လိုက်နာရမည်။' },
    { num: '(၁၁)', text: `${propertyName} အတွင်း စည်းကမ်းစနစ်တကျရှိစေရေးအတွက်စည်းကမ်းထိန်းလုပ်ငန်းဆောင်ရွက်ရာတွင် ကူညီဆောင်ရွက်ပေးရမည်ဖြစ်ပြီးနှောင့်ယှက်ပိတ်ပင်တားဆီးခြင်းများမပြုရ။` },
    { num: '(၁၂)', text: 'မိမိဆိုင်အတွက်လျှပ်စစ်မီး သွယ်တန်းအသုံးပြုလိုပါကစီမံခန့်ခွဲအုပ်ချုပ်မှုကော်မတီရုံးခန်းသို့ကြိုတင်ခွင့်ပြုချက်ရယူရမည်ဖြစ်ပြီး ခွင့်ပြုချက်မရှိဘဲအပိုသုံးစွဲပါက လျှပ်စစ်ဖြတ်တောက်ခံရမည်ဖြစ်ပြီး သတ်မှတ်အခကြေးငွေပေးဆောင်ရပါမည်။' },
    { num: '(၁၃)', text: 'မိမိတို့ဆိုင်ခန်း၊ ဆိုင်ခုံ၊ ကောင်တာအတွင်း လျှပ်စစ်မီးဖြင့်အသုံးပြုသည့်ပစ္စည်းများ ချိူ့ယွင်းပျက်စီးခြင်းအရည်အသွေးမပြည့်မှီခြင်းများကြောင့်အန္တာရယ်တစ်စုံတစ်ရာပေါ်ပေါက်လာပါက အသုံးပြုသူဆိုင်ရှင်၏တာဝန်သာဖြစ်သည့်အပြင် ဆုံးရှုံးမှုများအတွက် ပေးလျော်ခြင်း၊အခါအားလျော်စွာ သတ်မှတ်ထားသော ဒဏ်ကြေးငွေကိုပေးဆောင်ရပါမည်။' },
    { num: '(၁၄)', text: 'ဆိုင်ခန်းငှားရမ်းခြင်းအား ရပ်စဲလိုက်ပြီးဖြစ်ပါကယင်းဆိုင်အတွင်းရှိပစ္စည်းများအား ဖယ်ရှားပေးရမည်။ အကယ်၍ရှင်းလင်းထားခြင်းမရှိပါက စွန့်ပစ်ပစ္စည်းအဖြစ် သတ်မှတ်မည်ဖြစ်သည်။' },
    { num: '(၁၅)', text: 'ဆိုင်ခန်းငှားရမ်းသူသည် မိမိဆန္ဒအလျောက် ထပ်ဆင့်ရောင်းချခြင်း၊ပေါင်နှံခြင်းနှင့် လွှဲပြောင်းများမပြုရ။ အကယ်၍ပြုလုပ်ခြင်းတွေ့ရှိပါက ယင်းဆိုင်အားချက်ချင်းပိတ်သိမ်း၍ဆက်လက်ငှားရမ်းခြင်း မပြုတော့ပါ။' },
    { num: '(၁၆)', text: 'အငှားချထားသော ဆိုင်ခန်း၊ ဆိုင်ခုံကောင်တာများ ငှားရမ်းထားသူသည်ဥပဒေနှင့်မညီသော အုပ်စုဖွဲ့ခြင်း၊ လူစုလူဝေးဖွဲ့၍အနှောင့်အယှက်ပြုခြင်းများ ပြုလုပ်တွေ့ရှိပါကဈေးဆိုင်ခန်းငှားရမ်းခြင်းအား ရပ်ဆိုင်းပြီး ဥပဒေအရအရေးယူသွားမည်ဖြစ်ပါသည်။' },
    { num: '(၁၇)', text: 'ငှားရမ်းသူများမှ ဥပဒေနှင့်မလွတ်ကင်းသောကိစ္စများဆောင်ရွက်ခွင့်မရှိ၊ အကယ်၍ ဥပဒေနှင့်မလွတ်ကင်းသောအကြောင်းကိစ္စများ ဆောင်ရွက်ပါက ငှားရမ်းသူမှ မိမိဘာသာဖြေရှင်းရမည်။' },
  ];

  const headerHtml = `
    <div class="report-company-header">
      ${propertyImage ? `
        <div class="report-property-logo-wrap">
          <img src="${escapeHtml(propertyImage)}" alt="${escapeHtml(propertyName)}" class="report-property-logo" />
        </div>
      ` : ''}
      <div class="report-company-name">${escapeHtml(headerCompanyName)}</div>
      <div class="report-company-address">
        ${headerCompanyAddress ? `<div>${escapeHtml(headerCompanyAddress)}</div>` : ''}
        ${companyPhone ? `<div>${escapeHtml(companyPhone)}</div>` : ''}
      </div>
      <hr class="report-header-line" />
    </div>
  `;

  return `<!doctype html>
<html lang="my">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lease Agreement Report - ${escapeHtml(lease.leaseNumber)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      background: #525659;
      font-family: 'Pyidaungsu', 'Myanmar3', 'Padauk', 'Noto Sans Myanmar', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      color: #111111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    ${SHARED_VIEWER_TOOLBAR_CSS}

    /* Individual A4 Page in Preview */
    .report-page {
      background: #ffffff;
      color: #111111;
      width: 210mm;
      min-height: 297mm;
      padding: 18mm 20mm 15mm 20mm;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
      border-radius: 2px;
      box-sizing: border-box;
      line-height: 1.65;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }

    /* Company Header */
    .report-company-header {
      text-align: center;
      margin-bottom: 14px;
    }
    .report-property-logo-wrap {
      margin-bottom: 8px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .report-property-logo {
      max-width: 95px;
      max-height: 85px;
      object-fit: contain;
      border-radius: 4px;
    }
    .report-company-name {
      font-size: 18px;
      font-weight: bold;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
    }
    .report-company-address {
      font-size: 11px;
      color: #333;
      line-height: 1.4;
      font-family: Arial, Helvetica, sans-serif;
    }
    .report-header-line {
      border: none;
      border-top: 1.5px solid #222;
      margin: 10px 0 16px 0;
    }

    /* Page 1 Specifics */
    .report-doc-title {
      text-align: center;
      font-size: 16px;
      font-weight: normal;
      margin-bottom: 20px;
      color: #000;
    }
    .report-preamble {
      margin-bottom: 20px;
      line-height: 1.7;
    }
    .report-parties-grid {
      display: flex;
      flex-direction: column;
      gap: 22px;
      margin-bottom: 24px;
    }
    .report-party-block {
      display: flex;
      gap: 20px;
    }
    .report-party-label {
      width: 140px;
      font-weight: normal;
      flex-shrink: 0;
    }
    .report-party-content {
      flex: 1;
      line-height: 1.65;
    }
    .report-party-name {
      font-weight: bold;
      margin-bottom: 2px;
    }
    .report-sub-details {
      margin-top: 2px;
      color: #222;
    }
    .report-center-section {
      text-align: center;
      margin: 20px 0 14px 0;
    }
    .report-property-name {
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 0.5px;
      font-family: Arial, Helvetica, sans-serif;
      margin-bottom: 3px;
    }
    .report-property-sub {
      font-size: 14px;
      font-weight: bold;
    }

    /* Premise Details Table/Grid */
    .report-details-grid {
      display: grid;
      grid-template-columns: 160px 1fr;
      row-gap: 10px;
      column-gap: 16px;
      margin-bottom: 24px;
      padding: 0 10px;
    }
    .report-field-label {
      font-weight: normal;
    }
    .report-field-value {
      color: #111;
    }
    .report-calc-row {
      display: flex;
      align-items: center;
    }
    .report-rent-val {
      min-width: 100px;
    }
    .report-rent-cycle {
      margin-left: 20px;
      min-width: 110px;
    }
    .report-rent-total {
      margin-left: 30px;
    }
    .report-term-months {
      min-width: 100px;
    }
    .report-term-dates {
      margin-left: 20px;
    }
    .report-bottom-clause {
      margin-top: auto;
      margin-bottom: 16px;
      font-size: 12px;
      line-height: 1.6;
      text-align: justify;
    }

    /* Page Number Footer */
    .report-page-footer {
      text-align: right;
      font-size: 11px;
      color: #333;
      padding-top: 8px;
      border-top: 1px solid #f1f1f1;
      font-family: Arial, Helvetica, sans-serif;
    }

    /* Page 2 & 3 Clauses */
    .report-clauses-body {
      display: flex;
      flex-direction: column;
      gap: 11px;
      font-size: 12.5px;
      line-height: 1.65;
      text-align: justify;
    }
    .report-clause-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .report-clause-num {
      font-weight: bold;
      flex-shrink: 0;
    }
    .report-clause-text {
      flex: 1;
    }
    .report-sub-clauses {
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin-top: 6px;
      padding-left: 8px;
    }

    /* Page 3 Signatures */
    .report-closing-statement {
      margin: 14px 0 20px 0;
      line-height: 1.7;
      font-size: 12.5px;
    }
    .report-signatures-row {
      display: flex;
      justify-content: space-between;
      margin-top: 18px;
      margin-bottom: 24px;
    }
    .report-sig-column {
      width: 45%;
    }
    .report-sig-label {
      font-weight: normal;
      margin-bottom: 8px;
    }
    .report-sig-name {
      font-weight: bold;
      margin-bottom: 4px;
    }
    .report-sig-line {
      border-bottom: 1px solid #333;
      margin-top: 6px;
      margin-bottom: 6px;
      width: 80%;
      display: inline-block;
    }
    .report-witnesses-section {
      margin-top: 10px;
    }
    .report-witnesses-title {
      text-align: center;
      font-weight: bold;
      margin-bottom: 16px;
    }
    .report-witnesses-grid {
      display: flex;
      justify-content: space-between;
      gap: 40px;
    }
    .report-witness-col {
      width: 48%;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .report-witness-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }
    .report-witness-label {
      width: 65px;
      font-weight: 500;
    }
    .report-witness-line {
      flex: 1;
      border-bottom: 1px solid #444;
      height: 16px;
    }

    @page {
      size: A4 portrait;
      margin: 12mm 15mm 12mm 15mm;
    }
    @media print {
      html, body {
        background: #fff !important;
      }
      .no-print {
        display: none !important;
      }
      .preview-container {
        padding: 0 !important;
        margin: 0 !important;
        gap: 0 !important;
        background: #fff !important;
        min-height: auto !important;
        display: block !important;
      }
      .report-page {
        box-shadow: none !important;
        border-radius: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        min-height: 270mm !important;
        page-break-after: always;
        break-after: page;
      }
      .report-page:last-child {
        page-break-after: avoid;
        break-after: avoid;
      }
    }
  </style>
</head>
<body>
  ${renderToolbarHtml('Lease Form Preview (A4)', lease.leaseNumber, lease.status)}

  <div class="preview-container">
    <!-- PAGE 1: PARTIES & PREMISES DETAILS -->
    <div class="report-page">
      <div>
        ${headerHtml}

        <div class="report-doc-title">ဆိုင်ခန်းငှားရမ်းခြင်းကတိစာချုပ်</div>

        <div class="report-preamble">
          ဤ ဆိုင်ခန်းငှားရမ်းခြင်းကတိစာချုပ်ကို
          ${lessorAddress ? `<br />${escapeHtml(lessorAddress)}` : ''}
          <br />( ${escapeHtml(contractDateFormatted)} ) ရက်နေ့တွင် အောက်ပါအမည်ပါသူတို့က
        </div>

        <div class="report-parties-grid">
          <div class="report-party-block">
            <div class="report-party-label">အငှားချထားသူ</div>
            <div class="report-party-content">
              <div class="report-party-name">${escapeHtml(lessorName)}</div>
              <div class="report-sub-details">
                (ကုမ္ပဏီ၏ ကိုယ်စားလှယ်စာရသူ ${escapeHtml(leaserName)}
                <br />
                မှတ်ပုံတင်အမှတ် <strong>${escapeHtml(lessorNirc)}</strong> မှလက်မှတ်ရေးထိုးပါသည်။)
              </div>
              <div class="report-sub-details">ရာထူး ${escapeHtml(leaserPosition)}</div>
              ${lessorAddress ? `<div class="report-sub-details">${escapeHtml(lessorAddress)}</div>` : ''}
            </div>
          </div>

          <div class="report-party-block">
            <div class="report-party-label">ငှားရမ်းသူ</div>
            <div class="report-party-content">
              <div class="report-party-name">${escapeHtml(lesseeName)}</div>
              ${lesseeNirc ? `<div class="report-sub-details">${escapeHtml(lesseeNirc)}</div>` : ''}
              ${lesseeAddress ? `<div class="report-sub-details">${escapeHtml(lesseeAddress)}</div>` : ''}
            </div>
          </div>
        </div>

        <div class="report-center-section">
          <div class="report-property-name">${escapeHtml(propertyName)}</div>
          <div class="report-property-sub">အငှားချထားသည့် ဆိုင်ခန်းနေရာ</div>
        </div>

        <div class="report-details-grid">
          <div class="report-field-label">ဆိုင်ခန်းအမှတ်</div>
          <div class="report-field-value">${escapeHtml(unitNumber)}</div>

          <div class="report-field-label">အထပ်/အကျယ်အဝန်း</div>
          <div class="report-field-value">
            <span>${escapeHtml(floorLabel)}</span>
            ${areaSqft ? `<span style="margin-left:30px;">/ ${escapeHtml(areaSqft)}</span>` : ''}
          </div>

          <div class="report-field-label">ငှားရမ်းခနှုန်း</div>
          <div class="report-field-value report-calc-row">
            <span class="report-rent-val">${escapeHtml(rentFormatted)}</span>
            <span class="report-rent-cycle">/ Month x ${months > 0 ? escapeHtml(months) : ''}</span>
            <span class="report-rent-total">= ${escapeHtml(totalRentFormatted)}</span>
          </div>

          <div class="report-field-label">ငှားရမ်းကာလ</div>
          <div class="report-field-value report-calc-row">
            <span class="report-term-months">${months ? `${escapeHtml(months)} ` : ''}Months</span>
            <span class="report-term-dates">${escapeHtml(contractStartDateFormatted)} ~ ${escapeHtml(contractEndDateFormatted)}</span>
          </div>

          <div class="report-field-label">ဆိုင်အမည်</div>
          <div class="report-field-value">${escapeHtml(shopName)}</div>
        </div>
      </div>

      <div>
        <div class="report-bottom-clause">
          (အထက်အမည်ပါအငှားချထားသူနှင့် ငှားရမ်းသူဟုဆိုရာတွင်
          ၎င်းတို့ကိုယ်တိုင်အပြင်၊ ၎င်းတို့၏ တရားဝင်ကိုယ်စားလှယ်စာရသူ၊
          အမွေခံစားအမွေခံများ၊ ကုမ္ပဏီမှ
          ကိုယ်စားလှယ်လွှဲပြောင်းခံရသူများ အားလုံးပါဝင်သည်ဟု
          မှတ်ယူရမည်။)
        </div>
        <div class="report-page-footer">Page 1 of 3</div>
      </div>
    </div>

    <!-- PAGE 2: CLAUSES 1 TO 8 -->
    <div class="report-page">
      <div>
        ${headerHtml}

        <div class="report-clauses-body">
          <div class="report-clause-item">
            <span class="report-clause-num">၁။</span>
            <span class="report-clause-text">
              အထက်ဖော်ပြပါအငှားချထားသည့် ${escapeHtml(lessorName)} သည်
              ${propertyAddress ? `${escapeHtml(propertyAddress)}ရှိ ` : ''}
              ${propertyName ? `${escapeHtml(propertyName)} တွင် ` : ''}
              ဖွင့်လှစ်ထားပြီး ဆိုင်ခန်းများ အငှားချုပ်ထားသော
              ကုမ္ပဏီကြီးတစ်ခု ဖြစ်ပါသည်။
            </span>
          </div>

          <div class="report-clause-item">
            <span class="report-clause-num">၂။</span>
            <span class="report-clause-text">
              ငှားရမ်းသူသည်ဥပစာကို တစ်လလျှင်( ${escapeHtml(rentFormatted)} )
              နှုန်းဖြင့် ယခုစာချုပ် ချုပ်ဆိုသည့်နေ့မှ( ${escapeHtml(months)} ) လအထိ
              ငှားရမ်းမည်ဖြစ်ပါသည်။ ( ${escapeHtml(months)} ) လအတွက်
              ကြိုတင်ပေးငွေပေါင်း ${escapeHtml(totalRentFormatted)} (ကျပ်
              ${escapeHtml(rentBurmeseWords)} တိတိ) ဖြစ်ပြီး
              ငှားရမ်းစတင်သည့်နေ့မှစ၍ငွေအကျေပေးရမည်ဖြစ်ပါသည်။
            </span>
          </div>

          <div class="report-clause-item">
            <span class="report-clause-num">၃။</span>
            <span class="report-clause-text">
              အငှားချထားသည့်သက်တမ်းကာလ( ${escapeHtml(months)} )လပြည့်တိုင်း
              သက်တမ်းမကုန်ဆုံးမီ (၂) လအလိုတွင်
              ဆိုင်ငှားမှဆက်လက်ငှားရမ်းလိုပါက ကုမ္ပဏီသို့စာဖြင့်
              ထပ်မံငှားရမ်းခွင့် လျှောက်ထားရယူရမည်ဖြစ်ပါသည်။
              ယင်းသို့လျှောက်ထားခြင်းမရှိပါက
              ဆက်လက်ငှားရမ်းလိုခြင်းမရှိဟု ယူဆမည်ဖြစ်ပြီး
              အငှားချထားခြင်းကို ရပ်စဲမည်ဖြစ်ပါသည်။
            </span>
          </div>

          <div class="report-clause-item">
            <span class="report-clause-num">၄။</span>
            <span class="report-clause-text">
              ထပ်မံငှားရမ်းခွင့်လျှောက်လွှာစာအရ
              ကုမ္ပဏီဖက်မှဆက်လက်ငှားရမ်းမည်ဆိုပါက အကြောင်းကြားစာ
              ပြန်လည်ပေးပို့မည်ဖြစ်ပြီးအကြောင်းကြားစာပါ
              သတ်မှတ်ချက်အတိုင်း စာချုပ်ချုပ်ဆိုရပါမည်။
            </span>
          </div>

          <div class="report-clause-item">
            <span class="report-clause-num">၅။</span>
            <div class="report-clause-text">
              အငှားချထားသည့်
              သက်တမ်းကာလအတွင်းစီမံခန့်ခွဲအုပ်ချုပ်မှုကော်မတီကို
              ဆိုင်ခန်းပိုင်ရှင်ကဖွဲ့စည်းပေးထားပြီးဖြစ်၍
              ငှားရမ်းသူအနေဖြင့်သီးခြားဖွဲ့စည်းခွင့်မရှိပါ။ဆိုင်ခန်းငှားရမ်းသူသည်စီမံခန့်ခွဲအုပ်ချုပ်မှုကော်မတီက
              အခါအားလျော်စွာချမှတ်သည့်စည်းကမ်းချက်များကို
              လိုက်နာရမည့်အပြင် အောက်ဖော်ြပပါစည်းကမ်းချက်များကို
              လိုက်နာရမည်။
              <div class="report-sub-clauses">
                ${SUB_CLAUSES_5.map((sc) => `<div><strong>${escapeHtml(sc.num)}</strong> ${escapeHtml(sc.text)}</div>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="report-page-footer">Page 2 of 3</div>
    </div>

    <!-- PAGE 3: CLAUSES 9 TO 17 & SIGNATURES -->
    <div class="report-page">
      <div>
        ${headerHtml}

        <div class="report-clauses-body">
          ${clausesPage3
            .map(
              (cl) => `
            <div class="report-clause-item">
              <span class="report-clause-num">${escapeHtml(cl.num)}</span>
              <span class="report-clause-text">${escapeHtml(cl.text)}</span>
            </div>`,
            )
            .join('')}

          <div class="report-closing-statement">
            ဤဆိုင်ခန်း ငှားရမ်းခြင်း ကတိစာချုပ်အား သေချာ
            ဖတ်ရှု့နားလည်သဘောပေါက်ပြီး အောက်အမည်ပါအသိသက်သေများရှေ့တွင်
            လက်မှတ်ရေးထိုးစာချုပ်ချုပ်ဆိုကြခြင်းဖြစ်ပါသည်။
          </div>
        </div>

        <div class="report-signatures-row">
          <div class="report-sig-column">
            <div class="report-sig-label">အငှားချထားသူ</div>
            <div class="report-sig-name">${escapeHtml(leaserName)}</div>
            <div>${escapeHtml(leaserPosition.toUpperCase())}</div>
            <div>${escapeHtml(lessorName)}</div>
          </div>

          <div class="report-sig-column">
            <div class="report-sig-label">ငှားရမ်းသူ</div>
            <div class="report-sig-name">${escapeHtml(lesseeSignedName || lesseeName)}</div>
            <div class="report-sig-line"></div>
            <div>${escapeHtml(lesseeNirc)}</div>
            <div class="report-sig-line"></div>
          </div>
        </div>

        <div class="report-witnesses-section">
          <div class="report-witnesses-title">အသိသက်သေများ</div>
          <div class="report-witnesses-grid">
            ${[1, 2]
              .map(
                () => `
              <div class="report-witness-col">
                ${['အမည်', 'မှတ်ပုံတင်', 'နေရပ်']
                  .map(
                    (label) => `
                  <div class="report-witness-row">
                    <span class="report-witness-label">${escapeHtml(label)}</span>
                    <div class="report-witness-line"></div>
                  </div>`,
                  )
                  .join('')}
              </div>`,
              )
              .join('')}
          </div>
        </div>
      </div>

      <div class="report-page-footer">Page 3 of 3</div>
    </div>
  </div>
</body>
</html>`;
}

export function generateLeasePreviewHtml(lease: LeaseDetail): string {
  const COMMERCIAL_TAX_RATE = 0.05; // 5%
  const currency = lease.currency || lease.property.currency || 'MMK';
  const rent = Number(lease.rentAmount) || 0;
  const months = lease.leaseTermMonths || 0;
  const rentAmount = rent * months;
  const planUnit = lease.unit.areaSqft ?? null;

  const extraCharges = (lease.leaseCharges || [])
    .filter((c) => c.chargeType.category !== 'rent')
    .map((c) => ({ name: c.chargeType.name, amount: Number(c.amount) }));

  const subtotal = rentAmount + extraCharges.reduce((s, c) => s + c.amount, 0);
  const discount = 0;
  const taxable = subtotal - discount;
  const commercialTax = taxable * COMMERCIAL_TAX_RATE;
  const totalCurrentCharge = taxable + commercialTax;

  const invoiceNo = `RINV-${lease.leaseNumber}`;
  const dateStr = fmtDate(new Date());

  const isCompany = lease.tenant.tenantType !== 'individual';
  const customerId = isCompany ? '-' : lease.tenant.firstName || '-';
  const customerName = isCompany ? lease.tenant.companyName || '' : lease.tenant.lastName || '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lease Preview - ${escapeHtml(invoiceNo)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      background: #525659;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      color: #1a1a2e;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    ${SHARED_VIEWER_TOOLBAR_CSS}

    /* Exact A4 Portrait Dimensions (210mm x 297mm) */
    .invoice-paper {
      background: #fff;
      width: 210mm;
      min-height: 297mm;
      padding: 16mm 18mm 18mm 18mm;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
      border-radius: 2px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }

    .inv-title {
      color: #2f6fd0;
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .inv-meta {
      display: grid;
      grid-template-columns: auto auto auto;
      justify-content: end;
      column-gap: 8px;
      row-gap: 10px;
      font-size: 13.5px;
      margin-bottom: 20px;
      color: #000;
    }
    .inv-meta-label { text-align: right; font-weight: 400; }
    .inv-meta-colon { text-align: center; }
    .inv-meta-value { text-align: left; }
    .inv-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .inv-table th, .inv-table td {
      border: 1px solid #333;
      padding: 8px 10px;
    }
    .inv-desc-col { text-align: center; }
    .inv-month-col, .inv-num-col { text-align: center; }
    .inv-cur { font-weight: 400; }
    .inv-center { text-align: center; }
    .inv-num { text-align: right; }
    .inv-boxed { background: #f2f2f4; }
    .inv-desc-grid { display: flex; align-items: flex-start; gap: 28px; }
    .inv-desc-name { flex: 1; }
    .inv-desc-main { font-weight: 600; }
    .inv-desc-line2 { margin-top: 4px; }
    .inv-desc-field { text-align: right; min-width: 90px; }
    .inv-desc-flabel { margin-bottom: 4px; }
    .inv-blank { border: none !important; }
    .inv-label-cell { text-align: right; font-weight: 600; }
    .inv-grand { font-weight: 700; }

    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    @media print {
      html, body {
        background: #fff !important;
        width: 210mm;
        height: 297mm;
      }
      .no-print {
        display: none !important;
      }
      .preview-container {
        padding: 0 !important;
        margin: 0 !important;
        background: #fff !important;
        min-height: auto !important;
        display: block !important;
      }
      .invoice-paper {
        width: 100% !important;
        min-height: auto !important;
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
      }
    }
  </style>
</head>
<body>
  ${renderToolbarHtml('Lease Preview (A4)', invoiceNo, lease.status)}

  <div class="preview-container">
    <div class="invoice-paper">
      <div class="inv-meta">
        <span class="inv-meta-label">Customer ID</span><span class="inv-meta-colon">:</span><span class="inv-meta-value">${escapeHtml(customerId)}</span>
        <span class="inv-meta-label">Customer Name</span><span class="inv-meta-colon">:</span><span class="inv-meta-value">${escapeHtml(customerName)}</span>
        <span class="inv-meta-label">Invoice No</span><span class="inv-meta-colon">:</span><span class="inv-meta-value">${escapeHtml(invoiceNo)}</span>
        <span class="inv-meta-label">Date</span><span class="inv-meta-colon">:</span><span class="inv-meta-value">${escapeHtml(dateStr)}</span>
        <span class="inv-meta-label">Refer No</span><span class="inv-meta-colon">:</span><span class="inv-meta-value">${escapeHtml(lease.unit.unitNumber)}</span>
      </div>

      <table class="inv-table">
        <thead>
          <tr>
            <th rowspan="2" class="inv-desc-col">Description</th>
            <th rowspan="2" class="inv-month-col">Month</th>
            <th class="inv-num-col">Price Per Unit</th>
            <th class="inv-num-col">Amount</th>
          </tr>
          <tr>
            <th class="inv-num-col inv-cur">${escapeHtml(currency)}</th>
            <th class="inv-num-col inv-cur">${escapeHtml(currency)}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="inv-desc-cell">
              <div class="inv-desc-grid">
                <div class="inv-desc-name">
                  <div class="inv-desc-main">Room</div>
                  <div class="inv-desc-line2">Room Advance Rental Fee</div>
                </div>
                <div class="inv-desc-field">
                  <div class="inv-desc-flabel"><u>Advance Fee</u></div>
                  <div class="inv-desc-fval">${escapeHtml(money(rent))}</div>
                </div>
                ${planUnit != null ? `
                  <div class="inv-desc-field">
                    <div class="inv-desc-flabel"><u>Plan Unit</u></div>
                    <div class="inv-desc-fval">${escapeHtml(Number(planUnit).toLocaleString())}</div>
                  </div>
                ` : ''}
              </div>
            </td>
            <td class="inv-center">${escapeHtml(months)}</td>
            <td class="inv-num inv-boxed">${escapeHtml(money(rent))}</td>
            <td class="inv-num inv-boxed">${escapeHtml(money(rentAmount))}</td>
          </tr>

          ${extraCharges
            .map(
              (c) => `
            <tr>
              <td class="inv-desc-cell"><div class="inv-desc-main">${escapeHtml(c.name)}</div></td>
              <td class="inv-center">—</td>
              <td class="inv-num inv-boxed">${escapeHtml(money(c.amount))}</td>
              <td class="inv-num inv-boxed">${escapeHtml(money(c.amount))}</td>
            </tr>`,
            )
            .join('')}

          <tr>
            <td class="inv-blank" colspan="2"></td>
            <td class="inv-label-cell">Total :</td>
            <td class="inv-num inv-boxed">${escapeHtml(money(subtotal))}</td>
          </tr>
          <tr>
            <td class="inv-blank" colspan="2"></td>
            <td class="inv-label-cell">Discount :</td>
            <td class="inv-num inv-boxed">${escapeHtml(money(discount))}</td>
          </tr>
          <tr>
            <td class="inv-blank" colspan="2"></td>
            <td class="inv-label-cell">Commercial Tax :</td>
            <td class="inv-num">${escapeHtml(money(commercialTax))}</td>
          </tr>
          <tr>
            <td class="inv-blank" colspan="2"></td>
            <td class="inv-label-cell inv-grand">Total Current Charge :</td>
            <td class="inv-num inv-boxed inv-grand">${escapeHtml(money(totalCurrentCharge))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

export function openLeaseFormPrintPreview(
  lease: LeaseDetail,
  users: { fullName?: string; jobTitle?: string | null }[] = [],
  leads: any[] = [],
): void {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to view the lease form report.');
    return;
  }
  const html = generateLeaseFormHtml(lease, users, leads);
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

export function openLeasePreviewReport(lease: LeaseDetail): void {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to view the lease preview.');
    return;
  }
  const html = generateLeasePreviewHtml(lease);
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}
