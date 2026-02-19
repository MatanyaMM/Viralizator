import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useSSE } from '../hooks/useSSE.js';
import ActivityFeed from '../components/ActivityFeed.js';
import { Radio, Send, Zap, FileText, Wifi, WifiOff } from 'lucide-react';

interface Stats {
  sources: number;
  destinations: number;
  totalPosts: number;
  viralPosts: number;
}

export default function Overview() {
  const { get } = useApi();
  const { events, connected } = useSSE();
  const [stats, setStats] = useState<Stats>({ sources: 0, destinations: 0, totalPosts: 0, viralPosts: 0 });

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    const [sources, destinations, posts, viralPosts] = await Promise.all([
      get<unknown[]>('/sources'),
      get<unknown[]>('/destinations'),
      get<{ total: number }>('/posts?limit=1'),
      get<{ total: number }>('/posts?limit=1&is_viral=true'),
    ]);

    setStats({
      sources: Array.isArray(sources.data) ? sources.data.length : 0,
      destinations: Array.isArray(destinations.data) ? destinations.data.length : 0,
      totalPosts: (posts as any)?.total ?? 0,
      viralPosts: (viralPosts as any)?.total ?? 0,
    });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Overview</h1>
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="mono">{connected ? 'Live' : 'Disconnected'}</span>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Radio size={20} /></div>
          <div className="stat-info">
            <span className="stat-value mono">{stats.sources}</span>
            <span className="stat-label">Source Channels</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Send size={20} /></div>
          <div className="stat-info">
            <span className="stat-value mono">{stats.destinations}</span>
            <span className="stat-label">Destinations</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><FileText size={20} /></div>
          <div className="stat-info">
            <span className="stat-value mono">{stats.totalPosts}</span>
            <span className="stat-label">Total Posts</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon accent"><Zap size={20} /></div>
          <div className="stat-info">
            <span className="stat-value mono accent">{stats.viralPosts}</span>
            <span className="stat-label">Viral Posts</span>
          </div>
        </div>
      </div>

      <div className="overview-grid">
        <ActivityFeed events={events} />
      </div>
    </div>
  );
}
