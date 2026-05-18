import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface DashboardFilters {
  propertyIds: string[];
  dateRange: {
    preset: 'today' | 'mtd' | 'qtd' | 'ytd' | 'last30' | 'custom';
    from: string;
    to: string;
  };
}

interface DashboardState {
  filters: DashboardFilters;
  editMode: boolean;
  addWidgetPanelOpen: boolean;
}

function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
}

const defaultFilters: DashboardFilters = {
  propertyIds: [],
  dateRange: {
    preset: 'mtd',
    from: startOfMonth(),
    to: new Date().toISOString().split('T')[0],
  },
};

const initialState: DashboardState = {
  filters: defaultFilters,
  editMode: false,
  addWidgetPanelOpen: false,
};

export const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<DashboardFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    setDatePreset: (state, action: PayloadAction<DashboardFilters['dateRange']>) => {
      state.filters.dateRange = action.payload;
    },
    toggleEditMode: (state) => {
      state.editMode = !state.editMode;
    },
    toggleAddWidgetPanel: (state) => {
      state.addWidgetPanelOpen = !state.addWidgetPanelOpen;
    },
    closeAddWidgetPanel: (state) => {
      state.addWidgetPanelOpen = false;
    },
  },
});

export const { setFilters, setDatePreset, toggleEditMode, toggleAddWidgetPanel, closeAddWidgetPanel } = dashboardSlice.actions;
export default dashboardSlice.reducer;
