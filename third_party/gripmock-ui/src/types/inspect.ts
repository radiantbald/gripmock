type InspectStage = {
  name: string;
  before: number;
  after: number;
  removed: number;
};

type InspectCandidateEvent = {
  stage: string;
  result: string;
  reason?: string;
};

export type InspectCandidate = {
  id: string;
  service: string;
  method: string;
  session?: string;
  priority: number;
  times: number;
  used: number;
  visibleBySession: boolean;
  withinTimes: boolean;
  headersMatched: boolean;
  inputMatched: boolean;
  matched: boolean;
  specificity: number;
  score: number;
  excludedBy?: string[];
  events?: InspectCandidateEvent[];
};

export type InspectResponse = {
  service: string;
  method: string;
  session?: string;
  fallbackToMethod: boolean;
  error?: string;
  matchedStubId?: string;
  similarStubId?: string;
  stages: InspectStage[];
  candidates: InspectCandidate[];
};
