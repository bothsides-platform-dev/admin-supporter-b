'use client';

import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server';
import { unstable_rethrow } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { PendingLabel } from '@/components/PendingLabel';
import { PASSKEY_LABEL_MAX } from '@/lib/auth/passkey-limits';
import { CEREMONY_MESSAGES, PASSKEY_NETWORK_MESSAGE, passkeyServerMessage } from '@/lib/passkey-messages';
import { beginPasskeyRegistrationAction, finishPasskeyRegistrationAction } from '@/lib/server/actions/admin/passkeys';
import { canCreatePasskey, ceremonyFailure, creationOptionsFromJSON, signalUnknownCredential } from '@/lib/webauthn-client';

/** A registration challenge the server issued after checking the TOTP code. Reusable until it expires or is consumed. */
type Challenge = { options: PublicKeyCredentialCreationOptionsJSON; token: string; label: string };
type Notice = { tone: 'error' | 'info' | 'success'; text: string };

const inputClass = 'rounded border border-outline-variant bg-surface px-3 py-1.5 text-body-small focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50';
const primaryButton = 'rounded border border-primary px-4 py-1.5 text-label-small text-primary hover:bg-primary/10 disabled:opacity-50';
const quietButton = 'px-2 py-1.5 text-label-small text-on-surface-variant hover:text-on-surface disabled:opacity-50';
const noticeClass: Record<Notice['tone'], string> = { error: 'text-error', info: 'text-on-surface-variant', success: 'text-primary' };

/**
 * Two steps, one form: the TOTP code is checked on the server first (step-up),
 * then the browser creates the passkey. If the dialog is dismissed — or the
 * browser wants a fresh click before opening it — the same challenge is retried
 * from a button, without asking for another code.
 */
export function PasskeyRegistration() {
  const [capable, setCapable] = useState<boolean | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    void canCreatePasskey().then((ok) => {
      if (active) setCapable(ok);
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  /** Runs synchronously up to `navigator.credentials.create()`, so a click that calls it keeps its user gesture. */
  async function createOnDevice(current: Challenge) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let credential: Credential | null;
    setWaiting(true);
    try {
      credential = await navigator.credentials.create({
        publicKey: creationOptionsFromJSON(current.options),
        signal: controller.signal,
      });
    } catch (error) {
      const failure = ceremonyFailure(error);
      setNotice({ tone: failure === 'CANCELLED' ? 'info' : 'error', text: CEREMONY_MESSAGES[failure] });
      // Retrying cannot help when this device already has the passkey or the address is wrong.
      if (failure === 'ALREADY_REGISTERED' || failure === 'NOT_ALLOWED_HERE') setChallenge(null);
      return;
    } finally {
      setWaiting(false);
    }
    if (!(credential instanceof PublicKeyCredential)) {
      setNotice({ tone: 'error', text: CEREMONY_MESSAGES.FAILED });
      return;
    }

    const response = credential.toJSON();
    let result: Awaited<ReturnType<typeof finishPasskeyRegistrationAction>>;
    try {
      result = await finishPasskeyRegistrationAction({ token: current.token, response, label: current.label });
    } catch (error) {
      unstable_rethrow(error);
      setNotice({ tone: 'error', text: PASSKEY_NETWORK_MESSAGE });
      await signalUnknownCredential(current.options.rp.id, credential.id);
      setChallenge(null);
      return;
    }
    setChallenge(null);
    if (result.ok) {
      setNotice({ tone: 'success', text: `‘${current.label}’ 패스키를 등록했습니다. 다음 로그인부터 사용할 수 있습니다.` });
      return;
    }
    setNotice({ tone: 'error', text: passkeyServerMessage(result.error) });
    // The device now holds a passkey the server refused: let the provider drop it.
    await signalUnknownCredential(current.options.rp.id, credential.id);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const label = String(data.get('label') ?? '').trim();
    const code = String(data.get('code') ?? '');
    setNotice(null);
    startTransition(async () => {
      let started: Awaited<ReturnType<typeof beginPasskeyRegistrationAction>>;
      try {
        started = await beginPasskeyRegistrationAction({ code, label });
      } catch (error) {
        unstable_rethrow(error);
        setNotice({ tone: 'error', text: PASSKEY_NETWORK_MESSAGE });
        return;
      }
      if (!started.ok) {
        setNotice({ tone: 'error', text: passkeyServerMessage(started.error) });
        return;
      }
      const next = { options: started.options, token: started.token, label };
      setChallenge(next);
      await createOnDevice(next);
    });
  }

  if (capable === false) {
    return (
      <p className="text-body-small text-on-surface-variant">
        이 브라우저나 기기에서는 패스키를 만들 수 없습니다. 인증 앱 코드를 계속 사용해 주세요.
      </p>
    );
  }
  const busy = waiting || isPending;

  return (
    <div className="space-y-3">
      {challenge ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-small text-on-surface-variant">
            ‘{challenge.label}’ 등록을 마치려면 기기 인증이 필요합니다.
          </span>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => {
              setNotice(null);
              startTransition(() => createOnDevice(challenge));
            }}
            className={primaryButton}
          >
            <PendingLabel pending={busy}>기기 인증 계속</PendingLabel>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setNotice(null);
              setChallenge(null);
            }}
            className={quietButton}
          >
            취소
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1">
            <span className="text-label-medium">기기 이름</span>
            <input
              name="label"
              required
              maxLength={PASSKEY_LABEL_MAX}
              placeholder="예: 회사 맥북"
              autoComplete="off"
              disabled={busy}
              className={`${inputClass} block w-56 max-w-full`}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-label-medium">인증 앱 코드</span>
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 \-]*"
              maxLength={9}
              placeholder="123456"
              disabled={busy}
              className={`${inputClass} block w-32 tracking-widest md-numeric`}
            />
          </label>
          <button type="submit" disabled={busy || !capable} aria-busy={busy} className={primaryButton}>
            <PendingLabel pending={busy}>패스키 등록</PendingLabel>
          </button>
        </form>
      )}
      {waiting && (
        <p role="status" className="text-body-small text-on-surface-variant">
          브라우저 안내에 따라 지문, 얼굴 인식 또는 기기 잠금으로 인증해 주세요.
        </p>
      )}
      {notice && !waiting && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-body-small ${noticeClass[notice.tone]}`}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
