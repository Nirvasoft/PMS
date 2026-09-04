import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware';
import { usersService } from './services/users.service';
import { rolesService } from './services/roles.service';
import { permissionsService } from './services/permissions.service';
import { departmentsService } from './services/departments.service';
import { positionsService } from './services/positions.service';
import { avatarUpload, csvUpload, getFileUrl, saveUploadedFileToSpaces } from '../../common/upload';
import { prisma } from '../../common/database';
import { requirePermission } from '../auth/guards/roleGuard';
import { AppError } from '../../common/errors';

/** Helper to extract route param as string */
const param = (req: Request, name: string): string => req.params[name] as string;

export const usersRouter = Router();

// ─── Users ─────────────────────────────────────

usersRouter.get('/', requirePermission('users.read'), asyncHandler(async (req: Request, res: Response) => {
  const { search, departmentId, roleId, isActive, page, limit, sort, order } = req.query;
  const result = await usersService.findAll(req.user!.companyId, {
    search: search as string,
    departmentId: departmentId as string,
    roleId: roleId as string,
    isActive: isActive === undefined ? undefined : isActive === 'true',
    page: page ? parseInt(page as string) : undefined,
    limit: limit ? parseInt(limit as string) : undefined,
    sort: sort as string,
    order: order as 'asc' | 'desc',
  });
  res.json({ success: true, ...result });
}));

usersRouter.get('/:id', requirePermission('users.read'), asyncHandler(async (req: Request, res: Response) => {
  const data = await usersService.findById(param(req, 'id'));
  res.json({ success: true, data });
}));

usersRouter.post('/', requirePermission('users.create'), asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.create(req.body, req.user!.companyId);
  res.status(201).json({ success: true, data: { id: user.id, email: user.email } });
}));

usersRouter.put('/:id', requirePermission('users.update'), asyncHandler(async (req: Request, res: Response) => {
  const data = await usersService.updateProfile(param(req, 'id'), req.body);
  res.json({ success: true, data });
}));

usersRouter.post('/:id/deactivate', requirePermission('users.deactivate'), asyncHandler(async (req: Request, res: Response) => {
  await usersService.deactivate(param(req, 'id'), req.body.reason || 'No reason provided');
  res.json({ success: true });
}));

usersRouter.post('/:id/reactivate', requirePermission('users.deactivate'), asyncHandler(async (req: Request, res: Response) => {
  await usersService.reactivate(param(req, 'id'));
  res.json({ success: true });
}));

usersRouter.post('/:id/reset-password', requirePermission('users.update'), asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.adminResetPassword(param(req, 'id'));
  res.json({ success: true, data: result });
}));

// Avatar upload — a user may always upload their own; editing someone else's needs users.update
usersRouter.post('/:id/avatar', avatarUpload.single('avatar'), asyncHandler(async (req: Request, res: Response) => {
  const targetId = param(req, 'id');
  const isSelf = req.user!.sub === targetId;
  if (!isSelf && !req.user!.permissions?.includes('users.update')) {
    throw AppError.forbidden('This action requires the users.update permission');
  }
  if (!req.file) { res.status(400).json({ success: false, errors: [{ message: 'No file uploaded' }] }); return; }
  const avatarUrl = await saveUploadedFileToSpaces(req.file, 'avatars');
  await prisma.userProfile.update({ where: { userId: targetId }, data: { avatarUrl } });
  res.json({ success: true, data: { avatarUrl } });
}));

