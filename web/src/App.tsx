import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Residences from './pages/Residences';
import Amenities from './pages/Amenities';
import Gallery from './pages/Gallery';
import Location from './pages/Location';
import About from './pages/About';
import ComingSoon from './pages/ComingSoon';
import Login from './pages/Login';

// Loaded on demand so three.js never weighs down the rest of the site.
const Explorer = lazy(() => import('./pages/Explorer'));
const FloorPlans = lazy(() => import('./pages/FloorPlans'));
import ProtectedRoute from './portal/ProtectedRoute';
import PortalLayout from './portal/PortalLayout';
import PortalOverview from './portal/pages/Overview';
import PortalCharges from './portal/pages/Charges';
import PortalProjects from './portal/pages/Projects';
import PortalVoting from './portal/pages/Voting';
import PortalRequests from './portal/pages/Requests';
import PortalDocuments from './portal/pages/Documents';
import PortalResidence from './portal/pages/Residence';
import PortalProfile from './portal/pages/Profile';
import AdminLayout from './portal/AdminLayout';
import AdminOverview from './portal/admin/Overview';
import AdminCharges from './portal/admin/Charges';
import AdminProjects from './portal/admin/Projects';
import AdminVotes from './portal/admin/Votes';
import AdminRequests from './portal/admin/Requests';
import AdminResidents from './portal/admin/Residents';
import AdminInquiries from './portal/admin/Inquiries';
import AdminListings from './portal/admin/Listings';
import AdminPhotos from './portal/admin/Photos';

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
        <Route
          path="/explorer"
          element={
            <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--green-dark)' }} />}>
              <Explorer />
            </Suspense>
          }
        />
        <Route
          path="/floor-plans"
          element={
            <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--green-dark)' }} />}>
              <FloorPlans />
            </Suspense>
          }
        />
        <Route
          path="/virtual-tour"
          element={
            <ComingSoon
              image="/images/exterior-02.jpg"
              title="360° Virtual Tour"
              description="An immersive walkthrough of a sample residence. This needs professional 360° photography, which hasn't been captured yet."
            />
          }
        />
      </Route>

      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute roles={['RESIDENT']} />}>
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<PortalOverview />} />
          <Route path="charges" element={<PortalCharges />} />
          <Route path="projects" element={<PortalProjects />} />
          <Route path="voting" element={<PortalVoting />} />
          <Route path="requests" element={<PortalRequests />} />
          <Route path="residence" element={<PortalResidence />} />
          <Route path="documents" element={<PortalDocuments />} />
          <Route path="profile" element={<PortalProfile />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['ADMIN']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="charges" element={<AdminCharges />} />
          <Route path="projects" element={<AdminProjects />} />
          <Route path="votes" element={<AdminVotes />} />
          <Route path="requests" element={<AdminRequests />} />
          <Route path="residents" element={<AdminResidents />} />
          <Route path="listings" element={<AdminListings />} />
          <Route path="photos" element={<AdminPhotos />} />
          <Route path="inquiries" element={<AdminInquiries />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
