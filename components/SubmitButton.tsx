'use client';

import { useFormStatus } from 'react-dom';

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
      {pending && (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5 align-middle" />
      )}
      {children}
    </button>
  );
}
