// Icon library fallback chain and name mapping for figma.loadIcon().
// ─── Icon library config ──────────────────────────────────────────────────────
// Priority order: iOS-style filled → Win11 filled → Bootstrap filled → Phosphor filled
//                 → Tabler filled → Tabler outline → Lucide (outline fallback)
// v2.5.5+: Added Ionicons (iOS-native filled, replaces Icons8 ios-filled use case)
//          + Tabler filled (4500+ icons, broadest coverage).
export const ICON_LIBRARIES = [
  // iOS-style filled (default-filled, outline/sharp variants via suffix)
  { name: "ionicons",     urlFn: (n) => `https://unpkg.com/ionicons@7.4.0/dist/svg/${n}.svg`,                                                         fillType: "none" },
  // Win11 Fluent filled (Microsoft)
  { name: "fluent",       urlFn: (n) => `https://unpkg.com/@fluentui/svg-icons/icons/${n.replace(/-/g, "_")}_24_filled.svg`,                           fillType: "fill" },
  // Bootstrap filled
  { name: "bootstrap",    urlFn: (n) => `https://unpkg.com/bootstrap-icons@1.11.3/icons/${n}-fill.svg`,                                                fillType: "fill" },
  // Phosphor filled
  { name: "phosphor",     urlFn: (n) => `https://unpkg.com/@phosphor-icons/core@latest/assets/fill/${n}-fill.svg`,                                     fillType: "fill" },
  // Tabler filled — 4,500+ icons, broadest coverage of filled-style
  { name: "tabler-filled",urlFn: (n) => `https://unpkg.com/@tabler/icons@3.24.0/icons/filled/${n}.svg`,                                                fillType: "fill" },
  // Tabler outline — very thorough outline set
  { name: "tabler",       urlFn: (n) => `https://unpkg.com/@tabler/icons@3.24.0/icons/outline/${n}.svg`,                                               fillType: "stroke" },
  // Lucide — last resort outline
  { name: "lucide",       urlFn: (n) => `https://unpkg.com/lucide-static@0.577.0/icons/${n}.svg`,                                                      fillType: "stroke" },
];

// BUG-04: suggest correct Ionicons name when user passes Material Icons naming
export const MATERIAL_TO_IONICONS = {
  local_cafe: "cafe", local_bar: "wine", local_pizza: "pizza", local_dining: "restaurant",
  spa: "leaf", grass: "leaf", nature: "leaf", park: "leaf", eco: "leaf",
  notifications: "notifications", alarm: "alarm", schedule: "time", access_time: "time",
  favorite: "heart", thumb_up: "thumbs-up", thumb_down: "thumbs-down",
  visibility: "eye", visibility_off: "eye-off",
  arrow_back: "arrow-back", arrow_forward: "arrow-forward", arrow_upward: "arrow-up", arrow_downward: "arrow-down",
  chevron_left: "chevron-back", chevron_right: "chevron-forward", expand_more: "chevron-down", expand_less: "chevron-up",
  close: "close", check: "checkmark", check_circle: "checkmark-circle", error: "close-circle",
  add: "add", remove: "remove", edit: "create", delete: "trash",
  shopping_cart: "cart", shopping_bag: "bag",
  settings: "settings", account_circle: "person-circle", person: "person", group: "people",
  search: "search", filter_list: "filter", sort: "swap-vertical",
  menu: "menu", more_horiz: "ellipsis-horizontal", more_vert: "ellipsis-vertical",
  home: "home", star: "star", bookmark: "bookmark", lock: "lock-closed", lock_open: "lock-open",
  email: "mail", phone: "call", chat: "chatbubble", message: "chatbox",
  share: "share", download: "download", upload: "cloud-upload",
  play_arrow: "play", pause: "pause", stop: "stop", skip_next: "play-skip-forward", skip_previous: "play-skip-back",
  volume_up: "volume-high", volume_off: "volume-mute",
  camera_alt: "camera", photo: "image", videocam: "videocam",
  attach_file: "attach", link: "link", refresh: "refresh",
  warning: "warning", info: "information-circle", help: "help-circle",
};

