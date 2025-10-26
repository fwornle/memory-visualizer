# Memory Visualizer - Development Guide

## Getting Started

### Prerequisites

- **Node.js 18+**: JavaScript runtime
- **npm 9+**: Package manager
- **Git**: Version control
- **Code Editor**: VS Code recommended

### Installation

```bash
# Clone the repository
cd integrations/memory-visualizer

# Install dependencies
npm install

# Start development server
npm run dev

# Open browser
# Visit http://localhost:5173
```

---

## Development Workflow

### Available Scripts

```bash
# Development server with HMR
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Type checking
npx tsc --noEmit

# Linting (if configured)
npm run lint

# Format code (if configured)
npm run format
```

### Development Server

Vite dev server features:
- **Hot Module Replacement (HMR)**: Instant updates
- **Fast Refresh**: Preserves component state
- **TypeScript checking**: Real-time type errors
- **Port**: 5173 (configurable in `vite.config.ts`)

---

## Project Structure

```
memory-visualizer/
├── src/
│   ├── api/
│   │   └── databaseClient.ts      # Data source abstraction
│   ├── components/
│   │   ├── Filters/               # Filter components
│   │   │   ├── SearchFilter.tsx
│   │   │   ├── TeamFilter.tsx
│   │   │   ├── TypeFilters.tsx
│   │   │   └── SourceFilter.tsx
│   │   ├── KnowledgeGraph/        # Core visualization
│   │   │   ├── index.tsx
│   │   │   ├── GraphVisualization.tsx
│   │   │   └── NodeDetails.tsx
│   │   ├── MarkdownViewer.tsx     # Markdown rendering
│   │   └── MermaidDiagram.tsx     # Diagram support
│   ├── store/
│   │   ├── index.ts               # Redux store
│   │   └── graphSlice.ts          # Graph state slice
│   ├── utils/
│   │   └── graphHelpers.ts        # Graph utilities
│   ├── App.tsx                    # Root component
│   ├── main.tsx                   # Entry point
│   └── index.css                  # Global styles
├── public/                        # Static assets
├── docs/                          # Documentation
│   ├── puml/                      # PlantUML sources
│   └── images/                    # Generated diagrams
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## Key Technologies

### React + TypeScript

**Component Patterns**:
```typescript
// Functional component with props
interface Props {
  data: GraphData;
  onSelect: (id: string) => void;
}

export const MyComponent: React.FC<Props> = ({ data, onSelect }) => {
  // Component logic
  return <div>...</div>;
};
```

**Hooks Used**:
- `useState`: Local component state
- `useEffect`: Side effects and lifecycle
- `useSelector`: Redux state access
- `useDispatch`: Redux action dispatch
- `useCallback`: Memoized callbacks
- `useMemo`: Memoized values

### Redux Toolkit

**State Shape**:
```typescript
interface GraphState {
  entities: Entity[];
  relations: Relation[];
  selectedEntityId: string | null;
  filters: {
    entityTypes: string[];
    relationTypes: string[];
    searchQuery: string;
    activeTeam: string;
  };
  loading: boolean;
  error: string | null;
}
```

**Creating Actions**:
```typescript
// In graphSlice.ts
export const graphSlice = createSlice({
  name: 'graph',
  initialState,
  reducers: {
    setEntities: (state, action: PayloadAction<Entity[]>) => {
      state.entities = action.payload;
    },
    selectEntity: (state, action: PayloadAction<string>) => {
      state.selectedEntityId = action.payload;
    },
    // ... more reducers
  },
});

export const { setEntities, selectEntity } = graphSlice.actions;
```

### D3.js Visualization

**Force Simulation Setup**:
```typescript
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links)
    .id((d: any) => d.id)
    .distance(100)
  )
  .force('charge', d3.forceManyBody().strength(-300))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide().radius(30));
```

**SVG Rendering**:
```typescript
// Create SVG container
const svg = d3.select(containerRef.current)
  .append('svg')
  .attr('width', width)
  .attr('height', height);

