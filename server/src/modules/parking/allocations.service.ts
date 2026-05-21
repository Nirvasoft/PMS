import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class AllocationsService {
  async findAll(companyId: string, query: {
    propertyId?: string; tenantId?: string; status?: string; page?: number; limit?: number;
  }) {
    const { propertyId, tenantId, status, page = 1, limit = 20 } = query;
    const where: Record<string, unknown> = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (tenantId)   where.tenantId = tenantId;
    if (status)     where.status = status;

    const [data, total] = await Promise.all([
      prisma.parkingAllocation.findMany({
        where,
        include: {
          slot:    { select: { id: true, slotNumber: true, slotType: true, zone: { select: { id: true, name: true } } } },
          tenant:  { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
          unit:    { select: { id: true, unitNumber: true } },
          vehicle: { select: { id: true, plateNumber: true, make: true, model: true, color: true } },
          property: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.parkingAllocation.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(companyId: string, propertyId: string, dto: Record<string, unknown>, userId: string) {
    const { slotId, tenantId, unitId, leaseId, startDate, endDate, monthlyRate, billingDay, vehicleId, notes } = dto as any;

    // Validate slot is available
    const slot = await prisma.parkingSlot.findFirst({ where: { id: slotId, propertyId, companyId } });
    if (!slot) throw AppError.notFound('Parking Slot');
    if (slot.status !== 'available') throw new AppError(409, 'SLOT_NOT_AVAILABLE', `Slot '${slot.slotNumber}' is currently ${slot.status}`);

    // Check for overlapping allocation
    const overlap = await prisma.parkingAllocation.findFirst({
      where: {
        slotId,
        status: 'active',
        startDate: { lte: endDate ? new Date(endDate) : new Date('2099-12-31') },
        OR: [
          { endDate: null },
          { endDate: { gte: new Date(startDate) } },
        ],
      },
    });
    if (overlap) throw new AppError(409, 'ALLOCATION_OVERLAP', 'Slot already has an active allocation for this period');

    // Create allocation and update slot status
    const [allocation] = await prisma.$transaction([
      prisma.parkingAllocation.create({
        data: {
          slotId,
          propertyId,
          companyId,
          tenantId,
          unitId: unitId || null,
          leaseId: leaseId || null,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          monthlyRate: Number(monthlyRate),
          billingDay: billingDay || 1,
          vehicleId: vehicleId || null,
          notes: notes || null,
          createdBy: userId,
        },
        include: {
          slot:   { select: { id: true, slotNumber: true } },
          tenant: { select: { id: true, firstName: true, lastName: true, companyName: true } },
        },
      }),
      prisma.parkingSlot.update({
        where: { id: slotId },
        data: { status: 'allocated' },
      }),
    ]);

    return allocation;
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const allocation = await prisma.parkingAllocation.findFirst({ where: { id, companyId } });
    if (!allocation) throw AppError.notFound('Allocation');

    const data: Record<string, unknown> = {};
    if (dto.endDate !== undefined)    data.endDate = dto.endDate ? new Date(dto.endDate as string) : null;
    if (dto.monthlyRate !== undefined) data.monthlyRate = Number(dto.monthlyRate);
    if (dto.billingDay !== undefined) data.billingDay = dto.billingDay;
    if (dto.vehicleId !== undefined)  data.vehicleId = dto.vehicleId;
    if (dto.notes !== undefined)      data.notes = dto.notes;
    if (dto.status !== undefined)     data.status = dto.status;

    return prisma.parkingAllocation.update({
      where: { id },
      data: data as any,
      include: {
        slot:   { select: { id: true, slotNumber: true } },
        tenant: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      },
    });
  }

  async cancel(id: string, companyId: string) {
    const allocation = await prisma.parkingAllocation.findFirst({ where: { id, companyId } });
    if (!allocation) throw AppError.notFound('Allocation');
    if (allocation.status !== 'active') throw AppError.validation('Only active allocations can be cancelled');

    await prisma.$transaction([
      prisma.parkingAllocation.update({ where: { id }, data: { status: 'cancelled' } }),
      prisma.parkingSlot.update({ where: { id: allocation.slotId }, data: { status: 'available' } }),
    ]);
  }
}

export const allocationsService = new AllocationsService();
