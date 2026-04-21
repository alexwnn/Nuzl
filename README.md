# NUZL
### A Real-Time Multiplayer Pokémon Soul Link Tracker.

[![Vercel Deployment](https://img.shields.io/badge/Deployment-Live-success?style=flat-square)](YOUR_VERCEL_URL)
[![Tech Stack](https://img.shields.io/badge/Stack-Next.js%20|%20Supabase%20|%20Tailwind-blue?style=flat-square)](#tech-stack)

---

## 01. Overview
Nuzl is a specialized tracking utility designed for high-difficulty Pokémon ROM hacks (e.g., Radical Red, Elite Redux) and Soul Link challenges. Unlike static spreadsheets, Nuzl provides a real-time, synchronized environment for multiple players to manage encounters, team synergy, and graveyard states simultaneously.

<img width="1512" height="1322" alt="Screenshot 2026-04-20 at 8 26 04 PM" src="https://github.com/user-attachments/assets/5d8e8676-82a1-4f89-b28e-e36a4604c9f1" />

---

## 02. Core Features

### Real-Time Synchronization
Powered by Supabase Realtime. When one player updates an encounter, evolves a Pokémon, or moves a pair to the PC, the change is reflected instantly on all connected devices without a page refresh.

### Strategic Weakness Matrix
A data-driven defensive overview. The matrix calculates the net defensive profile of your active team across all 18 types, automatically accounting for dual-type 4x weaknesses and resistances.

<img width="1512" height="400" alt="Screenshot 2026-04-20 at 8 29 22 PM" src="https://github.com/user-attachments/assets/5776fb2c-0183-4b93-ac06-0efc213684f8" />

### The Theme Engine
Customizable UI aesthetics. Users can toggle between independent Font Stacks (Modern, Terminal, Classic) and Accent Colors to create a personalized, high-contrast workspace.

### Session Isolation
Zero-auth room system. Generate a unique session slug (e.g., `/session/blue-riolu-778`) and share the link to invite partners. Data is strictly isolated by URL parameters.

---

## 03. Tech Stack
Built for type-safety and low-latency data flow.

- **Framework:** Next.js 14 (App Router)
- **Database:** PostgreSQL via Supabase
- **Realtime:** Supabase WebSockets (Replication)
- **Styling:** Tailwind CSS + Framer Motion
- **Typography:** Source Code Pro / JetBrains Mono

---

## 04. Interface Showcase

| Feature | Description | Preview |
| :--- | :--- | :--- |
| **Soul Link Intel** | Real-time analysis of base stats and type effectiveness for active pairs. | **[IMAGE: Intel Card]** |
| **The PC Box** | Organized storage for backup pairs with 1px industrial grid styling. | **[IMAGE: PC Box]** |
| **The Graveyard** | Persistent tracking of failed encounters and lost pairs. | **[IMAGE: Graveyard]** |

---