// CSV Bulk Import
usersRouter.post('/import', requirePermission('users.create'), csvUpload.single('csv'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file?.buffer) { res.status(400).json({ success: false, errors: [{ message: 'No CSV file uploaded' }] }); return; }
  
  const content = req.file.buffer.toString('utf-8').replace(/^﻿/, '');
  const lines = content.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) { res.status(400).json({ success: false, errors: [{ message: 'CSV file is empty' }] }); return; }
  const headers = lines[0]!.split(',').map(h => h.trim().toLowerCase());

  const results: { email: string; status: string; error?: string }[] = [];
  let created = 0, skipped = 0, errors = 0;

  const companyRoles = await rolesService.findAll(req.user!.companyId, false);
  const roleByName = new Map(companyRoles.map(r => [r.name.trim().toLowerCase(), r]));

  for (const line of lines.slice(1)) {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });

    if (!row['email']) { errors++; results.push({ email: '', status: 'error', error: 'Missing email' }); continue; }

    const roleName = row['role']?.trim();
    let matchedRole: (typeof companyRoles)[number] | undefined;
    if (roleName) {
      matchedRole = roleByName.get(roleName.toLowerCase());
      if (!matchedRole) {
        errors++;
        results.push({ email: row['email'], status: 'error', error: `Unknown role "${roleName}" — does not match any role in Roles & Permissions` });
        continue;
      }
    }

    try {
      const existing = await prisma.user.findFirst({ where: { email: row['email'], companyId: req.user!.companyId } });
      if (existing) { skipped++; results.push({ email: row['email'], status: 'skipped' }); continue; }

      const bcrypt = await import('bcryptjs');
      const tempPassword = Math.random().toString(36).slice(-10);
      const passwordHash = await bcrypt.default.hash(tempPassword, 10);

      const user = await prisma.user.create({
        data: {
          email: row['email'],
          passwordHash,
          companyId: req.user!.companyId,
          isActive: true,
          mustChangePassword: true,
          profile: {
            create: {
              firstName: row['firstname'] || row['first_name'] || row['email'].split('@')[0] || 'User',
              lastName: row['lastname'] || row['last_name'] || '',
            },
          },
        },
      });

      if (matchedRole) {
        await prisma.userRole.create({
          data: { userId: user.id, roleId: matchedRole.id, grantedBy: req.user!.sub },
        });
      }

      created++;
      results.push({ email: row['email'], status: 'created' });
    } catch (err: unknown) {
      errors++;
      results.push({ email: row['email'], status: 'error', error: String(err) });
    }
  }

  res.json({ success: true, data: { created, skipped, errors, results } });
}));

// ─── User Roles ────────────────────────────────

usersRouter.post('/:id/roles', requirePermission('users.manage-roles'), asyncHandler(async (req: Request, res: Response) => {
  await usersService.assignRole(param(req, 'id'), req.body, req.user!.sub);
  res.status(201).json({ success: true });
}));

usersRouter.delete('/:id/roles/:roleId', requirePermission('users.manage-roles'), asyncHandler(async (req: Request, res: Response) => {
  await usersService.removeRole(param(req, 'id'), param(req, 'roleId'));
  res.status(204).send();
}));

// ─── User Permission Overrides ─────────────────

usersRouter.get('/:id/permission-overrides', requirePermission('users.manage-permissions'), asyncHandler(async (req: Request, res: Response) => {
  const data = await usersService.getPermissionOverrides(param(req, 'id'));
  res.json({ success: true, data });
}));

usersRouter.post('/:id/permission-overrides', requirePermission('users.manage-permissions'), asyncHandler(async (req: Request, res: Response) => {
  await usersService.setPermissionOverride(param(req, 'id'), req.body, req.user!.sub);
  res.status(201).json({ success: true });
}));

usersRouter.delete('/:id/permission-overrides/:overrideId', requirePermission('users.manage-permissions'), asyncHandler(async (req: Request, res: Response) => {
  await usersService.removePermissionOverride(param(req, 'id'), param(req, 'overrideId'));
  res.status(204).send();
}));

// ─── Roles ─────────────────────────────────────

export const rolesRouter = Router();

rolesRouter.get('/', requirePermission('roles.read'), asyncHandler(async (req: Request, res: Response) => {
  const includePermissions = req.query.includePermissions === 'true';
  const data = await rolesService.findAll(req.user!.companyId, includePermissions);
  res.json({ success: true, data });
}));

rolesRouter.get('/:id', requirePermission('roles.read'), asyncHandler(async (req: Request, res: Response) => {
  const data = await rolesService.findById(param(req, 'id'));
  res.json({ success: true, data });
}));

