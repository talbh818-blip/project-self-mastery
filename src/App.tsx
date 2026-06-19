import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { VersionGate } from './components/VersionGate';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './features/admin/AdminRoute';
import { Login } from './screens/Login';
import { Habits } from './screens/Habits';
import { Features } from './screens/Features';
import { NotificationsSettings } from './screens/NotificationsSettings';
import { Vision } from './screens/Vision';
import { Course } from './screens/Course';
import { User } from './screens/User';
import { UserDetail } from './screens/UserDetail';
import { PrivacyPolicy } from './screens/PrivacyPolicy';
import { TermsOfUse } from './screens/TermsOfUse';
import { Admin } from './screens/Admin';

export default function App() {
  return (
    <AuthProvider>
      <VersionGate />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Habits />} />
              <Route path="features" element={<Features />} />
              <Route
                path="features/notifications"
                element={<NotificationsSettings />}
              />
              <Route path="vision" element={<Vision />} />
              <Route path="course" element={<Course />} />
              <Route path="user" element={<User />} />
              <Route path="user/:id" element={<UserDetail />} />
              <Route path="privacy" element={<PrivacyPolicy />} />
              <Route path="terms" element={<TermsOfUse />} />
              <Route element={<AdminRoute />}>
                <Route path="admin" element={<Admin />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
