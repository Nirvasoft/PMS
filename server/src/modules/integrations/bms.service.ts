import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';

// ═════════════════════════════════════════
// BMS — Building Management System Service
// ═════════════════════════════════════════

const BMS_DEVICE_TYPES = ['hvac', 'elevator', 'fire_panel', 'power_meter', 'water_meter', 'lighting', 'access_control'] as const;
const BMS_PROTOCOLS = ['bacnet_ip', 'bacnet_mstp', 'modbus_tcp', 'lonworks'] as const;

class BmsService {

  // ── Devices ──

  async listDevices(companyId: string, filters: { propertyId?: string; deviceType?: string; isActive?: string }) {
    const where: any = { companyId };
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.deviceType) where.deviceType = filters.deviceType;
    if (filters.isActive !== undefined) where.isActive = filters.isActive === 'true';

    const devices = await prisma.bmsDevice.findMany({
      where,
      include: {
        property: { select: { id: true, name: true } },
        readings: {
          take: 5,
          orderBy: { readAt: 'desc' },
          select: { pointName: true, value: true, unit: true, quality: true, readAt: true },
        },
      },
      orderBy: [{ faultActive: 'desc' }, { deviceName: 'asc' }],
    });

    return devices.map(d => ({
      ...d,
      latestReadings: d.readings,
      readings: undefined, // Don't double-include
    }));
  }

  async getDevice(id: string, companyId: string) {
    const device = await prisma.bmsDevice.findFirst({
      where: { id, companyId },
      include: {
        property: { select: { id: true, name: true } },
        readings: {
          take: 10,
          orderBy: { readAt: 'desc' },
        },
      },
    });
    if (!device) throw AppError.notFound('BMS Device');
    return device;
  }

  async createDevice(companyId: string, data: any) {
    // Validate type and protocol
    if (!BMS_DEVICE_TYPES.includes(data.deviceType)) {
      throw AppError.validation(`Invalid device type. Must be one of: ${BMS_DEVICE_TYPES.join(', ')}`);
    }
    if (!BMS_PROTOCOLS.includes(data.protocol)) {
      throw AppError.validation(`Invalid protocol. Must be one of: ${BMS_PROTOCOLS.join(', ')}`);
    }

    return prisma.bmsDevice.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        protocol: data.protocol,
        ipAddress: data.ipAddress || null,
        port: data.port ? parseInt(data.port) : null,
        bacnetDeviceId: data.bacnetDeviceId ? parseInt(data.bacnetDeviceId) : null,
      },
      include: { property: { select: { id: true, name: true } } },
    });
  }

  async updateDevice(id: string, companyId: string, data: any) {
    const existing = await prisma.bmsDevice.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('BMS Device');

    return prisma.bmsDevice.update({
      where: { id },
      data: {
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        protocol: data.protocol,
        ipAddress: data.ipAddress,
        port: data.port ? parseInt(data.port) : undefined,
        bacnetDeviceId: data.bacnetDeviceId ? parseInt(data.bacnetDeviceId) : undefined,
        isActive: data.isActive,
      },
      include: { property: { select: { id: true, name: true } } },
    });
  }

  async deleteDevice(id: string, companyId: string) {
    const existing = await prisma.bmsDevice.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('BMS Device');
    await prisma.bmsReading.deleteMany({ where: { deviceId: id } });
    return prisma.bmsDevice.delete({ where: { id } });
  }

  // ── Readings ──

  async getReadings(deviceId: string, companyId: string, filters: { pointName?: string; from?: string; to?: string; limit?: string }) {
    const device = await prisma.bmsDevice.findFirst({ where: { id: deviceId, companyId } });
    if (!device) throw AppError.notFound('BMS Device');

    const where: any = { deviceId, companyId };
    if (filters.pointName) where.pointName = filters.pointName;
    if (filters.from || filters.to) {
      where.readAt = {};
      if (filters.from) where.readAt.gte = new Date(filters.from);
      if (filters.to) where.readAt.lte = new Date(filters.to);
    }

    return prisma.bmsReading.findMany({
      where,
      orderBy: { readAt: 'desc' },
      take: Math.min(parseInt(filters.limit || '100'), 500),
    });
  }

  // ── Faults ──

  async getFaults(deviceId: string, companyId: string) {
    const device = await prisma.bmsDevice.findFirst({
      where: { id: deviceId, companyId },
      select: {
        id: true, deviceName: true, deviceType: true, faultActive: true,
        faultMessage: true, lastSeenAt: true, isActive: true,
      },
    });
    if (!device) throw AppError.notFound('BMS Device');

    // Get readings with bad quality as historical faults
    const badReadings = await prisma.bmsReading.findMany({
      where: { deviceId, quality: { not: 'good' } },
      orderBy: { readAt: 'desc' },
      take: 50,
    });

    return {
      device,
      currentFault: device.faultActive ? { message: device.faultMessage, since: device.lastSeenAt } : null,
      historicalFaults: badReadings,
    };
  }

  // ── Poll (simulate) ──

  async pollDevice(id: string, companyId: string) {
    const device = await prisma.bmsDevice.findFirst({ where: { id, companyId } });
    if (!device) throw AppError.notFound('BMS Device');

    // Simulate polling — generate realistic readings based on device type
    const readings = this.generateReadings(device);
    const now = new Date();

    for (const r of readings) {
      await prisma.bmsReading.create({
        data: {
          companyId,
          deviceId: id,
          pointName: r.pointName,
          pointType: r.pointType,
          value: r.value,
          unit: r.unit,
          quality: 'good',
          readAt: now,
        },
      });
    }

    // Update device last seen
    await prisma.bmsDevice.update({
      where: { id },
      data: { lastSeenAt: now, faultActive: false, faultMessage: null },
    });

    logger.info(`BMS device ${device.deviceName} polled — ${readings.length} readings`, { deviceId: id });

    return {
      device: device.deviceName,
      readingsCount: readings.length,
      readings,
      polledAt: now,
    };
  }

  private generateReadings(device: any) {
    switch (device.deviceType) {
      case 'hvac':
        return [
          { pointName: 'Supply Air Temp', pointType: 'analog_input', value: +(16 + Math.random() * 4).toFixed(1), unit: 'degC' },
          { pointName: 'Return Air Temp', pointType: 'analog_input', value: +(22 + Math.random() * 4).toFixed(1), unit: 'degC' },
          { pointName: 'Fan Speed', pointType: 'analog_value', value: +(60 + Math.random() * 40).toFixed(0), unit: '%' },
          { pointName: 'Fan Status', pointType: 'binary_input', value: 1, unit: 'binary' },
          { pointName: 'Filter Pressure', pointType: 'analog_input', value: +(100 + Math.random() * 50).toFixed(1), unit: 'Pa' },
        ];
      case 'elevator':
        return [
          { pointName: 'Current Floor', pointType: 'analog_value', value: Math.floor(Math.random() * 20) + 1, unit: 'floor' },
          { pointName: 'Door Status', pointType: 'binary_input', value: Math.random() > 0.3 ? 1 : 0, unit: 'binary' },
          { pointName: 'Motor Current', pointType: 'analog_input', value: +(5 + Math.random() * 15).toFixed(1), unit: 'A' },
          { pointName: 'Operational Status', pointType: 'binary_input', value: 1, unit: 'binary' },
        ];
      case 'fire_panel':
        return [
          { pointName: 'Zone 1 Status', pointType: 'binary_input', value: 1, unit: 'binary' },
          { pointName: 'Zone 2 Status', pointType: 'binary_input', value: 1, unit: 'binary' },
          { pointName: 'Smoke Detector Count', pointType: 'analog_value', value: Math.floor(30 + Math.random() * 10), unit: 'count' },
          { pointName: 'Alarm Active', pointType: 'binary_input', value: 0, unit: 'binary' },
          { pointName: 'Battery Voltage', pointType: 'analog_input', value: +(23.5 + Math.random()).toFixed(1), unit: 'V' },
        ];
      case 'power_meter':
        return [
          { pointName: 'Active Power', pointType: 'analog_input', value: +(50 + Math.random() * 200).toFixed(1), unit: 'kW' },
          { pointName: 'Voltage L1', pointType: 'analog_input', value: +(228 + Math.random() * 8).toFixed(1), unit: 'V' },
          { pointName: 'Current L1', pointType: 'analog_input', value: +(10 + Math.random() * 50).toFixed(1), unit: 'A' },
          { pointName: 'Power Factor', pointType: 'analog_input', value: +(0.85 + Math.random() * 0.15).toFixed(2), unit: 'pf' },
          { pointName: 'Energy Total', pointType: 'analog_value', value: +(10000 + Math.random() * 5000).toFixed(0), unit: 'kWh' },
        ];
      case 'water_meter':
        return [
          { pointName: 'Flow Rate', pointType: 'analog_input', value: +(2 + Math.random() * 8).toFixed(2), unit: 'm³/h' },
          { pointName: 'Total Volume', pointType: 'analog_value', value: +(5000 + Math.random() * 2000).toFixed(0), unit: 'm³' },
          { pointName: 'Pressure', pointType: 'analog_input', value: +(2 + Math.random() * 3).toFixed(1), unit: 'bar' },
        ];
      default:
        return [
          { pointName: 'Status', pointType: 'binary_input', value: 1, unit: 'binary' },
          { pointName: 'Temperature', pointType: 'analog_input', value: +(20 + Math.random() * 10).toFixed(1), unit: 'degC' },
        ];
    }
  }

  // ── Summary ──

  async getSummary(companyId: string) {
    const [totalDevices, activeDevices, faultDevices, totalReadings] = await Promise.all([
      prisma.bmsDevice.count({ where: { companyId } }),
      prisma.bmsDevice.count({ where: { companyId, isActive: true } }),
      prisma.bmsDevice.count({ where: { companyId, faultActive: true } }),
      prisma.bmsReading.count({ where: { companyId } }),
    ]);

    const byType = await prisma.bmsDevice.groupBy({
      by: ['deviceType'],
      where: { companyId },
      _count: true,
    });

    return {
      totalDevices,
      activeDevices,
      faultDevices,
      totalReadings,
      byType: byType.map(t => ({ type: t.deviceType, count: t._count })),
    };
  }
}

export const bmsService = new BmsService();
export { BMS_DEVICE_TYPES, BMS_PROTOCOLS };
