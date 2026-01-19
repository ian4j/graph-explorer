import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Play, ZoomIn, ZoomOut, Maximize2, Sparkles, X, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

const labelColors: Record<string, string> = {
  Customer: '#DA7194',
  Account: '#6DCE9E',
  Transaction: '#F79767',
  Country: '#8DCC93',
  Counterparty: '#C990C0',
  Email: '#4C8EDA',
  Phone: '#57C7E3',
  IP: '#FCC940',
  Device: '#F16667',
  Case: '#D9C8AE',
  Alert: '#ECB5C9',
  Intermediary: '#C990C0',
  Entity: '#4C8EDA',
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface GraphData {
  nodes: any[];
  relationships: any[];
}

const GraphVisualization: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomBehaviorRef = useRef<any>(null);
  const currentZoomRef = useRef(1);
  
  const [dbUrl, setDbUrl] = useState('neo4j+s://469709dd.databases.neo4j.io');
  const [dbUser, setDbUser] = useState('graphapp');
  const [dbPassword, setDbPassword] = useState('graphapp1234');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const [query, setQuery] = useState('MATCH path=(i:Intermediary)-[r:intermediary_of]-(e:Entity)\nRETURN path\nLIMIT 50');
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], relationships: [] });
  const [isQueryRunning, setIsQueryRunning] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isPropertiesExpanded, setIsPropertiesExpanded] = useState(false);
  
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const connectToDatabase = async () => {
    if (!dbUrl || !dbUser || !dbPassword) {
      setConnectionError('Please fill in all connection fields');
      return;
    }

    setConnectionError(null);

    try {
      const response = await fetch('/api/neo4j/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: dbUrl, username: dbUser, password: dbPassword }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Connection failed');

      setIsConnected(true);
    } catch (error: any) {
      setConnectionError(error.message);
      setIsConnected(false);
    }
  };

  const executeQuery = async () => {
    if (!isConnected) {
      setQueryError('Please connect to database first');
      return;
    }

    setIsQueryRunning(true);
    setQueryError(null);

    try {
      const response = await fetch('/api/neo4j/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, uri: dbUrl, username: dbUser, password: dbPassword }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Query failed');

      if (data.nodes.length === 0) {
        setQueryError('Query returned no results');
        setGraphData({ nodes: [], relationships: [] });
      } else {
        setGraphData(data);
      }
    } catch (error: any) {
      setQueryError(error.message);
      setGraphData({ nodes: [], relationships: [] });
    } finally {
      setIsQueryRunning(false);
    }
  };

  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current);
    const g = svg.append('g');
    
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        currentZoomRef.current = event.transform.k;
        updateNodeLabels(event.transform.k);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    const simulation = d3.forceSimulation(graphData.nodes as any)
      .force('link', d3.forceLink(graphData.relationships).id((d: any) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50))
      .alphaDecay(0.02)
      .velocityDecay(0.4);

    svg.append('defs').selectAll('marker')
      .data(['arrow']).enter().append('marker')
      .attr('id', 'arrow').attr('viewBox', '0 -5 10 10')
      .attr('refX', 30).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#A5ABB6');

    const link = g.append('g').selectAll('line')
      .data(graphData.relationships).enter().append('line')
      .attr('stroke', '#A5ABB6').attr('stroke-width', 1).attr('marker-end', 'url(#arrow)')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNodeId(null);
        setSelectedEntity({ type: 'relationship', data: d, entityType: 'Relationship' });
        setChatMessages([]);
        setIsPropertiesExpanded(false);
      });

    const linkLabel = g.append('g').selectAll('text')
      .data(graphData.relationships).enter().append('text')
      .attr('class', 'link-label')
      .attr('font-size', '8px')
      .attr('fill', '#6b7280')
      .attr('font-weight', '500')
      .attr('text-anchor', 'middle')
      .attr('font-family', '"Helvetica Neue", Arial, sans-serif')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 3)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .text((d: any) => d.type)
      .each(function(d: any) {
        // Calculate rotation angle to align with edge
        const dx = (d.target.x || 0) - (d.source.x || 0);
        const dy = (d.target.y || 0) - (d.source.y || 0);
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // Keep text upright (don't let it be upside down)
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        
        d3.select(this).attr('data-angle', angle);
      });

    const node = g.append('g').selectAll('g')
      .data(graphData.nodes).enter().append('g')
      .call(d3.drag<any, any>()
        .on('start', (event) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on('drag', (event) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        })
        .on('end', (event) => {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        }));

    node.append('circle')
      .attr('r', 30)
      .attr('fill', (d: any) => labelColors[d.label] || '#A5ABB6')
      .attr('stroke', (d: any) => d3.rgb(labelColors[d.label] || '#A5ABB6').darker(0.8).toString())
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNodeId(d.id);
        setSelectedEntity({ type: 'node', data: d, entityType: d.label });
        setChatMessages([]);
        setIsPropertiesExpanded(false);
      });

    node.filter((d: any) => d.flagged || d.suspicious || d.highRisk)
      .append('circle').attr('r', 36).attr('fill', 'none')
      .attr('stroke', '#F36924').attr('stroke-width', 3)
      .attr('stroke-dasharray', '5,3').style('pointer-events', 'none');

    node.append('circle').attr('r', 35).attr('fill', 'none')
      .attr('stroke', '#018BFF').attr('stroke-width', 3)
      .style('opacity', (d: any) => d.id === selectedNodeId ? 1 : 0)
      .style('pointer-events', 'none');

    node.append('text')
      .attr('class', 'node-label-text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('font-weight', '500')
      .attr('fill', '#FFFFFF')
      .attr('pointer-events', 'none')
      .attr('font-family', '"Helvetica Neue", Helvetica, Arial, sans-serif')
      .each(function(d: any) {
        const text = d3.select(this);
        const props = d.properties;
        const fullName = props.name || props.firstName || String(d.id);
        
        let fontSize = 10;
        text.attr('font-size', `${fontSize}px`).text(fullName);
        let bbox = (this as SVGTextElement).getBBox();
        
        // Shrink font until it fits (min 7px)
        while (bbox.width > 54 && fontSize > 7) {
          fontSize -= 0.5;
          text.attr('font-size', `${fontSize}px`);
          bbox = (this as SVGTextElement).getBBox();
        }
        
        // If still doesn't fit, truncate
        if (bbox.width > 54) {
          let truncated = fullName;
          while (bbox.width > 54 && truncated.length > 3) {
            const halfLen = Math.floor(truncated.length / 2);
            truncated = truncated.substring(0, halfLen - 1) + '…' + truncated.substring(truncated.length - halfLen + 1);
            text.text(truncated);
            bbox = (this as SVGTextElement).getBBox();
          }
        }
      });

    // Function to update label visibility based on zoom
    const updateNodeLabels = (zoomLevel: number) => {
      node.selectAll('.node-label-text').style('opacity', () => {
        if (zoomLevel < 0.8) return 0; // Hidden when zoomed out
        if (zoomLevel < 1.2) return (zoomLevel - 0.8) / 0.4; // Fade in
        return 1; // Fully visible when zoomed in
      });
    };

    // Initial label setup
    updateNodeLabels(1.0);

    simulation.on('tick', () => {
      link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
      linkLabel.attr('x', (d: any) => (d.source.x + d.target.x) / 2)
               .attr('y', (d: any) => (d.source.y + d.target.y) / 2);
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

  }, [graphData]);

  const streamResponse = (fullResponse: string) => {
    let currentIndex = 0;
    const streamInterval = setInterval(() => {
      if (currentIndex < fullResponse.length) {
        const chunkSize = Math.floor(Math.random() * 3) + 2;
        const chunk = fullResponse.slice(currentIndex, currentIndex + chunkSize);
        currentIndex += chunkSize;
        setChatMessages(prev => {
          const newMessages = [...prev];
          if (newMessages[newMessages.length - 1].role === 'assistant') {
            newMessages[newMessages.length - 1].content += chunk;
          }
          return newMessages;
        });
      } else {
        clearInterval(streamInterval);
        setChatMessages(prev => {
          const newMessages = [...prev];
          if (newMessages[newMessages.length - 1].role === 'assistant') {
            newMessages[newMessages.length - 1].isStreaming = false;
          }
          return newMessages;
        });
        setIsLoading(false);
      }
    }, 30);
  };

  const handleQuickAction = (action: string) => {
    setChatMessages(prev => [...prev, { role: 'user', content: action }]);
    setChatMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
    setIsLoading(true);

    setTimeout(() => {
      let response = '';
      const entity = selectedEntity?.data;

      switch (action) {
        case 'Risk assessment':
          response = entity?.flagged || entity?.suspicious || entity?.highRisk
            ? 'Risk Level: HIGH ⚠️\n\nThis entity shows multiple red flags including unusual transaction velocity (340% above baseline), transfers to high-risk jurisdictions, and inadequate documentation. Enhanced due diligence is required immediately.'
            : 'Risk Level: LOW ✓\n\nThis entity shows normal transaction patterns with no significant risk indicators. Standard monitoring protocols are sufficient at this time.';
          break;
        case 'Show transactions':
          response = 'Recent Transactions (Last 30 days):\n\n£15,000 - Jan 15 - SWIFT to ACC004\n£8,000 - Jan 12 - SWIFT to ACC004\n£5,000 - Jan 10 - Faster Payment to ACC002\n£12,500 - Jan 8 - SWIFT to ACC004\n\nTotal: £40,500 across 4 transactions';
          break;
        case 'Find similar nodes':
          response = 'This feature is under development. It will use graph algorithms to identify entities with similar transaction patterns, network connections, and risk profiles.';
          break;
        case 'Generate SARs report':
          response = `SUSPICIOUS ACTIVITY REPORT\n\nReport ID: SAR-2024-${String(Math.floor(Math.random() * 10000)).padStart(6, '0')}\nDate Filed: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\n\nSubject: ${entity?.properties?.name || entity?.id}\nAccount: ${entity?.properties?.accountNumber || entity?.id}\nTotal Amount: £61,700 GBP\n\nNARRATIVE:\nMultiple high-value SWIFT transfers totaling £61,700 were executed to accounts in high-risk jurisdictions over a 15-day period. Transaction velocity increased 340% above the account baseline. When contacted, the customer was unable to provide supporting commercial documentation.\n\nACTIONS TAKEN:\nEnhanced monitoring protocols now active. Regulatory notification is pending review.\n\n[Download as PDF]`;
          break;
        default:
          response = 'I can help with that. What would you like to know?';
      }

      streamResponse(response);
    }, 500);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedEntity) return;
    const userMessage = inputMessage.trim();
    setInputMessage('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
    setIsLoading(true);

    setTimeout(() => {
      streamResponse('I\'m analyzing this ' + selectedEntity.entityType + '. You can ask me about risk assessment, connected entities, transaction patterns, or compliance concerns.');
    }, 500);
  };

  const handleZoomIn = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 1.3);
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 0.7);
    }
  };

  const handleFit = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const nodeTypeCounts = graphData.nodes.reduce((acc: Record<string, number>, node) => {
    acc[node.label] = (acc[node.label] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex h-screen bg-white text-gray-900 overflow-hidden">
      <aside className="w-72 bg-white border-r border-gray-200 overflow-auto flex-shrink-0">
        <div className="p-4 border-b border-gray-200">
          <div className="mb-4">
            <img src="/neo4j-logo.svg" alt="Neo4j" className="h-8" />
          </div>

          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Database Connection</h3>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isConnected ? '#10b981' : '#9ca3af' }} />
            </div>
            <input type="text" value={dbUrl} onChange={(e) => setDbUrl(e.target.value)} placeholder="neo4j+s://xxxxx.databases.neo4j.io"
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500" disabled={isConnected} />
            <input type="text" value={dbUser} onChange={(e) => setDbUser(e.target.value)} placeholder="Username"
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500" disabled={isConnected} />
            <input type="password" value={dbPassword} onChange={(e) => setDbPassword(e.target.value)} placeholder="Password"
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500" disabled={isConnected} />
            <button onClick={isConnected ? () => { setIsConnected(false); setGraphData({ nodes: [], relationships: [] }); } : connectToDatabase}
              className={`w-full px-3 py-1.5 rounded text-xs font-medium ${isConnected ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
              {isConnected ? 'Disconnect' : 'Connect'}
            </button>
            {connectionError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{connectionError}</div>}
          </div>

          <div className="space-y-2 text-sm">
            <div className="bg-gray-50 rounded p-3 border border-gray-200">
              <div className="text-gray-600 text-xs uppercase tracking-wider mb-1">Nodes</div>
              <div className="text-2xl font-semibold text-gray-900">{graphData.nodes.length}</div>
            </div>
            <div className="bg-gray-50 rounded p-3 border border-gray-200">
              <div className="text-gray-600 text-xs uppercase tracking-wider mb-1">Relationships</div>
              <div className="text-2xl font-semibold text-gray-900">{graphData.relationships.length}</div>
            </div>
          </div>
        </div>

        {graphData.nodes.length > 0 && (
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">Node Labels</h3>
            <div className="space-y-2">
              {Object.entries(nodeTypeCounts).map(([label, count]) => (
                <div key={label} className="flex items-center gap-3 py-1">
                  <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: labelColors[label] || '#A5ABB6' }} />
                  <span className="text-sm text-gray-700 flex-1">{label}</span>
                  <span className="text-xs text-gray-500 font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col bg-white overflow-hidden min-w-0">
        <div className="border-b border-gray-200 p-4 bg-white flex-shrink-0">
          <div className="flex gap-2 items-stretch">
            <textarea value={query} onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-gray-50 border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500"
              style={{ fontFamily: '"Fira Code", Monaco, monospace' }} rows={3} placeholder="Enter Cypher query..." />
            <button onClick={executeQuery} disabled={isQueryRunning}
              className="px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded flex items-center gap-2 text-sm font-medium shadow-sm">
              {isQueryRunning ? <><Loader2 className="w-4 h-4 animate-spin" />Running</> : <><Play className="w-4 h-4" />Run</>}
            </button>
          </div>
          {queryError && <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{queryError}</div>}
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0 max-h-full">
          <div className="flex-1 relative overflow-hidden bg-white min-w-0" ref={containerRef}>
            {graphData.nodes.length === 0 && !isQueryRunning && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <circle cx="12" cy="12" r="3" strokeWidth="2"/><circle cx="12" cy="4" r="2" strokeWidth="2"/>
                    <circle cx="12" cy="20" r="2" strokeWidth="2"/><circle cx="4" cy="12" r="2" strokeWidth="2"/>
                    <circle cx="20" cy="12" r="2" strokeWidth="2"/>
                    <line x1="12" y1="9" x2="12" y2="6" strokeWidth="2"/><line x1="12" y1="15" x2="12" y2="18" strokeWidth="2"/>
                    <line x1="9" y1="12" x2="6" y2="12" strokeWidth="2"/><line x1="15" y1="12" x2="18" y2="12" strokeWidth="2"/>
                  </svg>
                  <p className="text-lg font-medium">Connect to database and run a query</p>
                </div>
              </div>
            )}
            <svg ref={svgRef} className="w-full h-full block" />
            
            {graphData.nodes.length > 0 && (
              <div className="absolute bottom-4 left-4 flex gap-2">
                <button onClick={handleZoomIn} className="p-2 bg-white border border-gray-300 hover:bg-gray-50 rounded shadow-sm" title="Zoom In">
                  <ZoomIn className="w-4 h-4 text-gray-700" />
                </button>
                <button onClick={handleZoomOut} className="p-2 bg-white border border-gray-300 hover:bg-gray-50 rounded shadow-sm" title="Zoom Out">
                  <ZoomOut className="w-4 h-4 text-gray-700" />
                </button>
                <button onClick={handleFit} className="p-2 bg-white border border-gray-300 hover:bg-gray-50 rounded shadow-sm" title="Fit">
                  <Maximize2 className="w-4 h-4 text-gray-700" />
                </button>
              </div>
            )}
          </div>

          <div className={`bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300 ${selectedEntity ? 'w-96' : 'w-0 border-0'}`}>
            {selectedEntity && (
              <>
                <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">AI Copilot</h3>
                  </div>
                  <button onClick={() => { setSelectedNodeId(null); setSelectedEntity(null); setChatMessages([]); setIsPropertiesExpanded(false); }}
                    className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0 max-h-[300px] overflow-y-auto">
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Selected Entity</div>
                  <div className="font-semibold text-sm text-gray-900 mb-2">
                    {selectedEntity.type === 'node' && selectedEntity.data.properties?.name ? selectedEntity.data.properties.name : selectedEntity.entityType}
                  </div>
                  {(selectedEntity.data.flagged || selectedEntity.data.suspicious) && (
                    <div className="mb-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1 inline-flex items-center gap-1">
                      ⚠️ FLAGGED FOR REVIEW
                    </div>
                  )}
                  {selectedEntity.type === 'node' && selectedEntity.data.properties && Object.keys(selectedEntity.data.properties).length > 0 && (
                    <div className="mt-3">
                      <button onClick={() => setIsPropertiesExpanded(!isPropertiesExpanded)}
                        className="flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900 font-medium mb-2">
                        {isPropertiesExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        <span className="uppercase tracking-wider">Properties ({Object.keys(selectedEntity.data.properties).length})</span>
                      </button>
                      {isPropertiesExpanded && (
                        <div className="bg-white border border-gray-200 rounded overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-100 border-b border-gray-200">
                                <th className="text-left py-1.5 px-2 font-semibold text-gray-700">Name</th>
                                <th className="text-left py-1.5 px-2 font-semibold text-gray-700">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(selectedEntity.data.properties).map(([key, value], idx) => (
                                <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="py-1.5 px-2 text-gray-600 font-medium align-top">{key}</td>
                                  <td className="py-1.5 px-2 text-gray-900 break-all">{String(value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
                  {chatMessages.length === 0 && (
                    <div className="text-sm text-gray-700 space-y-3">
                      <p className="font-medium">Ask me about this entity:</p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleQuickAction('Risk assessment')} className="px-3 py-1.5 text-sm border border-blue-600 text-blue-600 rounded-full hover:bg-blue-50">Risk assessment</button>
                        <button onClick={() => handleQuickAction('Show transactions')} className="px-3 py-1.5 text-sm border border-blue-600 text-blue-600 rounded-full hover:bg-blue-50">Show transactions</button>
                        <button onClick={() => handleQuickAction('Find similar nodes')} className="px-3 py-1.5 text-sm border border-blue-600 text-blue-600 rounded-full hover:bg-blue-50">Find similar nodes</button>
                        <button onClick={() => handleQuickAction('Generate SARs report')} className="px-3 py-1.5 text-sm border border-blue-600 text-blue-600 rounded-full hover:bg-blue-50">Generate SARs report</button>
                      </div>
                    </div>
                  )}
                  
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900 border border-gray-200'}`}>
                        <div style={{ whiteSpace: 'pre-wrap' }}>
                          {msg.content.includes('[Download as PDF]') ? (
                            <>
                              <div className="font-mono text-xs">{msg.content.split('[Download as PDF]')[0]}</div>
                              <button className="mt-4 px-4 py-2.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium w-full flex items-center justify-center gap-2 shadow-sm">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                                Download SAR as PDF
                              </button>
                            </>
                          ) : msg.content}
                          {msg.isStreaming && <span className="inline-block w-1 h-4 bg-gray-400 animate-pulse ml-1" />}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
                  <div className="flex gap-2">
                    <input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Ask about this entity..."
                      className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                    <button onClick={handleSendMessage} disabled={!inputMessage.trim() || isLoading}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded flex items-center gap-2">
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default GraphVisualization;