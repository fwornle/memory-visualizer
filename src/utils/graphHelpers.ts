/**
 * Graph Helper Functions
 *
 * Utilities for filtering and transforming graph data.
 */

import type { Entity, Relation } from '../store/slices/graphSlice';
import type { Node } from '../store/slices/navigationSlice';

export interface Link {
  source: string | Node;
  target: string | Node;
  type: string;
  confidence?: number;
}

/**
 * Filter entities by search term
 * System nodes are ALWAYS visible regardless of search term
 * Project nodes are ONLY visible if referenced by visible insight nodes
 * Insight nodes are filtered by search term
 */
export const filterBySearch = (
  entities: Entity[],
  searchTerm: string,
  relations: Relation[]
): Entity[] => {
  if (!searchTerm) return entities;

  const term = searchTerm.toLowerCase();

  // Step 1: Separate System nodes and filter insight nodes
  const systemNodes = entities.filter(entity => entity.entityType === 'System');

  const filteredInsightNodes = entities.filter(entity => {
    // Skip System and Project nodes
    if (entity.entityType === 'System' || entity.entityType === 'Project') {
      return false;
    }

    // Filter insight nodes by search term
    return (
      entity.name.toLowerCase().includes(term) ||
      entity.entityType.toLowerCase().includes(term) ||
      entity.observations.some(obs => {
        const content = typeof obs === 'string' ? obs : obs?.content;
        return content && typeof content === 'string' && content.toLowerCase().includes(term);
      })
    );
  });

  // Step 2: Find Project nodes referenced by INSIGHT nodes ONLY (not System nodes)
  const insightNodeNames = new Set(filteredInsightNodes.map(e => e.name));
  const referencedProjectNames = new Set<string>();

  relations.forEach(rel => {
    // Check if source is an INSIGHT node and target is a Project
    if (insightNodeNames.has(rel.from)) {
      const targetEntity = entities.find(e => e.name === rel.to || e.id === rel.to);
      if (targetEntity?.entityType === 'Project') {
        referencedProjectNames.add(targetEntity.name);
      }
    }
    // Check if target is an INSIGHT node and source is a Project
    if (insightNodeNames.has(rel.to)) {
      const sourceEntity = entities.find(e => e.name === rel.from || e.id === rel.from);
      if (sourceEntity?.entityType === 'Project') {
        referencedProjectNames.add(sourceEntity.name);
      }
    }
  });

  // Step 3: Add referenced Project nodes
  const referencedProjects = entities.filter(
    e => e.entityType === 'Project' && referencedProjectNames.has(e.name)
  );

  // Return: System nodes (always) + filtered insight nodes + referenced Project nodes
  return [...systemNodes, ...filteredInsightNodes, ...referencedProjects];
};

/**
 * Filter entities by entity type
 */
export const filterByEntityType = (entities: Entity[], entityType: string): Entity[] => {
  if (entityType === 'All') return entities;
  return entities.filter(entity => entity.entityType === entityType);
};

/**
 * Filter entities by teams
 */
export const filterByTeams = (entities: Entity[], selectedTeams: string[]): Entity[] => {
  if (selectedTeams.length === 0) return [];

  return entities.filter(entity => {
    // System entities belong to all teams
    if (entity.entityType === 'System') return true;
    // Check if entity's team is in selected teams
    const entityTeam = entity.metadata?.team;
    return entityTeam && selectedTeams.includes(entityTeam);
  });
};

/**
 * Get relations for a set of entities
 * Handles relations that may use either entity names or full entity IDs
 */
