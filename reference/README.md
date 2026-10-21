# Reference material (read only)

Source material folded into InkyPOS OG. Nothing here is built, tested or shipped; features are re-implemented on the 2.0 engine (`packages/core`, `apps/api`, `apps/pos`) as planned in [docs/INTEGRATION.md](../docs/INTEGRATION.md).

| Folder | What it is |
|---|---|
| `inky-pos-v1/` | InkyPOS first version (Expo, NativeWind, Zustand, device-only SQLite). Copied without `node_modules`, build output, its own git history, or `accounts-passwords.txt`. |
| `inkypos-2.0/` | Web prototype of InkyPOS 2.0 (Vite/React, AI Studio). |
| `restaurant-pos/` | Zimbabwean restaurant POS prototype (Vite/React): tables, sadza-and-relish orders, kitchen tracker, split bills, ingredient deduction, Bluetooth/RawBT printing. |
| `swiftscan-pos/` | Smart POS prototype as a native Android app (Kotlin, Jetpack Compose): scanning, inventory, reports, Bluetooth printing. |

The `.env.example` files contain placeholders only.
