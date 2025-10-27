/**
 * Graph Intents
 *
 * Async thunks for loading graph data from the database.
 * These are the "intent" layer in MVI architecture - handling side effects.
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import { DatabaseClient } from '../api/databaseClient';
import type { Entity, Relation } from '../store/slices/graphSlice';
import type { DataSource } from '../store/slices/filtersSlice';
import type { RootState } from '../store';

// VKB server runs on port 8080
const dbClient = new DatabaseClient('http://localhost:8080');

/**
 * Check database health
 */
export const checkDatabaseHealth = createAsyncThunk(
  'graph/checkHealth',
  async (_, { rejectWithValue }) => {
    try {
      const health = await dbClient.checkHealth();
      return health;
    } catch (error) {
      console.warn('⚠️ Database health check failed:', error);
      return rejectWithValue('Database unavailable');
    }
  }
);

/**
 * Load available teams from the database
 */
export const loadAvailableTeams = createAsyncThunk(
  'graph/loadTeams',
  async (_, { rejectWithValue }) => {
    try {
      const teams = await dbClient.getTeams();
      return teams;
    } catch (error) {
      console.error('Failed to load teams:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to load teams');
    }
  }
);

interface LoadGraphDataParams {
  teams?: string | string[];
  source?: 'manual' | 'auto';
}

/**
 * Load graph data from database
 * This is the main data loading intent that respects both filters independently
 */
export const loadGraphData = createAsyncThunk<
  {
    entities: Entity[];
    relations: Relation[];
    availableEntityTypes: string[];
    availableRelationTypes: string[];
  },
  LoadGraphDataParams | undefined,
  { state: RootState }
>(
  'graph/loadData',
  async (params, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const { selectedTeams, dataSource } = state.filters;

      // Determine which teams to query
      const teams = params?.teams !== undefined ? params.teams : selectedTeams;

      // Determine source filter based on dataSource
      // batch -> manual, online -> auto, combined -> undefined (all)
      let sourceFilter: 'manual' | 'auto' | undefined;
      if (params?.source !== undefined) {
        sourceFilter = params.source;
      } else {
        if (dataSource === 'batch') {
          sourceFilter = 'manual';
        } else if (dataSource === 'online') {
          sourceFilter = 'auto';
        } else {
          sourceFilter = undefined; // combined mode
        }
      }

      console.log(`📊 [Intent] Loading graph data:`, {
        teams: Array.isArray(teams) ? teams.join(', ') : teams || 'all',
        sourceFilter: sourceFilter || 'all',
        dataSource,
      });

      // Load from database
      console.log(`🔍 [Intent] Calling dbClient.loadKnowledgeGraph with:`, { teams, sourceFilter });
      const graphData = await dbClient.loadKnowledgeGraph(teams, sourceFilter);
      console.log(`🔍 [Intent] Raw graphData received:`, {
        entitiesCount: graphData.entities?.length,
        relationsCount: graphData.relations?.length,
        sampleEntity: graphData.entities?.[0]
      });

      // Transform to component format with proper source mapping
      console.log(`🔍 [Intent] Starting entity transformation...`);
      console.log(`🔍 [Intent] First entity structure:`, graphData.entities[0]);

      const entities: Entity[] = graphData.entities.map((e, index) => {
        if (index === 0) {
          console.log(`🔍 [Intent] Mapping first entity:`, {
            hasId: !!e.id,
            hasName: !!e.name,
            hasEntityType: !!e.entityType,
            hasSource: !!e.source,
            source: e.source,
            allKeys: Object.keys(e)
          });
        }
        return {
          id: e.id,
          name: e.name,
          entityType: e.entityType,
          observations: e.observations || [],
          type: 'entity',
          _source: 'database',
          metadata: {
            source: e.source === 'manual' ? 'batch' : 'online', // Transform DB source to UI source
            team: e.team,
            confidence: e.confidence,
            lastModified: e.lastModified,
            teams: e.metadata?.teams,
          },
        };
      });
      console.log(`🔍 [Intent] After entity mapping, count: ${entities.length}`);

      // Debug: Check if TestOnlinePattern exists
      const testOnlineEntity = entities.find(e => e.name === 'TestOnlinePattern');
      console.log('🔍 [Intent] TestOnlinePattern entity:', testOnlineEntity ? 'FOUND' : 'NOT FOUND');
      if (testOnlineEntity) {
        console.log('🔍 [Intent] TestOnlinePattern details:', {
          id: testOnlineEntity.id,
          name: testOnlineEntity.name,
          source: testOnlineEntity.metadata?.source,
          team: testOnlineEntity.metadata?.team
        });
      }

      const relations: Relation[] = graphData.relations.map((r, index) => {
        // Debug first few relations to see structure
        if (index < 3) {
          console.log(`🔍 [Intent] Relation ${index}:`, {
            source: r.source,
            target: r.target,
            type: r.type,
            hasFromName: !!r.from_name,
            hasToName: !!r.to_name,
            from_name: r.from_name,
            to_name: r.to_name
          });
        }

        return {
          id: r.source + '-' + r.target,
          from: r.source,
          to: r.target,
          type: r.type,
          relationType: r.type,
          confidence: r.confidence,
          metadata: r.metadata,
        };
      });

      console.log(`✅ [Intent] Loaded ${entities.length} entities, ${relations.length} relations`);

      // Log source distribution for debugging
      const sourceCount = entities.reduce((acc, e) => {
        const source = e.metadata?.source || 'unknown';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`📊 [Intent] Source distribution:`, sourceCount);

      // Extract unique entity types and relation types for filter dropdowns
      const uniqueEntityTypes = Array.from(new Set(entities.map(e => e.entityType))).sort();
      const uniqueRelationTypes = Array.from(new Set(relations.map(r => r.type || r.relationType))).sort();

      // Return data along with available types
      return {
        entities,
        relations,
        availableEntityTypes: ['All', ...uniqueEntityTypes],
        availableRelationTypes: ['All', ...uniqueRelationTypes]
      };
    } catch (error) {
      console.error('Failed to load graph data:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to load graph data');
    }
  }
);

/**
 * Refresh graph data using current filter state
 */
export const refreshGraphData = createAsyncThunk<
  { entities: Entity[]; relations: Relation[] },
  void,
  { state: RootState }
>(
  'graph/refresh',
  async (_, { dispatch }) => {
    // Simply trigger loadGraphData which will use current state
    const result = await dispatch(loadGraphData()).unwrap();
    return result;
  }
);

/**
 * Load graph statistics
 */
export const loadGraphStats = createAsyncThunk<
  any,
  string | undefined,
  { state: RootState }
>(
  'graph/loadStats',
  async (team, { rejectWithValue }) => {
    try {
      const stats = await dbClient.getStatistics(team);
      return stats;
    } catch (error) {
      console.error('Failed to load stats:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to load stats');
    }
  }
);
