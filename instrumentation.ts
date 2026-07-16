import { langfuseSpanProcessor, registerLangfuseTelemetry } from '@/lib/otel';

export { langfuseSpanProcessor };

export function register() {
  registerLangfuseTelemetry();
}
