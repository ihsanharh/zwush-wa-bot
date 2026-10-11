import { proto } from "zapo-js";
import { formatRupiah, formatStatusBadge, t, type Language } from "../i18n";
import { config } from "../config";
import type { CategoryDefinition } from "./categories";
import type { CatalogItem, OrderInfo } from "../types";

/**
 * Builds Category List Menu (Single Select Drawer)
 */
export function buildCategoryListMenu(
    categories: CategoryDefinition[],
    lang: Language = "id"
): { listMessage: any } {
    const store = config.STORE_NAME;
    const title = t("interactive.categoryListTitle", lang, { store });
    const description = t("interactive.categoryListDesc", lang);
    const buttonText = t("interactive.categoryListBtn", lang);

    const rows = categories.map((cat) => ({
        rowId: `cat_${cat.dbCategory}`,
        title: cat.displayName.replace(/^\d+\.\s*/, ""),
        description: cat.displayPrice || ""
    }));

    return {
        listMessage: {
            title,
            description,
            buttonText,
            footerText: `${store} • The Hive Bedrock`,
            listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            sections: [
                {
                    title,
                    rows
                }
            ]
        }
    };
}

/**
 * Builds Paginated Item List Menu with navigation controls
 */
export function buildPaginatedItemListMenu(
    items: CatalogItem[],
    category: CategoryDefinition,
    page: number = 1,
    pageSize: number = 8,
    lang: Language = "id"
): { listMessage: any } {
    const store = config.STORE_NAME;
    const activeItems = items.filter((i) => i.active && i.category === category.dbCategory);
    const totalPages = Math.max(1, Math.ceil(activeItems.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const startIdx = (safePage - 1) * pageSize;
    const pageItems = activeItems.slice(startIdx, startIdx + pageSize);

    const itemRows = pageItems.map((item) => {
        const priceStr = formatRupiah(item.rupiahPrice);
        const discountStr = item.discountPercent ? ` (${item.discountPercent}% OFF)` : "";
        return {
            rowId: `item_${item.sku || item.name}`,
            title: item.name,
            description: `${priceStr}${discountStr}`
        };
    });

    const navRows: Array<{ rowId: string; title: string; description?: string }> = [];

    if (safePage < totalPages) {
        navRows.push({
            rowId: `nav_page_${safePage + 1}`,
            title: t("interactive.navNextPage", lang, { nextPage: safePage + 1, totalPages }),
            description: t("interactive.itemsListBtn", lang)
        });
    }

    if (safePage > 1) {
        navRows.push({
            rowId: `nav_page_${safePage - 1}`,
            title: t("interactive.navPrevPage", lang, { prevPage: safePage - 1, totalPages }),
            description: t("interactive.itemsListBtn", lang)
        });
    }

    navRows.push({
        rowId: "nav_change_cat",
        title: t("interactive.navChangeCategory", lang)
    });

    const categoryTitle = t("interactive.itemsListTitle", lang, { categoryName: category.displayName });

    return {
        listMessage: {
            title: categoryTitle,
            description: `${t("interactive.itemsListBtn", lang)} (${safePage}/${totalPages})`,
            buttonText: t("interactive.itemsListBtn", lang),
            footerText: `${store} • The Hive Bedrock`,
            listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            sections: [
                {
                    title: categoryTitle,
                    rows: itemRows
                },
                {
                    title: t("interactive.navSectionTitle", lang),
                    rows: navRows
                }
            ]
        }
    };
}

/**
 * Builds Gamertag Prompt Buttons (Quick Reply buttons: [Ganti Item], [Batalkan Pesanan])
 * Supports attaching an item image directly to the interactive card header.
 */
export function buildGamertagPromptButtons(
    promptText: string,
    lang: Language = "id",
    headerImage?: Buffer | any
): {
    interactiveMessage: any;
    text: string;
    buttons: Array<{ id: string; text: string }>;
    headerImage?: Buffer;
} {
    const store = config.STORE_NAME;
    const buttons = [
        {
            id: "btn_modify_change_item",
            text: t("buttons.changeItem", lang)
        },
        {
            id: "btn_cancel_order",
            text: t("buttons.cancelOrder", lang)
        }
    ];

    const interactiveMessage: any = {
        body: { text: promptText },
        footer: { text: store },
        nativeFlowMessage: {
            messageVersion: 1,
            buttons: buttons.map((btn) => ({
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: btn.text,
                    id: btn.id
                })
            }))
        }
    };

    if (
        headerImage &&
        typeof headerImage === "object" &&
        !Buffer.isBuffer(headerImage) &&
        (headerImage.url || headerImage.directPath)
    ) {
        interactiveMessage.header = {
            hasMediaAttachment: true,
            imageMessage: headerImage
        };
    }

    return {
        text: promptText,
        buttons,
        headerImage: Buffer.isBuffer(headerImage) ? headerImage : undefined,
        interactiveMessage
    };
}