rolesRouter.post('/', requirePermission('roles.create'), asyncHandler(async (req: Request, res: Response) => {
  const data = await rolesService.create(req.body, req.user!.companyId, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

rolesRouter.put('/:id', requirePermission('roles.manage'), asyncHandler(async (req: Request, res: Response) => {
  const data = await rolesService.update(param(req, 'id'), req.body, req.user!.sub);
  res.json({ success: true, data });
}));

rolesRouter.delete('/:id', requirePermission('roles.manage'), asyncHandler(async (req: Request, res: Response) => {
  await rolesService.delete(param(req, 'id'));
  res.status(204).send();
}));

rolesRouter.post('/from-template', requirePermission('roles.create'), asyncHandler(async (req: Request, res: Response) => {
  const data = await rolesService.createFromTemplate(
    req.body.templateId, req.body.name, req.user!.companyId, req.user!.sub,
  );
  res.status(201).json({ success: true, data });
}));

// ─── Role Templates ────────────────────────────

export const roleTemplatesRouter = Router();

roleTemplatesRouter.get('/', requirePermission('roles.read'), asyncHandler(async (_req: Request, res: Response) => {
  const data = await rolesService.getTemplates();
  res.json({ success: true, data });
}));

// ─── Permissions ───────────────────────────────

export const permissionsRouter = Router();

permissionsRouter.get('/', requirePermission('roles.read'), asyncHandler(async (req: Request, res: Response) => {
  const data = await permissionsService.findAllGrouped(req.query.module as string);
  res.json({ success: true, data });
}));

// ─── Departments ───────────────────────────────

export const departmentsRouter = Router();

departmentsRouter.get('/', requirePermission('departments.read'), asyncHandler(async (req: Request, res: Response) => {
  if (req.query.tree === 'true') {
    const data = await departmentsService.getTree(req.user!.companyId);
    res.json({ success: true, data });
  } else {
    const data = await departmentsService.findAll(req.user!.companyId);
    res.json({ success: true, data });
  }
}));

departmentsRouter.post('/', requirePermission('departments.create'), asyncHandler(async (req: Request, res: Response) => {
  const data = await departmentsService.create(req.body, req.user!.companyId);
  res.status(201).json({ success: true, data });
}));

departmentsRouter.put('/:id', requirePermission('departments.update'), asyncHandler(async (req: Request, res: Response) => {
  const data = await departmentsService.update(param(req, 'id'), req.body);
  res.json({ success: true, data });
}));

departmentsRouter.post('/:id/move', requirePermission('departments.update'), asyncHandler(async (req: Request, res: Response) => {
  const data = await departmentsService.move(param(req, 'id'), req.body.newParentId);
  res.json({ success: true, data });
}));

departmentsRouter.delete('/:id', requirePermission('departments.delete'), asyncHandler(async (req: Request, res: Response) => {
  await departmentsService.delete(param(req, 'id'));
  res.status(204).send();
}));

// ─── Positions ─────────────────────────────────

export const positionsRouter = Router();

positionsRouter.get('/', requirePermission('positions.read'), asyncHandler(async (req: Request, res: Response) => {
  const data = await positionsService.findAll(req.user!.companyId, req.query.departmentId as string);
  res.json({ success: true, data });
}));

positionsRouter.post('/', requirePermission('positions.create'), asyncHandler(async (req: Request, res: Response) => {
  const data = await positionsService.create(req.body, req.user!.companyId);
  res.status(201).json({ success: true, data });
}));

positionsRouter.put('/:id', requirePermission('positions.update'), asyncHandler(async (req: Request, res: Response) => {
  const data = await positionsService.update(param(req, 'id'), req.body);
  res.json({ success: true, data });
}));

positionsRouter.delete('/:id', requirePermission('positions.delete'), asyncHandler(async (req: Request, res: Response) => {
  await positionsService.delete(param(req, 'id'));
  res.status(204).send();
}));
