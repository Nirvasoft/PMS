import type { PrismaClient } from '@prisma/client';

interface InventoryServiceDeps { prisma: PrismaClient }

export function createInventoryService({ prisma }: InventoryServiceDeps) {
  // ── Stores ────────────────────────────
  async function listStores(companyId: string, propertyId?: string) {
    return prisma.store.findMany({
      where: { companyId, ...(propertyId && { propertyId }) },
      include: { property: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async function createStore(companyId: string, data: any) {
    return prisma.store.create({ data: { ...data, companyId } });
  }

  // ── Items ─────────────────────────────
  async function listItems(companyId: string, params: any) {
    const { search, category, lowStock, page = 1, limit = 20 } = params;
    const where: any = { companyId };
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { itemCode: { contains: search, mode: 'insensitive' } },
    ];
    if (category) where.category = category;

    const [data, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        include: {
          stockLevels: {
            include: { store: { select: { id: true, name: true } } },
          },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    // Add computed fields
    const enriched = data.map((item) => {
      const totalOnHand = item.stockLevels.reduce((s, sl) => s + Number(sl.qtyOnHand), 0);
      const isLowStock = totalOnHand <= Number(item.reorderPoint);
      return { ...item, totalOnHand, isLowStock };
    });

    let result = enriched;
    if (lowStock === 'true') result = enriched.filter((i) => i.isLowStock);

    return {
      data: result,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async function getItemById(companyId: string, id: string) {
    return prisma.inventoryItem.findFirst({
      where: { id, companyId },
      include: {
        stockLevels: { include: { store: { select: { id: true, name: true } } } },
      },
    });
  }

  async function createItem(companyId: string, data: any) {
    return prisma.inventoryItem.create({ data: { ...data, companyId } });
  }

  async function updateItem(companyId: string, id: string, data: any) {
    return prisma.inventoryItem.update({ where: { id }, data });
  }

  // ── Stock Levels ──────────────────────
  async function getStockLevels(companyId: string, params: any) {
    const { storeId, itemId, lowStock } = params;
    const where: any = { companyId };
    if (storeId) where.storeId = storeId;
    if (itemId) where.itemId = itemId;

    const data = await prisma.stockLevel.findMany({
      where,
      include: {
        item: { select: { id: true, itemCode: true, name: true, unitOfMeasure: true, unitCost: true, reorderPoint: true, maxStock: true } },
        store: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const enriched = data.map((sl) => ({
      ...sl,
      isLowStock: Number(sl.qtyOnHand) <= Number(sl.item.reorderPoint),
    }));

    if (lowStock === 'true') return enriched.filter((sl) => sl.isLowStock);
    return enriched;
  }

  // ── Stock Movements ───────────────────
  async function receiveStock(companyId: string, userId: string, data: any) {
    const { itemId, storeId, quantity, unitCost, poId, notes } = data;
    const item = await prisma.inventoryItem.findFirstOrThrow({ where: { id: itemId, companyId } });

    return prisma.$transaction(async (tx) => {
      // Upsert stock level
      const existing = await tx.stockLevel.findFirst({ where: { itemId, storeId } });
      if (existing) {
        const newOnHand = Number(existing.qtyOnHand) + quantity;
        await tx.stockLevel.update({
          where: { id: existing.id },
          data: { qtyOnHand: newOnHand, qtyAvailable: newOnHand - Number(existing.qtyReserved) },
        });
      } else {
        await tx.stockLevel.create({
          data: { companyId, itemId, storeId, qtyOnHand: quantity, qtyAvailable: quantity },
        });
      }

      // Weighted average cost update
      if (unitCost !== undefined && unitCost > 0) {
        const currentQty = Number(existing?.qtyOnHand ?? 0);
        const currentCost = Number(item.unitCost);
        const newUnitCost = (currentCost * currentQty + unitCost * quantity) / (currentQty + quantity);
        await tx.inventoryItem.update({ where: { id: itemId }, data: { unitCost: newUnitCost } });
      }

      // Record movement
      return tx.stockMovement.create({
        data: {
          companyId, itemId, storeId,
          movementType: 'receipt', quantity,
          unitCost: unitCost ?? Number(item.unitCost),
          totalCost: (unitCost ?? Number(item.unitCost)) * quantity,
          referenceType: poId ? 'po' : null,
          referenceId: poId ?? null,
          notes, performedById: userId,
        },
      });
    });
  }

  async function issueStock(companyId: string, userId: string, data: any) {
    const { itemId, storeId, quantity, workOrderId, notes } = data;

    const stockLevel = await prisma.stockLevel.findFirst({ where: { itemId, storeId, companyId } });
    if (!stockLevel || Number(stockLevel.qtyAvailable) < quantity) {
      throw Object.assign(new Error(`Insufficient stock. Available: ${stockLevel?.qtyAvailable ?? 0}`), { status: 400 });
    }

    const item = await prisma.inventoryItem.findFirstOrThrow({ where: { id: itemId } });
    const totalCost = quantity * Number(item.unitCost);

    const movement = await prisma.$transaction(async (tx) => {
      const newOnHand = Number(stockLevel.qtyOnHand) - quantity;
      await tx.stockLevel.update({
        where: { id: stockLevel.id },
        data: { qtyOnHand: newOnHand, qtyAvailable: newOnHand - Number(stockLevel.qtyReserved) },
      });

      // Gap 3: Update WO materialsCost and totalCost if issuing to a work order
      if (workOrderId) {
        const wo = await tx.workOrder.findUnique({ where: { id: workOrderId } });
        if (wo) {
          await tx.workOrder.update({
            where: { id: workOrderId },
            data: {
              materialsCost: Number(wo.materialsCost) + totalCost,
              totalCost: Number(wo.totalCost) + totalCost,
            },
          });
        }
      }

      return tx.stockMovement.create({
        data: {
          companyId, itemId, storeId,
          movementType: 'issue', quantity: -quantity,
          unitCost: Number(item.unitCost), totalCost,
          referenceType: workOrderId ? 'work_order' : null,
          referenceId: workOrderId ?? null,
          notes, performedById: userId,
        },
      });
    });

    // Gap 2: Check reorder threshold after issue
    await checkAndCreateReorderRequest(itemId, storeId, companyId).catch(() => {});

    return movement;
  }

  async function transferStock(companyId: string, userId: string, data: any) {
    const { itemId, fromStoreId, toStoreId, quantity, notes } = data;

    const fromLevel = await prisma.stockLevel.findFirst({ where: { itemId, storeId: fromStoreId, companyId } });
    if (!fromLevel || Number(fromLevel.qtyAvailable) < quantity) {
      throw Object.assign(new Error(`Insufficient stock in source store`), { status: 400 });
    }

    return prisma.$transaction(async (tx) => {
      // Deduct from source
      const newFromOnHand = Number(fromLevel.qtyOnHand) - quantity;
      await tx.stockLevel.update({
        where: { id: fromLevel.id },
        data: { qtyOnHand: newFromOnHand, qtyAvailable: newFromOnHand - Number(fromLevel.qtyReserved) },
      });

      // Add to destination (upsert)
      const toLevel = await tx.stockLevel.findFirst({ where: { itemId, storeId: toStoreId } });
      if (toLevel) {
        const newToOnHand = Number(toLevel.qtyOnHand) + quantity;
        await tx.stockLevel.update({
          where: { id: toLevel.id },
          data: { qtyOnHand: newToOnHand, qtyAvailable: newToOnHand - Number(toLevel.qtyReserved) },
        });
      } else {
        await tx.stockLevel.create({
          data: { companyId, itemId, storeId: toStoreId, qtyOnHand: quantity, qtyAvailable: quantity },
        });
      }

      // Two movements
      await tx.stockMovement.create({
        data: {
          companyId, itemId, storeId: fromStoreId,
          movementType: 'transfer_out', quantity: -quantity,
          fromStoreId, toStoreId, notes, performedById: userId,
        },
      });
      return tx.stockMovement.create({
        data: {
          companyId, itemId, storeId: toStoreId,
          movementType: 'transfer_in', quantity,
          fromStoreId, toStoreId, notes, performedById: userId,
        },
      });
    });
  }

  async function adjustStock(companyId: string, userId: string, data: any) {
    const { itemId, storeId, adjustedQty, reason } = data;

    const stockLevel = await prisma.stockLevel.findFirst({ where: { itemId, storeId, companyId } });
    const currentQty = Number(stockLevel?.qtyOnHand ?? 0);
    const difference = adjustedQty - currentQty;

    return prisma.$transaction(async (tx) => {
      if (stockLevel) {
        await tx.stockLevel.update({
          where: { id: stockLevel.id },
          data: {
            qtyOnHand: adjustedQty,
            qtyAvailable: adjustedQty - Number(stockLevel.qtyReserved),
            lastCountedAt: new Date(),
          },
        });
      } else {
        await tx.stockLevel.create({
          data: { companyId, itemId, storeId, qtyOnHand: adjustedQty, qtyAvailable: adjustedQty, lastCountedAt: new Date() },
        });
      }

      return tx.stockMovement.create({
        data: {
          companyId, itemId, storeId,
          movementType: 'adjustment', quantity: difference,
          notes: reason, performedById: userId,
          referenceType: 'adjustment',
        },
      });
    });
  }

  async function listMovements(companyId: string, params: any) {
    const { itemId, storeId, movementType, page = 1, limit = 50 } = params;
    const where: any = { companyId };
    if (itemId) where.itemId = itemId;
    if (storeId) where.storeId = storeId;
    if (movementType) where.movementType = movementType;

    const [data, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          item: { select: { id: true, itemCode: true, name: true, unitOfMeasure: true } },
          store: { select: { id: true, name: true } },
          performedBy: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ── Stats ──────────────────────────────
  async function getStats(companyId: string) {
    const [totalItems, totalStores] = await Promise.all([
      prisma.inventoryItem.count({ where: { companyId, isActive: true } }),
      prisma.store.count({ where: { companyId, isActive: true } }),
    ]);

    const stockLevels = await prisma.stockLevel.findMany({
      where: { companyId },
      include: { item: { select: { unitCost: true, reorderPoint: true } } },
    });

    const totalValue = stockLevels.reduce((sum, sl) => sum + Number(sl.qtyOnHand) * Number(sl.item.unitCost), 0);
    const lowStockCount = stockLevels.filter((sl) => Number(sl.qtyOnHand) <= Number(sl.item.reorderPoint) && Number(sl.qtyOnHand) > 0).length;
    const outOfStockCount = stockLevels.filter((sl) => Number(sl.qtyOnHand) <= 0).length;

    const recentMovements = await prisma.stockMovement.count({
      where: { companyId, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    });

    return { totalItems, totalStores, totalValue, lowStockCount, outOfStockCount, recentMovements };
  }

  // ── Auto-reorder check (Gap 2) ──────────
  async function checkAndCreateReorderRequest(itemId: string, storeId: string, companyId: string) {
    const item = await prisma.inventoryItem.findFirstOrThrow({ where: { id: itemId } });
    const stock = await prisma.stockLevel.findFirst({ where: { itemId, storeId } });
    if (!stock) return;

    if (Number(stock.qtyOnHand) <= Number(item.reorderPoint)) {
      // Check no pending PR already exists for this item
      const existingPrs = await prisma.purchaseRequisition.findMany({
        where: { companyId, status: { notIn: ['rejected', 'ordered'] } },
      });
      const hasPendingPr = existingPrs.some((pr: any) => {
        const items = (pr.items as any[]) || [];
        return items.some((i: any) => i.itemId === itemId);
      });

      if (!hasPendingPr) {
        const store = await prisma.store.findUnique({ where: { id: storeId } });
        const year = new Date().getFullYear();
        const lastPr = await prisma.purchaseRequisition.findFirst({
          where: { companyId, prNumber: { startsWith: `PR-${year}` } },
          orderBy: { prNumber: 'desc' },
        });
        const seq = lastPr ? parseInt(lastPr.prNumber.split('-')[2]) + 1 : 1;
        const prNumber = `PR-${year}-${String(seq).padStart(5, '0')}`;

        await prisma.purchaseRequisition.create({
          data: {
            companyId,
            propertyId: store!.propertyId,
            prNumber,
            status: 'draft',
            items: [{ itemId, itemName: item.name, qty: Number(item.reorderQty), unitCost: Number(item.unitCost) }],
            totalAmount: Number(item.reorderQty) * Number(item.unitCost),
            requestedById: '00000000-0000-0000-0000-000000000000', // system
            notes: `Auto-generated: stock fell below reorder point (${stock.qtyOnHand} ≤ ${item.reorderPoint})`,
          },
        });

        // Send notification (best-effort)
        try {
          const { notificationService } = await import('../notifications/services/notification.service');
          const admins = await prisma.user.findMany({
            where: { companyId, isActive: true, userRoles: { some: { role: { name: { in: ['Admin', 'Super Admin', 'Property Manager'] } } } } },
            select: { id: true },
          });
          if (admins.length > 0) {
            await notificationService.send({
              templateCode: 'stock_reorder_required',
              companyId,
              recipientIds: admins.map((a: any) => a.id),
              channels: ['in_app'],
              variables: { itemName: item.name, currentStock: Number(stock.qtyOnHand), reorderPoint: Number(item.reorderPoint) },
              entityType: 'maintenance_ticket',
              entityId: itemId,
            });
          }
        } catch { /* notification optional */ }
      }
    }
  }

  // ── Purchase Requisitions (Gap 1) ──────
  async function listPurchaseRequisitions(companyId: string, params: any) {
    const { status, page = 1, limit = 20 } = params;
    const where: any = { companyId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.purchaseRequisition.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          requestedBy: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          approvedBy: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.purchaseRequisition.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async function submitPurchaseRequisition(companyId: string, id: string) {
    const pr = await prisma.purchaseRequisition.findFirst({ where: { id, companyId } });
    if (!pr) throw Object.assign(new Error('PR not found'), { status: 404 });
    if (pr.status !== 'draft') throw Object.assign(new Error('Can only submit draft PRs'), { status: 400 });
    return prisma.purchaseRequisition.update({ where: { id }, data: { status: 'submitted' } });
  }

  async function approvePurchaseRequisition(companyId: string, id: string, userId: string) {
    const pr = await prisma.purchaseRequisition.findFirst({ where: { id, companyId } });
    if (!pr) throw Object.assign(new Error('PR not found'), { status: 404 });
    if (pr.status !== 'submitted') throw Object.assign(new Error('Can only approve submitted PRs'), { status: 400 });
    return prisma.purchaseRequisition.update({
      where: { id }, data: { status: 'approved', approvedById: userId },
    });
  }

  async function rejectPurchaseRequisition(companyId: string, id: string, userId: string) {
    const pr = await prisma.purchaseRequisition.findFirst({ where: { id, companyId } });
    if (!pr) throw Object.assign(new Error('PR not found'), { status: 404 });
    if (pr.status !== 'submitted') throw Object.assign(new Error('Can only reject submitted PRs'), { status: 400 });
    return prisma.purchaseRequisition.update({
      where: { id }, data: { status: 'rejected', approvedById: userId },
    });
  }

  return {
    listStores, createStore,
    listItems, getItemById, createItem, updateItem,
    getStockLevels,
    receiveStock, issueStock, transferStock, adjustStock,
    listMovements,
    getStats,
    listPurchaseRequisitions, submitPurchaseRequisition, approvePurchaseRequisition, rejectPurchaseRequisition,
  };
}
