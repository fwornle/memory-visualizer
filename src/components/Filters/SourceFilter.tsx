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
    <div className="bg-white rounded-lg shadow p-2">
      <h3 className="text-xs font-semibold text-gray-700 mb-1.5">Learning Source</h3>
      <div className="space-y-1">
        {options.map(option => (
          <label
            key={option.value}
            className="flex items-start space-x-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded"
          >
            <input
              type="radio"
              name="dataSource"
              value={option.value}
              checked={dataSource === option.value}
              onChange={() => handleChange(option.value)}
              className="mt-0.5 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="text-xs font-medium text-gray-900">{option.label}</div>
              <div className="text-[10px] text-gray-500 leading-tight">{option.description}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};
