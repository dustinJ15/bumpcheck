import { Link } from 'react-router-dom'
import { Wordmark } from '../components/Wordmark'
import { APP_NAME } from '../constants'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <title>{`Not found · ${APP_NAME}`}</title>
      <meta name="robots" content="noindex" />
      <Wordmark className="mb-8" />
      <h1 className="mb-2 font-mono text-4xl font-semibold text-foreground">404</h1>
      <p className="mb-6 text-muted-foreground">There is no page at this address.</p>
      <Link
        to="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        Go to the home page
      </Link>
    </div>
  )
}
