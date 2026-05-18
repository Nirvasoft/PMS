import { Moon, Sun } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../store';
import { toggleTheme } from '../store/slices/themeSlice';

export default function ThemeToggle() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((s) => s.theme.mode);

  return (
    <button
      className="theme-toggle-btn"
      onClick={() => dispatch(toggleTheme())}
      title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      <span className="theme-toggle-track">
        <span className="theme-toggle-icon theme-toggle-sun">
          <Sun size={12} />
        </span>
        <span className="theme-toggle-icon theme-toggle-moon">
          <Moon size={12} />
        </span>
        <span className="theme-toggle-thumb" />
      </span>
    </button>
  );
}
