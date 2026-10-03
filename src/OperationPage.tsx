import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Flame, Gauge, ShieldAlert, Waves, X } from 'lucide-react';
import Boiler3D from './Boiler3D';
import GlobalNavigation, { type NavigationTarget } from './GlobalNavigation';
import type { CameraCommand, ContextMode, ViewMode } from './modelTypes';

type Props = {
  onBack: () => void;
  onNavigate: (target: NavigationTarget) => void;
};

type OperationStage = {
  id: string;
  title: string;
  short: string;
  component: string;
  mode: ViewMode;
  context: ContextMode;
  flow: boolean;
  objective: string;
  sourceSequence: string[];
  operatorFocus: string[];
  caution: string;
};

const stages: OperationStage[] = [
  {
    id: 'prestart',
    title: 'Pre-Start Readiness',
    short: 'Water, isolation and fuel-path readiness',
    component: 'Level Gauge',
    mode: 'normal',
    context: 'focus',
    flow: false,
    objective: 'Establish the basic conditions required before the automatic light-off sequence begins.',
    sourceSequence: [
      'Fill the boiler with water using the normal filling arrangement.',
      'Confirm fuel-line valves required for startup are ready/open as defined by the operating procedure.',
      'The source sequence calls for the main steam valve to be closed during startup.',
      'Confirm water-level indication and protective controls are available.',
    ],
    operatorFocus: ['Water level', 'Feedwater availability', 'Fuel-path readiness', 'Steam isolation', 'No unresolved trip/alarm'],
    caution: 'This screen summarizes the provided training material. The actual pre-start checklist and permissives must come from the installed boiler BMS, OEM documentation and site procedures.',
  },
  {
    id: 'purge',
    title: 'Pre-Purge',
    short: 'Blower clears the furnace before fuel admission',
    component: 'Burner & Ignition',
    mode: 'cutaway',
    context: 'focus',
    flow: true,
    objective: 'Remove residual combustible gas or fuel from the furnace/gas path before ignition.',
    sourceSequence: [
      'Put the boiler in the startup/run sequence.',
      'The source describes the blower operating before ignition to purge the furnace.',
      'Its example purge duration is approximately 45 seconds to 2 minutes.',
      'Fuel ignition should not proceed until the purge/permissive sequence is satisfied.',
    ],
    operatorFocus: ['Blower operation', 'Air path', 'Purge permissive', 'No flame before fuel admission'],
    caution: 'Do not use the example purge time as a field setpoint. Required airflow, volume changes and purge duration are boiler/BMS-specific.',
  },
  {
    id: 'ignition',
    title: 'Ignition',
    short: 'Pilot / initial fuel and ignition',
    component: 'Burner & Ignition',
    mode: 'cutaway',
    context: 'focus',
    flow: true,
    objective: 'Establish the initial flame under the burner-management sequence.',
    sourceSequence: [
      'The control sequence opens the initial/sub fuel valve and energizes ignition.',
      'The flame detector must confirm that ignition occurred.',
      'The provided material uses a maximum example of 10 seconds for flame confirmation.',
      'If flame is not confirmed, the source sequence trips the boiler and gives an alarm.',
    ],
    operatorFocus: ['Visible flame where safe/available', 'Flame detector indication', 'Ignition timing', 'Trip/alarm behavior'],
    caution: 'Never bypass flame supervision or repeat light-off outside the approved BMS sequence.',
  },
  {
    id: 'mainflame',
    title: 'Main Flame Established',
    short: 'Main fuel admitted after flame proof',
    component: 'Furnace Tube',
    mode: 'cutaway',
    context: 'focus',
    flow: true,
    objective: 'Continue controlled firing only after the flame-proving condition has been met.',
    sourceSequence: [
      'Once the flame detector confirms ignition, the sequence can admit main fuel.',
      'The boiler then continues automatic operation under pressure and level controls.',
      'The operator should confirm stable flame and normal response of the boiler.',
    ],
    operatorFocus: ['Flame stability', 'Furnace condition', 'Water level', 'Pressure rise', 'No abnormal smoke/noise'],
    caution: 'Fuel admission logic and valve proving vary by burner-management system. The actual cause-and-effect must be used in the field.',
  },
  {
    id: 'warmup',
    title: 'Cold Start / Warm-Up',
    short: 'Manage thermal expansion and pressure rise',
    component: 'Boiler Shell',
    mode: 'xray',
    context: 'focus',
    flow: true,
    objective: 'Bring a cold boiler toward operating temperature and pressure without excessive thermal/mechanical stress.',
    sourceSequence: [
      'The material links boiler life to the number and severity of cold starts.',
      'It recommends starting at pilot/low flame or the minimum firing condition.',
      'Its example cold-start routine uses staged firing periods, pauses, and down-blow steps while progressively increasing run time.',
      'The training text states that a slower rise from cold condition improves life compared with rapid heat-up.',
    ],
    operatorFocus: ['Pressure rise rate', 'Water level', 'Shell temperature behavior', 'Expansion/noise', 'Blowdown actions only per approved procedure'],
    caution: 'The staged cold-start routine in the source is a training example, not a universal startup curve. Use the manufacturer/site warm-up rate for the installed boiler.',
  },
  {
    id: 'normal',
    title: 'Normal Operation',
    short: 'Level, pressure, combustion and steam demand',
    component: 'Water Space',
    mode: 'xray',
    context: 'full',
    flow: true,
    objective: 'Maintain stable steam production while protective systems remain available.',
    sourceSequence: [
      'Maintain boiler water level within the permitted range.',
      'Level controls should start/stop feedwater as required.',
      'Operating pressure control cycles or stages the firing system as designed.',
      'High-pressure and low-water protective functions remain independent safeguards.',
    ],
    operatorFocus: ['Gauge-glass level', 'Feedwater pump response', 'Steam pressure', 'Burner condition', 'Stack condition', 'Water chemistry/TDS'],
    caution: 'Normal values and alarm limits are unit-specific. This Atlas deliberately does not invent universal operating setpoints.',
  },
  {
    id: 'shutdown',
    title: 'Shutdown & Securing',
    short: 'Remove firing and leave the boiler in a safe state',
    component: 'Burner & Ignition',
    mode: 'normal',
    context: 'full',
    flow: false,
    objective: 'Stop firing in the approved sequence and leave the boiler aligned for the required shutdown condition.',
    sourceSequence: [
      'Remove firing through the normal control sequence.',
      'Maintain water-level awareness while pressure and temperature decay.',
      'Isolation, venting, draining or opening of the boiler depends on whether the shutdown is hot standby, short-term, or maintenance.',
    ],
    operatorFocus: ['Flame off confirmation', 'Pressure decay', 'Water level', 'Steam isolation', 'Required vent/drain alignment'],
    caution: 'The supplied source does not provide one complete universal shutdown procedure. Follow the actual boiler shutdown and lockout procedure.',
  },
];

