/**
 * History Sidebar
 *
 * Displays a chronological list of insights (entities) ordered by creation time.
 * - Shows newest insights at the top
 * - Displays entity name and creation timestamp
 * - Applies filters (teams, source/batch/online)
 * - Clicking an item selects the corresponding node in the graph and opens details
 * - Only visible when no node is selected (hidden when NodeDetails is open)
 */

import React, { useMemo } from 'react';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectNode } from '../../store/slices/navigationSlice';
import { Entity } from '../../store/slices/graphSlice';

export const HistorySidebar: React.FC = () => {
  const dispatch = useAppDispatch();
  const { entities } = useAppSelector(state => state.graph);
  const { selectedTeams, dataSource } = useAppSelector(state => state.filters);
  const { selectedNode } = useAppSelector(state => state.navigation);

  // Don't show history sidebar when a node is selected (NodeDetails is open)
  if (selectedNode) {
    return null;
  }

  // Filter and sort entities
  const historyItems = useMemo(() => {
    console.log('[HistorySidebar] Starting filter');
    console.log('[HistorySidebar] Total entities:', entities.length);
    console.log('[HistorySidebar] Sample entity:', entities[0]);
    console.log('[HistorySidebar] selectedTeams:', selectedTeams);
    console.log('[HistorySidebar] dataSource:', dataSource);

    let filtered = entities;

    // Apply team filter
    if (selectedTeams.length > 0) {
      console.log('[HistorySidebar] Applying team filter...');
      filtered = filtered.filter(entity => {
        // graphIntents transforms to entity.metadata.team, NOT top-level
        const entityTeam = entity.metadata?.team;
        const matches = entityTeam && selectedTeams.includes(entityTeam);
        console.log(`[HistorySidebar] Entity "${entity.name}": team="${entityTeam}", matches=${matches}`);
        if (!entityTeam) return false;
        return selectedTeams.includes(entityTeam);
      });
      console.log('[HistorySidebar] After team filter:', filtered.length);
    }

    // Apply source filter (batch/online/combined)
    if (dataSource !== 'combined') {
      console.log('[HistorySidebar] Applying source filter, expecting:', dataSource);
      const beforeCount = filtered.length;
      filtered = filtered.filter(entity => {
        // graphIntents transforms API's 'manual'/'auto' to UI's 'batch'/'online' in metadata
        const entitySource = entity.metadata?.source;
        const matches = entitySource === dataSource;
        console.log(`[HistorySidebar] Entity "${entity.name}": source="${entitySource}", expected="${dataSource}", matches=${matches}`);
        return matches;
      });
      console.log(`[HistorySidebar] After source filter: ${filtered.length} (was ${beforeCount})`);
    }

    // Sort by creation time (newest first)
    const sorted = [...filtered].sort((a, b) => {
      // graphIntents puts lastModified in metadata
      const timeA = a.metadata?.lastModified || '0';
      const timeB = b.metadata?.lastModified || '0';
      return timeB.localeCompare(timeA); // Descending order
    });

    console.log('[HistorySidebar] Final sorted count:', sorted.length);
    return sorted;
  }, [entities, selectedTeams, dataSource]);

  const handleItemClick = (entity: Entity) => {
    // Create a node object compatible with the navigation slice
    // CRITICAL: Use entity.name as ID to match D3 graph nodes (see graphHelpers.ts:177)
    const node = {
      id: entity.name,
      name: entity.name,
      entityType: entity.entityType,
      observations: entity.observations,
      metadata: entity.metadata
    };

    // Select the node (this will open NodeDetails and hide HistorySidebar)
    dispatch(selectNode(node));
  };

  const formatTimestamp = (timestamp?: string): string => {
    if (!timestamp) return 'Unknown';

    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      // Format as date
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const getSourceBadgeColor = (source?: string): string => {
    if (source === 'batch') return 'bg-blue-100 text-blue-800';
    if (source === 'online') return 'bg-pink-100 text-pink-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="w-80 bg-gray-50 border-l border-gray-200 overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <h2 className="text-lg font-semibold text-gray-800">History</h2>
        <p className="text-xs text-gray-600 mt-1">
          {historyItems.length} insight{historyItems.length !== 1 ? 's' : ''} • Newest first
        </p>
      </div>

      <div className="p-2 space-y-1">
        {historyItems.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500">
            <p>No insights found</p>
            <p className="text-xs mt-1">Adjust filters to see more</p>
          </div>
        ) : (
          historyItems.map((entity, index) => {
            const timestamp = entity.metadata?.lastModified;
            const source = entity.metadata?.source;

            return (
              <button
                key={`${entity.id}-${index}`}
                onClick={() => handleItemClick(entity)}
                className="w-full text-left bg-white hover:bg-blue-50 border border-gray-200 rounded-lg p-3 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm text-gray-900 truncate group-hover:text-blue-600">
                      {entity.name}
                    </h3>
                    <p className="text-xs text-gray-600 mt-0.5 truncate">
                      {entity.entityType}
                    </p>
                  </div>
                  {source && (
                    <span
                      className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${getSourceBadgeColor(
                        source
                      )}`}
                    >
                      {source === 'batch' ? 'Manual' : 'Auto'}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {formatTimestamp(timestamp)}
                  </span>
                  {entity.metadata?.team && (
                    <span className="text-xs font-medium text-gray-600">
                      {entity.metadata.team}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
