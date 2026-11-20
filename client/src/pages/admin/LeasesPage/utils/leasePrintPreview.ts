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

export type LeaseReportType = 'summary' | 'detail' | 'form' | 'preview';

export interface LeaseReportFiltersInfo {
  currency?: string;
  fromDate?: string;
  toDate?: string;
  expiringWithinDays?: number;
  startLease?: string;
  endLease?: string;
  floor?: string;
  unit?: string;
  tenant?: string;
  status?: string;
}

export function openLeasesReportPreview(params: {
  reportType: LeaseReportType;
  leases: Array<LeaseDetail | any>;
  users?: { fullName?: string; jobTitle?: string | null }[];
  leads?: any[];
  targetWindow?: Window | null;
  filters?: LeaseReportFiltersInfo;
}): boolean {
  const { reportType, leases, users = [], leads = [], targetWindow, filters } = params;
  const win = targetWindow || window.open('', '_blank');
  if (!win) return false;

  if (reportType === 'form') {
    if (leases.length === 1) {
      const html = generateLeaseFormHtml(leases[0] as LeaseDetail, users, leads);
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      return true;
    }
    const pagesHtml = leases
      .map((l) => {
        const single = generateLeaseFormHtml(l as LeaseDetail, users, leads);
        const bodyMatch = single.match(/<div class="preview-container">([\s\S]*?)<\/div>\s*<\/body>/i);
        return bodyMatch ? bodyMatch[1] : '';
      })
      .join('\n');
    const baseHtml = generateLeaseFormHtml(leases[0] as LeaseDetail, users, leads).replace(
      /<div class="preview-container">[\s\S]*?<\/div>\s*<\/body>/i,
      `<div class="preview-container">${pagesHtml}</div></body>`,
    );
    win.document.open();
    win.document.write(baseHtml);
    win.document.close();
    win.focus();
    return true;
  }

  if (reportType === 'preview') {
    if (leases.length === 1) {
      const html = generateLeasePreviewHtml(leases[0] as LeaseDetail);
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      return true;
    }
    const papersHtml = leases
      .map((l) => {
        const single = generateLeasePreviewHtml(l as LeaseDetail);
        const m = single.match(/<div class="invoice-paper">[\s\S]*?<\/div>\s*<\/div>\s*<\/body>/i);
        return m ? m[0].replace(/<\/div>\s*<\/body>$/i, '') : '';
      })
      .join('<div style="height:24px;page-break-after:always;"></div>');
    const baseHtml = generateLeasePreviewHtml(leases[0] as LeaseDetail).replace(
      /<div class="preview-container">[\s\S]*?<\/body>/i,
      `<div class="preview-container" style="flex-direction:column;align-items:center;gap:24px;">${papersHtml}</div></body>`,
    );
    win.document.open();
    win.document.write(baseHtml);
    win.document.close();
    win.focus();
    return true;
  }

  const reportTitle =
    reportType === 'summary' ? 'Lease Summary Report' : 'Lease Detail Report';
  const firstProp = leases[0]?.property;
  const generatedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const filterBadges: string[] = [];
  if (filters?.currency) filterBadges.push(`Currency: ${filters.currency}`);
  if (filters?.fromDate) filterBadges.push(`From: ${fmtDate(filters.fromDate)}`);
  if (filters?.toDate) filterBadges.push(`To: ${fmtDate(filters.toDate)}`);
  if (filters?.expiringWithinDays) filterBadges.push(`Expiring Within: ${filters.expiringWithinDays} Days`);
  if (filters?.startLease) filterBadges.push(`Start Lease: ${filters.startLease}`);
  if (filters?.endLease) filterBadges.push(`End Lease: ${filters.endLease}`);
  if (filters?.floor) filterBadges.push(`Floor: ${filters.floor}`);
  if (filters?.unit) filterBadges.push(`Unit: ${filters.unit}`);
  if (filters?.tenant) filterBadges.push(`Tenant: ${filters.tenant}`);
  if (filters?.status) filterBadges.push(`Status: ${filters.status.toUpperCase()}`);
  if (filterBadges.length === 0) filterBadges.push('All Leases');

  const grandTotalsByCurrency: Record<
    string,
    { monthlyRent: number; contractTotal: number; deposit: number; extraCharges: number }
  > = {};

  for (const l of leases) {
    const cur = (l.currency || 'MMK').toUpperCase();
    if (!grandTotalsByCurrency[cur]) {
      grandTotalsByCurrency[cur] = {
        monthlyRent: 0,
        contractTotal: 0,
        deposit: 0,
        extraCharges: 0,
      };
    }
    const rent = Number(l.rentAmount) || 0;
    const term = Number(l.leaseTermMonths) || 1;
    const dep = Number(l.securityDeposit) || 0;
    const extras = Array.isArray(l.leaseCharges)
      ? l.leaseCharges.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0)
      : 0;
    grandTotalsByCurrency[cur].monthlyRent += rent;
    grandTotalsByCurrency[cur].contractTotal += rent * term;
    grandTotalsByCurrency[cur].deposit += dep;
    grandTotalsByCurrency[cur].extraCharges += extras;
  }

  const getTenantCode = (l: any) => l.tenant?.firstName || l.tenant?.code || '-';
  const getTenantName = (l: any) =>
    l.tenant?.tenantType && l.tenant.tenantType !== 'individual'
      ? l.tenant?.companyName || l.tenant?.displayName || '-'
      : l.tenant?.lastName || l.tenant?.displayName || l.tenant?.firstName || '-';
  const getFloorText = (l: any) =>
    l.unit?.floorLabel ||
    (l.unit?.floorNumber !== null && l.unit?.floorNumber !== undefined
      ? `Floor ${l.unit.floorNumber}`
      : '-');

  const tableHtml =
    reportType === 'summary'
      ? `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:38px;text-align:center;">No.</th>
            <th>Lease #</th>
            <th>Floor</th>
            <th>Unit</th>
            <th>Code</th>
            <th>Tenant Name</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th style="text-align:center;">Term</th>
            <th style="text-align:center;">Curr</th>
            <th style="text-align:right;">Rent / Mo</th>
            <th style="text-align:right;">Contract Rent</th>
            <th style="text-align:right;">Deposit</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${leases
            .map((l, idx) => {
              const rent = Number(l.rentAmount) || 0;
              const term = Number(l.leaseTermMonths) || 1;
              const dep = Number(l.securityDeposit) || 0;
              return `
              <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="font-weight:700;">${escapeHtml(l.leaseNumber)}</td>
                <td>${escapeHtml(getFloorText(l))}</td>
                <td>${escapeHtml(l.unit?.unitNumber || '-')}</td>
                <td>${escapeHtml(getTenantCode(l))}</td>
                <td>${escapeHtml(getTenantName(l))}</td>
                <td>${escapeHtml(fmtDate(l.startDate))}</td>
                <td>${escapeHtml(fmtDate(l.endDate))}</td>
                <td style="text-align:center;">${escapeHtml(term)} mos</td>
                <td style="text-align:center;">${escapeHtml(l.currency || 'MMK')}</td>
                <td style="text-align:right;font-weight:600;">${money(rent)}</td>
                <td style="text-align:right;font-weight:600;">${money(rent * term)}</td>
                <td style="text-align:right;">${money(dep)}</td>
                <td style="text-transform:uppercase;font-size:10.5px;font-weight:700;">${escapeHtml((l.status || '').replace(/_/g, ' '))}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
        <tfoot>
          ${Object.entries(grandTotalsByCurrency)
            .map(
              ([cur, t]) => `
            <tr class="summary-row">
              <td colspan="10" style="text-align:right;font-weight:700;">Grand Total — ${leases.length.toLocaleString()} Leases (${escapeHtml(cur)})</td>
              <td style="text-align:right;font-weight:700;">${money(t.monthlyRent)}</td>
              <td style="text-align:right;font-weight:700;">${money(t.contractTotal)}</td>
              <td style="text-align:right;font-weight:700;">${money(t.deposit)}</td>
              <td></td>
            </tr>`,
            )
            .join('')}
        </tfoot>
      </table>`
      : `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:38px;text-align:center;">No.</th>
            <th>Lease #</th>
            <th>Floor / Unit</th>
            <th>Area (Sqft)</th>
            <th>Tenant</th>
            <th>Period (Start ~ End)</th>
            <th style="text-align:center;">Term</th>
            <th>Charge Code / Type</th>
            <th style="text-align:center;">Curr</th>
            <th style="text-align:right;">Monthly / Rate</th>
            <th style="text-align:right;">Total Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${leases
            .map((l, idx) => {
              const rent = Number(l.rentAmount) || 0;
              const term = Number(l.leaseTermMonths) || 1;
              const contractRent = rent * term;
              const floorUnit = [getFloorText(l), l.unit?.unitNumber]
                .filter((x) => x && x !== '-')
                .join(' / ');
              const tenantLabel = `${getTenantCode(l)} — ${getTenantName(l)}`;
              const charges: any[] = Array.isArray(l.leaseCharges) ? l.leaseCharges : [];
              const extraSum = charges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
              const mainRow = `
              <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="font-weight:700;">${escapeHtml(l.leaseNumber)}</td>
                <td>${escapeHtml(floorUnit || '-')}</td>
                <td style="text-align:right;">${l.unit?.areaSqft ? escapeHtml(Number(l.unit.areaSqft).toLocaleString()) : '-'}</td>
                <td>${escapeHtml(tenantLabel)}</td>
                <td>${escapeHtml(fmtDate(l.startDate))} ~ ${escapeHtml(fmtDate(l.endDate))}</td>
                <td style="text-align:center;">${escapeHtml(term)} mos</td>
                <td><strong>RENT</strong> — Base Rental</td>
                <td style="text-align:center;">${escapeHtml(l.currency || 'MMK')}</td>
                <td style="text-align:right;">${money(rent)}</td>
                <td style="text-align:right;font-weight:600;">${money(contractRent)}</td>
                <td style="text-transform:uppercase;font-size:10.5px;font-weight:700;">${escapeHtml((l.status || '').replace(/_/g, ' '))}</td>
              </tr>`;
              const chargeRows = charges
                .map(
                  (c) => `
              <tr>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td style="text-align:center;">—</td>
                <td><strong>${escapeHtml(c.chargeType?.code || '')}</strong> — ${escapeHtml(c.chargeType?.name || '')}</td>
                <td style="text-align:center;">${escapeHtml(l.currency || 'MMK')}</td>
                <td style="text-align:right;">${money(Number(c.amount) || 0)}</td>
                <td style="text-align:right;font-weight:600;">${money(Number(c.amount) || 0)}</td>
                <td></td>
              </tr>`,
                )
                .join('');
              const subRow = `
              <tr style="background:#f8fafc;">
                <td colspan="10" style="text-align:right;font-weight:600;font-size:11px;color:#475569;">
                  Subtotal for ${escapeHtml(l.leaseNumber)} (${escapeHtml(l.currency || 'MMK')}) — Security Deposit: ${money(Number(l.securityDeposit) || 0)}
                </td>
                <td style="text-align:right;font-weight:700;">${money(contractRent + extraSum)}</td>
                <td></td>
              </tr>`;
              return mainRow + chargeRows + subRow;
            })
            .join('')}
        </tbody>
        <tfoot>
          ${Object.entries(grandTotalsByCurrency)
            .map(
              ([cur, t]) => `
            <tr class="summary-row">
              <td colspan="10" style="text-align:right;font-weight:700;">Grand Total — ${leases.length.toLocaleString()} Leases (${escapeHtml(cur)})</td>
              <td style="text-align:right;font-weight:700;">${money(t.contractTotal + t.extraCharges)}</td>
              <td></td>
            </tr>`,
            )
            .join('')}
        </tfoot>
      </table>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #525659;
      font-family: 'Inter', 'Noto Sans Myanmar', Arial, sans-serif;
      font-size: 12px;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 24px;
      background: #1e293b;
      color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .preview-toolbar-title {
      font-size: 13px;
      font-weight: 700;
      color: #e2e8f0;
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
    }
    .preview-btn-print { background: #10b981; color: #fff; }
    .preview-btn-print:hover { background: #059669; }
    .preview-btn-close {
      background: rgba(255,255,255,0.12);
      color: #f1f5f9;
      border-color: rgba(255,255,255,0.2);
    }
    .preview-container {
      padding: 24px 16px;
      display: flex;
      justify-content: center;
    }
    .report-sheet {
      background: #fff;
      width: 297mm;
      min-height: 210mm;
      padding: 14mm 16mm;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
      border-radius: 2px;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .report-title { font-size: 20px; line-height: 24px; font-weight: 800; color: #0f172a; }
    .report-subtitle { font-size: 13px; line-height: 16px; font-weight: 600; color: #475569; margin-top: 4px; }
    .report-meta { text-align: right; font-size: 11px; color: #475569; line-height: 1.5; }
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .filter-chip {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #334155;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    .report-table th,
    .report-table td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      vertical-align: middle;
    }
    .report-table thead th {
      background: #059669;
      color: #ffffff;
      font-weight: 700;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .report-table tbody tr:nth-child(even) { background: #f8fafc; }
    .summary-row td {
      background: #f1f5f9;
      border-top: 2px solid #0f172a;
      font-size: 11px;
    }
    @page { size: A4 landscape; margin: 10mm 12mm; }
    @media print {
      body { background: #fff !important; }
      .no-print { display: none !important; }
      .preview-container { padding: 0 !important; display: block !important; }
      .report-sheet {
        width: 100% !important;
        min-height: auto !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="preview-toolbar no-print">
    <div class="preview-toolbar-title">
      ${escapeHtml(reportTitle)} — Total ${leases.length.toLocaleString()} lease${leases.length !== 1 ? 's' : ''}
    </div>
    <div class="preview-toolbar-actions">
      <button class="preview-btn preview-btn-print" onclick="window.print()">
        Print / Save as PDF
      </button>
      <button class="preview-btn preview-btn-close" onclick="window.close()">
        Close
      </button>
    </div>
  </div>
  <div class="preview-container">
    <div class="report-sheet">
      <div class="report-header">
        <div>
          <div class="report-title">${escapeHtml(reportTitle)}</div>
          <div class="report-subtitle">${escapeHtml(firstProp?.name || 'All Properties')}</div>
        </div>
        <div class="report-meta">
          <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
          <div><strong>Total Matched Leases:</strong> ${leases.length.toLocaleString()}</div>
        </div>
      </div>
      <div class="filter-bar">
        ${filterBadges.map((b) => `<span class="filter-chip">${escapeHtml(b)}</span>`).join('')}
      </div>
      ${tableHtml}
    </div>
  </div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. TENANT UNIT & LEASE HISTORY REPORT (Summary & Detail Grouped by Tenant)
// ═══════════════════════════════════════════════════════════════════════════

export type TenantReportType = 'detail' | 'summary';
export type TenantOccupancyFilter = 'all' | 'current' | 'previous';

export interface TenantReportFilterLabels {
  reportType: TenantReportType;
  occupancyFilter?: TenantOccupancyFilter;
  fromDate?: string;
  toDate?: string;
  floor?: string;
  unit?: string;
  tenant?: string;
  status?: string;
  currency?: string;
  sortByLabel?: string;
  sortOrder?: 'asc' | 'desc';
}

export function isCurrentOccupancyLease(status?: string | null): boolean {
  const s = (status || '').toLowerCase();
  return s === 'active' || s === 'approved';
}

export function isPreviousOccupancyLease(status?: string | null): boolean {
  const s = (status || '').toLowerCase();
  return s === 'expired' || s === 'terminated' || s === 'renewed' || s === 'cancelled';
}

export function openTenantReportPreview(
  leases: Array<LeaseDetail | any>,
  filters: TenantReportFilterLabels,
): boolean {
  if (!leases || leases.length === 0) return false;

  const win = window.open('', '_blank');
  if (!win) return false;

  const firstProp = leases.find((l) => l.property)?.property;
  const generatedAt = fmtDate(new Date());

  const getFloorText = (l: any): string => {
    const fl = l.unit?.floorLabel;
    const fn = l.unit?.floorNumber;
    if (fl && String(fl).trim()) return String(fl).trim();
    if (fn !== null && fn !== undefined && String(fn).trim() !== '') {
      return String(fn).trim();
    }
    return '-';
  };

  const getTenantCode = (l: any): string => {
    const t = l.tenant;
    if (!t) return '-';
    return (t.firstName || t.code || t.displayName || '-').trim();
  };

  const getTenantName = (l: any): string => {
    const t = l.tenant;
    if (!t) return '-';
    return (t.lastName || t.companyName || t.displayName || t.firstName || '-').trim();
  };

  const getTenantContact = (l: any): string => {
    const t = l.tenant;
    if (!t) return '-';
    const phone = t.mobile || t.phone || '';
    const email = t.email || '';
    const parts = [phone, email].filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : '-';
  };

  // Group leases by tenant
  interface TenantGroup {
    tenantId: string;
    tenantCode: string;
    tenantName: string;
    contact: string;
    leases: any[];
    currentLeases: any[];
    previousLeases: any[];
  }

  const groupMap = new Map<string, TenantGroup>();
  for (const l of leases) {
    const tId = l.tenant?.id || `${getTenantCode(l)}__${getTenantName(l)}`;
    let g = groupMap.get(tId);
    if (!g) {
      g = {
        tenantId: tId,
        tenantCode: getTenantCode(l),
        tenantName: getTenantName(l),
        contact: getTenantContact(l),
        leases: [],
        currentLeases: [],
        previousLeases: [],
      };
      groupMap.set(tId, g);
    }
    if (g.contact === '-' && getTenantContact(l) !== '-') {
      g.contact = getTenantContact(l);
    }
    g.leases.push(l);
    if (isCurrentOccupancyLease(l.status)) {
      g.currentLeases.push(l);
    } else {
      g.previousLeases.push(l);
    }
  }

  // Within each tenant group, show Current units first, then Previous units (newest startDate first)
  const tenantGroups = Array.from(groupMap.values());
  for (const g of tenantGroups) {
    g.leases.sort((a, b) => {
      const aCurr = isCurrentOccupancyLease(a.status) ? 0 : 1;
      const bCurr = isCurrentOccupancyLease(b.status) ? 0 : 1;
      if (aCurr !== bCurr) return aCurr - bCurr;
      const da = a.startDate ? new Date(a.startDate).getTime() : 0;
      const db = b.startDate ? new Date(b.startDate).getTime() : 0;
      return db - da;
    });
  }

  const filterBadges: string[] = [];
  filterBadges.push(
    `Report Type: ${
      filters.reportType === 'summary'
        ? 'Tenant Unit & Lease Summary'
        : 'Tenant Unit & Lease History (Detail)'
    }`,
  );
  if (filters.occupancyFilter && filters.occupancyFilter !== 'all') {
    filterBadges.push(
      `Unit History: ${
        filters.occupancyFilter === 'current'
          ? 'Current Units Only'
          : 'Previous Owned / Past Units Only'
      }`,
    );
  }
  if (filters.currency) filterBadges.push(`Currency: ${filters.currency}`);
  if (filters.fromDate || filters.toDate) {
    filterBadges.push(
      `Date: ${filters.fromDate ? fmtDate(filters.fromDate) : 'Any'} ~ ${
        filters.toDate ? fmtDate(filters.toDate) : 'Any'
      }`,
    );
  }
  if (filters.floor) filterBadges.push(`Floor: ${filters.floor}`);
  if (filters.unit) filterBadges.push(`Unit: ${filters.unit}`);
  if (filters.tenant) filterBadges.push(`Tenant: ${filters.tenant}`);
  if (filters.status) {
    filterBadges.push(`Status: ${filters.status.replace(/_/g, ' ').toUpperCase()}`);
  }
  if (filters.sortByLabel) {
    filterBadges.push(
      `Sort: ${filters.sortByLabel} (${(filters.sortOrder || 'asc').toUpperCase()})`,
    );
  }

  const reportTitle =
    filters.reportType === 'summary'
      ? 'Tenant Unit & Lease Summary Report'
      : 'Tenant Unit & Lease History Report';

  const grandTotalsByCurrency: Record<
    string,
    { activeRent: number; totalRent: number }
  > = {};
  leases.forEach((l) => {
    const cur = l.currency || 'MMK';
    if (!grandTotalsByCurrency[cur]) {
      grandTotalsByCurrency[cur] = { activeRent: 0, totalRent: 0 };
    }
    const rent = Number(l.rentAmount) || 0;
    grandTotalsByCurrency[cur].totalRent += rent;
    if (isCurrentOccupancyLease(l.status)) {
      grandTotalsByCurrency[cur].activeRent += rent;
    }
  });

  const renderOccupancyBadge = (status?: string | null) => {
    if (isCurrentOccupancyLease(status)) {
      return `<span class="occ-badge occ-current">CURRENT UNIT</span>`;
    }
    if (isPreviousOccupancyLease(status)) {
      return `<span class="occ-badge occ-previous">PREVIOUS UNIT</span>`;
    }
    return `<span class="occ-badge occ-upcoming">DRAFT / PENDING</span>`;
  };

  const tableHtml =
    filters.reportType === 'summary'
      ? `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:38px;text-align:center;">No.</th>
            <th>Tenant Code</th>
            <th>Tenant Name</th>
            <th>Phone / Email</th>
            <th>Current Owned / Active Unit(s)</th>
            <th>Previous Owned / Past Unit(s)</th>
            <th>Latest Lease #</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th style="text-align:center;">Curr</th>
            <th style="text-align:right;">Current Rent</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${tenantGroups
            .map((g, idx) => {
              const latest = g.leases[0] || {};
              const currentUnitsText =
                g.currentLeases.length > 0
                  ? g.currentLeases
                      .map((l) => {
                        const fl = getFloorText(l);
                        const un = l.unit?.unitNumber || '-';
                        return `<strong>${escapeHtml(fl !== '-' ? `${fl} / ${un}` : un)}</strong> <span style="color:#64748b;font-size:10.5px;">(${escapeHtml(l.leaseNumber)})</span>`;
                      })
                      .join('<br/>')
                  : '<span style="color:#94a3b8;">—</span>';

              const previousUnitsText =
                g.previousLeases.length > 0
                  ? g.previousLeases
                      .map((l) => {
                        const fl = getFloorText(l);
                        const un = l.unit?.unitNumber || '-';
                        const st = (l.status || '').replace(/_/g, ' ').toUpperCase();
                        return `<strong>${escapeHtml(fl !== '-' ? `${fl} / ${un}` : un)}</strong> <span style="color:#64748b;font-size:10.5px;">(${escapeHtml(l.leaseNumber)} • ${escapeHtml(st)})</span>`;
                      })
                      .join('<br/>')
                  : '<span style="color:#94a3b8;">—</span>';

              const currentRentSum = g.currentLeases.reduce(
                (s, l) => s + (Number(l.rentAmount) || 0),
                0,
              );
              const curCode = latest.currency || 'MMK';

              return `
              <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="font-weight:700;">${escapeHtml(g.tenantCode)}</td>
                <td style="font-weight:600;">${escapeHtml(g.tenantName)}</td>
                <td>${escapeHtml(g.contact)}</td>
                <td>${currentUnitsText}</td>
                <td>${previousUnitsText}</td>
                <td style="font-weight:700;">${escapeHtml(latest.leaseNumber || '-')}</td>
                <td>${escapeHtml(fmtDate(latest.startDate))}</td>
                <td>${escapeHtml(fmtDate(latest.endDate))}</td>
                <td style="text-align:center;">${escapeHtml(curCode)}</td>
                <td style="text-align:right;font-weight:600;">${money(currentRentSum)}</td>
                <td style="text-transform:uppercase;font-size:10.5px;font-weight:700;">${escapeHtml((latest.status || '').replace(/_/g, ' '))}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
        <tfoot>
          ${Object.entries(grandTotalsByCurrency)
            .map(
              ([cur, t]) => `
            <tr class="summary-row">
              <td colspan="10" style="text-align:right;font-weight:700;">Grand Total Active Monthly Rent — ${tenantGroups.length.toLocaleString()} Tenants / ${leases.length.toLocaleString()} Leases (${escapeHtml(cur)})</td>
              <td style="text-align:right;font-weight:700;">${money(t.activeRent)}</td>
              <td></td>
            </tr>`,
            )
            .join('')}
        </tfoot>
      </table>`
      : `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:38px;text-align:center;">No.</th>
            <th style="width:128px;">Unit History</th>
            <th>Floor</th>
            <th>Unit / Room</th>
            <th>Lease #</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th>Billing Cycle</th>
            <th style="text-align:center;">Curr</th>
            <th style="text-align:right;">Rent Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${tenantGroups
            .map((g, gIdx) => {
              const groupHeader = `
              <tr class="tenant-group-row">
                <td colspan="11">
                  <div class="tenant-group-bar">
                    <div class="tenant-group-main">
                      <span class="tenant-group-idx">${gIdx + 1}.</span>
                      <span class="tenant-group-code">${escapeHtml(g.tenantCode)}</span>
                      <span class="tenant-group-sep">—</span>
                      <span class="tenant-group-name">${escapeHtml(g.tenantName)}</span>
                      ${
                        g.contact !== '-'
                          ? `<span class="tenant-group-contact">(${escapeHtml(g.contact)})</span>`
                          : ''
                      }
                    </div>
                    <div class="tenant-group-stats">
                      <span class="tg-chip tg-chip-curr">Current Units: ${g.currentLeases.length}</span>
                      <span class="tg-chip tg-chip-prev">Previous Owned Units: ${g.previousLeases.length}</span>
                      <span class="tg-chip">Total Leases: ${g.leases.length}</span>
                    </div>
                  </div>
                </td>
              </tr>`;

              const rows = g.leases
                .map((l, lIdx) => {
                  const rent = Number(l.rentAmount) || 0;
                  const cycle = (l.billingCycle || 'monthly').replace(/_/g, ' ');
                  return `
              <tr>
                <td style="text-align:center;">${lIdx + 1}</td>
                <td>${renderOccupancyBadge(l.status)}</td>
                <td>${escapeHtml(getFloorText(l))}</td>
                <td style="font-weight:700;">${escapeHtml(l.unit?.unitNumber || '-')}</td>
                <td style="font-weight:700;">${escapeHtml(l.leaseNumber)}</td>
                <td>${escapeHtml(fmtDate(l.startDate))}</td>
                <td>${escapeHtml(fmtDate(l.endDate))}</td>
                <td style="text-transform:capitalize;">${escapeHtml(cycle)}</td>
                <td style="text-align:center;">${escapeHtml(l.currency || 'MMK')}</td>
                <td style="text-align:right;font-weight:600;">${money(rent)}</td>
                <td style="text-transform:uppercase;font-size:10.5px;font-weight:700;">${escapeHtml((l.status || '').replace(/_/g, ' '))}</td>
              </tr>`;
                })
                .join('');

              return groupHeader + rows;
            })
            .join('')}
        </tbody>
        <tfoot>
          ${Object.entries(grandTotalsByCurrency)
            .map(
              ([cur, t]) => `
            <tr class="summary-row">
              <td colspan="9" style="text-align:right;font-weight:700;">Grand Total Rent — ${tenantGroups.length.toLocaleString()} Tenants / ${leases.length.toLocaleString()} Leases (${escapeHtml(cur)}) [Active Rent: ${money(t.activeRent)}]</td>
              <td style="text-align:right;font-weight:700;">${money(t.totalRent)}</td>
              <td></td>
            </tr>`,
            )
            .join('')}
        </tfoot>
      </table>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #525659;
      font-family: 'Inter', 'Noto Sans Myanmar', Arial, sans-serif;
      font-size: 12px;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 24px;
      background: #1e293b;
      color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .preview-toolbar-title {
      font-size: 13px;
      font-weight: 700;
      color: #e2e8f0;
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
    }
    .preview-btn-print { background: #10b981; color: #fff; }
    .preview-btn-print:hover { background: #059669; }
    .preview-btn-close {
      background: rgba(255,255,255,0.12);
      color: #f1f5f9;
      border-color: rgba(255,255,255,0.2);
    }
    .preview-container {
      padding: 24px 16px;
      display: flex;
      justify-content: center;
    }
    .report-sheet {
      background: #fff;
      width: 297mm;
      min-height: 210mm;
      padding: 14mm 16mm;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
      border-radius: 2px;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .report-title { font-size: 20px; line-height: 24px; font-weight: 800; color: #0f172a; }
    .report-subtitle { font-size: 13px; line-height: 16px; font-weight: 600; color: #475569; margin-top: 4px; }
    .report-meta { text-align: right; font-size: 11px; color: #475569; line-height: 1.5; }
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .filter-chip {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #334155;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    .report-table th,
    .report-table td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      vertical-align: middle;
    }
    .report-table thead th {
      background: #059669;
      color: #ffffff;
      font-weight: 700;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .report-table tbody tr:nth-child(even):not(.tenant-group-row) { background: #f8fafc; }
    .tenant-group-row td {
      background: #ecfdf5 !important;
      border-top: 2px solid #059669;
      border-bottom: 1px solid #a7f3d0;
      padding: 7px 10px;
    }
    .tenant-group-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    .tenant-group-main {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #064e3b;
    }
    .tenant-group-idx { font-weight: 800; color: #059669; }
    .tenant-group-code { font-weight: 800; }
    .tenant-group-sep { color: #64748b; }
    .tenant-group-name { font-weight: 700; color: #0f172a; }
    .tenant-group-contact { font-size: 11px; color: #475569; font-weight: 500; margin-left: 4px; }
    .tenant-group-stats {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tg-chip {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10.5px;
      font-weight: 700;
      background: #e2e8f0;
      color: #334155;
    }
    .tg-chip-curr { background: #d1fae5; color: #065f46; }
    .tg-chip-prev { background: #fef3c7; color: #92400e; }
    .occ-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .occ-current { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .occ-previous { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .occ-upcoming { background: #e0f2fe; color: #075985; border: 1px solid #bae6fd; }
    .summary-row td {
      background: #f1f5f9;
      border-top: 2px solid #0f172a;
      font-size: 11px;
    }
    @page { size: A4 landscape; margin: 10mm 12mm; }
    @media print {
      body { background: #fff !important; }
      .no-print { display: none !important; }
      .preview-container { padding: 0 !important; display: block !important; }
      .report-sheet {
        width: 100% !important;
        min-height: auto !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="preview-toolbar no-print">
    <div class="preview-toolbar-title">
      ${escapeHtml(reportTitle)} — ${tenantGroups.length.toLocaleString()} Tenant${tenantGroups.length !== 1 ? 's' : ''} / ${leases.length.toLocaleString()} Lease${leases.length !== 1 ? 's' : ''}
    </div>
    <div class="preview-toolbar-actions">
      <button class="preview-btn preview-btn-print" onclick="window.print()">
        Print / Save as PDF
      </button>
      <button class="preview-btn preview-btn-close" onclick="window.close()">
        Close
      </button>
    </div>
  </div>
  <div class="preview-container">
    <div class="report-sheet">
      <div class="report-header">
        <div>
          <div class="report-title">${escapeHtml(reportTitle)}</div>
          <div class="report-subtitle">${escapeHtml(firstProp?.name || 'All Properties')}</div>
        </div>
        <div class="report-meta">
          <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
          <div><strong>Total Tenants / Leases:</strong> ${tenantGroups.length.toLocaleString()} Tenants / ${leases.length.toLocaleString()} Leases</div>
        </div>
      </div>
      <div class="filter-bar">
        ${filterBadges.map((b) => `<span class="filter-chip">${escapeHtml(b)}</span>`).join('')}
      </div>
      ${tableHtml}
    </div>
  </div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. UNIT OCCUPANCY & LEASE HISTORY REPORT (Summary & Detail Grouped by Unit)
// ═══════════════════════════════════════════════════════════════════════════

export type UnitReportType = 'detail' | 'summary' | 'availability';

export interface UnitReportEntry {
  id: string;
  unitNumber: string;
  floor: string;
  areaSqft?: number | null;
  unitStatus: string;
  shopName?: string | null;
  propertyName?: string | null;
  baseRent?: number | null;
  currency?: string | null;
  leases: Array<LeaseDetail | any>;
}

export interface UnitAvailabilityInfo {
  state: 'available_now' | 'ends_today' | 'expiring' | 'expired' | 'unavailable';
  daysLeft: number | null;
  label: string;
  activeLease: any | null;
}

/**
 * Calculates Days Left to Available for a unit based on its current Active Lease endDate minus Today.
 * If the unit is available with no active lease, returns 'Available Now' (0 days).
 */
export function computeUnitAvailability(u: UnitReportEntry): UnitAvailabilityInfo {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const activeLease =
    u.leases.find((l) => (l.status || '').toLowerCase() === 'active') ||
    u.leases.find((l) => isCurrentOccupancyLease(l.status)) ||
    null;

  const statusLow = (u.unitStatus || 'available').toLowerCase();

  if (activeLease && activeLease.endDate) {
    const rawEnd = String(activeLease.endDate).slice(0, 10);
    const [y, m, d] = rawEnd.split('-').map(Number);
    const endStart =
      y && m && d
        ? new Date(y, m - 1, d).getTime()
        : new Date(activeLease.endDate).setHours(0, 0, 0, 0);
    const diffDays = Math.round((endStart - todayStart) / 86_400_000);

    if (diffDays > 0) {
      return {
        state: 'expiring',
        daysLeft: diffDays,
        label: `${diffDays} Day${diffDays === 1 ? '' : 's'} Left`,
        activeLease,
      };
    }
    if (diffDays === 0) {
      return {
        state: 'ends_today',
        daysLeft: 0,
        label: 'Ends Today (0 Days)',
        activeLease,
      };
    }
    return {
      state: 'expired',
      daysLeft: diffDays,
      label: `Expired (${Math.abs(diffDays)}d ago)`,
      activeLease,
    };
  }

  if (statusLow === 'available') {
    return {
      state: 'available_now',
      daysLeft: 0,
      label: 'Available Now',
      activeLease: null,
    };
  }

  return {
    state: 'unavailable',
    daysLeft: null,
    label: statusLow.replace(/_/g, ' ').toUpperCase(),
    activeLease,
  };
}

export interface UnitReportFilterLabels {
  reportType: UnitReportType;
  availabilityFilterLabel?: string;
  unitStatus?: string;
  leaseStatus?: string;
  fromDate?: string;
  toDate?: string;
  floor?: string;
  unit?: string;
  shopName?: string;
  tenant?: string;
  currency?: string;
  sortByLabel?: string;
  sortOrder?: 'asc' | 'desc';
}

export function openUnitReportPreview(
  units: UnitReportEntry[],
  filters: UnitReportFilterLabels,
): boolean {
  if (!units || units.length === 0) return false;

  const win = window.open('', '_blank');
  if (!win) return false;

  const firstPropName =
    units.find((u) => u.propertyName)?.propertyName ||
    units.flatMap((u) => u.leases).find((l) => l?.property?.name)?.property
      ?.name ||
    'All Properties';
  const generatedAt = fmtDate(new Date());

  const getTenantLabel = (l: any): string => {
    const t = l?.tenant;
    if (!t) return '-';
    const code = (t.firstName || t.code || '').trim();
    const name = (t.lastName || t.companyName || t.displayName || '').trim();
    if (code && name && code !== name) return `${code} — ${name}`;
    return code || name || '-';
  };

  const getLeaseShopName = (l: any, unitShopName?: string | null): string => {
    const ls =
      l?.shopName ||
      l?.rentalAgreement?.shopName ||
      l?.unit?.shopProfile?.brandName ||
      unitShopName ||
      '';
    return String(ls).trim() || '-';
  };

  const totalLeasesCount = units.reduce((s, u) => s + u.leases.length, 0);
  const occupiedCount = units.filter(
    (u) => (u.unitStatus || '').toLowerCase() === 'occupied',
  ).length;
  const availableCount = units.filter(
    (u) => (u.unitStatus || '').toLowerCase() === 'available',
  ).length;

  const filterBadges: string[] = [];
  filterBadges.push(
    `Report Type: ${
      filters.reportType === 'summary'
        ? 'Unit Occupancy & Lease Summary'
        : filters.reportType === 'availability'
        ? 'Upcoming Available Units Report'
        : 'Unit Occupancy & Lease History (Detail)'
    }`,
  );
  if (filters.availabilityFilterLabel) {
    filterBadges.push(`Availability Window: ${filters.availabilityFilterLabel}`);
  }
  if (filters.unitStatus) {
    filterBadges.push(
      `Unit Status: ${filters.unitStatus.replace(/_/g, ' ').toUpperCase()}`,
    );
  }
  if (filters.leaseStatus) {
    filterBadges.push(
      `Lease Status: ${filters.leaseStatus.replace(/_/g, ' ').toUpperCase()}`,
    );
  }
  if (filters.currency) filterBadges.push(`Currency: ${filters.currency}`);
  if (filters.fromDate || filters.toDate) {
    filterBadges.push(
      `Date: ${filters.fromDate ? fmtDate(filters.fromDate) : 'Any'} ~ ${
        filters.toDate ? fmtDate(filters.toDate) : 'Any'
      }`,
    );
  }
  if (filters.floor) filterBadges.push(`Floor: ${filters.floor}`);
  if (filters.unit) filterBadges.push(`Unit: ${filters.unit}`);
  if (filters.shopName) filterBadges.push(`Shop Name: ${filters.shopName}`);
  if (filters.tenant) filterBadges.push(`Tenant: ${filters.tenant}`);
  if (filters.sortByLabel) {
    filterBadges.push(
      `Sort: ${filters.sortByLabel} (${(filters.sortOrder || 'asc').toUpperCase()})`,
    );
  }

  const reportTitle =
    filters.reportType === 'summary'
      ? 'Unit Occupancy & Lease Summary Report'
      : filters.reportType === 'availability'
      ? 'Upcoming Available Units Report'
      : 'Unit Occupancy & Lease History Report';

  const grandTotalsByCurrency: Record<
    string,
    { activeRent: number; totalRent: number }
  > = {};
  for (const u of units) {
    if (u.leases.length > 0) {
      for (const l of u.leases) {
        const cur = l.currency || u.currency || 'MMK';
        if (!grandTotalsByCurrency[cur]) {
          grandTotalsByCurrency[cur] = { activeRent: 0, totalRent: 0 };
        }
        const rent = Number(l.rentAmount) || 0;
        grandTotalsByCurrency[cur].totalRent += rent;
        if (isCurrentOccupancyLease(l.status)) {
          grandTotalsByCurrency[cur].activeRent += rent;
        }
      }
    } else {
      const cur = u.currency || 'MMK';
      if (!grandTotalsByCurrency[cur]) {
        grandTotalsByCurrency[cur] = { activeRent: 0, totalRent: 0 };
      }
    }
  }

  const renderLeaseHistoryBadge = (status?: string | null) => {
    if (isCurrentOccupancyLease(status)) {
      return `<span class="occ-badge occ-current">CURRENT LEASE</span>`;
    }
    if (isPreviousOccupancyLease(status)) {
      return `<span class="occ-badge occ-previous">PREVIOUS LEASE</span>`;
    }
    return `<span class="occ-badge occ-upcoming">DRAFT / PENDING</span>`;
  };

  const renderUnitStatusChip = (unitStatus?: string | null) => {
    const s = (unitStatus || 'available').toLowerCase();
    const label = s.replace(/_/g, ' ').toUpperCase();
    if (s === 'occupied') {
      return `<span class="tg-chip tg-chip-curr">UNIT: ${escapeHtml(label)}</span>`;
    }
    if (s === 'available') {
      return `<span class="tg-chip tg-chip-avail">UNIT: ${escapeHtml(label)}</span>`;
    }
    return `<span class="tg-chip tg-chip-prev">UNIT: ${escapeHtml(label)}</span>`;
  };

  const renderAvailabilityBadge = (avail: UnitAvailabilityInfo) => {
    if (avail.state === 'available_now') {
      return `<span class="occ-badge occ-current">${escapeHtml(avail.label)}</span>`;
    }
    if (avail.state === 'ends_today' || avail.state === 'expired') {
      return `<span class="occ-badge" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;">${escapeHtml(avail.label)}</span>`;
    }
    if (avail.state === 'expiring') {
      if ((avail.daysLeft ?? 999) <= 7) {
        return `<span class="occ-badge" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;">${escapeHtml(avail.label)}</span>`;
      }
      if ((avail.daysLeft ?? 999) <= 30) {
        return `<span class="occ-badge occ-previous">${escapeHtml(avail.label)}</span>`;
      }
      return `<span class="occ-badge occ-upcoming">${escapeHtml(avail.label)}</span>`;
    }
    return `<span class="occ-badge occ-vacant">${escapeHtml(avail.label)}</span>`;
  };

  const tableHtml =
    filters.reportType === 'availability'
      ? `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:38px;text-align:center;">No.</th>
            <th>Unit No</th>
            <th>Floor</th>
            <th style="text-align:right;">Area (Sqft)</th>
            <th>Shop Name</th>
            <th>Current Tenant</th>
            <th>Active Lease #</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th style="text-align:center;">Days Left to Available</th>
            <th style="text-align:center;">Curr</th>
            <th style="text-align:right;">Rent Amount</th>
            <th>Unit Status</th>
          </tr>
        </thead>
        <tbody>
          ${units
            .map((u, idx) => {
              const avail = computeUnitAvailability(u);
              const activeLease = avail.activeLease;
              const shop = activeLease
                ? getLeaseShopName(activeLease, u.shopName)
                : u.shopName || '-';
              const tenantObj = activeLease?.tenant;
              const tenantText = activeLease
                ? (tenantObj?.lastName || tenantObj?.companyName || tenantObj?.displayName || '').trim() || '—'
                : '—';
              const leaseNum = activeLease ? activeLease.leaseNumber : '—';
              const startText = activeLease
                ? fmtDate(activeLease.startDate)
                : '—';
              const endText = activeLease ? fmtDate(activeLease.endDate) : '—';
              const curCode =
                activeLease?.currency || u.currency || 'MMK';
              const rentVal = activeLease
                ? Number(activeLease.rentAmount) || 0
                : Number(u.baseRent) || 0;
              const unitStatusText = (u.unitStatus || 'available')
                .replace(/_/g, ' ')
                .toUpperCase();

              return `
              <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="font-weight:700;">${escapeHtml(u.unitNumber)}</td>
                <td>${escapeHtml(u.floor || '-')}</td>
                <td style="text-align:right;">${
                  u.areaSqft != null
                    ? escapeHtml(Number(u.areaSqft).toLocaleString())
                    : '-'
                }</td>
                <td style="font-weight:600;">${escapeHtml(shop)}</td>
                <td>${escapeHtml(tenantText)}</td>
                <td style="font-weight:700;">${escapeHtml(leaseNum)}</td>
                <td>${escapeHtml(startText)}</td>
                <td>${escapeHtml(endText)}</td>
                <td style="text-align:center;">${renderAvailabilityBadge(avail)}</td>
                <td style="text-align:center;">${escapeHtml(curCode)}</td>
                <td style="text-align:right;font-weight:600;">${money(rentVal)}</td>
                <td style="text-transform:uppercase;font-size:10.5px;font-weight:700;">${escapeHtml(unitStatusText)}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
        <tfoot>
          ${Object.entries(grandTotalsByCurrency)
            .map(
              ([cur, t]) => `
            <tr class="summary-row">
              <td colspan="11" style="text-align:right;font-weight:700;">Grand Total Active Rent — ${units.length.toLocaleString()} Units (${occupiedCount} Occupied / ${availableCount} Available) (${escapeHtml(cur)})</td>
              <td style="text-align:right;font-weight:700;">${money(t.activeRent)}</td>
              <td></td>
            </tr>`,
            )
            .join('')}
        </tfoot>
      </table>`
      : filters.reportType === 'summary'
      ? `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:38px;text-align:center;">No.</th>
            <th>Unit No</th>
            <th>Floor</th>
            <th style="text-align:right;">Area (Sqft)</th>
            <th>Shop Name</th>
            <th>Tenant</th>
            <th>Lease #</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th style="text-align:center;">Curr</th>
            <th style="text-align:right;">Rent Amount</th>
            <th>Unit Status</th>
            <th>Lease Status</th>
          </tr>
        </thead>
        <tbody>
          ${units
            .map((u, idx) => {
              const activeLease =
                u.leases.find((l) => isCurrentOccupancyLease(l.status)) ||
                u.leases[0] ||
                null;
              const shop = activeLease
                ? getLeaseShopName(activeLease, u.shopName)
                : u.shopName || '-';
              const tenantText = activeLease ? getTenantLabel(activeLease) : '—';
              const leaseNum = activeLease ? activeLease.leaseNumber : '—';
              const startText = activeLease
                ? fmtDate(activeLease.startDate)
                : '—';
              const endText = activeLease ? fmtDate(activeLease.endDate) : '—';
              const curCode =
                activeLease?.currency || u.currency || 'MMK';
              const rentVal = activeLease
                ? Number(activeLease.rentAmount) || 0
                : Number(u.baseRent) || 0;
              const unitStatusText = (u.unitStatus || 'available')
                .replace(/_/g, ' ')
                .toUpperCase();
              const leaseStatusText = activeLease
                ? (activeLease.status || '').replace(/_/g, ' ').toUpperCase()
                : 'NO LEASE';

              return `
              <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="font-weight:700;">${escapeHtml(u.unitNumber)}</td>
                <td>${escapeHtml(u.floor || '-')}</td>
                <td style="text-align:right;">${
                  u.areaSqft != null
                    ? escapeHtml(Number(u.areaSqft).toLocaleString())
                    : '-'
                }</td>
                <td style="font-weight:600;">${escapeHtml(shop)}</td>
                <td>${escapeHtml(tenantText)}</td>
                <td style="font-weight:700;">${escapeHtml(leaseNum)}</td>
                <td>${escapeHtml(startText)}</td>
                <td>${escapeHtml(endText)}</td>
                <td style="text-align:center;">${escapeHtml(curCode)}</td>
                <td style="text-align:right;font-weight:600;">${money(rentVal)}</td>
                <td style="text-transform:uppercase;font-size:10.5px;font-weight:700;">${escapeHtml(unitStatusText)}</td>
                <td style="text-transform:uppercase;font-size:10.5px;font-weight:700;color:${
                  activeLease ? '#0f172a' : '#94a3b8'
                };">${escapeHtml(leaseStatusText)}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
        <tfoot>
          ${Object.entries(grandTotalsByCurrency)
            .map(
              ([cur, t]) => `
            <tr class="summary-row">
              <td colspan="10" style="text-align:right;font-weight:700;">Grand Total Active Rent — ${units.length.toLocaleString()} Units (${occupiedCount} Occupied / ${availableCount} Available) (${escapeHtml(cur)})</td>
              <td style="text-align:right;font-weight:700;">${money(t.activeRent)}</td>
              <td colspan="2"></td>
            </tr>`,
            )
            .join('')}
        </tfoot>
      </table>`
      : `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:38px;text-align:center;">No.</th>
            <th style="width:128px;">Lease History</th>
            <th>Unit No</th>
            <th>Floor</th>
            <th>Shop Name</th>
            <th>Tenant</th>
            <th>Lease #</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th style="text-align:center;">Curr</th>
            <th style="text-align:right;">Rent Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${units
            .map((u, uIdx) => {
              const currentLeasesCount = u.leases.filter((l) =>
                isCurrentOccupancyLease(l.status),
              ).length;
              const pastLeasesCount = u.leases.length - currentLeasesCount;
              const unitShop =
                u.shopName ||
                (u.leases[0] ? getLeaseShopName(u.leases[0], null) : '-');

              const groupHeader = `
              <tr class="tenant-group-row">
                <td colspan="12">
                  <div class="tenant-group-bar">
                    <div class="tenant-group-main">
                      <span class="tenant-group-idx">${uIdx + 1}.</span>
                      <span class="tenant-group-code">Unit: ${escapeHtml(u.unitNumber)}</span>
                      <span class="tenant-group-sep">•</span>
                      <span class="tenant-group-name">Floor: ${escapeHtml(u.floor || '-')}</span>
                      ${
                        unitShop && unitShop !== '-'
                          ? `<span class="tenant-group-sep">•</span><span class="tenant-group-name">Shop: ${escapeHtml(unitShop)}</span>`
                          : ''
                      }
                      ${
                        u.areaSqft != null
                          ? `<span class="tenant-group-contact">(${escapeHtml(Number(u.areaSqft).toLocaleString())} sqft)</span>`
                          : ''
                      }
                    </div>
                    <div class="tenant-group-stats">
                      ${renderUnitStatusChip(u.unitStatus)}
                      <span class="tg-chip tg-chip-curr">Current Leases: ${currentLeasesCount}</span>
                      <span class="tg-chip tg-chip-prev">Previous Leases: ${pastLeasesCount}</span>
                      <span class="tg-chip">Total Leases: ${u.leases.length}</span>
                    </div>
                  </div>
                </td>
              </tr>`;

              if (u.leases.length === 0) {
                return (
                  groupHeader +
                  `
              <tr>
                <td style="text-align:center;color:#94a3b8;">—</td>
                <td><span class="occ-badge occ-vacant">VACANT / NO LEASE</span></td>
                <td style="font-weight:700;">${escapeHtml(u.unitNumber)}</td>
                <td>${escapeHtml(u.floor || '-')}</td>
                <td>${escapeHtml(u.shopName || '-')}</td>
                <td style="color:#94a3b8;">— (No Tenant)</td>
                <td style="color:#94a3b8;">—</td>
                <td style="color:#94a3b8;">—</td>
                <td style="color:#94a3b8;">—</td>
                <td style="text-align:center;">${escapeHtml(u.currency || 'MMK')}</td>
                <td style="text-align:right;color:#64748b;">${money(Number(u.baseRent) || 0)}</td>
                <td style="text-transform:uppercase;font-size:10.5px;font-weight:700;color:#64748b;">${escapeHtml((u.unitStatus || 'available').replace(/_/g, ' '))}</td>
              </tr>`
                );
              }

              const rows = u.leases
                .map((l, lIdx) => {
                  const rent = Number(l.rentAmount) || 0;
                  const shop = getLeaseShopName(l, u.shopName);
                  return `
              <tr>
                <td style="text-align:center;">${lIdx + 1}</td>
                <td>${renderLeaseHistoryBadge(l.status)}</td>
                <td style="font-weight:700;">${escapeHtml(u.unitNumber)}</td>
                <td>${escapeHtml(u.floor || '-')}</td>
                <td style="font-weight:600;">${escapeHtml(shop)}</td>
                <td>${escapeHtml(getTenantLabel(l))}</td>
                <td style="font-weight:700;">${escapeHtml(l.leaseNumber)}</td>
                <td>${escapeHtml(fmtDate(l.startDate))}</td>
                <td>${escapeHtml(fmtDate(l.endDate))}</td>
                <td style="text-align:center;">${escapeHtml(l.currency || u.currency || 'MMK')}</td>
                <td style="text-align:right;font-weight:600;">${money(rent)}</td>
                <td style="text-transform:uppercase;font-size:10.5px;font-weight:700;">${escapeHtml((l.status || '').replace(/_/g, ' '))}</td>
              </tr>`;
                })
                .join('');

              return groupHeader + rows;
            })
            .join('')}
        </tbody>
        <tfoot>
          ${Object.entries(grandTotalsByCurrency)
            .map(
              ([cur, t]) => `
            <tr class="summary-row">
              <td colspan="10" style="text-align:right;font-weight:700;">Grand Total Rent — ${units.length.toLocaleString()} Units / ${totalLeasesCount.toLocaleString()} Leases (${escapeHtml(cur)}) [Active Rent: ${money(t.activeRent)}]</td>
              <td style="text-align:right;font-weight:700;">${money(t.totalRent)}</td>
              <td></td>
            </tr>`,
            )
            .join('')}
        </tfoot>
      </table>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #525659;
      font-family: 'Inter', 'Noto Sans Myanmar', Arial, sans-serif;
      font-size: 12px;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 24px;
      background: #1e293b;
      color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .preview-toolbar-title {
      font-size: 13px;
      font-weight: 700;
      color: #e2e8f0;
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
    }
    .preview-btn-print { background: #10b981; color: #fff; }
    .preview-btn-print:hover { background: #059669; }
    .preview-btn-close {
      background: rgba(255,255,255,0.12);
      color: #f1f5f9;
      border-color: rgba(255,255,255,0.2);
    }
    .preview-container {
      padding: 24px 16px;
      display: flex;
      justify-content: center;
    }
    .report-sheet {
      background: #fff;
      width: 297mm;
      min-height: 210mm;
      padding: 14mm 16mm;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
      border-radius: 2px;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .report-title { font-size: 20px; line-height: 24px; font-weight: 800; color: #0f172a; }
    .report-subtitle { font-size: 13px; line-height: 16px; font-weight: 600; color: #475569; margin-top: 4px; }
    .report-meta { text-align: right; font-size: 11px; color: #475569; line-height: 1.5; }
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .filter-chip {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #334155;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    .report-table th,
    .report-table td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      vertical-align: middle;
    }
    .report-table thead th {
      background: #059669;
      color: #ffffff;
      font-weight: 700;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .report-table tbody tr:nth-child(even):not(.tenant-group-row) { background: #f8fafc; }
    .tenant-group-row td {
      background: #ecfdf5 !important;
      border-top: 2px solid #059669;
      border-bottom: 1px solid #a7f3d0;
      padding: 7px 10px;
    }
    .tenant-group-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    .tenant-group-main {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #064e3b;
    }
    .tenant-group-idx { font-weight: 800; color: #059669; }
    .tenant-group-code { font-weight: 800; }
    .tenant-group-sep { color: #64748b; }
    .tenant-group-name { font-weight: 700; color: #0f172a; }
    .tenant-group-contact { font-size: 11px; color: #475569; font-weight: 500; margin-left: 4px; }
    .tenant-group-stats {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tg-chip {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10.5px;
      font-weight: 700;
      background: #e2e8f0;
      color: #334155;
    }
    .tg-chip-curr { background: #d1fae5; color: #065f46; }
    .tg-chip-prev { background: #fef3c7; color: #92400e; }
    .tg-chip-avail { background: #e0f2fe; color: #075985; }
    .occ-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .occ-current { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .occ-previous { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .occ-upcoming { background: #e0f2fe; color: #075985; border: 1px solid #bae6fd; }
    .occ-vacant { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
    .summary-row td {
      background: #f1f5f9;
      border-top: 2px solid #0f172a;
      font-size: 11px;
    }
    @page { size: A4 landscape; margin: 10mm 12mm; }
    @media print {
      body { background: #fff !important; }
      .no-print { display: none !important; }
      .preview-container { padding: 0 !important; display: block !important; }
      .report-sheet {
        width: 100% !important;
        min-height: auto !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="preview-toolbar no-print">
    <div class="preview-toolbar-title">
      ${escapeHtml(reportTitle)} — ${units.length.toLocaleString()} Unit${units.length !== 1 ? 's' : ''} (${occupiedCount} Occupied / ${availableCount} Available) • ${totalLeasesCount.toLocaleString()} Lease${totalLeasesCount !== 1 ? 's' : ''}
    </div>
    <div class="preview-toolbar-actions">
      <button class="preview-btn preview-btn-print" onclick="window.print()">
        Print / Save as PDF
      </button>
      <button class="preview-btn preview-btn-close" onclick="window.close()">
        Close
      </button>
    </div>
  </div>
  <div class="preview-container">
    <div class="report-sheet">
      <div class="report-header">
        <div>
          <div class="report-title">${escapeHtml(reportTitle)}</div>
          <div class="report-subtitle">${escapeHtml(firstPropName)}</div>
        </div>
        <div class="report-meta">
          <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
          <div><strong>Total Units / Leases:</strong> ${units.length.toLocaleString()} Units (${occupiedCount} Occupied / ${availableCount} Available) • ${totalLeasesCount.toLocaleString()} Leases</div>
        </div>
      </div>
      <div class="filter-bar">
        ${filterBadges.map((b) => `<span class="filter-chip">${escapeHtml(b)}</span>`).join('')}
      </div>
      ${tableHtml}
    </div>
  </div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return true;
}



