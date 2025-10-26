/**
 * Navigation Slice
 *
 * Manages navigation state including:
 * - Selected node and navigation history
 * - Markdown viewer state and history
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Node {
  id: string;
  name: string;
  entityType: string;
  observations: string[];
  x?: number;
  y?: number;
  // D3 force simulation properties - must be mutable
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  // Additional D3 internal properties that may be set
  index?: number;
  metadata?: any;
}

export interface MarkdownHistoryItem {
  filePath: string;
  title: string;
}

interface NavigationState {
  // Node selection and history
  selectedNode: Node | null;
  nodeHistory: Node[];
  nodeHistoryIndex: number;

  // Markdown viewer
  markdownFile: string | null;
  markdownHistory: MarkdownHistoryItem[];
  markdownHistoryIndex: number;
}

const initialState: NavigationState = {
  selectedNode: null,
  nodeHistory: [],
  nodeHistoryIndex: -1,
  markdownFile: null,
  markdownHistory: [],
  markdownHistoryIndex: -1,
};

const navigationSlice = createSlice({
  name: 'navigation',
  initialState,
  reducers: {
    // Node selection actions
    selectNode: (state, action: PayloadAction<Node | null>) => {
      const node = action.payload;

      if (!node) {
        state.selectedNode = null;
        return;
      }

      // Add to history if it's a new selection
      if (!state.selectedNode || state.selectedNode.id !== node.id) {
        // Remove any forward history
        state.nodeHistory = state.nodeHistory.slice(0, state.nodeHistoryIndex + 1);
        // Add new node
        state.nodeHistory.push(node);
        state.nodeHistoryIndex = state.nodeHistory.length - 1;
        state.selectedNode = node;
      }
    },

    navigateBack: (state) => {
      if (state.nodeHistoryIndex > 0) {
        state.nodeHistoryIndex -= 1;
        state.selectedNode = state.nodeHistory[state.nodeHistoryIndex];
      }
    },

    navigateForward: (state) => {
      if (state.nodeHistoryIndex < state.nodeHistory.length - 1) {
        state.nodeHistoryIndex += 1;
        state.selectedNode = state.nodeHistory[state.nodeHistoryIndex];
      }
    },

    clearNodeHistory: (state) => {
      state.selectedNode = null;
      state.nodeHistory = [];
      state.nodeHistoryIndex = -1;
    },

    // Markdown viewer actions
    openMarkdown: (state, action: PayloadAction<string>) => {
      let filePath = action.payload;

      // Normalize path for localhost files
      if (!filePath.startsWith('http')) {
        if (!filePath.startsWith('/')) {
          filePath = `http://localhost:8080/${filePath}`;
        } else {
          filePath = `http://localhost:8080${filePath}`;
        }
      }

      const title = filePath.split('/').pop() || filePath;
      const newItem: MarkdownHistoryItem = { filePath, title };

      // Remove forward history
      const newHistory = state.markdownHistory.slice(0, state.markdownHistoryIndex + 1);
      newHistory.push(newItem);

      state.markdownHistory = newHistory;
      state.markdownHistoryIndex = newHistory.length - 1;
      state.markdownFile = filePath;
    },

    closeMarkdown: (state) => {
      state.markdownFile = null;
    },

    markdownBack: (state) => {
      if (state.markdownHistoryIndex > 0) {
        state.markdownHistoryIndex -= 1;
        state.markdownFile = state.markdownHistory[state.markdownHistoryIndex].filePath;
      }
    },

    markdownForward: (state) => {
      if (state.markdownHistoryIndex < state.markdownHistory.length - 1) {
        state.markdownHistoryIndex += 1;
        state.markdownFile = state.markdownHistory[state.markdownHistoryIndex].filePath;
      }
    },

    clearMarkdownHistory: (state) => {
      state.markdownFile = null;
      state.markdownHistory = [];
      state.markdownHistoryIndex = -1;
    },
  },
});

export const {
  selectNode,
  navigateBack,
  navigateForward,
  clearNodeHistory,
  openMarkdown,
  closeMarkdown,
  markdownBack,
  markdownForward,
  clearMarkdownHistory,
} = navigationSlice.actions;

export default navigationSlice.reducer;
