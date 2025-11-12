# 🚀 Deploy Email System for Dock82

## ✅ Current Status
- **Email templates**: ✅ Complete and professional
- **Frontend integration**: ✅ Already implemented
- **Edge Function code**: ✅ Ready to deploy
- **Missing**: Edge Function deployment and Resend API setup

## 🎯 Quick Setup (5 minutes)

### Step 1: Set up Resend Account
1. Go to [resend.com](https://resend.com)
2. Sign up for a free account
3. Go to **API Keys** section
4. Click **Create API Key**
5. Name it "Dock82 Production"
6. Copy the API key (starts with `re_`)

### Step 2: Add API Key to Supabase
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/phstdzlniugqbxtfgktb)
2. Navigate to **Settings** → **Edge Functions**
3. Click **Add environment variable**
4. **Key**: `RESEND_API_KEY`
5. **Value**: `[paste your resend api key here]`
6. Click **Save**

### Step 3: Deploy Edge Function
1. In Supabase Dashboard, go to **Edge Functions**
2. Click **Create a new function**
3. **Function name**: `send-notification`
4. **Copy the code** from `supabase/functions/send-notification/index.ts` (see below)
5. Click **Deploy function**

### Step 4: Test the System
1. Go to your website: https://www.dock82.com
2. Make a test booking
3. Complete the payment
4. Check your email for confirmation

## 📋 Edge Function Code to Copy

```typescript
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

interface EmailData {
  guestName: string;
  slipName: string;
  checkIn: string;
  checkOut: string;
  boatMakeModel: string;
  boatLength: number;
  totalAmount?: number;
  paymentIntentId?: string;
  paymentMethod?: string;
  bookingId?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const { type, email, data }: { type: string, email: string, data: EmailData } = await req.json();

    if (!type || !email || !data) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { 
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    let emailSubject = '';
    let emailHtml = '';

    switch (type) {
      case 'bookingConfirmation':
        emailSubject = `Booking Confirmed - ${data.slipName} at Dock82`;
        emailHtml = generateBookingConfirmationEmail(data);
        break;
      
      case 'paymentReceipt':
        emailSubject = `Payment Receipt - Dock82 Booking`;
        emailHtml = generatePaymentReceiptEmail(data);
        break;
      
      case 'bookingCancellation':
        emailSubject = `Booking Cancelled - ${data.slipName}`;
        emailHtml = generateCancellationEmail(data);
        break;
      
      default:
        return new Response(JSON.stringify({ error: 'Invalid email type' }), { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
    }

    // Send email using Resend API
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@dock82.com',
        to: [email],
        subject: emailSubject,
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error('Email sending failed:', errorData);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Email sent successfully' 
    }), {
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      },
    });

  } catch (error) {
    console.error('Notification function error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
    });
  }
});

function generateBookingConfirmationEmail(data: EmailData): string {
  const nights = Math.ceil((new Date(data.checkOut) - new Date(data.checkIn)) / (1000 * 60 * 60 * 24));
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmation - Dock82</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
        .booking-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
        .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .detail-label { font-weight: bold; color: #374151; }
        .detail-value { color: #1f2937; }
        .total { background: #10b981; color: white; padding: 15px; border-radius: 8px; text-align: center; font-size: 18px; font-weight: bold; margin: 20px 0; }
        .instructions { background: #fef3c7; border: 1px solid #f59e0b; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        .emoji { font-size: 24px; margin-right: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1><span class="emoji">🚤</span>Dock82</h1>
        <h2>Booking Confirmed!</h2>
      </div>
      
      <div class="content">
        <p>Hello ${data.guestName},</p>
        
        <p>Great news! Your dock slip reservation has been confirmed. Here are your booking details:</p>
        
        <div class="booking-details">
          <h3>📋 Booking Summary</h3>
          <div class="detail-row">
            <span class="detail-label">Slip:</span>
            <span class="detail-value">${data.slipName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Check-in:</span>
            <span class="detail-value">${data.checkIn}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Check-out:</span>
            <span class="detail-value">${data.checkOut}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Duration:</span>
            <span class="detail-value">${nights} night${nights > 1 ? 's' : ''}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Boat:</span>
            <span class="detail-value">${data.boatMakeModel} (${data.boatLength}ft)</span>
          </div>
        </div>
        
        ${data.totalAmount ? `
        <div class="total">
          💰 Total Cost: $${data.totalAmount.toFixed(2)}
        </div>
        ` : ''}
        
        <div class="instructions">
          <h3>📝 Important Instructions:</h3>
          <ul>
            <li><strong>Self Check-in:</strong> You'll receive a dock permit via email 24 hours before your arrival</li>
            <li><strong>Arrival:</strong> Please arrive during daylight hours for easier navigation</li>
            <li><strong>Parking:</strong> Use the designated boat trailer parking area</li>
            <li><strong>Safety:</strong> Always wear life jackets and follow local boating regulations</li>
            <li><strong>Contact:</strong> If you need assistance, contact us at support@dock82.com</li>
          </ul>
        </div>
        
        <p>We're excited to welcome you to Dock82! Have a wonderful stay and enjoy your time on the water.</p>
        
        <p>Best regards,<br>The Dock82 Team</p>
      </div>
      
      <div class="footer">
        <p>Dock82 - Premium Dock Slip Rentals</p>
        <p>support@dock82.com | www.dock82.com</p>
      </div>
    </body>
    </html>
  `;
}

