import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

interface PasswordStrengthMeterProps {
  password: string;
}

interface StrengthRule {
  label: string;
  test: (pw: string) => boolean;
}

const RULES: StrengthRule[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'Uppercase letter (A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Lowercase letter (a-z)', test: (pw) => /[a-z]/.test(pw) },
  { label: 'Number (0-9)', test: (pw) => /[0-9]/.test(pw) },
  { label: 'Special character (!@#$...)', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

const STRENGTH_LEVELS = [
  { label: 'Very Weak', color: 'var(--danger)', minScore: 0 },
  { label: 'Weak', color: '#ef6c00', minScore: 1 },
  { label: 'Fair', color: '#f9a825', minScore: 2 },
  { label: 'Good', color: '#7cb342', minScore: 3 },
  { label: 'Strong', color: 'var(--success)', minScore: 4 },
  { label: 'Excellent', color: 'var(--success)', minScore: 5 },
];

export default function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const { score, results, level } = useMemo(() => {
    const results = RULES.map((rule) => ({
      ...rule,
      passed: rule.test(password),
    }));
    const score = results.filter((r) => r.passed).length;
    const level = STRENGTH_LEVELS.reduce(
      (best, lvl) => (score >= lvl.minScore ? lvl : best),
      STRENGTH_LEVELS[0],
    );
    return { score, results, level };
  }, [password]);

  if (!password) return null;

  const segments = RULES.length;
  const filledPercent = (score / segments) * 100;

  return (
    <div className="pw-strength">
      {/* Strength bar */}
      <div className="pw-strength-bar">
        <div
          className="pw-strength-fill"
          style={{
            width: `${filledPercent}%`,
            background: level.color,
          }}
        />
      </div>

      {/* Label */}
      <div className="pw-strength-label" style={{ color: level.color }}>
        {level.label}
      </div>

      {/* Rules checklist */}
      <ul className="pw-strength-rules">
        {results.map((r) => (
          <li key={r.label} className={r.passed ? 'passed' : ''}>
            {r.passed
              ? <Check size={12} style={{ color: 'var(--success)' }} />
              : <X size={12} style={{ color: 'var(--text-muted)' }} />
            }
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
