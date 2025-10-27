/**
 * Filters Slice
 *
 * Manages all filtering state for the knowledge graph:
 * - Team selection (independent)
 * - Data source (batch/online/combined - independent)
 * - Search term
 * - Entity type filter
 * - Relation type filter
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type DataSource = 'batch' | 'online' | 'combined';

interface FiltersState {
  // Team filter (coding, ui, resi, ...)
  selectedTeams: string[];
  availableTeams: Array<{ name: string; displayName: string; entityCount: number }>;

  // Data source filter (batch=manual/ukb, online=auto, combined=both)
  dataSource: DataSource;

  // Search filter
  searchTerm: string;

  // Type filters
  entityType: string; // "All" or specific type
  relationType: string; // "All" or specific type

  // Available types for dropdowns
  availableEntityTypes: string[];
  availableRelationTypes: string[];
}

const initialState: FiltersState = {
  selectedTeams: [],
  availableTeams: [],
  dataSource: 'combined', // Default to combined (show all data: batch + online)
  searchTerm: '',
  entityType: 'All',
  relationType: 'All',
  availableEntityTypes: ['All'],
  availableRelationTypes: ['All'],
};

const filtersSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    // Team filter actions
    setSelectedTeams: (state, action: PayloadAction<string[]>) => {
      state.selectedTeams = action.payload;
      // Persist to localStorage
      localStorage.setItem('vkb_selectedTeams', JSON.stringify(action.payload));
    },

    setAvailableTeams: (state, action: PayloadAction<Array<{ name: string; displayName: string; entityCount: number }>>) => {
      state.availableTeams = action.payload;
    },

    toggleTeam: (state, action: PayloadAction<string>) => {
      const team = action.payload;
      const index = state.selectedTeams.indexOf(team);
      if (index >= 0) {
        state.selectedTeams.splice(index, 1);
      } else {
        state.selectedTeams.push(team);
      }
      // Persist to localStorage
      localStorage.setItem('vkb_selectedTeams', JSON.stringify(state.selectedTeams));
    },

    // Data source filter actions
    setDataSource: (state, action: PayloadAction<DataSource>) => {
      state.dataSource = action.payload;
      // Persist to localStorage
      localStorage.setItem('vkb_dataSource', action.payload);
    },

    // Search filter actions
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload;
    },

    clearSearch: (state) => {
      state.searchTerm = '';
    },

    // Entity type filter actions
    setEntityType: (state, action: PayloadAction<string>) => {
      state.entityType = action.payload;
    },

    setAvailableEntityTypes: (state, action: PayloadAction<string[]>) => {
      state.availableEntityTypes = action.payload;
    },

    // Relation type filter actions
    setRelationType: (state, action: PayloadAction<string>) => {
      state.relationType = action.payload;
    },

    setAvailableRelationTypes: (state, action: PayloadAction<string[]>) => {
      state.availableRelationTypes = action.payload;
    },

    // Reset all filters
    resetFilters: (state) => {
      state.searchTerm = '';
      state.entityType = 'All';
      state.relationType = 'All';
      // Keep team and dataSource as they're persisted preferences
    },

    // Load persisted filters from localStorage
    loadPersistedFilters: (state) => {
      try {
        const savedTeams = localStorage.getItem('vkb_selectedTeams');
        if (savedTeams) {
          state.selectedTeams = JSON.parse(savedTeams);
        }

        const savedDataSource = localStorage.getItem('vkb_dataSource') as DataSource | null;
        // Migrate old 'online' default to new 'combined' default
        if (savedDataSource === 'online') {
          state.dataSource = 'combined';
          localStorage.setItem('vkb_dataSource', 'combined');
        } else if (savedDataSource && ['batch', 'combined'].includes(savedDataSource)) {
          state.dataSource = savedDataSource;
        } else {
          // No saved preference or invalid value - use default and persist it
          localStorage.setItem('vkb_dataSource', 'combined');
        }
      } catch (error) {
        console.error('Failed to load persisted filters:', error);
      }
    },
  },
  extraReducers: (builder) => {
    // Handle loadAvailableTeams from graphIntents
    builder.addCase('graph/loadTeams/fulfilled' as any, (state, action: any) => {
      state.availableTeams = action.payload;
      // Auto-select first team if none selected
      if (state.selectedTeams.length === 0 && action.payload.length > 0) {
        state.selectedTeams = [action.payload[0].name];
        localStorage.setItem('vkb_selectedTeams', JSON.stringify(state.selectedTeams));
      }
    });

    // Handle loadGraphData to update available entity and relation types
    builder.addCase('graph/loadData/fulfilled' as any, (state, action: any) => {
      if (action.payload.availableEntityTypes) {
        state.availableEntityTypes = action.payload.availableEntityTypes;
      }
      if (action.payload.availableRelationTypes) {
        state.availableRelationTypes = action.payload.availableRelationTypes;
      }
    });
  },
});

export const {
  setSelectedTeams,
  setAvailableTeams,
  toggleTeam,
  setDataSource,
  setSearchTerm,
  clearSearch,
  setEntityType,
  setAvailableEntityTypes,
  setRelationType,
  setAvailableRelationTypes,
  resetFilters,
  loadPersistedFilters,
} = filtersSlice.actions;

export default filtersSlice.reducer;
