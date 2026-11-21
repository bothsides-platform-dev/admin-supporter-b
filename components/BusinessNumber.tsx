import { CopyableValue } from './CopyableValue';

export function BusinessNumber({ value }: { value: string }) {
  return <CopyableValue value={value} label="사업자번호" numeric className="ml-3" />;
}
