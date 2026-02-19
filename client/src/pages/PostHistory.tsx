import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import StatusBadge from '../components/StatusBadge.js';
import { Trash2, Eye, Zap } from 'lucide-react';

interface Post {
  id: number;
  shortcode: string;
  caption: string | null;
  likes_count: number;
  comments_count: number;
  engagement_rate: number | null;
  is_viral: boolean;
  viral_score: number | null;
  source_channel_id: number;
  display_url: string | null;
  ig_timestamp: string | null;
  created_at: string;
}

export default function PostHistory() {
  const { get, del } = useApi();
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<'all' | 'viral'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => { loadPosts(); }, [filter, page]);

  async function loadPosts() {
    const params = filter === 'viral' ? '&is_viral=true' : '';
    const res = await get<Post[]>(`/posts?page=${page}&limit=25${params}`) as any;
    if (res.data) {
      setPosts(res.data);
      setTotal(res.total ?? 0);
    }
  }

  async function deletePost(id: number) {
    await del(`/posts/${id}`);
    loadPosts();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Post History</h1>
        <div className="filter-tabs">
          <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => { setFilter('all'); setPage(1); }}>
            All Posts
          </button>
          <button className={`tab ${filter === 'viral' ? 'active' : ''}`} onClick={() => { setFilter('viral'); setPage(1); }}>
            <Zap size={14} /> Viral Only
          </button>
        </div>
      </div>

      <p className="text-muted mono" style={{ marginBottom: '1rem' }}>{total} posts total</p>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Shortcode</th>
              <th>Caption</th>
              <th>Likes</th>
              <th>Comments</th>
              <th>Engagement</th>
              <th>Viral Score</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id}>
                <td className="mono">{post.shortcode}</td>
                <td className="caption-cell rtl">{post.caption?.slice(0, 80) || '—'}{(post.caption?.length ?? 0) > 80 ? '...' : ''}</td>
                <td className="mono">{post.likes_count === -1 ? 'hidden' : post.likes_count.toLocaleString()}</td>
                <td className="mono">{post.comments_count.toLocaleString()}</td>
                <td className="mono">{post.engagement_rate?.toFixed(0) ?? '—'}</td>
                <td className="mono">{post.viral_score ? `${post.viral_score.toFixed(1)}x` : '—'}</td>
                <td>{post.is_viral ? <StatusBadge status="viral" /> : <StatusBadge status="pending" />}</td>
                <td className="mono">{post.ig_timestamp ? new Date(post.ig_timestamp).toLocaleDateString() : '—'}</td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-icon btn-danger" onClick={() => deletePost(post.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr><td colSpan={9} className="text-muted text-center">No posts found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 25 && (
        <div className="pagination">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="mono">Page {page}</span>
          <button className="btn" disabled={posts.length < 25} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
