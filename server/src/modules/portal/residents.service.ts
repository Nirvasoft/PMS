import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import crypto from 'crypto';

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

  /**
   * Invite a resident to the portal.
   * Creates a UserInvitation with 72h expiry and assigns the 'Resident' role.
   * Only primary tenant can invite. Under-18 residents cannot be invited.
   */
  async inviteToPortal(companyId: string, userId: string, residentId: string, email: string) {
    const primaryResident = await this.getActiveResident(companyId, userId);

    // Only primary tenants can invite
    if (primaryResident.residentType !== 'primary_tenant') {
      throw AppError.forbidden('Only the primary tenant can invite residents to the portal');
    }

    // Verify the target resident belongs to the same unit
    const target = await prisma.resident.findFirst({
      where: { id: residentId, companyId, unitId: primaryResident.unitId, isActive: true },
    });
    if (!target) throw AppError.notFound('Resident');

    // Already has portal access
    if (target.hasPortalAccess && target.userId) {
      throw AppError.validation('This resident already has portal access');
    }

    // Check if email is already used by another user
    const existingUser = await prisma.user.findFirst({ where: { email, companyId } });
    if (existingUser) {
      throw AppError.conflict('A user with this email already exists');
    }

    // Under-18 check
    if (target.dateOfBirth) {
      const age = Math.floor(
        (Date.now() - new Date(target.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      );
      if (age < 18) {
        throw AppError.validation('Residents under 18 cannot be invited to the portal');
      }
    }

    // Find or create the 'Resident' role for this company
    let role = await prisma.role.findFirst({
      where: { companyId, name: 'Resident' },
    });
    if (!role) {
      role = await prisma.role.create({
        data: {
          companyId,
          name: 'Resident',
          description: 'Portal access for residents',
          isSystem: true,
          createdBy: userId,
        },
      });
    }

    // Remove any existing pending invite for this email
    await prisma.userInvitation.deleteMany({ where: { companyId, email } });

    // Create invitation with 72h expiry
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

    await prisma.userInvitation.create({
      data: {
        companyId,
        email,
        roleId: role.id,
        invitedBy: userId,
        tokenHash,
        message: `You've been invited to the resident portal for unit ${primaryResident.unitId}. Set up your account to access invoices, maintenance requests, and community features.`,
        expiresAt,
      },
    });

    // Update resident email if different
    if (target.email !== email) {
      await prisma.resident.update({
        where: { id: residentId },
        data: { email },
      });
    }

    const frontendUrl = process.env['FRONTEND_URL'] || 'http://localhost:5173';
    const inviteUrl = `${frontendUrl}/accept-invite?token=${token}`;

    return {
      inviteUrl,
      email,
      expiresAt: expiresAt.toISOString(),
      residentName: `${target.firstName} ${target.lastName}`,
    };
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
