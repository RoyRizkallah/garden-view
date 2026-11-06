import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/fonts.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/portal.css';
import './styles/portal-light.css';
import './styles/resident.css';
import './styles/resident-site.css';
import './styles/site.css';
import App from './App.tsx';
import { AuthProvider } from './portal/AuthContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
