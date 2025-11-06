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
import { HistorySidebar } from './HistorySidebar';

export const KnowledgeGraph: React.FC<{ onOpenMarkdown: (filePath: string) => void }> = ({
  onOpenMarkdown,
}) => {
  const dispatch = useAppDispatch();
  const { isLoading, error, stats } = useAppSelector(state => state.graph);
  const { selectedTeams, dataSource, searchTerm } = useAppSelector(state => state.filters);
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
        // GraphDB is REQUIRED for knowledge data (SQLite is metadata only)
        const isHealthy = health.status === 'healthy' || health.status === 'degraded';
        const hasGraphDB = health.graph === true;
        dispatch(setDbHealthy(isHealthy && hasGraphDB));
        dispatch(setUseDatabase(true));
        console.log('✅ Database health:', health, 'dbHealthy:', isHealthy && hasGraphDB);
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
      <div className="w-80 bg-gray-50 border-r border-gray-200 overflow-y-auto p-3 space-y-2">
        <div className="bg-white rounded-lg shadow p-2">
          <h1 className="text-base font-bold text-gray-800">Knowledge Graph</h1>
          <p className="text-xs text-gray-600 mt-0.5">
            {dbHealthy ? '🟢 Database Connected' : '🔴 Database Unavailable'}
          </p>
        </div>

        <SourceFilter />
        <TeamFilter />
        <SearchFilter />
        <TypeFilters />
      </div>

      {/* Main graph area */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Graph Visualization</h2>
          <div className="flex items-center gap-6">
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-gray-600">
              <span className="font-semibold">Node Colors:</span>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: '#ADD8E6'}}></div>
                <span>Batch/Manual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: '#FFB6C1'}}></div>
                <span>Online/Auto</span>
              </div>
            </div>
            {/* Statistics */}
            {stats && (
              <div className="text-sm text-gray-600">
                {stats.entityCount} entities, {stats.relationCount} relations
              </div>
            )}
          </div>
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
          <NodeDetails onOpenMarkdown={onOpenMarkdown} searchTerm={searchTerm} />
        </div>
      )}

      {/* History Sidebar (shows on right when no node selected) */}
      {!selectedNode && <HistorySidebar />}
    </div>
  );
};
