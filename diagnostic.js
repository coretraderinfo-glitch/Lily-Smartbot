#!/usr/bin/env node

/**
 * LILY BOT - COMPREHENSIVE DIAGNOSTIC TOOL
 * 
 * This script checks:
 * 1. Database connectivity
 * 2. Redis connectivity  
 * 3. Schema integrity
 * 4. Environment variables
 * 5. Bot token validity
 * 6. All core modules
 */

import { db } from './src/db/index.js';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const diagnostics = {
    passed: [],
    failed: [],
    warnings: []
};

async function runDiagnostics() {
    console.log('🔍 LILY BOT - COMPREHENSIVE DIAGNOSTIC CHECK\n');
    console.log('━'.repeat(50));

    // 1. Environment Variables
    console.log('\n📋 Checking Environment Variables...');
    const requiredEnvVars = ['BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL'];
    for (const envVar of requiredEnvVars) {
        if (process.env[envVar]) {
            diagnostics.passed.push(`✅ ${envVar} is set`);
            console.log(`✅ ${envVar}: Present`);
        } else {
            diagnostics.failed.push(`❌ ${envVar} is missing`);
            console.log(`❌ ${envVar}: MISSING`);
        }
    }

    // 2. Database Connection
    console.log('\n🗄️  Checking Database Connection...');
    try {
        const result = await db.query('SELECT NOW()');
        diagnostics.passed.push('✅ Database connection successful');
        console.log(`✅ Database: Connected (${result.rows[0].now})`);
    } catch (e) {
        diagnostics.failed.push(`❌ Database connection failed: ${e.message}`);
        console.log(`❌ Database: FAILED - ${e.message}`);
    }

    // 3. Database Schema
    console.log('\n📊 Checking Database Schema...');
    const requiredTables = ['groups', 'group_settings', 'group_operators', 'transactions', 'licenses', 'audit_logs'];
    for (const table of requiredTables) {
        try {
            const result = await db.query(`SELECT COUNT(*) FROM ${table}`);
            diagnostics.passed.push(`✅ Table '${table}' exists`);
            console.log(`✅ ${table}: ${result.rows[0].count} rows`);
        } catch (e) {
            diagnostics.failed.push(`❌ Table '${table}' missing or inaccessible`);
            console.log(`❌ ${table}: MISSING`);
        }
    }

    // 4. Required Columns in groups table
    console.log('\n🔧 Checking Required Columns...');
    const requiredColumns = {
        groups: ['id', 'status', 'license_key', 'license_expiry', 'current_state'],
        group_settings: ['group_id', 'rate_in', 'rate_out', 'rate_usd', 'display_mode', 'show_decimals']
    };

    for (const [table, columns] of Object.entries(requiredColumns)) {
        for (const column of columns) {
            try {
                await db.query(`SELECT ${column} FROM ${table} LIMIT 1`);
                diagnostics.passed.push(`✅ ${table}.${column} exists`);
                console.log(`✅ ${table}.${column}: OK`);
            } catch (e) {
                diagnostics.failed.push(`❌ ${table}.${column} missing`);
                console.log(`❌ ${table}.${column}: MISSING`);
            }
        }
    }

    // 5. Redis Connection
    console.log('\n🔴 Checking Redis Connection...');
    try {
        const redis = new IORedis(process.env.REDIS_URL, {
            maxRetriesPerRequest: null,
            connectTimeout: 10000
        });
        await redis.ping();
        diagnostics.passed.push('✅ Redis connection successful');
        console.log('✅ Redis: Connected');
        redis.disconnect();
    } catch (e) {
        diagnostics.failed.push(`❌ Redis connection failed: ${e.message}`);
        console.log(`❌ Redis: FAILED - ${e.message}`);
    }

    // 6. Core Modules
    console.log('\n📦 Checking Core Modules...');
    const modules = [
        './src/core/ledger.js',
        './src/core/licensing.js',
        './src/core/settings.js',
        './src/core/rbac.js'
    ];

    for (const mod of modules) {
        try {
            await import(mod);
            diagnostics.passed.push(`✅ ${mod} loads successfully`);
            console.log(`✅ ${mod.split('/').pop()}: OK`);
        } catch (e) {
            diagnostics.failed.push(`❌ ${mod} failed to load: ${e.message}`);
            console.log(`❌ ${mod.split('/').pop()}: FAILED - ${e.message}`);
        }
    }

    // Summary
    console.log('\n' + '━'.repeat(50));
    console.log('\n📊 DIAGNOSTIC SUMMARY\n');
    console.log(`✅ Passed: ${diagnostics.passed.length}`);
    console.log(`❌ Failed: ${diagnostics.failed.length}`);
    console.log(`⚠️  Warnings: ${diagnostics.warnings.length}`);

    if (diagnostics.failed.length > 0) {
        console.log('\n❌ CRITICAL ISSUES FOUND:\n');
        diagnostics.failed.forEach(f => console.log(f));
        process.exit(1);
    } else {
        console.log('\n✅ ALL CHECKS PASSED - System is healthy!\n');
        process.exit(0);
    }
}

runDiagnostics().catch(e => {
    console.error('\n💥 DIAGNOSTIC SCRIPT CRASHED:', e);
    process.exit(1);
});
