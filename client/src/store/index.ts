import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import authReducer from './slices/authSlice';
import themeReducer from './slices/themeSlice';
import dashboardReducer from './slices/dashboardSlice';
import propertiesReducer from './slices/propertiesSlice';
import unitsReducer from './slices/unitsSlice';
import { authApi } from './api/authApi';
import { usersApi } from './api/usersApi';
import { organizationApi } from './api/organizationApi';
import { workflowApi } from './api/workflowApi';
import { notificationsApi } from './api/notificationsApi';
import { documentsApi } from './api/documentsApi';
import { dashboardApi } from './api/dashboardApi';
import { propertiesApi } from './api/propertiesApi';
import { unitsApi } from './api/unitsApi';
import { tenantsApi } from './api/tenantsApi';
import { leasesApi } from './api/leasesApi';
import { crmApi } from './api/crmApi';
import { parkingApi } from './api/parkingApi';
import { billingApi } from './api/billingApi';
import { arApi } from './api/arApi';
import { glApi } from './api/glApi';
import { assetsApi } from './api/assetsApi';
import { bankingApi } from './api/bankingApi';
import { maintenanceApi } from './api/maintenanceApi';
import { pmApi } from './api/pmApi';
import { facilityApi } from './api/facilityApi';
import { inventoryApi } from './api/inventoryApi';
import { housekeepingApi } from './api/housekeepingApi';
import { securityApi } from './api/securityApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    theme: themeReducer,
    dashboard: dashboardReducer,
    properties: propertiesReducer,
    units: unitsReducer,
    [authApi.reducerPath]: authApi.reducer,
    [usersApi.reducerPath]: usersApi.reducer,
    [organizationApi.reducerPath]: organizationApi.reducer,
    [workflowApi.reducerPath]: workflowApi.reducer,
    [notificationsApi.reducerPath]: notificationsApi.reducer,
    [documentsApi.reducerPath]: documentsApi.reducer,
    [dashboardApi.reducerPath]: dashboardApi.reducer,
    [propertiesApi.reducerPath]: propertiesApi.reducer,
    [unitsApi.reducerPath]: unitsApi.reducer,
    [tenantsApi.reducerPath]: tenantsApi.reducer,
    [leasesApi.reducerPath]:  leasesApi.reducer,
    [crmApi.reducerPath]:     crmApi.reducer,
    [parkingApi.reducerPath]: parkingApi.reducer,
    [billingApi.reducerPath]: billingApi.reducer,
    [arApi.reducerPath]: arApi.reducer,
    [glApi.reducerPath]: glApi.reducer,
    [assetsApi.reducerPath]: assetsApi.reducer,
    [bankingApi.reducerPath]: bankingApi.reducer,
    [maintenanceApi.reducerPath]: maintenanceApi.reducer,
    [pmApi.reducerPath]: pmApi.reducer,
    [facilityApi.reducerPath]: facilityApi.reducer,
    [inventoryApi.reducerPath]: inventoryApi.reducer,
    [housekeepingApi.reducerPath]: housekeepingApi.reducer,
    [securityApi.reducerPath]: securityApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      authApi.middleware, usersApi.middleware, organizationApi.middleware,
      workflowApi.middleware, notificationsApi.middleware, documentsApi.middleware,
      dashboardApi.middleware, propertiesApi.middleware, unitsApi.middleware, tenantsApi.middleware, leasesApi.middleware,
      crmApi.middleware,
      parkingApi.middleware,
      billingApi.middleware,
      arApi.middleware,
      glApi.middleware,
      assetsApi.middleware,
      bankingApi.middleware,
      maintenanceApi.middleware,
      pmApi.middleware,
      facilityApi.middleware,
      inventoryApi.middleware,
      housekeepingApi.middleware,
      securityApi.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
