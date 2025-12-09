import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import UserDashboard from "./pages/dashboard/UserDashboard";
import BuyPackage from "./pages/package/BuyPackage";
import GenealogyTree from "./pages/genealogy/TreeView";
import PairIncome from "./pages/income/PairIncome";
import WalletSummary from "./pages/wallet/WalletSummary";
import AdminDashboard from "./pages/admin/AdminDashboard";
import FranchiseDashboard from "./pages/franchise/FranchiseDashboard";
import ProtectedRoute from "./components/ProtectedRoute";

export default function RoutesApp() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
      <Route path="/package/buy" element={<ProtectedRoute><BuyPackage /></ProtectedRoute>} />
      <Route path="/genealogy" element={<ProtectedRoute><GenealogyTree /></ProtectedRoute>} />
      <Route path="/income/pair" element={<ProtectedRoute><PairIncome /></ProtectedRoute>} />
      <Route path="/wallet" element={<ProtectedRoute><WalletSummary /></ProtectedRoute>} />

      <Route path="/admin" element={<ProtectedRoute admin><AdminDashboard /></ProtectedRoute>} />
      <Route path="/franchise" element={<ProtectedRoute><FranchiseDashboard /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<div>Page not found</div>} />
    </Routes>
  );
}
