interface ConsentState {
    marketing: boolean;
    analytics: boolean;
}
interface InitOptions {
    publicKey: string;
    site: string;
    apiBase: string;
    autoBindForms?: boolean;
    consent?: Partial<ConsentState>;
    debug?: boolean;
}
interface LeadFields {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    job_title?: string;
    message?: string;
    [key: string]: string | undefined;
}
type FieldMap = Record<string, string>;
interface BindFormOptions {
    fieldMap?: FieldMap;
    formId?: string;
}
interface SubmitOptions {
    formId: string;
    fields: Record<string, string>;
}

declare function getConsent(): ConsentState;

interface ExtractedFields {
    fields: LeadFields;
    extra: Record<string, string>;
    honeypot: string;
}
declare function extractFields(form: HTMLFormElement, customMap?: FieldMap): ExtractedFields;

declare const Hubi: {
    init(opts: InitOptions): void;
    pageview(url?: string): void;
    identify(email: string): void;
    clearIdentity(): void;
    bindForm(el: HTMLFormElement, options?: BindFormOptions): void;
    submit(options: SubmitOptions): Promise<boolean>;
    setConsent(state: Partial<ConsentState>): void;
    getConsent: typeof getConsent;
    extractFields: typeof extractFields;
};
type CommandTuple = [string, ...unknown[]];
declare global {
    interface Window {
        HubiTracker?: CommandTuple[] & {
            push: (cmd: CommandTuple) => void;
        };
        Hubi?: typeof Hubi;
    }
}

export { Hubi };
