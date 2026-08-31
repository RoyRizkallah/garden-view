import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Defaults reviewed and kept on purpose:
    // - assetsInlineLimit (4 KiB): nothing imported from src/ is a binary asset;
    //   photos, logos, plans and fonts are all served from public/.
    // - modulePreload: Vite injects <link rel="modulepreload"> for the static
    //   chunks of the entry (vendor), so the first paint never waterfalls.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // three.js (+ its examples/jsm helpers) is only reached through the
            // lazy Explorer / FloorPlans routes, so this stays an async chunk.
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            // Resident portal and admin portal: one chunk each, loaded only
            // after sign-in (App.tsx lazy-imports every page in them).
            // includeDependenciesRecursively must be off here: otherwise the
            // shared modules these pages import (Icons, api, AuthContext...)
            // get captured too and the public entry ends up statically
            // importing the portal chunk.
            {
              name: 'portal',
              test: /[\\/]src[\\/]portal[\\/](pages[\\/]|PortalLayout\.tsx$)/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'admin',
              test: /[\\/]src[\\/]portal[\\/](admin[\\/]|AdminLayout\.tsx$)/,
              includeDependenciesRecursively: false,
            },
            // React runtime + router change far less often than app code:
            // keep them in a separately cacheable chunk.
            { name: 'vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
