import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { StoreProvider } from './state/store';
import { Layout } from './components/Layout';
import GettingStarted from './pages/GettingStarted';

const ControlTower = lazy(() => import('./pages/ControlTower'));
const DigitalTwin = lazy(() => import('./pages/DigitalTwin'));
const Planning = lazy(() => import('./pages/Planning'));
const Scenarios = lazy(() => import('./pages/Scenarios'));
const Exceptions = lazy(() => import('./pages/Exceptions'));
const Pricing = lazy(() => import('./pages/Pricing'));
const DataSettings = lazy(() => import('./pages/DataSettings'));
const Assumptions = lazy(() => import('./pages/Assumptions'));

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Layout>
          <Suspense fallback={<div className="empty">Loading…</div>}>
            <Routes>
              <Route path="/" element={<GettingStarted />} />
              <Route path="/control-tower" element={<ControlTower />} />
              <Route path="/twin" element={<DigitalTwin />} />
              <Route path="/planning" element={<Planning />} />
              <Route path="/scenarios" element={<Scenarios />} />
              <Route path="/exceptions" element={<Exceptions />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/data" element={<DataSettings />} />
              <Route path="/assumptions" element={<Assumptions />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </BrowserRouter>
    </StoreProvider>
  );
}
