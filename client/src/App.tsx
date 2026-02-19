import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.js';
import Overview from './pages/Overview.js';
import SourceChannels from './pages/SourceChannels.js';
import DestinationAccounts from './pages/DestinationAccounts.js';
import PostHistory from './pages/PostHistory.js';
import Routing from './pages/Routing.js';
import Settings from './pages/Settings.js';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/sources" element={<SourceChannels />} />
          <Route path="/destinations" element={<DestinationAccounts />} />
          <Route path="/posts" element={<PostHistory />} />
          <Route path="/routing" element={<Routing />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
