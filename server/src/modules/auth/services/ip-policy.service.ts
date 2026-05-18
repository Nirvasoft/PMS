import { prisma } from '../../../common/database';

export class IpPolicyService {
  /**
   * Check if an IP address is allowed based on company + user policies.
   * Returns true if allowed, false if blocked.
   */
  async checkIp(companyId: string, userId: string | null, ipAddress: string): Promise<boolean> {
    const policies = await prisma.ipPolicy.findMany({
      where: {
        companyId,
        isActive: true,
        OR: [{ userId: null }, ...(userId ? [{ userId }] : [])],
      },
    });

    if (policies.length === 0) return true; // no restrictions

    const denyRules = policies.filter((p) => p.policyType === 'deny');
    const allowRules = policies.filter((p) => p.policyType === 'allow');

    // Deny rules take priority
    for (const rule of denyRules) {
      if (this.ipInCidr(ipAddress, rule.cidr)) return false;
    }

    // If allow rules exist, IP must match at least one
    if (allowRules.length > 0) {
      return allowRules.some((rule) => this.ipInCidr(ipAddress, rule.cidr));
    }

    return true;
  }

  /** Simple CIDR match — handles /32 single IPs and basic subnets */
  private ipInCidr(ip: string, cidr: string): boolean {
    if (!cidr.includes('/')) {
      return ip === cidr;
    }
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    const ipNum = this.ipToNumber(ip);
    const rangeNum = this.ipToNumber(range);
    return (ipNum & mask) === (rangeNum & mask);
  }

  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  }

  async getPolicies(companyId: string) {
    return prisma.ipPolicy.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPolicy(data: {
    companyId: string;
    userId?: string;
    policyType: 'allow' | 'deny';
    cidr: string;
    description?: string;
    createdBy: string;
  }) {
    return prisma.ipPolicy.create({ data });
  }

  async deletePolicy(id: string, companyId: string) {
    return prisma.ipPolicy.deleteMany({ where: { id, companyId } });
  }
}

export const ipPolicyService = new IpPolicyService();
