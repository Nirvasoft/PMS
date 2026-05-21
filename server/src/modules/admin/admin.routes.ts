import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware';
import { companyProvisioningService } from './companyProvisioning.service';
import { AppError } from '../../common/errors';

export const adminRouter = Router();

/**
 * Guard: require 'companies.provision' permission.
 */
function requireProvisionPermission(req: Request, _res: Response, next: Function) {
  if (!req.user?.permissions?.includes('companies.provision')) {
    throw AppError.forbidden('You do not have permission to provision companies');
  }
  next();
}

// ─── Company Provisioning ──────────────────────

/**
 * POST /api/v1/admin/companies/provision
 * Create a new company with all defaults bootstrapped.
 */
adminRouter.post(
  '/companies/provision',
  requireProvisionPermission,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, legalName, companyType, country, currency, timezone, email, phone, adminEmail, adminFirstName, adminLastName } = req.body;

    // Basic validation
    if (!name || !country || !currency || !timezone || !adminEmail || !adminFirstName || !adminLastName) {
      throw AppError.validation('Missing required fields: name, country, currency, timezone, adminEmail, adminFirstName, adminLastName');
    }

    const result = await companyProvisioningService.provision({
      name, legalName, companyType, country, currency, timezone, email, phone,
      adminEmail, adminFirstName, adminLastName,
    });

    res.status(201).json({ success: true, data: result });
  }),
);

/**
 * GET /api/v1/admin/companies
 * List all companies (system admin overview).
 */
adminRouter.get(
  '/companies',
  requireProvisionPermission,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await companyProvisioningService.listCompanies();
    res.json({ success: true, data });
  }),
);

/**
 * POST /api/v1/admin/companies/:id/deactivate
 */
adminRouter.post(
  '/companies/:id/deactivate',
  requireProvisionPermission,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await companyProvisioningService.deactivateCompany(req.params.id);
    res.json({ success: true, data });
  }),
);

/**
 * POST /api/v1/admin/companies/:id/activate
 */
adminRouter.post(
  '/companies/:id/activate',
  requireProvisionPermission,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await companyProvisioningService.activateCompany(req.params.id);
    res.json({ success: true, data });
  }),
);
