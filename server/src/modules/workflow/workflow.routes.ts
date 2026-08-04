import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware';
import { definitionsService } from './services/definitions.service';
import { workflowEngine } from './services/engine.service';
import { tasksService } from './services/tasks.service';
import { fileUpload, persistUploadedFile } from '../../common/upload';
import { prisma } from '../../common/database';

const param = (req: Request, name: string): string => req.params[name] as string;

// ─── Definitions ───────────────────────────────

export const workflowDefinitionsRouter = Router();

workflowDefinitionsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await definitionsService.findAll(req.user!.companyId, {
    entityType: req.query.entityType as string,
    status: req.query.status as string,
  });
  res.json({ success: true, data });
}));

workflowDefinitionsRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await definitionsService.findById(param(req, 'id'));
  res.json({ success: true, data });
}));

workflowDefinitionsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await definitionsService.create(req.body, req.user!.companyId, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

workflowDefinitionsRouter.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await definitionsService.update(param(req, 'id'), req.body);
  res.json({ success: true, data });
}));

workflowDefinitionsRouter.post('/:id/publish', asyncHandler(async (req: Request, res: Response) => {
  const data = await definitionsService.publish(param(req, 'id'));
  res.json({ success: true, data });
}));

workflowDefinitionsRouter.post('/:id/deprecate', asyncHandler(async (req: Request, res: Response) => {
  const data = await definitionsService.deprecate(param(req, 'id'));
  res.json({ success: true, data });
}));

workflowDefinitionsRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await definitionsService.delete(param(req, 'id'));
  res.status(204).send();
}));

// ─── Instances ─────────────────────────────────

export const workflowInstancesRouter = Router();

workflowInstancesRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const result = await tasksService.getInstances(req.user!.companyId, {
    entityType: req.query.entityType as string,
    status: req.query.status as string,
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
  });
  res.json({ success: true, ...result });
}));

workflowInstancesRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await workflowEngine.getInstanceDetail(param(req, 'id'));
  if (!data) { res.status(404).json({ success: false, errors: [{ code: 'NOT_FOUND', message: 'Instance not found' }] }); return; }
  res.json({ success: true, data });
}));

workflowInstancesRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { definitionId, entityType, entityId, entitySnapshot } = req.body;
  const data = await workflowEngine.startInstance(definitionId, entityType, entityId, entitySnapshot, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

workflowInstancesRouter.post('/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
  await workflowEngine.cancelInstance(param(req, 'id'), req.body.reason || 'Cancelled', req.user!.sub);
  res.json({ success: true });
}));

// ─── Tasks ─────────────────────────────────────

export const workflowTasksRouter = Router();

workflowTasksRouter.get('/my-tasks', asyncHandler(async (req: Request, res: Response) => {
  const result = await tasksService.getMyTasks(req.user!.sub, {
    status: req.query.status as string,
    entityType: req.query.entityType as string,
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
  });
  res.json({ success: true, ...result });
}));

workflowTasksRouter.post('/:id/approve', asyncHandler(async (req: Request, res: Response) => {
  const data = await workflowEngine.completeTask(param(req, 'id'), 'approved', req.body.comments || '', req.user!.sub);
  res.json({ success: true, data });
}));

workflowTasksRouter.post('/:id/reject', asyncHandler(async (req: Request, res: Response) => {
  const data = await workflowEngine.completeTask(param(req, 'id'), 'rejected', req.body.comments || '', req.user!.sub);
  res.json({ success: true, data });
}));

workflowTasksRouter.post('/:id/delegate', asyncHandler(async (req: Request, res: Response) => {
  await workflowEngine.delegateTask(param(req, 'id'), req.body.delegateTo, req.body.reason || '', req.user!.sub);
  res.json({ success: true });
}));

// ─── Task Attachments ──────────────────────────

workflowTasksRouter.post('/:id/attachments', fileUpload.array('files', 5), asyncHandler(async (req: Request, res: Response) => {
  const taskId = param(req, 'id');
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    res.status(400).json({ success: false, errors: [{ code: 'NO_FILES', message: 'No files provided' }] }); return;
  }

  // Get current task
  const task = await prisma.workflowTask.findUnique({
    where: { id: taskId },
    select: { id: true, attachments: true, instanceId: true },
  });
  if (!task) {
    res.status(404).json({ success: false, errors: [{ code: 'NOT_FOUND', message: 'Task not found' }] }); return;
  }

  // Process files
  const existingAttachments = (task.attachments as any[]) || [];
  const newAttachments: any[] = [];

  for (const file of files) {
    const url = await persistUploadedFile(file, 'workflow-attachments');
    newAttachments.push({
      name: file.originalname,
      url,
      size: file.size,
      type: file.mimetype,
      uploadedBy: req.user!.sub,
      uploadedAt: new Date().toISOString(),
    });
  }

  const allAttachments = [...existingAttachments, ...newAttachments];

  // Update task
  await prisma.workflowTask.update({
    where: { id: taskId },
    data: { attachments: allAttachments as any },
  });

  res.json({ success: true, data: newAttachments });
}));
