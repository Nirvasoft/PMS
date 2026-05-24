/**
 * Drill-down Data Providers — returns detailed rows for dashboard widget clicks.
 * Each provider accepts a "drillKey" (e.g. clicked bar, pie slice, KPI breakdown key)
 * and returns a table of detailed records.
 */
import { prisma } from '../../../common/database';

interface DrillDownParams {
  companyId: string;
  userId?: string;
  drillKey?: string;     // clicked segment: pie slice name, bar label, breakdown key
  dateFrom?: string;
  dateTo?: string;
}

export interface DrillDownResult {
  title: string;
  columns: { key: string; label: string; link?: string }[];
  rows: Record<string, unknown>[];
  total: number;
  navigateTo?: string;   // optional: page to link to
}

// ──────────────────────────────────────────────
// DRILL-DOWN PROVIDERS
// ──────────────────────────────────────────────

async function drillOccupancyRate(params: DrillDownParams): Promise<DrillDownResult> {
  const key = params.drillKey || 'occupied'; // occupied | vacant | total
  const statusMap: Record<string, string[]> = {
    occupied: ['occupied'],
    vacant: ['available'],
    total: ['occupied', 'available', 'maintenance', 'reserved', 'not_for_rent'],
  };

  const statuses = statusMap[key] || statusMap.total;
  const units = await prisma.unit.findMany({
    where: {
      property: { companyId: params.companyId },
      status: { in: statuses },
    },
    select: {
      id: true,
      unitNumber: true,
      status: true,
      floorNumber: true,
      areaSqft: true,
      property: { select: { id: true, name: true } },
      tower: { select: { name: true } },
    },
    orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
    take: 50,
  });

  return {
    title: `Units — ${key.charAt(0).toUpperCase() + key.slice(1)}`,
    columns: [
      { key: 'unitNumber', label: 'Unit' },
      { key: 'property', label: 'Property' },
      { key: 'tower', label: 'Tower' },
      { key: 'floor', label: 'Floor' },
      { key: 'area', label: 'Area (sqft)' },
      { key: 'status', label: 'Status' },
    ],
    rows: units.map((u) => ({
      unitNumber: u.unitNumber,
      property: u.property?.name || '—',
      tower: u.tower?.name || '—',
      floor: u.floorNumber ?? '—',
      area: u.areaSqft?.toString() || '—',
      status: u.status.replace(/_/g, ' '),
    })),
    total: units.length,
    navigateTo: '/admin/properties',
  };
}

async function drillRevenueMtd(params: DrillDownParams): Promise<DrillDownResult> {
  const leases = await prisma.lease.findMany({
    where: { companyId: params.companyId, status: 'active' },
    select: {
      id: true,
      leaseNumber: true,
      rentAmount: true,
      currency: true,
      billingCycle: true,
      startDate: true,
      endDate: true,
      tenant: { select: { firstName: true, lastName: true, companyName: true } },
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
    },
    orderBy: { rentAmount: 'desc' },
    take: 50,
  });

  return {
    title: 'Active Leases — Revenue Breakdown',
    columns: [
      { key: 'leaseNumber', label: 'Lease #' },
      { key: 'tenant', label: 'Tenant' },
      { key: 'property', label: 'Property' },
      { key: 'unit', label: 'Unit' },
      { key: 'rent', label: 'Rent' },
      { key: 'cycle', label: 'Cycle' },
      { key: 'endDate', label: 'Ends' },
    ],
    rows: leases.map((l) => ({
      leaseNumber: l.leaseNumber,
      tenant: l.tenant?.companyName || `${l.tenant?.firstName || ''} ${l.tenant?.lastName || ''}`.trim() || '—',
      property: l.property?.name || '—',
      unit: l.unit?.unitNumber || '—',
      rent: `$${(l.rentAmount?.toNumber() ?? 0).toLocaleString()}`,
      cycle: l.billingCycle,
      endDate: new Date(l.endDate).toISOString().split('T')[0],
    })),
    total: leases.length,
    navigateTo: '/admin/leases',
  };
}

