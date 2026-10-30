import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type DatePresetKey = 'today' | 'mtd' | 'qtd' | 'ytd' | 'last30' | 'custom';

interface DashboardFilters {
  dateRange: {
    preset: DatePresetKey;
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
    setDatePreset: (state, action: PayloadAction<DashboardFilters['dateRange']>) => {
      state.filters.dateRange = action.payload;
    },
    toggleEditMode: (state) => {
      state.editMode = !state.editMode;
    },
    setEditMode: (state, action: PayloadAction<boolean>) => {
      state.editMode = action.payload;
    },
    toggleAddWidgetPanel: (state) => {
      state.addWidgetPanelOpen = !state.addWidgetPanelOpen;
    },
    closeAddWidgetPanel: (state) => {
      state.addWidgetPanelOpen = false;
    },
  },
});

export const { setDatePreset, toggleEditMode, setEditMode, toggleAddWidgetPanel, closeAddWidgetPanel } = dashboardSlice.actions;
export default dashboardSlice.reducer;
