import { useRefreshTokensMutation } from '../store/api/authApi';
import { setCredentials } from '../store/slices/authSlice';
import { useAppDispatch } from '../store';

/**
 * Re-pulls the current user's roles/permissions from the server and updates
 * Redux auth state, so UI gated by `state.auth.user.permissions` (e.g. the
 * sidebar) reflects a role/permission change immediately instead of only
 * after the next page reload or token refresh.
 */
export function useRefreshAuth() {
  const dispatch = useAppDispatch();
  const [refreshTokens] = useRefreshTokensMutation();

  return async () => {
    try {
      const result = await refreshTokens().unwrap();
      if (result.data?.accessToken && result.data.user) {
        dispatch(setCredentials({
          user: {
            id: result.data.user.id,
            email: result.data.user.email,
            companyId: result.data.user.companyId,
            companyCode: result.data.user.companyCode,
            companyName: result.data.user.companyName,
            roles: result.data.user.roles ?? [],
            permissions: result.data.user.permissions ?? [],
            mustChangePassword: result.data.user.mustChangePassword,
          },
          accessToken: result.data.accessToken,
          expiresIn: result.data.expiresIn,
        }));
      }
    } catch {
      // Non-critical — the change will still show up on next reload/token refresh.
    }
  };
}
