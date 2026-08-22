// ============================================================================
// ScoringDocPanel — the admin "ניקוד" tab: a detailed, ALWAYS-ACCURATE
// reference for the habit scoring system.
// ----------------------------------------------------------------------------
// Every NUMBER on this page is imported live from the scoring engine
// (scoring.ts = frozen V1, scoring2.ts = V2 "monthly pie"). Change a constant
// or a weight/decay formula there and this document updates itself — no manual
// edits. Only the PROSE that explains the rules is written by hand; keep it in
// step whenever the *logic* (not just a number) changes.
// ============================================================================
import type { ReactNode } from 'react';
import {
  AUTO_X_GRACE_DAYS,
  POINTS_V,
  POINTS_X,
  STREAK_THRESHOLDS,
} from '../habits/scoring';
import {
  BASE_FACTOR,
  BONUS_FULL_MONTH,
  BONUS_RUN_14,
  BONUS_RUN_7,
  DECAY_BY_DELAY,
  LOCK_AFTER_DAYS,
  MARK_LOCK_AFTER_DAYS,
  MAX_TREES_PER_MONTH,
  MISS_PENALTY,
  MONTHLY_PIE,
  SCORING_V2_EPOCH,
  TREE_PRICES,
  closerWeight,
  potentialMultiplier,
  slotWeights,
} from '../habits/scoring2';

// ── small formatters ────────────────────────────────────────────────────────
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const denom = (frac: number) => Math.round(1 / frac); // 1/45 → 45
const delayLabel = (i: number) =>
  i === 0 ? 'באותו יום' : i === 1 ? 'יום אחרי' : i === 2 ? 'יומיים אחרי' : `${i} ימים אחרי`;

