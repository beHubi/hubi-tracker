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

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
  ref?: string;
}

export interface TouchData extends Attribution {
  url: string;
  ts: number;
}

export interface FieldMap {
  [formField: string]: string;
}

export interface BindFormOptions {
  fieldMap?: FieldMap;
  formId?: string;
}

export interface SubmitOptions {
  formId: string;
  fields: Record<string, string>;
}

export interface TrackPayload {
  event: string;
  anonymous_id: string;
  session_id: string;
  public_key: string;
  site: string;
  url: string;
  referrer: string;
  first_touch: TouchData | null;
  last_touch: TouchData | null;
  consent: ConsentState;
  properties?: Record<string, unknown>;
  ts: number;
}

export interface QueuedEvent {
  payload: TrackPayload;
  attempts: number;
  queued_at: number;
}
