import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Login() {
  const { session, loading, signInWithGoogle } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base text-ink-100">
        טוען…
      </div>
    );
  }
  if (session) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-surface-base flex flex-col items-center justify-center px-6 text-center">
      <img
        src="/logo.png"
        alt="פרויקט מחויבות לעצמי"
        className="w-32 h-32 mb-6"
      />
      <h1 className="text-3xl font-semibold text-ink-100 mb-3">
        פרויקט מחויבות לעצמי
      </h1>
      <p className="text-ink-300 mb-10 max-w-sm leading-relaxed">
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
