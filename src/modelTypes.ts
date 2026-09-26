export type ViewMode = 'normal' | 'cutaway' | 'xray';
export type ContextMode = 'full' | 'focus' | 'isolate';
export type CameraAction = 'fitBoiler' | 'fitComponent' | 'zoomIn' | 'zoomOut' | 'reset';
export type CameraCommand = {
  id: number;
  action: CameraAction;
  component?: string;
};
