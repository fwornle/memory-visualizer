/**
 * Filter Intents
 *
 * Actions for updating filters and triggering graph reloads.
 * These coordinate between filter state changes and data loading.
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import { setSelectedTeams, setDataSource, setAvailableEntityTypes, setAvailableRelationTypes } from '../store/slices/filtersSlice';
import { loadGraphData, loadAvailableTeams } from './graphIntents';
import type { DataSource } from '../store/slices/filtersSlice';
import type { RootState } from '../store';

/**
 * Update team filter and reload graph data
 */
export const updateTeamFilter = createAsyncThunk<void, string[], { state: RootState }>(
  'filters/updateTeams',
  async (teams, { dispatch }) => {
    // Update filter state
    dispatch(setSelectedTeams(teams));
    // Reload graph data with new filter
    await dispatch(loadGraphData({ teams })).unwrap();
  }
);

/**
 * Update source filter and reload graph data
 */
export const updateSourceFilter = createAsyncThunk<void, DataSource, { state: RootState }>(
  'filters/updateSource',
  async (source, { dispatch, getState }) => {
    // Update filter state
    dispatch(setDataSource(source));

    // Map UI source to DB source
    const dbSource = source === 'batch' ? 'manual' : source === 'online' ? 'auto' : undefined;

    // Reload graph data with new filter
    const state = getState();
    await dispatch(loadGraphData({
      teams: state.filters.selectedTeams,
      source: dbSource
    })).unwrap();
  }
);

/**
 * Initialize teams on app start
 */
export const initializeTeams = createAsyncThunk<void, void, { state: RootState }>(
  'filters/initializeTeams',
  async (_, { dispatch, getState }) => {
    // Load available teams from database
    const teams = await dispatch(loadAvailableTeams()).unwrap();

    // Set default selection to all teams if none selected
    const state = getState();
    if (state.filters.selectedTeams.length === 0) {
      const allTeamNames = teams.map(t => t.name);
      dispatch(setSelectedTeams(allTeamNames));
    }
  }
);

/**
 * Update available entity and relation types based on current graph data
 */
export const updateAvailableTypes = createAsyncThunk<void, void, { state: RootState }>(
  'filters/updateAvailableTypes',
  async (_, { dispatch, getState }) => {
    const state = getState();
    const { entities, relations } = state.graph;

    // Extract unique entity types
    const entityTypes = ['All', ...new Set(entities.map(e => e.entityType))];
    dispatch(setAvailableEntityTypes(entityTypes));

    // Extract unique relation types
    const relationTypes = ['All', ...new Set(relations.map(r => r.relationType || r.type || '').filter(Boolean))];
    dispatch(setAvailableRelationTypes(relationTypes));
  }
);
