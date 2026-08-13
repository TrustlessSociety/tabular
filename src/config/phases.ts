//The process names used by configuration and lifecycle resolution
export type ProcessName =
  | 'build'
  | 'development'
  | 'live'
  | 'worker'
  | 'migrator'
  | 'doctor'
  | 'preflight';

//The lifecycle events that a process may deliberately resolve
export type LifecycleResolutionPhase =
  | 'config'
  | 'listen'
  | 'route'
  | 'worker'
  | 'migrate'
  | 'doctor'
  | 'preflight';

//The phase matrix contract shared by process configuration modules
export type ProcessPhaseMatrix = {
  readonly [process in ProcessName]: readonly LifecycleResolutionPhase[];
};

//The process-specific configuration metadata carried into bootstrap
export type ProcessProfile<Name extends ProcessName = ProcessName> = {
  name: Name,
  phases: ProcessPhaseMatrix[Name],
};

//The narrow process wrapper applied to the shared application config
export type ProcessConfig<
  BaseConfig,
  Name extends ProcessName
> = BaseConfig & {
  process: ProcessProfile<Name>,
};

//The base lifecycle phases each process resolves by default
export const PROCESS_PHASES = {
  build: ['config', 'route'],
  development: ['config', 'listen', 'route'],
  live: ['config', 'listen', 'route'],
  worker: ['config', 'worker'],
  migrator: ['config', 'migrate'],
  doctor: ['config', 'doctor'],
  preflight: ['config', 'preflight']
} as const satisfies ProcessPhaseMatrix;

//The complete phase permission boundary, including optional migrator workers
export const PROCESS_PHASE_PERMISSIONS = {
  build: ['config', 'route'],
  development: ['config', 'listen', 'route'],
  live: ['config', 'listen', 'route'],
  worker: ['config', 'worker'],
  migrator: ['config', 'migrate', 'worker'],
  doctor: ['config', 'doctor'],
  preflight: ['config', 'preflight']
} as const satisfies ProcessPhaseMatrix;

/**
 * Attach one process profile to a shared application configuration.
 */
export function withProcessProfile<
  BaseConfig,
  Name extends ProcessName
>(config: BaseConfig, name: Name): ProcessConfig<BaseConfig, Name> {
  return {
    ...config,
    process: {
      name,
      phases: PROCESS_PHASES[name]
    }
  } as ProcessConfig<BaseConfig, Name>;
}

/**
 * Assert that an optional phase belongs to the process permission boundary.
 */
export function assertPermittedPhase(
  process: ProcessName,
  phase: LifecycleResolutionPhase
) {
  const permissions: readonly LifecycleResolutionPhase[] =
    PROCESS_PHASE_PERMISSIONS[process];
  if (!permissions.includes(phase)) {
    throw new Error(`Process ${process} cannot resolve lifecycle phase ${phase}`);
  }
}
