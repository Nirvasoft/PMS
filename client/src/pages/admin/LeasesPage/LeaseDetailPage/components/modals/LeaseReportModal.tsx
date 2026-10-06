import { useRef } from 'react';
import { X, Printer } from 'lucide-react';
import type { LeaseDetail } from '../../../../../../store/api/leasesApi';
import { useGetUsersQuery } from '../../../../../../store/api/usersApi';
import { useGetLeadsQuery } from '../../../../../../store/api/crmApi';
import './LeaseReportModal.css';

interface LeaseReportModalProps {
  lease: LeaseDetail;
  onClose: () => void;
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

const fmtDate = (dStr?: string | null) => {
  if (!dStr) return '';
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return dStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

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

export function LeaseReportModal({ lease, onClose }: LeaseReportModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const { data: usersData } = useGetUsersQuery({ limit: '200' });
  const users = usersData?.data || [];
  const { data: leadsData } = useGetLeadsQuery({ limit: 100 });

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
  const contractDateFormatted = fmtDate(lease.rentalAgreement?.contractStartDate || lease.rentalAgreement?.renterDate || lease.createdAt);

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

  const unitNumber = lease.unit?.unitNumber || '';
  const floorLabel = lease.unit?.floorLabel || (lease.unit?.floorNumber != null ? `Floor ${lease.unit.floorNumber}` : '');
  const areaSqft = (lease.unit?.areaSqft != null && !isNaN(Number(lease.unit.areaSqft)) && Number(lease.unit.areaSqft) > 0)
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
      (ra.renterSignedName && u.fullName?.trim().toLowerCase() === ra.renterSignedName.trim().toLowerCase())
  );
  const leaserPosition = (ra as any)?.renterPosition || matchedUser?.jobTitle || 'Director';

  // Report Header specifically uses Company Name (lease.company.name) and Company Address
  const headerCompanyName = lease.company?.name || lease.company?.legalName || '';
  const headerCompanyAddress = companyAddressFormatted || ra.renterAddress || '';
  const companyPhone = lease.company?.phone
    ? (lease.company.phone.startsWith('Tel:') ? lease.company.phone : `Tel: ${lease.company.phone}`)
    : '';

  // Tenant Data (Lessee / ငှားရမ်းသူ)
  const tenantAddressFormatted = [
    lease.tenant?.addressLine1,
    lease.tenant?.addressLine2,
    lease.tenant?.city,
    lease.tenant?.state,
    lease.tenant?.postalCode,
    lease.tenant?.country,
  ].filter(Boolean).join(', ');

  const lesseeName = ra.companyName || lease.tenant?.displayName || lease.tenant?.companyName || [lease.tenant?.firstName, lease.tenant?.lastName].filter(Boolean).join(' ') || '';
  const lesseeAddress = ra.customerAddress || tenantAddressFormatted || '';
  const lesseeSignedName = ra.customerSignedName || lease.tenant?.contactPersonName || lease.tenant?.displayName || '';
  const lesseeNirc = ra.customerNirc || (lease.tenant as any)?.idNumber || '';

  const matchedLead = leadsData?.data?.find(
    (l) =>
      l.convertedLease?.id === lease.id ||
      (l as any).convertedLeaseId === lease.id ||
      (l as any).convertedTenantId === lease.tenant?.id
  );

  const pipelineLeadShopName = (matchedLead as any)?.loiDetails?.shopName || matchedLead?.companyName;
  const shopName = (lease.rentalAgreement as any)?.shopName || (lease as any).shopName || pipelineLeadShopName || '-';

  // Page 3 Clauses (9 to 17)
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

  const handlePrint = () => {
    const node = printRef.current;
    if (!node) return;
    const win = window.open('', '_blank', 'width=950,height=800');
    if (!win) return;

    // Dynamically inherit all compiled styles from document, avoiding 250+ lines of duplicate CSS
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n');

    win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Lease Agreement Report - ${lease.leaseNumber}</title>
  ${styles}
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm 12mm 15mm;
    }
    body {
      background: #fff !important;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-page {
      box-shadow: none !important;
      margin: 0 !important;
      width: 100% !important;
      min-height: 270mm !important;
      page-break-after: always;
      break-after: page;
    }
    .report-page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
  </style>
</head>
<body>
  ${node.innerHTML}
</body>
</html>`);

    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 350);
  };

  // Reusable Company Header Component
  const renderHeader = () => (
    <div className="report-company-header">
      <div className="report-company-name">{headerCompanyName}</div>
      <div className="report-company-address">
        {headerCompanyAddress ? <div>{headerCompanyAddress}</div> : null}
        {companyPhone ? <div>{companyPhone}</div> : null}
      </div>
      <hr className="report-header-line" />
    </div>
  );

  return (
    <div className="lease-report-overlay" onClick={onClose}>
      <div className="lease-report-box" onClick={(e) => e.stopPropagation()}>
        <div className="lease-report-header">
          <h3>Lease Agreement Report — {lease.leaseNumber}</h3>
          <div className="lease-report-header-actions">
            <button className="btn-primary" onClick={handlePrint}>
              <Printer size={15} style={{ marginRight: 6 }} /> Print / Save PDF
            </button>
            <button className="btn-ghost" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="lease-report-body">
          <div className="lease-report-printable" ref={printRef}>
            {/* ══════════════════════════════════════════════════════════════
                PAGE 1: PARTIES & PREMISES DETAILS
                ══════════════════════════════════════════════════════════════ */}
            <div className="report-page">
              <div>
                {renderHeader()}

                <div className="report-doc-title">
                  ဆိုင်ခန်းငှားရမ်းခြင်းကတိစာချုပ်
                </div>

                <div className="report-preamble">
                  ဤ ဆိုင်ခန်းငှားရမ်းခြင်းကတိစာချုပ်ကို
                  {lessorAddress ? (
                    <>
                      <br />
                      {lessorAddress}
                    </>
                  ) : null}
                  <br />( {contractDateFormatted} ) ရက်နေ့တွင် အောက်ပါအမည်ပါသူတို့က
                </div>

                <div className="report-parties-grid">
                  {/* Lessor */}
                  <div className="report-party-block">
                    <div className="report-party-label">အငှားချထားသူ</div>
                    <div className="report-party-content">
                      <div className="report-party-name">{lessorName}</div>
                      <div className="report-sub-details">
                        (ကုမ္ပဏီ၏ ကိုယ်စားလှယ်စာရသူ {leaserName}
                        <br />
                        မှတ်ပုံတင်အမှတ် <strong>{lessorNirc}</strong> မှလက်မှတ်ရေးထိုးပါသည်။)
                      </div>
                      <div className="report-sub-details">ရာထူး {leaserPosition}</div>
                      {lessorAddress ? (
                        <div className="report-sub-details">{lessorAddress}</div>
                      ) : null}
                    </div>
                  </div>

                  {/* Lessee */}
                  <div className="report-party-block">
                    <div className="report-party-label">ငှားရမ်းသူ</div>
                    <div className="report-party-content">
                      <div className="report-party-name">{lesseeName}</div>
                      {lesseeNirc ? <div className="report-sub-details">{lesseeNirc}</div> : null}
                      {lesseeAddress ? <div className="report-sub-details">{lesseeAddress}</div> : null}
                    </div>
                  </div>
                </div>

                <div className="report-center-section">
                  <div className="report-property-name">{propertyName}</div>
                  <div className="report-property-sub">
                    အငှားချထားသည့် ဆိုင်ခန်းနေရာ
                  </div>
                </div>

                <div className="report-details-grid">
                  <div className="report-field-label">ဆိုင်ခန်းအမှတ်</div>
                  <div className="report-field-value">{unitNumber}</div>

                  <div className="report-field-label">အထပ်/အကျယ်အဝန်း</div>
                  <div className="report-field-value">
                    <span>{floorLabel}</span>
                    {areaSqft ? (
                      <span style={{ marginLeft: 30 }}>/ {areaSqft}</span>
                    ) : null}
                  </div>

                  <div className="report-field-label">ငှားရမ်းခနှုန်း</div>
                  <div className="report-field-value report-calc-row">
                    <span className="report-rent-val">{rentFormatted}</span>
                    <span className="report-rent-cycle">
                      / Month x {months > 0 ? months : ''}
                    </span>
                    <span className="report-rent-total">
                      = {totalRentFormatted}
                    </span>
                  </div>

                  <div className="report-field-label">ငှားရမ်းကာလ</div>
                  <div className="report-field-value report-calc-row">
                    <span className="report-term-months">
                      {months ? `${months} ` : ''}Months
                    </span>
                    <span className="report-term-dates">
                      {contractStartDateFormatted} ~ {contractEndDateFormatted}
                    </span>
                  </div>

                  <div className="report-field-label">ဆိုင်အမည်</div>
                  <div className="report-field-value">{shopName}</div>
                </div>
              </div>

              <div>
                <div className="report-bottom-clause">  
                  (အထက်အမည်ပါအငှားချထားသူနှင့် ငှားရမ်းသူဟုဆိုရာတွင်
                  ၎င်းတို့ကိုယ်တိုင်အပြင်၊ ၎င်းတို့၏ တရားဝင်ကိုယ်စားလှယ်စာရသူ၊
                  အမွေခံစားအမွေခံများ၊ ကုမ္ပဏီမှ
                  ကိုယ်စားလှယ်လွှဲပြောင်းခံရသူများ အားလုံးပါဝင်သည်ဟု
                  မှတ်ယူရမည်။)
                </div>
                <div className="report-page-footer">Page 1 of 3</div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                PAGE 2: CLAUSES 1 TO 8
                ══════════════════════════════════════════════════════════════ */}
            <div className="report-page">
              <div>
                {renderHeader()}

                <div className="report-clauses-body">
                  <div className="report-clause-item">
                    <span className="report-clause-num">၁။</span>
                    <span className="report-clause-text">
                      အထက်ဖော်ပြပါအငှားချထားသည့် {lessorName} သည်{' '}
                      {propertyAddress ? `${propertyAddress}ရှိ ` : ''}
                      {propertyName ? `${propertyName} တွင် ` : ''}
                      ဖွင့်လှစ်ထားပြီး ဆိုင်ခန်းများ အငှားချုပ်ထားသော
                      ကုမ္ပဏီကြီးတစ်ခု ဖြစ်ပါသည်။
                    </span>
                  </div>

                  <div className="report-clause-item">
                    <span className="report-clause-num">၂။</span>
                    <span className="report-clause-text">
                      ငှားရမ်းသူသည်ဥပစာကို တစ်လလျှင်( {rentFormatted} )
                      နှုန်းဖြင့် ယခုစာချုပ် ချုပ်ဆိုသည့်နေ့မှ( {months} ) လအထိ
                      ငှားရမ်းမည်ဖြစ်ပါသည်။ ( {months} ) လအတွက်
                      ကြိုတင်ပေးငွေပေါင်း {totalRentFormatted} (ကျပ်{' '}
                      {rentBurmeseWords} တိတိ) ဖြစ်ပြီး
                      ငှားရမ်းစတင်သည့်နေ့မှစ၍ငွေအကျေပေးရမည်ဖြစ်ပါသည်။
                    </span>
                  </div>

                  <div className="report-clause-item">
                    <span className="report-clause-num">၃။</span>
                    <span className="report-clause-text">
                      အငှားချထားသည့်သက်တမ်းကာလ( {months} )လပြည့်တိုင်း
                      သက်တမ်းမကုန်ဆုံးမီ (၂) လအလိုတွင်
                      ဆိုင်ငှားမှဆက်လက်ငှားရမ်းလိုပါက ကုမ္ပဏီသို့စာဖြင့်
                      ထပ်မံငှားရမ်းခွင့် လျှောက်ထားရယူရမည်ဖြစ်ပါသည်။
                      ယင်းသို့လျှောက်ထားခြင်းမရှိပါက
                      ဆက်လက်ငှားရမ်းလိုခြင်းမရှိဟု ယူဆမည်ဖြစ်ပြီး
                      အငှားချထားခြင်းကို ရပ်စဲမည်ဖြစ်ပါသည်။
                    </span>
                  </div>

                  <div className="report-clause-item">
                    <span className="report-clause-num">၄။</span>
                    <span className="report-clause-text">
                      ထပ်မံငှားရမ်းခွင့်လျှောက်လွှာစာအရ
                      ကုမ္ပဏီဖက်မှဆက်လက်ငှားရမ်းမည်ဆိုပါက အကြောင်းကြားစာ
                      ပြန်လည်ပေးပို့မည်ဖြစ်ပြီးအကြောင်းကြားစာပါ
                      သတ်မှတ်ချက်အတိုင်း စာချုပ်ချုပ်ဆိုရပါမည်။
                    </span>
                  </div>

                  <div className="report-clause-item">
                    <span className="report-clause-num">၅။</span>
                    <div className="report-clause-text">
                      အငှားချထားသည့်
                      သက်တမ်းကာလအတွင်းစီမံခန့်ခွဲအုပ်ချုပ်မှုကော်မတီကို
                      ဆိုင်ခန်းပိုင်ရှင်ကဖွဲ့စည်းပေးထားပြီးဖြစ်၍
                      ငှားရမ်းသူအနေဖြင့်သီးခြားဖွဲ့စည်းခွင့်မရှိပါ။ဆိုင်ခန်းငှားရမ်းသူသည်စီမံခန့်ခွဲအုပ်ချုပ်မှုကော်မတီက
                      အခါအားလျော်စွာချမှတ်သည့်စည်းကမ်းချက်များကို
                      လိုက်နာရမည့်အပြင် အောက်ဖော်ြပပါစည်းကမ်းချက်များကို
                      လိုက်နာရမည်။
                      <div className="report-sub-clauses">
                        {SUB_CLAUSES_5.map((sc) => (
                          <div key={sc.num}>
                            <strong>{sc.num}</strong> {sc.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="report-page-footer">Page 2 of 3</div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                PAGE 3: CLAUSES 9 TO 17 & SIGNATURES
                ══════════════════════════════════════════════════════════════ */}
            <div className="report-page">
              <div>
                {renderHeader()}

                <div className="report-clauses-body">
                  {clausesPage3.map((cl) => (
                    <div key={cl.num} className="report-clause-item">
                      <span className="report-clause-num">{cl.num}</span>
                      <span className="report-clause-text">{cl.text}</span>
                    </div>
                  ))}

                  <div className="report-closing-statement">
                    ဤဆိုင်ခန်း ငှားရမ်းခြင်း ကတိစာချုပ်အား သေချာ
                    ဖတ်ရှု့နားလည်သဘောပေါက်ပြီး အောက်အမည်ပါအသိသက်သေများရှေ့တွင်
                    လက်မှတ်ရေးထိုးစာချုပ်ချုပ်ဆိုကြခြင်းဖြစ်ပါသည်။
                  </div>
                </div>

                <div className="report-signatures-row">
                  {/* Lessor Signature */}
                  <div className="report-sig-column">
                    <div className="report-sig-label">အငှားချထားသူ</div>
                    <div className="report-sig-name">{leaserName}</div>
                    <div>{leaserPosition.toUpperCase()}</div>
                    <div>{lessorName}</div>
                  </div>

                  {/* Lessee Signature */}
                  <div className="report-sig-column">
                    <div className="report-sig-label">ငှားရမ်းသူ</div>
                    <div className="report-sig-name">{lesseeSignedName || lesseeName}</div>
                    <div className="report-sig-line" />
                    <div>{lesseeNirc}</div>
                    <div className="report-sig-line" />
                  </div>
                </div>

                {/* Witnesses */}
                <div className="report-witnesses-section">
                  <div className="report-witnesses-title">အသိသက်သေများ</div>
                  <div className="report-witnesses-grid">
                    {[1, 2].map((colIndex) => (
                      <div key={colIndex} className="report-witness-col">
                        {['အမည်', 'မှတ်ပုံတင်', 'နေရပ်'].map((label) => (
                          <div key={label} className="report-witness-row">
                            <span className="report-witness-label">{label}</span>
                            <div className="report-witness-line" />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="report-page-footer">Page 3 of 3</div>
            </div>
          </div>
        </div>

        <div className="lease-report-footer">
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" onClick={handlePrint}>
            <Printer size={15} style={{ marginRight: 6 }} /> Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
