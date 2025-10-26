/**
 * Redux Store Configuration
 *
 * Central store for the Memory Visualizer application.
 * Uses Redux Toolkit for simplified Redux setup with TypeScript.
 */

import { configureStore } from '@reduxjs/toolkit';
import graphReducer from './slices/graphSlice';
import filtersReducer from './slices/filtersSlice';
import navigationReducer from './slices/navigationSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    graph: graphReducer,
    filters: filtersReducer,
    navigation: navigationReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // Disable immutability check for graph entities and relations (D3 needs to mutate them)
      immutableCheck: {
        ignoredPaths: ['graph.entities', 'graph.relations'],
      },
      serializableCheck: {
        // Ignore these action types (for D3 objects that aren't serializable)
        ignoredActions: ['ui/setDimensions'],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['payload.transform'],
        // Ignore these paths in the state
        ignoredPaths: ['ui.transform'],
      },
    }),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
