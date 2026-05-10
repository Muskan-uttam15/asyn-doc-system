import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import UploadPage from "./pages/UploadPage";
import JobDetailPage from "./pages/JobDetailPage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/jobs/:jobId" element={<JobDetailPage />} />
      </Routes>
    </Layout>
  );
}
