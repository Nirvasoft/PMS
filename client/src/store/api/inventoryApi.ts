import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export const inventoryApi = createApi({
  reducerPath: 'inventoryApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['InventoryStores', 'InventoryItems', 'StockLevels', 'StockMovements', 'PurchaseRequisitions'],
  endpoints: (builder) => ({
    // Stores
    getStores: builder.query<any, { propertyId?: string }>({
      query: (params) => ({ url: '/inventory/stores', params }),
      providesTags: ['InventoryStores'],
    }),
    createStore: builder.mutation<any, any>({
      query: (body) => ({ url: '/inventory/stores', method: 'POST', body }),
      invalidatesTags: ['InventoryStores'],
    }),
    updateStore: builder.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: `/inventory/stores/${id}`, method: 'PUT', body }),
      invalidatesTags: ['InventoryStores'],
    }),

    // Items
    getInventoryItems: builder.query<any, any>({
      query: (params) => ({ url: '/inventory/items', params }),
      providesTags: ['InventoryItems'],
    }),
    getInventoryItemById: builder.query<any, string>({
      query: (id) => `/inventory/items/${id}`,
      providesTags: ['InventoryItems'],
    }),
    createInventoryItem: builder.mutation<any, any>({
      query: (body) => ({ url: '/inventory/items', method: 'POST', body }),
      invalidatesTags: ['InventoryItems'],
    }),
    updateInventoryItem: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/inventory/items/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['InventoryItems'],
    }),

    // Stock Levels
    getStockLevels: builder.query<any, any>({
      query: (params) => ({ url: '/inventory/stock-levels', params }),
      providesTags: ['StockLevels'],
    }),

    // Movements
    getMovements: builder.query<any, any>({
      query: (params) => ({ url: '/inventory/movements', params }),
      providesTags: ['StockMovements'],
    }),
    receiveStock: builder.mutation<any, any>({
      query: (body) => ({ url: '/inventory/movements/receive', method: 'POST', body }),
      invalidatesTags: ['StockLevels', 'StockMovements', 'InventoryItems'],
    }),
    issueStock: builder.mutation<any, any>({
      query: (body) => ({ url: '/inventory/movements/issue', method: 'POST', body }),
      invalidatesTags: ['StockLevels', 'StockMovements', 'PurchaseRequisitions'],
    }),
    transferStock: builder.mutation<any, any>({
      query: (body) => ({ url: '/inventory/movements/transfer', method: 'POST', body }),
      invalidatesTags: ['StockLevels', 'StockMovements'],
    }),
    adjustStock: builder.mutation<any, any>({
      query: (body) => ({ url: '/inventory/movements/adjust', method: 'POST', body }),
      invalidatesTags: ['StockLevels', 'StockMovements'],
    }),

    // Stats
    getInventoryStats: builder.query<any, void>({
      query: () => '/inventory/stats',
    }),

    // Purchase Requisitions
    getPurchaseRequisitions: builder.query<any, any>({
      query: (params) => ({ url: '/inventory/purchase-requisitions', params }),
      providesTags: ['PurchaseRequisitions'],
    }),
    submitPurchaseRequisition: builder.mutation<any, string>({
      query: (id) => ({ url: `/inventory/purchase-requisitions/${id}/submit`, method: 'POST' }),
      invalidatesTags: ['PurchaseRequisitions'],
    }),
    approvePurchaseRequisition: builder.mutation<any, string>({
      query: (id) => ({ url: `/inventory/purchase-requisitions/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['PurchaseRequisitions'],
    }),
    rejectPurchaseRequisition: builder.mutation<any, string>({
      query: (id) => ({ url: `/inventory/purchase-requisitions/${id}/reject`, method: 'POST' }),
      invalidatesTags: ['PurchaseRequisitions'],
    }),
  }),
});

export const {
  useGetStoresQuery, useCreateStoreMutation, useUpdateStoreMutation,
  useGetInventoryItemsQuery, useGetInventoryItemByIdQuery,
  useCreateInventoryItemMutation, useUpdateInventoryItemMutation,
  useGetStockLevelsQuery,
  useGetMovementsQuery, useReceiveStockMutation, useIssueStockMutation,
  useTransferStockMutation, useAdjustStockMutation,
  useGetInventoryStatsQuery,
  useGetPurchaseRequisitionsQuery, useSubmitPurchaseRequisitionMutation,
  useApprovePurchaseRequisitionMutation, useRejectPurchaseRequisitionMutation,
} = inventoryApi;
