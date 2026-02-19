import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import StatusBadge from '../components/StatusBadge.js';
import { Plus, Trash2, Edit, Send } from 'lucide-react';

interface DestinationAccount {
  id: number;
  ig_user_id: string;
  ig_handle: string;
  access_token: string;
  topic_description: string;
  brand_colors: string | null;
  cta_template: string | null;
  auto_publish: boolean;
  is_active: boolean;
}

export default function DestinationAccounts() {
  const { get, post, del } = useApi();
  const [accounts, setAccounts] = useState<DestinationAccount[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    ig_user_id: '',
    ig_handle: '',
    access_token: '',
    topic_description: '',
    auto_publish: false,
    cta_template: '',
  });

  useEffect(() => { loadAccounts(); }, []);

  async function loadAccounts() {
    const res = await get<DestinationAccount[]>('/destinations');
    if (res.data) setAccounts(res.data);
  }

  async function addAccount() {
    if (!form.ig_user_id || !form.ig_handle || !form.access_token || !form.topic_description) return;
    await post('/destinations', form);
    setForm({ ig_user_id: '', ig_handle: '', access_token: '', topic_description: '', auto_publish: false, cta_template: '' });
    setShowAdd(false);
    loadAccounts();
  }

  async function deleteAccount(id: number) {
    await del(`/destinations/${id}`);
    loadAccounts();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Destination Accounts</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={16} /> Add Destination
        </button>
      </div>

      {showAdd && (
        <div className="card add-form">
          <div className="form-grid">
            <input className="input" placeholder="IG User ID" value={form.ig_user_id} onChange={(e) => setForm({ ...form, ig_user_id: e.target.value })} />
            <input className="input" placeholder="IG Handle" value={form.ig_handle} onChange={(e) => setForm({ ...form, ig_handle: e.target.value })} />
            <input className="input" placeholder="Access Token" type="password" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} />
            <input className="input" placeholder="Topic (e.g. travel & adventure)" value={form.topic_description} onChange={(e) => setForm({ ...form, topic_description: e.target.value })} />
            <input className="input" placeholder="CTA Template (optional)" value={form.cta_template} onChange={(e) => setForm({ ...form, cta_template: e.target.value })} />
            <label className="checkbox-label">
              <input type="checkbox" checked={form.auto_publish} onChange={(e) => setForm({ ...form, auto_publish: e.target.checked })} />
              Auto-publish
            </label>
          </div>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={addAccount}>Add Destination</button>
        </div>
      )}

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Handle</th>
              <th>Topic</th>
              <th>Auto-Publish</th>
              <th>Token</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => (
              <tr key={acc.id}>
                <td className="mono">@{acc.ig_handle}</td>
                <td>{acc.topic_description}</td>
                <td><StatusBadge status={acc.auto_publish ? 'active' : 'inactive'} /></td>
                <td className="mono">{acc.access_token}</td>
                <td><StatusBadge status={acc.is_active ? 'active' : 'inactive'} /></td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-icon btn-danger" title="Delete" onClick={() => deleteAccount(acc.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr><td colSpan={6} className="text-muted text-center">No destination accounts added yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
