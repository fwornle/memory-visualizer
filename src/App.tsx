import { useState } from "react";
import KnowledgeGraphVisualization from "./components/KnowledgeGraphVisualization";
import MarkdownViewer from "./components/MarkdownViewer";

function App() {
  const [markdownFile, setMarkdownFile] = useState<string | null>(null);

  const handleOpenMarkdown = (filePath: string) => {
    setMarkdownFile(filePath);
  };

  const handleCloseMarkdown = () => {
    setMarkdownFile(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <KnowledgeGraphVisualization onOpenMarkdown={handleOpenMarkdown} />
      {markdownFile && (
        <MarkdownViewer 
          filePath={markdownFile} 
          onClose={handleCloseMarkdown}
        />
      )}
    </div>
  );
}

export default App;
