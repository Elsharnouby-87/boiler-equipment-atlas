import { useMemo, useState } from 'react';
import { ArrowLeft, CircleAlert, Flame, Gauge, ShieldCheck, Waves } from 'lucide-react';
import Boiler3D from './Boiler3D';
import GlobalNavigation, { type NavigationTarget } from './GlobalNavigation';
import type { CameraCommand, ViewMode } from './modelTypes';

type Props = {
  onBack: () => void;
  onNavigate: (target: NavigationTarget) => void;
};

type Scenario = {
  id: string;
  title: string;
  short: string;
  component: string;
  mode: ViewMode;
  severity: 'Trip / Critical' | 'High Attention' | 'Performance';
  symptoms: string[];
  likely: string[];
  protection: string[];
  checks: string[];
  sourceBoundary: string;
};

const scenarios: Scenario[] = [
  {
    id: 'lowWater',
    title: 'Low Water Level',
    short: 'Level falls below the safe operating range',
    component: 'Level Sensors',
    mode: 'xray',
    severity: 'Trip / Critical',
    symptoms: [
      'Gauge glass shows falling or abnormal level.',
      'Feed pump may be running continuously or failing to restore level.',
      'Low-water alarm/trip may activate.',
    ],
    likely: [
      'Feedwater pump unavailable or not delivering.',
      'Closed/blocked feedwater path or strainer.',
      'Level-sensor or gauge-glass problem.',
      'Steam demand or loss exceeding feedwater replacement.',
    ],
    protection: [
      'The supplied training material describes low-level protection that stops the boiler at a dangerous water level.',
      'It also describes automatic pump start/stop from level controls.',
      'Restart after a protective trip requires reset only after the cause and safe level are restored.',
    ],
    checks: [
      'Cross-check gauge glass and automatic level indication.',
      'Check feedwater pump response and valve alignment.',
      'Check for blocked gauge-glass connections or abnormal bubbling.',
      'Treat an unexplained low-level trip as a protection event, not as an instrument nuisance.',
    ],
    sourceBoundary: 'Exact low-water trip points and recovery actions are boiler-specific and are not defined universally by the project source.',
  },
  {
    id: 'highPressure',
    title: 'High Steam Pressure',
    short: 'Pressure rises beyond normal control range',
    component: 'Pressure Controls',
    mode: 'normal',
    severity: 'Trip / Critical',
    symptoms: [
      'Pressure continues rising after the normal operating cut-out point.',
      'High-pressure alarm/trip may occur.',
      'Safety valve may lift if pressure reaches its set point.',
    ],
    likely: [
      'Operating pressure switch/control failure or incorrect setting.',
      'Burner firing does not reduce/stop when demanded.',
      'Blocked or faulty pressure sensing connection.',
      'Sudden reduction in steam demand.',
    ],
    protection: [
      'The source describes an operating pressure control and a separate high-pressure shutdown.',
      'It also describes the safety valve as the mechanical overpressure relief device.',
      'The high-pressure control is described as being set below the safety-valve opening pressure in the training example.',
    ],
    checks: [
      'Compare pressure indication with the pressure-control response.',
      'Confirm firing reduces/stops through the normal control logic.',
      'Investigate repeated safety-valve lifting as a control or process problem.',
      'Do not use the safety valve as routine pressure control.',
    ],
    sourceBoundary: 'Pressure set points shown in training examples are not transferable to another boiler.',
  },
  {
    id: 'flameFailure',
    title: 'Ignition / Flame Failure',
    short: 'Flame is not established or is lost',
    component: 'Burner & Ignition',
    mode: 'cutaway',
    severity: 'Trip / Critical',
    symptoms: [
      'Ignition sequence starts but flame is not proved.',
      'Flame detector does not confirm ignition.',
      'Boiler trips and alarm is generated in the described sequence.',
    ],
    likely: [
      'Fuel not reaching the burner.',
      'Ignition hardware fault.',
      'Flame detector dirty, misaligned or faulty.',
      'Air/fuel condition outside the stable ignition range.',
    ],
    protection: [
      'The project source requires flame confirmation before main fuel admission.',
      'If flame is not confirmed in the allowed proving period, the source sequence trips the boiler.',
      'A fresh light-off must only follow the approved purge and BMS sequence.',
    ],
    checks: [
      'Confirm fuel-path readiness and burner conditions.',
      'Inspect ignition and flame-sensing hardware.',
      'Verify purge and permissive sequence completion.',
      'Do not bypass flame supervision or hold a fuel valve open manually.',
    ],
    sourceBoundary: 'The source gives an example flame-proving time; the installed BMS timing and cause-and-effect govern the actual unit.',
  },
  {
    id: 'feedFailure',
    title: 'Feedwater Failure',
    short: 'Pump or feed path cannot maintain boiler water level',
    component: 'Feedwater Inlet',
    mode: 'xray',
    severity: 'High Attention',
    symptoms: [
      'Level falls despite a pump demand.',
      'Pump runs but little/no level recovery is visible.',
      'Abnormal hot-water return toward the deaerator may indicate a check-valve problem in the source description.',
    ],
    likely: [
      'Feedwater pump malfunction.',
      'Air in the pump.',
      'Closed isolation valve.',
      'Blocked strainer.',
      'Non-return/check valve leakage or failure.',
    ],
    protection: [
      'Level control should demand feedwater as level falls.',
      'If level reaches the protective low level, the boiler should trip according to the protection logic.',
    ],
    checks: [
      'Verify actual pump operation, not only the run indication.',
      'Check the feedwater isolation path and strainer.',
      'Check non-return valve behavior.',
      'Cross-check boiler level with the gauge glass.',
    ],
    sourceBoundary: 'Pump curves, minimum flow and deaerator conditions are outside the supplied training material and must come from the plant design.',
  },
  {
    id: 'falseLevel',
    title: 'Unstable / False Level Indication',
    short: 'Gauge glass or level control does not represent the actual inventory',
    component: 'Level Gauge',
    mode: 'normal',
    severity: 'High Attention',
    symptoms: [
      'Excessive bubbling in the gauge glass.',
      'Automatic level indication and gauge-glass level disagree.',
      'Low-level alarm may occur even though actual water inventory appears normal.',
    ],
    likely: [
      'Cold feedwater or steam demand above boiler capacity can increase bubbling according to the source.',
      'Blocked gauge-glass connection.',
      'Feedwater pump or valve problem.',
      'Air in the feedwater pump.',
    ],
    protection: [
      'Treat level disagreement conservatively until the true boiler level is established.',
      'The source includes routine gauge-glass draining/blow-through checks as part of maintenance/verification.',
    ],
    checks: [
      'Compare independent level indications.',
      'Check gauge-glass upper and lower connections for restriction.',
      'Check feedwater system response.',
      'Do not defeat low-level protection because an indication is suspected.',
    ],
    sourceBoundary: 'The project source describes causes and checks but does not replace the installed boiler’s formal gauge-glass test procedure.',
  },
  {
    id: 'scale',
    title: 'Scale / Deposit Build-Up',
    short: 'Water-side deposits reduce heat transfer',
    component: 'Fire Tubes',
    mode: 'cutaway',
    severity: 'Performance',
    symptoms: [
      'Reduced heat-transfer efficiency.',
      'Higher fuel demand for the same steam duty.',
      'Possible tube blockage or localized overheating as deposits accumulate.',
    ],
    likely: [
      'Hardness/mineral carry-in with make-up water.',
      'Poor water-treatment control.',
      'Inadequate blowdown/TDS management.',
    ],
    protection: [
      'The source emphasizes water treatment and blowdown as controls for dissolved/settled solids.',
      'It identifies deposit formation as a cause of tube blockage and reduced heat transfer.',
    ],
    checks: [
      'Review water chemistry and conductivity/TDS trend.',
      'Review blowdown practice.',
      'Inspect accessible waterside/gas-side surfaces during shutdown.',
      'Assess heat-transfer performance and stack-temperature trend.',
    ],
    sourceBoundary: 'Chemical targets must be taken from the actual boiler-water treatment program; the Atlas does not impose universal chemistry limits.',
  },
  {
    id: 'soot',
    title: 'Soot / Gas-Side Fouling',
    short: 'Combustion deposits restrict heat transfer and gas flow',
    component: 'Fire Tubes',
    mode: 'cutaway',
    severity: 'Performance',
    symptoms: [
      'Higher stack temperature for similar load.',
      'Reduced efficiency or slower steam response.',
      'Visible soot during gas-side inspection.',
    ],
    likely: [
      'Poor combustion quality.',
      'Insufficient cleaning.',
      'Fuel or burner condition contributing to incomplete combustion.',
    ],
    protection: [
      'Performance degradation should be addressed before gas-path restriction or overheating becomes severe.',
    ],
    checks: [
      'Review burner condition and flame appearance.',
      'Trend stack temperature and fuel use.',
      'Inspect fire tubes and smokeboxes when safely available.',
      'Use approved cleaning and combustion-tuning procedures.',
    ],
    sourceBoundary: 'The supplied boiler material discusses cleanliness and efficiency at a training level; detailed combustion tuning requires burner/OEM data.',
  },
];

