/**
 * Node Details Component
 *
 * Displays detailed information about the selected node including
 * observations, metadata, and related entities.
 */

import React, { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectNode, navigateBack, navigateForward } from '../../store/slices/navigationSlice';
import { deleteEntity } from '../../intents/graphIntents';
import { ConfirmDialog } from '../ConfirmDialog';

interface NodeDetailsProps {
  onOpenMarkdown: (filePath: string) => void;
  searchTerm?: string;
}

export const NodeDetails: React.FC<NodeDetailsProps> = ({ onOpenMarkdown, searchTerm }) => {
  const dispatch = useAppDispatch();
  const { selectedNode, nodeHistory, nodeHistoryIndex } = useAppSelector(
    state => state.navigation
  );
  const { relations } = useAppSelector(state => state.graph);

  // State for delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!selectedNode) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Select a node to view details</p>
      </div>
    );
  }

  // Find relations involving this node
  const outgoing = relations.filter(r => r.from === selectedNode.name);
  const incoming = relations.filter(r => r.to === selectedNode.name);

  const handleClose = () => {
    dispatch(selectNode(null));
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    const team = selectedNode.metadata?.team || 'coding';

    try {
      setIsDeleting(true);
      await dispatch(deleteEntity({ name: selectedNode.name, team })).unwrap();

      // Close the sidebar after successful deletion
      dispatch(selectNode(null));

      // Close the dialog
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete entity:', error);
      alert(`Failed to delete entity: ${error}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  const canGoBack = nodeHistoryIndex > 0;
  const canGoForward = nodeHistoryIndex < nodeHistory.length - 1;

  // Helper to highlight search term matches
  const highlightText = (text: string): JSX.Element[] => {
    if (!searchTerm || !text) return [<span key={0}>{text}</span>];

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (part.toLowerCase() === searchTerm.toLowerCase()) {
        return (
          <mark key={index} className="bg-yellow-200 font-semibold">
            {part}
          </mark>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  // Helper to render text with clickable links and highlighting
  const renderTextWithLinks = (text: string | null | undefined) => {
    if (!text || typeof text !== 'string') return null;

    const urlPattern = /((?:https?|file):\/\/[^\s,]+|[^\s,]*\.md)/g;
    const parts = text.split(urlPattern);

    return parts.map((part, index) => {
      if (urlPattern.test(part)) {
        const isMarkdownFile = part.endsWith('.md') && !part.includes('://');
        const isLocalMarkdown = part.includes('localhost:8080') && part.endsWith('.md');

        if (isMarkdownFile || isLocalMarkdown) {
          const relativePath = isLocalMarkdown
            ? part.replace('http://localhost:8080/', '')
            : part;
          // Extract just the filename for display
          const displayName = relativePath.split('/').pop()?.replace('.md', '') || relativePath;
          return (
            <button
              key={index}
              onClick={(e) => {
                e.preventDefault();
                onOpenMarkdown(relativePath);
              }}
              className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
              title={relativePath} // Show full path on hover
            >
              {displayName}
            </button>
          );
        } else {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              {part}
            </a>
          );
        }
      }
      // Apply highlighting to non-URL text
      return <span key={index}>{highlightText(part)}</span>;
    });
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-800">Node Details</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>

        {/* Navigation and Delete buttons */}
        <div className="flex gap-2 justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => dispatch(navigateBack())}
              disabled={!canGoBack}
              className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Back
            </button>
            <button
              onClick={() => dispatch(navigateForward())}
              disabled={!canGoForward}
              className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Forward →
            </button>
          </div>

          {/* Delete button */}
          <button
            onClick={handleDeleteClick}
            disabled={isDeleting}
            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            title="Delete this entity and all its relationships"
          >
            {isDeleting ? '⏳' : '🗑️'} Delete
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Name and Type */}
        <div>
          <h4 className="text-2xl font-bold text-gray-900 mb-1">{highlightText(selectedNode.name)}</h4>
          <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
            {highlightText(selectedNode.entityType)}
          </span>
        </div>

        {/* Metadata */}
        {selectedNode.metadata && (
          <div className="bg-gray-50 rounded p-3 space-y-1 text-sm">
            {selectedNode.metadata.source && (
              <div className="flex justify-between">
                <span className="text-gray-600">Source:</span>
                <span className={`font-medium ${
                  selectedNode.metadata.source === 'online' ? 'text-red-600' : 'text-blue-600'
                }`}>
                  {selectedNode.metadata.source}
                </span>
              </div>
            )}
            {selectedNode.metadata.team && (
              <div className="flex justify-between">
                <span className="text-gray-600">Team:</span>
                <span className="font-medium">{selectedNode.metadata.team}</span>
              </div>
            )}
            {selectedNode.metadata.confidence !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Confidence:</span>
                <span className="font-medium">{(selectedNode.metadata.confidence * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Observations */}
        {selectedNode.observations && selectedNode.observations.length > 0 && (
          <div>
            <h5 className="font-semibold text-gray-700 mb-2">Observations</h5>
            <ul className="space-y-2">
              {selectedNode.observations.map((obs, index) => {
                // Handle both string observations and object observations with content field
                const content = typeof obs === 'string' ? obs : obs?.content;
                return (
                  <li key={index} className="text-sm text-gray-700 pl-4 border-l-2 border-blue-200">
                    {renderTextWithLinks(content)}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Outgoing Relations */}
        {outgoing.length > 0 && (
          <div>
            <h5 className="font-semibold text-gray-700 mb-2">Outgoing Relations ({outgoing.length})</h5>
            <div className="space-y-1">
              {outgoing.map((rel, index) => (
                <div key={index} className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                  <span className="font-medium text-gray-900">{selectedNode.name}</span>
                  {' → '}
                  <span className="text-blue-600">{rel.relationType || rel.type}</span>
                  {' → '}
                  <span className="font-medium text-gray-900">{rel.to}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Incoming Relations */}
        {incoming.length > 0 && (
          <div>
            <h5 className="font-semibold text-gray-700 mb-2">Incoming Relations ({incoming.length})</h5>
            <div className="space-y-1">
              {incoming.map((rel, index) => (
                <div key={index} className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                  <span className="font-medium text-gray-900">{rel.from}</span>
                  {' → '}
                  <span className="text-blue-600">{rel.relationType || rel.type}</span>
                  {' → '}
                  <span className="font-medium text-gray-900">{selectedNode.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Entity"
        message={`Are you sure you want to delete "${selectedNode.name}"? This will also delete all ${outgoing.length + incoming.length} relationship(s) connected to this entity. This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700 text-white"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
};
