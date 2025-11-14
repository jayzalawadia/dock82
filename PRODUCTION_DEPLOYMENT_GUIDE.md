# 🚀 Production Deployment Guide

## ✅ Issues Fixed in Latest Update

1. **Validation Error**: Changed from "parcel number" to "Lot number" for homeowner signup
2. **Enhanced Logging**: Added comprehensive error logging for email configuration issues
3. **Environment Variable Checks**: Better detection of missing environment variables

## 📋 Deployment Checklist

### Step 1: Deploy Backend to Elastic Beanstalk

1. **Download/Use backend-dist.zip** from the repository (already updated)

2. **Upload to Elastic Beanstalk**:
   - Go to AWS Elastic Beanstalk Console
   - Select your environment (`api.dock82.com`)
   - Click "Upload and Deploy"
   - Select `backend-dist.zip`
   - Click "Deploy"

3. **Wait for deployment** (usually 2-5 minutes)

### Step 2: Check Environment Variables in Elastic Beanstalk

The backend needs these environment variables to work properly:

#### **Required Environment Variables:**

1. **RESEND_API_KEY**
   - This is **REQUIRED** for sending emails
   - Get it from: [Resend Dashboard](https://resend.com/api-keys)
   - Should start with `re_`

2. **SUPABASE_SERVICE_ROLE_KEY**
   - Required for database access
   - Get it from: [Supabase Dashboard](https://supabase.com/dashboard/project/phstdzlniugqbxtfgktb/settings/api)

3. **SUPABASE_URL**
   - Required for database connection
   - Should be: `https://phstdzlniugqbxtfgktb.supabase.co`

4. **STRIPE_SECRET_KEY** (if using Stripe)
   - Required for payment processing

#### **How to Set Environment Variables in Elastic Beanstalk:**

1. Go to **AWS Elastic Beanstalk Console**
2. Select your environment (`api.dock82.com`)
3. Click **Configuration** (left sidebar)
4. Scroll down to **Software** section
5. Click **Edit**
6. Scroll to **Environment properties**
7. Add/Update these variables:
   ```
   RESEND_API_KEY=re_your_actual_resend_api_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
   SUPABASE_URL=https://phstdzlniugqbxtfgktb.supabase.co
   STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key_here
   ```
8. Click **Apply**
9. Wait for environment to update (may take a few minutes)

### Step 3: Verify Deployment

#### **Check Backend Logs:**

1. Go to **Elastic Beanstalk Console**
2. Select your environment
3. Click **Logs** (left sidebar)
4. Click **Request Logs** → **Last 100 Lines**
5. Look for these startup messages:
   ```
   ========================================
   🚀 Backend Server Starting...
   🌐 Environment: production
   ========================================
   🔑 Resend API Key present: Yes ✅
   🔑 SUPABASE_SERVICE_ROLE_KEY present: Yes ✅
   ========================================
   ```

#### **If you see these errors:**

❌ **`RESEND_API_KEY is not set! Emails will not work.`**
- **Fix**: Set `RESEND_API_KEY` in Elastic Beanstalk environment variables

❌ **`SUPABASE_SERVICE_ROLE_KEY is missing`**
- **Fix**: Set `SUPABASE_SERVICE_ROLE_KEY` in Elastic Beanstalk environment variables

#### **Test Email Sending:**

1. Try to register a new user or make a booking
2. Check the logs again for email sending messages:
   - ✅ `Email sent successfully via Resend: [email-id]`
   - ❌ `RESEND_API_KEY is missing or not configured in production!`

### Step 4: Test the Validation Fix

1. Go to https://www.dock82.com
2. Try to sign up as a homeowner
3. The error message should say:
   - ✅ **Correct**: "Property address and **Lot number** are required"
   - ❌ **Wrong**: "Property address and **parcel number** are required"

If you still see "parcel number", the backend hasn't been updated yet.

## 🔍 Troubleshooting

### Issue 1: Emails Not Sending in Production

**Symptoms:**
- Emails work on localhost but not in production
- No email confirmation when users sign up

**Possible Causes:**

1. **RESEND_API_KEY not set in Elastic Beanstalk**
   - Check Elastic Beanstalk environment variables
   - Verify the key is correct (should start with `re_`)

2. **Resend API Key is for test domain**
   - Make sure you're using a production API key from Resend
   - Verify `dock82.com` domain is verified in Resend dashboard

3. **Backend not restarted after setting variables**
   - Restart the Elastic Beanstalk environment
   - Wait for deployment to complete

**How to Fix:**

1. **Set RESEND_API_KEY in Elastic Beanstalk**:
   ```
   Configuration → Software → Environment properties
   ```
   Add:
   ```
   RESEND_API_KEY=re_your_actual_key_here
   ```

2. **Verify in logs**:
   - Check Elastic Beanstalk logs
   - Look for: `🔑 Resend API Key present: Yes ✅`

3. **Test email sending**:
   - Try registering a new user
   - Check logs for email sending status

### Issue 2: Validation Still Shows "Parcel Number"

**Symptoms:**
- Error message says "parcel number" instead of "Lot number"

**Fix:**
- Make sure you've deployed the latest `backend-dist.zip`
- Restart the Elastic Beanstalk environment
- Wait for deployment to complete

### Issue 3: Backend Not Responding

**Symptoms:**
- 500 errors from API
- Connection refused errors

**Fix:**
1. Check Elastic Beanstalk health status
2. Review logs for errors
3. Verify all environment variables are set
4. Restart the environment if needed

## 📞 Quick Reference

### Environment Variables Checklist:

```
✅ RESEND_API_KEY - Required for emails
✅ SUPABASE_SERVICE_ROLE_KEY - Required for database
✅ SUPABASE_URL - Required for database connection
✅ STRIPE_SECRET_KEY - Required for payments (if using)
```

### Useful Links:

- **AWS Elastic Beanstalk**: https://console.aws.amazon.com/elasticbeanstalk
- **Resend Dashboard**: https://resend.com/api-keys
- **Supabase Dashboard**: https://supabase.com/dashboard/project/phstdzlniugqbxtfgktb
- **Backend API**: https://api.dock82.com

## ✅ After Deployment

Once deployed, verify:

1. ✅ Backend logs show all environment variables are present
2. ✅ Validation error says "Lot number" (not "parcel number")
3. ✅ Emails are being sent successfully
4. ✅ No 500 errors in browser console
5. ✅ Homeowner signup works correctly

---

**Need Help?** Check the Elastic Beanstalk logs first - they now include detailed error messages!

