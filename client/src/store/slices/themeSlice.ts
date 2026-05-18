import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('pms-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  // Respect OS preference
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

const initialState: ThemeState = {
  mode: getInitialTheme(),
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
      localStorage.setItem('pms-theme', action.payload);
      document.documentElement.setAttribute('data-theme', action.payload);
    },
    toggleTheme(state) {
      const next = state.mode === 'dark' ? 'light' : 'dark';
      state.mode = next;
      localStorage.setItem('pms-theme', next);
      document.documentElement.setAttribute('data-theme', next);
    },
  },
});

export const { setTheme, toggleTheme } = themeSlice.actions;
export default themeSlice.reducer;
