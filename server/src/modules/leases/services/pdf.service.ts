import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';

// Ensure uploads directory exists once at module load (avoids blocking existsSync on every request)
const uploadsDir = path.join(process.cwd(), 'uploads', 'leases');
fs.mkdirSync(uploadsDir, { recursive: true });

export class PdfService {
  private templateCache: HandlebarsTemplateDelegate | null = null;

  private getTemplate(): HandlebarsTemplateDelegate {
    if (!this.templateCache) {
      const templatePath = path.join(__dirname, '../templates/lease.hbs');
      const templateStr = fs.readFileSync(templatePath, 'utf-8');
      this.templateCache = Handlebars.compile(templateStr);
    }
    return this.templateCache;
  }

  async generateLeasePdf(leaseId: string, companyId: string): Promise<string> {
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, companyId },
      include: {
        company: true,
        tenant: true,
        property: true,
        unit: true,
      },
    });

    if (!lease) throw AppError.notFound('Lease');

    const templateData = {
      leaseNumber: lease.leaseNumber,
      generatedDate: new Date().toLocaleDateString(),
      company: { name: lease.company.name },
      tenant: {
        displayName: lease.tenant.tenantType === 'company'
          ? lease.tenant.companyName
          : `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim(),
      },
      property: { name: lease.property.name },
      unit: { unitNumber: lease.unit.unitNumber, unitType: lease.unit.unitType },
      startDate: lease.startDate.toLocaleDateString(),
      endDate: lease.endDate.toLocaleDateString(),
      leaseTermMonths: lease.leaseTermMonths,
      currency: lease.currency,
      rentAmount: Number(lease.rentAmount).toFixed(2),
      billingCycle: lease.billingCycle,
      securityDeposit: Number(lease.securityDeposit).toFixed(2),
      specialConditions: lease.specialConditions,
      clauses: lease.clauses as Array<{ title: string; content: string }>,
    };

    const template = this.getTemplate();
    const htmlContent = template(templateData);

    const fileName = `${lease.leaseNumber}_${Date.now()}.pdf`;
    const filePath = path.join(uploadsDir, fileName);
    const fileUrl = `/uploads/leases/${fileName}`;

    // Launch browser outside try so finally can always close it
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      // networkidle0 ensures fonts/images are fully rendered before printing
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      });
    } finally {
      // Always close — prevents Chrome process leaks on error
      await browser.close();
    }

    // Save document URL to DB (outside try/finally — if this fails the PDF exists on disk)
    await prisma.lease.update({
      where: { id: leaseId },
      data: { leaseDocumentUrl: fileUrl },
    });

    logger.info(`Lease PDF generated at ${filePath}`);
    return fileUrl;
  }
}

export const pdfService = new PdfService();
