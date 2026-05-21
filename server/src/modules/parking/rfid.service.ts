import { prisma } from '../../common/database';

export class RfidService {
  async findAll(propertyId: string, query: { page?: number; limit?: number }) {
    const { page = 1, limit = 50 } = query;
    const [data, total] = await Promise.all([
      prisma.rfidAccessEvent.findMany({
        where: { propertyId },
        include: {
          vehicle: {
            select: { plateNumber: true, make: true, model: true },
          },
        },
        orderBy: { eventAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.rfidAccessEvent.count({ where: { propertyId } }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async processEvent(propertyId: string, dto: Record<string, unknown>) {
    const { rfidTagNo, eventType, gateId, eventAt } = dto as {
      rfidTagNo: string;
      eventType: 'entry' | 'exit';
      gateId?: string;
      eventAt?: string;
    };

    const eventTime = eventAt ? new Date(eventAt) : new Date();

    // 1. Look up vehicle by RFID tag
    const vehicle = await prisma.tenantVehicle.findFirst({
      where: {
        rfidTagNo,
        isActive: true,
      },
    });

    if (!vehicle) {
      return this.logEvent({
        propertyId,
        rfidTagNo,
        eventType,
        gateId,
        eventAt: eventTime,
        isAuthorized: false,
        denialReason: 'vehicle_not_found',
      });
    }

    // 2. Check active allocation for vehicle's tenant at this property
    const today = new Date();
    const activeAllocation = await prisma.parkingAllocation.findFirst({
      where: {
        propertyId,
        tenantId: vehicle.tenantId,
        status: 'active',
        startDate: { lte: today },
        OR: [
          { endDate: null },
          { endDate: { gte: today } }
        ]
      },
      include: { slot: true }
    });

    if (!activeAllocation) {
      return this.logEvent({
        propertyId,
        rfidTagNo,
        vehicleId: vehicle.id,
        eventType,
        gateId,
        eventAt: eventTime,
        isAuthorized: false,
        denialReason: 'no_active_allocation',
      });
    }

    // 3. Authorized Entry/Exit
    const event = await this.logEvent({
      propertyId,
      rfidTagNo,
      vehicleId: vehicle.id,
      eventType,
      gateId,
      eventAt: eventTime,
      isAuthorized: true,
      denialReason: null,
    });

    return event;
  }

  private async logEvent(data: {
    propertyId: string;
    rfidTagNo: string;
    vehicleId?: string;
    eventType: 'entry' | 'exit';
    gateId?: string;
    eventAt: Date;
    isAuthorized: boolean;
    denialReason?: string | null;
  }) {
    const event = await prisma.rfidAccessEvent.create({
      data: {
        propertyId: data.propertyId,
        rfidTagNo: data.rfidTagNo,
        vehicleId: data.vehicleId || null,
        eventType: data.eventType,
        gateId: data.gateId || null,
        eventAt: data.eventAt,
        isAuthorized: data.isAuthorized,
        denialReason: data.denialReason || null,
      },
    });

    return {
      success: true,
      data: {
        authorized: data.isAuthorized,
        denialReason: data.denialReason || null,
        event,
      },
    };
  }
}

export const rfidService = new RfidService();
