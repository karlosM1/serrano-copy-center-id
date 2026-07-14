import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { TemplatesPage } from "@/pages/TemplatesPage";
import { DesignerPage } from "@/features/designer/DesignerPage";
import { GeneratePage } from "@/pages/GeneratePage";
import { HistoryPage } from "@/pages/HistoryPage";
import { SettingsPage } from "@/pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="templates/:id/designer" element={<DesignerPage />} />
          <Route path="generate" element={<GeneratePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
