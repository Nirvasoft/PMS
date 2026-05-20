import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type ViewMode = 'floor_plan' | 'list' | 'grid' | 'calendar';

interface UnitsState {
  selectedUnitId: string | null;
  drawerOpen: boolean;
  viewMode: ViewMode;
  selectedTowerId: string | null;
  floorFilter: number | null;
  statusFilter: string[];
  unitTypeFilter: string | null;
  searchQuery: string;
  zoomLevel: 'compact' | 'normal' | 'large';
  bulkCreateOpen: boolean;
  towerModalOpen: boolean;
}

const initialState: UnitsState = {
  selectedUnitId: null,
  drawerOpen: false,
  viewMode: 'floor_plan',
  selectedTowerId: null,
  floorFilter: null,
  statusFilter: [],
  unitTypeFilter: null,
  searchQuery: '',
  zoomLevel: 'normal',
  bulkCreateOpen: false,
  towerModalOpen: false,
};

export const unitsSlice = createSlice({
  name: 'units',
  initialState,
  reducers: {
    selectUnit: (state, action: PayloadAction<string | null>) => {
      state.selectedUnitId = action.payload;
      state.drawerOpen = action.payload !== null;
    },
    closeDrawer: (state) => {
      state.drawerOpen = false;
      state.selectedUnitId = null;
    },
    setViewMode: (state, action: PayloadAction<ViewMode>) => {
      state.viewMode = action.payload;
    },
    selectTower: (state, action: PayloadAction<string | null>) => {
      state.selectedTowerId = action.payload;
      state.floorFilter = null; // reset floor when switching tower
    },
    setFloorFilter: (state, action: PayloadAction<number | null>) => {
      state.floorFilter = action.payload;
    },
    toggleStatusFilter: (state, action: PayloadAction<string>) => {
      const idx = state.statusFilter.indexOf(action.payload);
      if (idx === -1) state.statusFilter.push(action.payload);
      else state.statusFilter.splice(idx, 1);
    },
    setUnitTypeFilter: (state, action: PayloadAction<string | null>) => {
      state.unitTypeFilter = action.payload;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    setZoomLevel: (state, action: PayloadAction<UnitsState['zoomLevel']>) => {
      state.zoomLevel = action.payload;
    },
    clearFilters: (state) => {
      state.floorFilter = null;
      state.statusFilter = [];
      state.unitTypeFilter = null;
      state.searchQuery = '';
    },
    setBulkCreateOpen: (state, action: PayloadAction<boolean>) => {
      state.bulkCreateOpen = action.payload;
    },
    setTowerModalOpen: (state, action: PayloadAction<boolean>) => {
      state.towerModalOpen = action.payload;
    },
  },
});

export const {
  selectUnit, closeDrawer, setViewMode, selectTower, setFloorFilter,
  toggleStatusFilter, setUnitTypeFilter, setSearchQuery, setZoomLevel,
  clearFilters, setBulkCreateOpen, setTowerModalOpen,
} = unitsSlice.actions;

export default unitsSlice.reducer;
