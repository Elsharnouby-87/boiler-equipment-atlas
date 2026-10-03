import { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Eye,
  EyeOff,
  Flame,
  Focus,
  Info,
  Layers3,
  Maximize2,
  Menu,
  Rotate3D,
  ScanLine,
  Search,
  Waves,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import Boiler3D from './Boiler3D';
import BoilerTypesPage from './BoilerTypesPage';
import ComponentsPage from './ComponentsPage';
import OperationPage from './OperationPage';
import TroubleshootingPage from './TroubleshootingPage';
import GlobalNavigation from './GlobalNavigation';
import type { NavigationTarget } from './GlobalNavigation';
import type { CameraAction, CameraCommand, ContextMode, ViewMode } from './modelTypes';

type Detail = {
  group: string;
  location: string;
  summary: string;
  function: string;
  why: string;
  observe: string[];
  issues: string[];
  inspection: string[];
  related: string[];
};

const componentGroups = [
  { label: 'Combustion & Gas Path', components: ['Burner & Ignition', 'Furnace Tube', 'Fire Tubes', 'Front Smokebox', 'Rear Smokebox', 'Economizer', 'Stack / Flue Outlet'] },
  { label: 'Pressure Vessel', components: ['Boiler Shell', 'Tube Sheets'] },
  { label: 'Water & Steam', components: ['Water Space', 'Steam Space', 'Feedwater Inlet', 'Steam Outlet'] },
  { label: 'Safety & Controls', components: ['Level Gauge', 'Level Sensors', 'Pressure Controls', 'Safety Valve'] },
  { label: 'Blowdown', components: ['Blowdown Valve'] },
];

const details: Record<string, Detail> = {
  'Boiler Shell': {
    group: 'Pressure Vessel',
    location: 'Main horizontal pressure-containing body surrounding the water, steam and fire-side internals.',
    summary: 'The principal boiler body. In this training model it represents a horizontal fire-tube boiler pressure shell.',
    function: 'Contains the working water and steam inventory while supporting the internal furnace, fire tubes and boiler fittings.',
    why: 'Its integrity defines the pressure boundary. External condition, insulation and leakage indications therefore matter to safe operation.',
    observe: ['External leakage or wet areas', 'Abnormal vibration or movement', 'Insulation/casing condition', 'Any abnormal hot area'],
    issues: ['External corrosion', 'Leakage', 'Thermal stress during rapid cold starts', 'Insulation deterioration'],
    inspection: ['Shell surface and seams', 'Nozzles and connections', 'Support saddles', 'Accessible pressure-boundary areas'],
    related: ['Water Space', 'Steam Space', 'Tube Sheets', 'Safety Valve'],
  },
  'Burner & Ignition': {
    group: 'Combustion & Gas Path',
    location: 'Mounted on the front smokebox door and aligned through the refractory throat into the furnace tube.',
    summary: 'Complete burner package showing the combustion-air windbox/register, main fuel gun and nozzle, pilot burner, ignition hardware, flame scanner and blower relationship.',
    function: 'Supplies combustion air and fuel, establishes the pilot/ignition condition, proves flame through the scanner, then supports stable main firing into the furnace.',
    why: 'The burner package combines several separate functions: purge air, fuel admission, ignition, pilot support and flame supervision. Their physical relationship is now visible in the 3D focus view.',
    observe: ['Blower and air-register path', 'Pilot burner and pilot gas line', 'Main fuel gun/nozzle alignment', 'Ignition electrode condition/gap', 'Flame-scanner sight path', 'Stable visible flame and correct sequence'],
    issues: ['Ignition electrode fouling or poor gap', 'Fuel nozzle restriction', 'Pilot or main fuel admission fault', 'Flame-scanner contamination/misalignment', 'Poor air/fuel condition', 'Blower or air-path restriction'],
    inspection: ['Main burner body/windbox', 'Air register vanes', 'Pilot burner and pilot line', 'Ignition transformer/electrode', 'Main fuel nozzle and solenoid', 'Flame scanner and observation window', 'Burner throat/refractory interface'],
    related: ['Front Smokebox', 'Furnace Tube', 'Pressure Controls', 'Level Sensors'],
  },
  'Furnace Tube': {
    group: 'Combustion & Gas Path',
    location: 'Large internal tube aligned with the burner through the lower part of the boiler.',
    summary: 'Primary combustion chamber of the fire-tube boiler.',
    function: 'Receives the burner flame and hot combustion gases before they continue through the boiler gas path.',
    why: 'It is the highest-temperature internal gas-side region and directly couples combustion heat to the surrounding boiler water.',
    observe: ['Flame position', 'Signs of overheating', 'Soot or fouling', 'Unusual furnace noise'],
    issues: ['Soot deposition', 'Thermal stress', 'Poor combustion', 'Localized overheating'],
    inspection: ['Accessible furnace surface', 'Burner throat', 'Front and rear transitions', 'Gas-side cleanliness'],
    related: ['Burner & Ignition', 'Water Space', 'Fire Tubes'],
  },
  'Fire Tubes': {
    group: 'Combustion & Gas Path',
    location: 'Tube bundle running through the water-filled boiler shell.',
    summary: 'Two distinct fire-tube banks forming the second and third gas passes of the schematic three-pass boiler.',
    function: 'Pass 2 carries combustion gas from the rear turnaround chamber back toward the front smokebox; Pass 3 then carries it from the front turnaround chamber back to the rear before the economizer and stack.',
    why: 'Separating the second and third passes makes the real gas-flow direction visible and helps explain why tube cleanliness, pass restriction and turnaround-chamber condition affect heat transfer and draft.',
    observe: ['Gas-side fouling', 'Restricted gas path', 'Leak indications', 'Abnormal stack temperature trend'],
    issues: ['Soot/fouling', 'Scale-related poor heat transfer on the water side', 'Tube leakage', 'Blockage'],
    inspection: ['Tube cleanliness', 'Tube ends', 'Accessible tube surfaces', 'Leakage evidence'],
    related: ['Tube Sheets', 'Water Space', 'Rear Smokebox'],
  },
  'Tube Sheets': {
    group: 'Pressure Vessel',
    location: 'At the front and rear ends of the fire-tube bundle.',
    summary: 'End plates that locate the furnace and fire-tube penetrations.',
    function: 'Support and seal the tube bundle at the boiler ends.',
    why: 'Tube-end and tube-sheet condition influences pressure-boundary integrity and tube leakage risk.',
    observe: ['Leakage around tube ends', 'Corrosion', 'Deposits', 'Distortion'],
    issues: ['Tube-end leakage', 'Corrosion', 'Thermal stress', 'Deposit accumulation'],
    inspection: ['Tube-to-sheet regions', 'Visible plate surfaces', 'Accessible end connections'],
    related: ['Fire Tubes', 'Boiler Shell', 'Front Smokebox', 'Rear Smokebox'],
  },
  'Water Space': {
    group: 'Water & Steam',
    location: 'Lower and middle part of the boiler shell around the furnace and fire tubes.',
    summary: 'Stored boiler water that absorbs heat and produces steam.',
    function: 'Provides the water inventory needed for steam generation and cools the heated pressure parts by receiving transferred heat.',
    why: 'Correct water level is a primary operating requirement. Low water can expose heated surfaces to inadequate cooling.',
    observe: ['Level indication', 'Feedwater response', 'Foaming or unstable level', 'Water chemistry and TDS trend'],
    issues: ['Low level', 'High level', 'Foaming/false indication', 'Scale and dissolved-solids buildup'],
    inspection: ['Level instruments', 'Feedwater path', 'Blowdown path', 'Water sampling points where provided'],
    related: ['Level Gauge', 'Level Sensors', 'Feedwater Inlet', 'Blowdown Valve'],
  },
  'Steam Space': {
    group: 'Water & Steam',
    location: 'Upper part of the boiler shell above the working water level.',
    summary: 'Vapor space where generated steam separates from the boiler water before leaving the boiler.',
    function: 'Collects generated steam and supplies it to the steam outlet.',
    why: 'Stable steam pressure and water level help maintain reliable steam delivery without excessive carryover.',
    observe: ['Steam pressure', 'Water-level stability', 'Steam demand changes', 'Abnormal priming/carryover indications'],
    issues: ['Pressure instability', 'High-water carryover risk', 'Rapid load-change effects'],
    inspection: ['Steam outlet connection', 'Pressure instruments', 'Safety valve connection'],
    related: ['Steam Outlet', 'Pressure Controls', 'Safety Valve', 'Water Space'],
  },
  'Feedwater Inlet': {
    group: 'Water & Steam',
    location: 'Water feed connection into the boiler shell.',
    summary: 'Feedwater path supplying replacement water to the boiler.',
    function: 'Admits feedwater under control of the level system. The source material also identifies a non-return valve to prevent reverse flow toward the deaerator.',
    why: 'Reliable feedwater supply is essential to maintain safe boiler level as steam is produced.',
    observe: ['Pump start/stop response', 'Feedwater flow', 'Non-return valve behavior', 'Strainer condition'],
    issues: ['Feed pump failure', 'Closed valve', 'Blocked strainer', 'Check-valve leakage or reverse flow'],
    inspection: ['Isolation valve', 'Check valve', 'Strainer', 'Pump discharge connection'],
    related: ['Water Space', 'Level Sensors', 'Level Gauge'],
  },
  'Steam Outlet': {
    group: 'Water & Steam',
    location: 'Top steam connection from the boiler steam space.',
    summary: 'Main steam discharge connection and isolation arrangement.',
    function: 'Transfers generated steam from the boiler into the steam system.',
    why: 'Steam admission should be controlled; abrupt opening can disturb boiler water level and steam quality.',
    observe: ['Pressure response', 'Valve position', 'Leakage', 'Steam-line warm-up behavior'],
    issues: ['Valve leakage', 'Rapid pressure change', 'Water carryover following unstable level'],
    inspection: ['Steam valve', 'Top nozzle', 'Flanges and visible piping'],
    related: ['Steam Space', 'Pressure Controls', 'Safety Valve'],
  },
  'Level Gauge': {
    group: 'Safety & Controls',
    location: 'External boiler-side level indication connected to the water and steam spaces.',
    summary: 'Gauge-glass arrangement used to show boiler water level.',
    function: 'Provides a direct visual indication of water level. The source notes at least two level glasses in the described arrangement.',
    why: 'Operators use level indication to confirm safe inventory and to cross-check automatic level controls.',
    observe: ['Visible level', 'Unexpected bubbles', 'Difference from control indication', 'Blocked gauge connections'],
    issues: ['False level from blocked connections', 'Excessive bubbling', 'Glass leakage', 'Isolation valve problems'],
    inspection: ['Glass condition', 'Upper/lower connections', 'Drain/blow-through valve', 'Isolation valves'],
    related: ['Level Sensors', 'Water Space', 'Feedwater Inlet'],
  },
  'Level Sensors': {
    group: 'Safety & Controls',
    location: 'Upper boiler connections sensing water level.',
    summary: 'Automatic level electrodes/controls associated with feed-pump operation and low-water protection.',
    function: 'Start and stop feedwater as level changes and trip the boiler if level falls to a dangerous value.',
    why: 'Low-water protection is one of the boiler’s critical protective functions.',
    observe: ['Pump cut-in/cut-out', 'Low-level alarm', 'Boiler trip on unsafe level', 'Reset requirement after trip'],
    issues: ['Probe fouling', 'Wiring/relay fault', 'Incorrect level response', 'Nuisance trips from unstable level'],
    inspection: ['Probe connections', 'Relay response', 'Functional low-level test per site procedure'],
    related: ['Level Gauge', 'Feedwater Inlet', 'Burner & Ignition'],
  },
  'Pressure Controls': {
    group: 'Safety & Controls',
    location: 'Pressure sensing connections on the upper boiler/steam space.',
    summary: 'Operating and high-pressure switches/controls used to cycle firing and provide high-pressure shutdown.',
    function: 'Start or stop the boiler at operating pressure limits and provide an independent high-pressure trip. Some arrangements also stage high/low firing.',
    why: 'Pressure controls keep the boiler within its intended operating range before the mechanical safety valve is required.',
    observe: ['Cut-in/cut-out behavior', 'High-pressure alarm/trip', 'Pressure-gauge agreement', 'Burner staging'],
    issues: ['Incorrect setpoint', 'Switch failure', 'Blocked pressure connection', 'Pressure overshoot'],
    inspection: ['Pressure switches', 'Pressure gauge', 'Impulse connections', 'Functional trip test per procedure'],
    related: ['Safety Valve', 'Steam Space', 'Burner & Ignition'],
  },
  'Safety Valve': {
    group: 'Safety & Controls',
    location: 'Top of the boiler steam space.',
    summary: 'Mechanical overpressure protection valve.',
    function: 'Opens at its set pressure to release steam if boiler pressure reaches an unsafe value.',
    why: 'It is the final mechanical pressure-relief layer and must not be treated as a normal pressure-control device.',
    observe: ['Leakage or simmering', 'Unexpected lift', 'Discharge-path condition'],
    issues: ['Valve leakage', 'Sticking', 'Damage or incorrect setting', 'Repeated lifting caused by control problems'],
    inspection: ['Valve body', 'Discharge route', 'Seals/identification', 'Certification and testing per applicable requirements'],
    related: ['Pressure Controls', 'Steam Space', 'Steam Outlet'],
  },
  'Front Smokebox': {
    group: 'Combustion & Gas Path',
    location: 'Front end of the boiler around the burner-side gas transition.',
    summary: 'Front gas-side enclosure and turnaround chamber for the three-pass training model.',
    function: 'Receives gas returning through Pass 2, turns it into the upper Pass 3 tube bank, and provides maintenance access to the front tube ends.',
    why: 'Gas leakage, soot buildup or poor sealing can degrade combustion-side performance and maintenance safety.',
    observe: ['Gas leakage', 'Soot deposits', 'Door/seal condition', 'External hot spots'],
    issues: ['Soot accumulation', 'Seal leakage', 'Door damage'],
    inspection: ['Door and gasket', 'Accessible tube ends', 'Gas-side cleanliness'],
    related: ['Burner & Ignition', 'Fire Tubes', 'Tube Sheets'],
  },
  'Rear Smokebox': {
    group: 'Combustion & Gas Path',
    location: 'Rear end of the fire-tube boiler.',
    summary: 'Rear gas-side turnaround and collection chamber in the three-pass training model.',
    function: 'Receives Pass 1 gas from the furnace and turns it into Pass 2; later it collects gas leaving Pass 3 and directs it to the economizer and flue outlet.',
    why: 'Its cleanliness and sealing influence gas-flow resistance and heat-transfer performance.',
    observe: ['Soot buildup', 'Leakage', 'Abnormal hot spots', 'Restricted gas path'],
    issues: ['Fouling', 'Seal leakage', 'Flow restriction'],
    inspection: ['Rear door/access', 'Tube ends', 'Gas-side deposits'],
    related: ['Fire Tubes', 'Stack / Flue Outlet', 'Tube Sheets'],
  },
  Economizer: {
    group: 'Heat Recovery',
    location: 'In the flue-gas path downstream of the main boiler heat-transfer surfaces and upstream of final gas discharge.',
    summary: 'A feedwater heat-recovery exchanger using remaining flue-gas heat.',
    function: 'Transfers sensible heat from boiler exhaust gas into incoming feedwater before the water enters the boiler.',
    why: 'The supplied training material presents the economizer as a way to raise feedwater temperature, lower exhaust temperature and reduce fuel demand.',
    observe: ['Feedwater inlet/outlet temperature trend', 'Flue-gas temperature trend', 'Leakage', 'Fouling or restriction'],
    issues: ['Gas-side fouling', 'Water-side leakage', 'Corrosion from excessive gas cooling', 'Flow restriction'],
    inspection: ['Casing and access points', 'Tube bank condition where visible', 'Water connections', 'Gas-path cleanliness'],
    related: ['Stack / Flue Outlet', 'Feedwater Inlet', 'Rear Smokebox'],
  },
  'Stack / Flue Outlet': {
    group: 'Combustion & Gas Path',
    location: 'Combustion-gas discharge from the boiler.',
    summary: 'Final flue-gas outlet shown rising from the rear of the training model.',
    function: 'Routes combustion products away from the boiler after useful heat has been transferred.',
    why: 'Stack temperature and visible combustion condition are useful operating indicators of combustion and heat-transfer performance.',
    observe: ['Stack temperature trend', 'Smoke/combustion appearance', 'Draft behavior', 'External condition'],
    issues: ['High stack temperature', 'Soot-related restriction', 'Corrosion', 'Poor draft'],
    inspection: ['Flue connection', 'Stack casing', 'Accessible gas path'],
    related: ['Rear Smokebox', 'Fire Tubes', 'Burner & Ignition'],
  },
  'Blowdown Valve': {
    group: 'Blowdown',
    location: 'Low point of the boiler water space.',
    summary: 'Valve used to discharge boiler water for sediment/TDS control, level reduction, draining and some functional tests.',
    function: 'Removes a controlled quantity of boiler water and associated settled or dissolved contaminants.',
    why: 'Blowdown is part of water-quality control and is also used in defined operating/maintenance procedures.',
    observe: ['Valve leakage', 'Blowdown response', 'TDS/conductivity trend', 'Discharge-system condition'],
    issues: ['Valve passing', 'Blocked discharge', 'Excessive blowdown', 'Inadequate solids control'],
    inspection: ['Valve and line', 'Discharge route', 'Connections to gauge-glass drain where applicable'],
    related: ['Water Space', 'Level Gauge', 'Level Sensors'],
  },
};

const smartMode: Record<string, ViewMode> = {
  'Boiler Shell': 'normal',
  'Front Smokebox': 'normal',
  'Rear Smokebox': 'normal',
  Economizer: 'cutaway',
  'Stack / Flue Outlet': 'normal',
  'Safety Valve': 'normal',
  'Steam Outlet': 'normal',
  'Pressure Controls': 'normal',
  'Feedwater Inlet': 'normal',
  'Blowdown Valve': 'normal',
  'Level Gauge': 'normal',
  'Level Sensors': 'normal',
  'Burner & Ignition': 'cutaway',
  'Furnace Tube': 'cutaway',
  'Fire Tubes': 'cutaway',
  'Tube Sheets': 'cutaway',
  'Water Space': 'xray',
  'Steam Space': 'xray',
};

const componentNames = Object.keys(details);

export default function App() {
  const [activeModule, setActiveModule] = useState<'atlas' | 'components' | 'boilerTypes' | 'operation' | 'troubleshooting'>('atlas');
  const [mode, setMode] = useState<ViewMode>('normal');
  const [selected, setSelected] = useState('Boiler Shell');
  const [labels, setLabels] = useState(false);
  const [flow, setFlow] = useState(false);
  const [explode, setExplode] = useState(false);
  const [contextMode, setContextMode] = useState<ContextMode>('full');
  const [query, setQuery] = useState('');
  const [mobileNavigatorOpen, setMobileNavigatorOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({ id: 0, action: 'fitBoiler' });

  const detail = details[selected] ?? details['Furnace Tube'];

  const issueCameraCommand = useCallback((action: CameraAction, component?: string) => {
    setCameraCommand(current => ({ id: current.id + 1, action, component }));
  }, []);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return componentNames;
    return componentNames.filter(name => {
      const item = details[name];
      return `${name} ${item.group} ${item.location} ${item.summary} ${item.function}`.toLowerCase().includes(q);
    });
  }, [query]);

  const chooseComponent = useCallback((name: string) => {
    if (!details[name]) return;
    setSelected(name);
    setMode(smartMode[name] ?? 'cutaway');
    setExplode(false);
    setContextMode('focus');
    setMobileNavigatorOpen(false);
    setMobileInspectorOpen(true);
    issueCameraCommand('fitComponent', name);
  }, [issueCameraCommand]);

  const showFullBoiler = () => {
    setContextMode('full');
    setExplode(false);
    issueCameraCommand('fitBoiler');
  };

  const focusSelected = () => {
    setMode(smartMode[selected] ?? 'cutaway');
    setExplode(false);
    setContextMode('focus');
    issueCameraCommand('fitComponent', selected);
  };

  const isolateSelected = () => {
    setMode(smartMode[selected] ?? 'cutaway');
    setExplode(false);
    setContextMode('isolate');
    issueCameraCommand('fitComponent', selected);
  };

  const resetAtlas = () => {
    setMode('cutaway');
    setExplode(false);
    setContextMode('full');
    setFlow(false);
    setLabels(true);
    setSelected('Furnace Tube');
    setQuery('');
    issueCameraCommand('reset', 'Furnace Tube');
  };

  const navigateGlobal = useCallback((target: NavigationTarget) => {
    if (target === 'atlas') {
      setActiveModule('atlas');
      return;
    }
    if (target === 'components') {
      setActiveModule('components');
      return;
    }
    if (target === 'boilerTypes') setActiveModule('boilerTypes');
    if (target === 'operation') setActiveModule('operation');
    if (target === 'troubleshooting') setActiveModule('troubleshooting');
  }, []);

  if (activeModule === 'components') return <ComponentsPage onBack={() => setActiveModule('atlas')} onNavigate={navigateGlobal} />;
  if (activeModule === 'boilerTypes') return <BoilerTypesPage onBack={() => setActiveModule('atlas')} onNavigate={navigateGlobal} />;
  if (activeModule === 'operation') return <OperationPage onBack={() => setActiveModule('atlas')} onNavigate={navigateGlobal} />;
  if (activeModule === 'troubleshooting') return <TroubleshootingPage onBack={() => setActiveModule('atlas')} onNavigate={navigateGlobal} />;

  return (
    <main className="app-shell">
      <header className="atlas-topbar">
        <div className="brand-lockup">
          <strong>BOILER <em>ATLAS</em></strong>
          <span>EXPLORE · LEARN · UNDERSTAND</span>
        </div>
        <label className="global-search">
          <Search size={17} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && searchResults[0]) chooseComponent(searchResults[0]); }}
            placeholder="Search boiler components, systems, functions..."
            aria-label="Search boiler components"
          />
        </label>
        <GlobalNavigation active="atlas" onNavigate={navigateGlobal} />
      </header>

      <section className="atlas-contextbar">
        <div><span>INTERACTIVE 3D REFERENCE</span><strong>Industrial Steam Boiler · 3-Pass Fire-Tube Master Model</strong></div>
        <p>Generic industrial training model · Follow site/OEM procedures</p>
      </section>

      <section className="atlas-workspace">
        <aside className={`component-navigator ${mobileNavigatorOpen ? 'mobile-open' : ''}`}>
          <button className="mobile-close" onClick={() => setMobileNavigatorOpen(false)} aria-label="Close component navigator"><X size={16} /></button>
          <label className="mobile-component-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search components..." aria-label="Search components on mobile" /></label>
          <div className="navigator-head">
            <span>COMPONENT NAVIGATOR</span>
            <h2>Boiler Anatomy</h2>
            <p>Select a component. The Atlas keeps enough boiler context visible to show exactly where it belongs.</p>
          </div>

          {query.trim() ? (
            <div className="search-results">
              <p className="navigator-label">Search Results</p>
              {searchResults.length > 0
                ? searchResults.map(name => <button key={name} className={selected === name ? 'component-btn active' : 'component-btn'} onClick={() => chooseComponent(name)}><span className="component-dot" /><span><b>{name}</b><small>{details[name].group}</small></span></button>)
                : <div className="empty-search">No matching component in the current boiler atlas.</div>}
            </div>
          ) : (
            <div className="group-list">
              {componentGroups.map(group => (
                <section className="component-group" key={group.label}>
                  <p className="navigator-label">{group.label}</p>
                  {group.components.map(name => <button key={name} className={selected === name ? 'component-btn active' : 'component-btn'} onClick={() => chooseComponent(name)}><span className="component-dot" /><span><b>{name}</b><small>{details[name].group}</small></span></button>)}
                </section>
              ))}
            </div>
          )}

          <div className="navigator-note">
            <Flame size={17} />
            <p><b>Source-grounded training.</b><br />The learning structure is based on the boiler training material provided for this project, with the master 3D geometry presented schematically for instruction.</p>
          </div>
        </aside>

        <div className="hero-viewer">
          <Boiler3D
            mode={mode}
            selected={selected}
            labels={labels}
            flow={flow}
            explode={explode}
            contextMode={contextMode}
            cameraCommand={cameraCommand}
            onSelect={chooseComponent}
          />
          <div className="viewer-kicker"><i /> ATLAS 3D <span>Drag: rotate · Wheel / pinch: zoom · Right-drag / two fingers: pan</span></div>
          <div className={`context-state ${contextMode}`}><span>{contextMode === 'full' ? 'FULL BOILER' : contextMode === 'focus' ? 'FOCUS + CONTEXT' : 'CONTEXT ISOLATE'}</span><b>{selected}</b></div>

          <div className="view-pills" aria-label="3D view modes">
            <button className={mode === 'cutaway' && !explode ? 'active' : ''} onClick={() => { setMode('cutaway'); setExplode(false); }}><ScanLine size={15} />Cutaway</button>
            <button className={mode === 'normal' && !explode ? 'active' : ''} onClick={() => { setMode('normal'); setExplode(false); }}><Eye size={15} />Normal</button>
            <button className={mode === 'xray' && !explode ? 'active' : ''} onClick={() => { setMode('xray'); setExplode(false); }}><Layers3 size={15} />X-Ray</button>
            <button className={explode ? 'active' : ''} onClick={() => { setMode('cutaway'); setExplode(value => !value); setContextMode('full'); }}><Box size={15} />Exploded</button>
          </div>

          <div className="section-key"><span className="key-radiant">FIRE SIDE</span><span className="key-shield">WATER</span><span className="key-convection">STEAM</span></div>

          <div className="control-dock">
            <button title="Fit complete boiler" onClick={() => issueCameraCommand('fitBoiler')}><Maximize2 size={17} /> Boiler</button>
            <button title="Fit selected component" onClick={() => issueCameraCommand('fitComponent', selected)}><Focus size={17} /> Component</button>
            <button title="Zoom in" onClick={() => issueCameraCommand('zoomIn')}><ZoomIn size={17} /> Zoom +</button>
            <button title="Zoom out" onClick={() => issueCameraCommand('zoomOut')}><ZoomOut size={17} /> Zoom −</button>
            <button className={labels ? 'active' : ''} onClick={() => setLabels(value => !value)}>{labels ? <Eye size={17} /> : <EyeOff size={17} />} Labels</button>
            <button className={flow ? 'active' : ''} onClick={() => setFlow(value => !value)}><Waves size={17} /> Flow</button>
            <button className={contextMode === 'focus' ? 'active' : ''} onClick={focusSelected}><Focus size={17} /> Focus</button>
            <button className={contextMode === 'isolate' ? 'active' : ''} onClick={isolateSelected}><Layers3 size={17} /> Isolate</button>
            <button onClick={resetAtlas}><Rotate3D size={17} /> Reset</button>
          </div>

          <div className="mobile-panel-actions">
            <button onClick={() => setMobileNavigatorOpen(value => !value)}><Menu size={17} /> Components</button>
            <button onClick={() => setMobileInspectorOpen(value => !value)}><Info size={17} /> Details</button>
          </div>
        </div>

        <aside className={`inspector-panel ${mobileInspectorOpen ? 'mobile-open' : ''}`}>
          <button className="mobile-close" onClick={() => setMobileInspectorOpen(false)} aria-label="Close component details"><X size={16} /></button>
          <div className="inspector-head">
            <span>{detail.group}</span>
            <h2>{selected}</h2>
            <div className="location-line"><b>LOCATION</b>{detail.location}</div>
          </div>
          <section className="inspector-section"><span>WHAT IT IS</span><p>{detail.summary}</p></section>
          <section className="inspector-section"><span>WHAT IT DOES</span><p>{detail.function}</p></section>
          <section className="inspector-section"><span>WHY IT MATTERS</span><p>{detail.why}</p></section>
          <section className="inspector-section list-section"><span>OPERATOR OBSERVES</span><ul>{detail.observe.map(item => <li key={item}>{item}</li>)}</ul></section>
          <section className="inspector-section list-section"><span>COMMON ISSUES</span><ul>{detail.issues.map(item => <li key={item}>{item}</li>)}</ul></section>
          <section className="inspector-section list-section"><span>INSPECTION</span><ul>{detail.inspection.map(item => <li key={item}>{item}</li>)}</ul></section>
          <section className="related-section"><span>RELATED COMPONENTS</span><div>{detail.related.map(name => <button key={name} onClick={() => chooseComponent(name)}>{name}</button>)}</div></section>

          {selected === 'Burner & Ignition' && (
            <section className="special-study-card burner-study">
              <span>STARTUP LINK</span>
              <p>The training sequence includes water fill, fuel-line readiness, pre-purge, ignition, flame confirmation and then main-fuel admission.</p>
              <button className="open-burner-page" onClick={() => setActiveModule('operation')}>Open Boiler Operation →</button>
            </section>
          )}

          {(selected === 'Level Gauge' || selected === 'Level Sensors' || selected === 'Pressure Controls' || selected === 'Safety Valve') && (
            <section className="special-study-card radiant-study-card">
              <span>PROTECTION STUDY</span>
              <p>Open troubleshooting to study low-water, high-pressure and flame-failure scenarios as connected protection functions.</p>
              <button className="open-radiant-page" onClick={() => setActiveModule('troubleshooting')}>Open Troubleshooting →</button>
            </section>
          )}

          <div className="inspector-actions">
            <button className="primary-action" onClick={showFullBoiler}><Maximize2 size={16} />Show in Full Boiler</button>
            <div>
              <button className={contextMode === 'focus' ? 'active' : ''} onClick={focusSelected}><Focus size={16} />Focus</button>
              <button className={contextMode === 'isolate' ? 'active' : ''} onClick={isolateSelected}><Layers3 size={16} />Isolate</button>
            </div>
            <button onClick={() => issueCameraCommand('fitComponent', selected)}><Focus size={16} />Fit Component</button>
          </div>
        </aside>
      </section>
    </main>
  );
}
