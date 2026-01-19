import { NextRequest, NextResponse } from 'next/server';
import neo4j from 'neo4j-driver';

export async function POST(request: NextRequest) {
  let driver;
  let session;

  try {
    const { query, params = {}, uri, username, password } = await request.json();

    if (!uri || !username || !password) {
      return NextResponse.json(
        { error: 'Missing database connection parameters' },
        { status: 400 }
      );
    }

    // Create driver with provided credentials
    driver = neo4j.driver(
      uri,
      neo4j.auth.basic(username, password)
    );

    session = driver.session();

    // Basic validation - only allow READ queries
    const normalizedQuery = query.trim().toUpperCase();
    if (
      normalizedQuery.includes('DELETE') ||
      normalizedQuery.includes('DETACH') ||
      normalizedQuery.includes('CREATE') ||
      normalizedQuery.includes('MERGE') ||
      normalizedQuery.includes('SET') ||
      normalizedQuery.includes('REMOVE')
    ) {
      return NextResponse.json(
        { error: 'Only READ queries are allowed' },
        { status: 403 }
      );
    }

    // Execute query
    const result = await session.run(query, params);

    // Transform Neo4j results to our graph format
    const nodes: any[] = [];
    const relationships: any[] = [];
    const nodeIds = new Set();

    result.records.forEach((record) => {
      record.forEach((value) => {
        // Handle nodes
        if (value && value.labels) {
          const nodeId = value.identity.toString();
          if (!nodeIds.has(nodeId)) {
            nodeIds.add(nodeId);
            nodes.push({
              id: nodeId,
              label: value.labels[0] || 'Unknown',
              labels: value.labels,
              properties: value.properties,
              flagged: value.labels.includes('Flagged'),
              suspicious: value.properties.suspicious || false,
              highRisk: value.labels.includes('HighRiskJurisdiction'),
            });
          }
        }

        // Handle relationships
        if (value && value.type) {
          relationships.push({
            source: value.start.toString(),
            target: value.end.toString(),
            type: value.type,
            properties: value.properties || {},
          });
        }

        // Handle paths
        if (value && value.segments) {
          value.segments.forEach((segment: any) => {
            const startId = segment.start.identity.toString();
            if (!nodeIds.has(startId)) {
              nodeIds.add(startId);
              nodes.push({
                id: startId,
                label: segment.start.labels[0] || 'Unknown',
                labels: segment.start.labels,
                properties: segment.start.properties,
                flagged: segment.start.labels.includes('Flagged'),
                suspicious: segment.start.properties.suspicious || false,
                highRisk: segment.start.labels.includes('HighRiskJurisdiction'),
              });
            }

            const endId = segment.end.identity.toString();
            if (!nodeIds.has(endId)) {
              nodeIds.add(endId);
              nodes.push({
                id: endId,
                label: segment.end.labels[0] || 'Unknown',
                labels: segment.end.labels,
                properties: segment.end.properties,
                flagged: segment.end.labels.includes('Flagged'),
                suspicious: segment.end.properties.suspicious || false,
                highRisk: segment.end.labels.includes('HighRiskJurisdiction'),
              });
            }

            relationships.push({
              source: startId,
              target: endId,
              type: segment.relationship.type,
              properties: segment.relationship.properties || {},
            });
          });
        }
      });
    });

    return NextResponse.json({
      nodes,
      relationships,
      summary: {
        nodesCount: nodes.length,
        relationshipsCount: relationships.length,
      },
    });
  } catch (error: any) {
    console.error('Neo4j query error:', error);
    return NextResponse.json(
      { error: error.message || 'Query execution failed' },
      { status: 500 }
    );
  } finally {
    if (session) await session.close();
    if (driver) await driver.close();
  }
}