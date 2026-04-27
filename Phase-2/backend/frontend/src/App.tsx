import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { AccountsPage } from "./pages/AccountsPage";
import { BuyerIntelPage } from "./pages/BuyerIntelPage";
import { IntakePage } from "./pages/IntakePage";
import { SignalsPage as SignalPage } from "./pages/SignalsPage";

function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<IntakePage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/buyers" element={<BuyerIntelPage />} />
        <Route path="/buyer-intel" element={<Navigate to="/buyers" replace />} />
        <Route path="/signals" element={<SignalPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}

export default App;