export function ScoringDocPanel() {
  // A worked example for "day value" — computed live from the constants.
  const exCount = 3;
  const exDays = 30;
  const exDayValue =
    (MONTHLY_PIE * potentialMultiplier(exCount) * BASE_FACTOR) /
    (exCount * exDays);

  const reservePct = pct(1 - BASE_FACTOR);
  const quotasToShow = [1, 2, 3, 4, 5, 6, 10];

  // Running total down the tree ladder.
  let cum = 0;
  const treeRows = TREE_PRICES.map((price, i) => {
    cum += price;
    return { n: i + 1, price, cum };
  });

  return (
    <div className="max-w-3xl space-y-4 text-ink-100 leading-relaxed pb-8">
      <header>
        <h1 className="text-xl font-bold">שיטת הניקוד של ההרגלים</h1>
        <p className="mt-1 text-sm text-ink-300">
          מסמך זה נוצר אוטומטית מקוד מנוע הניקוד — כל המספרים כאן הם{' '}
          <b>הערכים האמיתיים שבשימוש כרגע</b>. שינוי בקוד → שינוי כאן.
        </p>
      </header>

      {/* Overview */}
      <Section title="עקרון על — שתי תקופות">
        <P>
          הניקוד המוצג לכל משתמש מורכב משלושה חלקים שמתחברים:
        </P>
        <Bullets
          items={[
            <>
              <b>V1 קפוא</b> — כל הימים <b>לפני</b> האפוך ({SCORING_V2_EPOCH}),
              מנוקדים לנצח לפי השיטה הישנה. קפואים — לא זזים יותר.
            </>,
            <>
              <b>V2</b> — כל יום <b>מהאפוך</b> והלאה, שיטת "העוגה החודשית"
              (מפורטת למטה).
            </>,
            <>
              <b>התאמת אדמין</b> — נקודות ידניות שמתווספות/נגרעות מעל הכול.
            </>,
          ]}
        />
        <Callout>
          הניקוד הכולל = V1 קפוא + V2 + התאמת אדמין.
        </Callout>
      </Section>

      {/* V2 pie */}
      <Section title={`V2 — "העוגה החודשית"`}>
        <P>
          לכל משתמש יש בכל חודש קלנדרי <b>עוגה</b> של עד{' '}
          <b>{MONTHLY_PIE.toLocaleString('he-IL')} נקודות</b>, שקונה עד{' '}
          <b>{MAX_TREES_PER_MONTH} עצים</b> בחודש.{' '}
          <b>{pct(BASE_FACTOR)}</b> מהעוגה נצברים מסימונים, ו־{reservePct}{' '}
          שמורים לבונוסי רצף — כך שחודש מושלם (כל הסימונים + רצף מלא) נוחת בדיוק
          על העוגה המלאה.
        </P>

        <SubTitle>כמה מהעוגה פתוח — לפי מספר ההרגלים הפעילים</SubTitle>
        <P>
          הפוטנציאל נקבע ממספר ההרגלים הפעילים באותו יום, ומתחלק שווה ביניהם:
        </P>
        <Table
          head={['מספר הרגלים', 'אחוז מהעוגה']}
          rows={[
            ['הרגל אחד', pct(potentialMultiplier(1))],
            ['שני הרגלים', pct(potentialMultiplier(2))],
            ['שלושה ומעלה', pct(potentialMultiplier(3))],
          ]}
        />

        <SubTitle>ערך של יום־הרגל</SubTitle>
        <P>הערך שאפשר להרוויח מסימונים ליום בודד של הרגל:</P>
        <Formula>
          ערך יום = {MONTHLY_PIE.toLocaleString('he-IL')} × {pct(BASE_FACTOR)} ×
          מכפיל ÷ (מספר הרגלים × ימים בחודש)
        </Formula>
        <P className="text-sm text-ink-300">
          דוגמה: {exCount} הרגלים, חודש בן {exDays} יום, פוטנציאל{' '}
          {pct(potentialMultiplier(exCount))} →{' '}
          {MONTHLY_PIE.toLocaleString('he-IL')} × {pct(BASE_FACTOR)} × 1 ÷ (
          {exCount} × {exDays}) = <b>{Math.round(exDayValue)} נק' ליום</b>.
        </P>

        <SubTitle>חלוקת הערך בין הסימונים (משקלי סלוטים)</SubTitle>
        <P>
          כשליום/תקופה יש יותר מסימון אחד, <b>הסוגר (הסימון האחרון) שווה הכי
          הרבה</b>, אבל הפרמיה שלו קטנה ככל שהיעד גדל. השאר מתחלקים שווה ביתרה:
        </P>
        <Table
          head={['יעד', 'הסוגר', 'כל אחד מהמוקדמים']}
          rows={quotasToShow.map((q) => {
            const w = slotWeights(q);
            const early = q > 1 ? w[0] : 0;
            return [
              String(q),
              pct(closerWeight(q)),
              q > 1 ? pct(early) : '—',
            ];
          })}
        />

        <SubTitle>איחור בסימון (דעיכה)</SubTitle>
        <P>הנקודות נצמדות לרגע ההקלקה — סימון מאוחר שווה פחות:</P>
        <Table
          head={['מתי סומן', 'אחוז מהערך']}
          rows={[
            ...DECAY_BY_DELAY.map(
              (f, i) => [delayLabel(i), pct(f)] as [string, string],
            ),
            [
              `${MARK_LOCK_AFTER_DAYS} ימים ומעלה`,
              'נעול — אפשר לסמן, אבל בלי ניקוד',
            ],
          ]}
        />

        <SubTitle>עונשים — בסגירת תקופה</SubTitle>
        <P>
          תקופה (יום / שבוע ראשון–שבת / חודש) <b>ננעלת</b> כשהיום האחרון שלה בן{' '}
          {LOCK_AFTER_DAYS} ימים. אז, על <b>כל סלוט שלא מולא ביעד</b> מנוכים{' '}
          <b>{pct(MISS_PENALTY)}</b> מערך אותו סלוט (הסלוטים החסרים הם היקרים —
          הסוגרים). אין X ידני ואין auto־x ב־V2: כישלון = היעדר V, והעונש מגיע
          בסגירה.
        </P>

        <SubTitle>בונוסי רצף — בתוך העוגה, לפי סוג ההרגל</SubTitle>
        <Bullets
          items={[
            <>
              <b>יומי:</b> רצף ≥7 ימים → +נתח/{denom(BONUS_RUN_7)}; ≥14 →
              +נתח/{denom(BONUS_RUN_14)}; חודש מושלם → +נתח/
              {denom(BONUS_FULL_MONTH)}. יחד = בדיוק {reservePct} הרזרבה.
            </>,
            <>
              <b>שבועי:</b> בונוס יחיד — עמידה ביעד בכל שבועות החודש → +נתח/
              {denom(1 / 9)} (כל הרזרבה בבת אחת).
            </>,
            <>
              <b>חודשי:</b> אין בונוס רצף; במקום זה הסימונים שווים את{' '}
              <b>מלוא</b> הערך ({pct(1)} במקום {pct(BASE_FACTOR)}), כך שחודש
              מושלם בכל תמהיל = בדיוק העוגה.
            </>,
          ]}
        />

        <SubTitle>יעד אפקטיבי</SubTitle>
        <P>
          תקופה שבועית/חודשית עם פחות ימים פעילים מהיעד (הרגל שנוצר באמצע שבוע)
          נשפטת מול <b>min(יעד, ימים פעילים)</b> — גם ברווחים, גם בעונשים וגם
          בבונוסים. כך תקופה חלקית לא נענשת אוטומטית ולא חוסמת בונוס.
        </P>

        <SubTitle>רצפת 0 — אין ניקוד שלילי</SubTitle>
        <Callout>
          הניקוד לעולם לא יורד מתחת ל‑0 — לא בהרגל בודד ולא בסך הכול. עונשים
          מורידים, אבל כשמגיעים ל‑0 עוצרים; ומרגע שנגעת ב‑0, נקודות חדשות מטפסות
          מ‑0 (בלי "חוב" נסתר — התחלה נקייה).
        </Callout>
      </Section>

      {/* Trees */}
      <Section title="עצים — הסולם החודשי">
        <P>
          כל חודש אפשר לשתול עד {MAX_TREES_PER_MONTH} עצים. מחיר כל עץ עולה לפי
          הסולם (סכום = {MONTHLY_PIE.toLocaleString('he-IL')} — העוגה המלאה).
          הסולם מתאפס בתחילת כל חודש, אבל <b>נקודות שלא נוצלו עוברות לחודש הבא</b>{' '}
          (בנק/carryover).
        </P>
        <Table
          head={['עץ #', 'מחיר', 'מצטבר']}
          rows={treeRows.map((r) => [
            String(r.n),
            r.price.toLocaleString('he-IL'),
            r.cum.toLocaleString('he-IL'),
          ])}
        />
      </Section>

      {/* Frozen V1 */}
      <Section title="V1 קפוא — היסטורי (ימים לפני האפוך)">
        <P>
          חל <b>רק</b> על ימים לפני {SCORING_V2_EPOCH}, וקפוא לנצח — הניקוד הזה
          לא זז יותר. נשמר כדי שההיסטוריה תישאר יציבה.
        </P>
        <Table
          head={['אירוע', 'נקודות']}
          rows={[
            ['V (הצלחה)', `+${POINTS_V}`],
            ['X (כישלון)', String(POINTS_X)],
            [`יום ריק אחרי ${AUTO_X_GRACE_DAYS} ימים (auto־x)`, String(POINTS_X)],
            ...STREAK_THRESHOLDS.map(
              (t) => [`בונוס רצף ${t.days} ימים`, `+${t.bonus}`] as [string, string],
            ),
          ]}
        />
      </Section>
    </div>
  );
}

// ── presentational helpers ──────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-4 sm:p-5 space-y-3">
      <h2 className="text-base font-bold text-forest-400">{title}</h2>
      {children}
    </section>
  );
}

function SubTitle({ children }: { children: ReactNode }) {
  return <h3 className="pt-1 text-sm font-bold text-ink-100">{children}</h3>;
}

function P({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm text-ink-100 ${className}`}>{children}</p>;
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 pr-4 list-disc marker:text-forest-600">
      {items.map((it, i) => (
        <li key={i} className="text-sm text-ink-100">
          {it}
        </li>
      ))}
    </ul>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-forest-700/10 border border-forest-700/30 px-3 py-2 text-sm font-semibold text-forest-300">
      {children}
    </div>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <div
      dir="ltr"
      className="rounded-xl bg-surface-raised px-3 py-2 text-sm text-ink-100 text-center font-medium"
    >
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto vision-feed-scroll rounded-xl border border-surface-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-raised text-ink-300">
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-surface-border">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2 whitespace-nowrap ${
                    ci === 0 ? 'text-ink-100' : 'text-ink-300 tabular-nums'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
