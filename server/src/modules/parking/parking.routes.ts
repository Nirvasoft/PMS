import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { zonesService } from './zones.service';
import { slotsService } from './slots.service';
import { allocationsService } from './allocations.service';
import { vehiclesService } from './vehicles.service';
import { visitorPassesService } from './visitor-passes.service';
import { unitsService } from '../units/units.service';
import {
  createZoneSchema, updateZoneSchema,
  createSlotSchema, bulkCreateSlotsSchema, updateSlotSchema,
  createAllocationSchema, updateAllocationSchema,
  createVehicleSchema, updateVehicleSchema,
  createVisitorPassSchema,
  rfidEventSchema,
} from './parking.schema';
import { rfidService } from './rfid.service';

const p = (req: Request, key: string) => req.params[key] as string;

// ════════════════════════════════════════════════
// PARKING TYPES — /api/v1/properties/:propertyId/parking/types
// ════════════════════════════════════════════════
export const parkingTypesRouter = Router({ mergeParams: true });

/** Parking-category Unit Types (Car Park / Bike Park / EV Bay) in use on this property, for the "Parking" dropdown. */
parkingTypesRouter.get('/', asyncHandler(async (req, res) => {
  const data = await unitsService.getParkingTypes(p(req, 'propertyId'));
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// ZONES — /api/v1/properties/:propertyId/parking/zones
// ════════════════════════════════════════════════
export const parkingZonesRouter = Router({ mergeParams: true });

parkingZonesRouter.get('/', asyncHandler(async (req, res) => {
  const data = await zonesService.findAll(p(req, 'propertyId'), req.user!.companyId, {
    unitId: req.query.unitId as string,
  });
  res.json({ success: true, data });
}));

parkingZonesRouter.post('/', validateRequest(createZoneSchema), asyncHandler(async (req, res) => {
  const data = await zonesService.create(p(req, 'propertyId'), req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

parkingZonesRouter.put('/:id', validateRequest(updateZoneSchema), asyncHandler(async (req, res) => {
  const data = await zonesService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

parkingZonesRouter.delete('/:id', asyncHandler(async (req, res) => {
  await zonesService.delete(p(req, 'id'), req.user!.companyId);
  res.status(204).send();
}));

// ════════════════════════════════════════════════
// SLOTS — /api/v1/properties/:propertyId/parking/slots
// ════════════════════════════════════════════════
export const parkingSlotsRouter = Router({ mergeParams: true });

parkingSlotsRouter.get('/', asyncHandler(async (req, res) => {
  const result = await slotsService.findAll(p(req, 'propertyId'), req.user!.companyId, {
    unitId:   req.query.unitId as string,
    unitType: req.query.unitType as string,
    zoneId:   req.query.zoneId as string,
    status:   req.query.status as string,
    slotType: req.query.slotType as string,
    page:     parseInt(req.query.page as string) || 1,
    limit:    Math.min(parseInt(req.query.limit as string) || 50, 200),
  });
  res.json({ success: true, ...result });
}));

parkingSlotsRouter.get('/occupancy', asyncHandler(async (req, res) => {
  const data = await slotsService.getOccupancy(p(req, 'propertyId'), req.user!.companyId, {
    unitId: req.query.unitId as string,
  });
  res.json({ success: true, data });
}));

parkingSlotsRouter.post('/', validateRequest(createSlotSchema), asyncHandler(async (req, res) => {
  const data = await slotsService.create(p(req, 'propertyId'), req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

parkingSlotsRouter.post('/bulk', validateRequest(bulkCreateSlotsSchema), asyncHandler(async (req, res) => {
  const data = await slotsService.bulkCreate(p(req, 'propertyId'), req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

parkingSlotsRouter.put('/:id', validateRequest(updateSlotSchema), asyncHandler(async (req, res) => {
  const data = await slotsService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

parkingSlotsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await slotsService.delete(p(req, 'id'), req.user!.companyId);
  res.status(204).send();
}));

// ════════════════════════════════════════════════
// ALLOCATIONS — /api/v1/parking/allocations
// ════════════════════════════════════════════════
export const parkingAllocationsRouter = Router();

parkingAllocationsRouter.get('/', asyncHandler(async (req, res) => {
  const result = await allocationsService.findAll(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    tenantId:   req.query.tenantId as string,
    status:     req.query.status as string,
    page:       parseInt(req.query.page as string) || 1,
    limit:      Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

parkingAllocationsRouter.post('/', validateRequest(createAllocationSchema), asyncHandler(async (req, res) => {
  // propertyId from the slot lookup
  const slot = await (await import('../../common/database')).prisma.parkingSlot.findUnique({ where: { id: req.body.slotId } });
  if (!slot) { res.status(404).json({ success: false, errors: [{ code: 'NOT_FOUND', message: 'Slot not found' }] }); return; }

  const data = await allocationsService.create(req.user!.companyId, slot.propertyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

parkingAllocationsRouter.put('/:id', validateRequest(updateAllocationSchema), asyncHandler(async (req, res) => {
  const data = await allocationsService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

parkingAllocationsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await allocationsService.cancel(p(req, 'id'), req.user!.companyId);
  res.status(204).send();
}));

// ════════════════════════════════════════════════
// TENANT VEHICLES — /api/v1/tenants/:tenantId/vehicles
// ════════════════════════════════════════════════
export const tenantVehiclesRouter = Router({ mergeParams: true });

tenantVehiclesRouter.get('/', asyncHandler(async (req, res) => {
  const data = await vehiclesService.findByTenant(p(req, 'tenantId'), req.user!.companyId);
  res.json({ success: true, data });
}));

tenantVehiclesRouter.post('/', validateRequest(createVehicleSchema), asyncHandler(async (req, res) => {
  const data = await vehiclesService.create(p(req, 'tenantId'), req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

tenantVehiclesRouter.put('/:id', validateRequest(updateVehicleSchema), asyncHandler(async (req, res) => {
  const data = await vehiclesService.update(p(req, 'id'), p(req, 'tenantId'), req.body);
  res.json({ success: true, data });
}));

tenantVehiclesRouter.delete('/:id', asyncHandler(async (req, res) => {
  await vehiclesService.deactivate(p(req, 'id'), p(req, 'tenantId'));
  res.status(204).send();
}));

// ════════════════════════════════════════════════
// VISITOR PASSES — /api/v1/parking/visitor-passes
// ════════════════════════════════════════════════
export const visitorPassesRouter = Router();

visitorPassesRouter.get('/', asyncHandler(async (req, res) => {
  const result = await visitorPassesService.findAll(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    status:     req.query.status as string,
    page:       parseInt(req.query.page as string) || 1,
    limit:      Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

visitorPassesRouter.post('/', validateRequest(createVisitorPassSchema), asyncHandler(async (req, res) => {
  // Derive propertyId from query or first property
  const propertyId = req.query.propertyId as string || req.body.propertyId;
  if (!propertyId) { res.status(400).json({ success: false, errors: [{ code: 'MISSING_PROPERTY', message: 'propertyId is required' }] }); return; }

  const data = await visitorPassesService.issue(propertyId, req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

visitorPassesRouter.post('/:token/scan', asyncHandler(async (req, res) => {
  const data = await visitorPassesService.scan(p(req, 'token'));
  res.json({ success: true, data });
}));

visitorPassesRouter.delete('/:id', asyncHandler(async (req, res) => {
  await visitorPassesService.cancel(p(req, 'id'), req.user!.companyId);
  res.status(204).send();
}));

// ════════════════════════════════════════════════
// RFID EVENTS — /api/v1/properties/:propertyId/parking/rfid/events
// ════════════════════════════════════════════════
export const parkingRfidRouter = Router({ mergeParams: true });

parkingRfidRouter.get('/', asyncHandler(async (req, res) => {
  const result = await rfidService.findAll(p(req, 'propertyId'), {
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 50, 200),
  });
  res.json({ success: true, ...result });
}));

parkingRfidRouter.post('/', validateRequest(rfidEventSchema), asyncHandler(async (req, res) => {
  // This is often called by an internal gateway, but we still validate it.
  const data = await rfidService.processEvent(p(req, 'propertyId'), req.body);
  res.status(data.data.authorized ? 200 : 403).json(data);
}));

