import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware';
import { invitationsService } from './invitations.service';

export const invitationsRouter = Router();

// List all invites for the company
invitationsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await invitationsService.listInvites(req.user!.companyId);
  res.json({ success: true, data });
}));

// Send a new invite
invitationsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { email, roleId, departmentId, message } = req.body;
  if (!email) {
    res.status(400).json({ success: false, errors: [{ code: 'VALIDATION', message: 'Email is required' }] });
    return;
  }
  const result = await invitationsService.sendInvite(req.user!.companyId, req.user!.sub, { email, roleId, departmentId, message });
  res.status(201).json({ success: true, data: { id: result.invite.id, email, inviteUrl: result.inviteUrl, expiresAt: result.invite.expiresAt } });
}));

// Revoke an invite
invitationsRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await invitationsService.revokeInvite(String(req.params['id']), req.user!.companyId);
  res.status(204).send();
}));

// Accept invite (public — no auth required)
invitationsRouter.post('/accept', asyncHandler(async (req: Request, res: Response) => {
  const { token, firstName, lastName, password } = req.body;
  if (!token || !firstName || !lastName || !password) {
    res.status(400).json({ success: false, errors: [{ code: 'VALIDATION', message: 'token, firstName, lastName, password required' }] });
    return;
  }
  const user = await invitationsService.acceptInvite(token, { firstName, lastName, password });
  res.json({ success: true, data: { id: user.id, email: user.email } });
}));
