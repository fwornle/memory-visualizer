/**
 * Team Filter Component
 *
 * Provides UI for selecting which teams to display in the graph.
 * Connected to Redux filters slice.
 */

import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { toggleTeam, setSelectedTeams } from '../../store/slices/filtersSlice';
import { loadAvailableTeams } from '../../intents/graphIntents';

export const TeamFilter: React.FC = () => {
  const dispatch = useAppDispatch();
  const { selectedTeams, availableTeams } = useAppSelector(state => state.filters);

  // Load available teams on mount
  useEffect(() => {
    dispatch(loadAvailableTeams());
  }, [dispatch]);

  const handleToggle = (teamName: string) => {
    dispatch(toggleTeam(teamName));
  };

  const handleSelectAll = () => {
    const allTeams = availableTeams.map(t => t.name);
    dispatch(setSelectedTeams(allTeams));
  };

  const handleClearAll = () => {
    dispatch(setSelectedTeams([]));
  };

  const allSelected = availableTeams.length > 0 && selectedTeams.length === availableTeams.length;
  const noneSelected = selectedTeams.length === 0;

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Teams / Views</h3>
        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            disabled={allSelected}
            className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            All
          </button>
          <button
            onClick={handleClearAll}
            disabled={noneSelected}
            className="text-xs px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            None
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {availableTeams.length === 0 ? (
          <p className="text-xs text-gray-500">Loading teams...</p>
        ) : (
          availableTeams.map(team => {
            const isSelected = selectedTeams.includes(team.name);
            return (
              <label
                key={team.name}
                className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggle(team.name)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 flex-1">
                  {team.displayName}
                </span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {team.entityCount}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
};