// Add zoom behavior
const zoom = d3.zoom()
  .on('zoom', (event) => {
    g.attr('transform', event.transform);
  });

svg.call(zoom);
```

### TailwindCSS

**Utility Classes**:
```tsx
<div className="flex flex-col gap-4 p-6 bg-white rounded-lg shadow-md">
  <h2 className="text-2xl font-bold text-gray-900">Title</h2>
  <p className="text-gray-600">Content</p>
</div>
```

**Custom Configuration** (`tailwind.config.js`):
```javascript
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Custom colors
      },
    },
  },
  plugins: [],
};
```

---

## Adding New Features

### 1. Adding a New Filter

**Step 1**: Create filter component

```typescript
// src/components/Filters/MyFilter.tsx
import { useDispatch, useSelector } from 'react-redux';
import { setMyFilter } from '../../store/graphSlice';

export const MyFilter: React.FC = () => {
  const dispatch = useDispatch();
  const currentValue = useSelector(state => state.graph.filters.myFilter);

  const handleChange = (value: string) => {
    dispatch(setMyFilter(value));
  };

  return (
    <select value={currentValue} onChange={e => handleChange(e.target.value)}>
      <option value="all">All</option>
      <option value="filtered">Filtered</option>
    </select>
  );
};
```

**Step 2**: Add filter state to Redux

```typescript
// src/store/graphSlice.ts
interface GraphState {
  filters: {
    // ... existing filters
    myFilter: string;
  };
}

const initialState: GraphState = {
  filters: {
    // ... existing
    myFilter: 'all',
  },
};

// Add reducer
reducers: {
  setMyFilter: (state, action: PayloadAction<string>) => {
    state.filters.myFilter = action.payload;
  },
}
```

**Step 3**: Implement filter logic

```typescript
// src/utils/graphHelpers.ts
export const filterEntitiesByMyFilter = (
  entities: Entity[],
  filterValue: string
): Entity[] => {
  if (filterValue === 'all') return entities;
  return entities.filter(e => /* filter logic */);
};
```

**Step 4**: Use in component

```typescript
// src/components/KnowledgeGraph/index.tsx
import { MyFilter } from '../Filters/MyFilter';

// In component
<MyFilter />
```

### 2. Adding a New Visualization

**Step 1**: Create visualization component

```typescript
// src/components/MyVisualization.tsx
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Props {
  data: GraphData;
}

export const MyVisualization: React.FC<Props> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    // D3 visualization code
  }, [data]);

  return <svg ref={svgRef} />;
};
```

**Step 2**: Add routing/switching logic

**Step 3**: Connect to Redux state

**Step 4**: Add controls and interactions

### 3. Adding a New Data Source

**Step 1**: Implement data source interface

```typescript
// src/api/myDataSource.ts
export class MyDataSource {
  async loadData(): Promise<GraphData> {
    // Fetch data from source
    const response = await fetch('...');
    const data = await response.json();

    // Transform to standard format
    return this.transformData(data);
  }

  private transformData(raw: any): GraphData {
    return {
      entities: raw.nodes.map(/* transform */),
      relations: raw.edges.map(/* transform */),
    };
  }
}
```

**Step 2**: Register in database client

```typescript
// src/api/databaseClient.ts
import { MyDataSource } from './myDataSource';

export const loadFromMySource = async () => {
  const source = new MyDataSource();
  return await source.loadData();
};
```

**Step 3**: Add UI for source selection

---

## Testing

### Unit Testing (Future)

Recommended setup:
```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom
```

Example test:
```typescript
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Integration Testing

Test complete workflows:
- Load data → filter → select entity → view details
- Upload JSON → validate → render → interact
- Switch teams → reload → verify isolation

### E2E Testing

Use Playwright or Cypress for end-to-end testing:

```typescript
test('loads and displays graph', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.setInputFiles('input[type=file]', 'test-data.json');
  await expect(page.locator('svg')).toBeVisible();
});
```

---

## Performance Optimization

### React Optimization