/**
 * Builds Order Confirmation Buttons (Max 3 buttons for Meta limits)
 */
export function buildOrderConfirmationButtons(
    orderSummaryText: string,
    hasVoucher: boolean = false,
    lang: Language = "id"
): { interactiveMessage: any } {
    const store = config.STORE_NAME;

    const voucherBtnText = hasVoucher
        ? t("buttons.removeVoucher", lang)
        : t("buttons.applyVoucher", lang);

    const voucherBtnId = hasVoucher ? "btn_remove_voucher" : "btn_open_voucher";

    return {
        interactiveMessage: {
            body: { text: orderSummaryText },
            footer: { text: `${store} • Automated Checkout` },
            nativeFlowMessage: {
                messageVersion: 1,
                buttons: [
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: t("buttons.confirmOrder", lang),
                            id: "btn_confirm_order"
                        })
                    },
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: voucherBtnText,
                            id: voucherBtnId
                        })
                    },
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: t("buttons.modifyMenu", lang),
                            id: "btn_modify_menu"
                        })
                    }
                ]
            }
        }
    };
}

/**
 * Builds Modify Order Sub-Menu (Single Select List)
 */
export function buildModifyOrderListMenu(lang: Language = "id"): { listMessage: any } {
    const store = config.STORE_NAME;
    return {
        listMessage: {
            title: t("interactive.modifyMenuTitle", lang),
            description: t("interactive.modifyMenuDesc", lang),
            buttonText: t("buttons.modifyMenu", lang),
            footerText: store,
            listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            sections: [
                {
                    title: t("interactive.modifyMenuTitle", lang),
                    rows: [
                        {
                            rowId: "opt_change_gamertag",
                            title: t("interactive.modifyGamertag", lang)
                        },
                        {
                            rowId: "opt_change_item",
                            title: t("interactive.modifyItem", lang)
                        },
                        {
                            rowId: "opt_cancel_order",
                            title: t("interactive.modifyCancel", lang)
                        }
                    ]
                }
            ]
        }
    };
}

/**
 * Builds Invoice Buttons (QRIS payment card)
 */
export function buildInvoiceButtons(
    invoiceText: string,
    lang: Language = "id"
): { interactiveMessage: any } {
    const store = config.STORE_NAME;
    return {
        interactiveMessage: {
            body: { text: invoiceText },
            footer: { text: `${store} • QRIS Dinamis` },
            nativeFlowMessage: {
                messageVersion: 1,
                buttons: [
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: t("buttons.checkPayment", lang),
                            id: "btn_check_payment"
                        })
                    },
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: t("buttons.cancelOrder", lang),
                            id: "btn_cancel_order"
                        })
                    }
                ]
            }
        }
    };
}

/**
 * Builds Support Confirmation Buttons
 */
export function buildSupportPromptButtons(lang: Language = "id"): { interactiveMessage: any } {
    const store = config.STORE_NAME;
    return {
        interactiveMessage: {
            body: { text: t("support.greeting", lang) },
            footer: { text: `${store} • Support` },
            nativeFlowMessage: {
                messageVersion: 1,
                buttons: [
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: t("buttons.contactAdmin", lang),
                            id: "btn_support_confirm"
                        })
                    },
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: t("buttons.backToShop", lang),
                            id: "btn_support_cancel"
                        })
                    }
                ]
            }
        }
    };
}

