import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, BookOpen, Boxes, ChevronRight, Menu, Shapes, TriangleAlert, X } from 'lucide-react';

export type NavigationTarget = 'atlas' | 'components' | 'boilerTypes' | 'operation' | 'troubleshooting';

type Props = {
  active: NavigationTarget;
  onNavigate: (target: NavigationTarget) => void;
  className?: string;
};

const navigationItems: { id: NavigationTarget; label: string; description: string }[] = [
  { id: 'atlas', label: 'ATLAS', description: 'Master 3D boiler reference' },
  { id: 'components', label: 'COMPONENTS', description: 'Boiler anatomy and equipment systems' },
  { id: 'boilerTypes', label: 'BOILER TYPES', description: 'Fire-tube and water-tube configurations' },
  { id: 'operation', label: 'OPERATION', description: 'Startup, warm-up, normal operation and shutdown' },
  { id: 'troubleshooting', label: 'TROUBLESHOOTING', description: 'Interactive diagnostic learning' },
];

function NavigationIcon({ target }: { target: NavigationTarget }) {
  if (target === 'atlas') return <BookOpen size={18} />;
  if (target === 'components') return <Boxes size={18} />;
  if (target === 'boilerTypes') return <Shapes size={18} />;
  if (target === 'operation') return <Activity size={18} />;
  return <TriangleAlert size={18} />;
}

export default function GlobalNavigation({ active, onNavigate, className = '' }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const sheetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    sheetRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  const activate = (target: NavigationTarget) => {
    setMobileOpen(false);
    if (target !== active) onNavigate(target);
  };

  const mobileNavigation = createPortal(
    <>
      <button className="global-mobile-trigger" onClick={() => setMobileOpen(true)} aria-label="Open global navigation" aria-expanded={mobileOpen}>
        <Menu size={20} />
      </button>
      <button className={`global-mobile-backdrop ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} aria-label="Close global navigation" tabIndex={mobileOpen ? 0 : -1} />
      <section ref={sheetRef} className={`global-mobile-sheet ${mobileOpen ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Explore Boiler Equipment Atlas">
        <div className="global-mobile-sheet-head">
          <div><span>EXPLORE</span><strong>Boiler Equipment Atlas</strong></div>
          <button onClick={() => setMobileOpen(false)} aria-label="Close explore menu"><X size={19} /></button>
        </div>
        <div className="global-mobile-nav-list">
          {navigationItems.map(item => (
            <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => activate(item.id)}>
              <i><NavigationIcon target={item.id} /></i>
              <span><b>{item.label}</b><small>{item.description}</small></span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
        <p className="global-mobile-nav-note">Global navigation remains available across every study module. Detailed 3D controls stay inside each module.</p>
      </section>
    </>,
    document.body
  );

  return (
    <>
      <nav className={`primary-nav ${className}`.trim()} aria-label="Primary navigation">
        {navigationItems.map(item => (
          <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => activate(item.id)} title={item.description}>
            {item.label}
          </button>
        ))}
      </nav>
      {mobileNavigation}
    </>
  );
}
