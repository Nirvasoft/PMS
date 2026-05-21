import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface AuthUser {
  id: string;
  email: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaPending: boolean;
  mfaToken: string | null;
  sessionExpiresAt: number | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  mfaPending: false,
  mfaToken: null,
  sessionExpiresAt: null,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ user: AuthUser; accessToken: string; expiresIn: number }>,
    ) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.isAuthenticated = true;
      state.isLoading = false;
      state.mfaPending = false;
      state.mfaToken = null;
      state.sessionExpiresAt = Date.now() + action.payload.expiresIn * 1000;
    },
    setMfaPending: (state, action: PayloadAction<{ mfaToken: string }>) => {
      state.mfaPending = true;
      state.mfaToken = action.payload.mfaToken;
      state.isLoading = false;
    },
    clearAuth: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.isLoading = false;
      state.mfaPending = false;
      state.mfaToken = null;
      state.sessionExpiresAt = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
});

export const { setCredentials, setMfaPending, clearAuth, setLoading } = authSlice.actions;
export default authSlice.reducer;
