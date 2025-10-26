/**
 * Search Filter Component
 *
 * Search input for filtering entities by name, type, or observations.
 * Connected to Redux filters slice.
 */

import React from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setSearchTerm, clearSearch } from '../../store/slices/filtersSlice';

export const SearchFilter: React.FC = () => {
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector(state => state.filters.searchTerm);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setSearchTerm(e.target.value));
  };

  const handleClear = () => {
    dispatch(clearSearch());
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Search</h3>
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={handleChange}
          placeholder="Search entities..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searchTerm && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Search by entity name, type, or observations
      </p>
    </div>
  );
};
