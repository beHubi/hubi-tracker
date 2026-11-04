// ---------------------------------------------------------------------------
// Public config
// ---------------------------------------------------------------------------

export interface ConsentState {
  marketing: boolean;
  analytics: boolean;
}

export interface InitOptions {
  publicKey: string;
  site: string;
  apiBase: string;
  autoBindForms?: boolean;
  consent?: Partial<ConsentState>;
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

export interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

// ---------------------------------------------------------------------------
// Lead payload (matches hubi-web Marketing::Leads::Ingest)
// ---------------------------------------------------------------------------

export interface LeadContext {
  landing_url: string;
  referrer_url: string;
  utm: Utm;
  consent: ConsentState;
}

export interface LeadFields {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  job_title?: string;
  message?: string;
  [key: string]: string | undefined;
}

export interface LeadPayload {
  form_id: string;
  external_id: string;
  hubi_hp: string;
  fields: LeadFields;
  extra: Record<string, string>;
  context: LeadContext;
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export type FieldMap = Record<string, string>;

export interface BindFormOptions {
  fieldMap?: FieldMap;
  formId?: string;
}

export interface SubmitOptions {
  formId: string;
  fields: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

// `kind` is a plain string: queues written by SDK 1.0 may still hold
// "pageview" entries, which the drain discards.
export interface QueuedEvent {
  kind: string;
  payload: LeadPayload;
  attempts: number;
  queued_at: number;
}
