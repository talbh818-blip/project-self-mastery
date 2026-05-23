import { Navigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export function Login() {
  const { session, loading, signInWithGoogle } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50 text-forest-700">
        טוען…
      </div>
    );
  }
  if (session) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col items-center justify-center px-6 text-center">
      <Compass size={64} className="text-forest-700 mb-6" strokeWidth={1.5} />
      <h1 className="text-3xl font-semibold text-forest-700 mb-3">
        פרויקט מחויבות לעצמי
      </h1>
      <p className="text-forest-700/70 mb-10 max-w-sm leading-relaxed">
        בנה הרגלים חיוביים. השמד התמכרויות. צעד אחד בכל יום.
      </p>
      <button
        onClick={signInWithGoogle}
        className="bg-forest-700 hover:bg-forest-800 active:bg-forest-900 text-cream-50 font-medium px-7 py-3 rounded-2xl transition-colors shadow-sm"
      >
        התחבר עם Google
      </button>
    </div>
  );
}
