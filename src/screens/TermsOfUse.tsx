import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function TermsOfUse() {
  return (
    <section className="pt-1 pb-8 space-y-4">
      <Link
        to="/user"
        className="inline-flex items-center gap-1 text-sm text-ink-300 hover:text-ink-100"
      >
        <ArrowRight size={16} />
        חזרה
      </Link>

      <h1 className="text-2xl font-semibold text-ink-100">תנאי שימוש</h1>

      <div className="bg-surface-card rounded-2xl p-5 text-sm text-ink-300 leading-relaxed space-y-3">
        <p className="text-xs text-ink-500">
          תנאי השימוש המלאים ייכתבו בהמשך.
        </p>
        <p>
          זוהי גרסה זמנית של מסמך תנאי השימוש. במסמך הסופי יופיעו הזכויות
          והחובות של המשתמש, מדיניות התשלום (אם תהיה), הגבלות שימוש,
          ותנאי סיום שירות.
        </p>
        <p>
          השימוש באפליקציה בשלב הזה הוא ללא תשלום ובסיס "כמות שהיא" (as-is).
          אנו עושים מאמצים סבירים לשמירת המידע שלך, אך לא יכולים להבטיח זמינות
          מלאה בכל רגע.
        </p>
        <p>
          לכל שאלה ניתן לפנות דרך מסך "משתמש" → "בקש תמיכה".
        </p>
      </div>
    </section>
  );
}
