/**
 * UI Slice
 *
 * Manages UI-specific state including:
 * - Graph dimensions
 * - Error messages
 * - Dragging state
 * - Zoom transform (stored but not serialized)
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  // Graph container dimensions
  dimensions: {
    width: number;
    height: number;
  };

  // General error messages (not graph-specific errors which are in graphSlice)
  errorMessage: string;

  // Drag state
  isDragging: boolean;

  // Database health
  dbHealthy: boolean;
  useDatabase: boolean;
}

const initialState: UiState = {
  dimensions: { width: 0, height: 0 },
  errorMessage: '',
  isDragging: false,
  dbHealthy: false,
  useDatabase: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setDimensions: (state, action: PayloadAction<{ width: number; height: number }>) => {
      state.dimensions = action.payload;
    },

    setErrorMessage: (state, action: PayloadAction<string>) => {
      state.errorMessage = action.payload;
    },

    clearErrorMessage: (state) => {
      state.errorMessage = '';
    },

    setIsDragging: (state, action: PayloadAction<boolean>) => {
      state.isDragging = action.payload;
    },

    setDbHealthy: (state, action: PayloadAction<boolean>) => {
      state.dbHealthy = action.payload;
    },

    setUseDatabase: (state, action: PayloadAction<boolean>) => {
      state.useDatabase = action.payload;
    },
  },
});

export const {
  setDimensions,
  setErrorMessage,
  clearErrorMessage,
  setIsDragging,
  setDbHealthy,
  setUseDatabase,
} = uiSlice.actions;

export default uiSlice.reducer;
