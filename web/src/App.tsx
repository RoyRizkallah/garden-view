import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Residences from './pages/Residences';
import Amenities from './pages/Amenities';
import Gallery from './pages/Gallery';
import Location from './pages/Location';
import About from './pages/About';
import ProtectedRoute from './portal/ProtectedRoute';

// Loaded on demand so three.js never weighs down the rest of the site.
const Explorer = lazy(() => import('./pages/Explorer'));
const FloorPlans = lazy(() => import('./pages/FloorPlans'));
const Listings = lazy(() => import('./pages/Listings'));
const ListingDetail = lazy(() => import('./pages/ListingDetail'));

// Sign-in, the resident portal and the admin portal are only reached by
// authenticated users, so none of their code ships to public visitors.
// vite.config.ts groups these into a single `portal` and `admin` chunk.
const Login = lazy(() => import('./pages/Login'));
const PortalLayout = lazy(() => import('./portal/PortalLayout'));
const PortalOverview = lazy(() => import('./portal/pages/Overview'));
const PortalCharges = lazy(() => import('./portal/pages/Charges'));
const PortalProjects = lazy(() => import('./portal/pages/Projects'));
const PortalVoting = lazy(() => import('./portal/pages/Voting'));
const PortalRequests = lazy(() => import('./portal/pages/Requests'));
const PortalDocuments = lazy(() => import('./portal/pages/Documents'));
const PortalResidence = lazy(() => import('./portal/pages/Residence'));
const PortalProfile = lazy(() => import('./portal/pages/Profile'));
const AdminLayout = lazy(() => import('./portal/AdminLayout'));
const AdminOverview = lazy(() => import('./portal/admin/Overview'));
const AdminCharges = lazy(() => import('./portal/admin/Charges'));
const AdminProjects = lazy(() => import('./portal/admin/Projects'));
const AdminVotes = lazy(() => import('./portal/admin/Votes'));
const AdminRequests = lazy(() => import('./portal/admin/Requests'));
const AdminResidents = lazy(() => import('./portal/admin/Residents'));
const AdminInquiries = lazy(() => import('./portal/admin/Inquiries'));
const AdminListings = lazy(() => import('./portal/admin/Listings'));
const AdminPhotos = lazy(() => import('./portal/admin/Photos'));

const fallback = <div style={{ minHeight: '100vh', background: 'var(--green-dark)' }} />;

function deferred(Component: LazyExoticComponent<ComponentType>) {
  return (
    <Suspense fallback={fallback}>
      <Component />
    </Suspense>
  );
}

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/residences" element={<Residences />} />
        <Route path="/amenities" element={<Amenities />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/location" element={<Location />} />
        <Route path="/about" element={<About />} />
        <Route path="/explorer" element={deferred(Explorer)} />
        <Route path="/floor-plans" element={deferred(FloorPlans)} />
        <Route path="/listings" element={deferred(Listings)} />
        <Route path="/listings/:id" element={deferred(ListingDetail)} />
      </Route>

      <Route path="/login" element={deferred(Login)} />

      <Route element={<ProtectedRoute roles={['RESIDENT']} />}>
        <Route path="/portal" element={deferred(PortalLayout)}>
          <Route index element={deferred(PortalOverview)} />
          <Route path="charges" element={deferred(PortalCharges)} />
          <Route path="projects" element={deferred(PortalProjects)} />
          <Route path="voting" element={deferred(PortalVoting)} />
          <Route path="requests" element={deferred(PortalRequests)} />
          <Route path="residence" element={deferred(PortalResidence)} />
          <Route path="documents" element={deferred(PortalDocuments)} />
          <Route path="profile" element={deferred(PortalProfile)} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['ADMIN']} />}>
        <Route path="/admin" element={deferred(AdminLayout)}>
          <Route index element={deferred(AdminOverview)} />
          <Route path="charges" element={deferred(AdminCharges)} />
          <Route path="projects" element={deferred(AdminProjects)} />
          <Route path="votes" element={deferred(AdminVotes)} />
          <Route path="requests" element={deferred(AdminRequests)} />
          <Route path="residents" element={deferred(AdminResidents)} />
          <Route path="listings" element={deferred(AdminListings)} />
          <Route path="photos" element={deferred(AdminPhotos)} />
          <Route path="inquiries" element={deferred(AdminInquiries)} />
          <Route path="profile" element={deferred(PortalProfile)} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
