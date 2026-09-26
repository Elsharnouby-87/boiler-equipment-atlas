import { useState } from 'react';
import { ArrowLeft, Flame, Gauge, Waves } from 'lucide-react';
import BoilerTypes3D, { type BoilerTypeVariant } from './BoilerTypes3D';
import GlobalNavigation, { type NavigationTarget } from './GlobalNavigation';

type Props = {
  onBack: () => void;
  onNavigate: (target: NavigationTarget) => void;
};

const typeData: Record<BoilerTypeVariant, {
  title: string;
  short: string;
  principle: string;
  construction: string[];
  operatingCharacter: string[];
  sourceNote: string;
}> = {
  fireTube: {
    title: 'Fire-Tube Boiler',
    short: 'Hot combustion gases pass through tubes surrounded by boiler water.',
    principle: 'The project training material describes fire-tube boilers as designs where the fire/hot gases pass through tubes inside the boiler while water surrounds the heated gas path.',
    construction: [
      'Horizontal pressure shell / water inventory',
      'Main furnace or flame tube',
      'Multiple fire tubes',
      'Burner and combustion controls',
      'Water-level and pressure controls',
      'Safety valve, steam outlet and blowdown fittings',
    ],
    operatingCharacter: [
      'Large water inventory gives substantial thermal storage.',
      'Heat transfer depends strongly on gas-side cleanliness and water-side condition.',
      'Mineral accumulation and tube blockage are identified in the source as important concerns.',
      'Cold-start heat-up should be controlled to limit thermal and mechanical stress.',
    ],
    sourceNote: 'This Atlas uses the fire-tube arrangement as the master 3D reference because it makes the combustion path, water level, pressure controls and boiler fittings easy to study together.',
  },
  waterTube: {
    title: 'Water-Tube Boiler',
    short: 'Water flows inside tubes while hot combustion gases pass around them.',
    principle: 'The training material describes water-tube boilers as systems where water passes through tube circuits connected between lower water/mud drums and an upper steam drum, while hot gases flow around the tubes.',
    construction: [
      'Upper steam drum',
      'Lower water / mud drum arrangement',
      'Water-tube banks / risers',
      'Furnace surrounded by water-cooled tube surfaces',
      'Burner / fuel system and combustion-gas path',
      'Feedwater, steam, safety and blowdown systems',
    ],
    operatingCharacter: [
      'The source emphasizes faster steam response and high steam-production capability.',
      'Lower water inventory can make the system more responsive to steam-load changes.',
      'The source includes A-type arrangements with two lower water drums and one upper steam drum.',
      'Heat-transfer surfaces are exposed to hot gas externally while water/steam circulates internally.',
    ],
    sourceNote: 'The 3D view is schematic: it communicates the drum-and-tube relationship rather than representing a certified OEM boiler geometry.',
  },
};

export default function BoilerTypesPage({ onBack, onNavigate }: Props) {
  const [variant, setVariant] = useState<BoilerTypeVariant>('fireTube');
  const data = typeData[variant];

  return (
    <main className="app-shell">
      <header className="atlas-topbar radiant-topbar">
        <button className="back-atlas" onClick={onBack}><ArrowLeft size={16} /> Back to Atlas</button>
        <div className="brand-lockup">
          <strong>BOILER <em>ATLAS</em></strong>
          <span>BOILER TYPE STUDY</span>
        </div>
        <GlobalNavigation active="boilerTypes" onNavigate={onNavigate} className="radiant-nav" />
      </header>

      <section className="radiant-contextbar">
        <div><span>3D TYPE COMPARISON</span><strong>Fire-Tube vs Water-Tube</strong></div>
        <p>Source-grounded training summary · Schematic geometry</p>
      </section>

      <section className="radiant-workspace">
        <aside className="radiant-left">
          <div className="radiant-title-block">
            <span>BOILER CONFIGURATIONS</span>
            <h1>{data.title}</h1>
            <p>{data.short}</p>
          </div>

          <div className="radiant-study-tabs">
            <button className={variant === 'fireTube' ? 'active' : ''} onClick={() => setVariant('fireTube')}>
              <b>01</b>
              <span><strong>Fire-Tube</strong><small>Gas inside tubes · water outside</small></span>
            </button>
            <button className={variant === 'waterTube' ? 'active' : ''} onClick={() => setVariant('waterTube')}>
              <b>02</b>
              <span><strong>Water-Tube</strong><small>Water inside tubes · hot gas outside</small></span>
            </button>
          </div>

          <div className="radiant-parts">
            <span>CORE CONSTRUCTION</span>
            {data.construction.map((item, index) => (
              <div className="radiant-part" key={item}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <div><strong>{item}</strong><p>Study this element in relation to pressure containment, heat transfer and operation.</p></div>
              </div>
            ))}
          </div>
        </aside>

        <div className="radiant-viewer">
          <BoilerTypes3D variant={variant} />
          <div className="viewer-kicker"><i /> BOILER TYPES 3D <span>Drag to rotate · Wheel / pinch to zoom</span></div>
          <div className="radiant-view-state">
            <span>ACTIVE CONFIGURATION</span>
            <b>{data.title}</b>
          </div>
          <div className="radiant-flow-legend">
            <span className="process"><Waves size={11} /> WATER / STEAM</span>
            <span className="heat"><Flame size={11} /> HOT GAS</span>
          </div>
        </div>

        <aside className="radiant-tech">
          <div className="radiant-tech-head">
            <span>HOW IT WORKS</span>
            <h2>{data.title}</h2>
            <p>{data.principle}</p>
          </div>

          <section className="radiant-tech-section">
            <span>OPERATING CHARACTER</span>
            <ul>{data.operatingCharacter.map(item => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="radiant-tech-section">
            <span>HEAT-TRANSFER READING</span>
            <p>{variant === 'fireTube'
              ? 'Combustion gas travels through the furnace and tube passes while the surrounding water absorbs heat and generates steam in the upper shell space.'
              : 'Water circulates through tube circuits connected to the drums while hot combustion gas transfers heat across the external tube surfaces.'}</p>
          </section>

          <section className="radiant-tech-section">
            <span>TRAINING NOTE</span>
            <p>{data.sourceNote}</p>
          </section>

          <div className="radiant-warning">
            <Gauge size={18} />
            <p><b>Do not transfer operating limits between boiler types.</b><br />Pressure, water-level limits, purge requirements, firing limits and startup rates must come from the actual boiler design, OEM documentation and site procedures.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
