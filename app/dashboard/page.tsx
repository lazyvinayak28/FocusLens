import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import FocusApp from './FocusApp'

export const metadata = {
  title: 'FocusLens — Dashboard',
}

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return <FocusApp />
}
