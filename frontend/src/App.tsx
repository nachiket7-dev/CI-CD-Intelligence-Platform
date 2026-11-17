import { Link, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { EmptyState } from "./components/ui/DataState";
import { DesignSystemPage } from "./pages/DesignSystemPage";
import { ModelsPage } from "./pages/ModelsPage";
import { RunDetailPage } from "./pages/RunDetailPage";
import { RunsPage } from "./pages/RunsPage";
import { TrackerPage } from "./pages/TrackerPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<RunsPage />} />
        <Route path="runs/:id" element={<RunDetailPage />} />
        <Route path="models" element={<ModelsPage />} />
        <Route path="tracker" element={<TrackerPage />} />
        {import.meta.env.DEV && <Route path="design" element={<DesignSystemPage />} />}
        <Route path="*" element={<EmptyState title="Page not found" body="That address doesn't match a page here." action={<Link to="/">Go to runs</Link>} />} />
      </Route>
    </Routes>
  );
}
