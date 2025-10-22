import React, {
  useEffect,
  useReducer,
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";
import * as d3 from "d3";
import { TeamSelector } from "./TeamSelector";
import { DatabaseClient } from "../api/databaseClient";

interface KnowledgeGraphVisualizationProps {
  onOpenMarkdown: (filePath: string) => void;
}

// Helper function to convert URLs in text to clickable links
const renderTextWithLinks = (text: string, onOpenMarkdown: (filePath: string) => void) => {
  // Enhanced pattern to match http/https/file URLs and relative markdown files
  const urlPattern = /((?:https?|file):\/\/[^\s,]+|[^\s,]*\.md)/g;
  const parts = text.split(urlPattern);
  
  return parts.map((part, index) => {
    if (urlPattern.test(part)) {
      // Check if this is a markdown file (not a full URL)
      const isMarkdownFile = part.endsWith('.md') && !part.includes('://');
      // For file:// URLs, we can't open them directly due to browser security
      // Instead, we'll copy the path to clipboard when clicked
      const isFileUrl = part.startsWith('file://');
      
      if (isMarkdownFile) {
        return (
          <button
            key={index}
            onClick={(e) => {
              e.preventDefault();
              onOpenMarkdown(part);
            }}
            className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
            title="Click to view markdown content"
          >
            {part}
          </button>
        );
      } else if (isFileUrl) {
        // This shouldn't happen anymore, but keep as fallback
        const filePath = part.replace('file://', '');
        
        return (
          <a
            key={index}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigator.clipboard.writeText(filePath);
              // Show a tooltip or notification that the path was copied
              const tooltip = document.createElement('div');
              tooltip.textContent = 'Path copied to clipboard!';
              tooltip.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #333;
                color: white;
                padding: 8px 16px;
                border-radius: 4px;
                z-index: 1000;
              `;
              document.body.appendChild(tooltip);
              setTimeout(() => document.body.removeChild(tooltip), 2000);
            }}
            className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
            title={`Click to copy path: ${filePath}`}
          >
            {part}
          </a>
        );
      } else {
        // Check if it's a localhost markdown file
        const isLocalMarkdown = part.includes('localhost:8080') && part.endsWith('.md');
        
        if (isLocalMarkdown) {
          // Extract the relative path from the localhost URL
          const relativePath = part.replace('http://localhost:8080/', '');
          return (
            <button
              key={index}
              onClick={(e) => {
                e.preventDefault();
                onOpenMarkdown(relativePath);
              }}
              className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
              title="Click to view markdown content"
            >
              {part.split('/').pop() || part}
            </button>
          );
        } else {
          // Regular http/https URLs
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
    }
    return part;
  });
};

// Helper function to render observations with special handling for reference lists
const renderObservations = (observations: (string | {content: string; type?: string; date?: string})[], onOpenMarkdown: (filePath: string) => void) => {
  console.log("🔍 renderObservations called with:", observations.length, "observations");
  console.log("🔍 ALL observations:", observations);

  const result = [];
  let i = 0;

  while (i < observations.length) {
    const obsRaw = observations[i];

    // Normalize observation to string (handle both object and string formats)
    const obs = typeof obsRaw === 'string' ? obsRaw : obsRaw.content || '';

    // Check if this observation starts with "References:" (single line format)
    if (obs.trim().startsWith("References:")) {
      console.log("🎯 Found References section at index", i, ":", obs);
      
      // Extract the references part after "References:"
      const referencesText = obs.replace(/^References:\s*/, '').trim();
      
      if (referencesText) {
        // Split by comma and clean up each reference
        const references = referencesText.split(',').map(ref => ref.trim()).filter(ref => ref.length > 0);
        
        // Render as a proper references section
        result.push(
          <div key={`references-${i}`} className="mb-3">
            <h4 className="text-sm font-semibold mb-1 text-gray-700">References:</h4>
            <ul className="list-disc pl-5">
              {references.map((ref, refIndex) => {
                return (
                  <li key={refIndex} className="text-sm mb-1 whitespace-pre-wrap">
                    {renderTextWithLinks(ref, onOpenMarkdown)}
                  </li>
                );
              })}
            </ul>
          </div>
        );
        
        // Skip this observation since we processed it
        i++;
        continue;
      }
    }
    
    // Regular observation
    result.push(
      <li key={i} className="text-sm mb-1 whitespace-pre-wrap">
        {renderTextWithLinks(obs, onOpenMarkdown)}
      </li>
    );
    
    i++;
  }
  
  return result;
};

// Define types for our data structures
interface Entity {
  name: string;
  entityType: string;
  observations: string[];
  type: string;
  _source?: string; // Added to track data source (e.g., "database" for online, "shared-memory-*" for batch)
  metadata?: {
    source?: 'batch' | 'online';
    [key: string]: any;
  };
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
  type: string;
  metadata?: {
    source?: 'batch' | 'online';
    [key: string]: any;
  };
}

interface GraphData {
  entities: Entity[];
  relations: Relation[];
}

interface Stats {
  entityCount: number;
  relationCount: number;
  entityTypeCount: number;
  relationTypeCount: number;
  batchCount?: number;
  onlineCount?: number;
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  entityType: string;
  observations: string[];
  _source?: string; // Added to track data source (e.g., "database" for online, "shared-memory-*" for batch)
  metadata?: {
    source?: 'batch' | 'online';
    [key: string]: any;
  };
  x?: number;
  y?: number;
}

interface Link {
  source: Node;
  target: Node;
  type: string;
}

// History state for node selection and navigation
type HistoryState = {
  history: Node[];
  index: number;
  selectedNode: Node | null;
};
type HistoryAction =
  | { type: 'select'; node: Node }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'clear' }
  | { type: 'reset' };
function historyReducer(
  state: HistoryState,
  action: HistoryAction
): HistoryState {
  switch (action.type) {
    case 'select': {
      const newHistory = state.history.slice(0, state.index + 1);
      newHistory.push(action.node);
      return {
        history: newHistory,
        index: newHistory.length - 1,
        selectedNode: action.node,
      };
    }
    case 'back': {
      if (state.index > 0) {
        const newIndex = state.index - 1;
        return {
          ...state,
          index: newIndex,
          selectedNode: state.history[newIndex],
        };
      }
      return state;
    }
    case 'forward': {
      if (state.index < state.history.length - 1) {
        const newIndex = state.index + 1;
        return {
          ...state,
          index: newIndex,
          selectedNode: state.history[newIndex],
        };
      }
      return state;
    }
    case 'clear': {
      return { ...state, selectedNode: null };
    }
    case 'reset': {
      return { history: [], index: -1, selectedNode: null };
    }
    default:
      return state;
  }
}

const KnowledgeGraphVisualization: React.FC<KnowledgeGraphVisualizationProps> = ({ onOpenMarkdown }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  // History and navigation for selected nodes
  const [historyState, dispatchHistory] = useReducer(
    historyReducer,
    { history: [], index: -1, selectedNode: null } as HistoryState
  );
  const { history, index, selectedNode } = historyState;
  // Refs to manage D3 nodes and zoom behavior for recentering
  const nodesRef = useRef<Node[]>([]);
  const nodeMapRef = useRef<Map<string, Node>>(new Map());
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Debug: Log search term changes
  useEffect(() => {
    console.log("🔍 searchTerm state changed to:", searchTerm);
  }, [searchTerm]);
  const [filterEntityType, setFilterEntityType] = useState("All");
  const [filterRelationType, setFilterRelationType] = useState("All");
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  // ENHANCED: Data source selection (batch, online, or combined)
  // Initially null to indicate not yet loaded from server config
  const [dataSource, setDataSource] = useState<'batch' | 'online' | 'combined' | null>(null);
  // Store raw unfiltered data for client-side filtering
  const rawDataRef = useRef<{ entities: Entity[], relations: Relation[] } | null>(null);
  const hasLoadedDataRef = useRef(false);

  // Database client for querying knowledge
  const dbClient = useRef(new DatabaseClient()).current;
  const [useDatabase, setUseDatabase] = useState(false);
  const [dbHealthy, setDbHealthy] = useState(false);

  // Handler for dataSource changes - saves to localStorage for persistence across team changes
  const handleDataSourceChange = (newSource: 'batch' | 'online' | 'combined') => {
    setDataSource(newSource);
    localStorage.setItem('vkb_dataSource', newSource);
    console.log(`[VKB] Data source changed to: ${newSource} (saved to localStorage)`);
  };

  // Function to filter data based on dataSource mode
  const filterDataBySource = (entities: Entity[], relations: Relation[], mode: 'batch' | 'online' | 'combined') => {
    if (mode === 'combined') {
      return { entities, relations };
    }

    let filteredEntities: Entity[];
    if (mode === 'batch') {
      // Batch mode: Keep only entities from shared-memory-*.json files
      filteredEntities = entities.filter(e =>
        e._source?.startsWith('shared-memory-') ||
        (!e._source && e.metadata?.sourceType !== 'online')
      );
    } else {
      // Online mode: Keep entities from database PLUS related System/Project entities
      const onlineEntities = entities.filter(e =>
        e._source === 'database' ||
        e.metadata?.sourceType === 'online'
      );

      // Find System and Project entities that online entities relate to
      const onlineEntityNames = new Set(onlineEntities.map(e => e.name));
      const connectedEntityNames = new Set(onlineEntityNames);

      // Add System and Project entities that are connected to online entities
      relations.forEach(r => {
        if (onlineEntityNames.has(r.from)) {
          const toEntity = entities.find(e => e.name === r.to);
          if (toEntity && (toEntity.entityType === 'System' || toEntity.entityType === 'Project')) {
            connectedEntityNames.add(r.to);
          }
        }
        if (onlineEntityNames.has(r.to)) {
          const fromEntity = entities.find(e => e.name === r.from);
          if (fromEntity && (fromEntity.entityType === 'System' || fromEntity.entityType === 'Project')) {
            connectedEntityNames.add(r.from);
          }
        }
      });

      // Keep online entities plus connected System/Project entities
      filteredEntities = entities.filter(e => connectedEntityNames.has(e.name));
    }

    // Filter relations to only include those between visible entities
    const entityNames = new Set(filteredEntities.map(e => e.name));
    const filteredRelations = relations.filter(r =>
      entityNames.has(r.from) && entityNames.has(r.to)
    );

    console.log(`🔍 Filtered to ${mode} mode: ${filteredEntities.length} entities, ${filteredRelations.length} relations`);
    return { entities: filteredEntities, relations: filteredRelations };
  };

  // Function to load data from database
  const loadFromDatabase = async (team?: string, source?: 'manual' | 'auto') => {
    try {
      setIsLoading(true);
      setErrorMessage("");
      console.log('📊 Loading knowledge from database...');

      const graphData = await dbClient.loadKnowledgeGraph(team, source);

      // Transform database format to component format
      const entities: Entity[] = graphData.entities.map(e => ({
        name: e.name,
        entityType: e.entityType,
        observations: e.observations || [],
        type: 'entity',
        _source: 'database',
        metadata: {
          source: source === 'manual' ? 'batch' : 'online',
          team: e.team,
          confidence: e.confidence,
          lastModified: e.lastModified
        }
      }));

      const relations: Relation[] = graphData.relations.map(r => ({
        from: graphData.entities.find(e => e.id === r.source)?.name || r.source,
        to: graphData.entities.find(e => e.id === r.target)?.name || r.target,
        relationType: r.type,
        type: 'relation',
        metadata: {
          source: source === 'manual' ? 'batch' : 'online',
          confidence: r.confidence
        }
      }));

      console.log(`✅ Loaded from database: ${entities.length} entities, ${relations.length} relations`);

      // Store raw data for filtering
      rawDataRef.current = { entities, relations };

      // Apply data source filter if set
      if (dataSource) {
        const filtered = filterDataBySource(entities, relations, dataSource);
        setGraphData(filtered);
      } else {
        setGraphData({ entities, relations });
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load from database:', error);
      setErrorMessage(`Database load failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
      setDbHealthy(false);
    }
  };

  // Function to parse the JSON file
  const parseMemoryJson = (content: string) => {
    try {
      setIsLoading(true);
      console.log("🚀 Memory Visualizer v2.1 - Fixed Relation Parsing - Built:", new Date().toISOString());
      console.log("📊 Parsing memory data...");
      
      // Split the content by new lines
      const lines = content.split("\n").filter((line) => line.trim());

      const entities: Entity[] = [];
      const relations: Relation[] = [];

      // Parse each line as a separate JSON object
      lines.forEach((line) => {
        try {
          const obj = JSON.parse(line);
          if (obj.type === "entity") {
            entities.push(obj as Entity);
          } else if (obj.type === "relation") {
            relations.push(obj as Relation);
          } else if (obj.from && obj.to && obj.relationType) {
            // Handle relations without explicit type field
            relations.push(obj as Relation);
          }
        } catch (err) {
          console.error("Error parsing line:", line, err);
        }
      });

      console.log(`✅ Parsing complete! Found ${entities.length} entities and ${relations.length} relations`);
      console.log("📈 Entities:", entities.map(e => e.name));
      console.log("🔗 Relations:", relations.map(r => `${r.from} → ${r.to}`));

      if (entities.length === 0 && relations.length === 0) {
        setErrorMessage(
          "No valid entities or relations found in the file. Please check the format."
        );
        setIsLoading(false);
        return;
      }

      // Store raw unfiltered data for client-side mode filtering
      rawDataRef.current = { entities, relations };

      // Apply filtering based on current dataSource mode
      const mode = dataSource || 'combined';
      const filtered = filterDataBySource(entities, relations, mode);
      setGraphData(filtered);

      // Calculate stats including source breakdown
      // Batch: from shared-memory-*.json files (curated/manual knowledge)
      // Online: from database (auto-learned) or marked as online via metadata.sourceType
      const batchCount = entities.filter(e =>
        e._source?.startsWith('shared-memory-') ||
        (!e._source && e.metadata?.sourceType !== 'online')
      ).length;
      const onlineCount = entities.filter(e =>
        e._source === 'database' ||
        e.metadata?.sourceType === 'online'
      ).length;

      setStats({
        entityCount: entities.length,
        relationCount: relations.length,
        entityTypeCount: new Set(entities.map((e) => e.entityType)).size,
        relationTypeCount: new Set(relations.map((r) => r.relationType)).size,
        batchCount,
        onlineCount,
      });
      setErrorMessage("");
      setIsLoading(false);
    } catch (err) {
      console.error("Error parsing JSON:", err);
      setErrorMessage("Error parsing JSON file. Please check the format.");
      setIsLoading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setErrorMessage("");
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const content = e.target?.result;
        if (typeof content === "string") {
          parseMemoryJson(content);
        }
      };
      reader.onerror = () => {
        setErrorMessage("Error reading file. Please try again.");
      };
      reader.readAsText(file);
    }
  };

  // Handle drag events
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMessage("");

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];

      // Check if it's a JSON file
      if (!file.name.endsWith(".json") && !file.type.includes("json")) {
        setErrorMessage("Please upload a JSON file.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const content = e.target?.result;
        if (typeof content === "string") {
          parseMemoryJson(content);
        }
      };
      reader.onerror = () => {
        setErrorMessage("Error reading file. Please try again.");
      };
      reader.readAsText(file);
    }
  };

  // Handle paste from clipboard
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    if (clipboardData) {
      const pastedText = clipboardData.getData("Text");
      if (pastedText) {
        setErrorMessage("");
        parseMemoryJson(pastedText);
      }
    }
  }, []);

  // Add paste event listener
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);

  // Fetch server configuration on mount to determine data source mode
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        // First, check if user has a saved preference in localStorage
        const savedDataSource = localStorage.getItem('vkb_dataSource');
        if (savedDataSource && ['batch', 'online', 'combined'].includes(savedDataSource)) {
          setDataSource(savedDataSource as 'batch' | 'online' | 'combined');
          console.log(`[VKB] Data source restored from localStorage: ${savedDataSource}`);
          return; // Use saved preference, don't override with server config
        }

        // If no saved preference, fall back to server config
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          console.log('[VKB] Server config:', config);
          // Set data source from server configuration
          const serverDataSource = config.dataSource || 'batch';
          setDataSource(serverDataSource as 'batch' | 'online' | 'combined');
          console.log(`[VKB] Data source set to: ${serverDataSource}`);
        } else {
          console.warn('[VKB] Failed to fetch config, defaulting to batch mode');
          setDataSource('batch');
        }
      } catch (error) {
        console.warn('[VKB] Error fetching config, defaulting to batch mode:', error);
        setDataSource('batch');
      }
    };

    fetchConfig();
  }, []); // Run once on mount

  // Check database health on mount
  useEffect(() => {
    const checkDatabase = async () => {
      try {
        const health = await dbClient.checkHealth();
        const healthy = health.status === 'healthy' && health.sqlite;
        setDbHealthy(healthy);

        if (healthy) {
          console.log('✅ Database available - can use direct DB queries');
          setUseDatabase(true); // Enable database mode
        } else {
          console.log('⚠️ Database unavailable - using JSON files only');
        }
      } catch (error) {
        console.log('⚠️ Database health check failed - using JSON files only');
        setDbHealthy(false);
      }
    };

    checkDatabase();
  }, []); // Run once on mount

  // Automatically load data - prefer database if available, fall back to JSON
  useEffect(() => {
    // Wait for both dataSource and database health check
    if (dataSource === null || hasLoadedDataRef.current) {
      return;
    }

    const loadData = async () => {
      // If database is healthy and we're in online or combined mode, load from database
      if (useDatabase && dbHealthy && (dataSource === 'online' || dataSource === 'combined')) {
        console.log('📊 Loading from database (database mode)');
        const sourceFilter = dataSource === 'online' ? 'auto' : undefined;
        await loadFromDatabase(undefined, sourceFilter);
        hasLoadedDataRef.current = true;
      } else {
        // Fall back to JSON loading
        console.log('📊 Loading from JSON files (fallback mode)');
        loadMemoryJson();
      }
    };

    loadData();
  }, [dataSource, useDatabase, dbHealthy]); // Re-run when any of these change

  // Legacy: Load memory.json for JSON mode
  const loadMemoryJson = async () => {
      try {
        setIsLoading(true);
        setErrorMessage("");

        // ALWAYS load combined data - client-side filtering handles mode selection
        // Try memory-combined.json first, fall back to memory.json
        let content: string | null = null;

        try {
          const combinedResponse = await fetch('/memory-combined.json');
          if (combinedResponse.ok) {
            content = await combinedResponse.text();
            console.log('✅ Loaded memory-combined.json for client-side filtering');
          }
        } catch {
          // Fall back to memory.json
        }

        if (!content) {
          const response = await fetch('/memory.json');
          if (response.ok) {
            content = await response.text();
            console.log('✅ Loaded memory.json (fallback) for client-side filtering');
          } else {
            console.log('⚠️ No memory files found, waiting for manual upload');
            setIsLoading(false);
            return;
          }
        }

        hasLoadedDataRef.current = true; // Mark as loaded
        parseMemoryJson(content);
      } catch (error) {
        console.log('Could not auto-load memory file:', error);
        setIsLoading(false);
      }
  };

  // Re-filter data when dataSource mode changes
  useEffect(() => {
    if (!rawDataRef.current || dataSource === null) return;

    const { entities, relations } = rawDataRef.current;
    const filtered = filterDataBySource(entities, relations, dataSource);
    setGraphData(filtered);

    // Update stats for filtered data
    const batchCount = filtered.entities.filter(e =>
      e._source?.startsWith('shared-memory-') ||
      (!e._source && e.metadata?.sourceType !== 'online')
    ).length;
    const onlineCount = filtered.entities.filter(e =>
      e._source === 'database' ||
      e.metadata?.sourceType === 'online'
    ).length;

    setStats({
      entityCount: filtered.entities.length,
      relationCount: filtered.relations.length,
      entityTypeCount: new Set(filtered.entities.map((e) => e.entityType)).size,
      relationTypeCount: new Set(filtered.relations.map((r) => r.relationType)).size,
      batchCount,
      onlineCount,
    });

    console.log(`📊 Updated view to ${dataSource} mode: ${filtered.entities.length} entities, ${filtered.relations.length} relations`);
  }, [dataSource]); // Re-run when dataSource changes

  // Get unique entity types and relation types for filters
  const entityTypes = graphData
    ? ["All", ...new Set(graphData.entities.map((entity) => entity.entityType))]
    : ["All"];

  const relationTypes = graphData
    ? [
        "All",
        ...new Set(
          graphData.relations.map((relation) => relation.relationType)
        ),
      ]
    : ["All"];

  // Apply filters to the graph data
  const getFilteredData = () => {
    if (!graphData) return { nodes: [] as Node[], links: [] as Link[] };

    // Filter entities based on search term and entity type
    let filteredEntities = graphData.entities;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      console.log("🔍 Search term:", term);
      console.log("🔍 Total entities before filter:", filteredEntities.length);
      
      filteredEntities = filteredEntities.filter(
        (entity) =>
          entity.name.toLowerCase().includes(term) ||
          entity.entityType.toLowerCase().includes(term) ||
          entity.observations.some((obs) => obs.toLowerCase().includes(term))
      );
      
      console.log("🔍 Entities after search filter:", filteredEntities.length);
      console.log("🔍 Filtered entity names:", filteredEntities.map(e => e.name));
    }

    if (filterEntityType !== "All") {
      filteredEntities = filteredEntities.filter(
        (entity) => entity.entityType === filterEntityType
      );
    }

    // Include System entities only when NOT searching to maintain full graph structure
    // During search, be much more selective to show only relevant results
    if (filteredEntities.length > 0 && filterEntityType !== "System" && !searchTerm) {
      const systemEntities = graphData.entities.filter(
        (entity) => entity.entityType === "System"
      );
      // Add System entities that aren't already in the filtered list
      systemEntities.forEach((sysEntity) => {
        if (!filteredEntities.some(e => e.name === sysEntity.name)) {
          filteredEntities.push(sysEntity);
        }
      });
    }
    
    // Special case: If we still don't have CollectiveKnowledge but have other entities,
    // create a placeholder CollectiveKnowledge entity to maintain graph structure (but not during search)
    if (filteredEntities.length > 0 && !filteredEntities.some(e => e.name === "CollectiveKnowledge") && !searchTerm) {
      // Check if any relations reference CollectiveKnowledge
      const hasCollectiveKnowledgeRelations = graphData.relations.some(r => 
        r.from === "CollectiveKnowledge" || r.to === "CollectiveKnowledge"
      );
      
      if (hasCollectiveKnowledgeRelations) {
        // Add a virtual CollectiveKnowledge entity
        filteredEntities.push({
          name: "CollectiveKnowledge",
          entityType: "System",
          type: "entity",
          observations: ["Central knowledge hub for cross-view insights"]
        });
      }
    }

    // Get entity names to filter relations
    const entityNames = new Set(filteredEntities.map((entity) => entity.name));

    // Include connected entities - balance search precision with graph connectivity
    const connectedEntityNames = new Set(entityNames);
    
    if (searchTerm) {
      // During search: Add CollectiveKnowledge if we have any matching patterns to maintain hub structure
      if (filteredEntities.length > 0) {
        const collectiveKnowledge = graphData.entities.find(e => e.name === "CollectiveKnowledge");
        if (collectiveKnowledge && !connectedEntityNames.has("CollectiveKnowledge")) {
          connectedEntityNames.add("CollectiveKnowledge");
        }
      }
      
      // Add project entities that are directly connected to our filtered results to prevent isolation
      graphData.relations.forEach((relation) => {
        if (entityNames.has(relation.from)) {
          const toEntity = graphData.entities.find(e => e.name === relation.to);
          if (toEntity?.entityType === "Project") {
            connectedEntityNames.add(relation.to);
          }
        }
        if (entityNames.has(relation.to)) {
          const fromEntity = graphData.entities.find(e => e.name === relation.from);
          if (fromEntity?.entityType === "Project") {
            connectedEntityNames.add(relation.from);
          }
        }
      });
    } else {
      // When NOT searching, add all direct connections to maintain full graph structure
      graphData.relations.forEach((relation) => {
        if (entityNames.has(relation.from)) {
          connectedEntityNames.add(relation.to);
        }
        if (entityNames.has(relation.to)) {
          connectedEntityNames.add(relation.from);
        }
      });
    }

    // If NOT searching, also preserve important hub nodes and high-connectivity entities
    if (!searchTerm) {
      // Second pass: Preserve important hub nodes (System entities and high-connectivity nodes)
      graphData.entities.forEach((entity) => {
        // Include entities with high connectivity (connected to many other entities)
        const connectionCount = graphData.relations.filter(
          (relation) => relation.from === entity.name || relation.to === entity.name
        ).length;
        
        // If an entity has 3+ connections and any of those connections are to our filtered entities, include it
        if (connectionCount >= 3) {
          const hasConnectionToFiltered = graphData.relations.some((relation) => 
            (relation.from === entity.name && connectedEntityNames.has(relation.to)) ||
            (relation.to === entity.name && connectedEntityNames.has(relation.from))
          );
          
          if (hasConnectionToFiltered) {
            connectedEntityNames.add(entity.name);
          }
        }
      });
    }

    // Add connected entities to the filtered entities list
    const additionalEntities = graphData.entities.filter(
      (entity) => connectedEntityNames.has(entity.name) && !entityNames.has(entity.name)
    );
    filteredEntities = [...filteredEntities, ...additionalEntities];

    // Update entity names set to include connected entities
    const allEntityNames = new Set(filteredEntities.map((entity) => entity.name));
    
    // Debug: Log final results during search
    if (searchTerm) {
      console.log("🔍 FINAL entities to display:", filteredEntities.length);
      console.log("🔍 FINAL entity names:", filteredEntities.map(e => e.name));
    }

    // Filter relations based on relation type and entity names (now includes connected entities)
    // Enhanced: Ensure ALL relations involving preserved System entities are included
    let filteredRelations = graphData.relations.filter(
      (relation) => {
        const fromExists = allEntityNames.has(relation.from);
        const toExists = allEntityNames.has(relation.to);
        
        // Include relation if both entities exist in filtered set
        if (fromExists && toExists) return true;
        
        // Also include relations where one entity is a preserved System entity
        // and the other entity exists in our filtered set
        const fromEntity = graphData.entities.find(e => e.name === relation.from);
        const toEntity = graphData.entities.find(e => e.name === relation.to);
        
        const fromIsSystem = fromEntity?.entityType === "System";
        const toIsSystem = toEntity?.entityType === "System";
        
        // Include if a System entity is connected to any filtered entity
        if ((fromIsSystem && toExists) || (toIsSystem && fromExists)) {
          return true;
        }
        
        return false;
      }
    );

    if (filterRelationType !== "All") {
      filteredRelations = filteredRelations.filter(
        (relation) => relation.relationType === filterRelationType
      );
    }

    // Create nodes from filtered entities
    const nodes: Node[] = filteredEntities.map((entity) => ({
      id: entity.name,
      name: entity.name,
      entityType: entity.entityType,
      observations: entity.observations,
      _source: entity._source, // Preserve _source field for node coloring
      metadata: entity.metadata,
      // Add these properties to satisfy SimulationNodeDatum
      index: undefined,
      x: undefined,
      y: undefined,
      vx: undefined,
      vy: undefined,
      fx: undefined,
      fy: undefined,
    }));

    // Create links from filtered relations with proper typing
    const links: Link[] = [];

    // First create all nodes to ensure they exist
    const nodeMap = new Map<string, Node>();
    nodes.forEach((node) => nodeMap.set(node.id, node));

    // Then create links with proper source and target references
    filteredRelations.forEach((relation) => {
      const source = nodeMap.get(relation.from);
      const target = nodeMap.get(relation.to);

      if (source && target) {
        links.push({
          source,
          target,
          type: relation.relationType,
        });
      }
    });

    return { nodes, links };
  };

  // Calculate dimensions based on container size
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        if (width > 0 && height > 0) {
          console.log("Setting dimensions:", { width, height });
          setDimensions({ width, height });
        } else {
          console.warn("Invalid dimensions detected:", { width, height });
        }
      }
    };

    // Initial update
    updateDimensions();

    // Add resize listener
    window.addEventListener("resize", updateDimensions);

    // Force multiple recalculations to ensure container is fully rendered
    const timeoutId1 = setTimeout(updateDimensions, 100);
    const timeoutId2 = setTimeout(updateDimensions, 500);

    return () => {
      window.removeEventListener("resize", updateDimensions);
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
    };
  }, [graphData]); // Re-run when graphData changes

  // D3 force graph
  useEffect(() => {
    if (!graphData || !svgRef.current) {
      console.log("Skipping graph render due to missing graph data or SVG ref");
      return;
    }

    if (dimensions.width <= 0 || dimensions.height <= 0) {
      console.log(
        "Skipping graph render due to invalid dimensions:",
        dimensions
      );
      return;
    }

    console.log("Rendering graph with dimensions:", dimensions);

    const { nodes, links } = getFilteredData();
    // Store nodes and lookup map for navigation and recentering
    nodesRef.current = nodes;
    nodeMapRef.current = new Map(nodes.map((node) => [node.id, node]));
    
    // Always clear the previous graph, even if we have no nodes to show
    const svgElement = svgRef.current;
    d3.select(svgElement).selectAll("*").remove();
    
    // If no nodes, just show empty graph
    if (nodes.length === 0) {
      // Clear SVG and show empty state
      svgElement.setAttribute("width", `${dimensions.width}px`);
      svgElement.setAttribute("height", `${dimensions.height}px`);
      return;
    }

    const width = dimensions.width;
    const height = dimensions.height;

    // Set explicit dimensions on the SVG element (clearing already done above)
    svgElement.setAttribute("width", `${width}px`);
    svgElement.setAttribute("height", `${height}px`);

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .html(""); // Clear any existing content

    // Add zoom functionality with controllable behavior
    const g = svg.append("g");
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        transformRef.current = event.transform;
      });
    zoomBehaviorRef.current = zoomBehavior;
    svg.call(zoomBehavior as any);

    // Arrow markers for the links
    svg
      .append("defs")
      .selectAll("marker")
      .data(["end"])
      .enter()
      .append("marker")
      .attr("id", (d) => d)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", "#999")
      .attr("d", "M0,-5L10,0L0,5");

    // Create the force simulation
    const simulation = d3
      .forceSimulation<Node>(nodes)
      .force(
        "link",
        d3
          .forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(150)
      )
      .force("charge", d3.forceManyBody<Node>().strength(-500))
      .force("center", d3.forceCenter<Node>(width / 2, height / 2))
      .force("x", d3.forceX<Node>())
      .force("y", d3.forceY<Node>());

    // Create the links
    const link = g
      .append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("marker-end", "url(#end)")
      .attr("fill", "none");

    // Add link labels
    const linkText = g
      .append("g")
      .selectAll("text")
      .data(links)
      .join("text")
      .text((d) => d.type)
      .attr("font-size", 10)
      .attr("text-anchor", "middle")
      .attr("dy", -5)
      .attr("fill", "#666");

    // Create a group for each node
    const node = g
      .append("g")
      .selectAll(".node")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .call(drag(simulation) as any) // Type assertion needed for D3 drag
      .on("click", (event, d) => {
        // Select node and record history
        dispatchHistory({ type: 'select', node: d });
        event.stopPropagation();
      });

    // Add selection ring (hidden by default)
    node
      .append("circle")
      .attr("class", "selection-ring")
      .attr("r", 16)
      .attr("fill", "none")
      .attr("stroke", "#ff6b6b")
      .attr("stroke-width", 3)
      .attr("opacity", 0);

    // Add circles to nodes
    node
      .append("circle")
      .attr("class", "node-circle")
      .attr("r", 10)
      .attr("fill", (d) => {
        // FIXED: Check entityType FIRST - System and Project have fixed colors regardless of source
        // Only Pattern/knowledge nodes vary color by source (online=red, batch=blue)

        // Infrastructure entities have fixed colors
        if (d.entityType === "System") {
          return "#3cb371"; // Medium sea green for System entities (CollectiveKnowledge, etc.)
        }

        if (d.entityType === "Project") {
          return "#1e90ff"; // Dodger blue for ALL Project nodes (both online and batch)
        }

        // For Pattern/Knowledge nodes, determine source for color coding
        const isOnline = d._source === 'database' || d.metadata?.source === 'online';
        const source = isOnline ? 'online' : 'batch';

        // Base colors for data sources (only used for Pattern nodes)
        const batchBaseColor = "#87ceeb"; // Light blue for batch/manual knowledge
        const onlineBaseColor = "#f8a5a5"; // Light red for online-learned knowledge

        // Check if this node is a key insight (first-order child of a project)
        const isKeyInsight = links.some(link => {
          const sourceNode = link.source as Node;
          const targetNode = link.target as Node;
          return (sourceNode.entityType === "Project" && targetNode.id === d.id) ||
                 (targetNode.entityType === "Project" && sourceNode.id === d.id);
        });

        // Check if this node is a derived concept (second-order child - connected to key insight, not project)
        const isDerivedConcept = !isKeyInsight && links.some(link => {
          const sourceNode = link.source as Node;
          const targetNode = link.target as Node;
          const connectedNodeId = sourceNode.id === d.id ? targetNode.id :
                                  targetNode.id === d.id ? sourceNode.id : null;

          if (connectedNodeId) {
            // Check if the connected node is a key insight
            return links.some(innerLink => {
              const innerSource = innerLink.source as Node;
              const innerTarget = innerLink.target as Node;
              const connectedNodeIsKeyInsight =
                (innerSource.entityType === "Project" && innerTarget.id === connectedNodeId) ||
                (innerTarget.entityType === "Project" && innerSource.id === connectedNodeId);
              return connectedNodeIsKeyInsight;
            });
          }
          return false;
        });

        // Apply colors based on source and hierarchy (for Pattern nodes only)
        if (source === 'online') {
          // Online knowledge: Use light red color scheme
          if (isKeyInsight) {
            return "#f8a5a5"; // Light red for online key insights
          } else if (isDerivedConcept) {
            return "#ffc0cb"; // Pink for online derived concepts
          } else {
            return onlineBaseColor; // Base light red for other online nodes
          }
        } else {
          // Batch knowledge: Use light blue color scheme
          if (isKeyInsight) {
            return "#87ceeb"; // Sky blue for batch key insights
          } else if (isDerivedConcept) {
            return "#b0c4de"; // Light steel blue for batch derived concepts
          } else {
            // Fallback to entity type colors for other batch nodes
            const typeColors: Record<string, string> = {
              Memory: "#ff8c00",
              Research: "#9370db",
              FileCategories: "#4682b4",
              ScanRecord: "#cd5c5c",
              FileGroup: "#20b2aa",
              ActionPlan: "#ff6347",
              PatternLibrary: "#9acd32",
              UserPreference: "#ff69b4",
              Use_Case: "#ff7f50",
              Strategy: "#8a2be2",
              Pattern: batchBaseColor, // Explicitly handle Pattern entityType
            };
            return typeColors[d.entityType] || batchBaseColor;
          }
        }
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);

    // Add labels to nodes
    node
      .append("text")
      .attr("dx", 15)
      .attr("dy", ".35em")
      .text((d) => d.name)
      .attr("font-size", 12);

    // Add titles for hover
    node.append("title").text((d) => `${d.name} (${d.entityType})`);

    // Update positions on simulation tick
    simulation.on("tick", () => {
      link.attr("d", (d) => {
        if (
          d.source.x === undefined ||
          d.source.y === undefined ||
          d.target.x === undefined ||
          d.target.y === undefined
        )
          return "";

        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy);
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
      });

      linkText.attr("transform", (d) => {
        if (
          d.source.x === undefined ||
          d.source.y === undefined ||
          d.target.x === undefined ||
          d.target.y === undefined
        )
          return "";

        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const x = (d.source.x + d.target.x) / 2;
        const y = (d.source.y + d.target.y) / 2;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return `translate(${x},${y}) rotate(${angle})`;
      });

      node.attr("transform", (d) => {
        if (d.x === undefined || d.y === undefined) return "";
        return `translate(${d.x},${d.y})`;
      });
    });

    // Drag functionality
    function drag(simulation: d3.Simulation<Node, undefined>) {
      function dragstarted(event: d3.D3DragEvent<Element, Node, Node>) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event: d3.D3DragEvent<Element, Node, Node>) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event: d3.D3DragEvent<Element, Node, Node>) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return d3
        .drag<Element, Node>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }

    // Click outside to deselect node
    svg.on("click", () => {
      dispatchHistory({ type: 'clear' });
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, searchTerm, filterEntityType, filterRelationType, dimensions]);
  
  // Recenter graph when a node is selected
  useEffect(() => {
    if (!selectedNode || !svgRef.current || !graphData) return;
    const zoomBehavior = zoomBehaviorRef.current;
    if (!zoomBehavior) return;
    
    // Calculate available graph area (2/3 of total when sidebar is open)
    const availableWidth = dimensions.width * (2/3);
    const availableHeight = dimensions.height;
    
    // Get all nodes to calculate bounding box
    const svg = d3.select(svgRef.current);
    const allNodes = svg.selectAll('.node').data() as Node[];
    
    if (allNodes.length === 0) return;
    
    // Calculate bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allNodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x);
        maxY = Math.max(maxY, node.y);
      }
    });
    
    // Add padding around the bounding box
    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    
    // Calculate scale to fit graph in available area
    const scaleX = availableWidth / graphWidth;
    const scaleY = availableHeight / graphHeight;
    const fitScale = Math.min(scaleX, scaleY, 1.5); // Don't zoom in more than 1.5x
    
    // Check if entire graph fits in the available area at current or fit scale
    const currentScale = transformRef.current.k;
    const effectiveScale = Math.min(currentScale, fitScale);
    
    if (graphWidth * effectiveScale <= availableWidth && graphHeight * effectiveScale <= availableHeight) {
      // Center the entire graph in the available area
      const graphCenterX = (minX + maxX) / 2;
      const graphCenterY = (minY + maxY) / 2;
      const newX = availableWidth / 2 - graphCenterX * effectiveScale;
      const newY = availableHeight / 2 - graphCenterY * effectiveScale;
      
      const svgSel = d3.select(svgRef.current);
      svgSel
        .transition()
        .duration(750)
        .call(
          zoomBehavior.transform as any,
          d3.zoomIdentity.translate(newX, newY).scale(effectiveScale)
        );
    } else {
      // Graph doesn't fit, center the selected node instead
      const { x, y } = selectedNode;
      if (x === undefined || y === undefined) return;
      
      const newX = availableWidth / 2 - x * currentScale;
      const newY = availableHeight / 2 - y * currentScale;
      
      const svgSel = d3.select(svgRef.current);
      svgSel
        .transition()
        .duration(750)
        .call(
          zoomBehavior.transform as any,
          d3.zoomIdentity.translate(newX, newY).scale(currentScale)
        );
    }
  }, [selectedNode, dimensions, graphData]);

  // Update selection ring visibility when node selection changes
  useEffect(() => {
    if (!svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    
    // Hide all selection rings
    svg.selectAll('.selection-ring')
      .attr('opacity', 0);
    
    // Show selection ring for selected node
    if (selectedNode) {
      svg.selectAll('.node')
        .filter((d: any) => d.id === selectedNode.id)
        .select('.selection-ring')
        .attr('opacity', 1);
    }
  }, [selectedNode]);

  // Helper function to get relation counts
  const getRelationCounts = (nodeName) => {
    if (!graphData) return { inbound: 0, outbound: 0 };

    const inbound = graphData.relations.filter((r) => r.to === nodeName).length;
    const outbound = graphData.relations.filter(
      (r) => r.from === nodeName
    ).length;

    return { inbound, outbound };
  };

  // Reset the visualization
  const resetVisualization = () => {
    setGraphData(null);
    // Reset history and selection
    dispatchHistory({ type: 'reset' });
    setSearchTerm("");
    setFilterEntityType("All");
    setFilterRelationType("All");
    setErrorMessage("");
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {!graphData ? (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <svg className="w-24 h-24" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="#475569">
                <circle cx="16" cy="16" r="15" fill="none" stroke="#475569" strokeWidth="2"/>
                <path d="M8 16.5v-1h3.5c0-.8-.2-1.5-.6-2.1l-2.5 2.5c-.3.3-.3.8 0 1.1.1.1.3.2.4.2s.3-.1.4-.2l2.5-2.5c.6-.4 1.3-.6 2.1-.6V8h1v3.5c.8 0 1.5.2 2.1.6l2.5-2.5c.3-.3.8-.3 1.1 0 .3.3.3.8 0 1.1L18 12.9c.4.6.6 1.3.6 2.1H24v1h-5.5c0 .8-.2 1.5-.6 2.1l2.5 2.5c.3.3.3.8 0 1.1-.1.1-.3.2-.4.2s-.3-.1-.4-.2L17 19.1c-.6.4-1.3.6-2.1.6V24h-1v-4.5c-.8 0-1.5-.2-2.1-.6l-2.5 2.5c-.3.3-.8.3-1.1 0-.3-.3-.3-.8 0-1.1L10.9 18c-.4-.6-.6-1.3-.6-2.1H8z" fill="#475569"/>
                <circle cx="11.5" cy="11.5" r="1.5" fill="#475569"/>
                <circle cx="20.5" cy="11.5" r="1.5" fill="#475569"/>
                <circle cx="16" cy="20.5" r="1.5" fill="#475569"/>
              </svg>
            </div>
            <h1 className="text-3xl font-bold mb-4">
              DDD Coding Insights Visualizer
            </h1>
            <p className="text-lg text-gray-600">
              Explore and analyze DDD coding insights and knowledge patterns
            </p>
            <span>
              <a
                href="https://github.com/modelcontextprotocol/servers/tree/main/src/memory"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline text-xs"
              >
                https://github.com/modelcontextprotocol/servers/tree/main/src/memory
              </a>
            </span>

            {isLoading && (
              <div className="flex justify-center mb-6">
                <svg
                  className="animate-spin h-8 w-8 text-blue-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            )}

            {errorMessage && (
              <div className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded">
                <div className="flex items-center">
                  <svg
                    className="h-6 w-6 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <p>{errorMessage}</p>
                </div>
              </div>
            )}
          </div>

          <div
            className={`border-4 border-dashed rounded-lg p-12 w-full max-w-xl flex flex-col items-center justify-center transition-colors ${
              isDragging
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 bg-white"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="text-center mb-6">
              <div className="relative">
                <svg
                  className="mx-auto h-16 w-16 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-medium text-gray-900">
                Drag & drop your memory.json file
              </h2>
              <p className="mt-2 text-gray-500">or click to browse</p>
              <p className="mt-2 text-sm text-gray-400">
                You can also paste JSON content directly (⌘+V / Ctrl+V)
              </p>
            </div>

            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="mt-2 py-2 px-6 bg-slate-700 hover:bg-slate-800 text-white font-medium rounded-md cursor-pointer transition-colors flex items-center"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 13l-3 3m0 0l-3-3m3 3V8m0 13a9 9 0 110-18 9 9 0 010 18z"
                />
              </svg>
              Upload memory.json
            </label>
          </div>

          <div className="mt-8 text-center">
            <h3 className="flex items-center justify-center font-medium mb-3 text-slate-800">
              <svg 
                className="w-5 h-5 mr-2" 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 32 32"
                fill="#475569"
              >
                <circle cx="16" cy="16" r="15" fill="none" stroke="#475569" strokeWidth="2"/>
                <path d="M8 16.5v-1h3.5c0-.8-.2-1.5-.6-2.1l-2.5 2.5c-.3.3-.3.8 0 1.1.1.1.3.2.4.2s.3-.1.4-.2l2.5-2.5c.6-.4 1.3-.6 2.1-.6V8h1v3.5c.8 0 1.5.2 2.1.6l2.5-2.5c.3-.3.8-.3 1.1 0 .3.3.3.8 0 1.1L18 12.9c.4.6.6 1.3.6 2.1H24v1h-5.5c0 .8-.2 1.5-.6 2.1l2.5 2.5c.3.3.3.8 0 1.1-.1.1-.3.2-.4.2s-.3-.1-.4-.2L17 19.1c-.6.4-1.3.6-2.1.6V24h-1v-4.5c-.8 0-1.5-.2-2.1-.6l-2.5 2.5c-.3.3-.8.3-1.1 0-.3-.3-.3-.8 0-1.1L10.9 18c-.4-.6-.6-1.3-.6-2.1H8z" fill="#475569"/>
                <circle cx="11.5" cy="11.5" r="1.5" fill="#475569"/>
                <circle cx="20.5" cy="11.5" r="1.5" fill="#475569"/>
                <circle cx="16" cy="20.5" r="1.5" fill="#475569"/>
              </svg>
              DDD Coding Insights Format:
            </h3>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 inline-block text-left">
              <div className="flex items-center mb-2 text-slate-800">
                <svg
                  className="w-5 h-5 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 5H21V7H3V5ZM3 11H21V13H3V11ZM3 17H21V19H3V17Z"
                    fill="currentColor"
                  />
                </svg>
                <p className="font-medium">File Structure:</p>
              </div>
              <p className="text-sm mb-2 ml-7">
                • Each line is a separate JSON object (entities/relations)
              </p>

              <div className="flex items-center mb-2 text-slate-800">
                <svg
                  className="w-5 h-5 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 18C11.45 18 11 17.55 11 17C11 16.45 11.45 16 12 16C12.55 16 13 16.45 13 17C13 17.55 12.55 18 12 18ZM13 14H11C11 12.32 12.68 12.5 12.68 11C12.68 10.18 11.96 9.5 11 9.5C10.22 9.5 9.54 10 9.16 10.75L7.56 9.83C8.19 8.33 9.5 7.5 11 7.5C13.21 7.5 15 9.08 15 11C15 12.94 13 13.31 13 14Z"
                    fill="currentColor"
                  />
                </svg>
                <p className="font-medium">Required Properties:</p>
              </div>
              <p className="text-sm mb-1 ml-7">
                •{" "}
                <code className="bg-gray-200 px-1 rounded">
                  "type": "entity"
                </code>{" "}
                or{" "}
                <code className="bg-gray-200 px-1 rounded">
                  "type": "relation"
                </code>
              </p>
              <p className="text-sm mb-2 ml-7">
                • Entities need: name, entityType, observations
              </p>
              <p className="text-sm mb-1 ml-7">
                • Relations need: from, to, relationType
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-screen">
          <div className="bg-white p-4 border-b border-gray-300 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-2">
                {/* Back/Forward navigation */}
                <button
                  onClick={() => dispatchHistory({ type: 'back' })}
                  disabled={index <= 0}
                  className="p-1 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 rounded"
                >
                  &larr;
                </button>
                <button
                  onClick={() => dispatchHistory({ type: 'forward' })}
                  disabled={index >= history.length - 1}
                  className="p-1 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 rounded"
                >
                  &rarr;
                </button>
                <svg
                  className="w-8 h-8 text-slate-700"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 32 32"
                  fill="currentColor"
                >
                  <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <path d="M8 16.5v-1h3.5c0-.8-.2-1.5-.6-2.1l-2.5 2.5c-.3.3-.3.8 0 1.1.1.1.3.2.4.2s.3-.1.4-.2l2.5-2.5c.6-.4 1.3-.6 2.1-.6V8h1v3.5c.8 0 1.5.2 2.1.6l2.5-2.5c.3-.3.8-.3 1.1 0 .3.3.3.8 0 1.1L18 12.9c.4.6.6 1.3.6 2.1H24v1h-5.5c0 .8-.2 1.5-.6 2.1l2.5 2.5c.3.3.3.8 0 1.1-.1.1-.3.2-.4.2s-.3-.1-.4-.2L17 19.1c-.6.4-1.3.6-2.1.6V24h-1v-4.5c-.8 0-1.5-.2-2.1-.6l-2.5 2.5c-.3.3-.8.3-1.1 0-.3-.3-.3-.8 0-1.1L10.9 18c-.4-.6-.6-1.3-.6-2.1H8z"/>
                  <circle cx="11.5" cy="11.5" r="1.5" fill="currentColor"/>
                  <circle cx="20.5" cy="11.5" r="1.5" fill="currentColor"/>
                  <circle cx="16" cy="20.5" r="1.5" fill="currentColor"/>
                </svg>
                <h1 className="text-xl font-bold">
                  DDD Coding Insights Visualizer
                </h1>
              </div>
              <button
                onClick={resetVisualization}
                className="py-1 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors flex items-center"
              >
                <svg 
                  className="w-4 h-4 mr-1" 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 32 32"
                  fill="currentColor"
                >
                  <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <path d="M8 16.5v-1h3.5c0-.8-.2-1.5-.6-2.1l-2.5 2.5c-.3.3-.3.8 0 1.1.1.1.3.2.4.2s.3-.1.4-.2l2.5-2.5c.6-.4 1.3-.6 2.1-.6V8h1v3.5c.8 0 1.5.2 2.1.6l2.5-2.5c.3-.3.8-.3 1.1 0 .3.3.3.8 0 1.1L18 12.9c.4.6.6 1.3.6 2.1H24v1h-5.5c0 .8-.2 1.5-.6 2.1l2.5 2.5c.3.3.3.8 0 1.1-.1.1-.3.2-.4.2s-.3-.1-.4-.2L17 19.1c-.6.4-1.3.6-2.1.6V24h-1v-4.5c-.8 0-1.5-.2-2.1-.6l-2.5 2.5c-.3.3-.8.3-1.1 0-.3-.3-.3-.8 0-1.1L10.9 18c-.4-.6-.6-1.3-.6-2.1H8z" fill="currentColor"/>
                  <circle cx="11.5" cy="11.5" r="1.5" fill="currentColor"/>
                  <circle cx="20.5" cy="11.5" r="1.5" fill="currentColor"/>
                  <circle cx="16" cy="20.5" r="1.5" fill="currentColor"/>
                </svg>
                Upload New File
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="bg-slate-100 text-slate-800 px-3 py-1 rounded-full text-sm font-medium">
                {stats.entityCount} Entities
              </div>
              <div className="bg-slate-100 text-slate-800 px-3 py-1 rounded-full text-sm font-medium border-2 border-slate-200">
                {stats.relationCount} Relations
              </div>
              <div className="bg-slate-50 text-slate-700 px-3 py-1 rounded-full text-sm font-medium">
                {stats.entityTypeCount} Entity Types
              </div>
              <div className="bg-slate-50 text-slate-700 px-3 py-1 rounded-full text-sm font-medium border-2 border-slate-100">
                {stats.relationTypeCount} Relation Types
              </div>
              {stats.batchCount !== undefined && stats.batchCount > 0 && (
                <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                  📘 {stats.batchCount} Batch
                </div>
              )}
              {stats.onlineCount !== undefined && stats.onlineCount > 0 && (
                <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                  🌐 {stats.onlineCount} Online
                </div>
              )}
              {searchTerm && (
                <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium border-2 border-red-300">
                  🔍 Searching: "{searchTerm}" - Showing {(() => {
                    const { nodes } = getFilteredData();
                    return nodes.length;
                  })()} results
                </div>
              )}
            </div>

            {/* ENHANCED: Data Source Selector */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Knowledge Source:
              </label>
              <div className="flex gap-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="dataSource"
                    value="batch"
                    checked={dataSource === 'batch'}
                    onChange={(e) => handleDataSourceChange(e.target.value as 'batch' | 'online' | 'combined')}
                    disabled={dataSource === null}
                    className="mr-2"
                  />
                  <span className="text-sm">📘 Batch (Manual)</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="dataSource"
                    value="online"
                    checked={dataSource === 'online'}
                    onChange={(e) => handleDataSourceChange(e.target.value as 'batch' | 'online' | 'combined')}
                    disabled={dataSource === null}
                    className="mr-2"
                  />
                  <span className="text-sm">🌐 Online (Auto-learned)</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="dataSource"
                    value="combined"
                    checked={dataSource === 'combined'}
                    onChange={(e) => handleDataSourceChange(e.target.value as 'batch' | 'online' | 'combined')}
                    disabled={dataSource === null}
                    className="mr-2"
                  />
                  <span className="text-sm">🔄 Combined (Both)</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="search"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Search:
                </label>
                <input
                  id="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    console.log("📝 Search input onChange:", e.target.value);
                    setSearchTerm(e.target.value);
                  }}
                  placeholder="Search by name or content..."
                  className="w-full p-2 border border-gray-300 rounded"
                />
              </div>

              <div>
                <label
                  htmlFor="entityType"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Filter by Entity Type:
                </label>
                <select
                  id="entityType"
                  value={filterEntityType}
                  onChange={(e) => setFilterEntityType(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  {entityTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="relationType"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Filter by Relation Type:
                </label>
                <select
                  id="relationType"
                  value={filterRelationType}
                  onChange={(e) => setFilterRelationType(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  {relationTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

          </div>

          {/* ENHANCED: Legend for color coding - positioned below header, right side */}
          <div className="absolute top-16 right-4 p-3 bg-white/95 backdrop-blur rounded-lg border border-gray-300 shadow-lg z-10">
            <h3 className="text-xs font-semibold text-gray-700 mb-2">Node Colors</h3>
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: "#87ceeb"}}></div>
                <span className="ml-1.5">Batch (Manual)</span>
              </div>
              <div className="flex items-center whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: "#f8a5a5"}}></div>
                <span className="ml-1.5">Online (Auto)</span>
              </div>
              <div className="flex items-center whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: "#1e90ff"}}></div>
                <span className="ml-1.5">Project</span>
              </div>
              <div className="flex items-center whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: "#3cb371"}}></div>
                <span className="ml-1.5">System Entity</span>
              </div>
            </div>
          </div>

          <div
            className="flex flex-1 overflow-hidden"
            style={{ height: "calc(100vh - 180px)", minHeight: "500px" }}
            ref={containerRef}
          >
            <div
              className="flex-1 overflow-hidden relative"
              style={{ height: "100%", width: "100%" }}
            >
              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                className="bg-white absolute top-0 left-0"
                style={{ minHeight: "500px" }}
              ></svg>
            </div>

            {selectedNode && (
              <div className="w-1/3 p-4 bg-slate-50 border-l border-slate-200 overflow-y-auto">
                <div className="flex items-center mb-3">
                  <svg 
                    className="w-5 h-5 mr-2 text-slate-600" 
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 32 32"
                    fill="currentColor"
                  >
                    <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth="2"/>
                    <path d="M8 16.5v-1h3.5c0-.8-.2-1.5-.6-2.1l-2.5 2.5c-.3.3-.3.8 0 1.1.1.1.3.2.4.2s.3-.1.4-.2l2.5-2.5c.6-.4 1.3-.6 2.1-.6V8h1v3.5c.8 0 1.5.2 2.1.6l2.5-2.5c.3-.3.8-.3 1.1 0 .3.3.3.8 0 1.1L18 12.9c.4.6.6 1.3.6 2.1H24v1h-5.5c0 .8-.2 1.5-.6 2.1l2.5 2.5c.3.3.3.8 0 1.1-.1.1-.3.2-.4.2s-.3-.1-.4-.2L17 19.1c-.6.4-1.3.6-2.1.6V24h-1v-4.5c-.8 0-1.5-.2-2.1-.6l-2.5 2.5c-.3.3-.8.3-1.1 0-.3-.3-.3-.8 0-1.1L10.9 18c-.4-.6-.6-1.3-.6-2.1H8z" fill="currentColor"/>
                    <circle cx="11.5" cy="11.5" r="1.5" fill="currentColor"/>
                    <circle cx="20.5" cy="11.5" r="1.5" fill="currentColor"/>
                    <circle cx="16" cy="20.5" r="1.5" fill="currentColor"/>
                  </svg>
                  <span className="text-sm font-medium text-slate-600">Entity Details</span>
                </div>
                <h2 className="text-lg font-bold mb-2">{selectedNode.name}</h2>
                <div className="mb-4 space-y-1">
                  <p className="text-sm text-gray-600">
                    Type: <span className="font-medium">{selectedNode.entityType}</span>
                  </p>
                  {selectedNode.metadata?.source && (
                    <p className="text-sm">
                      Source: {selectedNode.metadata.source === 'online' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          🌐 Online (Auto-learned)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          📘 Batch (Manual)
                        </span>
                      )}
                    </p>
                  )}
                  {selectedNode.metadata?.confidence !== undefined && (
                    <p className="text-sm text-gray-600">
                      Confidence: <span className="font-medium">{(selectedNode.metadata.confidence * 100).toFixed(0)}%</span>
                    </p>
                  )}
                  {selectedNode.metadata?.extractedAt && (
                    <p className="text-xs text-gray-500">
                      Extracted: {new Date(selectedNode.metadata.extractedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                {selectedNode.observations && (
                  <>
                    <h3 className="font-bold text-slate-800 mb-2 flex items-center">
                      <svg
                        className="w-4 h-4 mr-1"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z"
                          fill="currentColor"
                        />
                      </svg>
                      Observations:
                    </h3>
                    <div className="mb-4">
                      <ul className="list-disc pl-5">
                        {renderObservations(selectedNode.observations, onOpenMarkdown)}
                      </ul>
                    </div>
                  </>
                )}

                {graphData && (
                  <>
                    <h3 className="font-bold text-gray-700 mb-2">Relations:</h3>
                    <div className="mb-2">
                      <p className="text-sm">
                        <span className="font-medium">Connections:</span>{" "}
                        {getRelationCounts(selectedNode.name).inbound +
                          getRelationCounts(selectedNode.name).outbound}
                        &nbsp;({getRelationCounts(selectedNode.name).inbound}{" "}
                        inbound, {getRelationCounts(selectedNode.name).outbound}{" "}
                        outbound)
                      </p>
                    </div>

                    {graphData.relations.filter(
                      (r) => r.from === selectedNode.name
                    ).length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-sm font-semibold mb-1">
                          Outbound:
                        </h4>
                        <ul className="list-disc pl-5">
                          {graphData.relations
                            .filter((r) => r.from === selectedNode.name)
                            .map((r, i) => (
                              <li key={i} className="text-sm mb-1">
                                <span className="italic text-blue-600">
                                  {r.relationType}
                                </span>{" "}
                                →{" "}
                                <button
                                  onClick={() => {
                                    // Navigate to outbound node
                                    const node = nodeMapRef.current.get(r.to);
                                    if (node) {
                                      dispatchHistory({ type: 'select', node });
                                    }
                                  }}
                                  className="text-blue-600 hover:underline"
                                >
                                  {r.to}
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}

                    {graphData.relations.filter(
                      (r) => r.to === selectedNode.name
                    ).length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Inbound:</h4>
                        <ul className="list-disc pl-5">
                          {graphData.relations
                            .filter((r) => r.to === selectedNode.name)
                            .map((r, i) => (
                              <li key={i} className="text-sm mb-1">
                                <button
                                  onClick={() => {
                                    // Navigate to inbound node
                                    const node = nodeMapRef.current.get(r.from);
                                    if (node) {
                                      dispatchHistory({ type: 'select', node });
                                    }
                                  }}
                                  className="text-blue-600 hover:underline"
                                >
                                  {r.from}
                                </button>{" "}
                                →{" "}
                                <span className="italic text-blue-600">
                                  {r.relationType}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="bg-gray-100 p-2 border-t border-gray-300 text-xs text-gray-600">
            <p>
              <span className="font-medium">Instructions:</span> Drag nodes to
              reposition. Zoom with mouse wheel. Click a node to see details.
            </p>
          </div>
        </div>
      )}

      {/* Floating Team Selector */}
      <TeamSelector />
    </div>
  );
};

export default KnowledgeGraphVisualization;
