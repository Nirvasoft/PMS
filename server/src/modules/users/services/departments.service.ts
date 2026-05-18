import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

export class DepartmentsService {
  /** Get departments as a nested tree */
  async getTree(companyId: string) {
    const departments = await prisma.department.findMany({
      where: { companyId, isActive: true },
      include: {
        manager: {
          include: { profile: { select: { firstName: true, lastName: true } } },
        },
        _count: { select: { profiles: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Build tree from flat list
    const map = new Map<string, Record<string, unknown>>();
    const roots: Record<string, unknown>[] = [];

    for (const dept of departments) {
      map.set(dept.id, {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        parentId: dept.parentId,
        sortOrder: dept.sortOrder,
        manager: dept.manager ? {
          id: dept.manager.id,
          fullName: dept.manager.profile
            ? `${dept.manager.profile.firstName} ${dept.manager.profile.lastName}`
            : dept.manager.email,
        } : null,
        userCount: dept._count.profiles,
        children: [],
      });
    }

    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId as string)) {
        const parent = map.get(node.parentId as string)!;
        (parent.children as Record<string, unknown>[]).push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /** Get flat list */
  async findAll(companyId: string) {
    return prisma.department.findMany({
      where: { companyId },
      include: {
        manager: { include: { profile: { select: { firstName: true, lastName: true } } } },
        _count: { select: { profiles: true, children: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /** Create department */
  async create(dto: {
    name: string; code?: string; parentId?: string; managerId?: string; sortOrder?: number;
  }, companyId: string) {
    // Check depth if parent exists
    if (dto.parentId) {
      const depth = await this.getDepth(dto.parentId);
      if (depth >= 10) throw AppError.validation('Maximum department depth of 10 levels exceeded');
    }

    return prisma.department.create({
      data: { companyId, ...dto },
    });
  }

  /** Update department */
  async update(deptId: string, dto: Record<string, unknown>) {
    return prisma.department.update({ where: { id: deptId }, data: dto });
  }

  /** Move department to new parent (with circular check) */
  async move(deptId: string, newParentId: string | null) {
    if (newParentId) {
      // Check for circular reference
      const isDescendant = await this.isDescendant(newParentId, deptId);
      if (isDescendant) throw AppError.validation('Cannot move department to its own descendant');

      const depth = await this.getDepth(newParentId);
      if (depth >= 10) throw AppError.validation('Maximum department depth exceeded');
    }

    return prisma.department.update({
      where: { id: deptId },
      data: { parentId: newParentId },
    });
  }

  /** Delete department (only if no children or users) */
  async delete(deptId: string) {
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
      include: { _count: { select: { children: true, profiles: true } } },
    });
    if (!dept) throw AppError.notFound('Department');
    if (dept._count.children > 0) throw AppError.conflict('Cannot delete department with sub-departments');
    if (dept._count.profiles > 0) throw AppError.conflict('Cannot delete department with assigned users');

    await prisma.department.delete({ where: { id: deptId } });
  }

  // ─── Helpers ──────────────────────

  private async getDepth(deptId: string): Promise<number> {
    let depth = 0;
    let currentId: string | null = deptId;
    while (currentId) {
      depth++;
      const dept: { parentId: string | null } | null = await prisma.department.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      currentId = dept?.parentId ?? null;
    }
    return depth;
  }

  private async isDescendant(nodeId: string, potentialAncestorId: string): Promise<boolean> {
    let currentId: string | null = nodeId;
    while (currentId) {
      if (currentId === potentialAncestorId) return true;
      const dept: { parentId: string | null } | null = await prisma.department.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      currentId = dept?.parentId ?? null;
    }
    return false;
  }
}

export const departmentsService = new DepartmentsService();
