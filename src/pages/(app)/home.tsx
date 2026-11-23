/**
 * /home is where sign-in lands (src/server/http-routes.ts) and where older
 * links point. The app's home is the projects list, so this only redirects.
 */

import { Navigate } from 'react-router-dom'

export default function HomePage() {
  return <Navigate to="/projects" replace />
}
