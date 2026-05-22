import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { validateRequest } from '../../middleware/validateRequest';
import { createInventoryService } from './inventory.service';
import {
  createStoreSchema, createItemSchema, updateItemSchema,
  receiveStockSchema, issueStockSchema, transferStockSchema, adjustStockSchema,
} from './inventory.schema';

export function inventoryRoutes(prisma: PrismaClient) {
  const svc = createInventoryService({ prisma });

  // ── Stores ──────────────────────────
  const storesRouter = Router();
  storesRouter.get('/', async (req, res, next) => {
    try {
      const data = await svc.listStores(req.user!.companyId, req.query.propertyId as string);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });
  storesRouter.post('/', validateRequest(createStoreSchema), async (req, res, next) => {
    try {
      const data = await svc.createStore(req.user!.companyId, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  });

  // ── Items ───────────────────────────
  const itemsRouter = Router();
  itemsRouter.get('/', async (req, res, next) => {
    try {
      const result = await svc.listItems(req.user!.companyId, {
        search: req.query.search, category: req.query.category,
        lowStock: req.query.lowStock,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
      });
      res.json({ success: true, ...result });
    } catch (e) { next(e); }
  });
  itemsRouter.get('/:id', async (req, res, next) => {
    try {
      const data = await svc.getItemById(req.user!.companyId, req.params.id as string);
      if (!data) return res.status(404).json({ success: false, error: 'Item not found' });
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });
  itemsRouter.post('/', validateRequest(createItemSchema), async (req, res, next) => {
    try {
      const data = await svc.createItem(req.user!.companyId, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  });
  itemsRouter.put('/:id', validateRequest(updateItemSchema), async (req, res, next) => {
    try {
      const data = await svc.updateItem(req.user!.companyId, req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });

  // ── Stock Levels ────────────────────
  const stockRouter = Router();
  stockRouter.get('/', async (req, res, next) => {
    try {
      const data = await svc.getStockLevels(req.user!.companyId, {
        storeId: req.query.storeId, itemId: req.query.itemId, lowStock: req.query.lowStock,
      });
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });

  // ── Movements ───────────────────────
  const movementsRouter = Router();
  movementsRouter.get('/', async (req, res, next) => {
    try {
      const result = await svc.listMovements(req.user!.companyId, {
        itemId: req.query.itemId, storeId: req.query.storeId,
        movementType: req.query.movementType,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      });
      res.json({ success: true, ...result });
    } catch (e) { next(e); }
  });
  movementsRouter.post('/receive', validateRequest(receiveStockSchema), async (req, res, next) => {
    try {
      const data = await svc.receiveStock(req.user!.companyId, req.user!.sub, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  });
  movementsRouter.post('/issue', validateRequest(issueStockSchema), async (req, res, next) => {
    try {
      const data = await svc.issueStock(req.user!.companyId, req.user!.sub, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  });
  movementsRouter.post('/transfer', validateRequest(transferStockSchema), async (req, res, next) => {
    try {
      const data = await svc.transferStock(req.user!.companyId, req.user!.sub, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  });
  movementsRouter.post('/adjust', validateRequest(adjustStockSchema), async (req, res, next) => {
    try {
      const data = await svc.adjustStock(req.user!.companyId, req.user!.sub, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  });

  // ── Stats ───────────────────────────
  const statsRouter = Router();
  statsRouter.get('/', async (req, res, next) => {
    try {
      const data = await svc.getStats(req.user!.companyId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });

  return { storesRouter, itemsRouter, stockRouter, movementsRouter, statsRouter };
}
