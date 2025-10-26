/**
 * Graph Slice
 *
 * Manages the knowledge graph data including entities, relations,
 * loading states, errors, and statistics.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Entity {
  id?: string;
  name: string;
  entityType: string;
  observations: string[];
  type?: string;
  _source?: string;
  metadata?: {
    source?: 'batch' | 'online';
    team?: string;
    confidence?: number;
    lastModified?: string;
    teams?: string[];
  };
}

export interface Relation {
  id?: string;
  from: string;
  to: string;
  from_entity_id?: string;
  to_entity_id?: string;
  relationType?: string;
  type?: string;
  confidence?: number;
  team?: string;
  metadata?: any;
}

export interface GraphStats {
  entityCount: number;
  relationCount: number;
  teamCounts?: Record<string, number>;
  sourceCounts?: {
    batch: number;
    online: number;
  };
}

interface GraphState {
  entities: Entity[];
  relations: Relation[];
  isLoading: boolean;
  error: string | null;
  stats: GraphStats | null;
  lastUpdated: string | null;
}

const initialState: GraphState = {
  entities: [],
  relations: [],
  isLoading: false,
  error: null,
  stats: null,
  lastUpdated: null,
};

const graphSlice = createSlice({
  name: 'graph',
  initialState,
  reducers: {
    // Set graph data directly
    setGraphData: (state, action: PayloadAction<{ entities: Entity[]; relations: Relation[] }>) => {
      state.entities = action.payload.entities;
      state.relations = action.payload.relations;
      state.lastUpdated = new Date().toISOString();
      state.error = null;

      // Calculate stats
      const teamCounts: Record<string, number> = {};
      let batchCount = 0;
      let onlineCount = 0;

      action.payload.entities.forEach(entity => {
        if (entity.metadata?.team) {
          teamCounts[entity.metadata.team] = (teamCounts[entity.metadata.team] || 0) + 1;
        }
        if (entity.metadata?.source === 'batch') batchCount++;
        if (entity.metadata?.source === 'online') onlineCount++;
      });

      state.stats = {
        entityCount: action.payload.entities.length,
        relationCount: action.payload.relations.length,
        teamCounts,
        sourceCounts: { batch: batchCount, online: onlineCount },
      };
    },

    // Start loading
    startLoading: (state) => {
      state.isLoading = true;
      state.error = null;
    },

    // Finish loading with success
    loadSuccess: (state, action: PayloadAction<{ entities: Entity[]; relations: Relation[] }>) => {
      state.isLoading = false;
      state.entities = action.payload.entities;
      state.relations = action.payload.relations;
      state.lastUpdated = new Date().toISOString();
      state.error = null;

      // Calculate stats
      const teamCounts: Record<string, number> = {};
      let batchCount = 0;
      let onlineCount = 0;

      action.payload.entities.forEach(entity => {
        if (entity.metadata?.team) {
          teamCounts[entity.metadata.team] = (teamCounts[entity.metadata.team] || 0) + 1;
        }
        if (entity.metadata?.source === 'batch') batchCount++;
        if (entity.metadata?.source === 'online') onlineCount++;
      });

      state.stats = {
        entityCount: action.payload.entities.length,
        relationCount: action.payload.relations.length,
        teamCounts,
        sourceCounts: { batch: batchCount, online: onlineCount },
      };
    },

    // Finish loading with error
    loadFailure: (state, action: PayloadAction<string>) => {
      state.isLoading = false;
      state.error = action.payload;
    },

    // Clear graph
    clearGraph: (state) => {
      state.entities = [];
      state.relations = [];
      state.stats = {
        entityCount: 0,
        relationCount: 0,
        sourceCounts: { batch: 0, online: 0 },
      };
      state.error = null;
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },
  },
  // Handle async thunk actions
  extraReducers: (builder) => {
    // We need to import the thunks in a way that avoids circular dependencies
    // The thunks will be added via builder.addCase when the module is loaded
    // For now, we'll use addMatcher to catch all fulfilled async thunks
    builder.addMatcher(
      (action) => action.type.endsWith('/pending') && action.type.startsWith('graph/'),
      (state) => {
        state.isLoading = true;
        state.error = null;
      }
    );
    builder.addMatcher(
      (action) => action.type.endsWith('/fulfilled') && action.type.startsWith('graph/loadData'),
      (state, action: any) => {
        state.isLoading = false;
        state.entities = action.payload.entities;
        state.relations = action.payload.relations;
        state.lastUpdated = new Date().toISOString();
        state.error = null;

        // Calculate stats
        const teamCounts: Record<string, number> = {};
        let batchCount = 0;
        let onlineCount = 0;

        action.payload.entities.forEach((entity: Entity) => {
          if (entity.metadata?.team) {
            teamCounts[entity.metadata.team] = (teamCounts[entity.metadata.team] || 0) + 1;
          }
          if (entity.metadata?.source === 'batch') batchCount++;
          if (entity.metadata?.source === 'online') onlineCount++;
        });

        state.stats = {
          entityCount: action.payload.entities.length,
          relationCount: action.payload.relations.length,
          teamCounts,
          sourceCounts: { batch: batchCount, online: onlineCount },
        };

        console.log(`✅ [GraphSlice] Updated stats:`, state.stats);
      }
    );
    builder.addMatcher(
      (action) => action.type.endsWith('/rejected') && action.type.startsWith('graph/'),
      (state, action: any) => {
        state.isLoading = false;
        state.error = action.payload || action.error?.message || 'Unknown error';
      }
    );
  },
});

export const {
  setGraphData,
  startLoading,
  loadSuccess,
  loadFailure,
  clearGraph,
  clearError,
} = graphSlice.actions;

export default graphSlice.reducer;
