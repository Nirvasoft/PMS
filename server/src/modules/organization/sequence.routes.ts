import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware';
import { sequenceService, type Prefix2Format, type PrefixMode } from '../../common/sequence.service';

export const sequenceRouter = Router();

/**
 * GET /api/v1/sequences
 * List configurable document sequences for a location ('all' or property UUID) and module
 */
sequenceRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.companyId;
  const locationId = (req.query.locationId as string) || 'all';
  const moduleFilter = req.query.module as string | undefined;

  const sequences = await sequenceService.listSequences(companyId, locationId, moduleFilter);
  res.json({ success: true, data: sequences });
}));

/**
 * POST /api/v1/sequences/bulk-save
 * Save all configured prefix rows for a location
 */
sequenceRouter.post('/bulk-save', asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.companyId;
  const { locationId = 'all', items } = req.body;

  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, message: 'Items array is required' });
  }

  const validItems = items.map((item: any) => ({
    typeKey: String(item.typeKey || '').trim(),
    prefix1: String(item.prefix1 || '').trim().toUpperCase(),
    prefix2: (item.prefix2 as Prefix2Format) || 'none',
    padLength: Number(item.padLength) || 6,
    mode: item.mode ? ((item.mode === 'auto' ? 'auto' : 'manual') as PrefixMode) : undefined,
  })).filter((item: any) => item.typeKey);

  const updated = await sequenceService.bulkSave(companyId, locationId, validItems);
  res.json({ success: true, data: updated });
}));

/**
 * DELETE /api/v1/sequences/:typeKey
 * Remove a custom sequence configuration for a location
 */
sequenceRouter.delete('/:typeKey', asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.companyId;
  const typeKey = req.params.typeKey as string;
  const locationId = (req.query.locationId as string) || 'all';

  const deleted = await sequenceService.deleteSequence(companyId, locationId, typeKey);
  res.json({ success: true, data: { deleted } });
}));

/**
 * POST /api/v1/sequences/:key/reset
 * Reset the sequence counter to a given value (default: 0)
 */
sequenceRouter.post('/:key/reset', asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.companyId;
  const key = req.params.key as string;
  const locationId = (req.body.locationId || req.query.locationId as string) || 'all';
  const value = req.body.value !== undefined ? Number(req.body.value) : 0;

  await sequenceService.reset(companyId, key, value, locationId);
  res.json({ success: true, message: `Sequence ${key} counter reset to ${value}` });
}));
