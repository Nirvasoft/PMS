import type { ReactNode } from 'react';
import { useFeatureFlag, type FeatureFlagKey } from '../../hooks/useFeatureFlags';

interface FeatureGateProps {
  /** The feature flag key to check */
  flag: FeatureFlagKey;
  /** Content to show when the feature is disabled */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Component that conditionally renders children based on a feature flag.
 * Works exactly like PermissionGuard but checks company.settings instead of user permissions.
 *
 * Usage:
 *   <FeatureGate flag="parkingEnabled">
 *     <ParkingMenu />
 *   </FeatureGate>
 */
export function FeatureGate({ flag, fallback = null, children }: FeatureGateProps) {
  const isEnabled = useFeatureFlag(flag);
  return isEnabled ? <>{children}</> : <>{fallback}</>;
}
