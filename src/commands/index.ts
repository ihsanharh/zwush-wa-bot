import { CommandRegistry } from "./registry";
import type { Command } from "./types";

// General Commands
import menuCommand from "./general/menu";
import catalogCommand from "./general/catalog";
import statusCommand from "./general/status";
import historyCommand from "./general/history";
import faqCommand from "./general/faq";
import helpCommand from "./general/help";
import supportCommand from "./general/support";
import cancelCommand from "./general/cancel";
import languageCommand from "./general/language";

// Admin Commands
import adminCommand from "./admin/admin";
import balanceCommand from "./admin/balance";
import paidCommand from "./admin/paid";
import reprocessCommand from "./admin/reprocess";
import discountCommand from "./admin/discount";
import voucherCommand from "./admin/voucher";
import solvedCommand from "./admin/solved";
import setgroupCommand from "./admin/setgroup";

export const allCommands: Command[] = [
    menuCommand,
    catalogCommand,
    statusCommand,
    historyCommand,
    faqCommand,
    helpCommand,
    supportCommand,
    cancelCommand,
    languageCommand,
    adminCommand,
    balanceCommand,
    paidCommand,
    reprocessCommand,
    discountCommand,
    voucherCommand,
    solvedCommand,
    setgroupCommand,
];

export const defaultRegistry = new CommandRegistry();

for (const cmd of allCommands) {
    defaultRegistry.register(cmd);
}

export * from "./types";
export * from "./registry";
