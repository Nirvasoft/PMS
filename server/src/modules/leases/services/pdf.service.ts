import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';

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

    // Prepare data for template
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

    const uploadsDir = path.join(process.cwd(), 'uploads', 'leases');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `${lease.leaseNumber}_${Date.now()}.pdf`;
    const filePath = path.join(uploadsDir, fileName);
    const fileUrl = `/uploads/leases/${fileName}`; // Assuming a static express route for /uploads

    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'load' });
      
      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      });

      await browser.close();
      
      // Save document URL to DB
      await prisma.lease.update({
        where: { id: leaseId },
        data: { leaseDocumentUrl: fileUrl },
      });

      logger.info(`Lease PDF generated at ${filePath}`);
      return fileUrl;
    } catch (error) {
      logger.error('Failed to generate PDF', { error });
      throw new AppError(500, 'PDF_ERROR', 'Failed to generate lease PDF document');
    }
  }
}

export const pdfService = new PdfService();
