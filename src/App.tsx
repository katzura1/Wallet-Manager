import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import Transactions from '@/pages/Transactions'
import Accounts from '@/pages/Accounts'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import Debts from '@/pages/Debts'
import Portfolio from '@/pages/Portfolio'
import { LockScreen } from '@/components/LockScreen'
import { usePinStore } from '@/stores/walletStore'

export default function App() {
  const { isLocked } = usePinStore();

  if (isLocked) return <LockScreen />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/debts" element={<Debts />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
