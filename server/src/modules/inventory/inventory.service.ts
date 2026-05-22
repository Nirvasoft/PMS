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

    return prisma.$transaction(async (tx) => {
      const newOnHand = Number(stockLevel.qtyOnHand) - quantity;
      await tx.stockLevel.update({
        where: { id: stockLevel.id },
        data: { qtyOnHand: newOnHand, qtyAvailable: newOnHand - Number(stockLevel.qtyReserved) },
      });

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

  return {
    listStores, createStore,
    listItems, getItemById, createItem, updateItem,
    getStockLevels,
    receiveStock, issueStock, transferStock, adjustStock,
    listMovements,
    getStats,
  };
}
