import ExcelJS from 'exceljs';
async function main() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Meter Records');
  sheet.columns = [
    { header: 'Property', key: 'property' }, { header: 'Tenant', key: 'tenant' },
    { header: 'Meter No', key: 'meterNo' }, { header: 'P Unit', key: 'unitCode' },
    { header: 'Meter Type', key: 'meterType' }, { header: 'Category', key: 'category' },
    { header: 'Rate', key: 'rate' }, { header: 'Start Unit', key: 'startUnit' },
    { header: 'End Unit', key: 'endUnit' }, { header: 'Start Date', key: 'startDate' },
    { header: 'End Date', key: 'endDate' }, { header: 'Bill Date', key: 'billDate' },
  ];
  sheet.addRow({ property: 'M Tower', tenant: 'TenantC', meterNo: 'UI-TEST-1', unitCode: 'B1-002', meterType: 'Water Meter', category: 'Water', rate: 1000, startUnit: 550, endUnit: 750, startDate: '9/1/2026', endDate: '9/30/2026', billDate: '9/29/2026' });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  console.log(buffer.toString('base64'));
}
main();
