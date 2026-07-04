/**
 * NitroChat Gateway URL and API key come from the pod environment only
 * (`NITROCHAT_GATEWAY_ENDPOINT`, `NITROCHAT_GATEWAY_API_KEY`), injected by NitroCloud
 * at deploy time via Knative + K8s Secret (OpenBao merge in infra-engine).
 * No duplicate in runtime-config.json — single source of truth in env.
 */

export interface RequiredRuntimeEnvStatus {
  required: boolean;
  configured: boolean;
  sensitive: boolean;
}

export interface RuntimeEnvDiagnostics {
  requiredEnv: Record<string, RequiredRuntimeEnvStatus>;
  missingRequiredEnv: string[];
}

export function getNitrochatGatewayEndpoint(): string {
  return process.env.NITROCHAT_GATEWAY_ENDPOINT?.trim() || '';
}

export function getNitrochatGatewayApiKey(): string {
  return process.env.NITROCHAT_GATEWAY_API_KEY?.trim() || '';
}

export function isNitrochatGatewayConfigured(): boolean {
  return Boolean(getNitrochatGatewayEndpoint() && getNitrochatGatewayApiKey());
}

export function getGatewayConfigurationDiagnostics(): {
  endpointConfigured: boolean;
  apiKeyConfigured: boolean;
} {
  return {
    endpointConfigured: Boolean(getNitrochatGatewayEndpoint()),
    apiKeyConfigured: Boolean(getNitrochatGatewayApiKey()),
  };
}

export function isRuntimeEnvDiagnosticsEnabled(): boolean {
  return process.env.NITROCHAT_CONFIG_DIAGNOSTICS === 'true';
}

export function getRequiredRuntimeEnvDiagnostics(): RuntimeEnvDiagnostics {
  const requiredEnv: Record<string, RequiredRuntimeEnvStatus> = {
    NITROCHAT_GATEWAY_ENDPOINT: {
      required: true,
      configured: Boolean(getNitrochatGatewayEndpoint()),
      sensitive: false,
    },
    NITROCHAT_GATEWAY_API_KEY: {
      required: true,
      configured: Boolean(getNitrochatGatewayApiKey()),
      sensitive: true,
    },
  };

  return {
    requiredEnv,
    missingRequiredEnv: Object.entries(requiredEnv)
      .filter(([, status]) => status.required && !status.configured)
      .map(([key]) => key),
  };
}
