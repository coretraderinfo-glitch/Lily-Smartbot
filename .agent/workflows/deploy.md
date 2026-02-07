---
description: How to deploy Lily Smartbot to Railway.app
---

# 🚀 Lily Smartbot: Railway Deployment Guide

Follow these simple steps to put your bot online 24/7. No IT knowledge required!

## 1. Preparation
1. Go to [Railway.app](https://railway.app/) and sign in with your GitHub account.
2. Click **"New Project"**.

## 2. Connect the Code
1. Select **"Deploy from GitHub repo"**.
2. Find and select your repository: `Lily-Smartbot`.
3. Click **"Deploy Now"**. (It might fail the first time; that’s okay, we haven't added the database yet).

## 3. Add the Database
1. Inside your project, click **"New"** (the plus icon).
2. Select **"Database"** -> **"Add PostgreSQL"**.
3. Railway will now create your professional database automatically.

## 4. Set the Variables (The Settings)
Go to the **"Variables"** tab for your bot service and add these one by one:

| Variable Name | Value |
| :--- | :--- |
| `BOT_TOKEN` | (Your Telegram Bot Token from BotFather) |
| `OWNER_ID` | (Your Telegram Numeric ID) |
| `WEB_SECRET` | (Type something secret, e.g., `lily-power-2024`) |
| `NODE_ENV` | `production` |

*Note: `DATABASE_URL` is added automatically by Railway once you add PostgreSQL.*

## 5. Get the Public Link
1. Click on your Bot service in the project view.
2. Go to the **"Settings"** tab.
3. Look for **"Public Networking"** and click **"Generate Domain"**.
4. You will get a link like: `https://lily-smartbot-production.up.railway.app`. **Copy this link.**

## 6. Final Sync in Telegram
1. Open your Telegram bot.
2. Type: `/set_url [YOUR_COPIED_LINK]`
   - *Example:* `/set_url https://lily-smartbot-production.up.railway.app`
3. The bot will now use this link for every "More" button!

## 7. Troubleshooting
- If the bot doesn't start, check the **"View Logs"** button in Railway to see the error.
- Most issues are caused by a missing `BOT_TOKEN`.
