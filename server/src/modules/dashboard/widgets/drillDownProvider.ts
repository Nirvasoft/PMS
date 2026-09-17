/**
 * Drill-down Data Providers — returns detailed rows for dashboard widget clicks.
 * Each provider accepts a "drillKey" (e.g. clicked bar, pie slice, KPI breakdown key)
 * and returns a table of detailed records.
 */
import { prisma } from '../../../common/database';
import type { Prisma } from '@prisma/client';

interface DrillDownParams {
  companyId: string;
  userId?: string;
  propertyId?: string;
  drillKey?: string;     // clicked segment: pie slice name, bar label, breakdown key
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface DrillDownResult {
  title: string;
  columns: { key: string; label: string; link?: string }[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  navigateTo?: string;   // optional: page to link to
}

const DEFAULT_PAGE_SIZE = 10;

/** Normalizes page/limit query params into a Prisma skip/take pair, capped to sane bounds. */
function paginate(params: DrillDownParams): { skip: number; take: number; page: number } {
  const take = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : DEFAULT_PAGE_SIZE;
  const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
  return { skip: (page - 1) * take, take, page };
}

// ──────────────────────────────────────────────
// DRILL-DOWN PROVIDERS
// ──────────────────────────────────────────────

/** Fetches a page of units matching `where`, ordered by property then unit number. */
async function paginatedUnits<S extends Prisma.UnitSelect>(
  where: Prisma.UnitWhereInput,
  select: S,
  pag: { skip: number; take: number },
): Promise<{ rows: Prisma.UnitGetPayload<{ select: S }>[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.unit.findMany({
      where,
      select,
      orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.unit.count({ where }),
  ]);
  return { rows, total };
}

async function drillOccupancyRate(params: DrillDownParams): Promise<DrillDownResult> {
  const key = params.drillKey || 'occupied'; // occupied | vacant | total
  const statusMap: Record<string, string[]> = {
    occupied: ['occupied'],
    vacant: ['available'],
    total: ['occupied', 'available', 'maintenance', 'reserved', 'not_for_rent'],
  };

  const statuses = statusMap[key] || statusMap.total;
  const pag = paginate(params);
  const where: Prisma.UnitWhereInput = {
    property: { companyId: params.companyId },
    ...(params.propertyId && { propertyId: params.propertyId }),
    status: { in: statuses },
  };
  const { rows: units, total } = await paginatedUnits(
    where,
    {
      id: true,
      unitNumber: true,
      status: true,
      floorNumber: true,
      areaSqft: true,
      property: { select: { id: true, name: true } },
      tower: { select: { name: true } },
    },
    pag,
  );

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
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/properties',
  };
}

async function drillRevenueMtd(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = { companyId: params.companyId, status: 'active' };
  const [leases, total] = await Promise.all([
    prisma.lease.findMany({
      where,
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
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.lease.count({ where }),
  ]);

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
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/leases',
  };
}

async function drillPendingTasks(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = {
    status: 'pending',
    ...(params.userId ? { assignedTo: params.userId } : {}),
  };
  const [tasks, total] = await Promise.all([
    prisma.workflowTask.findMany({
      where,
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
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.workflowTask.count({ where }),
  ]);

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
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/tasks',
  };
}

async function drillActiveWorkflows(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = { companyId: params.companyId, status: 'running' };
  const [instances, total] = await Promise.all([
    prisma.workflowInstance.findMany({
      where,
      select: {
        id: true,
        entityType: true,
        status: true,
        currentNodeIds: true,
        startedAt: true,
        definition: { select: { name: true } },
        initiator: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { startedAt: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.workflowInstance.count({ where }),
  ]);

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
      currentNode: i.currentNodeIds?.join(', ') || '—',
      initiator: i.initiator?.profile ? `${i.initiator.profile.firstName} ${i.initiator.profile.lastName}` : '—',
      started: new Date(i.startedAt).toISOString().split('T')[0],
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/workflows',
  };
}

async function drillUnitStatus(params: DrillDownParams): Promise<DrillDownResult> {
  const statusFilter = params.drillKey?.toLowerCase().replace(/ /g, '_');
  const baseWhere: Prisma.UnitWhereInput = {
    property: { companyId: params.companyId },
  };
  if (statusFilter && statusFilter !== 'all') {
    baseWhere.status = statusFilter;
  }

  const pag = paginate(params);
  const where: Prisma.UnitWhereInput = {
    ...baseWhere,
    ...(params.propertyId && { propertyId: params.propertyId }),
  };
  const { rows: units, total } = await paginatedUnits(
    where,
    {
      unitNumber: true,
      status: true,
      floorNumber: true,
      areaSqft: true,
      unitType: true,
      property: { select: { name: true } },
      tower: { select: { name: true } },
    },
    pag,
  );

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
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/properties',
  };
}

async function drillRevenueByProperty(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  // drillKey is the property name from the bar
  const propertyName = params.drillKey?.replace(/…$/, '') || '';

  const where = {
    companyId: params.companyId,
    status: 'active',
    ...(propertyName ? { property: { name: { startsWith: propertyName } } } : {}),
  };
  const [leases, total] = await Promise.all([
    prisma.lease.findMany({
      where,
      select: {
        leaseNumber: true,
        rentAmount: true,
        tenant: { select: { firstName: true, lastName: true, companyName: true } },
        property: { select: { name: true } },
        unit: { select: { unitNumber: true } },
        endDate: true,
      },
      orderBy: { rentAmount: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.lease.count({ where }),
  ]);

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
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/leases',
  };
}

async function drillDocumentsExpiring(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);

  const where = {
    companyId: params.companyId,
    expiryDate: { lte: thirtyDays, gte: new Date() },
    deletedAt: null,
  };
  const [docs, total] = await Promise.all([
    prisma.document.findMany({
      where,
      select: {
        name: true,
        category: true,
        expiryDate: true,
        status: true,
        uploader: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { expiryDate: 'asc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.document.count({ where }),
  ]);

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
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
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
  const pag = paginate(params);
  const ninetyDays = new Date();
  ninetyDays.setDate(ninetyDays.getDate() + 90);

  const where = {
    companyId: params.companyId,
    status: 'active',
    endDate: { lte: ninetyDays, gte: new Date() },
  };
  const [leases, total] = await Promise.all([
    prisma.lease.findMany({
      where,
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
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.lease.count({ where }),
  ]);

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
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/leases',
  };
}

async function drillRecentActivity(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = { companyId: params.companyId };
  const [logs, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      select: {
        subject: true,
        body: true,
        channel: true,
        status: true,
        createdAt: true,
        recipient: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.notificationLog.count({ where }),
  ]);

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
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/notifications',
  };
}

async function drillOverdueInvoices(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const now = new Date();
  const where = {
    companyId: params.companyId,
    status: { in: ['issued', 'sent', 'partially_paid', 'overdue'] },
    dueDate: { lt: now },
  };
  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: {
        invoiceNumber: true,
        totalAmount: true,
        paidAmount: true,
        dueDate: true,
        invoiceDate: true,
        status: true,
        tenant: { select: { firstName: true, lastName: true, companyName: true } },
        property: { select: { name: true } },
        unit: { select: { unitNumber: true } },
      },
      orderBy: { dueDate: 'asc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    title: 'Overdue Invoices',
    columns: [
      { key: 'invoiceNumber', label: 'Invoice #' },
      { key: 'tenant', label: 'Tenant' },
      { key: 'property', label: 'Property' },
      { key: 'unit', label: 'Unit' },
      { key: 'total', label: 'Total' },
      { key: 'paid', label: 'Paid' },
      { key: 'outstanding', label: 'Outstanding' },
      { key: 'dueDate', label: 'Due Date' },
      { key: 'daysOverdue', label: 'Days Overdue' },
      { key: 'status', label: 'Status' },
    ],
    rows: invoices.map((inv) => {
      const total = inv.totalAmount?.toNumber() ?? 0;
      const paid = inv.paidAmount?.toNumber() ?? 0;
      return {
        invoiceNumber: inv.invoiceNumber,
        tenant: inv.tenant?.companyName || `${inv.tenant?.firstName || ''} ${inv.tenant?.lastName || ''}`.trim() || '—',
        property: inv.property?.name || '—',
        unit: inv.unit?.unitNumber || '—',
        total: `$${total.toLocaleString()}`,
        paid: `$${paid.toLocaleString()}`,
        outstanding: `$${(total - paid).toLocaleString()}`,
        dueDate: new Date(inv.dueDate).toISOString().split('T')[0],
        daysOverdue: String(Math.ceil((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000)),
        status: inv.status.replace(/_/g, ' '),
      };
    }),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/billing/invoices',
  };
}

async function drillMaintenanceTrend(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  // Show tickets from the last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const where = {
    companyId: params.companyId,
    createdAt: { gte: sixMonthsAgo },
  };
  const [tickets, total] = await Promise.all([
    prisma.maintenanceTicket.findMany({
      where,
      select: {
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        category: { select: { name: true } },
        property: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.maintenanceTicket.count({ where }),
  ]);

  return {
    title: 'Maintenance Trend — Last 6 Months',
    columns: [
      { key: 'ticketNumber', label: 'Ticket #' },
      { key: 'title', label: 'Title' },
      { key: 'category', label: 'Category' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'property', label: 'Property' },
      { key: 'created', label: 'Created' },
      { key: 'resolved', label: 'Resolved' },
    ],
    rows: tickets.map((t) => ({
      ticketNumber: t.ticketNumber,
      title: t.title || '—',
      category: t.category?.name || '—',
      priority: t.priority || '—',
      status: (t.status || '—').replace(/_/g, ' '),
      property: t.property?.name || '—',
      created: new Date(t.createdAt).toISOString().split('T')[0],
      resolved: t.resolvedAt ? new Date(t.resolvedAt).toISOString().split('T')[0] : '—',
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/maintenance/tickets',
  };
}

async function drillMaintenanceOpen(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where: Record<string, unknown> = {
    companyId: params.companyId,
    status: { in: ['open', 'assigned', 'in_progress'] },
  };

  const [tickets, total] = await Promise.all([
    prisma.maintenanceTicket.findMany({
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
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.maintenanceTicket.count({ where }),
  ]);

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
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/maintenance/tickets',
  };
}

async function drillTicketsByCategory(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const categoryName = params.drillKey; // drillKey is the category name from the pie slice
  const where: Record<string, unknown> = {
    companyId: params.companyId,
  };
  if (categoryName && categoryName !== 'all') {
    where.category = { name: { equals: categoryName, mode: 'insensitive' } };
  }

  const [tickets, total] = await Promise.all([
    prisma.maintenanceTicket.findMany({
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
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.maintenanceTicket.count({ where }),
  ]);

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
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/maintenance/tickets',
  };
}

async function drillMaintenanceSla(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = {
    companyId: params.companyId,
    slaResolveMet: false,
    status: { notIn: ['closed', 'cancelled'] },
  };
  const [tickets, total] = await Promise.all([
    prisma.maintenanceTicket.findMany({
      where,
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
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.maintenanceTicket.count({ where }),
  ]);

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
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/maintenance/tickets',
  };
}

// ──────────────────────────────────────────────
// CRM DRILL-DOWNS
// ──────────────────────────────────────────────

async function drillCrmActiveLeads(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = {
    companyId: params.companyId,
    stage: { in: ['new', 'contacted', 'viewing', 'negotiating', 'proposal_sent'] },
  };
  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      select: {
        leadNumber: true, firstName: true, lastName: true, companyName: true,
        email: true, stage: true, source: true, createdAt: true,
        property: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.lead.count({ where }),
  ]);

  return {
    title: 'Active Leads',
    columns: [
      { key: 'lead', label: 'Lead #' }, { key: 'name', label: 'Name' },
      { key: 'company', label: 'Company' }, { key: 'stage', label: 'Stage' },
      { key: 'source', label: 'Source' }, { key: 'property', label: 'Property' },
      { key: 'created', label: 'Created' },
    ],
    rows: leads.map((l) => ({
      lead: l.leadNumber || '—',
      name: `${l.firstName || ''} ${l.lastName || ''}`.trim() || '—',
      company: l.companyName || '—',
      stage: (l.stage || '—').replace(/_/g, ' '),
      source: l.source || '—',
      property: l.property?.name || '—',
      created: new Date(l.createdAt).toISOString().split('T')[0],
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/crm/leads',
  };
}

async function drillCrmPipeline(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const stageFilter = params.drillKey?.toLowerCase().replace(/ /g, '_');
  const where: Record<string, unknown> = { companyId: params.companyId };
  if (stageFilter && stageFilter !== 'all') where.stage = stageFilter;

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      select: {
        leadNumber: true, firstName: true, lastName: true, companyName: true,
        stage: true, source: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.lead.count({ where }),
  ]);

  return {
    title: `Lead Pipeline — ${params.drillKey || 'All Stages'}`,
    columns: [
      { key: 'lead', label: 'Lead #' }, { key: 'name', label: 'Name' },
      { key: 'company', label: 'Company' }, { key: 'stage', label: 'Stage' },
      { key: 'source', label: 'Source' }, { key: 'created', label: 'Created' },
    ],
    rows: leads.map((l) => ({
      lead: l.leadNumber || '—',
      name: `${l.firstName || ''} ${l.lastName || ''}`.trim() || '—',
      company: l.companyName || '—',
      stage: (l.stage || '—').replace(/_/g, ' '),
      source: l.source || '—',
      created: new Date(l.createdAt).toISOString().split('T')[0],
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/crm/leads',
  };
}

async function drillCrmConversion(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = { companyId: params.companyId, stage: 'lease_signed' };
  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      select: {
        leadNumber: true, firstName: true, lastName: true, companyName: true,
        source: true, createdAt: true, updatedAt: true, convertedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.lead.count({ where }),
  ]);

  return {
    title: 'Converted Leads (Won)',
    columns: [
      { key: 'lead', label: 'Lead #' }, { key: 'name', label: 'Name' },
      { key: 'company', label: 'Company' }, { key: 'source', label: 'Source' },
      { key: 'created', label: 'Created' }, { key: 'won', label: 'Won Date' },
    ],
    rows: leads.map((l) => ({
      lead: l.leadNumber || '—',
      name: `${l.firstName || ''} ${l.lastName || ''}`.trim() || '—',
      company: l.companyName || '—',
      source: l.source || '—',
      created: new Date(l.createdAt).toISOString().split('T')[0],
      won: new Date(l.convertedAt || l.updatedAt).toISOString().split('T')[0],
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/crm/leads',
  };
}

// ──────────────────────────────────────────────
// FACILITY BOOKING DRILL-DOWNS
// ──────────────────────────────────────────────

async function drillFacilityBookingsToday(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const where = {
    companyId: params.companyId,
    bookingDate: { gte: today, lt: tomorrow },
    status: { notIn: ['cancelled'] },
  };
  const [bookings, total] = await Promise.all([
    prisma.facilityBooking.findMany({
      where,
      select: {
        facility: { select: { name: true } },
        startTime: true, endTime: true, paxCount: true, status: true, purpose: true,
        unit: { select: { unitNumber: true } },
      },
      orderBy: { startTime: 'asc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.facilityBooking.count({ where }),
  ]);

  return {
    title: "Today's Facility Bookings",
    columns: [
      { key: 'facility', label: 'Facility' }, { key: 'time', label: 'Time' },
      { key: 'unit', label: 'Unit' }, { key: 'pax', label: 'Pax' },
      { key: 'purpose', label: 'Purpose' }, { key: 'status', label: 'Status' },
    ],
    rows: bookings.map((b) => ({
      facility: b.facility?.name || '—',
      time: `${b.startTime} - ${b.endTime}`,
      unit: b.unit?.unitNumber || '—',
      pax: String(b.paxCount),
      purpose: b.purpose || '—',
      status: b.status.replace(/_/g, ' '),
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/facility-bookings',
  };
}

async function drillFacilityUtilization(params: DrillDownParams): Promise<DrillDownResult> {
  return drillFacilityBookingsToday(params); // reuse for now
}

// ──────────────────────────────────────────────
// PARKING DRILL-DOWNS
// ──────────────────────────────────────────────

async function drillParkingOccupancy(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const statusFilter = params.drillKey?.toLowerCase().replace(/ /g, '_');
  const where: Record<string, unknown> = { companyId: params.companyId };
  if (statusFilter && statusFilter !== 'all') where.status = statusFilter;

  const [slots, total] = await Promise.all([
    prisma.parkingSlot.findMany({
      where,
      select: {
        slotNumber: true, slotType: true, status: true, monthlyRate: true,
        zone: { select: { name: true } },
      },
      orderBy: { slotNumber: 'asc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.parkingSlot.count({ where }),
  ]);

  return {
    title: `Parking Slots — ${params.drillKey || 'All'}`,
    columns: [
      { key: 'slot', label: 'Slot #' }, { key: 'zone', label: 'Zone' },
      { key: 'type', label: 'Type' }, { key: 'rate', label: 'Monthly Rate' },
      { key: 'status', label: 'Status' },
    ],
    rows: slots.map((s) => ({
      slot: s.slotNumber,
      zone: s.zone?.name || '—',
      type: s.slotType.replace(/_/g, ' '),
      rate: s.monthlyRate ? `$${s.monthlyRate.toNumber().toLocaleString()}` : '—',
      status: s.status.replace(/_/g, ' '),
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/parking',
  };
}

async function drillParkingRevenue(params: DrillDownParams): Promise<DrillDownResult> {
  return drillParkingOccupancy({ ...params, drillKey: 'occupied' });
}

// ──────────────────────────────────────────────
// SECURITY DRILL-DOWNS
// ──────────────────────────────────────────────

async function drillSecurityIncidents(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = {
    companyId: params.companyId,
    status: { in: ['open', 'investigating'] },
  };
  const [incidents, total] = await Promise.all([
    prisma.securityIncident.findMany({
      where,
      select: {
        incidentNumber: true, title: true, incidentType: true, severity: true,
        status: true, incidentAt: true, locationDetail: true,
        property: { select: { name: true } },
      },
      orderBy: { incidentAt: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.securityIncident.count({ where }),
  ]);

  return {
    title: 'Open Security Incidents',
    columns: [
      { key: 'number', label: 'Incident #' }, { key: 'title', label: 'Title' },
      { key: 'type', label: 'Type' }, { key: 'severity', label: 'Severity' },
      { key: 'property', label: 'Property' }, { key: 'location', label: 'Location' },
      { key: 'date', label: 'Date' }, { key: 'status', label: 'Status' },
    ],
    rows: incidents.map((i) => ({
      number: i.incidentNumber,
      title: i.title,
      type: i.incidentType.replace(/_/g, ' '),
      severity: i.severity,
      property: i.property?.name || '—',
      location: i.locationDetail || '—',
      date: new Date(i.incidentAt).toISOString().split('T')[0],
      status: i.status.replace(/_/g, ' '),
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/security/incidents',
  };
}

async function drillSecurityTrend(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const where = { companyId: params.companyId, incidentAt: { gte: sixMonthsAgo } };
  const [incidents, total] = await Promise.all([
    prisma.securityIncident.findMany({
      where,
      select: {
        incidentNumber: true, title: true, incidentType: true, severity: true,
        status: true, incidentAt: true,
      },
      orderBy: { incidentAt: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.securityIncident.count({ where }),
  ]);

  return {
    title: 'Incidents — Last 6 Months',
    columns: [
      { key: 'number', label: 'Incident #' }, { key: 'title', label: 'Title' },
      { key: 'type', label: 'Type' }, { key: 'severity', label: 'Severity' },
      { key: 'date', label: 'Date' }, { key: 'status', label: 'Status' },
    ],
    rows: incidents.map((i) => ({
      number: i.incidentNumber,
      title: i.title,
      type: i.incidentType.replace(/_/g, ' '),
      severity: i.severity,
      date: new Date(i.incidentAt).toISOString().split('T')[0],
      status: i.status.replace(/_/g, ' '),
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/security/incidents',
  };
}

// ──────────────────────────────────────────────
// VISITOR DRILL-DOWNS
// ──────────────────────────────────────────────

async function drillVisitorsToday(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const where = {
    companyId: params.companyId,
    checkedInAt: { gte: today, lt: tomorrow },
  };
  const [visitors, total] = await Promise.all([
    prisma.visitor.findMany({
      where,
      select: {
        visitorName: true, visitorCompany: true, visitPurpose: true,
        checkedInAt: true, checkedOutAt: true, status: true,
        hostUnit: { select: { unitNumber: true } },
      },
      orderBy: { checkedInAt: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.visitor.count({ where }),
  ]);

  return {
    title: "Today's Visitors",
    columns: [
      { key: 'name', label: 'Visitor' }, { key: 'company', label: 'Company' },
      { key: 'unit', label: 'Host Unit' }, { key: 'purpose', label: 'Purpose' },
      { key: 'checkIn', label: 'Check In' }, { key: 'checkOut', label: 'Check Out' },
      { key: 'status', label: 'Status' },
    ],
    rows: visitors.map((v) => ({
      name: v.visitorName,
      company: v.visitorCompany || '—',
      unit: v.hostUnit?.unitNumber || '—',
      purpose: v.visitPurpose || '—',
      checkIn: v.checkedInAt ? new Date(v.checkedInAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—',
      checkOut: v.checkedOutAt ? new Date(v.checkedOutAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—',
      status: v.status.replace(/_/g, ' '),
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/visitors',
  };
}

async function drillVisitorsTrend(params: DrillDownParams): Promise<DrillDownResult> {
  return drillVisitorsToday(params); // reuse today's view
}

// ──────────────────────────────────────────────
// HOUSEKEEPING DRILL-DOWNS
// ──────────────────────────────────────────────

async function drillCleaningSchedules(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = { companyId: params.companyId, status: 'active' };
  const [schedules, total] = await Promise.all([
    prisma.cleaningSchedule.findMany({
      where,
      select: {
        name: true, frequencyType: true, scheduledTime: true, cleaningType: true,
        staffCount: true, status: true,
        zone: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.cleaningSchedule.count({ where }),
  ]);

  return {
    title: 'Active Cleaning Schedules',
    columns: [
      { key: 'name', label: 'Schedule' }, { key: 'zone', label: 'Zone' },
      { key: 'type', label: 'Type' }, { key: 'frequency', label: 'Frequency' },
      { key: 'time', label: 'Time' }, { key: 'staff', label: 'Staff' },
    ],
    rows: schedules.map((s) => ({
      name: s.name,
      zone: s.zone?.name || '—',
      type: (s.cleaningType || '—').replace(/_/g, ' '),
      frequency: s.frequencyType.replace(/_/g, ' '),
      time: s.scheduledTime || '—',
      staff: String(s.staffCount),
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/housekeeping',
  };
}

// ──────────────────────────────────────────────
// PREVENTIVE MAINTENANCE DRILL-DOWNS
// ──────────────────────────────────────────────

async function drillPmUpcoming(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const sevenDays = new Date();
  sevenDays.setDate(sevenDays.getDate() + 7);

  const where = {
    companyId: params.companyId,
    status: 'scheduled',
    dueDate: { lte: sevenDays, gte: new Date() },
  };
  const [workOrders, total] = await Promise.all([
    prisma.pmWorkOrder.findMany({
      where,
      select: {
        dueDate: true, status: true,
        schedule: { select: { name: true, property: { select: { name: true } } } },
      },
      orderBy: { dueDate: 'asc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.pmWorkOrder.count({ where }),
  ]);

  return {
    title: 'PM Work Orders Due (7 Days)',
    columns: [
      { key: 'schedule', label: 'Schedule' }, { key: 'property', label: 'Property' },
      { key: 'dueDate', label: 'Due Date' }, { key: 'status', label: 'Status' },
    ],
    rows: workOrders.map((wo) => ({
      schedule: wo.schedule?.name || '—',
      property: wo.schedule?.property?.name || '—',
      dueDate: new Date(wo.dueDate).toISOString().split('T')[0],
      status: wo.status.replace(/_/g, ' '),
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/preventive-maintenance',
  };
}

async function drillPmCompliance(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = { companyId: params.companyId, status: { in: ['overdue', 'completed'] } };
  const [workOrders, total] = await Promise.all([
    prisma.pmWorkOrder.findMany({
      where,
      select: {
        dueDate: true, status: true, completedAt: true,
        schedule: { select: { name: true } },
      },
      orderBy: { dueDate: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.pmWorkOrder.count({ where }),
  ]);

  return {
    title: 'PM Compliance Details',
    columns: [
      { key: 'schedule', label: 'Schedule' }, { key: 'dueDate', label: 'Due Date' },
      { key: 'completed', label: 'Completed' }, { key: 'status', label: 'Status' },
    ],
    rows: workOrders.map((wo) => ({
      schedule: wo.schedule?.name || '—',
      dueDate: new Date(wo.dueDate).toISOString().split('T')[0],
      completed: wo.completedAt ? new Date(wo.completedAt).toISOString().split('T')[0] : '—',
      status: wo.status.replace(/_/g, ' '),
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/preventive-maintenance',
  };
}

// ──────────────────────────────────────────────
// GL/BANKING DRILL-DOWNS
// ──────────────────────────────────────────────

async function drillGlNetIncome(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = { companyId: params.companyId, status: 'posted' };
  const [entries, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      select: {
        journalNumber: true, entryDate: true, description: true,
        totalDebit: true, totalCredit: true, status: true,
      },
      orderBy: { entryDate: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.journalEntry.count({ where }),
  ]);

  return {
    title: 'Posted Journal Entries',
    columns: [
      { key: 'entry', label: 'Entry #' }, { key: 'date', label: 'Date' },
      { key: 'description', label: 'Description' }, { key: 'debit', label: 'Debit' },
      { key: 'credit', label: 'Credit' },
    ],
    rows: entries.map((e) => ({
      entry: e.journalNumber || '—',
      date: new Date(e.entryDate).toISOString().split('T')[0],
      description: (e.description || '—').substring(0, 50),
      debit: `$${(e.totalDebit?.toNumber() ?? 0).toLocaleString()}`,
      credit: `$${(e.totalCredit?.toNumber() ?? 0).toLocaleString()}`,
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/gl/journal-entries',
  };
}

async function drillBankBalances(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = { companyId: params.companyId };
  const [accounts, total] = await Promise.all([
    prisma.bankAccount.findMany({
      where,
      select: { bankName: true, accountName: true, currency: true, accountNumber: true },
      orderBy: { bankName: 'asc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.bankAccount.count({ where }),
  ]);

  return {
    title: 'Bank Accounts',
    columns: [
      { key: 'bank', label: 'Bank' }, { key: 'account', label: 'Account Name' },
      { key: 'number', label: 'Account #' }, { key: 'currency', label: 'Currency' },
    ],
    rows: accounts.map((a) => ({
      bank: a.bankName,
      account: a.accountName,
      number: a.accountNumber ? `***${a.accountNumber.slice(-4)}` : '—',
      currency: a.currency,
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/banking',
  };
}

// ──────────────────────────────────────────────
// INVENTORY DRILL-DOWNS
// ──────────────────────────────────────────────

async function drillInventoryLowStock(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  // The low-stock condition (on-hand vs. reorder point) is computed across each item's stock
  // levels in JS, so pagination is applied to the filtered result rather than the raw query.
  const items = await prisma.inventoryItem.findMany({
    where: { companyId: params.companyId },
    include: {
      stockLevels: { select: { qtyOnHand: true } },
    },
  });

  const allLowItems = items
    .map((item) => {
      const totalOnHand = item.stockLevels.reduce((s: number, sl: { qtyOnHand: { toNumber(): number } | null }) => s + (sl.qtyOnHand?.toNumber() ?? 0), 0);
      return { ...item, totalOnHand };
    })
    .filter((item) => item.totalOnHand <= (item.reorderPoint?.toNumber() ?? 0));
  const lowItems = allLowItems.slice(pag.skip, pag.skip + pag.take);

  return {
    title: 'Low Stock Items',
    columns: [
      { key: 'code', label: 'Item Code' }, { key: 'name', label: 'Name' },
      { key: 'onHand', label: 'On Hand' }, { key: 'reorder', label: 'Reorder Point' },
      { key: 'unit', label: 'Unit' },
    ],
    rows: lowItems.map((i) => ({
      code: i.itemCode,
      name: i.name,
      onHand: String(i.totalOnHand),
      reorder: String(i.reorderPoint?.toNumber() ?? 0),
      unit: i.unitOfMeasure || '—',
    })),
    total: allLowItems.length,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(allLowItems.length / pag.take)),
    navigateTo: '/admin/inventory',
  };
}

async function drillInventoryMovement(params: DrillDownParams): Promise<DrillDownResult> {
  const pag = paginate(params);
  const where = { companyId: params.companyId };
  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      select: {
        movementType: true, quantity: true, totalCost: true, notes: true, createdAt: true,
        item: { select: { itemCode: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pag.skip,
      take: pag.take,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return {
    title: 'Stock Movements',
    columns: [
      { key: 'date', label: 'Date' }, { key: 'item', label: 'Item' },
      { key: 'type', label: 'Type' }, { key: 'qty', label: 'Quantity' },
      { key: 'cost', label: 'Total Cost' }, { key: 'notes', label: 'Notes' },
    ],
    rows: movements.map((m) => ({
      date: new Date(m.createdAt).toISOString().split('T')[0],
      item: `${m.item?.itemCode || '—'} — ${m.item?.name || ''}`,
      type: m.movementType.replace(/_/g, ' '),
      qty: String(m.quantity?.toNumber() ?? 0),
      cost: m.totalCost ? `$${m.totalCost.toNumber().toLocaleString()}` : '—',
      notes: (m.notes || '—').substring(0, 40),
    })),
    total,
    page: pag.page,
    pageSize: pag.take,
    totalPages: Math.max(1, Math.ceil(total / pag.take)),
    navigateTo: '/admin/inventory',
  };
}

// ──────────────────────────────────────────────
// DRILL-DOWN REGISTRY
// ──────────────────────────────────────────────

const DRILL_PROVIDERS: Record<string, (params: DrillDownParams) => Promise<DrillDownResult>> = {
  // Property
  occupancy_rate: drillOccupancyRate,
  vacancy_trend: drillVacancyTrend,
  unit_status_breakdown: drillUnitStatus,
  lease_expiring_soon: drillLeaseExpiring,
  // Finance
  revenue_mtd: drillRevenueMtd,
  revenue_ytd: drillRevenueMtd,
  collection_rate: drillCollectionRate,
  overdue_invoices: drillOverdueInvoices,
  revenue_by_property: drillRevenueByProperty,
  gl_net_income: drillGlNetIncome,
  bank_balance_summary: drillBankBalances,
  // Maintenance
  maintenance_open: drillMaintenanceOpen,
  maintenance_sla: drillMaintenanceSla,
  tickets_by_category: drillTicketsByCategory,
  maintenance_trend: drillMaintenanceTrend,
  // CRM
  crm_active_leads: drillCrmActiveLeads,
  crm_lead_pipeline: drillCrmPipeline,
  crm_conversion_rate: drillCrmConversion,
  // Facility
  facility_bookings_today: drillFacilityBookingsToday,
  facility_utilization: drillFacilityUtilization,
  // Parking
  parking_occupancy: drillParkingOccupancy,
  parking_revenue: drillParkingRevenue,
  // Security
  security_open_incidents: drillSecurityIncidents,
  security_incidents_trend: drillSecurityTrend,
  // Visitors
  visitors_today: drillVisitorsToday,
  visitors_trend: drillVisitorsTrend,
  // Housekeeping
  cleaning_completion_rate: drillCleaningSchedules,
  cleaning_open_tasks: drillCleaningSchedules,
  // Preventive Maintenance
  pm_upcoming: drillPmUpcoming,
  pm_compliance_rate: drillPmCompliance,
  // Inventory
  inventory_low_stock: drillInventoryLowStock,
  inventory_movement_trend: drillInventoryMovement,
  // Activity
  pending_tasks: drillPendingTasks,
  active_workflows: drillActiveWorkflows,
  documents_expiring: drillDocumentsExpiring,
  recent_activity: drillRecentActivity,
};

export async function getDrillDownData(code: string, params: DrillDownParams): Promise<DrillDownResult> {
  const provider = DRILL_PROVIDERS[code];
  if (!provider) {
    return { title: 'No Details', columns: [], rows: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
  }
  return provider(params);
}
