import type { Ctx } from "../bot.js";

export type LeadIntent = "Buy" | "Rent" | "Sell";
export type LeadStatus = "New" | "Done";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  intent: LeadIntent;
  note: string;
  status: LeadStatus;
  submitted_at: string;
}

type DoStub = { fetch(input: string, init?: { method?: string; body?: string }): Promise<Response> };
type DoNamespace = { idFromName(name: string): unknown; get(id: unknown): DoStub };
type LeadEnv = { CHAT_DO?: DoNamespace };

function workerStore(ctx: Ctx): DoStub | undefined {
  const env = (ctx as Ctx & { env?: LeadEnv }).env;
  const namespace = env?.CHAT_DO;
  return namespace?.get(namespace.idFromName("lead-store"));
}

async function doRequest<T>(ctx: Ctx, action: string, payload?: unknown): Promise<T | undefined> {
  const store = workerStore(ctx);
  if (!store) return undefined;
  const response = await store.fetch(`https://do/leads/${action}`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
  if (!response.ok) throw new Error("Lead storage is unavailable");
  return (await response.json()) as T;
}

/*
 * The test harness deliberately has neither a Worker binding nor Redis. Its
 * fresh session is used only to exercise the dialog's save boundary in-process;
 * deployed requests always take the Durable Object branch above.
 */
function harnessStore(ctx: Ctx): { ids: string[]; records: Record<string, Lead> } {
  const current = ctx.session.leadHarnessStore as
    | { ids: string[]; records: Record<string, Lead> }
    | undefined;
  if (current) return current;
  const created = { ids: [], records: {} as Record<string, Lead> };
  ctx.session.leadHarnessStore = created;
  return created;
}

export async function createLead(ctx: Ctx, lead: Lead): Promise<void> {
  if (workerStore(ctx)) {
    await doRequest(ctx, "create", lead);
    return;
  }
  const store = harnessStore(ctx);
  store.records[lead.id] = lead;
  store.ids.unshift(lead.id);
}

export async function getLead(ctx: Ctx, id: string): Promise<Lead | undefined> {
  if (workerStore(ctx)) return doRequest<Lead | undefined>(ctx, "get", { id });
  return harnessStore(ctx).records[id];
}

export async function listLeads(ctx: Ctx): Promise<Lead[]> {
  if (workerStore(ctx)) return (await doRequest<Lead[]>(ctx, "list")) ?? [];
  const store = harnessStore(ctx);
  return store.ids.map((id) => store.records[id]).filter((lead): lead is Lead => Boolean(lead));
}

export async function updateLeadStatus(ctx: Ctx, id: string, status: LeadStatus): Promise<Lead | undefined> {
  if (workerStore(ctx)) return doRequest<Lead | undefined>(ctx, "status", { id, status });
  const lead = harnessStore(ctx).records[id];
  if (lead) lead.status = status;
  return lead;
}

export async function deleteLead(ctx: Ctx, id: string): Promise<boolean> {
  if (workerStore(ctx)) return (await doRequest<boolean>(ctx, "delete", { id })) ?? false;
  const store = harnessStore(ctx);
  if (!store.records[id]) return false;
  delete store.records[id];
  store.ids = store.ids.filter((value) => value !== id);
  return true;
}
