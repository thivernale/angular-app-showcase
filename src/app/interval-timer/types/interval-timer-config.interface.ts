export interface IntervalTimerConfig {
  name: string;
  rounds: number;
  work: number;
  rest: number;
  playSound: boolean;
  exercises?: string;
  videoUrl?: string;
}
