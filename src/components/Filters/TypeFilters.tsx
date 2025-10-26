/**
 * Type Filters Component
 *
 * Dropdowns for filtering by entity type and relation type.
 * Connected to Redux filters slice.
 */

import React from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setEntityType, setRelationType } from '../../store/slices/filtersSlice';

export const TypeFilters: React.FC = () => {
  const dispatch = useAppDispatch();
  const { entityType, relationType, availableEntityTypes, availableRelationTypes } = useAppSelector(
    state => state.filters
  );

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Entity Type
        </label>
        <select
          value={entityType}
          onChange={(e) => dispatch(setEntityType(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {availableEntityTypes.map(type => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Relation Type
        </label>
        <select
          value={relationType}
          onChange={(e) => dispatch(setRelationType(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {availableRelationTypes.map(type => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
