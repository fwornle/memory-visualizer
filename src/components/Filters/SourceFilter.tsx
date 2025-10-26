/**
 * Source Filter Component
 *
 * Radio buttons for selecting data source: batch (manual), online (auto), or combined.
 * Connected to Redux filters slice.
 */

import React from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setDataSource } from '../../store/slices/filtersSlice';
import type { DataSource } from '../../store/slices/filtersSlice';

export const SourceFilter: React.FC = () => {
  const dispatch = useAppDispatch();
  const dataSource = useAppSelector(state => state.filters.dataSource);

  const handleChange = (source: DataSource) => {
    dispatch(setDataSource(source));
  };

  const options: Array<{ value: DataSource; label: string; description: string }> = [
    {
      value: 'batch',
      label: 'Batch',
      description: 'Manual/UKB learned knowledge',
    },
    {
      value: 'online',
      label: 'Online',
      description: 'Auto-learned knowledge',
    },
    {
      value: 'combined',
      label: 'Combined',
      description: 'All knowledge sources',
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Learning Source</h3>
      <div className="space-y-2">
        {options.map(option => (
          <label
            key={option.value}
            className="flex items-start space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded"
          >
            <input
              type="radio"
              name="dataSource"
              value={option.value}
              checked={dataSource === option.value}
              onChange={() => handleChange(option.value)}
              className="mt-1 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">{option.label}</div>
              <div className="text-xs text-gray-500">{option.description}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-600">
          <p className="mb-1">
            <span className="inline-block w-3 h-3 bg-blue-200 rounded-full mr-1"></span>
            <span className="font-medium">Batch:</span> Light blue nodes
          </p>
          <p>
            <span className="inline-block w-3 h-3 bg-red-200 rounded-full mr-1"></span>
            <span className="font-medium">Online:</span> Light red nodes
          </p>
        </div>
      </div>
    </div>
  );
};
