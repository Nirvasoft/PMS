import { randomUUID } from 'crypto';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class VisitorPassesService {
  async findAll(companyId: string, query: {
    propertyId?: string; status?: string; page?: number; limit?: number;
  }) {
    const { propertyId, status, page = 1, limit = 20 } = query;
    const where: Record<string, unknown> = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (status)     where.status = status;

    const [data, total] = await Promise.all([
      prisma.visitorParkingPass.findMany({
        where,
        include: {
          slot:        { select: { id: true, slotNumber: true } },
          issuer:      { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          issuingUnit: { select: { id: true, unitNumber: true } },
          property:    { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.visitorParkingPass.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async issue(propertyId: string, companyId: string, dto: Record<string, unknown>, userId: string) {
    const { slotId, issuingUnitId, visitorName, visitorVehiclePlate, validFrom, validTo, maxHours } = dto as any;

    // Generate QR token
    const qrToken = `VP-${randomUUID().split('-')[0].toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    // If slot specified, mark as visitor
    if (slotId) {
      const slot = await prisma.parkingSlot.findFirst({ where: { id: slotId, propertyId } });
      if (!slot) throw AppError.notFound('Slot');
      if (!['available', 'visitor'].includes(slot.status)) {
        throw new AppError(409, 'SLOT_NOT_AVAILABLE', `Slot ${slot.slotNumber} is ${slot.status}`);
      }
      await prisma.parkingSlot.update({ where: { id: slotId }, data: { status: 'visitor' } });
    }

    return prisma.visitorParkingPass.create({
      data: {
        propertyId,
        companyId,
        slotId: slotId || null,
        issuedBy: userId,
        issuingUnitId: issuingUnitId || null,
        visitorName,
        visitorVehiclePlate: visitorVehiclePlate || null,
        qrToken,
        validFrom: new Date(validFrom),
        validTo: new Date(validTo),
        maxHours: maxHours || 4,
      },
      include: {
        slot:        { select: { id: true, slotNumber: true } },
        issuingUnit: { select: { id: true, unitNumber: true } },
      },
    });
  }

  async scan(qrToken: string) {
    const pass = await prisma.visitorParkingPass.findUnique({ where: { qrToken } });
    if (!pass) throw AppError.notFound('Visitor Pass');

    const now = new Date();
    if (now > new Date(pass.validTo)) {
      throw new AppError(403, 'PASS_EXPIRED', 'This visitor pass has expired');
    }

    // Entry scan
    if (pass.status === 'pending') {
      return prisma.visitorParkingPass.update({
        where: { id: pass.id },
        data: { status: 'active', actualEntryAt: now },
      });
    }

    // Exit scan
    if (pass.status === 'active') {
      const updated = await prisma.visitorParkingPass.update({
        where: { id: pass.id },
        data: { status: 'completed', actualExitAt: now },
      });

      // Free up slot
      if (pass.slotId) {
        await prisma.parkingSlot.update({ where: { id: pass.slotId }, data: { status: 'available' } });
      }
      return updated;
    }

    throw AppError.validation(`Pass is already ${pass.status}`);
  }

  async cancel(id: string, companyId: string) {
    const pass = await prisma.visitorParkingPass.findFirst({ where: { id, companyId } });
    if (!pass) throw AppError.notFound('Visitor Pass');
    if (!['pending', 'active'].includes(pass.status)) {
      throw AppError.validation('Cannot cancel a completed/expired pass');
    }

    await prisma.visitorParkingPass.update({ where: { id }, data: { status: 'cancelled' } });

    // Free up slot
    if (pass.slotId) {
      await prisma.parkingSlot.update({ where: { id: pass.slotId }, data: { status: 'available' } });
    }
  }
}

export const visitorPassesService = new VisitorPassesService();
