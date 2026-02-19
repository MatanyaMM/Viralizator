import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';

const SETTING_KEYS = [
  { key: 'apify_token', label: 'Apify API Token', type: 'password' },
  { key: 'openai_api_key', label: 'OpenAI API Key', type: 'password' },
  { key: 'gemini_api_key', label: 'Gemini API Key', type: 'password' },
  { key: 'global_virality_threshold', label: 'Global Virality Threshold', type: 'number', placeholder: '3.0' },
  { key: 'public_base_url', label: 'Public Base URL', type: 'text', placeholder: 'https://your-domain.com' },
];

export default function Settings() {
  const { get, put } = useApi();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    const res = await get<Record<string, string>>('/settings');
    if (res.data) setSettings(res.data);
  }

  async function saveSetting(key: string) {
    await put(`/settings/${key}`, { value: settings[key] || '' });
    setSaved(key);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-grid">
        {SETTING_KEYS.map(({ key, label, type, placeholder }) => (
          <div key={key} className="card setting-card">
            <label className="setting-label">{label}</label>
            <div className="setting-row">
              <input
                className="input"
                type={type}
                placeholder={placeholder || ''}
                value={settings[key] || ''}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
              />
              <button className="btn btn-primary" onClick={() => saveSetting(key)}>
                {saved === key ? <CheckCircle size={16} /> : <Save size={16} />}
              </button>
            </div>
            <div className="setting-status">
              {settings[key] ? (
                <span className="status-ok"><CheckCircle size={12} /> Configured</span>
              ) : (
                <span className="status-missing"><AlertCircle size={12} /> Not set</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
