import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware';
import { bmsService, BMS_DEVICE_TYPES, BMS_PROTOCOLS } from './bms.service';

export const bmsRouter = Router();

// GET /bms/summary — Dashboard summary
bmsRouter.get('/summary', asyncHandler(async (req: Request, res: Response) => {
  const data = await bmsService.getSummary(req.user!.companyId);
  res.json({ success: true, data });
}));

// GET /bms/meta — Device types and protocols for forms
bmsRouter.get('/meta', asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      deviceTypes: BMS_DEVICE_TYPES,
      protocols: BMS_PROTOCOLS,
    },
  });
}));

// GET /bms/devices — List devices
bmsRouter.get('/devices', asyncHandler(async (req: Request, res: Response) => {
  const data = await bmsService.listDevices(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    deviceType: req.query.deviceType as string,
    isActive: req.query.isActive as string,
  });
  res.json({ success: true, data });
}));

// GET /bms/devices/:id — Single device detail
bmsRouter.get('/devices/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await bmsService.getDevice(req.params.id as string, req.user!.companyId);
  res.json({ success: true, data });
}));

// POST /bms/devices — Create device
bmsRouter.post('/devices', asyncHandler(async (req: Request, res: Response) => {
  const data = await bmsService.createDevice(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

// PUT /bms/devices/:id — Update device
bmsRouter.put('/devices/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await bmsService.updateDevice(req.params.id as string, req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

// DELETE /bms/devices/:id — Delete device
bmsRouter.delete('/devices/:id', asyncHandler(async (req: Request, res: Response) => {
  await bmsService.deleteDevice(req.params.id as string, req.user!.companyId);
  res.status(204).send();
}));

// GET /bms/devices/:id/readings — Time-series readings
bmsRouter.get('/devices/:id/readings', asyncHandler(async (req: Request, res: Response) => {
  const data = await bmsService.getReadings(req.params.id as string, req.user!.companyId, {
    pointName: req.query.pointName as string,
    from: req.query.from as string,
    to: req.query.to as string,
    limit: req.query.limit as string,
  });
  res.json({ success: true, data });
}));

// GET /bms/devices/:id/faults — Fault history
bmsRouter.get('/devices/:id/faults', asyncHandler(async (req: Request, res: Response) => {
  const data = await bmsService.getFaults(req.params.id as string, req.user!.companyId);
  res.json({ success: true, data });
}));

// POST /bms/devices/:id/poll — Manual poll
bmsRouter.post('/devices/:id/poll', asyncHandler(async (req: Request, res: Response) => {
  const data = await bmsService.pollDevice(req.params.id as string, req.user!.companyId);
  res.json({ success: true, data });
}));
