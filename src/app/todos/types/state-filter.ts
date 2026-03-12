export enum StateFilter {
  ALL = "ALL",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED"
}

export const StateFilterLabels: Record<StateFilter, string> = {
  [StateFilter.ALL]: 'All',
  [StateFilter.ACTIVE]: 'Active',
  [StateFilter.COMPLETED]: 'Completed'
};
