'use client';

import { useFormStatus } from 'react-dom';
import { PendingLabel } from './PendingLabel';

type SubmitButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function SubmitButton({ children, className, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={className}
    >
      <PendingLabel pending={pending}>{children}</PendingLabel>
    </button>
  );
}
