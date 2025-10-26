# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Memory Visualizer is an interactive web application for visualizing knowledge graphs from the VKB (Visual Knowledge Base) GraphDB. It renders entities, relationships, and observations using a **Redux + MVI (Model-View-Intent) architecture**.

**Key Features:**
- Real-time knowledge graph visualization with D3.js
- Team-based filtering (coding, ui, resi, etc.)
- Source filtering (batch/manual vs online/auto-learned)
- Interactive node selection with detailed sidebar
- Color-coded nodes: light blue (batch), light red (online)
- Markdown documentation viewer integration

## Commands

### Development
- `npm run dev` - Start development server on port 3000 with hot reload
- `npm run build` - Build production bundle to `dist/` directory
- `npm run preview` - Preview production build locally

### Installation
- `npm install` - Install all dependencies

## Architecture

**Modern React + Redux + TypeScript SPA with MVI Pattern**

### MVI (Model-View-Intent) Architecture

**Model (Redux Store)**
- `store/slices/graphSlice.ts` - Graph data (entities, relations, loading state)
- `store/slices/filtersSlice.ts` - Filter state (teams, source, search, types)
- `store/slices/navigationSlice.ts` - Navigation state (selected node, markdown viewer)
- `store/slices/uiSlice.ts` - UI state (dimensions, errors, database health)

**View (React Components)**
- `components/KnowledgeGraph/` - Main graph container and visualization
- `components/Filters/` - Filter UI components (Team, Source, Search, Type)
- `components/MarkdownViewer/` - Documentation viewer

**Intent (Async Thunks)**
- `intents/graphIntents.ts` - Data loading, database health checks
- `intents/filterIntents.ts` - Filter updates triggering data reload

### Data Flow
1. User interactions dispatch **intents** (actions/thunks)
2. Intents update **model** (Redux slices) and trigger side effects
3. Components read from **model** via typed selectors
4. **Views** re-render automatically when model changes

### Data Source
- **Primary**: GraphDB via VKB API (http://localhost:8080/api/*)
- **No JSON file uploads** - GraphDB is the single source of truth
- Teams and source filters are **independent** and can be combined

## Key Technical Details

- **React 18** with TypeScript (non-strict mode)
- **D3.js v7** for force-directed graph visualization
- **Vite** as the build tool for fast development
- **TailwindCSS** for styling
- **React-Markdown** with GitHub Flavored Markdown support for documentation rendering
- **Mermaid.js** integration for rendering diagrams in markdown files
- The app expects memory data in a specific format with entities, relationships, and observations
- No backend required - runs entirely in the browser

## Markdown Documentation Support

The MarkdownViewer component supports:
- Full GitHub Flavored Markdown (tables, strikethrough, task lists, etc.)
- Syntax highlighting for code blocks via highlight.js
- **Mermaid diagram rendering** - any code block with `language-mermaid` is automatically rendered as an interactive diagram
- Automatic image path resolution for relative paths
- Responsive layout with proper prose styling

### Supported Mermaid Diagram Types
- Flowcharts and flow diagrams
- Sequence diagrams 
- Class diagrams
- State diagrams
- Entity relationship diagrams
- User journey maps
- Gantt charts
- Pie charts
- And many more...