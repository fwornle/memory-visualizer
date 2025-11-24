/**
 * Undo Toast Component
 *
 * Displays a toast notification after entity deletion with an undo button.
 * Auto-dismisses after 10 seconds if not interacted with.
 */

import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { restoreEntity } from '../intents/graphIntents';

export const UndoToast: React.FC = () => {
  const dispatch = useAppDispatch();
  const undoStack = useAppSelector(state => state.graph.undoStack);
  const [isVisible, setIsVisible] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  // Get the most recent deletion
  const lastDeleted = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;

  // Show toast when a new deletion occurs
  useEffect(() => {
    if (lastDeleted) {
      setIsVisible(true);

      // Auto-hide after 10 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 10000);

      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [lastDeleted]);

  const handleUndo = async () => {
    if (!lastDeleted || isUndoing) return;

    try {
      setIsUndoing(true);
      await dispatch(restoreEntity({
        entity: lastDeleted.entity,
        relations: lastDeleted.relations,
        team: lastDeleted.entity.metadata?.team || 'coding'
      })).unwrap();

      // Hide toast after successful undo
      setIsVisible(false);
    } catch (error) {
      console.error('Failed to undo deletion:', error);
      alert(`Failed to undo deletion: ${error}`);
    } finally {
      setIsUndoing(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible || !lastDeleted) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div className="bg-gray-900 text-white rounded-lg shadow-lg p-4 flex items-center gap-3 min-w-[320px]">
        <div className="flex-1">
          <p className="text-sm font-medium">
            Deleted "{lastDeleted.entity.name}"
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {lastDeleted.relations.length} relation{lastDeleted.relations.length !== 1 ? 's' : ''} removed
          </p>
        </div>

        <button
          onClick={handleUndo}
          disabled={isUndoing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm font-medium transition-colors"
        >
          {isUndoing ? 'Undoing...' : 'Undo'}
        </button>

        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};
