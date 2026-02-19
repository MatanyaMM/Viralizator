import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import StatusBadge from '../components/StatusBadge.js';
import { Plus, Trash2, Play, Radio } from 'lucide-react';

interface SourceChannel {
  id: number;
  ig_handle: string;
  display_name: string;
  scrape_frequency: string;
  virality_threshold: number | null;
  last_scraped_at: string | null;
  total_posts_scraped: number;
  is_active: boolean;
}

export default function SourceChannels() {
  const { get, post, del } = useApi();
  const [channels, setChannels] = useState<SourceChannel[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [newFreq, setNewFreq] = useState('hourly');

  useEffect(() => { loadChannels(); }, []);

  async function loadChannels() {
    const res = await get<SourceChannel[]>('/sources');
    if (res.data) setChannels(res.data);
  }

  async function addChannel() {
    if (!newHandle.trim()) return;
    await post('/sources', { ig_handle: newHandle, scrape_frequency: newFreq });
    setNewHandle('');
    setShowAdd(false);
    loadChannels();
  }

  async function deleteChannel(id: number) {
    await del(`/sources/${id}`);
    loadChannels();
  }

  async function executeScrape(id: number) {
    await post(`/pipeline/scrape/${id}`, {});
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Source Channels</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={16} /> Add Source
        </button>
      </div>

      {showAdd && (
        <div className="card add-form">
          <div className="form-row">
            <input
              className="input"
              placeholder="Instagram handle (e.g. natgeo)"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addChannel()}
            />
            <select className="input select" value={newFreq} onChange={(e) => setNewFreq(e.target.value)}>
              <option value="30min">Every 30 min</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
            </select>
            <button className="btn btn-primary" onClick={addChannel}>Add</button>
          </div>
        </div>
      )}

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Handle</th>
              <th>Frequency</th>
              <th>Threshold</th>
              <th>Last Scraped</th>
              <th>Posts</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((ch) => (
              <tr key={ch.id}>
                <td className="mono">@{ch.ig_handle}</td>
                <td>{ch.scrape_frequency}</td>
                <td className="mono">{ch.virality_threshold ?? 'global'}</td>
                <td className="mono">{ch.last_scraped_at ? new Date(ch.last_scraped_at).toLocaleString() : '—'}</td>
                <td className="mono">{ch.total_posts_scraped}</td>
                <td><StatusBadge status={ch.is_active ? 'active' : 'inactive'} /></td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-icon" title="Execute Scrape" onClick={() => executeScrape(ch.id)}>
                      <Play size={14} />
                    </button>
                    <button className="btn btn-icon btn-danger" title="Delete" onClick={() => deleteChannel(ch.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {channels.length === 0 && (
              <tr><td colSpan={7} className="text-muted text-center">No source channels added yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
