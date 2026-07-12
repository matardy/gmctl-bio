import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';

declare global {
  // eslint-disable-next-line no-var
  var __gmctlLangfuseRegistered: boolean | undefined;
  // eslint-disable-next-line no-var
  var __gmctlLangfuseSdk: NodeSDK | undefined;
}

export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  exportMode: 'immediate',
});

export function registerLangfuseTelemetry() {
  if (globalThis.__gmctlLangfuseRegistered) {
    return;
  }

  const sdk = new NodeSDK({
    spanProcessors: [langfuseSpanProcessor],
  });

  sdk.start();

  globalThis.__gmctlLangfuseSdk = sdk;
  globalThis.__gmctlLangfuseRegistered = true;
}
