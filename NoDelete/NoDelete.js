/**
 * RyzeLogger — Hybrid Delete + Edit Snipe
 * Fully Revenge-compatible (no forbidden imports)
 * Stable + non-crashing version
 */

import { storage } from "@vendetta/plugin";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";

const KEY = "RyzeLogger";
if (!storage[KEY]) storage[KEY] = { enabled: true };

const isEnabled = () => storage[KEY].enabled;

/* DELETE SNIPE — from stable Dumsane plugin */
function patchDeletes() {
    return before("dispatch", FluxDispatcher, (args) => {
        try {
            if (!isEnabled()) return args;
            const e = args[0];
            if (!e || e.type !== "MESSAGE_DELETE") return args;

            // Replace delete event with automod-style visible message
            args[0] = {
                type: "MESSAGE_EDIT_FAILED_AUTOMOD",
                messageData: {
                    type: 1,
                    message: {
                        channelId: e.channelId,
                        messageId: e.id,
                    },
                },
                errorResponseBody: {
                    code: 200000,
                    message: "This message was deleted",
                },
            };
            return args;
        } catch {
            return args;
        }
    });
}

/* EDIT SNIPE — from Angelix edit logger */
function patchEdits() {
    const unsub = FluxDispatcher.subscribe("MESSAGE_UPDATE", (payload) => {
        try {
            if (!isEnabled()) return;

            const oldContent = payload?.oldMessage?.content ?? "";
            const newContent = payload?.message?.content ?? "";

            if (oldContent !== newContent) {
                console.log("[EDIT SNIPE]", oldContent, "=>", newContent);
            }
        } catch {}
    });

    return () => {
        try { unsub(); } catch {}
    };
}

/* Plugin main */
export default {
    onLoad() {
        showToast("RyzeLogger Enabled");

        const u1 = patchDeletes();
        const u2 = patchEdits();

        this.unpatches = [u1, u2];
    },

    onUnload() {
        try {
            for (const u of this.unpatches) try { u(); } catch {}
        } catch {}
        showToast("RyzeLogger Disabled");
    },

    getSettingsPanel() {
        return null;
    }
};
