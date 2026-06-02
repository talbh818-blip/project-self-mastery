import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './features/admin/AdminRoute';
import { Login } from './screens/Login';
import { Habits } from './screens/Habits';
import { Vision } from './screens/Vision';
import { Course } from './screens/Course';
import { User } from './screens/User';
import { PrivacyPolicy } from './screens/PrivacyPolicy';
import { TermsOfUse } from './screens/TermsOfUse';
import { Admin } from './screens/Admin';
import { LoaderPreview } from './screens/LoaderPreview';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Temporary preview of the loader — remove after sign-off. */}
          <Route path="/loader-preview" element={<LoaderPreview />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Habits />} />
              <Route path="vision" element={<Vision />} />
              <Route path="course" element={<Course />} />
              <Route path="user" element={<User />} />
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
