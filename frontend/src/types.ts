export type Provider = {
  id: number
  name: string
  provider_type: string
  base_url: string
  default_model: string
  priority: number
  is_active: boolean
  created_at: string
}

export type ApiKey = {
  id: number
  key_name: string
  key_prefix: string
  role_name: string | null
  rate_limit_per_minute: number | null
  max_budget_usd: number | null
  current_spend_usd: number
  is_active: boolean
  expires_at: string | null
  created_at: string
}

export type Role = {
  id: number
  role_name: string
  description: string | null
  default_rate_limit_per_minute: number
  default_max_budget_usd: number | null
  allowed_models: string
  created_at: string
}

export type UsageLog = {
  id: number
  request_id: string
  api_key_id: number | null
  provider_name: string
  model_name: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost_usd: number
  is_byok: boolean
  latency_ms: number
  status_code: number
  error_message: string | null
  created_at: string
}

export type Analytics = {
  total_requests: number
  success_requests: number
  failed_requests: number
  total_prompt_tokens: number
  total_completion_tokens: number
  total_tokens: number
  system_cost_usd: number
  byok_cost_usd: number
  total_cost_usd: number
  avg_latency_ms: number
  by_model: Array<{ name: string; requests: number; total_tokens: number; cost_usd: number }>
  by_provider: Array<{ name: string; requests: number; total_tokens: number; cost_usd: number }>
}

export type AuditLog = {
  id: number
  admin_user_id: number | null
  action: string
  target_resource: string
  details: string | null
  ip_address: string | null
  created_at: string
}
