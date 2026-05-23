import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

class BookingService {
  /**
   * Check time-slot availability for a facility on a given date.
   */
  async checkAvailability(companyId: string, facilityId: string, date: string) {
    const facility = await prisma.propertyFacility.findFirst({
      where: { id: facilityId },
    });
    if (!facility) throw AppError.notFound('Facility');

    const rules = await prisma.facilityBookingRule.findUnique({
      where: { facilityId },
    });

    // Default rules if none configured
    const slotDuration = rules?.minDurationMinutes ?? 30;
    const buffer = rules?.bufferMinutes ?? 15;

    // Parse operating hours for this day
    const dayIndex = new Date(date).getDay();
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayNames[dayIndex];
    const operatingHours = (facility.operatingHours as any)?.[dayKey] as string | undefined;

    if (!operatingHours) {
      return { facilityId, facilityName: facility.name, date, operatingHours: null, slots: [] };
    }

    const [openStr, closeStr] = operatingHours.split('-');
    const openMin = this.timeToMinutes(openStr);
    const closeMin = this.timeToMinutes(closeStr);

    // Get existing bookings
    const existingBookings = await prisma.facilityBooking.findMany({
      where: {
        facilityId,
        bookingDate: new Date(date),
        status: { notIn: ['cancelled'] },
      },
      orderBy: { startTime: 'asc' },
    });

    // Get blackout dates
    const blackouts = await prisma.bookingBlackoutDate.findMany({
      where: {
        companyId,
        blackoutDate: new Date(date),
        OR: [
          { facilityId },
          { facilityId: null }, // property-wide
        ],
      },
    });

    // Generate slots
    const slots: { startTime: string; endTime: string; available: boolean }[] = [];
    let cursor = openMin;

    while (cursor + slotDuration <= closeMin) {
      const slotEnd = cursor + slotDuration;
      const startTime = this.minutesToTime(cursor);
      const endTime = this.minutesToTime(slotEnd);

      const hasConflict = existingBookings.some(b => {
        const bStart = this.timeToMinutes(b.startTime);
        const bEnd = this.timeToMinutes(b.endTime) + buffer;
        return cursor < bEnd && slotEnd > bStart;
      });

      const isBlackedOut = blackouts.some(bl => {
        if (!bl.fromTime) return true; // all day
        return cursor < this.timeToMinutes(bl.toTime!) && slotEnd > this.timeToMinutes(bl.fromTime);
      });

      slots.push({ startTime, endTime, available: !hasConflict && !isBlackedOut });
      cursor += slotDuration;
    }

    return {
      facilityId,
      facilityName: facility.name,
      date,
      operatingHours,
      rules: rules ? {
        minDuration: rules.minDurationMinutes,
        maxDuration: rules.maxDurationMinutes,
        isPaid: rules.isPaid,
        hourlyRate: rules.hourlyRate,
        flatRate: rules.flatRate,
        currency: rules.currency,
      } : null,
      slots,
    };
  }

  /**
   * Create a facility booking.
   */
  async createBooking(companyId: string, userId: string, data: {
    facilityId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    paxCount?: number;
    purpose?: string;
  }) {
    const resident = await this.getActiveResident(companyId, userId);

    const facility = await prisma.propertyFacility.findFirst({
      where: { id: data.facilityId, propertyId: resident.propertyId },
    });
    if (!facility) throw AppError.notFound('Facility not found at your property');
    if (!facility.isBookable) throw AppError.validation('This facility is not bookable');

    const rules = await prisma.facilityBookingRule.findUnique({
      where: { facilityId: data.facilityId },
    });

    const durationMinutes = this.timeToMinutes(data.endTime) - this.timeToMinutes(data.startTime);
    if (durationMinutes <= 0) throw AppError.validation('End time must be after start time');

    // Validate rules
    if (rules) {
      if (durationMinutes < rules.minDurationMinutes) {
        throw AppError.validation(`Minimum booking duration is ${rules.minDurationMinutes} minutes`);
      }
      if (durationMinutes > rules.maxDurationMinutes) {
        throw AppError.validation(`Maximum booking duration is ${rules.maxDurationMinutes} minutes`);
      }

      // Check max bookings per day
      if (rules.maxBookingsPerDay) {
        const todayCount = await prisma.facilityBooking.count({
          where: {
            residentId: resident.id,
            facilityId: data.facilityId,
            bookingDate: new Date(data.bookingDate),
            status: { notIn: ['cancelled'] },
          },
        });
        if (todayCount >= rules.maxBookingsPerDay) {
          throw AppError.validation(`Maximum ${rules.maxBookingsPerDay} bookings per day`);
        }
      }
    }

    // Check slot conflict
    const buffer = rules?.bufferMinutes ?? 15;
    const conflicts = await prisma.facilityBooking.findMany({
      where: {
        facilityId: data.facilityId,
        bookingDate: new Date(data.bookingDate),
        status: { notIn: ['cancelled'] },
      },
    });

    const hasConflict = conflicts.some(b => {
      const bStart = this.timeToMinutes(b.startTime);
      const bEnd = this.timeToMinutes(b.endTime) + buffer;
      const newStart = this.timeToMinutes(data.startTime);
      const newEnd = this.timeToMinutes(data.endTime);
      return newStart < bEnd && newEnd > bStart;
    });

    if (hasConflict) {
      throw AppError.validation('This time slot is no longer available');
    }

    // Calculate charge
    const isPaid = rules?.isPaid ?? false;
    let chargeAmount = 0;
    if (isPaid) {
      chargeAmount = rules?.flatRate
        ? Number(rules.flatRate)
        : (durationMinutes / 60) * Number(rules?.hourlyRate ?? 0);
    }

    const bookingDate = new Date(data.bookingDate);
    const startAt = new Date(`${data.bookingDate}T${data.startTime}:00`);
    const endAt = new Date(`${data.bookingDate}T${data.endTime}:00`);

    const booking = await prisma.facilityBooking.create({
      data: {
        companyId,
        propertyId: resident.propertyId,
        facilityId: data.facilityId,
        unitId: resident.unitId,
        residentId: resident.id,
        bookingDate,
        startTime: data.startTime,
        endTime: data.endTime,
        startAt,
        endAt,
        durationMinutes,
        paxCount: data.paxCount || 1,
        purpose: data.purpose,
        status: rules?.requiresApproval ? 'pending' : 'confirmed',
        isPaidBooking: isPaid,
        chargeAmount: isPaid ? chargeAmount : null,
        currency: rules?.currency || null,
        requiresApproval: rules?.requiresApproval ?? false,
      },
      include: {
        facility: { select: { name: true } },
      },
    });

    return booking;
  }

