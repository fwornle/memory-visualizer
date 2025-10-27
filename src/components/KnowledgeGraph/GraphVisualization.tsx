/**
 * Graph Visualization Component
 *
 * D3 force-directed graph rendering with color coding.
 * Pure presentation component - receives data from Redux via parent.
 */

import React, { useEffect, useRef, useLayoutEffect } from 'react';
import * as d3 from 'd3';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectNode } from '../../store/slices/navigationSlice';
import { setDimensions } from '../../store/slices/uiSlice';
import type { Node } from '../../store/slices/navigationSlice';
import type { Link } from '../../utils/graphHelpers';
import {
  filterBySearch,
  filterByEntityType,
  filterByTeams,
  getRelationsForEntities,
  transformToD3Format,
} from '../../utils/graphHelpers';

export const GraphVisualization: React.FC = () => {
  const dispatch = useAppDispatch();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

  // Track simulation reference to help debug
  const simulationRef = useRef<any>(null);

  // Add error handler to catch D3 runtime errors
  useEffect(() => {
    let errorCount = 0;
    const MAX_ERRORS_TO_LOG = 3; // Only log first 3 errors to avoid flooding

    const errorHandler = (event: ErrorEvent) => {
      if (event.message && event.message.includes('read only property')) {
        errorCount++;
        if (errorCount <= MAX_ERRORS_TO_LOG) {
          console.error(`🚨 [DEBUG] Readonly property error #${errorCount}:`, {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          });

          // Check current simulation nodes
          if (simulationRef.current) {
            const simNodes = simulationRef.current.nodes();
            if (simNodes && simNodes.length > 0) {
              console.error('🚨 [DEBUG] Simulation node check:', {
                firstNodeFrozen: Object.isFrozen(simNodes[0]),
                firstNodeSealed: Object.isSealed(simNodes[0]),
                firstNodeVx: simNodes[0].vx,
                canSetVx: (() => {
                  try {
                    const testVal = simNodes[0].vx;
                    simNodes[0].vx = testVal;
                    return true;
                  } catch {
                    return false;
                  }
                })()
              });
            }
          }
        } else if (errorCount === MAX_ERRORS_TO_LOG + 1) {
          console.error(`🚨 [DEBUG] Suppressing further error logs (${errorCount}+ total errors)`);
        }
        event.preventDefault(); // Prevent default error handling
      }
    };

    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  // Get state from Redux
  const { entities, relations } = useAppSelector(state => state.graph);
  const { selectedTeams, searchTerm, entityType, relationType } = useAppSelector(
    state => state.filters
  );
  const { dimensions } = useAppSelector(state => state.ui);
  const { selectedNode: currentSelectedNode } = useAppSelector(state => state.navigation);

  // Debug logging for component state
  useEffect(() => {
    console.log(`🔍 [GraphVisualization] Redux state:`, {
      entitiesCount: entities.length,
      relationsCount: relations.length,
      selectedTeams,
      searchTerm,
      entityType,
      relationType,
      dimensions
    });
  }, [entities, relations, selectedTeams, searchTerm, entityType, relationType, dimensions]);

  // Update selection rings when selectedNode changes
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);

    // Hide all selection rings
    svg.selectAll('.selection-ring')
      .attr('opacity', 0);

    // Show ring for currently selected node (if any)
    if (currentSelectedNode) {
      svg.selectAll('.node')
        .filter((d: any) => d.id === currentSelectedNode.id)
        .select('.selection-ring')
        .attr('opacity', 1);
    }
  }, [currentSelectedNode]);

  // Calculate dimensions
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        if (width > 0 && height > 0) {
          dispatch(setDimensions({ width, height }));
        }
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    const timeout1 = setTimeout(updateDimensions, 100);
    const timeout2 = setTimeout(updateDimensions, 500);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    };
  }, [dispatch]);

  // Apply filters and render graph
  useEffect(() => {
    if (!svgRef.current || dimensions.width <= 0 || dimensions.height <= 0) return;

    // CRITICAL: Deep clone entities from Redux to break Immer freeze
    // The filter functions return references to frozen Redux objects
    const unfrozenEntities = entities.map(e => JSON.parse(JSON.stringify(e)));
    const unfrozenRelations = relations.map(r => JSON.parse(JSON.stringify(r)));

    console.log('🔍 [DEBUG] After unfreezing:', {
      originalEntityFrozen: Object.isFrozen(entities[0]),
      unfrozenEntityFrozen: unfrozenEntities.length > 0 ? Object.isFrozen(unfrozenEntities[0]) : 'N/A',
    });

    // Apply all filters on unfrozen copies
    let filteredEntities = filterByTeams(unfrozenEntities, selectedTeams);
    filteredEntities = filterBySearch(filteredEntities, searchTerm, unfrozenRelations);
    filteredEntities = filterByEntityType(filteredEntities, entityType);

    const filteredRelations = getRelationsForEntities(unfrozenRelations, filteredEntities, relationType);

    // If relation type filter is active (not "All"), remove entities with no connections
    if (relationType !== 'All' && filteredRelations.length > 0) {
      const connectedEntityNames = new Set<string>();
      filteredRelations.forEach(rel => {
        connectedEntityNames.add(rel.from);
        connectedEntityNames.add(rel.to);
      });

      filteredEntities = filteredEntities.filter(e =>
        connectedEntityNames.has(e.name) || connectedEntityNames.has(e.id)
      );

      console.log('🔍 [DEBUG] After removing unconnected nodes:', {
        remainingEntities: filteredEntities.length,
        connectedNames: connectedEntityNames.size
      });
    }

    // Transform to D3 format - this already creates mutable copies
    const { nodes, links } = transformToD3Format(filteredEntities, filteredRelations);

    // Debug: Check mutability of transformed nodes AND the arrays themselves
    console.log('🔍 [DEBUG] Arrays mutability:', {
      nodesArrayFrozen: Object.isFrozen(nodes),
      linksArrayFrozen: Object.isFrozen(links),
      nodesCount: nodes.length,
      linksCount: links.length
    });

    if (nodes.length > 0) {
      const firstNode = nodes[0];
      console.log('🔍 [DEBUG] First node from transformToD3Format:', {
        isFrozen: Object.isFrozen(firstNode),
        isSealed: Object.isSealed(firstNode),
        isExtensible: Object.isExtensible(firstNode),
        descriptor_vx: Object.getOwnPropertyDescriptor(firstNode, 'vx'),
        keys: Object.keys(firstNode),
        hasVxProperty: 'vx' in firstNode,
        vxValue: firstNode.vx
      });

      // Try to set D3 properties
      try {
        firstNode.vx = 0.123;
        firstNode.vy = 0.456;
        firstNode.x = 100;
        firstNode.y = 200;
        console.log('✅ [DEBUG] Successfully set D3 properties directly on node');
        console.log('🔍 [DEBUG] After setting, vx =', firstNode.vx, 'vy =', firstNode.vy);
      } catch (e) {
        console.error('❌ [DEBUG] Failed to set D3 properties:', e);
        console.error('❌ [DEBUG] Error details:', {
          name: (e as Error).name,
          message: (e as Error).message,
          stack: (e as Error).stack
        });
      }
    }

    // Render the graph
    renderGraph(nodes, links);
  }, [entities, relations, selectedTeams, searchTerm, entityType, relationType, dimensions]);

  const renderGraph = (nodes: Node[], links: Link[]) => {
    if (!svgRef.current) return;

    const width = dimensions.width;
    const height = dimensions.height;

    // Clear existing content
    const svgElement = svgRef.current;
    d3.select(svgElement).selectAll('*').remove();

    // Handle empty state
    if (nodes.length === 0) {
      svgElement.setAttribute('width', `${width}px`);
      svgElement.setAttribute('height', `${height}px`);
      return;
    }

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // Add zoom
    const g = svg.append('g');
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        transformRef.current = event.transform;
      });
    zoomBehaviorRef.current = zoomBehavior;
    svg.call(zoomBehavior as any);

    // Arrow markers
    svg
      .append('defs')
      .selectAll('marker')
      .data(['end'])
      .enter()
      .append('marker')
      .attr('id', (d) => d)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#999')
      .attr('d', 'M0,-5L10,0L0,5');

    // Create completely isolated D3-owned node objects
    // D3 will mutate these directly, so they must be plain JS objects with no freeze
    console.log('🔍 [DEBUG] Creating D3 simulation with', nodes.length, 'nodes');

    const d3Nodes = nodes.map(node => {
      // Create plain object using Object.create(null) for no prototype pollution
      const d3Node: any = {};
      // Copy all properties explicitly
      d3Node.id = node.id;
      d3Node.name = node.name;
      d3Node.entityType = node.entityType;
      d3Node.observations = node.observations;
      d3Node.metadata = node.metadata;
      // Pre-initialize D3 properties
      d3Node.x = undefined;
      d3Node.y = undefined;
      d3Node.vx = undefined;
      d3Node.vy = undefined;
      d3Node.fx = null;
      d3Node.fy = null;
      return d3Node;
    });

    const d3Links = links.map(link => {
      const d3Link: any = {};
      d3Link.source = link.source;
      d3Link.target = link.target;
      d3Link.type = link.type;
      d3Link.confidence = link.confidence;
      return d3Link;
    });

    console.log('🔍 [DEBUG] D3 nodes created:', {
      firstNodeFrozen: Object.isFrozen(d3Nodes[0]),
      firstNodeSealed: Object.isSealed(d3Nodes[0]),
      canSetVx: (() => {
        try {
          d3Nodes[0].vx = 123;
          return true;
        } catch {
          return false;
        }
      })()
    });

    let simulation;
    try {
      // Create simulation with completely isolated D3-owned objects
      simulation = d3
        .forceSimulation(d3Nodes)
        .force(
          'link',
          d3
            .forceLink(d3Links)
            .id((d: any) => d.id)
            .distance(150)
        )
        .force('charge', d3.forceManyBody().strength(-500))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('x', d3.forceX())
        .force('y', d3.forceY());

      // Store simulation reference for debugging
      simulationRef.current = simulation;
      console.log('✅ [DEBUG] D3 simulation created successfully');

      // CRITICAL DEBUG: Check if simulation is using our d3Nodes or something else
      const simNodes = simulation.nodes();
      console.log('🔍 [DEBUG] Simulation nodes identity check:', {
        d3NodesLength: d3Nodes.length,
        simNodesLength: simNodes.length,
        areSameReference: simNodes === d3Nodes,
        areSameFirstNode: simNodes[0] === d3Nodes[0],
        simFirstNodeFrozen: Object.isFrozen(simNodes[0]),
        d3FirstNodeFrozen: Object.isFrozen(d3Nodes[0]),
        simFirstNodeId: simNodes[0]?.id,
        d3FirstNodeId: d3Nodes[0]?.id
      });
    } catch (e) {
      console.error('❌ [DEBUG] Failed to create D3 simulation:', e);
      console.error('❌ [DEBUG] Error details:', {
        name: (e as Error).name,
        message: (e as Error).message,
        stack: (e as Error).stack
      });
      return; // Exit early if simulation creation fails
    }

    // Create links using D3-owned link objects
    const link = g
      .append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .selectAll('path')
      .data(d3Links)
      .join('path')
      .attr('marker-end', 'url(#end)')
      .attr('fill', 'none');

    // Link labels
    const linkText = g
      .append('g')
      .selectAll('text')
      .data(d3Links)
      .join('text')
      .text((d) => d.type)
      .attr('font-size', 10)
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .attr('fill', '#666');

    // Create nodes using D3-owned node objects
    const node = g
      .append('g')
      .selectAll('.node')
      .data(d3Nodes)
      .join('g')
      .attr('class', 'node')
      .call(drag(simulation) as any)
      .on('click', (event, d) => {
        // CRITICAL: Don't pass D3 node object to Redux - it will freeze it!
        // Instead, create a plain copy with only the data Redux needs
        const nodeForRedux: Node = {
          id: d.id,
          name: d.name,
          entityType: d.entityType,
          observations: d.observations,
          metadata: d.metadata,
          // Don't include D3 properties (x, y, vx, vy, fx, fy)
        };
        dispatch(selectNode(nodeForRedux));
        event.stopPropagation();
      });

    // Selection ring
    node
      .append('circle')
      .attr('class', 'selection-ring')
      .attr('r', 16)
      .attr('fill', 'none')
      .attr('stroke', '#ff6b6b')
      .attr('stroke-width', 3)
      .attr('opacity', (d) => (currentSelectedNode?.id === d.id ? 1 : 0));

    // Node circles with color coding
    node
      .append('circle')
      .attr('class', 'node-circle')
      .attr('r', 10)
      .attr('fill', (d) => {
        // System and Project entities have fixed colors
        if (d.entityType === 'System') return '#3cb371'; // Medium sea green
        if (d.entityType === 'Project') return '#4682b4'; // Steel blue

        // Pattern/knowledge nodes: batch=light blue, online=light red
        const source = d.metadata?.source;
        if (source === 'online') return '#FFB6C1'; // Light red
        if (source === 'batch') return '#ADD8E6'; // Light blue

        // Default
        return '#69b3a2';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Node labels
    node
      .append('text')
      .text((d) => d.name)
      .attr('x', 15)
      .attr('y', 5)
      .attr('font-size', 12)
      .attr('fill', '#333');

    // Tooltips
    node.append('title').text((d) => `${d.name} (${d.entityType})`);

    // Update positions on tick
    simulation.on('tick', () => {
      link.attr('d', (d: any) => {
        const sourceX = d.source.x;
        const sourceY = d.source.y;
        const targetX = d.target.x;
        const targetY = d.target.y;

        if (!sourceX || !sourceY || !targetX || !targetY) return '';

        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const dr = Math.sqrt(dx * dx + dy * dy);

        return `M${sourceX},${sourceY}A${dr},${dr} 0 0,1 ${targetX},${targetY}`;
      });

      linkText.attr('x', (d: any) => ((d.source.x || 0) + (d.target.x || 0)) / 2);
      linkText.attr('y', (d: any) => ((d.source.y || 0) + (d.target.y || 0)) / 2);

      node.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);
    });

    // Drag handlers
    function drag(simulation: any) {
      function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-50">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};
