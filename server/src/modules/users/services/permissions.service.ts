import { prisma } from '../../../common/database';

export class PermissionsService {
  /** Get all permissions grouped by module */
  async findAllGrouped(moduleFilter?: string) {
    const where = moduleFilter ? { module: moduleFilter, isActive: true } : { isActive: true };
    const permissions = await prisma.permission.findMany({
      where,
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });

    // Group by module
    const grouped: Record<string, Array<{ code: string; name: string; action: string; description: string | null }>> = {};
    for (const p of permissions) {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push({
        code: p.code,
        name: p.name,
        action: p.action,
        description: p.description,
      });
    }

    return grouped;
  }
}

export const permissionsService = new PermissionsService();
