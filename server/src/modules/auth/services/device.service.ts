import UAParser from 'ua-parser-js';
import { prisma } from '../../../common/database';

export class DeviceService {
  async upsertDevice(
    userId: string,
    data: { fingerprint: string; deviceName?: string; userAgent: string; ipAddress: string },
  ) {
    const ua = new UAParser(data.userAgent);
    const browser = ua.getBrowser();
    const os = ua.getOS();
    const deviceType = ua.getDevice().type || 'browser';

    return prisma.userDevice.upsert({
      where: { uq_device_fingerprint_user: { fingerprint: data.fingerprint, userId } },
      create: {
        userId,
        fingerprint: data.fingerprint,
        deviceName: data.deviceName || `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`,
        deviceType,
        os: os.name ? `${os.name} ${os.version || ''}`.trim() : null,
        browser: browser.name ? `${browser.name} ${browser.version || ''}`.trim() : null,
        lastSeenAt: new Date(),
        lastIp: data.ipAddress,
      },
      update: {
        deviceName: data.deviceName || undefined,
        lastSeenAt: new Date(),
        lastIp: data.ipAddress,
        os: os.name ? `${os.name} ${os.version || ''}`.trim() : undefined,
        browser: browser.name ? `${browser.name} ${browser.version || ''}`.trim() : undefined,
      },
    });
  }

  async getUserDevices(userId: string) {
    return prisma.userDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async revokeDevice(deviceId: string, userId: string) {
    return prisma.userDevice.updateMany({
      where: { id: deviceId, userId },
      data: { revokedAt: new Date() },
    });
  }
}

export const deviceService = new DeviceService();
