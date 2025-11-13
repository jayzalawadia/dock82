const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

const envLocalPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath });
} else {
  require('dotenv').config();
}

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Supabase Admin client for generating verification tokens
const supabaseUrl = process.env.SUPABASE_URL || 'https://phstdzlniugqbxtfgktb.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY not found in environment variables');
  console.warn('⚠️  User registration via Admin API will not work without this key');
  console.warn('⚠️  Add SUPABASE_SERVICE_ROLE_KEY to your .env.local file');
}

const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Debug: Check if environment variables are loaded
console.log('🔑 Resend API Key present:', process.env.RESEND_API_KEY ? 'Yes ✅' : 'No ❌');
console.log('🔑 Resend API Key (first 10 chars):', process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.substring(0, 10) + '...' : 'Missing');
console.log('🔑 SUPABASE_SERVICE_ROLE_KEY present:', supabaseServiceKey ? 'Yes ✅' : 'No ❌');
console.log('🔑 SUPABASE_URL:', supabaseUrl);

const resend = new Resend(process.env.RESEND_API_KEY);
const resolveDefaultFromAddress = () => {
  const envFrom = process.env.EMAIL_FROM || process.env.RESEND_FROM;
  if (envFrom && !envFrom.toLowerCase().includes('resend.dev')) {
    return envFrom;
  }
  return 'noreply@dock82.com';
};
const DEFAULT_EMAIL_FROM = resolveDefaultFromAddress();
console.log('📧 Using email from address:', DEFAULT_EMAIL_FROM);

// Determine allowed origins for CORS
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'https://localhost:3000',
  'https://dock82.com',
  'https://www.dock82.com',
  'https://api.dock82.com'
];

const envAllowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...envAllowedOrigins, ...defaultAllowedOrigins]));