async function drillPendingTasks(params: DrillDownParams): Promise<DrillDownResult> {
  const tasks = await prisma.workflowTask.findMany({
    where: {
      status: 'pending',
      ...(params.userId ? { assignedTo: params.userId } : {}),
    },
    select: {
      id: true,
      title: true,
      taskType: true,
      status: true,
      slaDueAt: true,
      slaBreached: true,
      createdAt: true,
      instance: {
        select: {
          entityType: true,
          definition: { select: { name: true } },
        },
      },
    },
    orderBy: { slaDueAt: 'asc' },
    take: 50,
  });

  return {
    title: 'My Pending Tasks',
    columns: [
      { key: 'title', label: 'Task' },
      { key: 'workflow', label: 'Workflow' },
      { key: 'type', label: 'Type' },
      { key: 'sla', label: 'SLA Due' },
      { key: 'breached', label: 'SLA' },
      { key: 'created', label: 'Created' },
    ],
    rows: tasks.map((t) => ({
      title: t.title || t.taskType,
      workflow: t.instance?.definition?.name || '—',
      type: t.taskType,
      sla: t.slaDueAt ? new Date(t.slaDueAt).toISOString().split('T')[0] : '—',
      breached: t.slaBreached ? '⚠️ Breached' : '✅ OK',
      created: new Date(t.createdAt).toISOString().split('T')[0],
    })),
    total: tasks.length,
    navigateTo: '/tasks',
  };
}

