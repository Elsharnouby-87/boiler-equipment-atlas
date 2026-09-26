import { useMemo, useState } from 'react';
import { ArrowLeft, Flame, Gauge, ShieldCheck, Waves, X } from 'lucide-react';
import Boiler3D from './Boiler3D';
import GlobalNavigation, { type NavigationTarget } from './GlobalNavigation';
import type { CameraCommand, ViewMode } from './modelTypes';

type Props = {
  onBack: () => void;
  onNavigate: (target: NavigationTarget) => void;
};

type SystemId = 'combustion' | 'pressure' | 'waterSteam' | 'protection';

type ComponentStudy = {
  name: string;
  mode: ViewMode;
  purpose: string;
  watch: string[];
  failure: string[];
};

const systems: Record<SystemId, {
  title: string;
  short: string;
  components: ComponentStudy[];
}> = {
  combustion: {
    title: 'Combustion & Gas Path',
    short: 'From burner light-off through the furnace, fire tubes, smokeboxes and flue outlet.',
    components: [
      { name: 'Burner & Ignition', mode: 'cutaway', purpose: 'Establish and supervise combustion under the burner-management sequence.', watch: ['Stable flame', 'Ignition/flame-sensor response', 'Purge sequence'], failure: ['Ignition failure', 'Flame loss', 'Poor air/fuel condition'] },
      { name: 'Furnace Tube', mode: 'cutaway', purpose: 'Receive the burner flame and transfer heat through the furnace wall into surrounding boiler water.', watch: ['Flame position', 'Soot', 'Abnormal hot areas'], failure: ['Fouling', 'Thermal stress', 'Poor combustion'] },
      { name: 'Fire Tubes', mode: 'cutaway', purpose: 'Carry hot gas through the boiler water inventory for heat recovery.', watch: ['Cleanliness', 'Tube leakage', 'Gas-path restriction'], failure: ['Soot fouling', 'Tube leakage', 'Blockage'] },
      { name: 'Front Smokebox', mode: 'normal', purpose: 'Contain the front gas-side transition and provide access to tube ends.', watch: ['Sealing', 'Soot', 'External hot spots'], failure: ['Door/seal leakage', 'Deposit build-up'] },
      { name: 'Rear Smokebox', mode: 'normal', purpose: 'Collect/turn combustion gas before final flue discharge.', watch: ['Cleanliness', 'Leakage', 'Restriction'], failure: ['Fouling', 'Seal leakage'] },
      { name: 'Stack / Flue Outlet', mode: 'normal', purpose: 'Discharge combustion products after heat recovery.', watch: ['Stack temperature', 'Smoke condition', 'Draft behavior'], failure: ['High stack temperature', 'Restriction', 'Corrosion'] },
    ],
  },
  pressure: {
    title: 'Pressure Vessel & Heat Transfer',
    short: 'Pressure boundary and the surfaces that separate hot gas from boiler water.',
    components: [
      { name: 'Boiler Shell', mode: 'normal', purpose: 'Contain water and steam pressure while supporting the internal boiler arrangement.', watch: ['Leakage', 'Corrosion', 'Support condition'], failure: ['Pressure-boundary leakage', 'Corrosion', 'Thermal stress'] },
      { name: 'Tube Sheets', mode: 'cutaway', purpose: 'Support and seal the furnace/fire-tube ends.', watch: ['Tube-end leakage', 'Deposits', 'Corrosion'], failure: ['Tube-to-sheet leakage', 'Thermal stress'] },
      { name: 'Fire Tubes', mode: 'cutaway', purpose: 'Provide the main gas-to-water heat-transfer surface in the master fire-tube model.', watch: ['Fouling', 'Deposits', 'Leakage'], failure: ['Reduced heat transfer', 'Blockage', 'Tube failure'] },
      { name: 'Water Space', mode: 'xray', purpose: 'Absorb transferred heat while maintaining cooling of heated pressure parts.', watch: ['Water level', 'Water chemistry', 'Feedwater response'], failure: ['Low level', 'Scale', 'Foaming'] },
    ],
  },
  waterSteam: {
    title: 'Water, Steam & Feedwater',
    short: 'Inventory control from feedwater entry to steam delivery and blowdown.',
    components: [
      { name: 'Feedwater Inlet', mode: 'normal', purpose: 'Supply replacement water to maintain boiler level as steam is generated.', watch: ['Pump response', 'Valve alignment', 'Check valve/strainer'], failure: ['Pump failure', 'Blocked strainer', 'Check-valve leakage'] },
      { name: 'Water Space', mode: 'xray', purpose: 'Provide working water inventory for steam generation.', watch: ['Level', 'Bubbling/foaming', 'TDS/conductivity'], failure: ['Low/high level', 'Carryover risk', 'Deposit build-up'] },
      { name: 'Steam Space', mode: 'xray', purpose: 'Collect generated steam above the operating water level.', watch: ['Pressure', 'Level stability', 'Load response'], failure: ['Pressure instability', 'Water carryover'] },
      { name: 'Steam Outlet', mode: 'normal', purpose: 'Deliver steam from the boiler into the steam system.', watch: ['Valve position', 'Leakage', 'Pressure response'], failure: ['Valve leakage', 'Rapid load disturbance'] },
      { name: 'Blowdown Valve', mode: 'normal', purpose: 'Remove boiler water for solids/TDS control, draining and defined tests.', watch: ['Leakage', 'Discharge condition', 'Water chemistry trend'], failure: ['Passing valve', 'Blocked discharge', 'Excessive/inadequate blowdown'] },
    ],
  },
  protection: {
    title: 'Controls, Safety & Protection',
    short: 'Independent layers that supervise level, pressure and combustion.',
    components: [
      { name: 'Level Gauge', mode: 'normal', purpose: 'Provide direct visual water-level indication.', watch: ['Visible level', 'Bubbles', 'Blocked connections'], failure: ['False indication', 'Glass leakage', 'Connection blockage'] },
      { name: 'Level Sensors', mode: 'normal', purpose: 'Control feedwater and provide low-water protective shutdown.', watch: ['Pump cut-in/cut-out', 'Low-level alarm/trip'], failure: ['Probe fouling', 'Relay/control fault', 'Nuisance or failed trip'] },
      { name: 'Pressure Controls', mode: 'normal', purpose: 'Cycle/stage firing and provide high-pressure shutdown.', watch: ['Cut-in/cut-out', 'Pressure agreement', 'High-pressure trip'], failure: ['Wrong setting', 'Switch fault', 'Blocked connection'] },
      { name: 'Safety Valve', mode: 'normal', purpose: 'Provide mechanical overpressure relief if boiler pressure reaches its set point.', watch: ['Leakage/simmering', 'Unexpected lift', 'Discharge path'], failure: ['Leakage', 'Sticking', 'Damage/incorrect setting'] },
      { name: 'Burner & Ignition', mode: 'cutaway', purpose: 'Maintain flame supervision and prevent continued firing when flame is not proved.', watch: ['Flame detector', 'Ignition sequence', 'Trip response'], failure: ['Flame failure', 'Detector fault', 'Ignition fault'] },
    ],
  },
};

