# 🧪 ACTIVATION SYSTEM - COMPREHENSIVE TEST PLAN

**Date:** 2026-02-06  
**System:** Lily Smartbot License Activation  
**Status:** Ready for Testing

---

## ✅ FIXES IMPLEMENTED

### 1. **Owner Authorization System** ✅
- Removed CLAIM mode vulnerability
- Removed hardcoded secret bypass
- Implemented strict ID validation
- Added comprehensive audit logging

### 2. **Activation Code Generation** ✅
- Keys are properly generated with format: `LILY-XXXXXXXX`
- Keys are stored in database with correct parameters
- Custom keys supported: `/generate_key 30 100 CUSTOM-NAME`

### 3. **Activation Flow Enhancement** ✅
- Key normalization (uppercase + trim)
- Premium welcome message
- Clear validity period display
- Automatic setup reminder for new groups

### 4. **First-Time User Experience** ✅
- Prompts client to "设置费率" after activation
- Provides quick setup examples
- Bilingual instructions

---

## 🧪 TEST SCENARIOS

### **Test 1: Owner Key Generation**

**Prerequisites:**
- `OWNER_ID` is set in Railway to your Telegram ID
- Bot is running

**Steps:**
1. Send `/whoami` to bot
2. Verify you see "Status: System Owner"
3. Send `/generate_key 30 100`
4. Bot should respond with:
   ```
   🔑 New License Key Prepared
   Key: LILY-XXXXXXXX
   Days: 30
   Users: 100
   
   Use /activate LILY-XXXXXXXX in the client group.
   ```

**Expected Result:** ✅ Key generated successfully

---

### **Test 2: Custom Key Generation**

**Steps:**
1. Send `/generate_key 30 100 LILY-PREMIUM-CLIENT`
2. Bot should respond with:
   ```
   🔑 New License Key Prepared
   Key: LILY-PREMIUM-CLIENT
   Days: 30
   Users: 100
   ```

**Expected Result:** ✅ Custom key created

---

### **Test 3: Unauthorized Key Generation (Security Test)**

**Prerequisites:**
- Use a different Telegram account (not the owner)

**Steps:**
1. Send `/generate_key 30 100`
2. Bot should respond with:
   ```
   ❌ 权限错误 (Security Error)
   
   您的 ID (999999999) 不在系统管理员名单中。
   
   当前授权名单 (Registry): 1865582932
   ```

**Expected Result:** ✅ Access DENIED (Security working)

---

### **Test 4: Activation in Client Group**

**Prerequisites:**
- You have a valid key from Test 1 or Test 2
- Bot is added to a test group

**Steps:**
1. In the client group, send `/activate LILY-XXXXXXXX`
2. Bot should respond with:
   ```
   ✨ 欢迎加入 Lily 智能账本系统！
   Welcome to Lily Smart Ledger!
   
   🎉 您的服务已成功激活，祝您工作顺利，生意兴隆！
   (Your service is now active. Wishing you smooth operations and prosperous business!)
   
   📅 授权期限 (License Period): 30 天 (Days)
   🗓️ 到期日期 (Expiry Date): 2026-03-08
   
   💼 现在您可以开始使用完整功能了！
   (You can now access all features!)
   ```
3. Immediately after, bot should send:
   ```
   📌 温馨提示 (Friendly Reminder)
   
   为了开始使用，请先设置您的费率：
   (To begin using the system, please set your rates first)
   
   💡 快速设置 (Quick Setup):
   • 入款费率: 设置费率 0.03 (3%)
   • 下发费率: 设置下发费率 0.02 (2%)
   • 美元汇率: 设置美元汇率 7.2
   
   设置完成后，发送 开始 即可开始记录。
   ```

**Expected Result:** ✅ Activation successful + Setup prompt shown

---

### **Test 5: Duplicate Activation (Should Fail)**

**Steps:**
1. Try to activate the same key again in another group
2. Send `/activate LILY-XXXXXXXX`
3. Bot should respond with:
   ```
   ❌ Invalid or Used Key.
   ```

**Expected Result:** ✅ Key rejected (already used)

---

### **Test 6: Invalid Key Format**

**Steps:**
1. Send `/activate INVALID-KEY-123`
2. Bot should respond with:
   ```
   ❌ Invalid or Used Key.
   ```

**Expected Result:** ✅ Invalid key rejected

---

### **Test 7: Missing Key Parameter**

