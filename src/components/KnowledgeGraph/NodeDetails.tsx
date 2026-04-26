/**
 * Node Details Component
 *
 * Displays detailed information about the selected node including
 * observations, metadata, and related entities.
 */

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectNode, navigateBack, navigateForward } from '../../store/slices/navigationSlice';
import { deleteEntity } from '../../intents/graphIntents';
import { ConfirmDialog } from '../ConfirmDialog';

// Cache of existing insight file names (loaded once from /api/insight-files)
let insightFilesCache: Set<string> | null = null;
let insightFilesFetchPromise: Promise<void> | null = null;

function loadInsightFiles(): Promise<void> {
  if (insightFilesCache) return Promise.resolve();
  if (insightFilesFetchPromise) return insightFilesFetchPromise;
  insightFilesFetchPromise = fetch('/api/insight-files')
    .then(r => r.json())
    .then(data => { insightFilesCache = new Set(data.files || []); })
    .catch(() => { insightFilesCache = new Set(); });
  return insightFilesFetchPromise;
}

/** Insight document link — only shown if the insight .md file actually exists on server */
function InsightDocLink({ selectedNode, onOpenMarkdown }: { selectedNode: any; onOpenMarkdown: (p: string) => void }) {
  const [loaded, setLoaded] = useState(insightFilesCache !== null);
  const entityName = selectedNode?.entity_name || selectedNode?.name;

  useEffect(() => {
    if (!loaded) {
      loadInsightFiles().then(() => setLoaded(true));
    }
  }, [loaded]);

  if (!entityName || !loaded) return null;
  if (!insightFilesCache?.has(entityName)) return null;

  const insightPath = `knowledge-management/insights/${entityName}.md`;

  return (
    <div className="bg-green-50 rounded p-3">
      <button
        onClick={() => onOpenMarkdown(insightPath)}
        className="text-sm text-green-700 hover:text-green-900 font-medium underline flex items-center gap-1.5"
      >
        <span className="text-base">📄</span> View Insight Document
      </button>
    </div>
  );
}

interface NodeDetailsProps {
  onOpenMarkdown: (filePath: string) => void;
  searchTerm?: string;
}

/**
 * Render an observation as proper markdown — bullet lists, bold,
 * inline code, headings — instead of dumping raw markdown characters
 * inline with the prose. Preserves the existing "click an .md link
 * to open it in the in-app viewer" behavior for legacy observations
 * that still embed file paths.
 */