export const getRelationsForEntities = (
  relations: Relation[],
  entities: Entity[],
  relationType: string = 'All'
): Relation[] => {
  // Create sets for both entity names AND IDs for matching
  const entityNames = new Set(entities.map(e => e.name));
  const entityIds = new Set(entities.map(e => e.id));

  // Helper function to check if an entity reference exists
  const entityExists = (ref: string): boolean => {
    return entityNames.has(ref) || entityIds.has(ref);
  };

  // Debug: Log relation structure
  if (relations.length > 0) {
    console.log('🔍 [graphHelpers] Sample relation:', {
      from: relations[0].from,
      to: relations[0].to,
      type: relations[0].type
    });
    console.log('🔍 [graphHelpers] Entity matching:', {
      sampleEntityName: entities[0]?.name,
      sampleEntityId: entities[0]?.id,
      totalEntities: entities.length,
      totalRelations: relations.length
    });
  }

  // Filter relations where BOTH from and to entities exist (by name OR ID)
  let filtered = relations.filter(r => entityExists(r.from) && entityExists(r.to));

  // Debug: Check TestOnlinePattern specifically
  const testOnlineRelations = filtered.filter(r =>
    r.from === 'TestOnlinePattern' || r.to === 'TestOnlinePattern' ||
    r.from.includes('TestOnlinePattern') || r.to.includes('TestOnlinePattern')
  );
  console.log('🔍 [graphHelpers] TestOnlinePattern relations in filtered set:', {
    count: testOnlineRelations.length,
    samples: testOnlineRelations.slice(0, 3).map(r => ({ from: r.from, to: r.to, type: r.type }))
  });

  console.log('🔍 [graphHelpers] Filtered relations:', {
    before: relations.length,
    after: filtered.length,
    filterRatio: `${((filtered.length / relations.length) * 100).toFixed(1)}%`
  });

  if (relationType !== 'All') {
    filtered = filtered.filter(r => (r.relationType || r.type) === relationType);
  }

  return filtered;
};

/**
 * Transform entities and relations to D3 graph format
 * Creates completely isolated mutable copies for D3 force simulation
 */
export const transformToD3Format = (
  entities: Entity[],
  relations: Relation[]
): { nodes: Node[]; links: Link[] } => {
  // Create completely isolated mutable node objects for D3
  // Use Object.create(null) to avoid any prototype chain issues
  const nodes: Node[] = entities.map(entity => {
    // Create plain object with no prototype to ensure mutability
    const plainNode = {
      id: entity.name,
      name: entity.name,
      entityType: entity.entityType,
      observations: entity.observations ? [...entity.observations] : [],
      metadata: entity.metadata ? JSON.parse(JSON.stringify(entity.metadata)) : undefined,
      // Pre-initialize D3 properties as writable
      x: undefined as number | undefined,
      y: undefined as number | undefined,
      vx: undefined as number | undefined,
      vy: undefined as number | undefined,
      fx: null as number | null,
      fy: null as number | null,
      index: undefined as number | undefined,
    };

    // Return as plain object (not frozen, not sealed)
    return plainNode as Node;
  });

  // Create fully mutable link objects
  // D3's forceLink will mutate source/target from strings to node object references
  const links: Link[] = relations.map(relation => {
    const link: any = {
      source: relation.from,
      target: relation.to,
      type: relation.relationType || relation.type || '',
      confidence: relation.confidence,
    };
    return link as Link;
  });

  return { nodes, links };
};

/**
 * Calculate bounds of graph nodes
 */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const calculateGraphBounds = (nodes: Node[]): Bounds | null => {
  if (nodes.length === 0 || !nodes[0].x || !nodes[0].y) return null;

  const xs = nodes.map(n => n.x!).filter(x => x !== undefined);
  const ys = nodes.map(n => n.y!).filter(y => y !== undefined);

  if (xs.length === 0 || ys.length === 0) return null;

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

/**
 * Calculate center transform for autoscaling graph
 */
export const calculateCenterTransform = (
  bounds: Bounds,
  dimensions: { width: number; height: number },
  padding: number = 50
): { x: number; y: number; scale: number } => {
  const graphWidth = bounds.maxX - bounds.minX;
  const graphHeight = bounds.maxY - bounds.minY;

  const scaleX = (dimensions.width - padding * 2) / graphWidth;
  const scaleY = (dimensions.height - padding * 2) / graphHeight;
  const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in more than 1x

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  const translateX = dimensions.width / 2 - centerX * scale;
  const translateY = dimensions.height / 2 - centerY * scale;

  return { x: translateX, y: translateY, scale };
};
