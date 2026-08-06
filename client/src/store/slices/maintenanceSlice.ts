import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// ── Types ────────────────────────────────────

export interface TicketListFilters {
  status: string;
  priority: string;
  categoryId: string;
  search: string;
  propertyId: string;
  page: number;
  limit: number;
}

interface MaintenanceState {
  /** Ticket list view mode */
  viewMode: 'table' | 'kanban';
  /** Persistent ticket list filters */
  ticketFilters: TicketListFilters;
  /** Dashboard property filter */
  dashboardPropertyId: string;
  /** SLA report filters */
  slaReportFilters: {
    propertyId: string;
    groupBy: 'priority' | 'property' | 'category' | 'technician';
    from: string;
    to: string;
  };
}

const initialState: MaintenanceState = {
  viewMode: 'table',
  ticketFilters: {
    status: '', priority: '', categoryId: '', search: '', propertyId: '',
    page: 1, limit: 20,
  },
  dashboardPropertyId: '',
  slaReportFilters: {
    propertyId: '',
    groupBy: 'priority',
    from: '',
    to: '',
  },
};

// ── Slice ─────────────────────────────────────

export const maintenanceSlice = createSlice({
  name: 'maintenance',
  initialState,
  reducers: {
    setViewMode: (state, action: PayloadAction<'table' | 'kanban'>) => {
      state.viewMode = action.payload;
    },
    setTicketFilters: (state, action: PayloadAction<Partial<TicketListFilters>>) => {
      state.ticketFilters = { ...state.ticketFilters, ...action.payload };
      // Reset to page 1 when filters change (unless explicitly setting page)
      if (!('page' in action.payload)) {
        state.ticketFilters.page = 1;
      }
    },
    resetTicketFilters: (state) => {
      state.ticketFilters = initialState.ticketFilters;
    },
    setDashboardPropertyId: (state, action: PayloadAction<string>) => {
      state.dashboardPropertyId = action.payload;
    },
    setSlaReportFilters: (state, action: PayloadAction<Partial<MaintenanceState['slaReportFilters']>>) => {
      state.slaReportFilters = { ...state.slaReportFilters, ...action.payload };
    },
    resetSlaReportFilters: (state) => {
      state.slaReportFilters = initialState.slaReportFilters;
    },
  },
});

export const {
  setViewMode,
  setTicketFilters,
  resetTicketFilters,
  setDashboardPropertyId,
  setSlaReportFilters,
  resetSlaReportFilters,
} = maintenanceSlice.actions;

export default maintenanceSlice.reducer;