  /**
   * Get bookings for portal user.
   */
  async getMyBookings(companyId: string, userId: string, filters: {
    upcoming?: boolean; page?: number; limit?: number;
  }) {
    const resident = await this.getActiveResident(companyId, userId);
    const { page = 1, limit = 20 } = filters;

    const where: any = {
      companyId,
      residentId: resident.id,
    };

    if (filters.upcoming) {
      where.bookingDate = { gte: new Date() };
      where.status = { notIn: ['cancelled', 'completed'] };
    }

    const [data, total] = await Promise.all([
      prisma.facilityBooking.findMany({
        where,
        include: {
          facility: { select: { name: true } },
        },
        orderBy: { bookingDate: filters.upcoming ? 'asc' : 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.facilityBooking.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  /**
   * Cancel a booking.
   */
  async cancelBooking(companyId: string, userId: string, bookingId: string, reason: string) {
    const resident = await this.getActiveResident(companyId, userId);

    const booking = await prisma.facilityBooking.findFirst({
      where: {
        id: bookingId,
        companyId,
        residentId: resident.id,
        status: { in: ['pending', 'confirmed'] },
      },
    });

    if (!booking) throw AppError.notFound('Booking');

    return prisma.facilityBooking.update({
      where: { id: bookingId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });
  }

  /**
   * Get bookable facilities for the portal user's property.
   */
  async getPropertyFacilities(companyId: string, userId: string) {
    const resident = await this.getActiveResident(companyId, userId);

    return prisma.propertyFacility.findMany({
      where: {
        propertyId: resident.propertyId,
        isBookable: true,
        isActive: true,
      },
      include: {
        facilityType: { select: { name: true, icon: true, category: true } },
        bookingRule: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get/update booking rules (admin).
   */
  async getBookingRules(companyId: string, facilityId: string) {
    return prisma.facilityBookingRule.findUnique({
      where: { facilityId },
    });
  }

  async updateBookingRules(companyId: string, facilityId: string, data: any) {
    const facility = await prisma.propertyFacility.findFirst({
      where: { id: facilityId },
    });
    if (!facility) throw AppError.notFound('Facility');

    return prisma.facilityBookingRule.upsert({
      where: { facilityId },
      update: data,
      create: {
        facilityId,
        propertyId: facility.propertyId,
        companyId,
        ...data,
      },
    });
  }

  /**
   * Add blackout date.
   */
  async addBlackoutDate(companyId: string, userId: string, facilityId: string, data: {
    blackoutDate: string; fromTime?: string; toTime?: string; reason?: string;
  }) {
    const facility = await prisma.propertyFacility.findFirst({
      where: { id: facilityId },
    });
    if (!facility) throw AppError.notFound('Facility');

    return prisma.bookingBlackoutDate.create({
      data: {
        facilityId,
        propertyId: facility.propertyId,
        companyId,
        blackoutDate: new Date(data.blackoutDate),
        fromTime: data.fromTime,
        toTime: data.toTime,
        reason: data.reason,
        createdBy: userId,
      },
    });
  }

  // ── Helpers ──────────────────────────────────

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private async getActiveResident(companyId: string, userId: string) {
    const resident = await prisma.resident.findFirst({
      where: { companyId, userId, isActive: true },
    });
    if (!resident) throw AppError.notFound('No active residence found for this user');
    return resident;
  }
}

export const bookingService = new BookingService();
