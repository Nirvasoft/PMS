import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed notification templates for Module 1.5.
 * These are system-level templates (companyId = null) available to all tenants.
 */
const TEMPLATES = [
  // Workflow
  {
    code: 'workflow_task_assigned',
    name: 'Workflow Task Assigned',
    description: 'Sent when a workflow task is assigned to a user',
    channels: ['in_app', 'email'],
    subject: 'Task Assigned: {{taskTitle}}',
    bodyText: 'You have been assigned a new task: {{taskTitle}} for {{entityType}} workflow. Please review and take action.',
    bodyHtml: '<p>You have been assigned a new task: <strong>{{taskTitle}}</strong> for <em>{{entityType}}</em> workflow.</p><p>Please review and take action.</p>',
    bodyPush: 'New task: {{taskTitle}}',
    variables: [
      { name: 'taskTitle', type: 'string', required: true },
      { name: 'entityType', type: 'string', required: true },
    ],
  },
  {
    code: 'workflow_task_completed',
    name: 'Workflow Task Completed',
    description: 'Sent when a workflow task is completed (approved/rejected)',
    channels: ['in_app'],
    subject: 'Task {{decision}}: {{taskTitle}}',
    bodyText: '{{performerName}} has {{decision}} the task "{{taskTitle}}".',
    bodyPush: '{{performerName}} {{decision}} "{{taskTitle}}"',
    variables: [
      { name: 'taskTitle', type: 'string', required: true },
      { name: 'decision', type: 'string', required: true },
      { name: 'performerName', type: 'string', required: true },
    ],
  },
  {
    code: 'workflow_completed',
    name: 'Workflow Completed',
    description: 'Sent when an entire workflow instance completes',
    channels: ['in_app', 'email'],
    subject: 'Workflow Complete: {{workflowName}}',
    bodyText: 'The {{workflowName}} workflow for {{entityType}} has completed with status: {{status}}.',
    bodyPush: '{{workflowName}} workflow completed',
    variables: [
      { name: 'workflowName', type: 'string', required: true },
      { name: 'entityType', type: 'string', required: true },
      { name: 'status', type: 'string', required: true },
    ],
  },
  {
    code: 'workflow_sla_breach',
    name: 'SLA Breach Warning',
    description: 'Sent when a task is about to breach or has breached its SLA',
    channels: ['in_app', 'email'],
    subject: '⚠️ SLA Breach: {{taskTitle}}',
    bodyText: 'The task "{{taskTitle}}" has breached its SLA deadline. Immediate action required.',
    bodyPush: '⚠️ SLA breach: {{taskTitle}}',
    isCritical: true,
    variables: [
      { name: 'taskTitle', type: 'string', required: true },
    ],
  },
  // User management
  {
    code: 'user_created',
    name: 'New User Welcome',
    description: 'Sent when a new user account is created',
    channels: ['email'],
    subject: 'Welcome to PMS — Your Account is Ready',
    bodyText: 'Hello {{firstName}}, your account has been created. Email: {{email}}. Please log in and set your password.',
    bodyHtml: '<h2>Welcome to PMS!</h2><p>Hello {{firstName}},</p><p>Your account has been created with email: <strong>{{email}}</strong>.</p><p>Please log in and set your password.</p>',
    variables: [
      { name: 'firstName', type: 'string', required: true },
      { name: 'email', type: 'string', required: true },
    ],
  },
  {
    code: 'user_deactivated',
    name: 'Account Deactivated',
    description: 'Sent when a user account is deactivated',
    channels: ['email'],
    subject: 'Account Deactivated',
    bodyText: 'Your account ({{email}}) has been deactivated. Reason: {{reason}}. Contact your administrator for assistance.',
    variables: [
      { name: 'email', type: 'string', required: true },
      { name: 'reason', type: 'string', required: false },
    ],
  },
  {
    code: 'password_reset',
    name: 'Password Reset',
    description: 'Sent when an admin resets a user password',
    channels: ['email'],
    subject: 'Your password has been reset',
    bodyText: 'Your password has been reset by an administrator. Please log in with your temporary password and change it immediately.',
    isCritical: true,
    variables: [],
  },
  // System
  {
    code: 'system_announcement',
    name: 'System Announcement',
    description: 'General system announcements',
    channels: ['in_app', 'email'],
    subject: '{{title}}',
    bodyText: '{{message}}',
    bodyPush: '{{title}}',
    variables: [
      { name: 'title', type: 'string', required: true },
      { name: 'message', type: 'string', required: true },
    ],
  },
];

async function seed() {
  console.log('🔔 Seeding Module 1.5 — Notification Center...');

  // Upsert templates (system-level, no companyId)
  for (const t of TEMPLATES) {
    const existing = await prisma.notificationTemplate.findFirst({
      where: { code: t.code, companyId: null },
    });

    if (existing) {
      await prisma.notificationTemplate.update({
        where: { id: existing.id },
        data: {
          name: t.name,
          description: t.description,
          channels: t.channels,
          subject: t.subject,
          bodyText: t.bodyText,
          bodyHtml: t.bodyHtml || null,
          bodyPush: t.bodyPush || null,
          variables: t.variables || [],
          isCritical: t.isCritical || false,
        },
      });
    } else {
      await prisma.notificationTemplate.create({
        data: {
          code: t.code,
          name: t.name,
          description: t.description,
          channels: t.channels,
          subject: t.subject,
          bodyText: t.bodyText,
          bodyHtml: t.bodyHtml || null,
          bodyPush: t.bodyPush || null,
          variables: t.variables || [],
          isCritical: t.isCritical || false,
          companyId: null,
        },
      });
    }
    console.log(`  ✅ Template: ${t.code}`);
  }

  // Create sample in-app notifications for admin
  const admin = await prisma.user.findFirst({
    where: { email: 'admin@acmeproperty.com' },
  });

  if (admin) {
    const existing = await prisma.inAppNotification.count({ where: { userId: admin.id } });
    if (existing === 0) {
      await prisma.inAppNotification.createMany({
        data: [
          {
            companyId: admin.companyId,
            userId: admin.id,
            title: 'Welcome to PMS!',
            body: 'Your Property Management System is ready. Start by configuring your organization settings.',
            icon: 'home',
            actionType: 'navigate',
            actionUrl: '/admin/company',
          },
          {
            companyId: admin.companyId,
            userId: admin.id,
            title: 'New User Created',
            body: 'Test User (user@acmeproperty.com) has been added to your organization.',
            icon: 'user',
            actionType: 'navigate',
            actionUrl: '/admin/users',
          },
          {
            companyId: admin.companyId,
            userId: admin.id,
            title: 'Workflow Published',
            body: 'The "Lease Approval" workflow has been published and is ready for use.',
            icon: 'git-branch',
            actionType: 'navigate',
            actionUrl: '/admin/workflows',
          },
          {
            companyId: admin.companyId,
            userId: admin.id,
            title: 'System Update Available',
            body: 'PMS v1.5 includes the Notification Center module. Check your notification preferences.',
            icon: 'bell',
            actionType: 'navigate',
            actionUrl: '/settings/notifications',
          },
        ],
      });
      console.log('  ✅ Sample in-app notifications created for admin');
    }
  }

  console.log('✅ Module 1.5 seed complete!');
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
