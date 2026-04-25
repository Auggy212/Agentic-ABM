import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { AccountsPage } from "./pages/AccountsPage";
import { IntakePage } from "./pages/IntakePage";

function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<IntakePage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}

export default App;
