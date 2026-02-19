import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import StatusBadge from '../components/StatusBadge.js';
import { CheckCircle, XCircle, GitBranch } from 'lucide-react';

interface RoutingDecision {
  id: number;
  post_id: number;
  destination_id: number;
  match_score: number | null;
  match_reason: string | null;
  status: string;
  overridden_by_user: boolean;
  created_at: string;
}

export default function Routing() {
  const { get, put, post: apiPost } = useApi();
  const [decisions, setDecisions] = useState<RoutingDecision[]>([]);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { loadDecisions(); }, [statusFilter]);

  async function loadDecisions() {
    const params = statusFilter ? `?status=${statusFilter}` : '';
    const res = await get<RoutingDecision[]>(`/routing${params}`);
    if (res.data) setDecisions(res.data);
  }

  async function updateStatus(id: number, status: string) {
    await put(`/routing/${id}`, { status });
    loadDecisions();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Routing</h1>
        <div className="filter-tabs">
          {['', 'pending', 'approved', 'rejected', 'published'].map((s) => (
            <button
              key={s}
              className={`tab ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Post ID</th>
              <th>Destination ID</th>
              <th>Match Score</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Override</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d.id}>
                <td className="mono">#{d.post_id}</td>
                <td className="mono">#{d.destination_id}</td>
                <td className="mono">{d.match_score ?? '—'}</td>
                <td>{d.match_reason || '—'}</td>
                <td><StatusBadge status={d.status} /></td>
                <td>{d.overridden_by_user ? 'Yes' : '—'}</td>
                <td className="mono">{new Date(d.created_at).toLocaleString()}</td>
                <td>
                  <div className="action-buttons">
                    {d.status === 'pending' && (
                      <>
                        <button className="btn btn-icon btn-success" title="Approve" onClick={() => updateStatus(d.id, 'approved')}>
                          <CheckCircle size={14} />
                        </button>
                        <button className="btn btn-icon btn-danger" title="Reject" onClick={() => updateStatus(d.id, 'rejected')}>
                          <XCircle size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {decisions.length === 0 && (
              <tr><td colSpan={8} className="text-muted text-center">No routing decisions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
