import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { deleteLead, getLead, listLeads, updateLeadStatus, type Lead, type LeadStatus } from "../leads/store.js";
import { inlineButton, inlineKeyboard, paginate, requireOwner, type InlineButton, type OwnerAwareCtx } from "../toolkit/index.js";

const composer = new Composer<Ctx>();
const PER_PAGE = 5;
type Filter = "all" | "new" | "done";

function filterLeads(leads: Lead[], filter: Filter): Lead[] {
  return filter === "all" ? leads : leads.filter((lead) => lead.status.toLowerCase() === filter);
}

function pageKeyboard(leads: Lead[], filter: Filter, page: number) {
  const slice = paginate(leads, { page, perPage: PER_PAGE, callbackPrefix: `admin:page:${filter}` });
  const rows: InlineButton[][] = slice.pageItems.map((lead) => [inlineButton(`${lead.name} · ${lead.intent} · ${lead.status}`, `admin:lead:${lead.id}`)]);
  rows.push([inlineButton("All", "admin:filter:all"), inlineButton("New", "admin:filter:new"), inlineButton("Done", "admin:filter:done")]);
  rows.push(...slice.controls.inline_keyboard);
  rows.push([inlineButton("Back to menu", "menu:main")]);
  return { page: slice.page, totalPages: slice.totalPages, keyboard: inlineKeyboard(rows) };
}

async function desk(ctx: Ctx, filter: Filter = "all", page = 0, edit = false): Promise<void> {
  const leads = filterLeads(await listLeads(ctx), filter);
  if (leads.length === 0) {
    const text = filter === "all" ? "No leads yet — new enquiries will appear here." : `No ${filter} leads right now.`;
    const markup = inlineKeyboard([[inlineButton("All", "admin:filter:all"), inlineButton("New", "admin:filter:new"), inlineButton("Done", "admin:filter:done")], [inlineButton("Back to menu", "menu:main")]]);
    if (edit) await ctx.editMessageText(text, { reply_markup: markup });
    else await ctx.reply(text, { reply_markup: markup });
    return;
  }
  const view = pageKeyboard(leads, filter, page);
  const label = filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1);
  const text = `Leads · ${label} · Page ${view.page + 1} of ${view.totalPages}`;
  if (edit) await ctx.editMessageText(text, { reply_markup: view.keyboard });
  else await ctx.reply(text, { reply_markup: view.keyboard });
}

function detail(lead: Lead): string {
  return `Lead details\n\nName: ${lead.name}\nPhone: ${lead.phone}\nInterest: ${lead.intent}\nNote: ${lead.note}\nStatus: ${lead.status}`;
}

async function ownerCallback(ctx: Ctx): Promise<boolean> {
  if (!(await requireOwner(ctx as unknown as OwnerAwareCtx))) return false;
  await ctx.answerCallbackQuery();
  return true;
}

composer.command("admin", async (ctx) => {
  if (!(await requireOwner(ctx as unknown as OwnerAwareCtx))) return;
  try { await desk(ctx); } catch { await ctx.reply("Leads aren’t available right now. Please try again."); }
});

composer.callbackQuery("admin:open", async (ctx) => {
  if (!(await ownerCallback(ctx))) return;
  try { await desk(ctx, "all", 0, true); } catch { await ctx.reply("Leads aren’t available right now. Please try again."); }
});

composer.callbackQuery(["admin:filter:all", "admin:filter:new", "admin:filter:done"], async (ctx) => {
  if (!(await ownerCallback(ctx))) return;
  const filter = ctx.callbackQuery.data.split(":").at(-1) as Filter;
  try { await desk(ctx, filter, 0, true); } catch { await ctx.reply("Leads aren’t available right now. Please try again."); }
});

composer.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  const page = /^admin:page:(all|new|done):(prev|next):(\d+)$/.exec(data);
  if (page) {
    if (!(await ownerCallback(ctx))) return;
    try { await desk(ctx, page[1] as Filter, Number(page[3]), true); } catch { await ctx.reply("Leads aren’t available right now. Please try again."); }
    return;
  }
  const selected = /^admin:lead:([0-9a-f-]+)$/.exec(data);
  if (selected) {
    if (!(await ownerCallback(ctx))) return;
    try {
      const lead = await getLead(ctx, selected[1]);
      if (!lead) return ctx.reply("That lead is no longer available.");
      await ctx.editMessageText(detail(lead), { reply_markup: actions(lead) });
    } catch { await ctx.reply("Leads aren’t available right now. Please try again."); }
    return;
  }
  const status = /^admin:status:([0-9a-f-]+):(New|Done)$/.exec(data);
  if (status) {
    if (!(await ownerCallback(ctx))) return;
    try {
      const lead = await updateLeadStatus(ctx, status[1], status[2] as LeadStatus);
      if (!lead) return ctx.reply("That lead is no longer available.");
      await ctx.editMessageText(detail(lead), { reply_markup: actions(lead) });
    } catch { await ctx.reply("The lead status couldn’t be updated. Please try again."); }
    return;
  }
  const removed = /^admin:delete:([0-9a-f-]+)$/.exec(data);
  if (removed) {
    if (!(await ownerCallback(ctx))) return;
    try {
      if (!(await deleteLead(ctx, removed[1]))) return ctx.reply("That lead is no longer available.");
      await ctx.editMessageText("The lead has been deleted.", { reply_markup: inlineKeyboard([[inlineButton("Back to leads", "admin:open")]]) });
    } catch { await ctx.reply("The lead couldn’t be deleted. Please try again."); }
    return;
  }
  return next();
});

function actions(lead: Lead) {
  return inlineKeyboard([
    [inlineButton("Mark new", `admin:status:${lead.id}:New`), inlineButton("Mark done", `admin:status:${lead.id}:Done`)],
    [inlineButton("Delete", `admin:delete:${lead.id}`), inlineButton("Back to leads", "admin:open")],
  ]);
}

export default composer;