/**
 * Builds Admin Panel Dashboard Menu
 */
export function buildAdminPanelMenu(
    dataOrLang: { storeName?: string; adminGid?: string; logGid?: string } | Language = "id",
    lang: Language = "id"
): { listMessage: any } {
    const activeLang: Language = typeof dataOrLang === "string" ? dataOrLang : lang;
    const store = (typeof dataOrLang === "object" && dataOrLang?.storeName) || config.STORE_NAME;

    return {
        listMessage: {
            title: t("interactive.adminPanelTitle", activeLang),
            description: t("interactive.adminPanelDesc", activeLang),
            buttonText: t("interactive.adminPanelBtn", activeLang) || "Menu Admin",
            footerText: `${store} • Admin Control`,
            listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            sections: [
                {
                    title: t("interactive.adminPanelTitle", lang),
                    rows: [
                        {
                            rowId: "admin_cmd_balance",
                            title: t("interactive.adminBtnBalance", lang)
                        },
                        {
                            rowId: "admin_cmd_orders",
                            title: t("interactive.adminBtnOrders", lang)
                        },
                        {
                            rowId: "admin_cmd_sync",
                            title: t("interactive.adminBtnSync", lang)
                        },
                        {
                            rowId: "admin_cmd_voucher",
                            title: t("interactive.adminBtnVoucher", lang)
                        },
                        {
                            rowId: "admin_cmd_discount",
                            title: t("interactive.adminBtnDiscount", lang)
                        }
                    ]
                }
            ]
        }
    };
}

/**
 * Builds Quick Action Buttons for New Orders in Admin Log Group (Paid & Done)
 */
export function buildAdminOrderActionButtons(
    orderId: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const text = `Aksi Cepat Admin — Order #${orderId}:`;
    const buttons = [
        { id: `btn_admin_paid_${orderId}`, text: "✅ Tandai Paid" },
        { id: `btn_admin_done_${orderId}`, text: "🚀 Proses / Done" }
    ];
    return {
        interactiveMessage: {
            body: { text },
            nativeFlowMessage: {
                messageVersion: 1,
                buttons: buttons.map((btn) => ({
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.text,
                        id: btn.id
                    })
                }))
            }
        },
        text,
        buttons
    };
}

/**
 * Builds Quick Retry Buttons for Failed or Held Orders in Admin Log Group
 */
export function buildAdminOrderFailureButtons(
    orderId: string,
    failureReason?: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const reason = failureReason || "Kendala pemrosesan The Hive";
    const text = `⚠️ *KENDALA PESANAN #${orderId}*\nAlasan: *${reason}*\n\n👉 Silakan periksa kendala di atas, lalu klik tombol di bawah untuk mencoba memproses kembali:`;
    const buttons = [
        { id: `btn_admin_reprocess_${orderId}`, text: "🔄 Retry Order" }
    ];
    return {
        interactiveMessage: {
            body: { text },
            nativeFlowMessage: {
                messageVersion: 1,
                buttons: buttons.map((btn) => ({
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.text,
                        id: btn.id
                    })
                }))
            }
        },
        text,
        buttons
    };
}

/**
 * Builds Live Chat Ticket Solved Button for Admin Group
 */
export function buildAdminSupportSolvedButtons(
    target: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const text = `💡 *Setelah selesai membantu pelanggan, klik tombol di bawah untuk mengaktifkan bot kembali:*`;
    const buttons = [
        { id: `btn_admin_solved_${target}`, text: "✅ Selesai / Solved" }
    ];
    return {
        interactiveMessage: {
            body: { text },
            nativeFlowMessage: {
                messageVersion: 1,
                buttons: buttons.map((btn) => ({
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.text,
                        id: btn.id
                    })
                }))
            }
        },
        text,
        buttons
    };
}

/**
 * Builds Welcome Quick-Reply Buttons (Catalog, History, Settings)
 */