const ObservationMarkdown: React.FC<{ text: string | null | undefined; onOpenMarkdown: (path: string) => void }> = ({ text, onOpenMarkdown }) => {
  if (!text || typeof text !== 'string') return null;
  return (
    <div className="text-sm text-gray-700 leading-relaxed observation-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-sm">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ inline, children, ...rest }: any) =>
            inline ? (
              <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-800" {...rest}>{children}</code>
            ) : (
              <code className="font-mono text-xs" {...rest}>{children}</code>
            ),
          pre: ({ children }) => <pre className="bg-gray-50 p-2 rounded text-xs my-2 overflow-x-auto">{children}</pre>,
          h1: ({ children }) => <h4 className="text-base font-semibold mt-2 mb-1">{children}</h4>,
          h2: ({ children }) => <h5 className="text-sm font-semibold mt-2 mb-1">{children}</h5>,
          h3: ({ children }) => <h6 className="text-sm font-semibold mt-2 mb-1">{children}</h6>,
          h4: ({ children }) => <h6 className="text-sm font-semibold mt-2 mb-1">{children}</h6>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-gray-300 pl-3 my-1 text-gray-600 italic">{children}</blockquote>
          ),
          a: ({ href, children, ...rest }) => {
            const url = typeof href === 'string' ? href : '';
            // Intercept .md file references so they open in the
            // viewer's markdown panel instead of navigating away.
            const isMarkdownPath = /\.md(?:#.*)?$/i.test(url) && !/^https?:\/\//i.test(url);
            if (isMarkdownPath) {
              return (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); onOpenMarkdown(url); }}
                  className="text-blue-600 hover:text-blue-800 underline cursor-pointer bg-transparent p-0 border-0"
                  title={url}
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline" {...rest}>
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

export const NodeDetails: React.FC<NodeDetailsProps> = ({ onOpenMarkdown, searchTerm }) => {
  const dispatch = useAppDispatch();
  const { selectedNode, nodeHistory, nodeHistoryIndex } = useAppSelector(
    state => state.navigation
  );
  const { entities, relations } = useAppSelector(state => state.graph);

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

  // Relationship strength ranking — each child appears ONCE via its strongest relationship
  const RELATION_STRENGTH: Record<string, number> = {
    'contains': 10,
    'parent-child': 9,
    'extends': 8,
    'implements': 7,
    'includes': 6,
    'uses': 5,
    'depends_on': 4,
    'related_to': 3,
  };
  const getStrength = (type: string) => RELATION_STRENGTH[type] || 1;

  // Deduplicate by node pair, keeping only the strongest relationship
  const dedupByTarget = (rels: typeof relations) => {
    const bestByPair = new Map<string, typeof relations[0]>();
    for (const r of rels) {
      const pairKey = `${r.from}__${r.to}`;
      const existing = bestByPair.get(pairKey);
      const relType = r.relationType || r.type || '';
      if (!existing || getStrength(relType) > getStrength(existing.relationType || existing.type || '')) {
        bestByPair.set(pairKey, r);
      }
    }
    return Array.from(bestByPair.values());
  };
  const outgoing = dedupByTarget(relations.filter(r => r.from === selectedNode.name));
  const incoming = dedupByTarget(relations.filter(r => r.to === selectedNode.name));

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
          let relativePath = isLocalMarkdown
            ? part.replace('http://localhost:8080/', '')
            : part;

          // Handle absolute paths from legacy observations
          // Convert /Users/.../coding/knowledge-management/... to knowledge-management/...
          const knowledgeManagementMatch = relativePath.match(/\/knowledge-management\/.+\.md$/);
          if (knowledgeManagementMatch) {
            relativePath = knowledgeManagementMatch[0].slice(1); // Remove leading slash
          }

          // Session log files are in .specstory/history/ and have pattern: YYYY-MM-DD_HHMM-HHMM_<hash>.md
          // Examples: 2026-01-25_1100-1200_c197ef.md, 2025-11-29_1400-1500_g9b30a_from-ui-template.md
          const sessionLogPattern = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{4}_[a-z0-9]+(?:_[a-z0-9-]+)?\.md$/i;
          const filename = relativePath.split('/').pop() || relativePath;
          if (sessionLogPattern.test(filename) && !relativePath.includes('/')) {
            relativePath = `specstory/${filename}`;
          }

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

        {/* Hierarchy */}
        {selectedNode.metadata?.parentEntityName && (
          <div className="bg-indigo-50 rounded p-3 space-y-1 text-sm mb-2">
            {selectedNode.metadata.hierarchyLevel !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Level:</span>
                <span className="font-medium">L{selectedNode.metadata.hierarchyLevel}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Parent:</span>
              <button
                onClick={() => {
                  const parentNode = entities.find((e: any) => e.name === selectedNode.metadata.parentEntityName);
                  if (parentNode) dispatch(selectNode({ id: parentNode.name, name: parentNode.name, entityType: parentNode.entityType, observations: parentNode.observations, metadata: parentNode.metadata }));
                }}
                className="font-medium text-indigo-600 hover:text-indigo-800 underline"
              >
                {selectedNode.metadata.parentEntityName}
              </button>
            </div>
            {selectedNode.metadata.childEntityNames?.length > 0 && (
              <div>
                <span className="text-gray-600">Children:</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedNode.metadata.childEntityNames.map((child: string) => (
                    <button
                      key={child}
                      onClick={() => {
                        const childNode = entities.find((e: any) => e.name === child);
                        if (childNode) dispatch(selectNode({ id: childNode.name, name: childNode.name, entityType: childNode.entityType, observations: childNode.observations, metadata: childNode.metadata }));
                      }}
                      className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                    >
                      {child}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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

        {/* Ontology Classification Info */}
        {selectedNode.metadata?.ontology && (
          <div className="bg-purple-50 rounded p-3 space-y-1 text-sm">
            <h5 className="font-semibold text-purple-800 mb-2">Ontology Classification</h5>
            <div className="flex justify-between">
              <span className="text-gray-600">Ontology:</span>
              <span className="font-medium text-purple-700">{selectedNode.metadata.ontology.ontologyName || 'upper'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Method:</span>
              <span className="font-medium">{selectedNode.metadata.ontology.classificationMethod || 'unknown'}</span>
            </div>
            {selectedNode.metadata.ontology.confidence !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Classification Confidence:</span>
                <span className="font-medium">{(selectedNode.metadata.ontology.confidence * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Insight Document Link — only shown if insight file exists */}
        <InsightDocLink selectedNode={selectedNode} onOpenMarkdown={onOpenMarkdown} />

        {/* Observations */}
        {selectedNode.observations && selectedNode.observations.length > 0 && (
          <div>
            <h5 className="font-semibold text-gray-700 mb-2">Observations</h5>
            <ul className="space-y-3">
              {selectedNode.observations.map((obs, index) => {
                // Handle both string observations and object observations with content field
                const content = typeof obs === 'string' ? obs : obs?.content;
                return (
                  <li key={index} className="text-sm text-gray-700 pl-4 border-l-2 border-blue-200">
                    <ObservationMarkdown text={content} onOpenMarkdown={onOpenMarkdown} />
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