export default function OperationPage({ onBack, onNavigate }: Props) {
  const [stageIndex, setStageIndex] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({ id: 1, action: 'fitBoiler' });
  const stage = stages[stageIndex];

  const status = useMemo(() => {
    if (stage.id === 'prestart') return ['WATER: CHECK', 'FUEL: READY', 'STEAM: ISOLATED'];
    if (stage.id === 'purge') return ['BLOWER: RUN', 'FUEL: CLOSED', 'PURGE: IN PROGRESS'];
    if (stage.id === 'ignition') return ['IGNITION: ACTIVE', 'FLAME: PROVING', 'MAIN FUEL: HELD'];
    if (stage.id === 'mainflame') return ['FLAME: PROVED', 'MAIN FUEL: ENABLED', 'PRESSURE: RISING'];
    if (stage.id === 'warmup') return ['FIRING: MIN / LOW', 'LEVEL: MONITOR', 'WARM-UP: CONTROLLED'];
    if (stage.id === 'normal') return ['LEVEL: CONTROL', 'PRESSURE: CONTROL', 'STEAM: ONLINE'];
    return ['FIRING: OFF', 'PRESSURE: DECAY', 'UNIT: SECURING'];
  }, [stage.id]);

  const selectStage = (index: number) => {
    setStageIndex(index);
    setCameraCommand(current => ({ id: current.id + 1, action: 'fitComponent', component: stages[index].component }));
  };

  return (
    <main className="app-shell">
      <header className="atlas-topbar burner-topbar">
        <button className="back-atlas" onClick={onBack}><ArrowLeft size={16} /> Back to Atlas</button>
        <div className="brand-lockup">
          <strong>BOILER <em>ATLAS</em></strong>
          <span>OPERATION JOURNEY</span>
        </div>
        <GlobalNavigation active="operation" onNavigate={onNavigate} className="burner-nav" />
      </header>

      <section className="burner-contextbar">
        <div><span>OPERATING STATE JOURNEY</span><strong>{stage.title}</strong></div>
        <p>Training sequence · Verify against actual BMS/OEM/site procedure</p>
      </section>

      <section className="burner-workspace">
        <aside className="burner-left">
          <div className="burner-title-block">
            <span>BOILER STARTUP TO SHUTDOWN</span>
            <h1>{stage.title}</h1>
            <p>{stage.short}</p>
          </div>

          <div className="burner-study-tabs">
            {stages.map((item, index) => (
              <button key={item.id} className={stageIndex === index ? 'active' : ''} onClick={() => selectStage(index)}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <span><strong>{item.title}</strong><small>{item.short}</small></span>
              </button>
            ))}
          </div>
        </aside>

        <div className="burner-viewer">
          <Boiler3D
            mode={stage.mode}
            selected={stage.component}
            labels
            flow={stage.flow}
            combustionState={stage.id === 'ignition' ? 'pilot' : ['prestart','purge','shutdown'].includes(stage.id) ? 'off' : 'firing'}
            explode={false}
            contextMode={stage.context}
            cameraCommand={cameraCommand}
            onSelect={() => undefined}
          />

          <div className="viewer-kicker"><i /> OPERATION 3D <span>Current stage highlights the system most relevant to the operating state</span></div>
          <div className="burner-view-state"><span>ACTIVE OPERATING STATE</span><b>{stage.title}</b></div>
          <div className="burner-flow-legend">
            <span className="air"><Waves size={11} /> WATER / AIR</span>
            <span className="fuel"><Flame size={11} /> FIRING</span>
            <span className="hot"><Gauge size={11} /> PRESSURE</span>
          </div>

          <div className="burner-center-tabs">
            {status.map(item => <button key={item} className="active">{item}</button>)}
          </div>

          <div className="study-mobile-actions operation-mobile-actions">
            <button disabled={stageIndex === 0} onClick={() => selectStage(Math.max(0, stageIndex - 1))}>← Previous</button>
            <button className="active" onClick={() => setMobileOpen(true)}>Stage Details</button>
            <button disabled={stageIndex === stages.length - 1} onClick={() => selectStage(Math.min(stages.length - 1, stageIndex + 1))}>Next →</button>
          </div>

          <section className={`study-mobile-sheet operation-mobile-sheet ${mobileOpen ? 'open' : ''}`}>
            <button className="study-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close operation details"><X size={18} /></button>
            <span className="sheet-eyebrow">OPERATING STATE {stageIndex + 1} / {stages.length}</span>
            <h3>{stage.title}</h3>
            <p>{stage.objective}</p>
            <span className="sheet-subhead">SOURCE SEQUENCE</span>
            <ul>{stage.sourceSequence.map(item => <li key={item}>{item}</li>)}</ul>
            <span className="sheet-subhead">OPERATOR FOCUS</span>
            <ul>{stage.operatorFocus.map(item => <li key={item}>{item}</li>)}</ul>
            <p className="sheet-note"><b>Training boundary:</b> {stage.caution}</p>
          </section>
        </div>

        <aside className="burner-tech">
          <div className="burner-tech-head">
            <span>STAGE OBJECTIVE</span>
            <h2>{stage.title}</h2>
            <p>{stage.objective}</p>
          </div>

          <section className="burner-tech-section">
            <span>SOURCE SEQUENCE</span>
            <ul>{stage.sourceSequence.map(item => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="burner-tech-section">
            <span>OPERATOR FOCUS</span>
            <ul>{stage.operatorFocus.map(item => <li key={item}>{item}</li>)}</ul>
          </section>

          <div className="burner-warning">
            <ShieldAlert size={19} />
            <p><b>Training boundary</b><br />{stage.caution}</p>
          </div>

          <div className="burner-path">
            <span>OPERATING JOURNEY</span>
            <div>
              {stages.map((item, index) => <span key={item.id}>{index + 1}. {item.title}{index < stages.length - 1 ? <i>→</i> : null}</span>)}
            </div>
          </div>

          <div className="heat-construction-note">
            <CheckCircle2 size={18} />
            <div><b>PROTECTIVE FUNCTIONS STAY ACTIVE</b><p>Water-level protection, flame supervision, operating pressure control, high-pressure trip and the mechanical safety valve are separate layers. The exact architecture depends on the installed boiler.</p></div>
          </div>
        </aside>
      </section>
    </main>
  );
}
