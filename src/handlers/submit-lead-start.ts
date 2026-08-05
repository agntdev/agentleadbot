import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { now } from "../leads/clock.js";
import { createLead, type LeadIntent } from "../leads/store.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Submit a lead", data: "submit_lead:start", order: 10 });

const composer = new Composer<Ctx>();
const forceReply = { force_reply: true } as const;

function short(value: string): string | undefined {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length > 0 && clean.length <= 120 ? clean : undefined;
}

function validPhone(value: string): string | undefined {
  const clean = value.trim();
  const digits = clean.replace(/\D/g, "");
  return /^[+0-9() -]+$/.test(clean) && digits.length >= 7 && digits.length <= 15 ? clean : undefined;
}

function summary(draft: NonNullable<Ctx["session"]["leadDraft"]>): string {
  return `Please confirm your lead details:\n\nName: ${draft.name}\nPhone: ${draft.phone}\nInterest: ${draft.intent}\nNote: ${draft.note}`;
}

async function askName(ctx: Ctx): Promise<void> {
  ctx.session.leadDraft = { step: "name" };
  await ctx.reply("What’s your name?", { reply_markup: forceReply });
}

composer.callbackQuery("submit_lead:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await askName(ctx);
});

composer.callbackQuery(["lead:intent:buy", "lead:intent:rent", "lead:intent:sell"], async (ctx) => {
  await ctx.answerCallbackQuery();
  const draft = ctx.session.leadDraft;
  if (!draft || draft.step !== "intent") {
    await ctx.reply("That form has expired. Tap Submit a lead to start again.");
    return;
  }
  const intent = ctx.callbackQuery.data.split(":").at(-1);
  draft.intent = ({ buy: "Buy", rent: "Rent", sell: "Sell" } as Record<string, LeadIntent>)[intent ?? ""];
  draft.step = "note";
  await ctx.reply("Add a short note about the property you need.", { reply_markup: forceReply });
});

composer.callbackQuery("lead:edit", async (ctx) => {
  await ctx.answerCallbackQuery();
  await askName(ctx);
});

composer.callbackQuery("lead:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  delete ctx.session.leadDraft;
  await ctx.editMessageText("Your lead wasn’t saved.", { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
});

composer.callbackQuery("lead:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const draft = ctx.session.leadDraft;
  if (!draft || draft.step !== "confirm" || !draft.name || !draft.phone || !draft.intent || !draft.note) {
    await ctx.reply("That form has expired. Tap Submit a lead to start again.");
    return;
  }
  const lead = {
    id: crypto.randomUUID(), name: draft.name, phone: draft.phone, intent: draft.intent,
    note: draft.note, status: "New" as const, submitted_at: now().toISOString(),
  };
  try {
    await createLead(ctx, lead);
  } catch {
    await ctx.reply("Your lead couldn’t be saved right now. Please try again.");
    return;
  }
  delete ctx.session.leadDraft;
  await ctx.editMessageText("Thanks — your details have been sent to the agent.", {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
  const owner = adminChatId(ctx as Ctx & { env?: Record<string, unknown> });
  if (owner) {
    try {
      await ctx.api.sendMessage(owner, `New property lead\n\nName: ${lead.name}\nPhone: ${lead.phone}\nInterest: ${lead.intent}\nNote: ${lead.note}`, {
        reply_markup: inlineKeyboard([[inlineButton("Open leads", "admin:open")]]),
      });
    } catch {
      // A notification failure must not undo a successfully saved lead.
    }
  }
});

composer.on("message:text", async (ctx, next) => {
  const draft = ctx.session.leadDraft;
  if (!draft) return next();
  const text = ctx.message.text;
  if (draft.step === "name") {
    const name = short(text);
    if (!name) return ctx.reply("Enter a name up to 120 characters.", { reply_markup: forceReply });
    draft.name = name; draft.step = "phone";
    return ctx.reply("What’s the best phone number to reach you on?", { reply_markup: forceReply });
  }
  if (draft.step === "phone") {
    const phone = validPhone(text);
    if (!phone) return ctx.reply("Enter a valid phone number, including the country code if needed.", { reply_markup: forceReply });
    draft.phone = phone; draft.step = "intent";
    return ctx.reply("What can the agent help you with?", { reply_markup: inlineKeyboard([[inlineButton("Buy", "lead:intent:buy"), inlineButton("Rent", "lead:intent:rent"), inlineButton("Sell", "lead:intent:sell")]]) });
  }
  if (draft.step === "note") {
    const note = short(text);
    if (!note) return ctx.reply("Add a short note so the agent can help.", { reply_markup: forceReply });
    draft.note = note; draft.step = "confirm";
    return ctx.reply(summary(draft), { reply_markup: inlineKeyboard([[inlineButton("Confirm", "lead:confirm"), inlineButton("Edit", "lead:edit")], [inlineButton("Cancel", "lead:cancel")]]) });
  }
  return next();
});

export default composer;