export function buildWelcomeButtons(lang: Language = "id"): { interactiveMessage: any } {
    const store = config.STORE_NAME;
    const bodyText = t("greeting", lang);
    return {
        interactiveMessage: {
            body: { text: bodyText },
            footer: { text: `${store} • The Hive Bedrock` },
            nativeFlowMessage: {
                messageVersion: 1,
                buttons: [
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: t("buttons.browseCatalog", lang),
                            id: "btn_start_buying"
                        })
                    },
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: t("buttons.orderHistory", lang),
                            id: "btn_history"
                        })
                    },
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: t("buttons.settingsAndInfo", lang),
                            id: "btn_settings"
                        })
                    }
                ]
            }
        }
    };
}

/**
 * Builds Settings & Information List Menu (Drawer)
 */
export function buildSettingsListMenu(lang: Language = "id"): { listMessage: any } {
    const store = config.STORE_NAME;
    const title = t("interactive.settingsTitle", lang);
    const description = t("interactive.settingsDesc", lang);
    const buttonText = t("interactive.settingsBtn", lang);

    const switchLangTitle = lang === "id" ? t("interactive.switchLangEn", lang) : t("interactive.switchLangId", lang);
    const switchLangDesc = lang === "id" ? t("interactive.switchLangEnDesc", lang) : t("interactive.switchLangIdDesc", lang);

    return {
        listMessage: {
            title,
            description,
            buttonText,
            footerText: `${store} • The Hive Bedrock`,
            listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            sections: [
                {
                    title,
                    rows: [
                        {
                            rowId: "act_switch_lang",
                            title: switchLangTitle,
                            description: switchLangDesc
                        },
                        {
                            rowId: "act_view_faq",
                            title: t("interactive.faqTitle", lang),
                            description: t("interactive.faqDesc", lang)
                        }
                    ]
                }
            ]
        }
    };
}

/**
 * Builds Paginated Order History Buttons (Card text + Quick Reply buttons)
 */
export function buildOrderHistoryButtons(
    orders: OrderInfo[],
    page: number = 1,
    pageSize: number = 5,
    lang: Language = "id"
): {
    interactiveMessage: any;
    text: string;
    buttons: Array<{ id: string; text: string }>;
} {
    const store = config.STORE_NAME;
    const totalPages = Math.max(1, Math.ceil(orders.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const startIdx = (safePage - 1) * pageSize;
    const pageOrders = orders.slice(startIdx, startIdx + pageSize);

    let out = t("history.pageTitle", lang, { page: safePage, totalPages, store });

    pageOrders.forEach((ord, idx) => {
        const globalIdx = startIdx + idx + 1;
        const badge = formatStatusBadge(ord.status, lang, ord.failureReason);
        out += `${globalIdx}. *#${ord.id}* — ${badge}\n`;
        out += `   📦 ${ord.itemName} (${ord.gamertag})\n`;
        out += `   💰 ${formatRupiah(ord.totalNominal)}\n\n`;
    });

    out += t("history.footer", lang);

    const buttonsList: Array<{ id: string; text: string }> = [];

    if (safePage > 1) {
        buttonsList.push({
            id: `btn_hist_page_${safePage - 1}`,
            text: t("buttons.prevPage", lang)
        });
    }

    if (safePage < totalPages) {
        const nextLabel = t("buttons.nextPage", lang, { nextPage: safePage + 1, totalPages });
        const safeNextLabel = nextLabel.length <= 20 ? nextLabel : t("buttons.nextPageShort", lang);
        buttonsList.push({
            id: `btn_hist_page_${safePage + 1}`,
            text: safeNextLabel
        });
    }

    buttonsList.push({
        id: "btn_start_buying",
        text: t("buttons.browseCatalog", lang)
    });

    const nativeButtons = buttonsList.map((btn) => ({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
            display_text: btn.text,
            id: btn.id
        })
    }));

    return {
        interactiveMessage: {
            body: { text: out },
            footer: { text: `${store} • The Hive Bedrock` },
            nativeFlowMessage: {
                messageVersion: 1,
                buttons: nativeButtons
            }
        },
        text: out,
        buttons: buttonsList
    };
}

