import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { RootState } from '../index';
import { setCredentials, clearAuth } from '../slices/authSlice';

/**
 * Base fetch query with auth headers.
 */
const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api/v1',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Requested-With', 'XMLHttpRequest');
    return headers;
  },
});

/**
 * Mutex to prevent multiple simultaneous refresh attempts.
 */
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Wraps the base query with automatic token refresh on 401 responses.
 * When a 401 is received:
 *   1. Calls POST /auth/refresh (using httpOnly cookie)
 *   2. If successful, stores new access token + user in Redux
 *   3. Retries the original request with new token
 *   4. If refresh fails, clears auth state → user redirected to login
 */
export const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    // Prevent multiple refresh calls
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = (async () => {
        try {
          const refreshResult = await rawBaseQuery(
            { url: '/auth/refresh', method: 'POST' },
            api,
            extraOptions,
          );

          if (refreshResult.data) {
            const resp = refreshResult.data as {
              success: boolean;
              data: {
                accessToken: string;
                expiresIn: number;
                user?: {
                  id: string; email: string; companyId: string;
                  roles: string[]; permissions: string[];
                  mustChangePassword: boolean;
                };
              };
            };

            if (resp.success && resp.data.accessToken) {
              // Store new token + user
              api.dispatch(setCredentials({
                user: resp.data.user ? {
                  id: resp.data.user.id,
                  email: resp.data.user.email,
                  companyId: resp.data.user.companyId,
                  roles: resp.data.user.roles,
                  permissions: resp.data.user.permissions,
                  mustChangePassword: resp.data.user.mustChangePassword,
                } : (api.getState() as RootState).auth.user!,
                accessToken: resp.data.accessToken,
                expiresIn: resp.data.expiresIn,
              }));
              return true;
            }
          }
          // Refresh failed — clear auth
          api.dispatch(clearAuth());
          return false;
        } catch {
          api.dispatch(clearAuth());
          return false;
        } finally {
          isRefreshing = false;
          refreshPromise = null;
        }
      })();
    }

    const refreshed = await refreshPromise;
    if (refreshed) {
      // Retry original request with new token
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }

  return result;
};
