import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
  id?: string;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart, id }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      // Initialize mermaid with configuration
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        // Ensure diagrams fit properly
        sequence: {
          diagramMarginX: 50,
          diagramMarginY: 10,
          actorMargin: 50,
          width: 150,
          height: 65,
          boxMargin: 10,
          boxTextMargin: 5,
          noteMargin: 10,
          messageMargin: 35,
        },
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
        },
      });

      // Generate unique ID for this diagram
      const diagramId = id || `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        // Render the mermaid diagram
        mermaid.render(diagramId, chart).then(({ svg }) => {
          if (ref.current) {
            ref.current.innerHTML = svg;
          }
        }).catch((error) => {
          console.error('Mermaid rendering error:', error);
          if (ref.current) {
            ref.current.innerHTML = `<div class="text-red-600 bg-red-50 p-4 rounded border">
              <strong>Mermaid Diagram Error:</strong><br/>
              ${error.message || 'Failed to render diagram'}
              <details class="mt-2">
                <summary class="cursor-pointer">Show diagram source</summary>
                <pre class="mt-2 text-sm bg-gray-100 p-2 rounded">${chart}</pre>
              </details>
            </div>`;
          }
        });
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        if (ref.current) {
          ref.current.innerHTML = `<div class="text-red-600 bg-red-50 p-4 rounded border">
            <strong>Mermaid Diagram Error:</strong><br/>
            Failed to render diagram
          </div>`;
        }
      }
    }
  }, [chart, id]);

  return (
    <div 
      ref={ref} 
      className="mermaid-diagram my-4 flex justify-center overflow-x-auto"
      style={{ maxWidth: '100%' }}
    />
  );
};

export default MermaidDiagram;