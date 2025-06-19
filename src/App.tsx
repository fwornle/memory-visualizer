import { useState } from "react";
import KnowledgeGraphVisualization from "./components/KnowledgeGraphVisualization";
import MarkdownViewer from "./components/MarkdownViewer";

interface MarkdownHistoryItem {
  filePath: string;
  title: string;
}

function App() {
  const [markdownFile, setMarkdownFile] = useState<string | null>(null);
  const [markdownHistory, setMarkdownHistory] = useState<MarkdownHistoryItem[]>([]);
  const [markdownHistoryIndex, setMarkdownHistoryIndex] = useState(-1);

  const handleOpenMarkdown = (filePath: string) => {
    // Convert relative paths to absolute paths for localhost files
    let normalizedPath = filePath;
    
    // Handle relative paths that don't start with http
    if (!filePath.startsWith('http')) {
      // If it's a relative path, prepend the localhost URL
      if (!filePath.startsWith('/')) {
        normalizedPath = `http://localhost:8080/${filePath}`;
      } else {
        normalizedPath = `http://localhost:8080${filePath}`;
      }
    }
    
    const title = normalizedPath.split('/').pop() || normalizedPath;
    const newItem: MarkdownHistoryItem = { filePath: normalizedPath, title };
    
    // Add to history, removing any future items if we're not at the end
    const newHistory = markdownHistory.slice(0, markdownHistoryIndex + 1);
    newHistory.push(newItem);
    
    setMarkdownHistory(newHistory);
    setMarkdownHistoryIndex(newHistory.length - 1);
    setMarkdownFile(normalizedPath);
  };

  const handleCloseMarkdown = () => {
    setMarkdownFile(null);
  };

  const handleMarkdownBack = () => {
    if (markdownHistoryIndex > 0) {
      const newIndex = markdownHistoryIndex - 1;
      setMarkdownHistoryIndex(newIndex);
      setMarkdownFile(markdownHistory[newIndex].filePath);
    }
  };

  const handleMarkdownForward = () => {
    if (markdownHistoryIndex < markdownHistory.length - 1) {
      const newIndex = markdownHistoryIndex + 1;
      setMarkdownHistoryIndex(newIndex);
      setMarkdownFile(markdownHistory[newIndex].filePath);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <KnowledgeGraphVisualization onOpenMarkdown={handleOpenMarkdown} />
      {markdownFile && (
        <MarkdownViewer 
          filePath={markdownFile} 
          onClose={handleCloseMarkdown}
          onOpenMarkdown={handleOpenMarkdown}
          onBack={handleMarkdownBack}
          onForward={handleMarkdownForward}
          canGoBack={markdownHistoryIndex > 0}
          canGoForward={markdownHistoryIndex < markdownHistory.length - 1}
          history={markdownHistory}
          historyIndex={markdownHistoryIndex}
        />
      )}
    </div>
  );
}

export default App;
