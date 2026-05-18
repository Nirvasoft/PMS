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
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      authApi.middleware, usersApi.middleware, organizationApi.middleware,
      workflowApi.middleware, notificationsApi.middleware, documentsApi.middleware,
      dashboardApi.middleware, propertiesApi.middleware, unitsApi.middleware, tenantsApi.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
