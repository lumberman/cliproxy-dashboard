import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select, type SelectOption } from '@/components/ui/Select';
import { apiCallApi, type ApiCallRequest, type ApiCallResult } from '@/services/api/apiCall';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores/useAuthStore';
import { downloadBlob } from '@/utils/download';
import { usageQueueApi } from './api';
import {
  buildRequestPayload,
  parseQueueCount,
  REQUEST_METHODS,
  RequestValidationError,
} from './logic';
import { requestToolsMessages } from './messages';
import styles from './RequestToolsPage.module.scss';

export function RequestToolsPage() {
  const session = useAuthStore();
  return (
    <RequestToolsSession
      key={apiClient.getConnectionRevision()}
      connected={session.isAuthenticated && session.connectionStatus === 'connected'}
    />
  );
}

function RequestToolsSession({ connected }: { connected: boolean }) {
  const { t } = useTranslation();
  const text = (key: keyof typeof requestToolsMessages, values?: Record<string, string | number>) =>
    t(`request_tools.${key}`, { defaultValue: requestToolsMessages[key], ...values });
  const [credentials, setCredentials] = useState<SelectOption[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credentialError, setCredentialError] = useState(false);
  const [authIndex, setAuthIndex] = useState('');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [headers, setHeaders] = useState('{}');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [result, setResult] = useState<ApiCallResult | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [queueCount, setQueueCount] = useState('10');
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [queueRecords, setQueueRecords] = useState<unknown[] | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const revision = apiClient.getConnectionRevision();

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    setCredentialsLoading(true);
    setCredentialError(false);
    void authFilesApi
      .list()
      .then(
        (response) => {
          if (!active || revision !== apiClient.getConnectionRevision()) return;
          const options = new Map<string, SelectOption>();
          for (const file of response.files) {
            const value = file.authIndex == null ? '' : String(file.authIndex).trim();
            if (value) options.set(value, { value, label: file.name });
          }
          setCredentials([...options.values()]);
        },
        () => {
          if (active && revision === apiClient.getConnectionRevision()) setCredentialError(true);
        }
      )
      .finally(() => {
        if (active && revision === apiClient.getConnectionRevision()) setCredentialsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [connected, revision]);

  const describeError = (error: unknown, fallback: 'failed' | 'queue_failed') => {
    if (error instanceof RequestValidationError) return text(error.code);
    return error instanceof Error && error.message ? error.message : text(fallback);
  };

  const sendRequest = async () => {
    const controller = lifecycle.current;
    if (!connected || sending || !controller || controller.signal.aborted) return;
    setRequestError('');
    let payload: ApiCallRequest;
    try {
      payload = buildRequestPayload({ method, url, authIndex, proxyUrl, headers, body });
    } catch (error: unknown) {
      setRequestError(describeError(error, 'failed'));
      return;
    }
    setSending(true);
    setResult(null);
    setElapsed(null);
    const start = performance.now();
    const isCurrent = () =>
      !controller.signal.aborted && revision === apiClient.getConnectionRevision();
    try {
      const response = await apiCallApi.request(payload, {
        signal: controller.signal,
        timeout: 65_000,
      });
      if (isCurrent()) setResult(response);
    } catch (error: unknown) {
      if (isCurrent()) setRequestError(describeError(error, 'failed'));
    } finally {
      if (isCurrent()) {
        setElapsed(Math.round(performance.now() - start));
        setSending(false);
      }
    }
  };

  const prepareQueue = () => {
    setQueueError('');
    try {
      setConfirmCount(parseQueueCount(queueCount));
    } catch (error: unknown) {
      setQueueError(describeError(error, 'queue_failed'));
    }
  };

  const retrieveQueue = async () => {
    const controller = lifecycle.current;
    if (
      !connected ||
      queueLoading ||
      confirmCount === null ||
      !controller ||
      controller.signal.aborted
    )
      return;
    const isCurrent = () =>
      !controller.signal.aborted && revision === apiClient.getConnectionRevision();
    setQueueLoading(true);
    setQueueError('');
    setConfirmCount(null);
    try {
      const records = await usageQueueApi.pop(confirmCount, controller.signal);
      if (isCurrent()) setQueueRecords((previous) => [...(previous ?? []), ...records]);
    } catch (error: unknown) {
      if (isCurrent()) setQueueError(describeError(error, 'queue_failed'));
    } finally {
      if (isCurrent()) setQueueLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className="page-title">{text('title')}</h1>
        <p>{text('description')}</p>
      </header>
      {!connected && (
        <p className={styles.error} role="status">
          {text('disconnected')}
        </p>
      )}
      <section className={styles.panel} aria-labelledby="request-tools-request-title">
        <h2 id="request-tools-request-title">{text('request_title')}</h2>
        <div className={styles.field}>
          <label htmlFor="request-tools-credential">{text('credential')}</label>
          <Select
            id="request-tools-credential"
            value={authIndex}
            onChange={setAuthIndex}
            disabled={!connected || credentialsLoading || sending}
            options={[{ value: '', label: text('no_credential') }, ...credentials]}
          />
          {credentialError && (
            <p className={styles.error} role="alert">
              {text('credentials_error')}
            </p>
          )}
        </div>
        <div className={styles.requestLine}>
          <div className={styles.field}>
            <label htmlFor="request-tools-method">{text('method')}</label>
            <Select
              id="request-tools-method"
              value={method}
              onChange={setMethod}
              options={REQUEST_METHODS.map((value) => ({ value, label: value }))}
              disabled={sending}
            />
          </div>
          <Input
            id="request-tools-url"
            label={text('url')}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={text('url_placeholder')}
            spellCheck={false}
            autoComplete="off"
            disabled={sending}
          />
        </div>
        <Input
          label={text('proxy')}
          value={proxyUrl}
          onChange={(event) => setProxyUrl(event.target.value)}
          placeholder={text('proxy_placeholder')}
          hint={text('proxy_hint')}
          spellCheck={false}
          autoComplete="off"
          disabled={sending}
        />
        <div className={styles.editors}>
          <div className={styles.field}>
            <label htmlFor="request-tools-headers">{text('headers')}</label>
            <textarea
              id="request-tools-headers"
              value={headers}
              onChange={(event) => setHeaders(event.target.value)}
              rows={7}
              spellCheck={false}
              disabled={sending}
              aria-describedby="request-tools-token-hint"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="request-tools-body">{text('body')}</label>
            <textarea
              id="request-tools-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={7}
              spellCheck={false}
              disabled={sending}
              aria-describedby="request-tools-token-hint"
            />
          </div>
        </div>
        <p className={styles.hint} id="request-tools-token-hint">
          {text('token_hint')}
        </p>
        <div className={styles.actions}>
          <Button
            type="button"
            onClick={() => void sendRequest()}
            loading={sending}
            disabled={!connected}
          >
            {text('send')}
          </Button>
          {elapsed !== null && (
            <span className={styles.hint}>{text('elapsed', { milliseconds: elapsed })}</span>
          )}
        </div>
        {requestError && (
          <p className={styles.error} role="alert">
            {requestError}
          </p>
        )}
      </section>
      <section
        className={styles.panel}
        aria-labelledby="request-tools-response-title"
        aria-busy={sending}
      >
        <div className={styles.sectionHeader}>
          <h2 id="request-tools-response-title">{text('response_title')}</h2>
          {result && (
            <span
              className={result.statusCode >= 400 ? styles.badStatus : styles.status}
              role="status"
            >
              HTTP {result.statusCode}
            </span>
          )}
        </div>
        {result ? (
          <>
            {result.statusCode >= 400 && <p className={styles.error}>{text('upstream_error')}</p>}
            <h3>{text('response_headers')}</h3>
            <pre className={styles.output} tabIndex={0}>
              {JSON.stringify(result.header, null, 2)}
            </pre>
            <h3>{text('response_body')}</h3>
            <pre className={styles.output} tabIndex={0}>
              {result.bodyText || text('empty_body')}
            </pre>
          </>
        ) : (
          <p className={styles.hint}>{text('response_empty')}</p>
        )}
      </section>
      <section
        className={styles.panel}
        aria-labelledby="request-tools-queue-title"
        aria-busy={queueLoading}
      >
        <h2 id="request-tools-queue-title">{text('queue_title')}</h2>
        <p className={styles.hint}>{text('queue_description')}</p>
        <div className={styles.queueControls}>
          <Input
            label={text('queue_count')}
            type="number"
            min={1}
            step={1}
            value={queueCount}
            onChange={(event) => setQueueCount(event.target.value)}
            disabled={queueLoading}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={prepareQueue}
            loading={queueLoading}
            disabled={!connected}
          >
            {text('queue_pop')}
          </Button>
        </div>
        {queueError && (
          <p className={styles.error} role="alert">
            {queueError}
          </p>
        )}
        {queueRecords !== null && (
          <>
            <div className={styles.sectionHeader}>
              <p className={styles.hint} role="status">
                {text(queueRecords.length ? 'queue_result' : 'queue_empty', {
                  count: queueRecords.length,
                })}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadBlob({
                    filename: 'usage-queue.json',
                    blob: new Blob([JSON.stringify(queueRecords, null, 2)], {
                      type: 'application/json',
                    }),
                  })
                }
              >
                {text('download')}
              </Button>
            </div>
            <pre className={styles.output} tabIndex={0}>
              {JSON.stringify(queueRecords, null, 2)}
            </pre>
          </>
        )}
      </section>
      <Modal
        open={confirmCount !== null}
        title={text('queue_confirm_title')}
        onClose={() => setConfirmCount(null)}
        footer={
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={() => setConfirmCount(null)}>
              {text('cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void retrieveQueue()}
              disabled={!connected || queueLoading}
            >
              {text('queue_confirm')}
            </Button>
          </div>
        }
      >
        <p>{text('queue_confirm_message', { count: confirmCount ?? 0 })}</p>
      </Modal>
    </div>
  );
}

export default RequestToolsPage;
