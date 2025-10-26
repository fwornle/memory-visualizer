import { useAppDispatch, useAppSelector } from "./store/hooks";
import { openMarkdown, closeMarkdown, markdownBack, markdownForward } from "./store/slices/navigationSlice";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import MarkdownViewer from "./components/MarkdownViewer";

function App() {
  const dispatch = useAppDispatch();
  const { markdownFile, markdownHistory, markdownHistoryIndex } = useAppSelector(
    state => state.navigation
  );

  const handleOpenMarkdown = (filePath: string) => {
    dispatch(openMarkdown(filePath));
  };

  const handleCloseMarkdown = () => {
    dispatch(closeMarkdown());
  };

  const handleMarkdownBack = () => {
    dispatch(markdownBack());
  };

  const handleMarkdownForward = () => {
    dispatch(markdownForward());
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <KnowledgeGraph onOpenMarkdown={handleOpenMarkdown} />
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
