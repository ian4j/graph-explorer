import { NextRequest, NextResponse } from 'next/server';
import neo4j from 'neo4j-driver';

export async function POST(request: NextRequest) {
  try {
    const { uri, username, password } = await request.json();

    if (!uri || !username || !password) {
      return NextResponse.json(
        { error: 'Missing required connection parameters' },
        { status: 400 }
      );
    }

    // Test connection
    const driver = neo4j.driver(
      uri,
      neo4j.auth.basic(username, password)
    );

    await driver.verifyConnectivity();
    await driver.close();

    return NextResponse.json({ status: 'connected' });
  } catch (error: any) {
    console.error('Neo4j connection error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to connect to Neo4j' },
      { status: 500 }
    );
  }
}