function generatePaymentReceiptEmail(data: EmailData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Receipt - Dock82</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
        .receipt-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
        .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .detail-label { font-weight: bold; color: #374151; }
        .detail-value { color: #1f2937; }
        .amount { background: #10b981; color: white; padding: 15px; border-radius: 8px; text-align: center; font-size: 18px; font-weight: bold; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        .emoji { font-size: 24px; margin-right: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1><span class="emoji">💳</span>Payment Receipt</h1>
        <h2>Dock82</h2>
      </div>
      
      <div class="content">
        <p>Hello ${data.guestName},</p>
        
        <p>Thank you for your payment! Here's your receipt for your dock slip booking:</p>
        
        <div class="receipt-details">
          <h3>🧾 Payment Details</h3>
          <div class="detail-row">
            <span class="detail-label">Slip:</span>
            <span class="detail-value">${data.slipName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Payment Method:</span>
            <span class="detail-value">${data.paymentMethod || 'Stripe'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Transaction ID:</span>
            <span class="detail-value">${data.paymentIntentId}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Date:</span>
            <span class="detail-value">${new Date().toLocaleDateString()}</span>
          </div>
        </div>
        
        ${data.totalAmount ? `
        <div class="amount">
          💰 Amount Paid: $${data.totalAmount.toFixed(2)}
        </div>
        ` : ''}
        
        <p>Your payment has been processed successfully. You will receive a separate booking confirmation email with all the details about your stay.</p>
        
        <p>If you have any questions about this payment or your booking, please don't hesitate to contact us.</p>
        
        <p>Best regards,<br>The Dock82 Team</p>
      </div>
      
      <div class="footer">
        <p>Dock82 - Premium Dock Slip Rentals</p>
        <p>support@dock82.com | www.dock82.com</p>
      </div>
    </body>
    </html>
  `;
}

function generateCancellationEmail(data: EmailData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Cancelled - Dock82</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #dc2626, #ef4444); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
        .cancellation-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
        .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .detail-label { font-weight: bold; color: #374151; }
        .detail-value { color: #1f2937; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        .emoji { font-size: 24px; margin-right: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1><span class="emoji">❌</span>Booking Cancelled</h1>
        <h2>Dock82</h2>
      </div>
      
      <div class="content">
        <p>Hello ${data.guestName},</p>
        
        <p>Your dock slip booking has been cancelled. Here are the details:</p>
        
        <div class="cancellation-details">
          <h3>📋 Cancelled Booking</h3>
          <div class="detail-row">
            <span class="detail-label">Slip:</span>
            <span class="detail-value">${data.slipName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Check-in:</span>
            <span class="detail-value">${data.checkIn}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Check-out:</span>
            <span class="detail-value">${data.checkOut}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Cancellation Date:</span>
            <span class="detail-value">${new Date().toLocaleDateString()}</span>
          </div>
        </div>
        
        <p>If you cancelled this booking yourself, no further action is required. If this cancellation was unexpected, please contact us immediately.</p>
        
        <p>We hope to welcome you back to Dock82 in the future!</p>
        
        <p>Best regards,<br>The Dock82 Team</p>
      </div>
      
      <div class="footer">
        <p>Dock82 - Premium Dock Slip Rentals</p>
        <p>support@dock82.com | www.dock82.com</p>
      </div>
    </body>
    </html>
  `;
}
```

## 🧪 Testing After Deployment

Run this command to test:
```bash
node test-email-system.js
```

You should see:
- ✅ Edge Function is deployed and working
- ✅ Emails are being sent successfully

## 📧 What Your Customers Will Receive

### 1. Payment Receipt Email (Immediate)
- Professional receipt with transaction details
- Payment confirmation
- Transaction ID for records

### 2. Booking Confirmation Email (Immediate)
- Complete booking details
- Check-in/check-out information
- Safety instructions and guidelines
- Contact information

## 🎉 Success!

Once deployed, your customers will receive:
- ✅ **Professional email confirmations** after every booking
- ✅ **Payment receipts** for their records
- ✅ **Complete booking details** with instructions
- ✅ **Consistent branding** with Dock82 styling

**Your email system will be fully operational and professional!** 📧✨
