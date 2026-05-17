import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/studio?tab=character')
}
