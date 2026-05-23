import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { bookingService } from './booking.service';
import {
  createBookingSchema, cancelBookingSchema,
  updateBookingRulesSchema, addBlackoutDateSchema,
} from './booking.schema';

const p = (req: Request, key: string) => req.params[key] as string;

// ═══════════════════════════════════════════════
// FACILITY BOOKING ROUTER — /api/v1/facilities
// ═══════════════════════════════════════════════
export const facilitiesRouter = Router();

/** GET /facilities/:id/availability */
facilitiesRouter.get('/:id/availability', asyncHandler(async (req, res) => {
  const data = await bookingService.checkAvailability(
    req.user!.companyId, p(req, 'id'), req.query.date as string,
  );
  res.json({ success: true, data });
}));

/** POST /facilities/:id/blackout-dates */
facilitiesRouter.post('/:id/blackout-dates', validateRequest(addBlackoutDateSchema), asyncHandler(async (req, res) => {
  const data = await bookingService.addBlackoutDate(
    req.user!.companyId, req.user!.sub, p(req, 'id'), req.body,
  );
  res.status(201).json({ success: true, data });
}));

// ═══════════════════════════════════════════════
// BOOKING RULES ROUTER — /api/v1/facility-booking-rules
// ═══════════════════════════════════════════════
export const bookingRulesRouter = Router();

/** GET /facility-booking-rules/:facilityId */
bookingRulesRouter.get('/:facilityId', asyncHandler(async (req, res) => {
  const data = await bookingService.getBookingRules(req.user!.companyId, p(req, 'facilityId'));
  res.json({ success: true, data });
}));

/** PUT /facility-booking-rules/:facilityId */
bookingRulesRouter.put('/:facilityId', validateRequest(updateBookingRulesSchema), asyncHandler(async (req, res) => {
  const data = await bookingService.updateBookingRules(
    req.user!.companyId, p(req, 'facilityId'), req.body,
  );
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════════════
// PORTAL BOOKINGS — registered on portalRouter
// ═══════════════════════════════════════════════
export const portalBookingsRouter = Router();

/** GET /portal/bookings/facilities — Get bookable facilities */
portalBookingsRouter.get('/facilities', asyncHandler(async (req, res) => {
  const data = await bookingService.getPropertyFacilities(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /portal/bookings — Create booking */
portalBookingsRouter.post('/', validateRequest(createBookingSchema), asyncHandler(async (req, res) => {
  const data = await bookingService.createBooking(req.user!.companyId, req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}));

/** GET /portal/bookings — My bookings */
portalBookingsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await bookingService.getMyBookings(req.user!.companyId, req.user!.sub, {
    upcoming: req.query.upcoming === 'true',
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 50),
  });
  res.json({ success: true, ...data });
}));

/** POST /portal/bookings/:id/cancel */
portalBookingsRouter.post('/:id/cancel', validateRequest(cancelBookingSchema), asyncHandler(async (req, res) => {
  const data = await bookingService.cancelBooking(
    req.user!.companyId, req.user!.sub, p(req, 'id'), req.body.reason,
  );
  res.json({ success: true, data });
}));
