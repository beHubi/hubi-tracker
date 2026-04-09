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

export interface ClickIds {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  msclkid?: string;
  ttclid?: string;
  li_fat_id?: string;
}

export interface AdCookies {
  fbp?: string;
  fbc?: string;
  ga_client_id?: string;
  ttp?: string;
}

export interface TouchData {
  url: string;
  referrer: string;
  utm: Utm;
  click_ids: ClickIds;
  ts: number;
}

// ---------------------------------------------------------------------------
// Device + context
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  type: "mobile" | "tablet" | "desktop";
  ua: string;
  language: string;
  timezone: string;
  screen: string;
  viewport: string;
}

export interface EventContext {
  anonymous_id: string;
  session_id: string;
  page_url: string;
  page_title: string;
  landing_url: string;
  referrer_url: string;
  consent: ConsentState;
  device: DeviceInfo;
  utm: Utm;
  click_ids: ClickIds;
  ad_cookies: AdCookies;
  first_touch: TouchData | null;
  last_touch: TouchData | null;
  ts: number;
}

// ---------------------------------------------------------------------------
// Payload shapes (match hubi-web Marketing::Leads::Ingest + IngestPageview)
// ---------------------------------------------------------------------------

export interface PageviewPayload {
  context: EventContext;
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
  context: EventContext;
}

export type TrackerPayload = PageviewPayload | LeadPayload;

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

export type QueueKind = "pageview" | "lead";

export interface QueuedEvent {
  kind: QueueKind;
  payload: TrackerPayload;
  attempts: number;
  queued_at: number;
}
