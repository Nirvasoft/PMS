import crypto from 'crypto';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export const invitationsService = {
  async sendInvite(
    companyId: string,
    invitedBy: string,
    data: { email: string; roleId?: string; departmentId?: string; message?: string },
  ) {
    // Check if already an active user with this email
    const existing = await prisma.user.findFirst({ where: { email: data.email, companyId } });
    if (existing) throw AppError.conflict('A user with this email already exists in your company');

    // Remove any existing pending invite for this email+company
    await prisma.userInvitation.deleteMany({ where: { companyId, email: data.email } });

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await prisma.userInvitation.create({
      data: {
        companyId,
        email: data.email,
        roleId: data.roleId || null,
        departmentId: data.departmentId || null,
        invitedBy,
        tokenHash,
        message: data.message || null,
        expiresAt,
      },
      include: { inviter: { select: { email: true } } },
    });

    return { invite, token, inviteUrl: `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/accept-invite?token=${token}` };
  },

  async listInvites(companyId: string) {
    return prisma.userInvitation.findMany({
      where: { companyId },
      include: {
        role: { select: { id: true, name: true } },
        inviter: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async revokeInvite(id: string, companyId: string) {
    const invite = await prisma.userInvitation.findFirst({ where: { id, companyId } });
    if (!invite) throw AppError.notFound('Invitation not found');
    await prisma.userInvitation.delete({ where: { id } });
  },

  async acceptInvite(token: string, userData: { firstName: string; lastName: string; password: string }) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invite = await prisma.userInvitation.findFirst({
      where: { tokenHash },
      include: { company: true, role: true },
    });
    if (!invite) throw AppError.notFound('Invalid or expired invitation link');
    if (invite.acceptedAt) throw AppError.conflict('This invitation has already been accepted');
    if (invite.expiresAt < new Date()) throw AppError.validation('This invitation has expired');

    // Import bcrypt dynamically to avoid circular deps
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash(userData.password, 12);

    const user = await prisma.user.create({
      data: {
        email: invite.email,
        passwordHash,
        companyId: invite.companyId,
        isActive: true,
        profile: {
          create: { firstName: userData.firstName, lastName: userData.lastName },
        },
      },
    });

    // Assign role if specified
    if (invite.roleId) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: invite.roleId, grantedBy: invite.invitedBy } });
    }

    // Mark invite as accepted
    await prisma.userInvitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

    return user;
  },
};