async function drillActiveWorkflows(params: DrillDownParams): Promise<DrillDownResult> {
  const instances = await prisma.workflowInstance.findMany({
    where: { companyId: params.companyId, status: 'running' },
    select: {
      id: true,
      entityType: true,
      status: true,
      currentNodeId: true,
      createdAt: true,
      definition: { select: { name: true } },
      initiator: { select: { profile: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return {
    title: 'Active Workflow Instances',
    columns: [
      { key: 'workflow', label: 'Workflow' },
      { key: 'entity', label: 'Entity Type' },
      { key: 'currentNode', label: 'Current Step' },
      { key: 'initiator', label: 'Started By' },
      { key: 'started', label: 'Started' },
    ],
    rows: instances.map((i) => ({
      workflow: i.definition?.name || '—',
      entity: i.entityType || '—',
      currentNode: i.currentNodeId || '—',
      initiator: i.initiator?.profile ? `${i.initiator.profile.firstName} ${i.initiator.profile.lastName}` : '—',
      started: new Date(i.createdAt).toISOString().split('T')[0],
    })),
    total: instances.length,
    navigateTo: '/admin/workflows',
  };
}

async function drillUnitStatus(params: DrillDownParams): Promise<DrillDownResult> {
  const statusFilter = params.drillKey?.toLowerCase().replace(/ /g, '_');
  const where: Record<string, unknown> = {
    property: { companyId: params.companyId },
  };
  if (statusFilter && statusFilter !== 'all') {
    where.status = statusFilter;
  }

  const units = await prisma.unit.findMany({
    where,
    select: {
      unitNumber: true,
      status: true,
      floorNumber: true,
      areaSqft: true,
      unitType: true,
      property: { select: { name: true } },
      tower: { select: { name: true } },
    },
    orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
    take: 50,
  });

  return {
    title: `Units — ${params.drillKey || 'All Statuses'}`,
    columns: [
      { key: 'unitNumber', label: 'Unit' },
      { key: 'property', label: 'Property' },
      { key: 'tower', label: 'Tower' },
      { key: 'floor', label: 'Floor' },
      { key: 'area', label: 'Area' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
    ],
    rows: units.map((u) => ({
      unitNumber: u.unitNumber,
      property: u.property?.name || '—',
      tower: u.tower?.name || '—',
      floor: u.floorNumber ?? '—',
      area: u.areaSqft ? `${u.areaSqft} sqft` : '—',
      type: (u.unitType || '—').replace(/_/g, ' '),
      status: u.status.replace(/_/g, ' '),
    })),
    total: units.length,
    navigateTo: '/admin/properties',
  };
}

async function drillRevenueByProperty(params: DrillDownParams): Promise<DrillDownResult> {
  // drillKey is the property name from the bar
  const propertyName = params.drillKey?.replace(/…$/, '') || '';

  const leases = await prisma.lease.findMany({
    where: {
      companyId: params.companyId,
      status: 'active',
      ...(propertyName ? { property: { name: { startsWith: propertyName } } } : {}),
    },
    select: {
      leaseNumber: true,
      rentAmount: true,
      tenant: { select: { firstName: true, lastName: true, companyName: true } },
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      endDate: true,
    },
    orderBy: { rentAmount: 'desc' },
    take: 50,
  });

  return {
    title: propertyName ? `Leases — ${params.drillKey}` : 'All Active Leases',
    columns: [
      { key: 'lease', label: 'Lease #' },
      { key: 'tenant', label: 'Tenant' },
      { key: 'property', label: 'Property' },
      { key: 'unit', label: 'Unit' },
      { key: 'rent', label: 'Rent' },
      { key: 'endDate', label: 'End Date' },
    ],
    rows: leases.map((l) => ({
      lease: l.leaseNumber,
      tenant: l.tenant?.companyName || `${l.tenant?.firstName || ''} ${l.tenant?.lastName || ''}`.trim() || '—',
      property: l.property?.name || '—',
      unit: l.unit?.unitNumber || '—',
      rent: `$${(l.rentAmount?.toNumber() ?? 0).toLocaleString()}`,
      endDate: new Date(l.endDate).toISOString().split('T')[0],
    })),
    total: leases.length,
    navigateTo: '/admin/leases',
  };
}

async function drillDocumentsExpiring(params: DrillDownParams): Promise<DrillDownResult> {
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);

  const docs = await prisma.document.findMany({
    where: {
      companyId: params.companyId,
      expiryDate: { lte: thirtyDays, gte: new Date() },
      deletedAt: null,
    },
    select: {
      name: true,
      category: true,
      expiryDate: true,
      status: true,
      uploader: { select: { profile: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { expiryDate: 'asc' },
    take: 50,
  });

  return {
    title: 'Documents Expiring Within 30 Days',
    columns: [
      { key: 'name', label: 'Document' },
      { key: 'category', label: 'Category' },
      { key: 'expiryDate', label: 'Expiry Date' },
      { key: 'daysLeft', label: 'Days Left' },
      { key: 'uploadedBy', label: 'Uploaded By' },
    ],
    rows: docs.map((d) => ({
      name: d.name,
      category: d.category || '—',
      expiryDate: d.expiryDate ? new Date(d.expiryDate).toISOString().split('T')[0] : '—',
      daysLeft: d.expiryDate ? String(Math.ceil((new Date(d.expiryDate).getTime() - Date.now()) / 86400000)) : '—',
      uploadedBy: d.uploader?.profile ? `${d.uploader.profile.firstName} ${d.uploader.profile.lastName}` : '—',
    })),
    total: docs.length,
    navigateTo: '/documents',
  };
}

async function drillCollectionRate(params: DrillDownParams): Promise<DrillDownResult> {
  return drillRevenueMtd(params);
}

async function drillVacancyTrend(params: DrillDownParams): Promise<DrillDownResult> {
  return drillOccupancyRate({ ...params, drillKey: 'vacant' });
}

async function drillLeaseExpiring(params: DrillDownParams): Promise<DrillDownResult> {
  const ninetyDays = new Date();
  ninetyDays.setDate(ninetyDays.getDate() + 90);

  const leases = await prisma.lease.findMany({
    where: {
      companyId: params.companyId,
      status: 'active',
      endDate: { lte: ninetyDays, gte: new Date() },
    },
    select: {
      leaseNumber: true,
      rentAmount: true,
      startDate: true,
      endDate: true,
      tenant: { select: { firstName: true, lastName: true, companyName: true } },
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
    },
    orderBy: { endDate: 'asc' },
    take: 50,
  });

  return {
    title: 'Leases Expiring Within 90 Days',
    columns: [
      { key: 'lease', label: 'Lease #' },
      { key: 'tenant', label: 'Tenant' },
      { key: 'property', label: 'Property' },
      { key: 'unit', label: 'Unit' },
      { key: 'rent', label: 'Monthly Rent' },
      { key: 'endDate', label: 'End Date' },
      { key: 'daysLeft', label: 'Days Left' },
    ],
    rows: leases.map((l) => ({
      lease: l.leaseNumber,
      tenant: l.tenant?.companyName || `${l.tenant?.firstName || ''} ${l.tenant?.lastName || ''}`.trim() || '—',
      property: l.property?.name || '—',
      unit: l.unit?.unitNumber || '—',
      rent: `$${(l.rentAmount?.toNumber() ?? 0).toLocaleString()}`,
      endDate: new Date(l.endDate).toISOString().split('T')[0],
      daysLeft: String(Math.ceil((new Date(l.endDate).getTime() - Date.now()) / 86400000)),
    })),
    total: leases.length,
    navigateTo: '/admin/leases',
  };
}

async function drillRecentActivity(params: DrillDownParams): Promise<DrillDownResult> {
  const logs = await prisma.notificationLog.findMany({
    where: { companyId: params.companyId },
    select: {
      subject: true,
      body: true,
      channel: true,
      status: true,
      createdAt: true,
      recipient: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return {
    title: 'Recent Activity Log',
    columns: [
      { key: 'subject', label: 'Subject' },
      { key: 'recipient', label: 'Recipient' },
      { key: 'channel', label: 'Channel' },
      { key: 'status', label: 'Status' },
      { key: 'time', label: 'Time' },
    ],
    rows: logs.map((l) => ({
      subject: l.subject || '—',
      recipient: l.recipient?.profile ? `${l.recipient.profile.firstName} ${l.recipient.profile.lastName}` : l.recipient?.email || '—',
      channel: l.channel,
      status: l.status,
      time: new Date(l.createdAt).toISOString().replace('T', ' ').slice(0, 16),
    })),
    total: logs.length,
    navigateTo: '/notifications',
  };
}

// Generic empty drill-down for modules not yet implemented
async function drillNotImplemented(label: string): Promise<DrillDownResult> {
  return {
    title: label,
    columns: [{ key: 'message', label: 'Info' }],
    rows: [{ message: 'This module is not yet implemented. Detailed data will be available when the module ships.' }],
    total: 0,
  };
}

async function drillMaintenanceOpen(params: DrillDownParams): Promise<DrillDownResult> {
  const where: Record<string, unknown> = {
    companyId: params.companyId,
    status: { in: ['open', 'assigned', 'in_progress'] },
  };

  const tickets = await prisma.maintenanceTicket.findMany({
    where,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      category: { select: { name: true } },
      priority: true,
      status: true,
      createdAt: true,
      slaResolveDueAt: true,
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      assignedTo: { select: { profile: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    take: 50,
  });

  return {
    title: 'Open Maintenance Tickets',
    columns: [
      { key: 'ticketNumber', label: 'Ticket #' },
      { key: 'title', label: 'Title' },
      { key: 'category', label: 'Category' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'property', label: 'Property' },
      { key: 'unit', label: 'Unit' },
      { key: 'technician', label: 'Assigned To' },
      { key: 'created', label: 'Created' },
      { key: 'slaDue', label: 'SLA Due' },
    ],
    rows: tickets.map((t) => ({
      ticketNumber: t.ticketNumber,
      title: t.title || '—',
      category: t.category?.name || '—',
      priority: t.priority || '—',
      status: (t.status || '—').replace(/_/g, ' '),
      property: t.property?.name || '—',
      unit: t.unit?.unitNumber || '—',
      technician: t.assignedTo?.profile
        ? `${t.assignedTo.profile.firstName} ${t.assignedTo.profile.lastName}`
        : 'Unassigned',
      created: new Date(t.createdAt).toISOString().split('T')[0],
      slaDue: t.slaResolveDueAt ? new Date(t.slaResolveDueAt).toISOString().split('T')[0] : '—',
    })),
    total: tickets.length,
    navigateTo: '/admin/maintenance/tickets',
  };
}

async function drillTicketsByCategory(params: DrillDownParams): Promise<DrillDownResult> {
  const categoryName = params.drillKey; // drillKey is the category name from the pie slice
  const where: Record<string, unknown> = {
    companyId: params.companyId,
  };
  if (categoryName && categoryName !== 'all') {
    where.category = { name: { equals: categoryName, mode: 'insensitive' } };
  }

  const tickets = await prisma.maintenanceTicket.findMany({
    where,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      category: { select: { name: true } },
      priority: true,
      status: true,
      createdAt: true,
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      assignedTo: { select: { profile: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return {
    title: `Tickets — ${params.drillKey || 'All Categories'}`,
    columns: [
      { key: 'ticketNumber', label: 'Ticket #' },
      { key: 'title', label: 'Title' },
      { key: 'category', label: 'Category' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'property', label: 'Property' },
      { key: 'unit', label: 'Unit' },
      { key: 'technician', label: 'Assigned To' },
      { key: 'created', label: 'Created' },
    ],
    rows: tickets.map((t) => ({
      ticketNumber: t.ticketNumber,
      title: t.title || '—',
      category: t.category?.name || '—',
      priority: t.priority || '—',
      status: (t.status || '—').replace(/_/g, ' '),
      property: t.property?.name || '—',
      unit: t.unit?.unitNumber || '—',
      technician: t.assignedTo?.profile
        ? `${t.assignedTo.profile.firstName} ${t.assignedTo.profile.lastName}`
        : 'Unassigned',
      created: new Date(t.createdAt).toISOString().split('T')[0],
    })),
    total: tickets.length,
    navigateTo: '/admin/maintenance/tickets',
  };
}

async function drillMaintenanceSla(params: DrillDownParams): Promise<DrillDownResult> {
  const tickets = await prisma.maintenanceTicket.findMany({
    where: {
      companyId: params.companyId,
      slaResolveMet: false,
      status: { notIn: ['closed', 'cancelled'] },
    },
    select: {
      ticketNumber: true,
      title: true,
      category: { select: { name: true } },
      priority: true,
      status: true,
      slaResolveDueAt: true,
      createdAt: true,
      property: { select: { name: true } },
      assignedTo: { select: { profile: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { slaResolveDueAt: 'asc' },
    take: 50,
  });

  return {
    title: 'SLA Breached Tickets',
    columns: [
      { key: 'ticketNumber', label: 'Ticket #' },
      { key: 'title', label: 'Title' },
      { key: 'category', label: 'Category' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'property', label: 'Property' },
      { key: 'technician', label: 'Assigned To' },
      { key: 'slaDue', label: 'SLA Deadline' },
    ],
    rows: tickets.map((t) => ({
      ticketNumber: t.ticketNumber,
      title: t.title || '—',
      category: t.category?.name || '—',
      priority: t.priority || '—',
      status: (t.status || '—').replace(/_/g, ' '),
      property: t.property?.name || '—',
      technician: t.assignedTo?.profile
        ? `${t.assignedTo.profile.firstName} ${t.assignedTo.profile.lastName}`
        : 'Unassigned',
      slaDue: t.slaResolveDueAt ? new Date(t.slaResolveDueAt).toISOString().split('T')[0] : '—',
    })),
    total: tickets.length,
    navigateTo: '/admin/maintenance/tickets',
  };
}

// ──────────────────────────────────────────────
// DRILL-DOWN REGISTRY
// ──────────────────────────────────────────────

const DRILL_PROVIDERS: Record<string, (params: DrillDownParams) => Promise<DrillDownResult>> = {
  occupancy_rate: drillOccupancyRate,
  revenue_mtd: drillRevenueMtd,
  revenue_ytd: drillRevenueMtd,
  collection_rate: drillCollectionRate,
  overdue_invoices: () => drillNotImplemented('Overdue Invoices'),
  maintenance_open: drillMaintenanceOpen,
  maintenance_sla: drillMaintenanceSla,
  pending_tasks: drillPendingTasks,
  active_workflows: drillActiveWorkflows,
  documents_expiring: drillDocumentsExpiring,
  vacancy_trend: drillVacancyTrend,
  maintenance_trend: () => drillNotImplemented('Maintenance Trend'),
  revenue_by_property: drillRevenueByProperty,
  unit_status_breakdown: drillUnitStatus,
  tickets_by_category: drillTicketsByCategory,
  lease_expiring_soon: drillLeaseExpiring,
  recent_activity: drillRecentActivity,
};

export async function getDrillDownData(code: string, params: DrillDownParams): Promise<DrillDownResult> {
  const provider = DRILL_PROVIDERS[code];
  if (!provider) {
    return { title: 'No Details', columns: [], rows: [], total: 0 };
  }
  return provider(params);
}