const systemOrder: { id: SystemId; label: string; icon: JSX.Element }[] = [
  { id: 'combustion', label: 'Combustion', icon: <Flame size={15} /> },
  { id: 'pressure', label: 'Pressure Vessel', icon: <Gauge size={15} /> },
  { id: 'waterSteam', label: 'Water & Steam', icon: <Waves size={15} /> },
  { id: 'protection', label: 'Protection', icon: <ShieldCheck size={15} /> },
];

export default function ComponentsPage({ onBack, onNavigate }: Props) {
  const [systemId, setSystemId] = useState<SystemId>('combustion');
  const [componentIndex, setComponentIndex] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({ id: 1, action: 'fitComponent', component: systems.combustion.components[0].name });

  const system = systems[systemId];
  const study = system.components[Math.min(componentIndex, system.components.length - 1)];

  const chooseSystem = (next: SystemId) => {
    setSystemId(next);
    setComponentIndex(0);
    const first = systems[next].components[0];
    setCameraCommand(current => ({ id: current.id + 1, action: 'fitComponent', component: first.name }));
  };

  const chooseComponent = (next: number) => {
    setComponentIndex(next);
    setCameraCommand(current => ({ id: current.id + 1, action: 'fitComponent', component: system.components[next].name }));
  };

  const systemNumber = useMemo(() => systemOrder.findIndex(item => item.id === systemId) + 1, [systemId]);

  return (
    <main className="app-shell">
      <header className="atlas-topbar radiant-topbar">
        <button className="back-atlas" onClick={onBack}><ArrowLeft size={16} /> Back to Atlas</button>
        <div className="brand-lockup">
          <strong>BOILER <em>ATLAS</em></strong>
          <span>COMPONENT STUDY</span>
        </div>
        <GlobalNavigation active="components" onNavigate={onNavigate} className="radiant-nav" />
      </header>

      <section className="radiant-contextbar">
        <div><span>DETAILED SYSTEM STUDY</span><strong>{system.title} · {study.name}</strong></div>
        <p>3D context · function · watch points · failure modes</p>
      </section>

      <section className="radiant-workspace">
        <aside className="radiant-left">
          <div className="radiant-title-block">
            <span>SYSTEM {systemNumber} / {systemOrder.length}</span>
            <h1>{system.title}</h1>
            <p>{system.short}</p>
          </div>

          <div className="radiant-study-tabs">
            {systemOrder.map(item => (
              <button key={item.id} className={systemId === item.id ? 'active' : ''} onClick={() => chooseSystem(item.id)}>
                <b>{item.icon}</b>
                <span><strong>{item.label}</strong><small>{systems[item.id].short}</small></span>
              </button>
            ))}
          </div>

          <div className="radiant-parts">
            <span>COMPONENTS IN THIS SYSTEM</span>
            {system.components.map((item, index) => (
              <button key={item.name} className={componentIndex === index ? 'component-btn active' : 'component-btn'} onClick={() => chooseComponent(index)}>
                <span className="component-dot" />
                <span><b>{item.name}</b><small>{item.purpose}</small></span>
              </button>
            ))}
          </div>
        </aside>

        <div className="radiant-viewer">
          <Boiler3D
            mode={study.mode}
            selected={study.name}
            labels
            flow={systemId === 'combustion' || systemId === 'waterSteam'}
            explode={false}
            contextMode="focus"
            cameraCommand={cameraCommand}
            onSelect={(name) => {
              const i = system.components.findIndex(item => item.name === name);
              if (i >= 0) chooseComponent(i);
            }}
          />
          <div className="viewer-kicker"><i /> COMPONENTS 3D <span>Selected equipment remains inside boiler context</span></div>
          <div className="radiant-view-state"><span>{system.title.toUpperCase()}</span><b>{study.name}</b></div>

          <div className="study-mobile-actions operation-mobile-actions">
            <button disabled={componentIndex === 0} onClick={() => chooseComponent(Math.max(0, componentIndex - 1))}>← Previous</button>
            <button className="active" onClick={() => setMobileOpen(true)}>Component</button>
            <button disabled={componentIndex === system.components.length - 1} onClick={() => chooseComponent(Math.min(system.components.length - 1, componentIndex + 1))}>Next →</button>
          </div>

          <section className={`study-mobile-sheet ${mobileOpen ? 'open' : ''}`}>
            <button className="study-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close component details"><X size={18} /></button>
            <span className="sheet-eyebrow">{system.title}</span>
            <h3>{study.name}</h3>
            <p>{study.purpose}</p>
            <span className="sheet-subhead">OPERATOR WATCH</span>
            <ul>{study.watch.map(item => <li key={item}>{item}</li>)}</ul>
            <span className="sheet-subhead">COMMON FAILURE / DEGRADATION</span>
            <ul>{study.failure.map(item => <li key={item}>{item}</li>)}</ul>
          </section>
        </div>

        <aside className="radiant-tech">
          <div className="radiant-tech-head">
            <span>{system.title}</span>
            <h2>{study.name}</h2>
            <p>{study.purpose}</p>
          </div>

          <section className="radiant-tech-section">
            <span>OPERATOR WATCH</span>
            <ul>{study.watch.map(item => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="radiant-tech-section">
            <span>COMMON FAILURE / DEGRADATION</span>
            <ul>{study.failure.map(item => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="radiant-tech-section">
            <span>SYSTEM RELATIONSHIP</span>
            <p>{system.short}</p>
          </section>

          <div className="radiant-warning">
            <ShieldCheck size={18} />
            <p><b>Component study is contextual.</b><br />The 3D model deliberately keeps surrounding boiler geometry visible so the learner sees how each component connects to combustion, water/steam inventory and protection functions.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
