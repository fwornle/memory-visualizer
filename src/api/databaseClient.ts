/**
 * Database Client
 *
 * Client for fetching knowledge from the database via VKB server API.
 * Transforms database results into D3-compatible graph format.
 */

export interface Entity {
  id: string;
  entity_name: string;
  entity_type: string;
  observations: string[];
  classification: string;
  confidence: number;
  source: 'manual' | 'auto';
  team: string;
  extracted_at: string;
  last_modified: string;
  metadata?: any;
}

export interface Relation {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  relation_type: string;
  confidence: number;
  team: string;
  from_name?: string;
  to_name?: string;
  metadata?: any;
}

export interface QueryOptions {
  team?: string;
  source?: 'manual' | 'auto';
  types?: string[];
  limit?: number;
  offset?: number;
  searchTerm?: string;
}

export interface GraphData {
  entities: any[];
  relations: any[];
}

export class DatabaseClient {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Query entities from database
   */
  async queryEntities(options: QueryOptions = {}): Promise<Entity[]> {
    const params = new URLSearchParams();

    if (options.team) params.append('team', options.team);
    if (options.source) params.append('source', options.source);
    if (options.types) params.append('types', options.types.join(','));
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    if (options.searchTerm) params.append('searchTerm', options.searchTerm);

    const response = await fetch(`${this.baseUrl}/api/entities?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch entities: ${response.statusText}`);
    }

    const data = await response.json();
    return data.entities || [];
  }

  /**
   * Query relations from database
   */
  async queryRelations(options: { entityId?: string; team?: string } = {}): Promise<Relation[]> {
    const params = new URLSearchParams();

    if (options.entityId) params.append('entityId', options.entityId);
    if (options.team) params.append('team', options.team);

    const response = await fetch(`${this.baseUrl}/api/relations?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch relations: ${response.statusText}`);
    }

    const data = await response.json();
    return data.relations || [];
  }

  /**
   * Get available teams
   */
  async getTeams(): Promise<Array<{ name: string; displayName: string; entityCount: number }>> {
    const response = await fetch(`${this.baseUrl}/api/teams`);

    if (!response.ok) {
      throw new Error(`Failed to fetch teams: ${response.statusText}`);
    }

    const data = await response.json();
    return data.available || [];
  }

  /**
   * Get statistics
   */
  async getStatistics(team?: string): Promise<any> {
    const params = team ? `?team=${team}` : '';
    const response = await fetch(`${this.baseUrl}/api/stats${params}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch statistics: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Check database health
   */
  async checkHealth(): Promise<{ status: string; sqlite: boolean; qdrant: boolean; graph: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/health`);

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Transform database entities and relations to D3 graph format
   */
  transformToGraphData(entities: Entity[], relations: Relation[]): GraphData {
    // Transform entities to D3 nodes
    const nodes = entities.map(entity => ({
      id: entity.id,
      name: entity.entity_name,
      entityType: entity.entity_type,
      observations: entity.observations,
      source: entity.source,
      team: entity.team,
      confidence: entity.confidence,
      lastModified: entity.last_modified,
      metadata: entity.metadata
    }));

    // Transform relations to D3 links
    // Use from_name/to_name instead of IDs so they match entity names
    const links = relations.map((relation, index) => {
      // Debug first relation
      if (index === 0) {
        console.log('🔍 [DatabaseClient] First relation structure:', {
          has_from_name: !!relation.from_name,
          has_to_name: !!relation.to_name,
          from_name: relation.from_name,
          to_name: relation.to_name,
          from_entity_id: relation.from_entity_id,
          to_entity_id: relation.to_entity_id,
          relation_type: relation.relation_type
        });
      }

      return {
        source: relation.from_name || relation.from_entity_id,
        target: relation.to_name || relation.to_entity_id,
        type: relation.relation_type,
        confidence: relation.confidence,
        metadata: relation.metadata
      };
    });

    return { entities: nodes, relations: links };
  }

  /**
   * Load complete knowledge graph for a team or multiple teams
   */
  async loadKnowledgeGraph(team?: string | string[], source?: 'manual' | 'auto'): Promise<GraphData> {
    console.log(`🔍 [DatabaseClient] loadKnowledgeGraph called with:`, { team, source, isArray: Array.isArray(team) });
    try {
      // Handle multiple teams
      if (Array.isArray(team)) {
        console.log(`🔍 [DatabaseClient] Processing multiple teams:`, team);
        // Query each team separately and merge results
        const teamResults = await Promise.all(
          team.map(t => Promise.all([
            this.queryEntities({ team: t, source, limit: 5000 }),
            this.queryRelations({ team: t })
          ]))
        );
        console.log(`🔍 [DatabaseClient] Team results:`, teamResults.map(([e, r]) => ({
          entities: e.length,
          relations: r.length
        })));

        // Merge all entities and relations with deduplication
        const entitiesMap = new Map<string, Entity>();

        // Flatten and deduplicate entities by entity_name
        teamResults.forEach(([entities, _]) => {
          entities.forEach(entity => {
            const existingEntity = entitiesMap.get(entity.entity_name);

            if (existingEntity) {
              // Merge observations from duplicate entities
              const mergedObservations = Array.from(new Set([
                ...existingEntity.observations,
                ...entity.observations
              ]));

              // Track all teams this entity belongs to
              const existingTeams = existingEntity.metadata?.teams || [existingEntity.team];
              const allTeams = Array.from(new Set([...existingTeams, entity.team]));

              existingEntity.observations = mergedObservations;
              existingEntity.metadata = {
                ...existingEntity.metadata,
                teams: allTeams
              };
            } else {
              // First occurrence of this entity
              entitiesMap.set(entity.entity_name, {
                ...entity,
                metadata: {
                  ...entity.metadata,
                  teams: [entity.team]
                }
              });
            }
          });
        });

        const allEntities = Array.from(entitiesMap.values());
        const allRelations = teamResults.flatMap(([_, relations]) => relations);

        console.log(`🔍 [DatabaseClient] Merged: ${allEntities.length} entities, ${allRelations.length} relations`);
        const result = this.transformToGraphData(allEntities, allRelations);
        console.log(`🔍 [DatabaseClient] Transformed result:`, {
          entitiesCount: result.entities.length,
          relationsCount: result.relations.length
        });
        return result;
      }

      // Single team or all teams (undefined)
      console.log(`🔍 [DatabaseClient] Processing single team or all teams`);
      const [entities, relations] = await Promise.all([
        this.queryEntities({ team, source, limit: 5000 }),
        this.queryRelations({ team })
      ]);

      console.log(`🔍 [DatabaseClient] Single team results: ${entities.length} entities, ${relations.length} relations`);
      return this.transformToGraphData(entities, relations);
    } catch (error) {
      console.error('Failed to load knowledge graph:', error);
      throw error;
    }
  }
}

export default DatabaseClient;
