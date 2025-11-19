/**
 * NoDelete Patched — rebuilt for Revenge compatibility
 * (Full code)
 */

import { storage } from "@vendetta/plugin";
import { findByStoreName, findByProps } from "@vendetta/metro";
import { FluxDispatcher, moment } from "@vendetta/metro/common";
import { before as patchBefore } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";
import { findInReactTree } from "@vendetta/utils";

/* ---------- Defaults ---------- */
const STORAGE_KEY = "NoDeletePatched";
const DEFAULTS = {
  enabled: true,
  timestamps: false,
  ew: false,
  ignore: {
    users: [],
    channels: [],
    bots: false,
  },
};

/* Initialize storage */
function initStorage() {
  if (!storage[STORAGE_KEY]) storage[STORAGE_KEY] = {};
  const s = storage[STORAGE_KEY];
  if (typeof s.enabled !== "boolean") s.enabled = DEFAULTS.enabled;
  if (typeof s.timestamps !== "boolean") s.timestamps = DEFAULTS.timestamps;
  if (typeof s.ew !== "boolean") s.ew = DEFAULTS.ew;
  if (!s.ignore) s.ignore = { users: [], channels: [], bots: false };
  if (!Array.isArray(s.ignore.users)) s.ignore.users = [];
  if (!Array.isArray(s.ignore.channels)) s.ignore.channels = [];
  if (typeof s.ignore.bots !== "boolean") s.ignore.bots = false;
  storage[STORAGE_KEY] = s;
}

let _patches = [];
let _messageStore = null;
let _deleteable = [];

const isEnabled = () => (storage[STORAGE_KEY] && storage[STORAGE_KEY].enabled) ?? DEFAULTS.enabled;
const getStorage = () => storage[STORAGE_KEY] || DEFAULTS;

function safeFindMessageStore() {
  if (!_messageStore) {
    try {
      _messageStore = findByStoreName("MessageStore");
      if (!_messageStore) _messageStore = findByProps("getMessage", "getMessages");
    } catch (e) {
      _messageStore = null;
      console.error("[NoDeletePatched] MessageStore lookup error", e);
    }
  }
  return _messageStore;
}

/* Delete Intercept */
function createDeleteDispatcherPatch() {
  const unsub = patchBefore("dispatch", FluxDispatcher, (args) => {
    try {
      if (!isEnabled()) return args;
      const event = args[0];
      if (!event || event.type !== "MESSAGE_DELETE") return args;
      if (!event.id || !event.channelId) return args;

      const ms = safeFindMessageStore();
      const message = ms?.getMessage ? ms.getMessage(event.channelId, event.id) : null;

      const s = getStorage();
      if (s.ignore?.users?.includes(message?.author?.id)) return args;
      if (s.ignore?.bots && message?.author?.bot) return args;

      if (_deleteable.includes(event.id)) {
        _deleteable.splice(_deleteable.indexOf(event.id), 1);
        return args;
      }
      _deleteable.push(event.id);

      let automodMessage = "This message was deleted";
      if (s.timestamps) {
        automodMessage += ` (${moment().format(s.ew ? "hh:mm:ss.SS a" : "HH:mm:ss.SS")})`;
      }

      args[0] = {
        type: "MESSAGE_EDIT_FAILED_AUTOMOD",
        messageData: {
          type: 1,
          message: {
            channelId: event.channelId,
            messageId: event.id,
          },
        },
        errorResponseBody: {
          code: 200000,
          message: automodMessage,
        },
      };

      return args;
    } catch (e) {
      console.error("[NoDeletePatched] dispatcher patch error", e);
      return args;
    }
  });

  return () => unsub && unsub();
}

/* Edit Logger */
function createEditLoggerSubscription() {
  try {
    const sub = FluxDispatcher.subscribe("MESSAGE_UPDATE", (payload) => {
      try {
        if (!isEnabled()) return;
        const ms = safeFindMessageStore();
        const msgBefore = ms?.getMessage ? ms.getMessage(
          payload?.message?.channel_id ?? payload?.message?.channelId,
          payload?.message?.id
        ) : null;

        const oldContent = msgBefore?.content ?? "";
        const newContent = payload?.message?.content ?? "";

        if (oldContent !== newContent) {
          console.log("[NoDeletePatched][edit]", {
            id: payload?.message?.id,
            old: oldContent,
            new: newContent,
          });
        }
      } catch (e) {}
    });

    return () => {
      try { sub && sub(); } catch (e) {}
    };
  } catch (e) {
    return () => {};
  }
}

/* Context Menu (Ignore User) */
function createContextMenuPatch() {
  try {
    const unpatch = patchBefore("render", findByProps("ScrollView").View, (args) => {
      try {
        const a = findInReactTree(args, (r) => r.key === ".$UserProfileOverflow");
        if (!a || !a.props || a.props.sheetKey !== "UserProfileOverflow") return;
        const props = a.props.content.props;

        if (props.options.some((o) => o.label?.includes("IGNORE"))) return;

        const focusedUserId = Object.keys(a._owner.stateNode._keyChildMapping)
          .find((k) => k.includes("$UserProfile"))
          ?.replace(".$UserProfile", "");

        props.options.push({
          label: "IGNORE USER",
          isDestructive: true,
          onPress: () => {
            const s = getStorage();
            s.ignore.users.push(focusedUserId);
            storage[STORAGE_KEY] = s;
            showToast("Now ignoring user");
            props.hideActionSheet();
          }
        });
      } catch (e) {}
    });

    return () => unpatch && unpatch();
  } catch (e) {
    return () => {};
  }
}

/* Plugin Definition */
export default {
  onLoad() {
    initStorage();
    showToast(`[NoDeletePatched] ${isEnabled() ? "enabled" : "disabled"}`);

    const u1 = createDeleteDispatcherPatch();
    const u2 = createEditLoggerSubscription();
    const u3 = createContextMenuPatch();

    _patches.push(u1, u2, u3);
  },

  onUnload() {
    for (const u of _patches) try { u(); } catch(e){}
    _patches = [];
    showToast("[NoDeletePatched] unloaded");
  },

  getSettingsPanel() { return null; },
};
