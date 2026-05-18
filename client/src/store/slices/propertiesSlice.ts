import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface PropertiesState {
  selectedPropertyId: string | null;
  activeTab: 'overview' | 'units' | 'leases' | 'finance' | 'documents' | 'settings';
  listView: 'grid' | 'list';
  listFilters: {
    search: string;
    status: string | null;
    propertyType: string | null;
    regionId: string | null;
  };
}

const initialState: PropertiesState = {
  selectedPropertyId: null,
  activeTab: 'overview',
  listView: 'grid',
  listFilters: { search: '', status: null, propertyType: null, regionId: null },
};

export const propertiesSlice = createSlice({
  name: 'properties',
  initialState,
  reducers: {
    setSelectedProperty: (state, action: PayloadAction<string | null>) => {
      state.selectedPropertyId = action.payload;
    },
    setActiveTab: (state, action: PayloadAction<PropertiesState['activeTab']>) => {
      state.activeTab = action.payload;
    },
    setListView: (state, action: PayloadAction<'grid' | 'list'>) => {
      state.listView = action.payload;
    },
    setListFilter: (state, action: PayloadAction<Partial<PropertiesState['listFilters']>>) => {
      state.listFilters = { ...state.listFilters, ...action.payload };
    },
    resetFilters: (state) => {
      state.listFilters = initialState.listFilters;
    },
  },
});

export const { setSelectedProperty, setActiveTab, setListView, setListFilter, resetFilters } = propertiesSlice.actions;
export default propertiesSlice.reducer;
