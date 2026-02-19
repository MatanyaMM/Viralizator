import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Radio,
  Send,
  FileText,
  GitBranch,
  Settings,
  Zap,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/sources', label: 'Source Channels', icon: Radio },
  { path: '/destinations', label: 'Destinations', icon: Send },
  { path: '/posts', label: 'Post History', icon: FileText },
  { path: '/routing', label: 'Routing', icon: GitBranch },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Zap size={20} className="accent" />
          <span className="logo-text">VIRALZATOR</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
