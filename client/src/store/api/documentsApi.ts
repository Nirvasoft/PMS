import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface DocumentItem {
  id: string;
  name: string;
  originalFilename: string;
  mimeType: string;
  extension: string | null;
  fileSize: number;
  fileSizeFormatted: string;
  category: string | null;
  description: string | null;
  tags: string[];
  status: string;
  currentVersion: number;
  expiryDate: string | null;
  daysUntilExpiry?: number;
  isConfidential: boolean;
  entityType: string | null;
  entityId: string | null;
  folder: { id: string; name: string; path: string } | null;
  uploader?: {
    id: string;
    email: string;
    profile?: { firstName: string; lastName: string };
  };
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersion {
  versionNumber: number;
  isCurrent: boolean;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  changeNotes: string | null;
  uploadedBy?: { id: string; email: string; profile?: { firstName: string; lastName: string } };
  createdAt: string;
}

export interface FolderItem {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  entityType: string | null;
  entityId: string | null;
  accessPolicy: string;
  _count?: { documents: number; children: number };
  children?: FolderItem[];
}

export const documentsApi = createApi({
  reducerPath: 'documentsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Documents', 'Folders', 'Versions'],
  endpoints: (builder) => ({
    // ─── Documents ──────────────────────────
    getDocuments: builder.query<PaginatedResponse<DocumentItem>, Record<string, string>>({
      query: (params) => ({ url: '/documents', params }),
      providesTags: ['Documents'],
    }),

    getDocument: builder.query<ApiResponse<DocumentItem>, string>({
      query: (id) => `/documents/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Documents', id }],
    }),

    uploadDocument: builder.mutation<ApiResponse<DocumentItem>, FormData>({
      query: (formData) => ({
        url: '/documents',
        method: 'POST',
        body: formData,
        // Don't set Content-Type — browser handles multipart boundary
      }),
      invalidatesTags: ['Documents'],
    }),

    updateDocument: builder.mutation<ApiResponse<DocumentItem>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/documents/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Documents', id }, 'Documents'],
    }),

    deleteDocument: builder.mutation<void, string>({
      query: (id) => ({ url: `/documents/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Documents'],
    }),

    getExpiringDocuments: builder.query<PaginatedResponse<DocumentItem>, { days?: number; page?: number }>({
      query: ({ days = 30, page = 1 }) => ({
        url: '/documents/expiring',
        params: { days: String(days), page: String(page) },
      }),
      providesTags: ['Documents'],
    }),

    // ─── Versions ───────────────────────────
    getDocumentVersions: builder.query<ApiResponse<DocumentVersion[]>, string>({
      query: (id) => `/documents/${id}/versions`,
      providesTags: (_r, _e, id) => [{ type: 'Versions', id }],
    }),

    uploadNewVersion: builder.mutation<ApiResponse<DocumentItem>, { id: string; formData: FormData }>({
      query: ({ id, formData }) => ({
        url: `/documents/${id}/versions`,
        method: 'POST',
        body: formData,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Documents', id },
        { type: 'Versions', id },
        'Documents',
      ],
    }),

    // ─── Download / Preview ─────────────────
    getDocumentPreview: builder.query<ApiResponse<{ url: string; mimeType: string; name: string }>, string>({
      query: (id) => `/documents/${id}/preview`,
    }),

    // ─── Shares ─────────────────────────────
    createShareLink: builder.mutation<
      ApiResponse<{ shareId: string; shareUrl: string; expiresAt: string | null }>,
      { id: string; data: Record<string, unknown> }
    >({
      query: ({ id, data }) => ({ url: `/documents/${id}/share`, method: 'POST', body: data }),
    }),

    // ─── Folders ────────────────────────────
    getFolders: builder.query<ApiResponse<FolderItem[]>, Record<string, string>>({
      query: (params) => ({ url: '/document-folders', params }),
      providesTags: ['Folders'],
    }),

    createFolder: builder.mutation<ApiResponse<FolderItem>, Record<string, unknown>>({
      query: (body) => ({ url: '/document-folders', method: 'POST', body }),
      invalidatesTags: ['Folders'],
    }),

    updateFolder: builder.mutation<ApiResponse<FolderItem>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/document-folders/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Folders'],
    }),

    deleteFolder: builder.mutation<void, string>({
      query: (id) => ({ url: `/document-folders/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Folders'],
    }),
  }),
});

export const {
  useGetDocumentsQuery,
  useGetDocumentQuery,
  useUploadDocumentMutation,
  useUpdateDocumentMutation,
  useDeleteDocumentMutation,
  useGetExpiringDocumentsQuery,
  useGetDocumentVersionsQuery,
  useUploadNewVersionMutation,
  useGetDocumentPreviewQuery,
  useCreateShareLinkMutation,
  useGetFoldersQuery,
  useCreateFolderMutation,
  useUpdateFolderMutation,
  useDeleteFolderMutation,
} = documentsApi;
