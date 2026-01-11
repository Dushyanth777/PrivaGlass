# 🌿 PrivaGlass

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Privacy: Local](https://img.shields.io/badge/Privacy-100%25%20Local-00a884.svg)](#-privacy-commitment)

> **Premium, Privacy-First WhatsApp Chat Archive Explorer**

PrivaGlass is a high-fidelity local viewer for WhatsApp chat exports. It transforms raw text logs into a beautiful, interactive interface that mirrors the modern WhatsApp experience—all while keeping your data **100% private** and on your machine.

---

## ✨ Key Features

*   **🎨 High-Fidelity Design**: A pixel-perfect recreation of the WhatsApp UI, including glassmorphism headers and native typography.
*   **📅 Smart Date Formatting**: Automatically converts various export timestamps (e.g., `5/26/23`) into a readable `26 May 2023` format.
*   **🔒 Private & Local**: Zero data ever leaves your device. Parsing is done entirely via client-side JavaScript.
*   **⚡ High Performance**: Smoothly handles archives with 100,000+ messages using batched rendering and IndexedDB caching.
*   **📸 Media Integration**: Drop a `.zip` export to see your photos, stickers, and videos inline.
*   **🔍 Power Tools**: Search through years of history instantly or filter by specific date ranges.

---

## 🚀 Quick Start

1.  **Export Your Chat**: In WhatsApp, open a conversation → Tap the name → **Export Chat** → Select **Attach Media**.
2.  **Open PrivaGlass**: Launch the application in any modern browser.
3.  **Import**: Select your exported `.zip` (for media) or `.txt` (text only) file.
4.  **Explore**: Scroll through your memories with the familiar look and feel you love.

---

## 🛠️ Technical Stack

*   **Framework**: [React 19](https://react.dev/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **Archive Parsing**: [JSZip](https://stuk.github.io/jszip/)
*   **Local Storage**: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) for blazing fast re-loads.

---

## 🛡️ Privacy Commitment

PrivaGlass is built on the principle that your personal conversations should stay personal.
- **No Tracking**: We don't use cookies or analytics.
- **No Cloud**: There is no backend server.
- **Open Source**: The code is transparent and auditable.

---

## ⚖️ License

Distributed under the **MIT License**. See the [LICENSE](./LICENSE) file for the full text.

---
*Disclaimer: This project is independent and not affiliated with WhatsApp Inc. or Meta Platforms, Inc.*