**Memoization**:
```typescript
import { memo, useMemo, useCallback } from 'react';

// Memoize component
export const MyComponent = memo(({ data }: Props) => {
  // Memoize expensive calculations
  const processedData = useMemo(() => {
    return expensiveCalculation(data);
  }, [data]);

  // Memoize callbacks
  const handleClick = useCallback(() => {
    // Handler logic
  }, [/* dependencies */]);

  return <div>...</div>;
});
```

**Code Splitting**:
```typescript
import { lazy, Suspense } from 'react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <HeavyComponent />
    </Suspense>
  );
}
```

### D3 Optimization

**Canvas Fallback** for large graphs:
```typescript
if (nodes.length > 1000) {
  // Use canvas instead of SVG
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // Canvas rendering
} else {
  // SVG rendering
}
```

**Throttle Updates**:
```typescript
import { throttle } from 'lodash';

const handleTick = throttle(() => {
  // Update visualization
}, 16); // ~60fps

simulation.on('tick', handleTick);
```

### Bundle Optimization

**Vite Configuration**:
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'd3': ['d3'],
          'react-vendor': ['react', 'react-dom'],
          'redux-vendor': ['@reduxjs/toolkit', 'react-redux'],
        },
      },
    },
  },
});
```

---

## Debugging

### React DevTools

Install React DevTools browser extension:
- Inspect component tree
- View props and state
- Profile performance
- Track re-renders

### Redux DevTools

Install Redux DevTools extension:
- View state changes
- Time-travel debugging
- Action replay
- State export/import

### Browser DevTools

**Console**: Check for errors and warnings

**Network**: Monitor data loading

**Performance**: Profile rendering performance

**Sources**: Set breakpoints in TypeScript

---

## Building for Production

### Build Process

```bash
npm run build
```

**Output**: `dist/` directory containing:
- Optimized JavaScript bundles
- Minified CSS
- Static assets
- index.html entry point

### Build Optimizations

Vite automatically:
- Tree-shaking for dead code elimination
- Minification of JS/CSS
- Asset optimization (images, fonts)
- Code splitting for lazy loading
- Cache busting with content hashes

### Environment Variables

Create `.env` files:

```bash
# .env.production
VITE_API_URL=https://api.production.com
VITE_ENABLE_ANALYTICS=true
```

Access in code:
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

---

## Deployment

### Static Hosting

**Vercel**:
```bash
npm install -g vercel
vercel --prod
```

**Netlify**:
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

**GitHub Pages**:
```bash
npm run build
# Copy dist/ to gh-pages branch
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:
```bash
docker build -t memory-visualizer .
docker run -p 8080:80 memory-visualizer
```

---

## Contributing

### Code Style

Follow existing patterns:
- TypeScript strict mode
- Functional components with hooks
- Redux Toolkit for state
- TailwindCSS for styling
- Descriptive variable names

### Commit Messages

Use conventional commits:
```
feat: add team filter component
fix: resolve D3 force simulation bug
docs: update architecture documentation
style: format code with prettier
refactor: extract graph helpers
test: add unit tests for filters
```

### Pull Request Process

1. Fork repository
2. Create feature branch
3. Make changes with tests
4. Update documentation
5. Submit PR with description
6. Address review feedback

---

## Troubleshooting

### Common Issues

**Issue**: TypeScript errors in D3 code

**Solution**: Use type assertions or install @types/d3

**Issue**: HMR not working

**Solution**: Check Vite config, restart dev server

**Issue**: Build fails with memory error

**Solution**: Increase Node memory: `NODE_OPTIONS=--max-old-space-size=4096 npm run build`

---

## Resources

- **React Documentation**: https://react.dev
- **TypeScript Handbook**: https://www.typescriptlang.org/docs
- **Redux Toolkit**: https://redux-toolkit.js.org
- **D3.js**: https://d3js.org
- **Vite**: https://vitejs.dev
- **TailwindCSS**: https://tailwindcss.com

---

*Development Guide for Memory Visualizer v1.0.0*
