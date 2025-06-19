import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import MermaidDiagram from './MermaidDiagram';
import 'highlight.js/styles/github.css';

interface MarkdownHistoryItem {
  filePath: string;
  title: string;
}

interface MarkdownViewerProps {
  filePath: string;
  onClose: () => void;
  onOpenMarkdown: (filePath: string) => void;
  onBack: () => void;
  onForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  history: MarkdownHistoryItem[];
  historyIndex: number;
}

const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ 
  filePath, 
  onClose, 
  onOpenMarkdown, 
  onBack, 
  onForward, 
  canGoBack, 
  canGoForward, 
  history, 
  historyIndex 
}) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const fetchMarkdown = async () => {
      try {
        setLoading(true);
        setError('');
        
        // Fetch the markdown file
        const response = await fetch(filePath);
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }
        
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load markdown file');
      } finally {
        setLoading(false);
      }
    };

    if (filePath) {
      fetchMarkdown();
    }
  }, [filePath]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] w-[90vw] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-3">
            {/* Navigation buttons */}
            <div className="flex items-center space-x-1">
              <button
                onClick={onBack}
                disabled={!canGoBack}
                className="p-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 rounded transition-colors"
                title="Go back"
              >
                ←
              </button>
              <button
                onClick={onForward}
                disabled={!canGoForward}
                className="p-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 rounded transition-colors"
                title="Go forward"
              >
                →
              </button>
            </div>
            
            {/* Title */}
            <h2 className="text-lg font-semibold text-gray-800 truncate">
              {filePath.split('/').pop()}
            </h2>
            
            {/* History indicator */}
            {history.length > 1 && (
              <span className="text-sm text-gray-500">
                ({historyIndex + 1}/{history.length})
              </span>
            )}
          </div>
          
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="text-gray-500">Loading...</div>
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-4">
              <div className="text-red-700 font-medium">Error loading file</div>
              <div className="text-red-600 text-sm mt-1">{error}</div>
            </div>
          )}
          
          {!loading && !error && (
            <div className="prose prose-blue max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  img: ({node, ...props}) => {
                    // Fix relative image paths
                    let src = props.src || '';
                    if (src && !src.startsWith('http')) {
                      // Convert relative path to absolute path based on markdown file location
                      const baseUrl = filePath.substring(0, filePath.lastIndexOf('/'));
                      src = `${baseUrl}/${src}`;
                    }
                    return <img {...props} src={src} className="max-w-full h-auto" />;
                  },
                  // Handle code blocks, including mermaid
                  pre: ({node, children, ...props}) => {
                    // Check if this is a mermaid code block
                    const codeElement = React.Children.toArray(children)[0] as React.ReactElement;
                    if (
                      codeElement && 
                      codeElement.type === 'code' && 
                      codeElement.props.className?.includes('language-mermaid')
                    ) {
                      return (
                        <MermaidDiagram 
                          chart={String(codeElement.props.children)} 
                        />
                      );
                    }
                    return <pre className="bg-gray-100 rounded p-4 overflow-x-auto" {...props}>{children}</pre>;
                  },
                  code: ({node, inline, className, children, ...props}) => {
                    // Handle inline code
                    if (inline) {
                      return <code className="bg-gray-100 px-1 rounded" {...props}>{children}</code>;
                    }
                    // Handle block code (fallback if not caught by pre)
                    if (className?.includes('language-mermaid')) {
                      return <MermaidDiagram chart={String(children)} />;
                    }
                    return <code className={className} {...props}>{children}</code>;
                  },
                  // Style headings properly
                  h1: ({node, ...props}) => <h1 className="text-3xl font-bold mb-4 mt-6" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-2xl font-bold mb-3 mt-5" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-xl font-bold mb-2 mt-4" {...props} />,
                  // Style lists
                  ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-4" {...props} />,
                  ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-4" {...props} />,
                  li: ({node, ...props}) => <li className="mb-1" {...props} />,
                  // Style paragraphs
                  p: ({node, ...props}) => <p className="mb-4" {...props} />,
                  // Style links and handle markdown file links
                  a: ({node, href, children, ...props}) => {
                    // Check if this is a markdown file link
                    if (href && href.endsWith('.md')) {
                      return (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            onOpenMarkdown(href);
                          }}
                          className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                          {...props}
                        >
                          {children}
                        </button>
                      );
                    }
                    // Regular external links
                    return (
                      <a 
                        className="text-blue-600 hover:text-blue-800 underline" 
                        href={href}
                        target={href?.startsWith('http') ? '_blank' : undefined}
                        rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                        {...props} 
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarkdownViewer;