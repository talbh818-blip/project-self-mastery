import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function PrivacyPolicy() {
  return (
    <section className="pt-1 pb-8 space-y-4">
      <Link
        to="/user"
        className="inline-flex items-center gap-1 text-sm text-ink-300 hover:text-ink-100"
      >
        <ArrowRight size={16} />
        חזרה
      </Link>

      <h1 className="text-2xl font-semibold text-ink-100">מדיניות פרטיות</h1>

      <div className="bg-surface-card rounded-2xl p-5 text-sm text-ink-300 leading-relaxed space-y-3">
        <p className="text-xs text-ink-500">
          תוכן מדיניות הפרטיות ייכתב בהמשך.
        </p>
        <p>
          זוהי גרסה זמנית. הטקסט המלא של מדיניות הפרטיות יופיע כאן ויכלול את
          סוגי המידע שאנו אוספים, כיצד אנו משתמשים בו, איך הוא נשמר, ואת זכויות
          המשתמש.
        </p>
        <p>
          ככלל, המידע שאתה מזין לאפליקציה (כולל הרגלים, ניקוד, וכתיבה חופשית
          במסך החזון) נשמר באופן פרטי ומקושר לחשבון שלך בלבד. חזון אישי לעולם
          לא נחשף למשתמשים אחרים.
        </p>
        <p>
          לכל שאלה ניתן לפנות דרך מסך "משתמש" → "בקש תמיכה".
        </p>
      </div>
    </section>
  );
}
