import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { AccountsPage } from "./pages/AccountsPage";
import { BuyerIntelPage } from "./pages/BuyerIntelPage";
import { CampaignPage } from "./pages/CampaignPage";
import { IntakePage } from "./pages/IntakePage";
import { SignalsPage } from "./pages/SignalsPage";
import { StorytellerPage } from "./pages/StorytellerPage";
import { VerifierPage } from "./pages/VerifierPage";

function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/intake" replace />} />
        <Route path="/intake" element={<IntakePage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/buyers" element={<BuyerIntelPage />} />
        <Route path="/signals" element={<SignalsPage />} />
        <Route path="/verify" element={<VerifierPage />} />
        <Route path="/storyteller" element={<StorytellerPage />} />
        <Route path="/campaigns" element={<CampaignPage />} />
      </Routes>
    </AppLayout>
  );
}

export default App;
