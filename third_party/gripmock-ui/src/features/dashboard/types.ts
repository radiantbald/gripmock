export type DashboardOverview = {
  totalServices?: number;
  totalStubs?: number;
  usedStubs?: number;
  unusedStubs?: number;
  totalRooms?: number;
  runtimeDescriptors?: number;
  totalHistory?: number;
  historyErrors?: number;
};

export type DashboardInfo = {
  appName?: string;
  version?: string;
  goVersion?: string;
  compiler?: string;
  goos?: string;
  goarch?: string;
  numCPU?: number;
  startedAt?: string;
  uptimeSeconds?: number;
  ready?: boolean;
  historyEnabled?: boolean;
  totalServices?: number;
  totalStubs?: number;
  totalRooms?: number;
  runtimeDescriptors?: number;
};

export type Dashboard = DashboardOverview & DashboardInfo;
