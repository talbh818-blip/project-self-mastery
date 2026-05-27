import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './features/admin/AdminRoute';
import { Login } from './screens/Login';
import { Habits } from './screens/Habits';
import { Blocker } from './screens/Blocker';
import { Vision } from './screens/Vision';
import { Course } from './screens/Course';
import { Participants } from './screens/Participants';
import { Admin } from './screens/Admin';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Habits />} />
              <Route path="blocker" element={<Blocker />} />
              <Route path="vision" element={<Vision />} />
              <Route path="course" element={<Course />} />
              <Route path="participants" element={<Participants />} />
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
