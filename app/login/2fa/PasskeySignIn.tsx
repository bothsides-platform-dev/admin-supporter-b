'use client';

import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { PendingLabel } from '@/components/PendingLabel';
import { CEREMONY_MESSAGES, PASSKEY_NETWORK_MESSAGE, passkeyServerMessage } from '@/lib/passkey-messages';
import { ceremonyFailure, prepareWebAuthn, requestOptionsFromJSON, signalUnknownCredential } from '@/lib/webauthn-client';
import { passkeySignInAction } from './actions';

/** Fetch a fresh challenge this long before the current one lapses, so an idle login tab still works on the first click. */
const REFRESH_MARGIN_MS = 30_000;

type Notice = { tone: 'error' | 'info'; text: string };

/**
 * Second factor by passkey. The challenge arrives with the page (props), so
 * the click handler can open the browser's passkey dialog straight away — no
 * server round-trip between the click and `navigator.credentials.get()`.
 */
export function PasskeySignIn({ options, token, expiresAt, callbackUrl }: {
  options: PublicKeyCredentialRequestOptionsJSON;
  token: string;
  expiresAt: number;
  callbackUrl: string;
}) {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const waitingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void prepareWebAuthn().then((ok) => {
      if (active) setSupported(ok);
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  // The passkey is the quicker path for whoever has one: Enter/Space starts it.
  useEffect(() => {
    if (supported) buttonRef.current?.focus();
  }, [supported]);

  useEffect(() => {
    const delay = Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, 1_000);
    const timer = window.setTimeout(() => {
      if (!waitingRef.current) router.refresh();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt, router]);

  async function handleClick() {
    if (waitingRef.current || isPending) return;
    setNotice(null);
    if (Date.now() >= expiresAt - 5_000) {
      router.refresh();
      setNotice({ tone: 'info', text: '인증 준비를 새로 했습니다. 다시 눌러 주세요.' });
      return;
    }
    // Only one passkey dialog at a time: a newer attempt cancels the previous one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let credential: Credential | null;
    waitingRef.current = true;
    setWaiting(true);
    try {
      // Nothing is awaited before this call, so the browser still treats the click as the user gesture.
      credential = await navigator.credentials.get({
        publicKey: requestOptionsFromJSON(options),
        signal: controller.signal,
      });
    } catch (error) {
      const failure = ceremonyFailure(error);
      setNotice({ tone: failure === 'CANCELLED' ? 'info' : 'error', text: CEREMONY_MESSAGES[failure] });
      return;
    } finally {
      waitingRef.current = false;
      setWaiting(false);
    }
    if (!(credential instanceof PublicKeyCredential)) {
      setNotice({ tone: 'error', text: CEREMONY_MESSAGES.FAILED });
      return;
    }

    const response = credential.toJSON();
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof passkeySignInAction>>;
      try {
        // Returns only on failure — success redirects, which surfaces here as a rejection Next.js must handle.
        result = await passkeySignInAction({ token, response, callbackUrl });
      } catch (error) {
        unstable_rethrow(error);
        setNotice({ tone: 'error', text: PASSKEY_NETWORK_MESSAGE });
        return;
      }
      if (!result || result.ok !== false) return;
      setNotice({ tone: 'error', text: passkeyServerMessage(result.error) });
      // The provider offered a passkey the server no longer has: let it stop offering it.
      if (result.error === 'UNKNOWN_CREDENTIAL') await signalUnknownCredential(options.rpId, credential.id);
      // Whatever the server refused, this challenge is not worth retrying: fetch a fresh one
      // (and the current 2FA state) so the next click can succeed.
      router.refresh();
    });
  }

  // Unsupported browser: the TOTP form below remains the way in.
  if (supported === false) return null;
  const busy = waiting || isPending;

  return (
    <div className="space-y-3">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        disabled={!supported || busy}
        aria-busy={busy}
        className="w-full rounded bg-primary px-4 py-2 text-label-large text-on-primary disabled:opacity-50"
      >
        <PendingLabel pending={busy}>패스키로 인증</PendingLabel>
      </button>
      <p className="text-body-small text-on-surface-variant">
        이 기기의 지문, 얼굴 인식 또는 기기 잠금으로 인증합니다.
      </p>
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`text-body-small ${notice.tone === 'error' ? 'text-error' : 'text-on-surface-variant'}`}
        >
          {notice.text}
        </p>
      )}
      {/* Plain text between two decorative rules: a `separator` role would hide the words from screen readers. */}
      <div className="flex items-center gap-3 text-label-small text-on-surface-variant">
        <span aria-hidden="true" className="h-px flex-1 bg-outline-variant" />
        또는 인증 앱 코드
        <span aria-hidden="true" className="h-px flex-1 bg-outline-variant" />
      </div>
    </div>
  );
}
