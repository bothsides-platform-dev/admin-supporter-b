'use client';

import { useEffect } from 'react';
import { signalAcceptedCredentials } from '@/lib/webauthn-client';

/**
 * Keeps the browser's passkey provider in step with the server's list: on
 * load and after every change, it is told which credentials this account still
 * accepts, so a passkey deleted here stops being offered at sign-in. Passive —
 * renders nothing and does nothing where the Signal API is missing.
 */
export function PasskeyProviderSync({ rpId, userId, credentialIds }: {
  rpId: string;
  userId: string;
  credentialIds: string[];
}) {
  // A stable primitive, so the effect re-runs only when the list really changes.
  const accepted = credentialIds.join(',');
  useEffect(() => {
    void signalAcceptedCredentials(rpId, userId, accepted ? accepted.split(',') : []);
  }, [rpId, userId, accepted]);
  return null;
}
