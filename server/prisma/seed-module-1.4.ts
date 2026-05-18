import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('⚙️  Seeding Module 1.4 — Workflow Engine...\n');

  const company = await prisma.company.findFirst({ where: { name: 'ACME Property Group' } });
  if (!company) { console.error('❌ Company not found.'); process.exit(1); }

  const admin = await prisma.user.findFirst({ where: { email: 'admin@acmeproperty.com' } });
  if (!admin) { console.error('❌ Admin user not found.'); process.exit(1); }

  // ─── 1) Lease Approval Workflow ────────────
  const leaseGraph = {
    nodes: [
      { id: 'start', type: 'start' },
      { id: 'mgr_approval', type: 'approval', data: {
        name: 'Property Manager Approval',
        assignTo: 'role:admin',
        sla: { hours: 24, escalateTo: 'role:admin' },
        allowDelegate: true,
      }},
      { id: 'amount_check', type: 'condition', data: {
        expression: 'entity.rentAmount > 50000',
        trueEdge: 'cfo_approval',
        falseEdge: 'notify_approved',
      }},
      { id: 'cfo_approval', type: 'approval', data: {
        name: 'CFO Approval',
        assignTo: 'role:admin',
        sla: { hours: 48 },
      }},
      { id: 'notify_approved', type: 'notification', data: {
        template: 'lease_approved',
        channels: ['email', 'in_app'],
        recipients: ['entity.createdBy'],
      }},
      { id: 'end', type: 'end' },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'mgr_approval' },
      { id: 'e2', source: 'mgr_approval', target: 'amount_check' },
      { id: 'e3', source: 'amount_check', target: 'cfo_approval', label: 'Amount > 50,000' },
      { id: 'e4', source: 'amount_check', target: 'notify_approved', label: 'Amount ≤ 50,000' },
      { id: 'e5', source: 'cfo_approval', target: 'notify_approved' },
      { id: 'e6', source: 'notify_approved', target: 'end' },
    ],
  };

  const leaseWf = await prisma.workflowDefinition.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      companyId: company.id,
      name: 'Lease Approval Workflow',
      description: 'Multi-step lease approval with conditional CFO approval for high-value leases.',
      entityType: 'lease',
      graph: leaseGraph,
      settings: { slaEnabled: true },
      createdBy: admin.id,
      status: 'active',
      publishedAt: new Date(),
    },
    update: { graph: leaseGraph, name: 'Lease Approval Workflow' },
  });
  console.log(`✅ Lease workflow: ${leaseWf.name} (${leaseWf.status})`);

  // ─── 2) Maintenance Ticket Escalation ──────
  const maintenanceGraph = {
    nodes: [
      { id: 'start', type: 'start' },
      { id: 'supervisor_review', type: 'approval', data: {
        name: 'Supervisor Review',
        assignTo: 'role:admin',
        sla: { hours: 4 },
      }},
      { id: 'priority_check', type: 'condition', data: {
        expression: 'entity.priority == critical',
        trueEdge: 'manager_approval',
        falseEdge: 'notify_assigned',
      }},
      { id: 'manager_approval', type: 'approval', data: {
        name: 'Facilities Manager Approval',
        assignTo: 'role:admin',
        sla: { hours: 2 },
      }},
      { id: 'notify_assigned', type: 'notification', data: {
        template: 'ticket_assigned',
        channels: ['in_app'],
        recipients: ['entity.assignedTo'],
      }},
      { id: 'end', type: 'end' },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'supervisor_review' },
      { id: 'e2', source: 'supervisor_review', target: 'priority_check' },
      { id: 'e3', source: 'priority_check', target: 'manager_approval', label: 'Critical' },
      { id: 'e4', source: 'priority_check', target: 'notify_assigned', label: 'Non-critical' },
      { id: 'e5', source: 'manager_approval', target: 'notify_assigned' },
      { id: 'e6', source: 'notify_assigned', target: 'end' },
    ],
  };

  const maintenanceWf = await prisma.workflowDefinition.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      companyId: company.id,
      name: 'Maintenance Ticket Escalation',
      description: 'Routes maintenance tickets through supervisor review with escalation for critical items.',
      entityType: 'maintenance_ticket',
      graph: maintenanceGraph,
      settings: { slaEnabled: true },
      createdBy: admin.id,
      status: 'active',
      publishedAt: new Date(),
    },
    update: { graph: maintenanceGraph, name: 'Maintenance Ticket Escalation' },
  });
  console.log(`✅ Maintenance workflow: ${maintenanceWf.name} (${maintenanceWf.status})`);

  // ─── 3) Purchase Order Approval (Draft) ────
  const poGraph = {
    nodes: [
      { id: 'start', type: 'start' },
      { id: 'dept_head', type: 'approval', data: {
        name: 'Department Head Approval',
        assignTo: 'role:admin',
        sla: { hours: 12 },
      }},
      { id: 'end', type: 'end' },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'dept_head' },
      { id: 'e2', source: 'dept_head', target: 'end' },
    ],
  };

  const poWf = await prisma.workflowDefinition.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      companyId: company.id,
      name: 'Purchase Order Approval',
      description: 'Simple PO approval workflow — department head sign-off.',
      entityType: 'purchase_order',
      graph: poGraph,
      createdBy: admin.id,
      status: 'draft',
    },
    update: { graph: poGraph },
  });
  console.log(`✅ PO workflow: ${poWf.name} (${poWf.status})`);

  console.log('\n🎉 Module 1.4 seed complete!');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
