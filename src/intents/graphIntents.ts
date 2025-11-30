/**
 * Graph Intents
 *
 * Async thunks for loading graph data from the database.
 * These are the "intent" layer in MVI architecture - handling side effects.
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import { DatabaseClient } from '../api/databaseClient';
import type { Entity, Relation, DiffStats } from '../store/slices/graphSlice';
import type { DataSource } from '../store/slices/filtersSlice';
import type { RootState } from '../store';

// LocalStorage key for baseline snapshot
const BASELINE_STORAGE_KEY = 'vkb-entity-baseline';

interface EntityBaseline {
  observationCount: number;
  lastModified: string | null;
  seenAt: string; // When this entity was first seen/marked as read
}

interface BaselineSnapshot {
  entities: Record<string, EntityBaseline>; // key is entity name
  savedAt: string; // When baseline was last saved
}

// Load baseline from localStorage
function loadBaseline(): BaselineSnapshot | null {
  try {
    const stored = localStorage.getItem(BASELINE_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('[VKB] Failed to load baseline from localStorage:', e);
  }
  return null;
}

// Save baseline to localStorage
function saveBaseline(snapshot: BaselineSnapshot): void {
  try {
    localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.warn('[VKB] Failed to save baseline to localStorage:', e);
  }
}

// Helper to calculate diff stats for an entity using localStorage baseline
function calculateDiffStats(entity: any, baseline: BaselineSnapshot | null): DiffStats {
  const diffStats: DiffStats = {};
  const entityName = entity.name;
  const currentObsCount = entity.observations?.length || 0;
  const currentLastModified = entity.lastModified || null;

  // If no baseline exists, this is first load - no badges shown
  if (!baseline) {
    return diffStats;
  }

  const baselineEntry = baseline.entities[entityName];

  if (!baselineEntry) {
    // Entity didn't exist in baseline - it's NEW
    diffStats.isNew = true;
  } else {
    // Entity exists in baseline - check for observation changes
    const previousObsCount = baselineEntry.observationCount || 0;

    if (currentObsCount > previousObsCount) {
      diffStats.observationsAdded = currentObsCount - previousObsCount;
      diffStats.hasSignificantChanges = true;
    }

    // Check if lastModified changed (indicates any content update)
    if (currentLastModified && baselineEntry.lastModified &&
        currentLastModified !== baselineEntry.lastModified) {
      diffStats.hasSignificantChanges = true;
    }

    diffStats.previousObservationCount = previousObsCount;
  }

  return diffStats;
}

// Export function to update baseline (call when user wants to "mark all as read")
export function updateBaseline(entities: Entity[]): void {
  const newBaseline: BaselineSnapshot = {
    entities: {},
    savedAt: new Date().toISOString()
  };

  for (const entity of entities) {
    newBaseline.entities[entity.name] = {
      observationCount: entity.observations?.length || 0,
      lastModified: entity.metadata?.lastModified || null,
      seenAt: new Date().toISOString()
    };
  }

  saveBaseline(newBaseline);
  console.log('[VKB] Baseline updated with', Object.keys(newBaseline.entities).length, 'entities');
}

// Export function to check if baseline exists
export function hasBaseline(): boolean {
  return loadBaseline() !== null;
}

// Export function to get baseline age in hours
export function getBaselineAge(): number | null {
  const baseline = loadBaseline();
  if (!baseline) return null;
  const savedAt = new Date(baseline.savedAt);
  const now = new Date();
  return (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60);
}

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

      // Load baseline from localStorage for diff calculation
      const baseline = loadBaseline();
      console.log(`🔍 [Intent] Baseline loaded:`, baseline ? `${Object.keys(baseline.entities).length} entities, saved at ${baseline.savedAt}` : 'none (first load)');

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

        // Calculate diff stats by comparing with localStorage baseline
        const diffStats = calculateDiffStats(e, baseline);

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
            createdAt: e.createdAt || e.lastModified, // Use lastModified as fallback for createdAt
            teams: e.metadata?.teams,
            diffStats: diffStats,
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

/**
 * Delete an entity and all its relationships
 */
export const deleteEntity = createAsyncThunk<
  { deleted: string; team: string; deletedEntity: any },
  { name: string; team: string },
  { state: RootState }
>(
  'graph/deleteEntity',
  async ({ name, team }, { dispatch, rejectWithValue, getState }) => {
    try {
      console.log(`🗑️ [Intent] Deleting entity: ${name} (team: ${team})`);

      // Get entity data before deletion for undo capability
      const state = getState();
      const entityToDelete = state.graph.entities.find(e => e.name === name && e.metadata?.team === team);

      if (!entityToDelete) {
        throw new Error(`Entity "${name}" not found in current state`);
      }

      // Get all relations involving this entity for undo capability
      const relationsToDelete = state.graph.relations.filter(
        r => r.from === name || r.to === name
      );

      // Call the API to delete the entity
      const result = await dbClient.deleteEntity(name, team);

      console.log(`✅ [Intent] Entity deleted successfully:`, result);

      // Refresh graph data to reflect the deletion
      await dispatch(loadGraphData()).unwrap();

      return {
        deleted: name,
        team,
        deletedEntity: {
          entity: entityToDelete,
          relations: relationsToDelete,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Failed to delete entity:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to delete entity');
    }
  }
);

/**
 * Restore a deleted entity (undo deletion)
 */
export const restoreEntity = createAsyncThunk<
  { restored: string; team: string },
  { entity: any; relations: any[]; team: string },
  { state: RootState }
>(
  'graph/restoreEntity',
  async ({ entity, relations, team }, { dispatch, rejectWithValue }) => {
    try {
      console.log(`🔄 [Intent] Restoring entity: ${entity.name} (team: ${team})`);

      // Recreate the entity via API
      const entityData = {
        name: entity.name,
        entityType: entity.entityType,
        observations: entity.observations || [],
        significance: entity.metadata?.significance,
        team
      };

      await dbClient.createEntity(entityData);

      // Recreate all relations
      for (const relation of relations) {
        try {
          await dbClient.createRelation({
            from: relation.from,
            to: relation.to,
            relationType: relation.relationType || relation.type || 'related-to',
            team
          });
        } catch (error) {
          console.warn(`Failed to restore relation ${relation.from} → ${relation.to}:`, error);
        }
      }

      console.log(`✅ [Intent] Entity restored successfully: ${entity.name}`);

      // Refresh graph data to reflect the restoration
      await dispatch(loadGraphData()).unwrap();

      return {
        restored: entity.name,
        team
      };
    } catch (error) {
      console.error('Failed to restore entity:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to restore entity');
    }
  }
);