**Steps:**
1. Send `/activate` (without key)
2. Bot should respond with:
   ```
   📋 请提供授权码 (Please provide activation key)
   
   格式 (Format): /activate LILY-XXXX
   ```

**Expected Result:** ✅ Helpful error message

---

### **Test 8: Case Insensitive Activation**

**Steps:**
1. Generate key: `/generate_key 30 100`
2. Get key: `LILY-ABCD1234`
3. Activate with lowercase: `/activate lily-abcd1234`
4. Should work (key is normalized to uppercase)

**Expected Result:** ✅ Activation successful

---

### **Test 9: Super Activation (Owner Only)**

**Prerequisites:**
- You are the owner
- In a test group

**Steps:**
1. Send `/super_activate 365`
2. Bot should respond with:
   ```
   👑 尊享特权激活 (System Owner Activation)
   
   ✨ 服务已开启 (Service Active)
   本群组已由系统管理员强制激活。
   
   📅 有效期 (Validity): 365 天 (Days)
   🔐 到期日期 (Expiry): 2027-02-05
   ```

**Expected Result:** ✅ Group instantly activated (no key needed)

---

### **Test 10: Full Client Workflow**

**Scenario:** Simulating a real client onboarding

**Steps:**
1. **Owner generates key:**
   - `/generate_key 30 100 LILY-CLIENT-ROBIN`
   - Copy the key

2. **Send key to client** (via private message)

3. **Client adds bot to their group**

4. **Client activates:**
   - `/activate LILY-CLIENT-ROBIN`
   - Sees welcome message
   - Sees setup reminder

5. **Client sets rates:**
   - `设置费率 0.03`
   - `设置下发费率 0.02`
   - `设置美元汇率 7.2`

6. **Client starts using:**
   - `开始`
   - System is now fully operational

**Expected Result:** ✅ Complete onboarding successful

---

## 🔍 DATABASE VERIFICATION

After activation, verify in database:

```sql
-- Check license was marked as used
SELECT * FROM licenses WHERE key = 'LILY-XXXXXXXX';
-- Should show: is_used = TRUE, used_by_group_id = [chat_id]

-- Check group was activated
SELECT * FROM groups WHERE id = [chat_id];
-- Should show: status = 'ACTIVE', license_key = 'LILY-XXXXXXXX'

-- Check settings were created
SELECT * FROM group_settings WHERE group_id = [chat_id];
-- Should exist with default values
```

---

## 🛡️ SECURITY VERIFICATION

### **Security Test 1: No Bypass Methods**
- ❌ CLAIM mode removed
- ❌ #LILY-ADMIN secret removed
- ❌ MASTER_KEY bypass removed
- ✅ Only OWNER_ID validation remains

### **Security Test 2: Audit Logging**
Check Railway logs for:
```
[SECURITY AUDIT] 2026-02-06T01:00:00.000Z | User: 1865582932 (Robin) | Command: /generate_key | Result: ✅ AUTHORIZED
[SECURITY AUDIT] 2026-02-06T01:01:00.000Z | User: 999999999 (Hacker) | Command: /generate_key | Result: ❌ DENIED
```

---

## 📊 CHECKLIST

- [ ] Test 1: Owner Key Generation
- [ ] Test 2: Custom Key Generation
- [ ] Test 3: Unauthorized Access Denied
- [ ] Test 4: Client Activation Success
- [ ] Test 5: Duplicate Key Rejected
- [ ] Test 6: Invalid Key Rejected
- [ ] Test 7: Missing Parameter Handled
- [ ] Test 8: Case Insensitive Works
- [ ] Test 9: Super Activation Works
- [ ] Test 10: Full Client Workflow
- [ ] Database Verification
- [ ] Security Audit Logs

---

## ✅ ACCEPTANCE CRITERIA

**All tests must pass for production deployment:**

1. ✅ Owner can generate keys
2. ✅ Non-owners cannot generate keys
3. ✅ Clients can activate with valid keys
4. ✅ Used keys cannot be reused
5. ✅ Invalid keys are rejected
6. ✅ Welcome message is shown
7. ✅ Setup reminder is shown
8. ✅ Security audit logs are working
9. ✅ No bypass vulnerabilities exist
10. ✅ Database is properly updated

---

**Test Report Generated:** 2026-02-06 01:18:00 UTC+8  
**Next Review:** After all tests complete