export default function TroubleshootingPage({ onBack, onNavigate }: Props) {
  const [index, setIndex] = useState(0);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({ id: 1, action: 'fitComponent', component: scenarios[0].component });
  const scenario = scenarios[index];

  const badgeClass = useMemo(() => scenario.severity === 'Trip / Critical' ? 'danger' : '', [scenario.severity]);

  const choose = (next: number) => {
    setIndex(next);
    setCameraCommand(current => ({ id: current.id + 1, action: 'fitComponent', component: scenarios[next].component }));
  };

  return (
    <main className="app-shell">
      <header className="atlas-topbar burner-topbar">
        <button className="back-atlas" onClick={onBack}><ArrowLeft size={16} /> Back to Atlas</button>
        <div className="brand-lockup">
          <strong>BOILER <em>ATLAS</em></strong>
          <span>TROUBLESHOOTING</span>
        </div>
        <GlobalNavigation active="troubleshooting" onNavigate={onNavigate} className="burner-nav" />
      </header>

      <section className="burner-contextbar">
        <div><span>DIAGNOSTIC LEARNING</span><strong>{scenario.title}</strong></div>
        <p>Symptoms → likely causes → protection → checks</p>
      </section>

      <section className="burner-workspace">
        <aside className="burner-left">
          <div className="burner-title-block">
            <span>SCENARIO LIBRARY</span>
            <h1>Boiler Faults</h1>
            <p>Select a scenario to connect visible symptoms with the relevant component and protection layer.</p>
          </div>

          <div className="burner-study-tabs">
            {scenarios.map((item, i) => (
              <button key={item.id} className={index === i ? 'active' : ''} onClick={() => choose(i)}>
                <b>{String(i + 1).padStart(2, '0')}</b>
                <span><strong>{item.title}</strong><small>{item.short}</small></span>
              </button>
            ))}
          </div>
        </aside>

        <div className="burner-viewer">
          <Boiler3D
            mode={scenario.mode}
            selected={scenario.component}
            labels
            flow={scenario.id === 'flameFailure' || scenario.id === 'soot'}
            explode={false}
            contextMode="focus"
            cameraCommand={cameraCommand}
            onSelect={() => undefined}
          />
          <div className="viewer-kicker"><i /> TROUBLESHOOTING 3D <span>Relevant system highlighted in boiler context</span></div>
          <div className="burner-view-state"><span>ACTIVE SCENARIO</span><b>{scenario.title}</b></div>
          <div className="burner-flow-legend">
            <span className="air"><Waves size={11} /> PROCESS</span>
            <span className="fuel"><Flame size={11} /> COMBUSTION</span>
            <span className="hot"><Gauge size={11} /> PROTECTION</span>
          </div>
        </div>

        <aside className="burner-tech">
          <div className="burner-tech-head">
            <span>{scenario.severity}</span>
            <h2>{scenario.title}</h2>
            <p>{scenario.short}</p>
          </div>

          <section className="burner-tech-section">
            <span>WHAT YOU MAY SEE</span>
            <ul>{scenario.symptoms.map(item => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="burner-tech-section">
            <span>LIKELY AREAS TO INVESTIGATE</span>
            <ul>{scenario.likely.map(item => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="burner-tech-section">
            <span>PROTECTION RESPONSE</span>
            <ul>{scenario.protection.map(item => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="burner-tech-section">
            <span>SAFE DIAGNOSTIC FOCUS</span>
            <ul>{scenario.checks.map(item => <li key={item}>{item}</li>)}</ul>
          </section>

          <div className="burner-warning">
            <CircleAlert size={19} />
            <p><b>Do not defeat protection to diagnose a trip.</b><br />{scenario.sourceBoundary}</p>
          </div>

          <div className="heat-construction-note">
            <ShieldCheck size={18} />
            <div><b>DIAGNOSTIC ORDER</b><p>Confirm the physical condition first, cross-check independent indications, then investigate instruments and controls. A protection trip is evidence to be understood, not bypassed.</p></div>
          </div>

          <div className="radiant-scenario-chips">
            <button className={badgeClass}>Severity · {scenario.severity}</button>
            <button className="active">Focus · {scenario.component}</button>
          </div>
        </aside>
      </section>
    </main>
  );
}