const isLocalhostOrigin = (origin = '') => {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

const corsOptions = {
  origin(origin, callback) {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      allowedOrigins.includes('*') ||
      isLocalhostOrigin(origin)
    ) {
      return callback(null, true);
    }
    console.warn(`🚫 CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Stripe-Signature'],
  credentials: true,
  optionsSuccessStatus: 204
};

// Apply headers early so even error responses include CORS allowances
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    (allowedOrigins.includes(origin) ||
      allowedOrigins.includes('*') ||
      isLocalhostOrigin(origin))
  ) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin && allowedOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', '*');
  } else if (!origin && allowedOrigins.length > 0) {
    res.header('Access-Control-Allow-Origin', allowedOrigins[0]);
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Local API server is running' });
});

const sanitizeNullableString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.toString().trim();
  return trimmed.length ? trimmed : null;
};

const normalizeUserTypeValue = (value) => {
  const sanitized = sanitizeNullableString(value);
  return sanitized ? sanitized.toLowerCase() : null;
};

const parsePermissions = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.warn('Failed to parse permissions JSON:', error);
      return {};
    }
  }
  return {};
};

const extractStatusFromPermissions = (permissions = {}) => {
  const raw = sanitizeNullableString(
    permissions.homeowner_status ??
      permissions.homeownerStatus ??
      permissions.status
  );
  return raw ? raw.toLowerCase() : null;
};

const extractVerifiedAtFromPermissions = (permissions = {}) =>
  permissions.homeowner_verified_at ??
  permissions.homeownerVerifiedAt ??
  null;

const applyHomeownerStatusToPermissions = (
  permissions = {},
  status,
  verifiedAt = null
) => {
  const next = { ...permissions };
  if (status) {
    next.homeowner_status = status;
    if (verifiedAt) {
      next.homeowner_verified_at = verifiedAt;
    } else {
      delete next.homeowner_verified_at;
      delete next.homeownerVerifiedAt;
    }
  } else {
    delete next.homeowner_status;
    delete next.homeownerStatus;
    delete next.status;
    delete next.homeowner_verified_at;
    delete next.homeownerVerifiedAt;
  }
  return next;
};

const mapAdminUserRecord = (user) => {
  if (!user) {
    return user;
  }

  const permissions = parsePermissions(user.permissions);
  const normalizedType = normalizeUserTypeValue(user.user_type) || 'renter';
  const columnStatus = sanitizeNullableString(user.homeowner_status);
  let finalStatus = columnStatus ? columnStatus.toLowerCase() : null;

  if (!finalStatus && normalizedType === 'homeowner') {
    finalStatus = extractStatusFromPermissions(permissions) || 'active_owner';
  }

  if (!finalStatus) {
    finalStatus = extractStatusFromPermissions(permissions);
  }

  const homeownerVerifiedAt =
    extractVerifiedAtFromPermissions(permissions) ||
    user.homeowner_verified_at ||
    null;

  return {
    ...user,
    permissions,
    homeowner_status: finalStatus,
    homeowner_verified_at: homeownerVerifiedAt
  };
};

// Create payment intent endpoint
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', booking } = req.body;
    
    console.log('Creating payment intent for amount:', amount);
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert dollars to cents
      currency,
      capture_method: 'manual',
      automatic_payment_methods: { enabled: false },
      payment_method_types: ['card'],
      metadata: {
        slip_id: String(booking?.slip_id || ''),
        slip_name: String(booking?.slip_name || ''),
        guest_email: booking?.guest_email || '',
        guest_name: booking?.guest_name || '',
        guest_phone: booking?.guest_phone || '',
        check_in: booking?.check_in || '',
        check_out: booking?.check_out || '',
        boat_length: String(booking?.boat_length || ''),
        boat_make_model: booking?.boat_make_model || '',
        user_type: booking?.user_type || '',
        nights: String(booking?.nights || ''),
        rental_property: booking?.rental_property || '',
        rental_start_date: booking?.rental_start_date || '',
        rental_end_date: booking?.rental_end_date || ''
      }
    });

    console.log('Payment intent created:', intent.id);
    
    res.json({ 
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      captureMethod: intent.capture_method
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create payment intent',
      details: error.message 
    });
  }
});

// Register user endpoint - bypasses Supabase email rate limits by using Admin API
app.post('/api/register-user', async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      phone,
      userType,
      propertyAddress,
      parcelNumber,
      emergencyContact
    } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Normalize userType to lowercase (database constraint requires lowercase)
    const normalizedUserType = userType ? userType.toLowerCase() : 'renter';
    
    if (normalizedUserType === 'homeowner') {
      if (!propertyAddress || !parcelNumber) {
        return res.status(400).json({
          error: 'Property address and parcel number are required for homeowner registration.'
        });
      }
    }

    const buildProfileUpdate = (existingProfile = {}) => {
      const updateData = {};

      if (name) {
        updateData.name = name;
      } else if (!existingProfile.name && email) {
        updateData.name = email.split('@')[0];
      }

      if (phone) {
        updateData.phone = phone;
      }

      if (typeof propertyAddress === 'string' && propertyAddress.trim().length > 0) {
        updateData.property_address = propertyAddress.trim();
      } else if (!existingProfile.property_address && normalizedUserType === 'homeowner') {
        updateData.property_address = '';
      }

      if (typeof parcelNumber === 'string' && parcelNumber.trim().length > 0) {
        updateData.parcel_number = parcelNumber.trim();
      } else if (!existingProfile.parcel_number && normalizedUserType === 'homeowner') {
        updateData.parcel_number = '';
      }

      if (typeof emergencyContact === 'string' && emergencyContact.trim().length > 0) {
        updateData.emergency_contact = emergencyContact.trim();
      }

    if (normalizedUserType) {
      updateData.user_type = normalizedUserType;
      const existingPermissions = parsePermissions(existingProfile.permissions);
      if (normalizedUserType === 'homeowner') {
        const existingStatus =
          sanitizeNullableString(existingProfile.homeowner_status) ||
          extractStatusFromPermissions(existingPermissions);
        const alreadyVerified = existingStatus === 'verified';
        const nextStatus = alreadyVerified ? 'verified' : 'pending_verification';
        const verificationTimestamp = alreadyVerified
          ? extractVerifiedAtFromPermissions(existingPermissions) || new Date().toISOString()
          : null;
        updateData.permissions = applyHomeownerStatusToPermissions(
          existingPermissions,
          nextStatus,
          verificationTimestamp
        );
      } else {
        updateData.permissions = applyHomeownerStatusToPermissions(existingPermissions, null);
      }
    }

      return updateData;
    };
    
    if (!supabaseAdmin) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY not configured');
      return res.status(500).json({ 
        error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required',
        hint: 'Add SUPABASE_SERVICE_ROLE_KEY to your .env.local file'
      });
    }
    
    console.log('📧 Registering user via Admin API (bypassing email rate limits):', email);
    
    // Create user using Admin API - this bypasses email sending
    // Auto-confirm email so user can sign in immediately (we still send verification email via Resend)
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email so user can sign in immediately
      user_metadata: {
        name: name || '',
        phone: phone || '',
        userType: normalizedUserType,
        user_type: normalizedUserType,
        propertyAddress: propertyAddress || '',
        parcelNumber: parcelNumber || '',
        homeownerStatus: normalizedUserType === 'homeowner' ? 'pending_verification' : '',
        homeowner_verified_at: null,
        emergencyContact: emergencyContact || ''
      }
    });
    
    if (createError || !userData) {
      console.error('Error creating user:', createError);
      console.error('Error code:', createError?.code);
      console.error('Error message:', createError?.message);
      console.error('Full error:', JSON.stringify(createError, null, 2));
      
      // Check if user already exists in Auth
      // Supabase returns different error codes: 'user_already_exists', 'email_already_exists', etc.
      const isExistingUser = createError && (
        createError.message?.toLowerCase().includes('already') || 
        createError.message?.toLowerCase().includes('user already registered') ||
        createError.message?.toLowerCase().includes('duplicate') ||
        createError.code === 'user_already_exists' ||
        createError.code === 'email_already_exists' ||
        createError.status === 422
      );
      
      if (isExistingUser) {
        console.log('📧 User already exists in Supabase Auth, checking if profile needs update...');
        
        // First, check if user exists in users table with the requested user type
        try {
          const { data: existingProfileRaw, error: profileCheckError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
          
          const existingProfile = existingProfileRaw
            ? mapAdminUserRecord(existingProfileRaw)
            : null;

          if (existingProfile && !profileCheckError) {
            console.log('📋 User profile exists in database:', existingProfile.user_type);
            
            // If user type is different, update it in both database and Auth metadata
            if (existingProfile.user_type !== normalizedUserType && normalizedUserType) {
              console.log(`🔄 Updating user type from '${existingProfile.user_type}' to '${normalizedUserType}'`);
              
              // Update in database
              const profileUpdatePayload = buildProfileUpdate(existingProfile);
              const { error: updateError } = await supabaseAdmin
                .from('users')
                .update(profileUpdatePayload)
                .eq('email', email);
              
              if (updateError) {
                console.error('Error updating user type in database:', updateError);
              } else {
                console.log('✅ User type updated successfully in database');
              }
              
              // Also update user metadata in Supabase Auth
              try {
                const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
                const authUser = authUsers.users.find(u => u.email === email);
                
                if (authUser) {
                  const verificationTimestamp = existingProfile.homeowner_status === 'verified'
                    ? existingProfile.homeowner_verified_at
                    : new Date().toISOString();
                  const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(
                    authUser.id,
                    {
                      user_metadata: {
                        ...authUser.user_metadata,
                        name: name || existingProfile.name || authUser.user_metadata?.name,
                        phone: phone || existingProfile.phone || authUser.user_metadata?.phone,
                        propertyAddress: propertyAddress || existingProfile.property_address || authUser.user_metadata?.propertyAddress || '',
                        parcelNumber: parcelNumber || existingProfile.parcel_number || authUser.user_metadata?.parcelNumber || '',
                        homeownerStatus:
                          normalizedUserType === 'homeowner'
                            ? existingProfile.homeowner_status === 'verified'
                              ? 'verified'
                              : 'pending_verification'
                            : authUser.user_metadata?.homeownerStatus || '',
                        homeowner_verified_at:
                          normalizedUserType === 'homeowner'
                            ? existingProfile.homeowner_status === 'verified'
                              ? verificationTimestamp
                              : null
                            : authUser.user_metadata?.homeowner_verified_at || null,
                        userType: normalizedUserType,
                        user_type: normalizedUserType
                      }
                    }
                  );
                  
                  if (metadataError) {
                    console.error('Error updating user metadata in Auth:', metadataError);
                  } else {
                    console.log('✅ User metadata updated successfully in Auth');
                  }
                }
              } catch (metadataErr) {
                console.error('Error updating Auth metadata:', metadataErr);
              }
            } else if (name || phone || propertyAddress || parcelNumber || emergencyContact) {
              // Update profile details if provided, even if user type is the same
              const updateData = buildProfileUpdate(existingProfile);

              const { error: updateError } = await supabaseAdmin
                .from('users')
                .update(updateData)
                .eq('email', email);
              
              if (updateError) {
                console.error('Error updating user profile:', updateError);
              }
            }
          } else {
            // Profile doesn't exist in users table, create it
            console.log('📋 Profile not found in database, creating new profile...');
            
            try {
            const profileData = {
              name: name || email.split('@')[0],
              email: email,
              password_hash: 'auth_managed',
              user_type: normalizedUserType,
              phone: phone || '',
              permissions:
                normalizedUserType === 'homeowner'
                  ? { homeowner_status: 'pending_verification' }
                  : {},
              email_verified: false,
              property_address: propertyAddress || '',
              parcel_number: parcelNumber || '',
              emergency_contact: emergencyContact || ''
            };
              
              const { data: newProfile, error: createProfileError } = await supabaseAdmin
                .from('users')
                .insert(profileData)
                .select()
                .single();
              
              if (createProfileError) {
                console.error('❌ Error creating user profile:', createProfileError);
                console.error('Error details:', JSON.stringify(createProfileError, null, 2));
              } else {
                console.log('✅ User profile created in database:', newProfile);
              }
            } catch (createErr) {
              console.error('❌ Exception creating user profile:', createErr);
            }
          }
        } catch (profileErr) {
          console.error('Error checking/updating user profile:', profileErr);
          // Try to create profile anyway
          try {
            console.log('📋 Attempting to create profile after error...');
            const fallbackProfileData = {
              name: name || email.split('@')[0],
              email: email,
              password_hash: 'auth_managed',
              user_type: normalizedUserType,
              phone: phone || '',
              permissions:
                normalizedUserType === 'homeowner'
                  ? { homeowner_status: 'pending_verification' }
                  : existingProfile?.permissions || {},
              email_verified: false,
              property_address: propertyAddress || '',
              parcel_number: parcelNumber || '',
              emergency_contact: emergencyContact || ''
            };
            
            const { data: newProfile, error: createProfileError } = await supabaseAdmin
              .from('users')
              .upsert(fallbackProfileData, { onConflict: 'email' })
              .select()
              .single();
            
            if (createProfileError) {
              console.error('❌ Error creating user profile (fallback):', createProfileError);
            } else {
              console.log('✅ User profile created/updated in database (fallback):', newProfile);
            }
          } catch (fallbackErr) {
            console.error('❌ Fallback profile creation also failed:', fallbackErr);
          }
        }
        
        console.log('📧 User already exists in Auth, sending verification email...');
        
        // Generate verification link for existing user
        // Try 'magiclink' type first for existing users (better for email verification)
        let verificationUrl = null;
        let tokenError = null;
        
        try {
          const { data: tokenData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: email,
            options: {
              redirectTo: `${req.headers.origin || 'http://localhost:3000'}/auth/callback`
            }
          });
          
          if (!linkError && tokenData && tokenData.properties) {
            verificationUrl = tokenData.properties.action_link;
          } else if (linkError) {
            console.error('Error generating magiclink:', linkError);
            tokenError = linkError;
            // Try signup type as fallback
            const { data: fallbackToken, error: fallbackError } = await supabaseAdmin.auth.admin.generateLink({
              type: 'signup',
              email: email,
              options: {
                redirectTo: `${req.headers.origin || 'http://localhost:3000'}/auth/callback`
              }
            });
            if (!fallbackError && fallbackToken && fallbackToken.properties) {
              verificationUrl = fallbackToken.properties.action_link;
            } else {
              console.error('Error generating signup link:', fallbackError);
            }
          }
        } catch (err) {
          console.error('Exception generating verification link:', err);
          tokenError = err;
        }
        
        // Send welcome email via Resend
        let emailSent = false;
        let emailErrorDetails = null;
        try {
        const welcomeResult = await sendEmailNotificationInternal('welcome', email, {
            name: name || email.split('@')[0],
            userType: normalizedUserType || 'renter'
          });
          emailSent = !!(welcomeResult?.success && !welcomeResult?.logged);
        } catch (emailErr) {
          console.error('❌ Error sending welcome email to existing user:', emailErr);
          emailErrorDetails = emailErr?.details || emailErr?.message || emailErr;
        }
        
        // Return success - user exists in Auth, verification email sent
      return res.json({ 
        success: true, 
          user: {
            email: email,
            email_confirmed_at: null
          },
          verificationUrl: verificationUrl,
          message: emailSent 
            ? 'User already exists. Welcome email sent via Resend.'
            : 'User already exists. Welcome email could not be sent.',
          existingUser: true,
          emailSent: emailSent,
          emailError: emailErrorDetails
        });
      }
      
      return res.status(500).json({ 
        error: 'Failed to create user',
        details: createError?.message || 'Unknown error'
      });
    }
    
    console.log('✅ User created via Admin API:', userData.user.email);
    
    // Create user profile in database using Admin client (bypasses RLS)
    try {
      const profileData = {
        name: name || email.split('@')[0],
        email: email,
        password_hash: 'auth_managed',
        user_type: normalizedUserType,
        phone: phone || '',
        permissions:
          normalizedUserType === 'homeowner'
            ? { homeowner_status: 'pending_verification' }
            : {},
        email_verified: userData.user.email_confirmed_at !== null,
        property_address: propertyAddress || '',
        parcel_number: parcelNumber || '',
        emergency_contact: emergencyContact || ''
      };
      
      const { data: profileResult, error: profileError } = await supabaseAdmin
        .from('users')
        .upsert(profileData, { onConflict: 'email' })
        .select()
        .single();
      
      if (profileError) {
        console.error('Error creating user profile:', profileError);
        // Continue anyway - user exists in Auth
      } else {
        console.log('✅ User profile created in database:', profileResult);
      }
    } catch (profileErr) {
      console.error('Error creating user profile:', profileErr);
      // Continue anyway - user exists in Auth
    }
    
    // Generate verification link
    const { data: tokenData, error: tokenError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: `${req.headers.origin || 'http://localhost:3000'}/auth/callback`
      }
    });
    
    let verificationUrl = null;
    if (!tokenError && tokenData) {
      verificationUrl = tokenData.properties.action_link;
    }
    
    // Send welcome email via Resend
    let emailSent = false;
    let emailErrorDetails = null;
    try {
      const welcomeResult = await sendEmailNotificationInternal('welcome', email, {
        name: name || email.split('@')[0],
        userType: normalizedUserType || 'renter'
      });
      emailSent = !!(welcomeResult?.success && !welcomeResult?.logged);
    } catch (emailErr) {
      console.error('❌ Error sending welcome email:', emailErr);
      emailErrorDetails = emailErr?.details || emailErr?.message || emailErr;
      // Continue anyway - user can verify later
    }
    
    res.json({ 
      success: true,
      user: {
        id: userData.user.id,
        email: userData.user.email,
        email_confirmed_at: userData.user.email_confirmed_at
      },
      verificationUrl: verificationUrl,
      message: emailSent 
        ? 'User created successfully. Welcome email sent via Resend.'
        : 'User created successfully. Welcome email could not be sent.',
      emailSent: emailSent,
      emailError: emailErrorDetails
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Failed to register user',
      details: error.message 
    });
  }
});

// Send verification email endpoint
app.post('/api/send-verification-email', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    console.log('📧 Generating verification email for:', email);
    
    if (!supabaseAdmin) {
      return res.status(500).json({ 
        error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required'
      });
    }
    
    // Generate verification token using Supabase Admin API
    // We don't need to fetch the user - generateLink works with just the email
    const { data: tokenData, error: tokenError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: `${req.headers.origin || 'http://localhost:3000'}/auth/callback`
      }
    });
    
    if (tokenError || !tokenData) {
      console.error('Error generating token:', tokenError);
      return res.status(500).json({ error: 'Failed to generate verification token' });
    }
    
    const verificationUrl = tokenData.properties.action_link;
    
    // Send email via Resend (same as booking receipts)
    const emailSubject = 'Verify Your Email - Dock82';
    const emailContent = generateVerificationEmail({ name: name || email.split('@')[0], email, verificationUrl });
    
    if (!process.env.RESEND_API_KEY) {
      console.log('⚠️ Resend API key not configured');
      return res.json({ 
        success: true, 
        message: 'Email would be sent (Resend not configured)',
        verificationUrl: verificationUrl
      });
    }
    
      const { data: emailData, error: emailError } = await resend.emails.send({
      from: DEFAULT_EMAIL_FROM,
        to: email,
        subject: emailSubject,
        html: emailContent,
      });

      if (emailError) {
        console.error('Resend error:', emailError);
        return res.status(500).json({ 
          error: 'Failed to send email',
        details: emailError,
        verificationUrl: verificationUrl
        });
      }

    console.log('✅ Verification email sent via Resend:', emailData?.id);
      
      res.json({ 
        success: true, 
      message: 'Verification email sent successfully',
        emailId: emailData?.id
      });
    } catch (error) {
    console.error('Verification email error:', error);
      res.status(500).json({ 
      error: 'Failed to send verification email',
        details: error.message 
    });
  }
});

// Email notification endpoint
app.post('/api/send-notification', async (req, res) => {
  try {
    const { type, email, data } = req.body;
    
    console.log('Email notification request:', { type, email });
    
    if (!type || !email || !data) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const result = await sendEmailNotificationInternal(type, email, data);
      res.json({ success: true, ...result });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      res.status(500).json({ 
        error: 'Failed to send email',
        details: emailError.message || emailError,
        meta: emailError.details || null
      });
    }
    
  } catch (error) {
    console.error('Email notification error:', error);
    res.status(500).json({ 
      error: 'Failed to process email notification',
      details: error.message 
    });
  }
});

// Email generation functions
function generatePaymentReceiptEmail(data) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1e3a8a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .footer { background: #e5e7eb; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; }
        .receipt-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .receipt-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
        .amount { font-size: 24px; font-weight: bold; color: #059669; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🛥️ Dock82 Payment Receipt</h1>
      </div>
      <div class="content">
        <p>Dear ${data.guestName},</p>
        <p>Thank you for your payment! Your dock booking at <strong>${data.slipName}</strong> has been confirmed.</p>
        
        <table class="receipt-table">
          <tr>
            <td><strong>Payment Amount:</strong></td>
            <td class="amount">$${data.amount}</td>
          </tr>
          <tr>
            <td><strong>Payment Method:</strong></td>
            <td>${data.paymentMethod}</td>
          </tr>
          <tr>
            <td><strong>Transaction ID:</strong></td>
            <td>${data.paymentIntentId}</td>
          </tr>
        </table>
        
      <p><strong>Reminder:</strong> Bookings become non-refundable within seven (7) days of check-in. If you need to adjust your stay, please reach out before that window so we can assist.</p>
        
        <p>Your booking confirmation and permit will be sent shortly.</p>
        <p>If you have any questions, please contact us.</p>
      </div>
      <div class="footer">
        <p>Best regards,<br>The Dock82 Team</p>
      </div>
    </body>
    </html>
  `;
}

function generateWelcomeEmail(data) {
  const { name, userType = 'renter' } = data;
  const isHomeowner = userType === 'homeowner';
  const isAdmin = userType === 'admin' || userType === 'superadmin';
  
  let userTypeMessage = '';
  let benefitsList = '';
  
  if (isHomeowner) {
    userTypeMessage = '<p><strong>🏠 Homeowner Account:</strong> As a homeowner, you have access to free dock slip bookings!</p>';
    benefitsList = `
        <ul>
          <li>✅ <strong>Free bookings</strong> - No payment required for dock slip reservations</li>
          <li>✅ <strong>Priority access</strong> - Your bookings are confirmed immediately</li>
          <li>✅ <strong>Browse and book</strong> available dock slips</li>
          <li>✅ <strong>Manage your bookings</strong> - View and cancel anytime</li>
          <li>✅ <strong>Receive dock permits</strong> for your bookings</li>
        </ul>
      `;
  } else if (isAdmin) {
    userTypeMessage = `<p><strong>👑 ${userType === 'superadmin' ? 'Superadmin' : 'Admin'} Account:</strong> You have administrative access to the Dock82 platform.</p>`;
    benefitsList = `
        <ul>
          <li>✅ <strong>Manage dock slips</strong> - View and edit all slips</li>
          <li>✅ <strong>Manage bookings</strong> - Approve, cancel, and view all bookings</li>
          <li>✅ <strong>View analytics</strong> - Access system reports and statistics</li>
          ${userType === 'superadmin' ? '<li>✅ <strong>Manage users and admins</strong> - Full system access</li>' : ''}
        </ul>
      `;
  } else {
    userTypeMessage = '<p><strong>🛥️ Renter Account:</strong> You can now rent dock slips for your boat!</p>';
    benefitsList = `
        <ul>
          <li>✅ <strong>Browse and book</strong> available dock slips</li>
          <li>✅ <strong>Secure payments</strong> via Stripe</li>
          <li>✅ <strong>Manage your bookings</strong> - View and cancel with refund policy</li>
          <li>✅ <strong>Get discounts</strong> - 40% off for 30-day bookings</li>
          <li>✅ <strong>Receive booking confirmations</strong> and dock permits</li>
        </ul>
      `;
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1e3a8a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .footer { background: #e5e7eb; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .highlight { background: #dbeafe; padding: 15px; border-radius: 6px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🛥️ Welcome to Dock82!</h1>
      </div>
      <div class="content">
        <p>Dear ${name || 'Valued Customer'},</p>
        <p>Welcome to Dock82! We're thrilled to have you as part of our community.</p>
        
        <div class="highlight">
          ${userTypeMessage}
          <p>Your account has been successfully created and is ready to use.</p>
        </div>
        
        <p><strong>What you can do now:</strong></p>
        ${benefitsList}
        
        <p>If you have any questions or need assistance, please don't hesitate to reach out to our support team.</p>
        <p>We look forward to serving you!</p>
      </div>
      <div class="footer">
        <p>Best regards,<br>The Dock82 Team</p>
      </div>
    </body>
    </html>
  `;
}

function generateVerificationEmail(data) {
  const { name, email, verificationUrl } = data;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1e3a8a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .footer { background: #e5e7eb; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🛥️ Dock82 - Verify Your Email</h1>
      </div>
      <div class="content">
        <p>Dear ${name || 'User'},</p>
        <p>Thank you for registering with Dock82! Please verify your email address to complete your account setup.</p>
        <p style="text-align: center;">
          <a href="${verificationUrl}" class="button">Verify Email Address</a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #2563eb;">${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account with Dock82, you can safely ignore this email.</p>
      </div>
      <div class="footer">
        <p>Best regards,<br>The Dock82 Team</p>
      </div>
    </body>
    </html>
  `;
}

function generateBookingConfirmationEmail(data) {
  const checkIn = new Date(data.checkIn).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const checkOut = new Date(data.checkOut).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1e3a8a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .permit { background: white; border: 3px solid #059669; padding: 20px; margin: 20px 0; text-align: center; }
        .permit-title { font-size: 24px; font-weight: bold; color: #059669; margin-bottom: 10px; }
        .permit-info { font-size: 18px; margin: 10px 0; }
        .footer { background: #e5e7eb; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; }
        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .info-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
        .print-instruction { background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🛥️ Dock82 Booking Confirmation</h1>
      </div>
      <div class="content">
        <p>Dear ${data.guestName},</p>
        <p>Your dock booking has been confirmed! We're excited to welcome you to Dock82.</p>
        
        <div class="permit">
          <div class="permit-title">DOCK PERMIT</div>
          <div class="permit-info">Slip: ${data.slipName}</div>
          <div class="permit-info">${data.guestName}</div>
          <div class="permit-info">Check-in: ${checkIn}</div>
          <div class="permit-info">Check-out: ${checkOut}</div>
          <div class="permit-info">Boat: ${data.boatMakeModel} (${data.boatLength} ft)</div>
        </div>
        
        <table class="info-table">
          <tr>
            <td><strong>Guest Name:</strong></td>
            <td>${data.guestName}</td>
          </tr>
          <tr>
            <td><strong>Slip:</strong></td>
            <td>${data.slipName}</td>
          </tr>
          <tr>
            <td><strong>Check-in:</strong></td>
            <td>${checkIn}</td>
          </tr>
          <tr>
            <td><strong>Check-out:</strong></td>
            <td>${checkOut}</td>
          </tr>
          <tr>
            <td><strong>Boat:</strong></td>
            <td>${data.boatMakeModel} (${data.boatLength} ft)</td>
          </tr>
          <tr>
            <td><strong>Total Amount:</strong></td>
            <td>$${data.totalAmount}</td>
          </tr>
        </table>
        
        <div class="print-instruction">
          <strong>📄 PRINT THIS EMAIL</strong>
          <p>Please print this permit and place it in your vehicle's windshield during your stay.</p>
        </div>
        
        <p><strong>Important Information:</strong></p>
        <ul>
          <li>Please arrive at your designated check-in time</li>
          <li>Keep this permit visible in your vehicle at all times</li>
          <li>Follow all dock etiquette guidelines</li>
          <li>In case of emergency, contact dock management immediately</li>
          <li>Bookings become non-refundable within seven (7) days of check-in. Let us know before then if your plans change.</li>
        </ul>

        <p style="margin-top: 20px;"><strong>Non-Refundable Reminder:</strong> Any cancellation within seven (7) days of check-in is non-refundable. If your plans change, reply to this email before that window so we can assist.</p>
      </div>
      <div class="footer">
        <p>Best regards,<br>The Dock82 Team</p>
        <p style="font-size: 12px; color: #6b7280;">If you need to modify or cancel your booking, please contact us as soon as possible.</p>
      </div>
    </body>
    </html>
  `;
}

function generateBookingPendingEmail(data) {
  const checkIn = new Date(data.checkIn).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const checkOut = new Date(data.checkOut).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .footer { background: #e5e7eb; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; }
        .status { background: #fff7ed; border-left: 4px solid #f97316; padding: 15px; margin: 20px 0; }
        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .info-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🛥️ Booking Request Received</h1>
      </div>
      <div class="content">
        <p>Dear ${data.guestName},</p>
        <p>Thank you for submitting your booking request for <strong>${data.slipName}</strong> at Dock82.</p>
        <div class="status">
          <strong>📩 Status: Pending Approval</strong>
          <p>Your request has been forwarded to the dock owner for review. Please allow up to 24 hours for approval.</p>
        </div>
        <table class="info-table">
          <tr>
            <td><strong>Slip:</strong></td>
            <td>${data.slipName}</td>
          </tr>
          <tr>
            <td><strong>Check-in:</strong></td>
            <td>${checkIn}</td>
          </tr>
          <tr>
            <td><strong>Check-out:</strong></td>
            <td>${checkOut}</td>
          </tr>
          <tr>
            <td><strong>Boat:</strong></td>
            <td>${data.boatMakeModel || 'N/A'}${data.boatLength ? ` (${data.boatLength} ft)` : ''}</td>
          </tr>
          <tr>
            <td><strong>Total Amount:</strong></td>
            <td>$${Number(data.totalAmount || 0).toFixed(2)}</td>
          </tr>
        </table>
        <p>We will notify you via email once the dock owner has reviewed your request.</p>
        <p>If you need to provide additional information or make changes, please reply to this email.</p>
      </div>
      <div class="footer">
        <p>Best regards,<br>The Dock82 Team</p>
      </div>
    </body>
    </html>
  `;
}

function generateBookingNotApprovedEmail(data) {
  const checkIn = new Date(data.checkIn).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const checkOut = new Date(data.checkOut).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #b91c1c; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #fef2f2; padding: 20px; border: 1px solid #fecaca; }
        .footer { background: #fee2e2; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; }
        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .info-table td { padding: 10px; border-bottom: 1px solid #fecaca; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Dock82 Booking Update</h1>
      </div>
      <div class="content">
        <p>Dear ${data.guestName},</p>
        <p>We appreciate your interest in docking at Dock82. Unfortunately, your booking request for <strong>${data.slipName}</strong> could not be approved at this time.</p>
        <table class="info-table">
          <tr>
            <td><strong>Slip:</strong></td>
            <td>${data.slipName}</td>
          </tr>
          <tr>
            <td><strong>Requested Stay:</strong></td>
            <td>${checkIn} to ${checkOut}</td>
          </tr>
          <tr>
            <td><strong>Boat:</strong></td>
            <td>${data.boatMakeModel || 'N/A'}${data.boatLength ? ` (${data.boatLength} ft)` : ''}</td>
          </tr>
        </table>
        <p>Your payment has been refunded in full. Depending on your bank, the refund should appear on your statement within 5-10 business days.</p>
        ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}
        <p>If you have any questions or would like to request another stay, please contact our support team.</p>
      </div>
      <div class="footer">
        <p>Best regards,<br>The Dock82 Team</p>
      </div>
    </body>
    </html>
  `;
}

function generatePermitEmail(data) {
  const checkIn = data.checkIn ? new Date(data.checkIn).toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  }) : 'N/A';
  const checkOut = data.checkOut ? new Date(data.checkOut).toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  }) : 'N/A';
  const permitNumber = data.permitNumber || `NSP-${data.bookingId || 'UNKNOWN'}-${new Date().getFullYear()}`;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .footer { background: #e5e7eb; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; }
        .permit { background: white; border: 3px solid #059669; padding: 30px; margin: 20px 0; text-align: center; }
        .permit-title { font-size: 28px; font-weight: bold; color: #059669; margin-bottom: 15px; text-transform: uppercase; }
        .permit-number { font-size: 14px; color: #6b7280; margin-bottom: 20px; }
        .permit-info { font-size: 18px; margin: 12px 0; color: #1f2937; }
        .permit-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 5px; }
        .print-instruction { background: #fef3c7; border: 2px solid #f59e0b; padding: 15px; margin: 20px 0; text-align: center; border-radius: 6px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🛥️ Dock82 - Dock Permit</h1>
      </div>
      <div class="content">
        <p>Dear ${data.guestName || 'Valued Customer'},</p>
        <p>Your dock permit is attached below. Please print this permit and keep it visible in your vehicle during your stay.</p>
        
        <div class="permit">
          <div class="permit-title">DOCK PERMIT</div>
          <div class="permit-number">Permit #: ${permitNumber}</div>
          <div style="border-top: 2px solid #059669; margin: 20px 0; padding-top: 20px;">
            <div class="permit-label">Slip Assignment</div>
            <div class="permit-info">${data.slipName || 'N/A'}</div>
          </div>
          <div style="margin: 15px 0;">
            <div class="permit-label">Guest Name</div>
            <div class="permit-info">${data.guestName || 'N/A'}</div>
          </div>
          <div style="margin: 15px 0;">
            <div class="permit-label">Boat Information</div>
            <div class="permit-info">${data.boatMakeModel || 'N/A'} ${data.boatLength ? `(${data.boatLength} ft)` : ''}</div>
          </div>
          <div style="margin: 15px 0;">
            <div class="permit-label">Check-In Date</div>
            <div class="permit-info">${checkIn}</div>
          </div>
          <div style="margin: 15px 0;">
            <div class="permit-label">Check-Out Date</div>
            <div class="permit-info">${checkOut}</div>
          </div>
          <div style="border-top: 2px solid #059669; margin-top: 20px; padding-top: 20px;">
            <div class="permit-label">Valid Until</div>
            <div class="permit-info">${checkOut}</div>
          </div>
        </div>
        
        <div class="print-instruction">
          <strong>📄 PRINT THIS PERMIT</strong>
          <p>Please print this permit and place it in your vehicle's windshield during your stay.</p>
        </div>
        
        <p><strong>Important Instructions:</strong></p>
        <ul>
          <li>Display this permit in your vehicle's windshield at all times during your stay</li>
          <li>Please arrive at your designated check-in time</li>
          <li>Follow all dock etiquette guidelines</li>
          <li>Keep your boat registration and insurance documents accessible</li>
          <li>In case of emergency, contact dock management immediately</li>
        </ul>
        
        <p>We look forward to serving you!</p>
      </div>
      <div class="footer">
        <p>Best regards,<br>The Dock82 Team</p>
        <p style="font-size: 12px; color: #6b7280;">If you need to modify or cancel your booking, please contact us as soon as possible.</p>
      </div>
    </body>
    </html>
  `;
}

async function sendEmailNotificationInternal(type, email, data) {
  if (!type || !email || !data) {
    throw new Error('Missing email notification parameters');
  }

  let emailSubject = '';
  let emailContent = '';

  switch (type) {
    case 'paymentReceipt':
      emailSubject = `Payment Receipt - Dock82 Booking`;
      emailContent = generatePaymentReceiptEmail(data);
      break;
    case 'bookingConfirmation':
      emailSubject = `Booking Confirmed - ${data.slipName} at Dock82`;
      emailContent = generateBookingConfirmationEmail(data);
      break;
    case 'bookingPending':
      emailSubject = `Booking Request Received - ${data.slipName} at Dock82`;
      emailContent = generateBookingPendingEmail(data);
      break;
    case 'bookingNotApproved':
      emailSubject = `Booking Update - ${data.slipName} at Dock82`;
      emailContent = generateBookingNotApprovedEmail(data);
      break;
    case 'permit':
      emailSubject = `Dock Permit - ${data.slipName} at Dock82`;
      emailContent = generatePermitEmail(data);
      break;
    case 'emailVerification':
      emailSubject = `Verify Your Email - Dock82`;
      emailContent = generateVerificationEmail(data);
      break;
    case 'welcome':
      emailSubject = `Welcome to Dock82!`;
      emailContent = generateWelcomeEmail(data);
      break;
    default:
      throw new Error(`Invalid email type: ${type}`);
  }

  console.log('📧 Preparing email (internal):', { type, email, emailSubject });

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'your_resend_api_key_here') {
    console.log('⚠️  Resend API key not configured. Email logged to console instead.');
    console.log('📧 Email Subject:', emailSubject);
    console.log('📧 Email To:', email);
    console.log('📧 Email Content Preview:', emailContent.substring(0, 200) + '...');
    return { success: true, logged: true, emailSubject };
  }

  const { data: emailData, error: emailError } = await resend.emails.send({
    from: DEFAULT_EMAIL_FROM,
    to: email,
    subject: emailSubject,
    html: emailContent,
  });

  if (emailError) {
    console.error('❌ Resend error:', emailError);
    const error = new Error('Failed to send email');
    error.details = emailError;
    throw error;
  }

  console.log('✅ Email sent via Resend:', emailData?.id);
  return { success: true, emailId: emailData?.id };
}

const PORT = process.env.PORT || 5001;
// Get slips endpoint - uses Admin client to bypass RLS
app.get('/api/slips', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY is missing');
      return res.status(500).json({ 
        error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required'
      });
    }
    
    const { start, end } = req.query;
    const filterByDate = Boolean(start && end);

    if ((start && !end) || (!start && end)) {
      return res.status(400).json({ error: 'Both "start" and "end" query parameters are required when filtering by date range' });
    }

    let startDate = null;
    let endDate = null;

    if (filterByDate) {
      startDate = new Date(start);
      endDate = new Date(end);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date range provided' });
      }

      if (endDate <= startDate) {
        return res.status(400).json({ error: 'End date must be after start date' });
      }
    }

    console.log('📡 Fetching slips from database...');
    const { data: slips, error } = await supabaseAdmin
      .from('slips')
      .select(`
        id,
        name,
        max_boat_length,
        width,
        depth,
        price_per_night,
        amenities,
        description,
        dock_etiquette,
        available,
        images,
        location_data,
        maintenance_notes,
        seasonal_pricing,
        created_at,
        updated_at,
        location,
        status
      `);
    
    if (error) {
      console.error('❌ Error fetching slips:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', error.details);
      console.error('Error hint:', error.hint);
      return res.status(500).json({ 
        error: 'Failed to fetch slips', 
        details: error.message,
        code: error.code 
      });
    }
    
    let filteredSlips = slips || [];
    let relevantBookings = null;

    if (filterByDate) {
      console.log(`📅 Filtering slips for availability between ${startDate.toISOString()} and ${endDate.toISOString()}`);

      const { data: bookingsData, error: bookingsError } = await supabaseAdmin
        .from('bookings')
        .select('id, slip_id, check_in, check_out, status');

      if (bookingsError) {
        console.error('Error fetching bookings for availability check:', bookingsError);
        return res.status(500).json({ error: 'Failed to evaluate availability', details: bookingsError.message });
      }

      const activeBookings = (bookingsData || []).filter((booking) => {
        if (!booking) return false;
        const status = (booking.status || '').toLowerCase();
        return status !== 'cancelled' && status !== 'canceled';
      });

      const overlappingBookings = activeBookings.filter((booking) => {
        if (!booking.check_in || !booking.check_out) {
          return false;
        }
        const bookingStart = new Date(booking.check_in);
        const bookingEnd = new Date(booking.check_out);
        if (Number.isNaN(bookingStart.getTime()) || Number.isNaN(bookingEnd.getTime())) {
          return false;
        }
        return bookingStart < endDate && bookingEnd > startDate;
      });

      const bookedSlipIds = new Set(overlappingBookings.map((booking) => booking.slip_id).filter(Boolean));

      filteredSlips = filteredSlips.filter((slip) => !bookedSlipIds.has(slip.id));

      const availableSlipIds = new Set(filteredSlips.map((slip) => slip.id));
      relevantBookings = activeBookings.filter((booking) => availableSlipIds.has(booking.slip_id));
    }

    console.log(`✅ Successfully fetched ${filteredSlips.length} slips${filterByDate ? ' after availability filtering' : ''}`);
    
    // Log first slip to debug - show all available columns
    if (filteredSlips.length > 0) {
      console.log('📋 Sample slip data (all columns):', JSON.stringify(filteredSlips[0], null, 2));
      console.log('📋 Available columns:', Object.keys(filteredSlips[0]));
    }
    
    // Sort slips: "Dockmaster Slip" first, then "Slip 1", "Slip 2", etc.
    if (filteredSlips.length) {
      filteredSlips.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        
        // "Dockmaster Slip" always comes first
        if (nameA.includes('dockmaster')) return -1;
        if (nameB.includes('dockmaster')) return 1;
        
        // Extract numbers from "Slip X" format
        const numA = parseInt((a.name || '').match(/\d+/)?.[0] || '999');
        const numB = parseInt((b.name || '').match(/\d+/)?.[0] || '999');
        
        // If both have numbers, sort by number
        if (numA !== 999 && numB !== 999) {
          return numA - numB;
        }
        
        // Otherwise sort alphabetically
        return (a.name || '').localeCompare(b.name || '');
      });
    }
    
    const responsePayload = { success: true, slips: filteredSlips };
    if (filterByDate) {
      responsePayload.bookings = relevantBookings || [];
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('❌ Exception in /api/slips:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get bookings endpoint - uses Admin client to bypass RLS
app.get('/api/bookings', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ 
        error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required'
      });
    }
    
    const { data: bookings, error } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching bookings:', error);
      return res.status(500).json({ error: 'Failed to fetch bookings', details: error.message });
    }
    
    res.json({ success: true, bookings: bookings || [] });
  } catch (error) {
    console.error('Error in /api/bookings:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get or create user profile endpoint - uses Admin client to bypass RLS
app.get('/api/user-profile', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ 
        error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required'
      });
    }
    
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email query parameter is required' });
    }
    
    // Try to fetch existing profile
    const { data: existingProfile, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (existingProfile && !fetchError) {
      // Profile found
      return res.json({ success: true, profile: mapAdminUserRecord(existingProfile) });
    }
    
    // Profile not found - check if user exists in Auth, and create profile if so
    try {
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = authUsers.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      
      if (authUser) {
        // User exists in Auth but not in users table - create profile
        console.log('📋 User exists in Auth but not in users table, creating profile...');
        
        const profileUserType = (authUser.user_metadata?.userType || authUser.user_metadata?.user_type || 'renter').toLowerCase();
        const profileData = {
          name: authUser.user_metadata?.name || email.split('@')[0],
          email: email,
          password_hash: 'auth_managed',
          user_type: profileUserType,
          phone: authUser.user_metadata?.phone || '',
          permissions:
            profileUserType === 'homeowner'
              ? { homeowner_status: 'pending_verification' }
              : {},
          email_verified: authUser.email_confirmed_at !== null
        };
        
        // Normalize user_type to lowercase
        if (profileData.user_type) {
          profileData.user_type = profileData.user_type.toLowerCase();
        }
        
        const { data: newProfile, error: createError } = await supabaseAdmin
          .from('users')
          .insert(profileData)
          .select()
          .single();
        
        if (createError) {
          console.error('❌ Error creating profile from Auth user:', createError);
          // Try upsert as fallback
          const { data: upsertProfile, error: upsertError } = await supabaseAdmin
            .from('users')
            .upsert(profileData, { onConflict: 'email' })
            .select()
            .single();
          
          if (upsertError) {
            console.error('❌ Error upserting profile:', upsertError);
            return res.json({ success: false, profile: null, message: 'User profile not found and could not be created' });
          }
          
          return res.json({ success: true, profile: mapAdminUserRecord(upsertProfile), created: true });
        }
        
        console.log('✅ Profile created from Auth user:', newProfile);
        return res.json({ success: true, profile: mapAdminUserRecord(newProfile), created: true });
      }
    } catch (authErr) {
      console.error('Error checking Auth for user:', authErr);
    }
    
    // Profile not found and user doesn't exist in Auth
    return res.json({ success: false, profile: null, message: 'User profile not found' });
  } catch (error) {
    console.error('Error in /api/user-profile:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/available-slips', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({
        error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required'
      });
    }

    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'Query parameters "start" and "end" are required' });
    }
    const params = new URLSearchParams({ start, end }).toString();
    return res.redirect(307, `/api/slips?${params}`);
  } catch (error) {
    console.error('Error in /api/available-slips:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Create booking endpoint - uses Admin client to bypass RLS
app.post('/api/create-booking', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ 
        error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required'
      });
    }
    
    const bookingData = req.body;
    
    // Validate required fields
    if (!bookingData.slip_id || !bookingData.guest_name || !bookingData.guest_email) {
      return res.status(400).json({ error: 'Missing required fields: slip_id, guest_name, guest_email' });
    }
    
    if (!bookingData.check_in || !bookingData.check_out) {
      return res.status(400).json({ error: 'Missing required fields: check_in, check_out' });
    }

    const { data: existingBookings, error: conflictError } = await supabaseAdmin
      .from('bookings')
      .select('id, check_in, check_out, status')
      .eq('slip_id', bookingData.slip_id);

    if (conflictError) {
      console.error('Error checking booking conflicts:', conflictError);
      return res.status(500).json({ error: 'Failed to validate booking availability', details: conflictError.message });
    }

    const requestStart = new Date(bookingData.check_in);
    const requestEnd = new Date(bookingData.check_out);

    if (Number.isNaN(requestStart.getTime()) || Number.isNaN(requestEnd.getTime())) {
      return res.status(400).json({ error: 'Invalid check-in or check-out date' });
    }

    const hasConflict = (existingBookings || []).some((booking) => {
      const status = (booking.status || '').toLowerCase();
      if (status === 'cancelled' || status === 'canceled') {
        return false;
      }
      const bookingStart = new Date(booking.check_in);
      const bookingEnd = new Date(booking.check_out);
      if (Number.isNaN(bookingStart.getTime()) || Number.isNaN(bookingEnd.getTime())) {
        return false;
      }
      return bookingStart < requestEnd && bookingEnd > requestStart;
    });

    if (hasConflict) {
      return res.status(409).json({ error: 'Slip is already booked for the selected dates' });
    }

    const normalizedUserType = (bookingData.user_type || 'renter').toString().toLowerCase();

    // Insert booking using Admin client (bypasses RLS)
    const { data: newBooking, error: insertError } = await supabaseAdmin
      .from('bookings')
      .insert({ ...bookingData, user_type: normalizedUserType })
      .select()
      .single();
    
    if (insertError) {
      console.error('Error creating booking:', insertError);
      return res.status(500).json({ 
        error: 'Failed to create booking', 
        details: insertError.message,
        code: insertError.code
      });
    }
    
    // Optionally update slip availability (if needed)
    // Note: You may want to handle slip availability logic differently
    // based on your business rules (e.g., only mark unavailable if fully booked)
    
    res.json({ success: true, booking: newBooking });
  } catch (error) {
    console.error('Error in /api/create-booking:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/api/bookings/:id/approve', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { id } = req.params;

    const { data: booking, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ error: 'Booking not found', details: fetchError?.message });
    }

    const { data: slip } = await supabaseAdmin
      .from('slips')
      .select('*')
      .eq('id', booking.slip_id)
      .single();

    let captureResult = null;
    if (booking.payment_reference) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(booking.payment_reference);
        if (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'processing') {
          captureResult = await stripe.paymentIntents.capture(booking.payment_reference);
          console.log('✅ Stripe payment captured:', captureResult?.id);
        } else if (paymentIntent.status === 'canceled') {
          return res.status(400).json({ error: 'Payment authorization has already been voided for this booking.' });
        } else if (paymentIntent.status !== 'succeeded') {
          console.warn(`⚠️ Unexpected payment intent status "${paymentIntent.status}" during approval.`);
        }
      } catch (stripeError) {
        console.error('❌ Stripe capture error:', stripeError);
        return res.status(500).json({ error: 'Failed to capture payment', details: stripeError.message });
      }
    }

    const updatePayload = {
      status: 'confirmed',
      payment_status: booking.payment_reference ? 'paid' : (booking.payment_status || 'paid'),
      payment_date: booking.payment_reference ? new Date().toISOString() : booking.payment_date,
      updated_at: new Date().toISOString()
    };

    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from('bookings')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update booking', details: updateError.message });
    }

    // Ensure slip remains unavailable
    if (booking.slip_id) {
      await supabaseAdmin
        .from('slips')
        .update({ available: false })
        .eq('id', booking.slip_id);
    }

    // Send confirmation, payment receipt, and permit emails
    if (booking.guest_email) {
      const emailPayload = {
        guestName: booking.guest_name,
        slipName: slip?.name || booking.slip_name || 'Dock Slip',
        checkIn: booking.check_in,
        checkOut: booking.check_out,
        boatMakeModel: booking.boat_make_model,
        boatLength: booking.boat_length,
        totalAmount: booking.total_cost
      };

      try {
        if (captureResult || updatePayload.payment_status === 'paid') {
          await sendEmailNotificationInternal('paymentReceipt', booking.guest_email, {
            guestName: booking.guest_name,
            slipName: emailPayload.slipName,
            checkIn: booking.check_in,
            checkOut: booking.check_out,
            amount: Number(booking.total_cost || 0).toFixed(2),
            paymentIntentId: booking.payment_reference,
            paymentMethod: captureResult?.charges?.data?.[0]?.payment_method_details?.type || booking.payment_method || 'card'
          });
        }

        await sendEmailNotificationInternal('bookingConfirmation', booking.guest_email, emailPayload);
        await sendEmailNotificationInternal('permit', booking.guest_email, {
          ...emailPayload,
          permitNumber: `NSP-${booking.id}-${new Date().getFullYear()}`,
          bookingId: booking.id
        });
      } catch (emailError) {
        console.error('Error sending approval emails:', emailError);
      }
    }

    res.json({ success: true, booking: updatedBooking });
  } catch (error) {
    console.error('Error approving booking:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/api/bookings/:id/cancel', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: booking, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ error: 'Booking not found', details: fetchError?.message });
    }

    const { data: slip } = await supabaseAdmin
      .from('slips')
      .select('*')
      .eq('id', booking.slip_id)
      .single();

    const now = new Date();
    const checkInDate = booking.check_in ? new Date(booking.check_in) : null;
    const daysUntilCheckIn = checkInDate
      ? Math.ceil((checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const withinNonRefundableWindow = typeof daysUntilCheckIn === 'number' && daysUntilCheckIn < 7;

    let refundResult = null;
    let paymentStatusUpdate = booking.payment_status;

    if (booking.payment_reference) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(booking.payment_reference);

        if (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'processing') {
          await stripe.paymentIntents.cancel(booking.payment_reference);
          console.log('✅ Stripe authorization voided:', booking.payment_reference);
          paymentStatusUpdate = 'failed';
        } else if (paymentIntent.status === 'succeeded') {
          if (withinNonRefundableWindow) {
            console.log('ℹ️ Booking within 7-day non-refundable window. No refund issued.');
            paymentStatusUpdate = 'paid';
          } else {
            refundResult = await stripe.refunds.create({ payment_intent: booking.payment_reference });
            console.log('✅ Stripe refund processed:', refundResult?.id);
            paymentStatusUpdate = 'refunded';
          }
        } else if (paymentIntent.status === 'canceled') {
          paymentStatusUpdate = 'failed';
        } else {
          console.warn(`⚠️ Unhandled payment intent status during cancellation: ${paymentIntent.status}`);
        }
      } catch (refundError) {
        console.error('❌ Stripe refund/void error:', refundError);
        return res.status(500).json({ error: 'Failed to adjust payment authorization', details: refundError.message });
      }
    }

    const updatePayload = {
      status: 'cancelled',
      payment_status: paymentStatusUpdate,
      canceled_at: new Date().toISOString(),
      cancellation_reason: reason || 'Cancelled by admin',
      payment_date: paymentStatusUpdate === 'paid' ? booking.payment_date : (paymentStatusUpdate === 'refunded' ? new Date().toISOString() : booking.payment_date)
    };

    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from('bookings')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update booking', details: updateError.message });
    }

    // Make slip available again
    if (booking.slip_id) {
      await supabaseAdmin
        .from('slips')
        .update({ available: true })
        .eq('id', booking.slip_id);
    }

    // Notify renter
    if (booking.guest_email) {
      const slipName = slip?.name || booking.slip_name || `Slip ${booking.slip_id?.substring(0, 8)}`;
      try {
        await sendEmailNotificationInternal('bookingNotApproved', booking.guest_email, {
          guestName: booking.guest_name,
          slipName,
          checkIn: booking.check_in,
          checkOut: booking.check_out,
          boatMakeModel: booking.boat_make_model,
          boatLength: booking.boat_length,
          reason: reason || 'The dock owner was unable to approve this booking at this time.'
        });
      } catch (emailError) {
        console.error('Error sending cancellation email:', emailError);
      }
    }

    res.json({ success: true, booking: updatedBooking, refund: refundResult, nonRefundable: withinNonRefundableWindow });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/bookings/:id/documents', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { id } = req.params;
    const { type } = req.query;

    const columnMap = {
      rental_agreement: 'rental_agreement_path',
      insurance: 'insurance_proof_path',
      boat_picture: 'boat_picture_path'
    };

    if (!type || !columnMap[type]) {
      return res.status(400).json({ error: 'Invalid or missing document type' });
    }

    const { data: booking, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ error: 'Booking not found', details: fetchError?.message });
    }

    const filePath = booking[columnMap[type]];

    if (!filePath) {
      return res.status(404).json({ error: 'Document not available for this booking' });
    }

    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from('documents')
      .createSignedUrl(filePath, 60 * 10); // 10 minutes

    if (signedUrlError) {
      return res.status(500).json({ error: 'Failed to generate document URL', details: signedUrlError.message });
    }

    res.json({ success: true, url: signedUrlData?.signedUrl });
  } catch (error) {
    console.error('Error getting booking document URL:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Update slip availability endpoint - uses Admin client to bypass RLS
app.patch('/api/slips/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ 
        error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required'
      });
    }
    
    const { id } = req.params;
    const { available, ...otherUpdates } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Slip ID is required' });
    }
    
    // Build update object
    const updateData = {};
    if (available !== undefined) {
      updateData.available = available;
    }
    // Allow other fields to be updated if needed
    Object.assign(updateData, otherUpdates);
    
    // Update slip using Admin client (bypasses RLS)
    const { data: updatedSlip, error: updateError } = await supabaseAdmin
      .from('slips')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (updateError) {
      console.error('Error updating slip:', updateError);
      return res.status(500).json({ 
        error: 'Failed to update slip', 
        details: updateError.message,
        code: updateError.code
      });
    }
    
    res.json({ success: true, slip: updatedSlip });
  } catch (error) {
    console.error('Error in /api/slips/:id PATCH:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/api/add-new-slips', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({
        error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required'
      });
    }

    const defaultSlips = [
      {
        name: 'Slip 13',
        max_boat_length: 26,
        width: 10,
        depth: 6,
        price_per_night: 60,
        amenities: ['Water', 'Electric (120V)'],
        description: 'Max Length: 26ft | Width: 10ft | Depth: 6ft\nWater and 120V Electric',
        dock_etiquette:
          '• Respect quiet hours (10 PM - 7 AM)\n• Keep slip area clean and organized\n• Follow all safety protocols\n• Notify management of any issues\n• No loud music or parties\n• Proper waste disposal required',
        available: false,
        status: 'available',
        images: [],
        location_data: {
          section: 'D',
          position: 13,
          coordinates: { lat: 26.3613, lng: -80.0836 }
        }
      },
      {
        name: 'Slip 14',
        max_boat_length: 26,
        width: 10,
        depth: 6,
        price_per_night: 60,
        amenities: ['Water', 'Electric (120V)'],
        description: 'Max Length: 26ft | Width: 10ft | Depth: 6ft\nWater and 120V Electric',
        dock_etiquette:
          '• Respect quiet hours (10 PM - 7 AM)\n• Keep slip area clean and organized\n• Follow all safety protocols\n• Notify management of any issues\n• No loud music or parties\n• Proper waste disposal required',
        available: false,
        status: 'available',
        images: [],
        location_data: {
          section: 'D',
          position: 14,
          coordinates: { lat: 26.3614, lng: -80.0833 }
        }
      }
    ];

    const { slip, slips, generateDefault, useDefaults } = req.body || {};
    let slipsToInsert;

    const parseFloatOrNull = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? null : parsed;
    };

    if (generateDefault || useDefaults || (!slip && !Array.isArray(slips))) {
      slipsToInsert = defaultSlips;
    } else {
      const inputArray = Array.isArray(slips) ? slips : [slip];

      slipsToInsert = inputArray.map((input, index) => {
        if (!input || typeof input !== 'object') {
          throw new Error(`Invalid slip payload at index ${index}`);
        }

        if (!input.name || typeof input.name !== 'string') {
          throw new Error(`Slip name is required at index ${index}`);
        }

        if (input.price_per_night === undefined && input.pricePerNight === undefined) {
          throw new Error(`Price per night is required for slip "${input.name}"`);
        }

        const amenities = Array.isArray(input.amenities)
          ? input.amenities
          : typeof input.amenities === 'string'
            ? input.amenities.split(',').map((item) => item.trim()).filter(Boolean)
            : [];

        let locationData = input.location_data || input.locationData || null;
        const createdBy = input.created_by ?? input.createdBy ?? null;
        if (createdBy) {
          if (locationData && typeof locationData === 'object' && !Array.isArray(locationData)) {
            locationData = { ...locationData, created_by: createdBy };
          } else {
            locationData = { created_by: createdBy };
          }
        }

        const pricePerNight = parseFloatOrNull(input.price_per_night ?? input.pricePerNight);
        if (pricePerNight === null) {
          throw new Error(`Price per night is required for slip "${input.name}"`);
        }

        const maxBoatLength = parseFloatOrNull(input.max_boat_length ?? input.maxBoatLength);
        if (maxBoatLength === null) {
          throw new Error(`Max boat length is required for slip "${input.name}"`);
        }

        const widthValue = parseFloatOrNull(input.width);
        if (widthValue === null || widthValue <= 0) {
          throw new Error(`Slip width is required for slip "${input.name}"`);
        }

        const depthValue = parseFloatOrNull(input.depth);
        if (depthValue === null || depthValue <= 0) {
          throw new Error(`Slip depth is required for slip "${input.name}"`);
        }

        const sanitized = {
          name: input.name.trim(),
          description: input.description ?? input.description?.trim?.() ?? null,
          price_per_night: pricePerNight,
          max_boat_length: maxBoatLength,
          width: widthValue,
          depth: depthValue,
          amenities,
          dock_etiquette: input.dock_etiquette ?? input.dockEtiquette ?? null,
          available: typeof input.available === 'boolean' ? input.available : false,
          status: (input.status || 'available').toLowerCase(),
          images: Array.isArray(input.images) ? input.images : [],
          location_data: locationData && typeof locationData === 'object' ? locationData : null,
          maintenance_notes: input.maintenance_notes ?? input.maintenanceNotes ?? null,
          seasonal_pricing: input.seasonal_pricing ?? input.seasonalPricing ?? null
        };

        return sanitized;
      });
    }

    const { data, error } = await supabaseAdmin
      .from('slips')
      .upsert(slipsToInsert, { onConflict: 'name' })
      .select('*');

    if (error) {
      console.error('Error upserting slip(s):', error);
      return res.status(500).json({
        error: 'Failed to add or update slips',
        details: error.message
      });
    }

    const message = (generateDefault || useDefaults || (!slip && !Array.isArray(slips)))
      ? 'Slips 13 & 14 added or updated successfully.'
      : data.length > 1
        ? `${data.length} slips added successfully.`
        : `${data[0]?.name || 'Slip'} added successfully.`;

    res.json({ success: true, message, slips: data });
  } catch (error) {
    console.error('Error in /api/add-new-slips:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { title, message, recipientIds, createdBy } = req.body || {};

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({ error: 'At least one recipient is required' });
    }

    if (!createdBy) {
      return res.status(400).json({ error: 'createdBy is required' });
    }

    const { data: creator, error: creatorError } = await supabaseAdmin
      .from('users')
      .select('id, user_type')
      .eq('id', createdBy)
      .single();

    if (creatorError || !creator) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    const creatorRole = (creator.user_type || '').toLowerCase();
    if (!['admin', 'superadmin'].includes(creatorRole)) {
      return res.status(403).json({ error: 'Only admin or superadmin can create notifications' });
    }

    const uniqueRecipientIds = Array.from(new Set(recipientIds)).filter(Boolean);
    if (uniqueRecipientIds.length === 0) {
      return res.status(400).json({ error: 'No valid recipients found' });
    }

    const notificationRows = uniqueRecipientIds.map((recipientId) => ({
      recipient_user_id: recipientId,
      title,
      message,
      created_by: createdBy
    }));

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('notifications')
      .insert(notificationRows)
      .select('id, title, message, recipient_user_id, created_at, created_by');

    if (insertError) {
      console.error('Error inserting notifications:', insertError);
      return res.status(500).json({ error: 'Failed to create notifications', details: insertError.message });
    }

    res.json({ success: true, notifications: inserted });
  } catch (error) {
    console.error('Error creating notifications:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { user_id: userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }

    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select('id, title, message, recipient_user_id, created_at, read_at, created_by')
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
      return res.status(500).json({ error: 'Failed to fetch notifications', details: error.message });
    }

    res.json({ success: true, notifications: notifications || [] });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res
        .status(500)
        .json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { id } = req.params;
    const { userId } = req.body || {};

    if (!id || !userId) {
      return res.status(400).json({ error: 'Notification ID and userId are required' });
    }

    const { data: notification, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('id, recipient_user_id, read_at')
      .eq('id', id)
      .single();

    if (fetchError || !notification) {
      return res
        .status(404)
        .json({ error: 'Notification not found', details: fetchError?.message });
    }

    if (notification.recipient_user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this notification' });
    }

    if (notification.read_at) {
      return res.json({
        success: true,
        notification: { id: notification.id, read_at: notification.read_at }
      });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, read_at')
      .single();

    if (updateError) {
      console.error('Error updating notification read state:', updateError);
      return res
        .status(500)
        .json({ error: 'Failed to update notification', details: updateError.message });
    }

    res.json({ success: true, notification: updated });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/homeowners/records', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { data: homeowners, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, user_type, phone, property_address, parcel_number, lot_number, permissions, email_verified, emergency_contact, created_at, updated_at')
      .eq('user_type', 'homeowner')
      .order('property_address', { ascending: true });

    if (error) {
      console.error('Error fetching homeowner records:', error);
      return res.status(500).json({ error: 'Failed to fetch homeowners', details: error.message });
    }

    res.json({
      success: true,
      homeowners: (homeowners || []).map(mapAdminUserRecord)
    });
  } catch (error) {
    console.error('Error fetching homeowner records:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/api/homeowners/verify', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { email, parcelNumber, propertyAddress } = req.body || {};

    if (!email || !parcelNumber || !propertyAddress) {
      return res.status(400).json({ error: 'Email, parcel number, and property address are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedParcel = parcelNumber.trim();
    const normalizedAddress = propertyAddress.trim();

    const { data: homeowner, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (fetchError || !homeowner) {
      console.error('Error fetching homeowner profile for verification:', fetchError);
      return res.status(404).json({ error: 'Homeowner profile not found.' });
    }

    const existingUserType = (homeowner.user_type || '').toLowerCase();
    if (existingUserType !== 'homeowner') {
      return res.status(400).json({ error: 'Only homeowner accounts can be verified with parcel information.' });
    }

    const existingParcel = (homeowner.parcel_number || '').trim();
    const existingAddress = (homeowner.property_address || '').trim();

    if (existingParcel && existingParcel !== normalizedParcel) {
      return res.status(400).json({
        error: 'The parcel number does not match our records. Please contact support for assistance.'
      });
    }

    if (existingAddress && existingAddress.toLowerCase() !== normalizedAddress.toLowerCase()) {
      return res.status(400).json({
        error: 'The property address does not match our records. Please contact support for assistance.'
      });
    }

    const existingPermissions = parsePermissions(homeowner.permissions);
    const updatePayload = {
      parcel_number: normalizedParcel,
      property_address: normalizedAddress,
      permissions: applyHomeownerStatusToPermissions(existingPermissions, 'pending_verification'),
      updated_at: new Date().toISOString()
    };

    const { data: updatedHomeowner, error: updateError } = await supabaseAdmin
      .from('users')
      .update(updatePayload)
      .eq('email', normalizedEmail)
      .select()
      .single();

    if (updateError) {
      console.error('Error verifying homeowner:', updateError);
      return res.status(500).json({ error: 'Failed to verify homeowner', details: updateError.message });
    }

    try {
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = authUsers.users.find(u => u.email?.toLowerCase() === normalizedEmail);

      if (authUser) {
        const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
          user_metadata: {
            ...authUser.user_metadata,
            parcelNumber: normalizedParcel,
            propertyAddress: normalizedAddress,
            homeownerStatus: 'pending_verification',
            homeowner_verified_at: null
          }
        });

        if (metadataError) {
          console.error('Error updating homeowner metadata in Auth:', metadataError);
        }
      }
    } catch (metadataErr) {
      console.error('Error syncing homeowner metadata with Auth:', metadataErr);
    }

    res.json({
      success: true,
      user: mapAdminUserRecord(updatedHomeowner),
      message: 'Homeowner details confirmed. Dock82 will finalize your verification shortly.'
    });
  } catch (error) {
    console.error('Error verifying homeowner:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select(
        'id, name, email, user_type, phone, property_address, parcel_number, lot_number, permissions, email_verified, updated_at, created_at'
      )
      .order('name');

    if (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ error: 'Failed to fetch users', details: error.message });
    }

    res.json({ success: true, users: (users || []).map(mapAdminUserRecord) });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const {
      name,
      email,
      phone,
      userType,
      propertyAddress,
      parcelNumber,
      lotNumber,
      homeownerStatus
    } = req.body || {};

    const sanitizedName = sanitizeNullableString(name);
    if (!sanitizedName) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const sanitizedEmail = sanitizeNullableString(email);
    if (sanitizedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(sanitizedEmail)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
    }

    const normalizedType = normalizeUserTypeValue(userType) || 'homeowner';
    if (!['renter', 'homeowner', 'admin', 'superadmin'].includes(normalizedType)) {
      return res.status(400).json({ error: 'Invalid user type' });
    }

    const now = new Date().toISOString();
    let permissions = {};
    let normalizedStatus = sanitizeNullableString(homeownerStatus);
    if (!normalizedStatus && normalizedType === 'homeowner') {
      normalizedStatus = 'pending_verification';
    }
    if (normalizedType === 'homeowner') {
      const verifiedAt = normalizedStatus === 'verified' ? now : null;
      permissions = applyHomeownerStatusToPermissions(
        permissions,
        normalizedStatus,
        verifiedAt
      );
    }

    const insertPayload = {
      name: sanitizedName,
      email: sanitizedEmail ?? null,
      phone: sanitizeNullableString(phone),
      user_type: normalizedType,
      property_address: sanitizeNullableString(propertyAddress),
      parcel_number: sanitizeNullableString(parcelNumber),
      lot_number: sanitizeNullableString(lotNumber),
      password_hash: 'manual_import',
      permissions,
      email_verified: false,
      created_at: now,
      updated_at: now
    };

    const { data: insertedUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert(insertPayload)
      .select('id, name, email, user_type, phone, property_address, parcel_number, lot_number, permissions, email_verified, created_at, updated_at')
      .single();

    if (insertError) {
      console.error('Error creating property owner:', insertError);
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }
      return res.status(500).json({ error: 'Failed to create property owner', details: insertError.message });
    }

    res.status(201).json({ success: true, user: mapAdminUserRecord(insertedUser) });
  } catch (error) {
    console.error('Error creating property owner:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.patch('/api/admin/users/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const {
      name,
      email,
      phone,
      userType,
      propertyAddress,
      parcelNumber,
      lotNumber,
      homeownerStatus
    } = req.body || {};

    const { data: existingUserRaw, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, name, email, phone, user_type, property_address, parcel_number, lot_number, permissions, email_verified, created_at, updated_at')
      .eq('id', id)
      .single();

    const existingUser = existingUserRaw ? mapAdminUserRecord(existingUserRaw) : null;

    if (fetchError || !existingUser) {
      console.error('Error loading user for update:', fetchError);
      return res.status(404).json({ error: 'User not found' });
    }

    const updatePayload = { updated_at: new Date().toISOString() };
    let permissionsWorking = parsePermissions(existingUser.permissions);
    let permissionsModified = false;

    if (name !== undefined) {
      const sanitizedName = sanitizeNullableString(name);
      if (!sanitizedName) {
        return res.status(400).json({ error: 'Name cannot be empty' });
      }
      updatePayload.name = sanitizedName;
    }

    if (email !== undefined) {
      const sanitizedEmail = sanitizeNullableString(email);
      if (sanitizedEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(sanitizedEmail)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }
      }
      updatePayload.email = sanitizedEmail ?? null;
    }

    if (phone !== undefined) {
      updatePayload.phone = sanitizeNullableString(phone) ?? null;
    }

    if (propertyAddress !== undefined) {
      updatePayload.property_address = sanitizeNullableString(propertyAddress);
    }

    if (parcelNumber !== undefined) {
      updatePayload.parcel_number = sanitizeNullableString(parcelNumber);
    }

    if (lotNumber !== undefined) {
      updatePayload.lot_number = sanitizeNullableString(lotNumber);
    }

    if (userType !== undefined) {
      const normalized = normalizeUserTypeValue(userType);
      if (!normalized) {
        return res.status(400).json({ error: 'User type cannot be empty' });
      }
      if (!['renter', 'homeowner', 'admin', 'superadmin'].includes(normalized)) {
        return res.status(400).json({ error: 'Invalid user type' });
      }
      updatePayload.user_type = normalized;
      if (normalized !== 'homeowner') {
        permissionsWorking = applyHomeownerStatusToPermissions(permissionsWorking, null);
        permissionsModified = true;
      }
    }

    if (homeownerStatus !== undefined) {
      const sanitizedStatus = sanitizeNullableString(homeownerStatus);
      const isHomeowner = normalizeUserTypeValue(existingUser.user_type) === 'homeowner';
      if (isHomeowner) {
        const verifiedAt =
          sanitizedStatus && ['verified', 'active_owner', 'active'].includes(sanitizedStatus)
            ? new Date().toISOString()
            : null;
        permissionsWorking = applyHomeownerStatusToPermissions(
          permissionsWorking,
          sanitizedStatus || null,
          verifiedAt
        );
        permissionsModified = true;
      } else {
        permissionsWorking = applyHomeownerStatusToPermissions(permissionsWorking, null);
        permissionsModified = true;
      }
    }

    if (permissionsModified) {
      updatePayload.permissions = permissionsWorking;
    }

    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update(updatePayload)
      .eq('id', id)
      .select('id, name, email, user_type, phone, property_address, parcel_number, lot_number, permissions, email_verified, created_at, updated_at')
      .single();

    if (updateError) {
      console.error('Error updating user:', updateError);
      return res.status(500).json({ error: 'Failed to update user', details: updateError.message });
    }

    res.json({ success: true, user: mapAdminUserRecord(updatedUser) });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const { data: deletedUser, error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', id)
      .select('id, email')
      .single();

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return res.status(500).json({ error: 'Failed to delete user', details: deleteError.message });
    }

    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user: deletedUser });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/admin/admins', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required' });
    }

    const { data: admins, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, user_type, phone, property_address, parcel_number, lot_number, permissions, email_verified, created_at, updated_at')
      .in('user_type', ['admin', 'superadmin'])
      .order('name');

    if (error) {
      console.error('Error fetching admins:', error);
      return res.status(500).json({ error: 'Failed to fetch admins', details: error.message });
    }

    res.json({ success: true, admins: (admins || []).map(mapAdminUserRecord) });
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Local API server running on http://localhost:${PORT}`);
  console.log(`📡 Ready to handle payment intents`);
  console.log(`📧 Ready to handle email notifications`);
  console.log(`💳 Stripe configured: ${process.env.STRIPE_SECRET_KEY ? 'Yes ✅' : 'No ❌'}\n`);
});

