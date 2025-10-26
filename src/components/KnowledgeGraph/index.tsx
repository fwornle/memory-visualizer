/**
 * Knowledge Graph Container (Minimal MVP)
 *
 * Main container that integrates filters and graph visualization.
 * This is a minimal version to test the Redux architecture.
 */

import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { loadPersistedFilters } from '../../store/slices/filtersSlice';
import { loadGraphData, checkDatabaseHealth, loadAvailableTeams } from '../../intents/graphIntents';
import { setDbHealthy, setUseDatabase } from '../../store/slices/uiSlice';
import { TeamFilter } from '../Filters/TeamFilter';
import { SourceFilter } from '../Filters/SourceFilter';
import { SearchFilter } from '../Filters/SearchFilter';
import { TypeFilters } from '../Filters/TypeFilters';
import { GraphVisualization } from './GraphVisualization';
import { NodeDetails } from './NodeDetails';

export const KnowledgeGraph: React.FC<{ onOpenMarkdown: (filePath: string) => void }> = ({
  onOpenMarkdown,
}) => {
  const dispatch = useAppDispatch();
  const { isLoading, error, stats } = useAppSelector(state => state.graph);
  const { selectedTeams, dataSource } = useAppSelector(state => state.filters);
  const { dbHealthy } = useAppSelector(state => state.ui);
  const { selectedNode } = useAppSelector(state => state.navigation);

  // Initialize on mount
  useEffect(() => {
    const initialize = async () => {
      // Load persisted filters
      dispatch(loadPersistedFilters());

      // Check database health
      try {
        const health = await dispatch(checkDatabaseHealth()).unwrap();
        // Accept both 'healthy' and 'degraded' as valid (degraded means Qdrant is down but GraphDB works)
        const isHealthy = health.status === 'healthy' || health.status === 'degraded';
        dispatch(setDbHealthy(isHealthy && health.graph === true));
        dispatch(setUseDatabase(true));
        console.log('✅ Database health:', health, 'dbHealthy:', isHealthy && health.graph === true);
      } catch (error) {
        console.warn('⚠️ Database unavailable:', error);
        dispatch(setDbHealthy(false));
        dispatch(setUseDatabase(false));
      }

      // Load available teams
      await dispatch(loadAvailableTeams());
    };

    initialize();
  }, [dispatch]);

  // Load graph data when teams or dataSource changes
  useEffect(() => {
    if (selectedTeams.length > 0 && dbHealthy) {
      const sourceFilter =
        dataSource === 'batch' ? 'manual' : dataSource === 'online' ? 'auto' : undefined;

      dispatch(loadGraphData({ teams: selectedTeams, source: sourceFilter }));
    }
  }, [selectedTeams, dataSource, dbHealthy, dispatch]);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar with filters */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 overflow-y-auto p-4 space-y-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h1 className="text-xl font-bold text-gray-800">Knowledge Graph</h1>
          <p className="text-sm text-gray-600 mt-1">
            {dbHealthy ? '🟢 Database Connected' : '🔴 Database Unavailable'}
          </p>
        </div>

        <SourceFilter />
        <TeamFilter />
        <SearchFilter />
        <TypeFilters />

        {stats && (
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Statistics</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Entities:</span>
                <span className="font-medium">{stats.entityCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Relations:</span>
                <span className="font-medium">{stats.relationCount}</span>
              </div>
              {stats.sourceCounts && (
                <>
                  <div className="flex justify-between text-blue-600">
                    <span>Batch:</span>
                    <span className="font-medium">{stats.sourceCounts.batch}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Online:</span>
                    <span className="font-medium">{stats.sourceCounts.online}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main graph area */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Graph Visualization</h2>
          {stats && (
            <div className="text-sm text-gray-600">
              {stats.entityCount} entities, {stats.relationCount} relations
            </div>
          )}
        </div>

        <div className="flex-1 relative bg-gray-50">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-600">Loading graph data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-red-600">
                <p className="text-lg font-semibold">Error</p>
                <p className="mt-2">{error}</p>
              </div>
            </div>
          ) : stats && stats.entityCount > 0 ? (
            <GraphVisualization />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <p className="text-lg">No data to display</p>
                <p className="mt-2 text-sm">Select teams and filters to view the knowledge graph</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Node Details Sidebar (slides in from right when node selected) */}
      {selectedNode && (
        <div className="w-96 bg-white border-l border-gray-200 overflow-hidden">
          <NodeDetails onOpenMarkdown={onOpenMarkdown} />
        </div>
      )}
    </div>
  );
};
