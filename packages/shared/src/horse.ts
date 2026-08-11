export type HorseStatus =
  | 'considering'
  | 'applied'
  | 'invested'
  | 'active'
  | 'retired'
  | 'settling'
  | 'settled'
  | 'rejected'
  | 'skipped';

const horseStatusSet = new Set<HorseStatus>([
  'considering',
  'applied',
  'invested',
  'active',
  'retired',
  'settling',
  'settled',
  'rejected',
  'skipped',
]);

export function canTransitionHorseStatus(from: HorseStatus, to: HorseStatus): boolean {
  // ステータスは利用者が整理のために付けるラベルで、業務データとは自動連動しない。
  return horseStatusSet.has(from) && horseStatusSet.has(to);
}
