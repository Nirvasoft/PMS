import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

class ResidentsService {
  /**
   * List all active residents in the user's unit.
   */
  async findAll(companyId: string, userId: string) {
    const resident = await this.getActiveResident(companyId, userId);

    return prisma.resident.findMany({
      where: {
        companyId,
        unitId: resident.unitId,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        residentType: true,
        relationship: true,
        mobile: true,
        email: true,
        avatarUrl: true,
        hasPortalAccess: true,
        moveInDate: true,
        vehiclePlate: true,
        dateOfBirth: true,
        idType: true,
        notes: true,
        createdAt: true,
      },
      orderBy: [
        { residentType: 'asc' }, // primary_tenant first
        { createdAt: 'asc' },
      ],
    });
  }

  /**
   * Add a new resident to the unit.
   * Only primary tenant can add residents. Max 10 per unit.
   */
  async create(companyId: string, userId: string, data: {
    firstName: string;
    lastName: string;
    residentType?: string;
    relationship?: string;
    dateOfBirth?: string;
    idType?: string;
    idNumber?: string;
    mobile?: string;
    email?: string;
    vehiclePlate?: string;
    moveInDate?: string;
    notes?: string;
  }) {
    const primaryResident = await this.getActiveResident(companyId, userId);

    // Only primary tenants can add residents
    if (primaryResident.residentType !== 'primary_tenant') {
      throw AppError.forbidden('Only the primary tenant can add residents');
    }

    // Check max 10 residents per unit
    const count = await prisma.resident.count({
      where: { companyId, unitId: primaryResident.unitId, isActive: true },
    });
    if (count >= 10) {
      throw AppError.validation('Maximum 10 residents per unit');
    }

    return prisma.resident.create({
      data: {
        companyId,
        propertyId: primaryResident.propertyId,
        unitId: primaryResident.unitId,
        leaseId: primaryResident.leaseId,
        tenantId: primaryResident.tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        residentType: data.residentType || 'family_member',
        relationship: data.relationship || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        idType: data.idType || null,
        idNumber: data.idNumber || null,
        mobile: data.mobile || null,
        email: data.email || null,
        vehiclePlate: data.vehiclePlate || null,
        moveInDate: data.moveInDate ? new Date(data.moveInDate) : null,
        notes: data.notes || null,
      },
    });
  }

  /**
   * Update an existing resident.
   */
  async update(companyId: string, userId: string, residentId: string, data: Record<string, any>) {
    const primaryResident = await this.getActiveResident(companyId, userId);

    // Verify the target resident belongs to the same unit
    const target = await prisma.resident.findFirst({
      where: { id: residentId, companyId, unitId: primaryResident.unitId, isActive: true },
    });
    if (!target) throw AppError.notFound('Resident');

    // Only primary tenant can edit other residents; anyone can edit themselves
    if (target.userId !== userId && primaryResident.residentType !== 'primary_tenant') {
      throw AppError.forbidden('Only the primary tenant can edit other residents');
    }

    const updateData: any = {};
    const allowedFields = [
      'firstName', 'lastName', 'residentType', 'relationship',
      'idType', 'idNumber', 'mobile', 'email', 'vehiclePlate', 'notes',
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }

    // Date fields
    if (data.dateOfBirth !== undefined) {
      updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    }
    if (data.moveInDate !== undefined) {
      updateData.moveInDate = data.moveInDate ? new Date(data.moveInDate) : null;
    }
    if (data.moveOutDate !== undefined) {
      updateData.moveOutDate = data.moveOutDate ? new Date(data.moveOutDate) : null;
    }

    return prisma.resident.update({
      where: { id: residentId },
      data: updateData,
    });
  }

  /**
   * Soft-remove a resident (set inactive).
   */
  async remove(companyId: string, userId: string, residentId: string) {
    const primaryResident = await this.getActiveResident(companyId, userId);

    if (primaryResident.residentType !== 'primary_tenant') {
      throw AppError.forbidden('Only the primary tenant can remove residents');
    }

    const target = await prisma.resident.findFirst({
      where: { id: residentId, companyId, unitId: primaryResident.unitId, isActive: true },
    });
    if (!target) throw AppError.notFound('Resident');

    // Cannot remove yourself
    if (target.userId === userId) {
      throw AppError.validation('Cannot remove yourself');
    }

    return prisma.resident.update({
      where: { id: residentId },
      data: { isActive: false, moveOutDate: new Date() },
    });
  }

  // ── Helper ─────────────────────────────────

  private async getActiveResident(companyId: string, userId: string) {
    const resident = await prisma.resident.findFirst({
      where: { companyId, userId, isActive: true },
    });
    if (!resident) throw AppError.notFound('No active residence found for this user');
    return resident;
  }
}

export const residentsService = new ResidentsService();
