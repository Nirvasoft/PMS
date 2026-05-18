import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

export class FoldersService {
  /**
   * List folders — optionally as a tree or flat list.
   */
  async listFolders(companyId: string, query: {
    parentId?: string;
    propertyId?: string;
    entityType?: string;
    entityId?: string;
    tree?: boolean;
  }) {
    const where: Record<string, unknown> = { companyId };

    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;

    if (query.tree) {
      // Return full tree — fetch all folders and build hierarchy
      const all = await prisma.documentFolder.findMany({
        where,
        include: { _count: { select: { documents: true, children: true } } },
        orderBy: { name: 'asc' },
      });
      return this.buildTree(all, null);
    }

    // Flat list — optionally filtered by parentId
    if (query.parentId !== undefined) {
      where.parentId = query.parentId === 'null' ? null : query.parentId;
    }

    return prisma.documentFolder.findMany({
      where,
      include: { _count: { select: { documents: true, children: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Create a new folder.
   */
  async createFolder(companyId: string, dto: {
    name: string;
    parentId?: string;
    propertyId?: string;
    entityType?: string;
    entityId?: string;
    accessPolicy?: string;
  }, userId: string) {
    // Build the materialized path
    let parentPath = '/';
    if (dto.parentId) {
      const parent = await prisma.documentFolder.findFirst({
        where: { id: dto.parentId, companyId },
      });
      if (!parent) throw new AppError(404, 'PARENT_FOLDER_NOT_FOUND', 'Parent folder not found');
      parentPath = parent.path;
    }

    const safeName = dto.name.replace(/\//g, '-');
    const path = `${parentPath}${safeName}/`;

    // Check for duplicate path
    const existing = await prisma.documentFolder.findFirst({
      where: { path, companyId },
    });
    if (existing) {
      throw new AppError(409, 'FOLDER_EXISTS', `A folder already exists at path: ${path}`);
    }

    return prisma.documentFolder.create({
      data: {
        companyId,
        propertyId: dto.propertyId,
        parentId: dto.parentId,
        name: dto.name,
        path,
        entityType: dto.entityType,
        entityId: dto.entityId,
        accessPolicy: dto.accessPolicy || 'inherit',
        createdBy: userId,
      },
      include: { _count: { select: { documents: true, children: true } } },
    });
  }

  /**
   * Update a folder.
   */
  async updateFolder(id: string, companyId: string, data: {
    name?: string;
    accessPolicy?: string;
  }) {
    const folder = await prisma.documentFolder.findFirst({ where: { id, companyId } });
    if (!folder) throw new AppError(404, 'FOLDER_NOT_FOUND', 'Folder not found');

    // If renaming, update path
    const updateData: Record<string, unknown> = {};
    if (data.name) {
      updateData.name = data.name;
      const parentPath = folder.path.substring(0, folder.path.lastIndexOf(folder.name + '/'));
      const safeName = data.name.replace(/\//g, '-');
      updateData.path = `${parentPath}${safeName}/`;
    }
    if (data.accessPolicy) updateData.accessPolicy = data.accessPolicy;

    return prisma.documentFolder.update({
      where: { id },
      data: updateData,
      include: { _count: { select: { documents: true, children: true } } },
    });
  }

  /**
   * Delete a folder. Moves contained documents to parent folder (or root).
   */
  async deleteFolder(id: string, companyId: string) {
    const folder = await prisma.documentFolder.findFirst({
      where: { id, companyId },
      include: { _count: { select: { documents: true, children: true } } },
    });
    if (!folder) throw new AppError(404, 'FOLDER_NOT_FOUND', 'Folder not found');

    // Move documents to parent folder
    await prisma.document.updateMany({
      where: { folderId: id },
      data: { folderId: folder.parentId },
    });

    // Move child folders to parent
    await prisma.documentFolder.updateMany({
      where: { parentId: id },
      data: { parentId: folder.parentId },
    });

    await prisma.documentFolder.delete({ where: { id } });
  }

  // ─── Helpers ──────────────────────────────────

  private buildTree(
    folders: Array<Record<string, unknown> & { id: string; parentId: string | null }>,
    parentId: string | null,
  ): Array<Record<string, unknown>> {
    return folders
      .filter((f) => f.parentId === parentId)
      .map((f) => ({
        ...f,
        children: this.buildTree(folders, f.id),
      }));
  }
}

export const foldersService = new FoldersService();
